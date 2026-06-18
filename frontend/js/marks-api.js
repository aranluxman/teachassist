// ============================================================================
// TeachAssist marks API client
// ----------------------------------------------------------------------------
// Calls the personal Cloudflare Worker's GET /api/marks endpoint and maps the
// result into this app's internal course/category/evaluation model.
// ============================================================================

import { sb } from "./supabase.js";
import { DEFAULT_CATEGORIES, COURSE_COLORS } from "./config.js";

const LS_URL = "ta_worker_url";
const LS_KEY = "ta_worker_api_key";

function normalizeWorkerUrl(url) {
  return (url || "")
    .trim()
    .replace(/\/+$/, "")
    .replace(/\/api\/marks$/i, "");
}

/** { url, apiKey } from localStorage. Accepts base URL or full /api/marks URL. */
export function getWorkerConfig() {
  return {
    url: normalizeWorkerUrl(localStorage.getItem(LS_URL)),
    apiKey: (localStorage.getItem(LS_KEY) || "").trim(),
  };
}

/** Persist the Worker URL + API key on this device. */
export function setWorkerConfig(url, apiKey) {
  localStorage.setItem(LS_URL, normalizeWorkerUrl(url));
  localStorage.setItem(LS_KEY, (apiKey || "").trim());
}

/**
 * Fetch marks from the Worker. Returns the raw array of courses:
 *   [{ code, name, currentMark, midterm, evaluations: [{ name, category, percent, weight }] }]
 */
export async function fetchMarks() {
  const { url, apiKey } = getWorkerConfig();
  if (!url) throw new Error("Set your Worker URL in Settings first.");

  let res;
  try {
    res = await fetch(url + "/api/marks", {
      headers: apiKey ? { "x-api-key": apiKey } : {},
    });
  } catch {
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

export function mapWorkerCourses(list) {
  return (list || []).map((c, i) => {
    const evals = Array.isArray(c.evaluations) ? c.evaluations : [];

    const catWeights = new Map();
    for (const e of evals) {
      if (e && e.category && !catWeights.has(e.category)) {
        catWeights.set(e.category, typeof e.weight === "number" ? e.weight : 0);
      }
    }
    const categories = [...catWeights].map(([name, weight]) => ({ name, weight }));

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
          score_earned: pct,
          score_total: pct == null ? null : 100,
        };
      }),
    };
  });
}

/**
 * Pull marks from the Worker and import them into Supabase. Courses are matched
 * by code. Categories are matched by name. Evaluations are matched by name plus
 * category, so repeated syncs update the same TeachAssist rows.
 */
export async function syncFromTeachAssist(userId) {
  const mapped = mapWorkerCourses(await fetchMarks());

  const { data: existing, error: existingError } = await sb
    .from("courses")
    .select("id, code")
    .eq("user_id", userId);
  if (existingError) throw existingError;

  const idByCode = new Map((existing || []).map((c) => [c.code, c.id]));
  const state = { missingColumn: false };
  let created = 0;
  let updated = 0;

  for (const m of mapped) {
    if (!m.code) continue;

    const fields = {
      name: m.name || m.code,
      midterm: m.midterm,
      current_mark: m.currentMark,
    };

    let courseId = idByCode.get(m.code);
    if (courseId) {
      await updateCourse(courseId, fields, state);
      updated++;
    } else {
      courseId = await insertCourse(userId, m, fields, state);
      idByCode.set(m.code, courseId);
      created++;
    }

    const categoryIds = await upsertCategoryWeights(userId, courseId, m.categories);
    if (m.evaluations.length) {
      await upsertEvaluations(userId, courseId, m.evaluations, categoryIds);
    }
  }

  return { created, updated, total: mapped.length, missingColumn: state.missingColumn };
}

async function updateCourse(id, fields, state) {
  let res = await sb.from("courses").update(fields).eq("id", id);
  if (res.error && /current_mark/i.test(res.error.message || "")) {
    state.missingColumn = true;
    const { current_mark, ...rest } = fields;
    res = await sb.from("courses").update(rest).eq("id", id);
  }
  if (res.error) throw res.error;
}

async function insertCourse(userId, m, fields, state) {
  const base = { user_id: userId, code: m.code, color_index: m.color_index, ...fields };
  let res = await sb.from("courses").insert(base).select("id").single();
  if (res.error && /current_mark/i.test(res.error.message || "")) {
    state.missingColumn = true;
    const { current_mark, ...rest } = base;
    res = await sb.from("courses").insert(rest).select("id").single();
  }
  if (res.error) throw res.error;
  return res.data.id;
}

async function upsertCategoryWeights(userId, courseId, cats) {
  const wanted = cats.length ? cats : DEFAULT_CATEGORIES;
  const { data: existing, error } = await sb
    .from("categories")
    .select("id, name")
    .eq("course_id", courseId);
  if (error) throw error;

  const idByName = new Map((existing || []).map((c) => [c.name, c.id]));
  for (const c of wanted) {
    if (idByName.has(c.name)) {
      const { error: updateError } = await sb
        .from("categories")
        .update({ weight: c.weight })
        .eq("id", idByName.get(c.name));
      if (updateError) throw updateError;
    } else {
      const { data, error: insertError } = await sb
        .from("categories")
        .insert({ user_id: userId, course_id: courseId, name: c.name, weight: c.weight })
        .select("id, name")
        .single();
      if (insertError) throw insertError;
      idByName.set(data.name, data.id);
    }
  }
  return idByName;
}

async function upsertEvaluations(userId, courseId, evaluations, categoryIds) {
  const { data: existing, error } = await sb
    .from("evaluations")
    .select("id, name, category_id")
    .eq("course_id", courseId);
  if (error) throw error;

  const keyFor = (name, categoryId) => `${name || ""}::${categoryId || ""}`;
  const existingByKey = new Map(
    (existing || []).map((ev) => [keyFor(ev.name, ev.category_id), ev.id])
  );

  for (const ev of evaluations) {
    const categoryId = ev.category ? categoryIds.get(ev.category) || null : null;
    const payload = {
      name: ev.name || "Evaluation",
      category_id: categoryId,
      score_earned: ev.score_earned ?? 0,
      score_total: ev.score_total ?? 100,
      date: null,
    };
    const existingId = existingByKey.get(keyFor(payload.name, payload.category_id));
    if (existingId) {
      const { error: updateError } = await sb
        .from("evaluations")
        .update(payload)
        .eq("id", existingId);
      if (updateError) throw updateError;
    } else {
      const { error: insertError } = await sb.from("evaluations").insert({
        user_id: userId,
        course_id: courseId,
        ...payload,
      });
      if (insertError) throw insertError;
    }
  }
}
