// ============================================================================
// TeachAssist client — student sign-in + account-scoped live data
// ----------------------------------------------------------------------------
// Signs you in by POSTing your student number + password to the Worker, which
// logs into ta.yrdsb.ca and returns your marks. The Worker answers with a
// sealed credential (a "locked box" only it can open); this device keeps that
// box and the student number, never the password. Sign Out clears them.
// Sign-in always goes to this site's own backend.
//
// Returned course shape (from the Worker):
//   { code, name, currentMark, midterm, evaluations: [{ name, category, percent, weight }] }
// ============================================================================

import { readHistory, recordSnapshot } from "./history.js";
import { WORKER_URL } from "./config.js";
import { DEMO_COURSES, DEMO_SCRAPED_AT } from "./demo-data.js";
import { readStudentData, writeStudentData } from "./student-store.js";

const LS = {
  url: "ta_worker_url", // legacy custom server; cleared, never used
  num: "ta_student_number",
  pass: "ta_password", // legacy in localStorage; only ever kept in sessionStorage now
  cred: "ta_cred",
  demo: "ta_demo_mode",
};

let cacheAccount = null;
let cache = null; // last fetched courses (this page load)
let cachedAt = null; // ISO time of the active student’s successful refresh
let savedCopyAt = null; // set when TeachAssist had no marks and the last saved copy is shown
let issuedCred = ""; // sealed credential from the latest successful sign-in
let inflight = null; // the TeachAssist request in progress, shared by every screen

/** When the marks currently on screen were scraped (ISO string), or null. */
export function lastSyncedAt() {
  return cachedAt;
}
/** True when TeachAssist returned nothing and these are the last saved marks. */
export function showingSavedCopy() {
  return !!savedCopyAt;
}

// ---- per-device settings ---------------------------------------------------
/** This site's own backend. Old saved servers and API keys are cleared, so a
 *  stored address can never send a student's password anywhere else. */
