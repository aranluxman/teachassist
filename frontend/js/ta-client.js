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

import { deviceStore, isSharedDevice } from "./device-store.js";
import { readHistory, recordSnapshot, realMark, courseItems, diffItems, reasonPull } from "./history.js";
import { WORKER_URL } from "./config.js";
import { DEMO_COURSES, DEMO_SCRAPED_AT } from "./demo-data.js";
import { readStudentData, writeStudentData } from "./student-store.js";
import { createDeviceSignIn, encryptDeviceCredential, unlockDeviceCredential } from "./device-sign-in.js";

const LS = {
  url: "ta_worker_url", // legacy custom server; cleared, never used
  num: "ta_student_number",
  pass: "ta_password", // legacy in localStorage; only ever kept in sessionStorage now
  cred: "ta_cred",
  demo: "ta_demo_mode",
  protected: "ta_device_signin",
  unlocked: "ta_device_signin_unlocked",
};

let cacheAccount = null;
let cache = null; // last fetched courses (this page load)
let cachedAt = null; // ISO time of the active student’s successful refresh
let savedCopyAt = null; // set when TeachAssist had no marks and the last saved copy is shown
let inflight = null; // the TeachAssist request in progress, shared by every screen
let authRevision = 0;

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
  return deviceStore().getItem(LS.num) || "";
}
/** A password still held for this tab only (or left by an old version in localStorage). */
function password() {
  return sessionStorage.getItem(LS.pass) || localStorage.getItem(LS.pass) || "";
}
function readDeviceSignIn(raw = localStorage.getItem(LS.protected)) {
  try {
    const record = JSON.parse(raw);
    return record?.version === 1 && record.student && record.id && record.generation ? record : null;
  } catch { return null; }
}
function activeDeviceSignIn() {
  const record = isSharedDevice() ? null : readDeviceSignIn();
  return record?.student === studentNumber() ? record : null;
}
function protectionIdentity(record) {
  return record ? `${record.id}:${record.generation}` : "";
}
function sealedCred() {
  const record = activeDeviceSignIn();
  if (record) {
    const prefix = `${protectionIdentity(record)}:`;
    const unlocked = sessionStorage.getItem(LS.unlocked);
    return unlocked?.startsWith(prefix) ? unlocked.slice(prefix.length) : "";
  }
  return deviceStore().getItem(LS.cred) || "";
}
export function isLoggedIn() {
  return isDemo() || !!(studentNumber() && (sealedCred() || (!activeDeviceSignIn() && password())));
}
function storeUnlockedCredential(record, cred) {
  sessionStorage.setItem(LS.unlocked, `${protectionIdentity(record)}:${cred}`);
  discardUnprotectedCredentials();
}
function discardUnprotectedCredentials() {
  localStorage.removeItem(LS.pass);
  localStorage.removeItem(LS.cred);
  sessionStorage.removeItem(LS.pass);
}
/** Keep the Worker's sealed credential, or the legacy backend's tab-only password. */
function keepCredential(cred, pass) {
  localStorage.removeItem(LS.pass);
  if (cred) {
    deviceStore().setItem(LS.cred, cred);
    sessionStorage.removeItem(LS.pass);
  } else if (pass) {
    // A backend that can't seal (no API_KEY) gets the password for this tab
    // only; closing the tab forgets it.
    sessionStorage.setItem(LS.pass, pass);
  }
}

export function deviceSignInEnabled() {
  return !isDemo() && !!activeDeviceSignIn();
}

export function canEnableDeviceSignIn() {
  return !isDemo() && !isSharedDevice() && !!studentNumber() && !!sealedCred();
}

export function canUnlockDeviceSignIn() {
  return !isDemo() && !!activeDeviceSignIn()?.box;
}

function ensureCurrent(revision, identity, student) {
  if (revision !== authRevision || (!isSharedDevice() && identity !== protectionIdentity(readDeviceSignIn())) ||
    (student != null && student !== studentNumber())) {
    throw new Error("Your sign-in changed. Try again.");
  }
}

export async function enableDeviceSignIn() {
  if (!canEnableDeviceSignIn() || deviceSignInEnabled()) return;
  const revision = authRevision;
  const identity = protectionIdentity(readDeviceSignIn());
  const student = studentNumber();
  const cred = sealedCred();
  let record = await createDeviceSignIn(student, cred);
  ensureCurrent(revision, identity, student);
  // A marks refresh may have completed while the device prompt was open.
  const latest = sealedCred();
  if (latest !== cred) record = { ...record, box: await encryptDeviceCredential(record, latest) };
  ensureCurrent(revision, identity, student);
  sessionStorage.setItem(LS.unlocked, `${protectionIdentity(record)}:${latest}`);
  localStorage.setItem(LS.protected, JSON.stringify(record));
  discardUnprotectedCredentials();
  authRevision++;
}

