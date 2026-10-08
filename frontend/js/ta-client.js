// ============================================================================
// TeachAssist client — student sign-in + account-scoped live data
// ----------------------------------------------------------------------------
// Signs you in by POSTing your student number + password to the Worker, which
// logs into ta.yrdsb.ca and returns your marks. Your credentials are kept in
// this device's localStorage so the app can re-fetch (like the reference app);
// Sign Out clears them. They are never sent anywhere except your own Worker.
//
// Returned course shape (from the Worker):
//   { code, name, currentMark, midterm, evaluations: [{ name, category, percent, weight }] }
// ============================================================================

import { readHistory, recordSnapshot } from "./history.js";
import { validServerUrl } from "./student-store.js";
import { WORKER_URL } from "./config.js";
import { DEMO_COURSES, DEMO_SCRAPED_AT } from "./demo-data.js";

const LS = {
  url: "ta_worker_url",
  num: "ta_student_number",
  pass: "ta_password",
  demo: "ta_demo_mode",
};

let cacheAccount = null;
let cache = null; // last fetched courses (this page load)
let cachedAt = null; // ISO time of the active student’s successful refresh

/** When the marks currently on screen were scraped (ISO string), or null. */
export function lastSyncedAt() {
  return cachedAt;
}

// ---- per-device settings ---------------------------------------------------
export function workerUrl() {
  return (localStorage.getItem(LS.url) || WORKER_URL || "").trim().replace(/\/+$/, "");
}
export function setWorkerUrl(u) {
  const value = validServerUrl(u || WORKER_URL);
  localStorage.setItem(LS.url, value);
  cache = null;
  cachedAt = null;
}
export function studentNumber() {
  return localStorage.getItem(LS.num) || "";
}
function password() {
  return localStorage.getItem(LS.pass) || "";
}
export function isLoggedIn() {
  return isDemo() || !!(studentNumber() && password());
}

// ---- demo mode ---------------------------------------------------------------
/** True when browsing the bundled TeachAssist snapshot instead of live marks. */
export function isDemo() {
  return localStorage.getItem(LS.demo) === "1";
}
/** Enter demo mode: browse the bundled snapshot without signing in. */
export function enterDemo() {
  localStorage.setItem(LS.demo, "1");
  cache = DEMO_COURSES;
  cachedAt = DEMO_SCRAPED_AT;
  saveSnapshot(DEMO_COURSES);
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

export function sessionToken() {
  return sessionStorage.getItem(`ta-session:${workerUrl()}:${studentNumber()}`) || "";
}

// ---- network ---------------------------------------------------------------
async function postMarks(username, pass) {
  const url = workerUrl();
  if (!url) throw new Error("Sign-in is not configured. Please contact the site owner.");
  let res;
  try {
    res = await fetch(url + "/api/marks", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ username, password: pass }),
      signal: AbortSignal.timeout(60000),
    });
  } catch {
    throw new Error("Couldn't connect to TeachAssist. Check your connection and try again.");
  }
  let body = null;
  try {
    body = await res.json();
  } catch {
    /* non-JSON */
  }
  if (res.status === 401) throw new Error("Sign-in failed. Check your student number and password.");
  if (!res.ok) throw new Error((body && body.error) || `Worker returned HTTP ${res.status}`);
  if (!Array.isArray(body)) throw new Error("Unexpected response from the Worker.");
  const token = res.headers.get("X-TeachAssist-Session");
  if (token) sessionStorage.setItem(`ta-session:${url}:${username}`, token);
  return body;
}

/** Sign in: validates the credentials by fetching marks, then stores them. */
export async function login(num, pass) {
  const courses = await postMarks(num.trim(), pass);
  localStorage.setItem(LS.num, num.trim());
  localStorage.setItem(LS.pass, pass);
  localStorage.removeItem(LS.demo);
  cache = courses;
  cacheAccount = `${workerUrl()}:${studentNumber()}`;
  cachedAt = new Date().toISOString();
  saveSnapshot(courses);
  return courses;
}

/** Get only the active student's marks; the shared owner cache is never read. */
export async function getCourses({ refresh = false } = {}) {
  if (isDemo()) {
    cache = DEMO_COURSES;
    cachedAt = DEMO_SCRAPED_AT;
    saveSnapshot(cache);
    return cache;
  }
  const account = `${workerUrl()}:${studentNumber()}`;
  if (cache && cacheAccount === account && !refresh) return cache;

  if (!isLoggedIn()) throw new Error("Not signed in.");
  const courses = await postMarks(studentNumber(), password());
  if (isDemo() || account !== `${workerUrl()}:${studentNumber()}`) throw new Error("Your account changed. Open your courses again.");
  cache = courses;
  cacheAccount = account;
  cachedAt = new Date().toISOString();
  saveSnapshot(cache, { checked: refresh });
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
  sessionStorage.removeItem(`ta-session:${workerUrl()}:${studentNumber()}`);
  localStorage.removeItem(LS.num);
  localStorage.removeItem(LS.pass);
  localStorage.removeItem(LS.demo);
  localStorage.removeItem("ta_api_key");
  cache = null;
  window.location.replace("index.html");
}

// ---- Grade history and recent updates -------------------------
export function getSnapshots() {
  return readHistory(isDemo() ? "demo" : workerUrl());
}
function saveSnapshot(courses, { checked = false } = {}) {
  try {
    const snap = {
      date: cachedAt || new Date().toISOString(),
      overall: overallAverage(courses),
      marks: Object.fromEntries(courses.map(c => [c.code, displayMark(c)])),
    };
    const result = recordSnapshot(isDemo() ? "demo" : workerUrl(), snap);
    if (!isDemo() && typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("ta:marks-checked", { detail: { ...result, checked } }));
    }
  } catch { /* Storage may be unavailable; marks should still load. */ }
}

/** Recent mark changes (between the two latest snapshots), newest first. */
export function getUpdates() {
  const snaps = getSnapshots();
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

// A sign-out/account switch in another tab must clear that tab's rendered marks too.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', event => {
    if ([LS.num, LS.pass, LS.demo, LS.url].includes(event.key) || event.key === null) {
      cache = null;
      cachedAt = null;
      window.location.replace('index.html');
    }
  });
}
