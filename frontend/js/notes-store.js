// ============================================================================
// Notes: notebooks and notes, saved on this device first, then backed up.
// ----------------------------------------------------------------------------
// Everything lives under the student's own key (student-store.js), so a
// shared-computer sign-in keeps notes in that tab only and "Delete my data"
// removes them. Changes are copied to /api/notes in the background (batches of
// up to 50); the newer edit always wins, and deletes travel as tombstones.
// Demo mode stays on the device.
// ============================================================================

import { readStudentData, writeStudentData } from "./student-store.js";
import { request } from "./cloud-store.js";
import { isDemo } from "./ta-client.js";

/** Folder colours for notebooks, in order (the mockup's set). */
export const NOTEBOOK_COLOURS = ["#22c55e", "#3b82f6", "#a855f7", "#f97316", "#38bdf8", "#ec4899", "#64748b", "#eab308", "#14b8a6", "#ef4444"];

const KEY = "notes";
const empty = () => ({ notebooks: null, notebooksAt: null, notes: {}, dirty: [], notebooksDirty: false });
const emit = (detail) => typeof window !== "undefined" && window.dispatchEvent(new CustomEvent("ta:notes", { detail }));

export function readNotes() {
  const s = readStudentData(KEY, null);
  if (!s || typeof s !== "object") return empty();
  return { ...empty(), ...s, notes: s.notes && typeof s.notes === "object" ? s.notes : {}, dirty: Array.isArray(s.dirty) ? s.dirty : [] };
}
function write(state) {
  writeStudentData(KEY, state); // may throw when the device is full: callers show it
}