export function disableDeviceSignIn() {
  const cred = sealedCred();
  if (!deviceSignInEnabled() || !cred) return;
  keepCredential(cred);
  localStorage.removeItem(LS.protected);
  sessionStorage.removeItem(LS.unlocked);
  authRevision++;
}

export function lockDeviceSignIn() {
  const record = activeDeviceSignIn();
  if (!record) return;
  localStorage.setItem(LS.protected, JSON.stringify({ ...record, generation: crypto.randomUUID() }));
  sessionStorage.removeItem(LS.unlocked);
  sessionStorage.removeItem(`ta-session:${workerUrl()}:${studentNumber()}`);
  authRevision++;
  cache = null;
  window.location.replace("index.html");
}

// ---- demo mode ---------------------------------------------------------------
/** True when browsing the bundled TeachAssist snapshot instead of live marks. */
export function isDemo() {
  return localStorage.getItem(LS.demo) === "1";
}
/** Enter demo mode: browse the bundled snapshot without signing in. */
export function enterDemo() {
  authRevision++;
  localStorage.setItem(LS.demo, "1");
  cache = DEMO_COURSES;
  cachedAt = DEMO_SCRAPED_AT;
  saveSnapshot(DEMO_COURSES);
}

// ---- marks helpers ---------------------------------------------------------
/**
 * The mark to show for a course: live current mark, else midterm, else null.
 * A 0% is a teacher's placeholder, not a mark, so it counts as no mark.
 */
export function displayMark(c) {
  return realMark(c?.currentMark) ?? realMark(c?.midterm) ?? estimatedMark(c);
}
/**
 * When TeachAssist hides the mark ("Please see teacher") but lists marked
 * work, estimate it the way TeachAssist does: average each category
 * (K/T/C/A, or each expectation) by its weights, then average the categories.
 * Weight-0 (formative) work only counts when nothing else is weighted.
 */
export function estimatedMark(c) {
  const evals = Array.isArray(c?.evaluations) ? c.evaluations : [];
  const groups = new Map();
  for (const e of evals) {
    const parts = Array.isArray(e?.strands) && e.strands.length ? e.strands : [e];
    for (const p of parts) {
      if (typeof p?.percent !== "number" || !Number.isFinite(p.percent)) continue;
      const key = String(p.category || "Other");
      const w = typeof p.weight === "number" && p.weight >= 0 ? p.weight : 1;
      const g = groups.get(key) || { sum: 0, w: 0, plain: 0, n: 0 };
      g.sum += p.percent * w; g.w += w; g.plain += p.percent; g.n += 1;
      groups.set(key, g);
    }
  }
  if (!groups.size) return null;
  // Like TeachAssist: once anything is weighted, categories that only hold
  // "no weight" work don't count at all.
  const all = [...groups.values()];
  const weighted = all.filter((g) => g.w > 0);
  const avgs = (weighted.length ? weighted : all).map((g) => (g.w > 0 ? g.sum / g.w : g.plain / g.n));
  return Math.round((avgs.reduce((a, b) => a + b, 0) / avgs.length) * 10) / 10;
}
/** "current" / "midterm" / "" — which value displayMark returned. */
export function markKind(c) {
  if (realMark(c?.currentMark) != null) return "current";
  if (realMark(c?.midterm) != null) return "midterm";
  if (estimatedMark(c) != null) return "estimate";
  return "";
}
/** Simple average of every course's display mark. */
export function overallAverage(courses) {
  const m = (courses || []).map(displayMark).filter((x) => x != null);
  return m.length ? m.reduce((a, b) => a + b, 0) / m.length : null;
}

export function sessionToken() {
  if (activeDeviceSignIn() && !sealedCred()) return "";
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
  return {
    courses: body,
    savedAt: res.headers.get("X-TeachAssist-Saved-At"),
    cred: res.headers.get("X-TeachAssist-Cred") || "",
    token: res.headers.get("X-TeachAssist-Session"),
  };
}

export function resetSignInService() {
  localStorage.removeItem(LS.url);
  localStorage.removeItem("ta_api_key");
  cache = null;
  cachedAt = null;
}

