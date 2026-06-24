// ============================================================================
// TeachAssist client — auth + live data (single user)
// ----------------------------------------------------------------------------
// Signs you in by POSTing your student number + password to the Worker, which
// logs into ta.yrdsb.ca and returns your marks. Your credentials are kept in
// this device's localStorage so the app can re-fetch (like the reference app);
// Sign Out clears them. They are never sent anywhere except your own Worker.
//
// Returned course shape (from the Worker):
//   { code, name, currentMark, midterm, evaluations: [{ name, category, percent, weight }] }
// ============================================================================

import { WORKER_URL } from "./config.js";

const LS = {
  url: "ta_worker_url",
  key: "ta_api_key",
  num: "ta_student_number",
  pass: "ta_password",
  snaps: "ta_snapshots",
};

let cache = null; // last fetched courses (this page load)
let cachedAt = null; // ISO time the shown marks were scraped (from /api/cached)

/** When the marks currently on screen were scraped (ISO string), or null. */
export function lastSyncedAt() {
  return cachedAt;
}

// ---- per-device settings ---------------------------------------------------
export function workerUrl() {
  return (localStorage.getItem(LS.url) || WORKER_URL || "").trim().replace(/\/+$/, "");
}
export function setWorkerUrl(u) {
  localStorage.setItem(LS.url, (u || "").trim());
}
export function apiKey() {
  return (localStorage.getItem(LS.key) || "").trim();
}
export function setApiKey(k) {
  localStorage.setItem(LS.key, (k || "").trim());
}
export function studentNumber() {
  return localStorage.getItem(LS.num) || "";
}
function password() {
  return localStorage.getItem(LS.pass) || "";
}
export function isLoggedIn() {
  return !!(studentNumber() && password());
}

// ---- marks helpers ---------------------------------------------------------
/** The mark to show for a course: live current mark, else midterm, else null. */
export function displayMark(c) {
  if (c && typeof c.currentMark === "number") return c.currentMark;
  if (c && typeof c.midterm === "number") return c.midterm;
  return null;
}
/** "current" / "midterm" / "" — which value displayMark returned. */
export function markKind(c) {
  if (c && typeof c.currentMark === "number") return "current";
  if (c && typeof c.midterm === "number") return "midterm";
  return "";
}
/** Simple average of every course's display mark. */
export function overallAverage(courses) {
  const m = (courses || []).map(displayMark).filter((x) => x != null);
  return m.length ? m.reduce((a, b) => a + b, 0) / m.length : null;
}

// ---- network ---------------------------------------------------------------
async function postMarks(username, pass) {
  const url = workerUrl();
  if (!url) throw new Error("Worker URL is not set (see Advanced on the sign-in screen).");
  let res;
  try {
    res = await fetch(url + "/api/marks", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(apiKey() ? { "x-api-key": apiKey() } : {}),
      },
      body: JSON.stringify({ username, password: pass }),
    });
  } catch {
    throw new Error("Couldn't reach the Worker. Check the Worker URL and that its DASHBOARD_ORIGIN matches this site.");
  }
  let body = null;
  try {
    body = await res.json();
  } catch {
    /* non-JSON */
  }
  if (res.status === 401) throw new Error("Unauthorized — check your API key (Advanced).");
  if (!res.ok) throw new Error((body && body.error) || `Worker returned HTTP ${res.status}`);
  if (!Array.isArray(body)) throw new Error("Unexpected response from the Worker.");
  return body;
}

/** Sign in: validates the credentials by fetching marks, then stores them. */
export async function login(num, pass) {
  const courses = await postMarks(num.trim(), pass);
  localStorage.setItem(LS.num, num.trim());
  localStorage.setItem(LS.pass, pass);
  cache = courses;
  cachedAt = new Date().toISOString();
  saveSnapshot(courses);
  return courses;
}

/**
 * Read the daily snapshot the Worker caches in KV (populated by the Cron
 * Trigger and by every live scrape). Returns the courses array, or null if
 * there is no cache yet / it can't be reached — callers fall back to a live
 * scrape. Also records when the snapshot was scraped (lastSyncedAt()).
 */
async function getCachedMarks() {
  const url = workerUrl();
  if (!url) return null;
  try {
    const res = await fetch(url + "/api/cached", {
      headers: { ...(apiKey() ? { "x-api-key": apiKey() } : {}) },
    });
    if (!res.ok) return null;
    const body = await res.json();
    if (body && Array.isArray(body.courses)) {
      cachedAt = body.scrapedAt || null;
      return body.courses;
    }
  } catch {
    /* unreachable cache -> fall back to a live scrape */
  }
  return null;
}

/**
 * Get courses for this page load. A normal load prefers the daily cache for an
 * instant, login-free render; {refresh:true} forces a live re-scrape (which
 * also repopulates the shared cache server-side).
 */
export async function getCourses({ refresh = false } = {}) {
  if (cache && !refresh) return cache;

  if (!refresh) {
    const cached = await getCachedMarks();
    if (cached && cached.length) {
      cache = cached;
      saveSnapshot(cache);
      return cache;
    }
  }

  if (!isLoggedIn()) throw new Error("Not signed in.");
  cache = await postMarks(studentNumber(), password());
  cachedAt = new Date().toISOString();
  saveSnapshot(cache);
  return cache;
}

export function requireLogin() {
  if (!isLoggedIn()) {
    window.location.replace("index.html");
    return false;
  }
  return true;
}

export function signOut() {
  localStorage.removeItem(LS.num);
  localStorage.removeItem(LS.pass);
  cache = null;
  window.location.replace("index.html");
}

// ---- "Updates" feed: compare day-over-day snapshots -------------------------
function saveSnapshot(courses) {
  try {
    const snaps = JSON.parse(localStorage.getItem(LS.snaps) || "[]");
    const today = new Date().toISOString().slice(0, 10);
    const snap = {
      date: new Date().toISOString(),
      overall: overallAverage(courses),
      marks: Object.fromEntries(courses.map((c) => [c.code, displayMark(c)])),
    };
    const kept = snaps.filter((s) => s.date.slice(0, 10) !== today);
    kept.push(snap);
    localStorage.setItem(LS.snaps, JSON.stringify(kept.slice(-30)));
  } catch {
    /* ignore */
  }
}

/** Recent mark changes (between the two latest day snapshots), newest first. */
export function getUpdates() {
  let snaps = [];
  try {
    snaps = JSON.parse(localStorage.getItem(LS.snaps) || "[]");
  } catch {
    return [];
  }
  if (snaps.length < 2) return [];
  const prev = snaps[snaps.length - 2];
  const cur = snaps[snaps.length - 1];
  const out = [];
  const changed = (a, b) => a != null && b != null && Math.abs(b - a) >= 0.05;
  if (changed(prev.overall, cur.overall)) {
    out.push({ label: "Overall Average", overall: true, from: prev.overall, to: cur.overall });
  }
  for (const code of Object.keys(cur.marks)) {
    if (changed(prev.marks[code], cur.marks[code])) {
      out.push({ label: code, overall: false, from: prev.marks[code], to: cur.marks[code] });
    }
  }
  return out;
}
