// ============================================================================
// TeachAssist marks API client
// ----------------------------------------------------------------------------
// Calls the personal Cloudflare Worker's `GET /api/marks` and maps the result
// into this app's internal course/evaluation model.
//
// WHERE THE WORKER URL + API KEY ARE STORED
//   They are kept in localStorage (entered once in Settings), NOT in the
//   committed source. Reasons:
//     * config.js is committed to a PUBLIC repo — never put the API key there.
//     * localStorage keeps the key on your device only.
//
// SECURITY TRADEOFF (important)
//   Any API key used from browser code is visible to anyone who can read the
//   page's JavaScript or watch the Network tab. This API key only gates *who
//   can trigger a marks fetch* — it is NOT your TeachAssist password (that lives
//   only in the Worker's encrypted secrets and is never exposed). Still, treat
//   this key as low-but-not-zero sensitivity:
//     * The Worker also locks CORS to your dashboard origin.
//     * If the key leaks, rotate it: `wrangler secret put API_KEY` + re-enter
//       it in Settings.
//     * For a personal, single-user tool this is an acceptable tradeoff.
// ============================================================================

import { sb } from "./supabase.js";
import { DEFAULT_CATEGORIES, COURSE_COLORS } from "./config.js";

const LS_URL = "ta_worker_url";
const LS_KEY = "ta_worker_api_key";

/** { url, apiKey } from localStorage (url has any trailing slash trimmed). */
export function getWorkerConfig() {
  return {
    url: (localStorage.getItem(LS_URL) || "").trim().replace(/\/+$/, ""),
    apiKey: (localStorage.getItem(LS_KEY) || "").trim(),
  };
}

/** Persist the Worker URL + API key on this device. */
export function setWorkerConfig(url, apiKey) {
  localStorage.setItem(LS_URL, (url || "").trim());
  localStorage.setItem(LS_KEY, (apiKey || "").trim());
}

/**
 * Fetch marks from the Worker. Returns the raw array of courses
 *   [{ code, name, currentMark, evaluations: [{ name, category, percent }] }]
 * Throws a friendly Error on misconfiguration / network / HTTP errors.
 */
export async function fetchMarks() {
  const { url, apiKey } = getWorkerConfig();
  if (!url) throw new Error("Set your Worker URL in Settings first.");

  let res;
  try {
    res = await fetch(url + "/api/marks", {
      headers: apiKey ? { "x-api-key": apiKey } : {},
    });
  } catch (e) {
    // Most commonly a CORS block (Worker DASHBOARD_ORIGIN must match this site)
    // or a wrong/unreachable URL.
    throw new Error(
      "Could not reach the Worker. Check the URL and that the Worker's " +
        "DASHBOARD_ORIGIN matches this site's origin (CORS)."
    );
  }

  let body = null;
  try {
    body = await res.json();
  } catch {
    /* non-JSON body */
  }

  if (!res.ok) {
    const msg = body && body.error ? body.error : `Worker returned HTTP ${res.status}`;
    throw new Error(msg);
  }
  if (!Array.isArray(body)) throw new Error("Unexpected response shape from the Worker.");
  return body;
}

/**
 * Map the Worker's courses into this app's internal model so the existing
 * course/evaluation UI (and the same calculation logic) can consume them.
 *
 * The Worker reports a per-strand `percent`; this app's evaluations store
 * score_earned / score_total, so we represent each as `percent / 100`.
 *
 * @returns {Array<{
 *   code:string, name:string, currentMark:number|null, color_index:number,
 *   categories:Array<{name:string, weight:number}>,
 *   evaluations:Array<{name:string, category:string|null, percent:number|null,
 *                      score_earned:number|null, score_total:number|null}>
 * }>}
 */
export function mapWorkerCourses(list) {
  return (list || []).map((c, i) => {
    const evals = Array.isArray(c.evaluations) ? c.evaluations : [];

    // Categories = the app's Ontario defaults plus any extra strand names the
    // Worker reported, so every evaluation has a matching category.
    const names = new Set(DEFAULT_CATEGORIES.map((d) => d.name));
    for (const e of evals) if (e && e.category) names.add(e.category);
    const categories = [...names].map((name) => {
      const def = DEFAULT_CATEGORIES.find((d) => d.name === name);
      return { name, weight: def ? def.weight : 0 };
    });

    return {
      code: c.code || "",
      name: c.name || "",
      currentMark: typeof c.currentMark === "number" ? c.currentMark : null,
      midterm: typeof c.midterm === "number" ? c.midterm : null,
      color_index: i % COURSE_COLORS.length,
      categories,
      evaluations: evals.map((e) => {
        const pct = typeof e.percent === "number" ? e.percent : null;
        return {
          name: e.name || "Evaluation",
          category: e.category || null,
          percent: pct,
          // Represent the percent in the app's earned/total model.
          score_earned: pct,
          score_total: pct == null ? null : 100,
        };
      }),
    };
  });
}

/**
 * Pull marks from the Worker and import them into Supabase so they show up in
 * the dashboard. Matches existing courses by `code` (per user):
 *   * existing course -> update name + midterm (+ currentMark passthrough)
 *   * new course      -> insert it and seed the default categories
 * Idempotent: re-running just updates the same rows. Evaluations are NOT
 * touched here (they sync once the Worker's report parser is confirmed), so
 * your manually-entered evaluations are never overwritten.
 *
 * @param {string} userId
 * @returns {Promise<{created:number, updated:number, total:number}>}
 */
export async function syncFromTeachAssist(userId) {
  const mapped = mapWorkerCourses(await fetchMarks());

  const { data: existing } = await sb
    .from("courses")
    .select("id, code")
    .eq("user_id", userId);
  const idByCode = new Map((existing || []).map((c) => [c.code, c.id]));

  let created = 0;
  let updated = 0;
  for (const m of mapped) {
    if (!m.code) continue;
    const fields = { name: m.name || m.code, midterm: m.midterm };
    if (idByCode.has(m.code)) {
      const { error } = await sb.from("courses").update(fields).eq("id", idByCode.get(m.code));
      if (error) throw error;
      updated++;
    } else {
      const { data: ins, error } = await sb
        .from("courses")
        .insert({ user_id: userId, code: m.code, color_index: m.color_index, ...fields })
        .select("id")
        .single();
      if (error) throw error;
      // Seed the Ontario default categories for the new course.
      await sb.from("categories").insert(
        DEFAULT_CATEGORIES.map((d) => ({
          user_id: userId,
          course_id: ins.id,
          name: d.name,
          weight: d.weight,
        }))
      );
      created++;
    }
  }
  return { created, updated, total: mapped.length };
}