/** Sign in: validates the credentials by fetching marks, then stores them. */
export async function login(num, pass) {
  const username = num.trim();
  const revision = ++authRevision;
  const previous = isSharedDevice() ? null : readDeviceSignIn();
  const identity = protectionIdentity(previous);
  const result = await postMarks(username, { password: pass });
  ensureCurrent(revision, identity);
  if (previous?.student === username) {
    if (!result.cred) throw new Error("The sign-in service couldn’t save a protected session. Try again later.");
    const record = { ...previous, generation: crypto.randomUUID(), box: await encryptDeviceCredential(previous, result.cred) };
    ensureCurrent(revision, identity);
    localStorage.setItem(LS.protected, JSON.stringify(record));
    storeUnlockedCredential(record, result.cred);
  } else {
    keepCredential(result.cred, pass);
    if (previous) localStorage.removeItem(LS.protected);
  }
  deviceStore().setItem(LS.num, username);
  localStorage.removeItem(LS.demo);
  return acceptMarks(result);
}

/** Open the local box with the passkey, then validate it with the Worker. */
export async function unlockDeviceSignIn() {
  const record = activeDeviceSignIn();
  if (!record?.box || isDemo()) throw new Error("Sign in with your TeachAssist password first.");
  const revision = ++authRevision;
  const identity = protectionIdentity(record);
  const cred = await unlockDeviceCredential(record);
  ensureCurrent(revision, identity, record.student);
  const result = await postMarks(record.student, { cred });
  await keepProtectedRefresh(record, result.cred, cred, revision);
  return acceptMarks(result);
}

function acceptMarks({ courses, savedAt, token }, { refresh = false, useLastMarks = false } = {}) {
  if (token) sessionStorage.setItem(`ta-session:${workerUrl()}:${studentNumber()}`, token);
  savedCopyAt = savedAt;
  cache = useLastMarks ? withLastRealMarks(courses) : courses;
  cacheAccount = `${workerUrl()}:${studentNumber()}`;
  cachedAt = savedCopyAt || new Date().toISOString();
  if (!savedCopyAt) saveSnapshot(cache, { checked: refresh });
  keepLastMarks(cache);
  return cache;
}

async function keepProtectedRefresh(record, renewed, previous, revision) {
  const box = renewed ? await encryptDeviceCredential(record, renewed) : record.box;
  ensureCurrent(revision, protectionIdentity(record), record.student);
  if (renewed) localStorage.setItem(LS.protected, JSON.stringify({ ...record, box }));
  storeUnlockedCredential(record, renewed || previous);
}

/** Get only the active student's marks; the shared owner cache is never read. */
export async function getCourses({ refresh = false } = {}) {
  if (isDemo()) {
    cache = DEMO_COURSES;
    cachedAt = DEMO_SCRAPED_AT;
    saveSnapshot(cache);
    return cache;
  }
  if (!isLoggedIn()) throw new Error("Not signed in.");
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
  // Refresh with the sealed box. A phone from before sealing still holds the
  // password: send it once, then keepCredential swaps it for a box.
  const revision = authRevision;
  const student = studentNumber();
  const record = activeDeviceSignIn();
  const identity = protectionIdentity(readDeviceSignIn());
  const cred = sealedCred();
  const legacy = !cred && password();
  let result;
  try {
    result = await postMarks(student, legacy ? { password: legacy } : { cred });
  } catch (err) {
    if (err.code === "TA_CRED_EXPIRED" && !isDemo() && revision === authRevision && account === `${workerUrl()}:${studentNumber()}` &&
      (isSharedDevice() || identity === protectionIdentity(readDeviceSignIn()))) {
      if (record && protectionIdentity(activeDeviceSignIn()) === protectionIdentity(record)) lockDeviceSignIn();
      else if (!record) signOut();
    }
    throw err;
  }
  if (isDemo()) throw new Error("Your sign-in changed. Try again.");
  ensureCurrent(revision, identity, student);
  if (record) await keepProtectedRefresh(record, result.cred, cred, revision);
  else keepCredential(result.cred, legacy);
  return acceptMarks(result, { refresh, useLastMarks: true });
}

/**
 * A course TeachAssist shows with no mark (or 0%), that the server had no
 * saved mark for either, gets the last real mark this device recorded for it,
 * flagged `saved` so the card says "Last saved mark".
 */
