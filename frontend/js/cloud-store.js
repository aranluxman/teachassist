// ============================================================================
// Cloud saving for dreams and goals (Supabase, through this site's own backend)
// ----------------------------------------------------------------------------
// Everything is saved on this device first (personalization.js), then copied
// to the student's account in the background so it survives a new phone, a
// cleared browser or a new login. The backend identifies the student by their
// signed session; the browser never talks to Supabase directly.
// Demo mode and servers without cloud saving stay device-only, silently.
// ============================================================================

import { isDemo, sessionToken, getCourses, workerUrl, studentNumber } from "./ta-client.js";
import { preferences, savePreferences } from "./personalization.js";

const emit = (state) => typeof window !== "undefined" && window.dispatchEvent(new CustomEvent("ta:cloud", { detail: { state } }));

async function request(method, body) {
  if (isDemo()) return null;
  for (let attempt = 0; attempt < 2; attempt++) {
    let token = sessionToken();
    if (!token || attempt) {
      // Tokens last an hour; signing in again for fresh marks issues a new one.
      await getCourses({ refresh: true }).catch(() => {});
      token = sessionToken();
    }
    if (!token) return null;
    let res;
    try {
      res = await fetch(`${workerUrl()}/api/store`, {
        method,
        headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(15000),
      });
    } catch { return null; }
    if (res.status === 401 && attempt === 0) continue;
    if (!res.ok) return null;
    return res.json().catch(() => null);
  }
  return null;
}

/** The dreams object sent to the cloud (and read back from it). */
export function dreamsPayload(p = preferences()) {
  return {
    name: p.name, career: p.career, school: p.school, motivation: p.motivation, target: p.target,
    goals: p.goals, dreamDone: !!p.dreamDone, gradesDone: !!p.gradesDone,
    updatedAt: p.updatedAt || Date.now(), goalsAt: p.goalsAt || 0,
  };
}

let pending = {};
let timer = null;
async function flush() {
  const body = pending;
  pending = {};
  if (!Object.keys(body).length) return;
  const result = await request("PUT", body);
  if (result?.saved) emit("saved");
  else { pending = { ...body, ...pending }; emit("offline"); }
}
/** Queue a save; rapid edits (typing a target) are sent together. */
export function cloudSave(patch) {
  if (isDemo()) return;
  Object.assign(pending, patch);
  emit("saving");
  clearTimeout(timer);
  timer = setTimeout(flush, 700);
}
if (typeof window !== "undefined") window.addEventListener("pagehide", () => { if (Object.keys(pending).length) flush(); });

/** Save dreams fields (device + cloud). */
export function saveDreams(patch) {
  const p = savePreferences({ ...patch, updatedAt: Date.now() });
  cloudSave({ dreams: dreamsPayload(p) });
  return p;
}
/** Save the personal/school goals list (device + cloud). */
export function saveGoalList(list) {
  const p = savePreferences({ goalsList: list, goalsAt: Date.now(), updatedAt: Date.now() });
  cloudSave({ dreams: dreamsPayload(p), goals: list });
  return p;
}

let synced = { account: "", promise: null };
/**
 * Pull the student's saved dreams/goals once per page load and merge by
 * timestamp: the newer copy wins; a device with data the cloud lacks uploads it.
 * Resolves true when the on-screen data changed.
 */
export function syncFromCloud() {
  const account = isDemo() ? "demo" : studentNumber();
  if (synced.account === account && synced.promise) return synced.promise;
  const promise = (async () => {
    if (isDemo()) return false;
    const remote = await request("GET");
    if (!remote) return false;
    const p = preferences();
    const rd = remote.dreams;
    let changed = false;
    if (rd && (rd.updatedAt || 0) > (p.updatedAt || 0)) {
      const patch = {
        career: rd.career || "", school: rd.school || "", motivation: rd.motivation || "",
        target: Number.isFinite(rd.target) ? rd.target : p.target, goals: rd.goals || {},
        dreamDone: !!rd.dreamDone, gradesDone: !!rd.gradesDone, updatedAt: rd.updatedAt,
      };
      if (rd.name && !p.name) patch.name = rd.name;
      if (Array.isArray(remote.goals) && (rd.goalsAt || 0) > (p.goalsAt || 0)) { patch.goalsList = remote.goals; patch.goalsAt = rd.goalsAt; }
      savePreferences(patch);
      changed = true;
    } else if (p.updatedAt && (!rd || (rd.updatedAt || 0) < p.updatedAt)) {
      cloudSave({ dreams: dreamsPayload(p), goals: p.goalsList || [] });
    }
    return changed;
  })();
  synced = { account, promise };
  return promise;
}
