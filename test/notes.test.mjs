import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
beforeEach(() => {
  const m = new Map();
  globalThis.localStorage = { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), get length() { return m.size; }, key: (i) => [...m.keys()][i] ?? null };
  localStorage.setItem("ta_demo_mode", "1"); // device-only: no network in tests
});

test("first notebooks: one per course, plus General", async () => {
  const { starterNotebooks } = await import("../frontend/js/notes-store.js");
  const books = starterNotebooks([{ code: "SBI3U", title: "Biology" }, { code: "MHF4U", title: "Math" }, { code: "SBI3U-2", title: "Biology" }]);
  assert.deepEqual(books.map((b) => b.id), ["biology", "math", "general"]);
  assert.equal(books[0].course, "SBI3U");
});

test("notes save on the device, list newest first, and delete as tombstones", async () => {
  const { saveNote, listNotes, deleteNote, readNotes, getNote } = await import("../frontend/js/notes-store.js");
  saveNote({ id: "note-aaaa1111", notebook: "biology", title: "Cell cycle", body: "<p>a</p>" });
  await new Promise((r) => setTimeout(r, 5));
  saveNote({ id: "note-bbbb2222", notebook: "math", title: "Limits", body: "<p>b</p>", favorite: true });
  assert.deepEqual(listNotes().map((n) => n.title), ["Limits", "Cell cycle"]);
  assert.deepEqual(listNotes({ notebook: "biology" }).map((n) => n.title), ["Cell cycle"]);
  assert.deepEqual(listNotes({ favourites: true }).map((n) => n.title), ["Limits"]);
  deleteNote("note-aaaa1111");
  assert.equal(getNote("note-aaaa1111"), null);
  assert.equal(readNotes().notes["note-aaaa1111"].deleted, true);
  assert.equal(readNotes().notes["note-aaaa1111"].body, "");
});

test("the newer edit wins when the cloud copy comes back", async () => {
  const { mergeRemote } = await import("../frontend/js/notes-store.js");
  const local = { notebooks: null, notebooksAt: null, dirty: [], notes: {
    a: { id: "a", title: "local newer", updatedAt: "2026-11-12T10:00:00.000Z" },
    b: { id: "b", title: "local older", updatedAt: "2026-11-10T10:00:00.000Z" },
  } };
  const remote = { notebooks: [{ id: "general", name: "General" }], notebooksAt: "2026-11-11T00:00:00Z", notes: [
    { id: "a", title: "cloud older", updatedAt: "2026-11-11T10:00:00.000Z" },
    { id: "b", title: "cloud newer", updatedAt: "2026-11-11T10:00:00.000Z" },
    { id: "c", title: "only in cloud", updatedAt: "2026-11-09T10:00:00.000Z" },
  ] };
  const m = mergeRemote(local, remote);
  assert.equal(m.notes.a.title, "local newer");
  assert.equal(m.notes.b.title, "cloud newer");
  assert.equal(m.notes.c.title, "only in cloud");
  assert.deepEqual(m.dirty, ["a"]); // the local-newer one goes back up
  assert.equal(m.notebooks[0].id, "general");
});

test("word count and preview read the note's text, not its tags", async () => {
  const { wordCount, snippet } = await import("../frontend/js/notes-store.js");
  assert.equal(wordCount("<h2>The Cell Cycle</h2><p>Cells <b>grow</b> &amp; divide.</p>"), 6);
  assert.equal(snippet("<h2>Title</h2><p>One&nbsp;two</p>"), "Title One two");
  assert.equal(wordCount("<p>don&#39;t stop</p>"), 2);
});

test("Notes is reachable from Guidance and backed up through the locked API", () => {
  assert.match(read("frontend/js/router.js"), /GUIDANCE_VIEWS = \[[^\]]*"notes"/);
  assert.match(read("frontend/js/app-main.js"), /arg === "notes"\) return renderNotes/);
  assert.match(read("frontend/js/guidance.js"), /notesButton\(\)/);
  assert.match(read("frontend/js/notes-store.js"), /"\/api\/notes"/);
  assert.match(read("worker/src/pages.js"), /\/api\/notes' && !url\.search\) return handleNotes/);
  const sql = read("supabase/notes.sql");
  assert.match(sql, /revoke all on public\.teachassist_notes from public, anon, authenticated/);
  assert.match(sql, /grant execute on function public\.ta_notes_load\(text\) to service_role/);
  assert.match(sql, /delete from public\.teachassist_notes where subject = p_subject/);
  assert.match(read("frontend/legal/privacy.html"), /class notes and notebooks/);
});

test("installed: no 'Install the App' row; volunteer hours have no upper limit", () => {
  const panel = read("frontend/js/settings-panel.js");
  assert.match(panel, /ROWS\.filter\(\(\[id\]\) => id !== "install" \|\| !isInstalled\(\)\)/);
  const vol = read("frontend/js/volunteer.js");
  assert.doesNotMatch(vol, /max="24"/);
  assert.doesNotMatch(vol, /entry\.hours > 24/);
});