export function lastRealMarks(courses, snapshots) {
  if (!Array.isArray(courses)) return courses;
  return courses.map((c) => {
    if (!c || displayMark(c) != null) return c;
    for (let i = snapshots.length - 1; i >= 0; i--) {
      const m = realMark(snapshots[i].marks?.[c.code]);
      if (m != null) return { ...c, currentMark: m, saved: true };
    }
    return c;
  });
}
function withLastRealMarks(courses) {
  try { return lastRealMarks(courses, getSnapshots()); } catch { return courses; }
}

/** True once this page load has live marks for the signed-in student. */
export function hasLiveCourses() {
  return isDemo() || (isLoggedIn() && !!cache && cacheAccount === `${workerUrl()}:${studentNumber()}`);
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
  window.addEventListener("pageshow", event => {
    if (event.persisted && !isLoggedIn()) window.location.replace("index.html");
  });
  return true;
}

export function signOut() {
  authRevision++;
  const record = readDeviceSignIn();
  const keepSavedDeviceSignIn = record && (isSharedDevice() || isDemo());
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
  if (!keepSavedDeviceSignIn) {
    localStorage.removeItem(LS.protected);
    localStorage.removeItem(LS.num);
    localStorage.removeItem(LS.pass);
    localStorage.removeItem(LS.cred);
  }
  sessionStorage.removeItem(LS.unlocked);
  sessionStorage.removeItem(LS.pass);
  sessionStorage.removeItem(LS.num);
  sessionStorage.removeItem(LS.cred);
  localStorage.removeItem(LS.demo);
  localStorage.removeItem(LS.url);
  localStorage.removeItem("ta_api_key");
  // A shared computer: drop everything this tab kept (marks, settings, the flag).
  if (isSharedDevice()) sessionStorage.clear();
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
      // Every course's assessments, so Recent updates can say *why* a mark moved.
      items: Object.fromEntries(courses.map(c => [c.code, courseItems(c)])),
    };
    const result = recordSnapshot(isDemo() ? "demo" : workerUrl(), snap);
    if (!isDemo() && typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("ta:marks-checked", { detail: { ...result, checked } }));
    }
  } catch { /* Storage may be unavailable; marks should still load. */ }
}

/**
 * Recent changes (between the two latest snapshots), each with its reasons:
 *   { label, overall, from, to, reasons: [...], courses? }
 * A course is listed when its mark moved, or when its assessments changed
 * even though the mark didn't (a new test that matched your average).
 * reasons: what was added / removed / re-marked, and which way it pulled
 * (see history.js). The overall row lists the courses that moved it.
 */
export function getUpdates() {
  const snaps = getSnapshots();
  if (snaps.length < 2) return [];
  return updatesBetween(snaps[snaps.length - 2], snaps[snaps.length - 1]);
}
export function updatesBetween(prev, cur) {
  const out = [];
  const changed = (a, b) => a != null && b != null && Math.abs(b - a) >= 0.05;
  const courseRows = [];
  for (const code of Object.keys(cur.marks)) {
    const from = prev.marks[code], to = cur.marks[code];
    const diff = diffItems(prev.items?.[code], cur.items?.[code]);
    const reasons = (diff || []).map((r) => ({ ...r, pull: reasonPull(r, from) }));
    if (changed(from, to) || (reasons.length && from != null && to != null)) {
      courseRows.push({ label: code, overall: false, from, to, reasons, explained: diff != null });
    }
  }
  if (changed(prev.overall, cur.overall)) {
    const movers = courseRows.filter((r) => changed(r.from, r.to)).map((r) => ({ code: r.label, from: r.from, to: r.to }));
    out.push({ label: "Overall Average", overall: true, from: prev.overall, to: cur.overall, reasons: [], courses: movers });
  }
  return [...out, ...courseRows];
}

// A sign-out/account switch in another tab must clear that tab's rendered marks too.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', event => {
    // A refresh swaps in a new sealed box; only react when the account changes
    // or this device is signed out.
    const signedOut = [LS.pass, LS.cred].includes(event.key) && !isLoggedIn();
    const protectionChanged = event.key === LS.protected && !isSharedDevice() && !isDemo() &&
      protectionIdentity(readDeviceSignIn(event.oldValue)) !== protectionIdentity(readDeviceSignIn(event.newValue));
    if (protectionChanged) {
      sessionStorage.removeItem(LS.unlocked);
      sessionStorage.removeItem(`ta-session:${workerUrl()}:${studentNumber()}`);
    }
    if ([LS.num, LS.demo, LS.url].includes(event.key) || signedOut || protectionChanged || event.key === null) {
      authRevision++;
      cache = null;
      cachedAt = null;
      window.location.replace('index.html');
    }
  });
}