/** A short random id that the backend accepts (8-64 of A-Z a-z 0-9 -). */
export function newId() {
  return typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `n-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** A notebook id from a name: "Healthy Active Living" → "healthy-active-living". */
export const slug = (name) => String(name || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "notebook";

/**
 * The first time: one notebook per course (by its readable title) plus
 * General. `courses` is [{ code, title }].
 */
export function starterNotebooks(courses) {
  const seen = new Set();
  const list = [];
  for (const { code, title } of courses) {
    const id = slug(title || code);
    if (seen.has(id)) continue;
    seen.add(id);
    list.push({ id, name: (title || code).slice(0, 40), color: NOTEBOOK_COLOURS[list.length % NOTEBOOK_COLOURS.length], course: String(code || "").slice(0, 40) });
  }
  if (!seen.has("general")) list.push({ id: "general", name: "General", color: "#64748b", course: "" });
  return list;
}

/** Notebooks, created from the courses on first use. */
export function ensureNotebooks(courses) {
  const s = readNotes();
  if (Array.isArray(s.notebooks) && s.notebooks.length) return s.notebooks;
  s.notebooks = starterNotebooks(courses);
  s.notebooksAt = new Date().toISOString();
  s.notebooksDirty = true;
  write(s);
  queueSync();
  return s.notebooks;
}

export function saveNotebooks(notebooks) {
  const s = readNotes();
  s.notebooks = notebooks;
  s.notebooksAt = new Date().toISOString();
  s.notebooksDirty = true;
  write(s);
  queueSync();
}

/** Live notes (not deleted), newest first; optionally one notebook's. */
export function listNotes({ notebook = null, favourites = false } = {}) {
  return Object.values(readNotes().notes)
    .filter((n) => !n.deleted && (!notebook || n.notebook === notebook) && (!favourites || n.favorite))
    .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

export const getNote = (id) => {
  const n = readNotes().notes[id];
  return n && !n.deleted ? n : null;
};

/** Create or update a note (stamps updatedAt) and queue its backup. */
export function saveNote(note) {
  const s = readNotes();
  const now = new Date().toISOString();
  const prev = s.notes[note.id];
  const next = { tags: [], favorite: false, course: "", title: "", body: "", ...prev, ...note, deleted: false, createdAt: prev?.createdAt || note.createdAt || now, updatedAt: now };
  s.notes[note.id] = next;
  if (!s.dirty.includes(note.id)) s.dirty.push(note.id);
  write(s);
  queueSync();
  return next;
}

export function deleteNote(id) {
  const s = readNotes();
  if (!s.notes[id]) return;
  s.notes[id] = { ...s.notes[id], body: "", deleted: true, updatedAt: new Date().toISOString() };
  if (!s.dirty.includes(id)) s.dirty.push(id);
  write(s);
  queueSync();
}

/**
 * Merge the cloud copy into the local one: per note, the newer updatedAt
 * wins; local notes that are newer stay queued for upload.
 */
export function mergeRemote(local, remote) {
  const out = { ...local, notes: { ...local.notes }, dirty: [...local.dirty] };
  for (const r of Array.isArray(remote?.notes) ? remote.notes : []) {
    if (!r?.id) continue;
    const l = out.notes[r.id];
    if (!l || String(r.updatedAt) > String(l.updatedAt)) {
      out.notes[r.id] = r;
      out.dirty = out.dirty.filter((id) => id !== r.id);
    } else if (String(l.updatedAt) > String(r.updatedAt) && !out.dirty.includes(r.id)) {
      out.dirty.push(r.id);
    }
  }
  const remoteBooks = Array.isArray(remote?.notebooks) && remote.notebooks.length ? remote.notebooks : null;
  if (remoteBooks && (!out.notebooks || String(remote.notebooksAt || "") > String(out.notebooksAt || ""))) {
    out.notebooks = remoteBooks;
    out.notebooksAt = remote.notebooksAt;
    out.notebooksDirty = false;
  }
  return out;
}

// ── Background backup ──────────────────────────────────────────────────────
let timer = null;
let syncing = null;

/** Back up soon (changes in a burst go together). */
export function queueSync(delay = 1500) {
  if (isDemo() || typeof window === "undefined") return;
  clearTimeout(timer);
  timer = setTimeout(() => void pushNotes(), delay);
}

async function pushNotes() {
  const s = readNotes();
  if (!s.dirty.length && !s.notebooksDirty) return;
  emit({ state: "saving" });
  // Batches the backend accepts: up to 50 notes and ~400 KB each.
  let ok = true;
  const ids = [...s.dirty];
  let first = true;
  while ((ids.length || (first && s.notebooksDirty)) && ok) {
    const batch = [];
    let size = 0;
    while (ids.length && batch.length < 50) {
      const n = s.notes[ids[0]];
      const len = JSON.stringify(n || {}).length;
      if (batch.length && size + len > 400000) break;
      ids.shift();
      if (n) { batch.push(n); size += len; }
    }
    const body = { notes: batch };
    if (first && s.notebooksDirty) Object.assign(body, { notebooks: s.notebooks, notebooksAt: s.notebooksAt });
    first = false;
    const res = await request("PUT", body, "/api/notes");
    ok = !!res?.saved;
    if (ok) {
      const now = readNotes();
      // Only clear what was sent and hasn't changed again since.
      now.dirty = now.dirty.filter((id) => !batch.some((b) => b.id === id && b.updatedAt === now.notes[id]?.updatedAt));
      if (body.notebooks && now.notebooksAt === body.notebooksAt) now.notebooksDirty = false;
      write(now);
    }
  }
  emit({ state: ok ? "saved" : "offline" });
  if (!ok) queueSync(30000); // try again later
}

/** Pull the cloud copy once, merge it, then push what's newer here. */
export function syncNotes() {
  if (isDemo()) return Promise.resolve(false);
  if (syncing) return syncing;
  syncing = (async () => {
    const remote = await request("GET", null, "/api/notes");
    if (!remote) return false;
    const before = JSON.stringify(readNotes().notes);
    const merged = mergeRemote(readNotes(), remote);
    write(merged);
    if (merged.dirty.length || merged.notebooksDirty) queueSync(200);
    return JSON.stringify(merged.notes) !== before;
  })().finally(() => { syncing = null; });
  return syncing;
}

// ── Note text ──────────────────────────────────────────────────────────────
/** Words in a note's HTML (for the word count). */
export function wordCount(html) {
  // Symbols like "&" (stored as &amp;) aren't words; an apostrophe stays inside one.
  const text = String(html || "").replace(/<[^>]+>/g, " ").replace(/&(#0*39|apos|rsquo);/gi, "'").replace(/&[a-z#0-9]+;/gi, " ");
  return (text.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) || []).length;
}

/** A plain-text preview of a note's first lines. */
export function snippet(html, max = 90) {
  const text = String(html || "").replace(/<\/(p|div|li|h2|h3|tr)>/gi, " ").replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}