export function workerUrl() {
  if (localStorage.getItem(LS.url) || localStorage.getItem("ta_api_key")) {
    localStorage.removeItem(LS.url);
    localStorage.removeItem("ta_api_key");
  }
  return WORKER_URL;
}
export function studentNumber() {
  return localStorage.getItem(LS.num) || "";
}
/** A password still held for this tab only (or left by an old version in localStorage). */
function password() {
  return sessionStorage.getItem(LS.pass) || localStorage.getItem(LS.pass) || "";
}
function sealedCred() {
  return localStorage.getItem(LS.cred) || "";
}
export function isLoggedIn() {
  return isDemo() || !!(studentNumber() && (sealedCred() || password()));
}
/** Keep the Worker's sealed credential; the password is never saved on the device. */
function keepCredential(pass) {
  localStorage.removeItem(LS.pass);
  if (issuedCred) {
    localStorage.setItem(LS.cred, issuedCred);
    sessionStorage.removeItem(LS.pass);
  } else if (pass) {
    // A backend that can't seal (no API_KEY) gets the password for this tab
    // only; closing the tab forgets it.
    sessionStorage.setItem(LS.pass, pass);
  }
  issuedCred = "";
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
/** `secret` is { password } on sign-in, or { cred } (the sealed box) on refresh. */
async function postMarks(username, secret) {
  const url = workerUrl();
  if (!url) throw new Error("Sign-in is not configured. Please contact the site owner.");
  let res;
  try {
    res = await fetch(url + "/api/marks", {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ username, ...secret }),
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
  if (res.status === 401 && body?.error === "Unauthorized") {
    throw new Error("This sign-in server is out of date. Use Reset sign-in connection below, then try again.");
  }
  if (body?.code?.startsWith("TA_") && typeof body.error === "string") {
    const error = new Error(body.error);
    error.code = body.code;
    // Secret-free sign-in steps (no passwords, student numbers or cookie values).
    if (Array.isArray(body.trace)) error.trace = body.trace.filter((line) => typeof line === "string").slice(0, 20);
    throw error;
  }
  if (res.status === 401) throw new Error(body?.error || "TeachAssist could not complete sign-in. Please try again.");
  if (res.status === 404 || res.status === 405 || (res.ok && !Array.isArray(body))) {
    throw new Error("The website’s sign-in service is not available yet. Please ask the site owner to redeploy the latest website version.");
  }
  if (!res.ok) throw new Error((body && body.error) || `Worker returned HTTP ${res.status}`);
  if (!Array.isArray(body)) throw new Error("Unexpected response from the Worker.");
  savedCopyAt = res.headers.get("X-TeachAssist-Saved-At") || null;
  issuedCred = res.headers.get("X-TeachAssist-Cred") || "";
  const token = res.headers.get("X-TeachAssist-Session");
  if (token) sessionStorage.setItem(`ta-session:${url}:${username}`, token);
  return body;
}

export function resetSignInService() {
  localStorage.removeItem(LS.url);
  localStorage.removeItem("ta_api_key");
  cache = null;
  cachedAt = null;
}

/** Sign in: validates the credentials by fetching marks, then stores them. */
export async function login(num, pass) {
  const courses = await postMarks(num.trim(), { password: pass });
  localStorage.setItem(LS.num, num.trim());
  keepCredential(pass);
  localStorage.removeItem(LS.demo);
  cache = courses;
  cacheAccount = `${workerUrl()}:${studentNumber()}`;
  cachedAt = savedCopyAt || new Date().toISOString();
  if (!savedCopyAt) saveSnapshot(courses);
  keepLastMarks(courses);
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
  // Opening a course while the Courses screen is still loading reuses that
  // request instead of signing in to TeachAssist a second time.
  if (inflight?.account === account) return inflight.promise;
  const promise = fetchCourses(account, refresh).finally(() => { if (inflight?.promise === promise) inflight = null; });
  inflight = { account, promise };
  return promise;
}

async function fetchCourses(account, refresh) {
  if (!isLoggedIn()) throw new Error("Not signed in.");
  // Refresh with the sealed box. A phone from before sealing still holds the
  // password: send it once, then keepCredential swaps it for a box.
  const legacy = !sealedCred() && password();
  let courses;
  try {
    courses = await postMarks(studentNumber(), legacy ? { password: legacy } : { cred: sealedCred() });
  } catch (err) {
    if (err.code === "TA_CRED_EXPIRED" && account === `${workerUrl()}:${studentNumber()}`) signOut();
    throw err;
  }
  if (isDemo() || account !== `${workerUrl()}:${studentNumber()}`) {
    issuedCred = "";
    throw new Error("Your account changed. Open your courses again.");
  }
  keepCredential(legacy);
  cache = courses;
  cacheAccount = account;
  cachedAt = savedCopyAt || new Date().toISOString();
  if (!savedCopyAt) saveSnapshot(cache, { checked: refresh });
  keepLastMarks(cache);
  return cache;
}

/** True once this page load has live marks for the signed-in student. */
export function hasLiveCourses() {
  return isDemo() || (!!cache && cacheAccount === `${workerUrl()}:${studentNumber()}`);
}

// ---- last saved marks (shown instantly while TeachAssist loads) -------------
const LAST = "last-marks";
function keepLastMarks(courses) {
  try { writeStudentData(LAST, { at: cachedAt, courses }); } catch { /* storage full: not needed to show marks */ }
}
/**
 * The student's last recorded marks without waiting on TeachAssist: this
 * device's copy, else the cloud copy (Supabase). { courses, savedAt } or null.
 */
export async function getSavedCourses() {
  if (isDemo() || !isLoggedIn()) return null;
  const local = readStudentData(LAST, null);
  if (Array.isArray(local?.courses) && local.courses.length) return { courses: local.courses, savedAt: local.at || null };
  const num = studentNumber(), cred = sealedCred();
  if (!cred) return null;
  try {
    const res = await fetch(`${workerUrl()}/api/saved-marks`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: num, cred }),
      signal: AbortSignal.timeout(8000),
    });
    const body = res.ok ? await res.json() : null;
    if (num !== studentNumber() || !Array.isArray(body?.courses) || !body.courses.length) return null;
    return { courses: body.courses, savedAt: body.savedAt || null };
  } catch { return null; }
}

export function requireLogin() {
  if (!isLoggedIn()) {
    window.location.replace("index.html");
    return false;
  }
  return true;
}

export function signOut() {
  // Ask the server to cancel this saved login everywhere (so a copy of the box
  // stops working too). Best effort: signing out here never waits on it.
  const cred = sealedCred();
  if (cred && studentNumber() && !isDemo()) {
    try {
      fetch(`${workerUrl()}/api/signout`, {
        method: "POST",
        keepalive: true,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: studentNumber(), cred }),
      }).catch(() => {});
    } catch { /* offline or no fetch: the device copy is still removed below */ }
  }
  sessionStorage.removeItem(`ta-session:${workerUrl()}:${studentNumber()}`);
  localStorage.removeItem(LS.num);
  localStorage.removeItem(LS.pass);
  sessionStorage.removeItem(LS.pass);
  localStorage.removeItem(LS.cred);
  localStorage.removeItem(LS.demo);
  localStorage.removeItem(LS.url);
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
    // A refresh swaps in a new sealed box; only react when the account changes
    // or this device is signed out.
    const signedOut = [LS.pass, LS.cred].includes(event.key) && !isLoggedIn();
    if ([LS.num, LS.demo, LS.url].includes(event.key) || signedOut || event.key === null) {
      cache = null;
      cachedAt = null;
      window.location.replace('index.html');
    }
  });
}
