// ============================================================================
// Notes — Guidance → Notes (#guidance/notes)
// ----------------------------------------------------------------------------
// Notebooks (one per course + General) on the left, the note being written in
// the middle, today's classes and note tools on the right. On a phone the list
// opens into a full-screen editor. Notes save as you type, on this device at
// once and to the student's account a moment later (notes-store.js).
// ============================================================================

import { el, escapeHtml, openSheet, closeSheet, courseLabel, courseTitle } from "./courses.js";
import { GLYPHS } from "./ui-kit.js";
import { getCourses, isDemo } from "./ta-client.js";
import { preferences } from "./personalization.js";
import { splitByTerm } from "./term.js";
import { todaysClasses } from "./schedule.js";
import {
  NOTEBOOK_COLOURS, deleteNote, ensureNotebooks, getNote, listNotes, newId, readNotes,
  saveNote, saveNotebooks, slug, snippet, syncNotes, wordCount,
} from "./notes-store.js";

const svg = (paths, extra = "") =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${paths}</svg>`;
const I = {
  folder: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7.2A2.2 2.2 0 0 1 5.2 5h4.1l2 2.2h7.5A2.2 2.2 0 0 1 21 9.4v8.4a2.2 2.2 0 0 1-2.2 2.2H5.2A2.2 2.2 0 0 1 3 17.8z" fill="currentColor"/><path d="M3 10h18" stroke="#fff" stroke-opacity=".35" stroke-width="1.2"/></svg>',
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  more: svg('<circle cx="5" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.6" fill="currentColor" stroke="none"/>'),
  star: svg('<path d="m12 3.5 2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 16.8l-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z"/>'),
  leaf: svg('<path d="M5 19c0-8 5-13 15-14-1 10-6 15-14 15"/><path d="M5 19 14 10"/>'),
  bold: svg('<path d="M7 5h6a3.5 3.5 0 0 1 0 7H7zM7 12h7a3.5 3.5 0 0 1 0 7H7z"/>', 'stroke-width="2.4"'),
  italic: svg('<path d="M14 5h-4M14 19h-4M14 5l-4 14"/>'),
  underline: svg('<path d="M7 4v7a5 5 0 0 0 10 0V4M5 20h14"/>'),
  marker: svg('<path d="m15 4 5 5-9 9H6v-5z"/><path d="M4 21h16" stroke="#facc15" stroke-width="3"/>'),
  heading: svg('<path d="M6 5v14M18 5v14M6 12h12"/>'),
  bullets: svg('<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1.2" fill="currentColor"/><circle cx="4.5" cy="12" r="1.2" fill="currentColor"/><circle cx="4.5" cy="18" r="1.2" fill="currentColor"/>'),
  numbers: svg('<path d="M10 6h10M10 12h10M10 18h10M4 5h1.5v4M4 14.5c.4-.6 2.4-.9 2.2.6-.1.9-2.2 2-2.2 2.9h2.4"/>'),
  check: svg('<rect x="3.5" y="4.5" width="6" height="6" rx="1.5"/><path d="m4.8 7.6 1.4 1.4 2.3-2.6M13 7.5h7.5M13 16.5h7.5"/><rect x="3.5" y="13.5" width="6" height="6" rx="1.5"/>'),
  table: svg('<rect x="3.5" y="4.5" width="17" height="15" rx="2"/><path d="M3.5 9.5h17M3.5 14.5h17M9.5 9.5v10M15 9.5v10"/>'),
  alignLeft: svg('<path d="M4 6h16M4 10.5h10M4 15h16M4 19.5h10"/>'),
  alignCenter: svg('<path d="M4 6h16M7 10.5h10M4 15h16M7 19.5h10"/>'),
  clear: svg('<path d="M6 5h12M12 5 9 19M4 20 20 4"/>'),
  calendar: svg('<rect x="3.5" y="5" width="17" height="15.5" rx="2.5"/><path d="M3.5 9.5h17M8 3v4M16 3v4"/>'),
  copy: svg('<rect x="8" y="8" width="12" height="12" rx="2.5"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>'),
  layers: svg('<path d="m12 3 9 5-9 5-9-5z"/><path d="m3 13 9 5 9-5"/>'),
  tag: svg('<path d="M3.5 12.6V4.5h8.1l8.9 8.9-8.1 8.1z"/><circle cx="8" cy="9" r="1.4"/>'),
  link: svg('<path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1"/>'),
  print: svg('<path d="M7 9V3.5h10V9M7 17H4.5A1.5 1.5 0 0 1 3 15.5v-5A1.5 1.5 0 0 1 4.5 9h15a1.5 1.5 0 0 1 1.5 1.5v5a1.5 1.5 0 0 1-1.5 1.5H17"/><rect x="7" y="14" width="10" height="7" rx="1"/>'),
  doc: svg('<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>'),
  back: svg('<path d="m15 5-7 7 7 7"/>', 'stroke-width="2.4"'),
  search: svg('<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>'),
  done: svg('<circle cx="12" cy="12" r="9" fill="currentColor" stroke="none"/><path d="m7.8 12.3 2.8 2.8 5.6-6" stroke="#fff" stroke-width="2.4"/>'),
};

// ── Safe HTML: notes keep formatting, never scripts, frames or pictures ────
const ALLOWED = new Set(["P", "BR", "DIV", "B", "STRONG", "I", "EM", "U", "S", "MARK", "SPAN", "H2", "H3", "UL", "OL", "LI", "BLOCKQUOTE", "TABLE", "THEAD", "TBODY", "TR", "TH", "TD", "HR", "A"]);
const DROP = new Set(["SCRIPT", "STYLE", "IFRAME", "OBJECT", "EMBED", "SVG", "MATH", "TEMPLATE", "NOSCRIPT", "LINK", "META", "IMG", "PICTURE", "VIDEO", "AUDIO", "CANVAS", "FORM", "INPUT", "BUTTON", "SELECT", "TEXTAREA", "HEAD", "TITLE"]);
const STYLED = new Set(["SPAN", "MARK", "P", "DIV", "H2", "H3", "LI", "TD", "TH"]);

/** Keep only formatting a note can hold. Runs in an inert document. */
export function sanitizeNote(html) {
  if (!html) return "";
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  const clean = (node) => {
    for (const child of [...node.childNodes]) {
      if (child.nodeType === 3) continue; // text
      if (child.nodeType !== 1) { child.remove(); continue; }
      const tag = child.tagName;
      if (DROP.has(tag)) { child.remove(); continue; }
      if (!ALLOWED.has(tag)) {
        clean(child);
        child.replaceWith(...child.childNodes);
        continue;
      }
      const keep = {};
      if (tag === "A") {
        const href = child.getAttribute("href") || "";
        if (/^(https?:|mailto:)/i.test(href)) Object.assign(keep, { href, target: "_blank", rel: "noopener" });
      }
      if (tag === "LI" && /^(true|false)$/.test(child.getAttribute("data-checked") || "")) keep["data-checked"] = child.getAttribute("data-checked");
      if (tag === "UL" && child.classList.contains("nb-check")) keep.class = "nb-check";
      if (STYLED.has(tag)) {
        const bits = [];
        const bg = child.style.backgroundColor;
        if (bg && /^(rgba?\([\d\s.,%]+\)|#[0-9a-f]{3,8})$/i.test(bg)) bits.push(`background-color: ${bg}`);
        const align = child.style.textAlign;
        if (/^(left|center|right)$/.test(align)) bits.push(`text-align: ${align}`);
        if (bits.length) keep.style = bits.join("; ");
      }
      for (const a of [...child.attributes]) child.removeAttribute(a.name);
      for (const [k, v] of Object.entries(keep)) child.setAttribute(k, v);
      clean(child);
    }
  };
  clean(doc.body);
  return doc.body.innerHTML;
}

// ── Helpers ────────────────────────────────────────────────────────────────
const fmtWhen = (iso) => {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  return `${d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })} at ${d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
};
const fmtShort = (iso) => {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  return d.toDateString() === new Date().toDateString()
    ? d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
    : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

/** The student's courses as [{ code, title }] (this semester, no lunch). */
async function courseList() {
  try {
    let courses = await getCourses();
    if (preferences().currentTermOnly) courses = splitByTerm(courses).current;
    return courses
      .filter((c) => !/^\s*LUNCH/i.test(courseLabel(c)))
      .map((c) => ({ code: courseLabel(c), title: courseTitle(c) }));
  } catch {
    return [];
  }
}

// ── The screen ─────────────────────────────────────────────────────────────
export async function renderNotes(container) {
  container.innerHTML = "";
  const nav = el(`<div class="detail-nav"><button class="back-btn">Guidance</button><div class="detail-titlewrap"><div class="detail-title">Notes</div><div class="detail-subtitle">Saved as you type</div></div><div></div></div>`);
  nav.querySelector(".back-btn").onclick = () => window.AppNav.toGuidance();
  container.append(nav);

  const courses = await courseList();
  if (!container.isConnected) return;
  ensureNotebooks(courses);

  const app = el(`<div class="nb-app" data-view="list">
    <aside class="nb-side">
      <section class="card nb-books-card" aria-labelledby="nb-books-h">
        <div class="nb-card-head"><h2 id="nb-books-h">My Notebooks</h2><button type="button" class="nb-round" data-add-book aria-label="New notebook">${I.plus}</button></div>
        <ul class="nb-books" role="list"></ul>
      </section>
      <section class="card nb-list-card" aria-labelledby="nb-list-h">
        <div class="nb-card-head"><h2 id="nb-list-h">All notes</h2><button type="button" class="nb-round" data-book-menu aria-label="Notebook options" hidden>${I.more}</button><button type="button" class="nb-new" data-new>${I.plus}<span>New note</span></button></div>
        <label class="nb-search">${I.search}<span class="sr-only">Search notes</span><input type="search" placeholder="Search notes" autocomplete="off"></label>
        <ul class="nb-notes" role="list"></ul>
      </section>
    </aside>
    <section class="card nb-editor" aria-label="Note"></section>
    <aside class="nb-aside">
      <section class="card nb-sched" aria-labelledby="nb-sched-h">
        <div class="nb-card-head"><span class="nb-head-icon">${I.calendar}</span><h2 id="nb-sched-h">Class Schedule</h2></div>
        <p class="nb-today"></p>
        <ul class="nb-classes" role="list"></ul>
        <button type="button" class="nb-tool-row" data-copy-schedule>${I.copy}<span>Copy schedule into note</span>${GLYPHS.chevron}</button>
      </section>
      <section class="card nb-tools" aria-labelledby="nb-tools-h">
        <div class="nb-card-head"><span class="nb-head-icon">${I.layers}</span><h2 id="nb-tools-h">Note Tools</h2></div>
        <button type="button" class="nb-tool-row" data-tool="fav">${I.star}<span>Add to favourites</span>${GLYPHS.chevron}</button>
        <button type="button" class="nb-tool-row" data-tool="tags">${I.tag}<span>Add tags</span>${GLYPHS.chevron}</button>
        <button type="button" class="nb-tool-row" data-tool="course">${I.link}<span>Link to a course</span>${GLYPHS.chevron}</button>
        <button type="button" class="nb-tool-row" data-tool="print">${I.print}<span>Print / Export (PDF)</span>${GLYPHS.chevron}</button>
        <button type="button" class="nb-tool-row" data-tool="copy">${I.doc}<span>Copy note text</span>${GLYPHS.chevron}</button>
      </section>
    </aside>
  </div>`);
  container.append(app);

  const ui = {
    book: "all", // "all", "favourites" or a notebook id
    query: "",
    noteId: null,
  };
  const books = () => readNotes().notebooks || [];
  const bookOf = (id) => books().find((b) => b.id === id) || { id: "general", name: "General", color: "#64748b" };

  // ── Left: notebooks and notes ────────────────────────────────────────────
  const drawBooks = () => {
    const ul = app.querySelector(".nb-books");
    const all = listNotes();
    const rows = [
      { id: "all", name: "All notes", color: "var(--accent)", count: all.length, fixed: true },
      { id: "favourites", name: "Favourites", color: "#eab308", count: all.filter((n) => n.favorite).length, fixed: true, star: true },
      ...books().map((b) => ({ ...b, count: all.filter((n) => n.notebook === b.id).length })),
    ];
    ul.replaceChildren(...rows.map((b) => {
      const li = el(`<li class="nb-book${ui.book === b.id ? " is-active" : ""}">
        <button type="button" class="nb-book-main" aria-current="${ui.book === b.id}">
          <span class="nb-folder" style="color:${escapeHtml(b.color || "#64748b")}">${b.star ? I.star : I.folder}</span>
          <span class="nb-book-text"><b></b><small>${b.count} note${b.count === 1 ? "" : "s"}</small></span>
        </button>
        ${b.fixed ? "" : `<button type="button" class="nb-dots" aria-label="Options for ${escapeHtml(b.name)}">${I.more}</button>`}
      </li>`);
      li.querySelector("b").textContent = b.name;
      li.querySelector(".nb-book-main").onclick = () => { ui.book = b.id; drawAll(); };
      li.querySelector(".nb-dots")?.addEventListener("click", () => bookMenu(b));
      return li;
    }));
  };

  const drawList = () => {
    const title = ui.book === "all" ? "All notes" : ui.book === "favourites" ? "Favourites" : bookOf(ui.book).name;
    app.querySelector("#nb-list-h").textContent = title;
    const menu = app.querySelector("[data-book-menu]");
    const real = books().find((b) => b.id === ui.book);
    menu.hidden = !real;
    if (real) {
      menu.setAttribute("aria-label", `Options for ${real.name}`);
      menu.onclick = () => bookMenu(real);
    }
    const q = ui.query.trim().toLowerCase();
    const notes = listNotes(ui.book === "all" ? {} : ui.book === "favourites" ? { favourites: true } : { notebook: ui.book })
      .filter((n) => !q || `${n.title} ${snippet(n.body, 2000)} ${(n.tags || []).join(" ")}`.toLowerCase().includes(q));
    const ul = app.querySelector(".nb-notes");
    if (!notes.length) {
      ul.replaceChildren(el(`<li class="nb-empty">${q ? "No notes match your search." : "No notes here yet. Tap <b>New note</b> to start one."}</li>`));
      return;
    }
    ul.replaceChildren(...notes.map((n) => {
      const book = bookOf(n.notebook);
      const li = el(`<li><button type="button" class="nb-note${ui.noteId === n.id ? " is-active" : ""}">
        <span class="nb-note-dot" style="background:${escapeHtml(book.color || "#64748b")}"></span>
        <span class="nb-note-text"><b></b><small></small></span>
        <span class="nb-note-side"><time></time>${n.favorite ? `<span class="nb-note-star" aria-label="Favourite">${I.star}</span>` : ""}</span>
      </button></li>`);
      li.querySelector("b").textContent = n.title || "Untitled note";
      li.querySelector("small").textContent = snippet(n.body) || book.name;
      li.querySelector("time").textContent = fmtShort(n.updatedAt);
      li.querySelector("button").onclick = () => openNote(n.id);
      return li;
    }));
  };

  // ── Notebook menu: rename, recolour, delete ──────────────────────────────
  const bookMenu = (b) => {
    const body = el(`<form class="nb-sheet">
      <div class="field"><label for="nb-book-name">Name</label><input id="nb-book-name" maxlength="40" required></div>
      <div class="nb-swatches" role="radiogroup" aria-label="Colour">${NOTEBOOK_COLOURS.map((c) => `<button type="button" role="radio" aria-checked="${c === b.color}" aria-label="Colour" data-colour="${c}" style="background:${c}"></button>`).join("")}</div>
      <button class="btn">Save notebook</button>
      <button type="button" class="btn ghost nb-danger" data-delete>Delete notebook</button>
      <p class="small muted">Deleting a notebook moves its notes to General.</p>
    </form>`);
    body.querySelector("input").value = b.name;
    let colour = b.color;
    body.querySelectorAll("[data-colour]").forEach((s) => (s.onclick = () => {
      colour = s.dataset.colour;
      body.querySelectorAll("[data-colour]").forEach((x) => x.setAttribute("aria-checked", String(x === s)));
    }));
    body.onsubmit = (e) => {
      e.preventDefault();
      const name = body.querySelector("input").value.trim();
      if (!name) return;
      saveNotebooks(books().map((x) => (x.id === b.id ? { ...x, name, color: colour } : x)));
      closeSheet();
      drawAll();
    };
    body.querySelector("[data-delete]").onclick = () => {
      if (b.id === "general") return void (body.querySelector("p").textContent = "General can't be deleted: it's where notes go when their notebook is removed.");
      for (const n of listNotes({ notebook: b.id })) saveNote({ ...n, notebook: "general" });
      const list = books().filter((x) => x.id !== b.id);
      if (!list.some((x) => x.id === "general")) list.push({ id: "general", name: "General", color: "#64748b", course: "" });
      saveNotebooks(list);
      if (ui.book === b.id) ui.book = "all";
      closeSheet();
      drawAll();
    };
    openSheet(b.name, body);
  };

  app.querySelector("[data-add-book]").onclick = () => {
    const body = el(`<form class="nb-sheet"><div class="field"><label for="nb-new-book">Notebook name</label><input id="nb-new-book" maxlength="40" required placeholder="e.g. Exam review"></div><button class="btn">Create notebook</button></form>`);
    body.onsubmit = (e) => {
      e.preventDefault();
      const name = body.querySelector("input").value.trim();
      if (!name) return;
      let id = slug(name);
      while (books().some((b) => b.id === id)) id = `${slug(name).slice(0, 40)}-${Math.random().toString(36).slice(2, 6)}`;
      saveNotebooks([...books(), { id, name, color: NOTEBOOK_COLOURS[books().length % NOTEBOOK_COLOURS.length], course: "" }]);
      ui.book = id;
      closeSheet();
      drawAll();
    };
    openSheet("New notebook", body);
    setTimeout(() => body.querySelector("input")?.focus(), 50);
  };

  app.querySelector(".nb-search input").addEventListener("input", (e) => {
    ui.query = e.target.value;
    drawList();
  });

  // ── Middle: the editor ───────────────────────────────────────────────────
  const editor = app.querySelector(".nb-editor");
  let saveTimer = null;
  let current = null; // the note being edited

  const status = (text) => {
    const s = editor.querySelector(".nb-saved span");
    if (s) s.textContent = text;
  };
  const flush = () => {
    if (!current) return;
    clearTimeout(saveTimer);
    const body = editor.querySelector(".nb-body");
    const title = editor.querySelector(".nb-title");
    if (!body || !title) return;
    try {
      current = saveNote({ ...current, title: title.value.trim(), body: sanitizeNote(body.innerHTML) });
      status(isDemo() ? "Saved on this device" : "Saved automatically");
    } catch {
      status("Couldn't save: this device's storage is full");
    }
    drawBooks();
    drawList();
  };
  const changed = () => {
    status("Saving…");
    editor.querySelector(".nb-words").textContent = `Word count: ${wordCount(editor.querySelector(".nb-body").innerHTML)}`;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, 500);
  };

  const emptyEditor = () => {
    current = null;
    ui.noteId = null;
    editor.innerHTML = `<div class="nb-blank">${I.leaf}<h2>Pick a note, or start a new one</h2><p class="muted">Notes save as you type. They're kept on this device and backed up to your account.</p><button type="button" class="btn" data-new>${I.plus.replace("<svg", '<svg width="18" height="18"')}New note</button></div>`;
    editor.querySelector("[data-new]").onclick = () => newNote();
  };

  const drawMeta = () => {
    const book = bookOf(current.notebook);
    const meta = editor.querySelector(".nb-meta");
    const bits = [book.name, fmtWhen(current.updatedAt || current.createdAt)];
    if (current.course) bits.push(`Linked to ${current.course}`);
    meta.textContent = bits.filter(Boolean).join(" • ");
    editor.querySelector(".nb-ed-icon").style.setProperty("--c", book.color || "#64748b");
    const fav = editor.querySelector("[data-fav]");
    fav.setAttribute("aria-pressed", String(!!current.favorite));
    fav.setAttribute("aria-label", current.favorite ? "Remove from favourites" : "Add to favourites");
    const tags = editor.querySelector(".nb-tags");
    tags.replaceChildren(...(current.tags || []).map((t) => {
      const chip = el(`<span class="nb-tag"></span>`);
      chip.textContent = `#${t}`;
      return chip;
    }));
    app.querySelector('[data-tool="fav"] span').textContent = current.favorite ? "Remove from favourites" : "Add to favourites";
  };

  const exec = (cmd, value = null) => {
    editor.querySelector(".nb-body").focus();
    document.execCommand(cmd, false, value);
    changed();
  };
  const insertHtml = (html) => exec("insertHTML", html);

  function openNote(id) {
    if (current && current.id !== id) flush();
    const note = getNote(id);
    if (!note) return emptyEditor();
    current = note;
    ui.noteId = id;
    app.dataset.view = "editor";
    editor.innerHTML = `
      <header class="nb-ed-head">
        <button type="button" class="nb-round nb-back" aria-label="Back to notes">${I.back}</button>
        <span class="nb-ed-icon" aria-hidden="true">${I.leaf}</span>
        <div class="nb-ed-titles">
          <label class="sr-only" for="nb-title">Title</label>
          <input id="nb-title" class="nb-title" maxlength="200" placeholder="Untitled note" autocomplete="off">
          <p class="nb-meta"></p>
          <div class="nb-tags"></div>
        </div>
        <button type="button" class="nb-round" data-fav aria-pressed="false">${I.star}</button>
        <button type="button" class="nb-round" data-note-more aria-label="More note options">${I.more}</button>
      </header>
      <div class="nb-toolbar" role="toolbar" aria-label="Formatting">
        <button type="button" data-cmd="bold" aria-label="Bold">${I.bold}</button>
        <button type="button" data-cmd="italic" aria-label="Italic">${I.italic}</button>
        <button type="button" data-cmd="underline" aria-label="Underline">${I.underline}</button>
        <span class="nb-sep" aria-hidden="true"></span>
        <button type="button" data-do="highlight" aria-label="Highlight">${I.marker}</button>
        <button type="button" data-do="heading" aria-label="Heading">${I.heading}</button>
        <span class="nb-sep" aria-hidden="true"></span>
        <button type="button" data-cmd="justifyLeft" aria-label="Align left">${I.alignLeft}</button>
        <button type="button" data-cmd="justifyCenter" aria-label="Centre">${I.alignCenter}</button>
        <span class="nb-sep" aria-hidden="true"></span>
        <button type="button" data-cmd="insertUnorderedList" aria-label="Bulleted list">${I.bullets}</button>
        <button type="button" data-cmd="insertOrderedList" aria-label="Numbered list">${I.numbers}</button>
        <button type="button" data-do="checklist" aria-label="Checklist">${I.check}</button>
        <button type="button" data-do="table" aria-label="Insert table">${I.table}</button>
        <span class="nb-sep" aria-hidden="true"></span>
        <button type="button" data-cmd="removeFormat" aria-label="Clear formatting">${I.clear}</button>
      </div>
      <div class="nb-body" contenteditable="true" role="textbox" aria-multiline="true" aria-label="Note text" data-placeholder="Start writing…" spellcheck="true"></div>
      <footer class="nb-foot"><span class="nb-saved">${I.done}<span>${isDemo() ? "Saved on this device" : "Saved automatically"}</span></span><span class="nb-words"></span></footer>`;
    const title = editor.querySelector(".nb-title");
    const body = editor.querySelector(".nb-body");
    title.value = note.title || "";
    body.innerHTML = sanitizeNote(note.body);
    editor.querySelector(".nb-words").textContent = `Word count: ${wordCount(note.body)}`;
    drawMeta();
    title.addEventListener("input", changed);
    title.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); body.focus(); } });
    body.addEventListener("input", changed);
    body.addEventListener("blur", flush);
    // Pasted text keeps simple formatting only.
    body.addEventListener("paste", (e) => {
      const html = e.clipboardData?.getData("text/html");
      const text = e.clipboardData?.getData("text/plain") || "";
      e.preventDefault();
      insertHtml(html ? sanitizeNote(html) : escapeHtml(text).replace(/\n/g, "<br>"));
    });
    // Tick a checklist item by tapping its box.
    body.addEventListener("click", (e) => {
      const li = e.target.closest?.("ul.nb-check > li");
      if (!li) return;
      const r = li.getBoundingClientRect();
      if (e.clientX - r.left > 30) return;
      li.dataset.checked = String(li.dataset.checked !== "true");
      changed();
    });
    // The toolbar keeps the text selection (mousedown would steal focus).
    editor.querySelectorAll(".nb-toolbar button").forEach((b) => {
      b.addEventListener("mousedown", (e) => e.preventDefault());
      b.addEventListener("click", () => {
        if (b.dataset.cmd) return exec(b.dataset.cmd);
        if (b.dataset.do === "highlight") return exec("hiliteColor", "#fde68a");
        if (b.dataset.do === "heading") {
          const inHeading = /^h[23]$/i.test(document.queryCommandValue("formatBlock") || "");
          return exec("formatBlock", inHeading ? "p" : "h2");
        }
        if (b.dataset.do === "checklist") return insertHtml('<ul class="nb-check"><li data-checked="false">To do</li></ul><p><br></p>');
        if (b.dataset.do === "table") {
          const row = (cell) => `<tr>${cell.repeat(3)}</tr>`;
          return insertHtml(`<table><thead>${row("<th>Heading</th>")}</thead><tbody>${row("<td><br></td>")}${row("<td><br></td>")}</tbody></table><p><br></p>`);
        }
      });
    });
    editor.querySelector(".nb-back").onclick = () => { flush(); app.dataset.view = "list"; drawList(); };
    editor.querySelector("[data-fav]").onclick = () => toggleFav();
    editor.querySelector("[data-note-more]").onclick = () => noteMenu();
    drawBooks();
    drawList();
    if (!note.title && !note.body) setTimeout(() => title.focus(), 30);
  }

  function newNote(extra = {}) {
    if (current) flush();
    const notebook = !["all", "favourites"].includes(ui.book) ? ui.book : "general";
    const book = bookOf(notebook);
    const note = saveNote({ id: newId(), notebook, course: book.course || "", title: "", body: "", ...extra });
    openNote(note.id);
    return note;
  }
  app.querySelectorAll("[data-new]").forEach((b) => (b.onclick = () => newNote()));

  // ── Note tools ───────────────────────────────────────────────────────────
  const needNote = () => current || newNote();
  const toggleFav = () => {
    const n = needNote();
    flush();
    current = saveNote({ ...current, favorite: !n.favorite });
    drawMeta();
    drawBooks();
    drawList();
  };

  const tagSheet = () => {
    needNote();
    flush();
    const body = el(`<form class="nb-sheet"><div class="field"><label for="nb-tag-in">Add a tag</label><input id="nb-tag-in" maxlength="30" placeholder="e.g. exam, lab, review" autocomplete="off"></div><div class="nb-tags nb-tags-edit"></div><button class="btn">Add tag</button></form>`);
    const draw = () => body.querySelector(".nb-tags").replaceChildren(...(current.tags || []).map((t) => {
      const chip = el(`<button type="button" class="nb-tag" aria-label="Remove tag ${escapeHtml(t)}"></button>`);
      chip.textContent = `#${t} ✕`;
      chip.onclick = () => { current = saveNote({ ...current, tags: current.tags.filter((x) => x !== t) }); draw(); drawMeta(); };
      return chip;
    }));
    body.onsubmit = (e) => {
      e.preventDefault();
      const t = body.querySelector("input").value.trim().replace(/^#/, "").slice(0, 30);
      if (!t || (current.tags || []).includes(t) || (current.tags || []).length >= 20) return;
      current = saveNote({ ...current, tags: [...(current.tags || []), t] });
      body.querySelector("input").value = "";
      draw();
      drawMeta();
      drawList();
    };
    draw();
    openSheet("Tags", body);
  };

  const courseSheet = () => {
    needNote();
    flush();
    const body = el(`<div class="nb-sheet nb-pick"></div>`);
    const options = [{ code: "", title: "No course" }, ...courses];
    for (const c of options) {
      const b = el(`<button type="button" class="nb-tool-row" aria-pressed="${(current.course || "") === c.code}"><span></span>${current.course === c.code ? I.done : ""}</button>`);
      b.querySelector("span").textContent = c.code ? `${c.title} · ${c.code}` : c.title;
      b.onclick = () => {
        current = saveNote({ ...current, course: c.code });
        closeSheet();
        drawMeta();
      };
      body.append(b);
    }
    openSheet("Link to a course", body);
  };

  const noteMenu = () => {
    flush();
    const body = el(`<div class="nb-sheet"><div class="field"><label for="nb-move">Notebook</label><select id="nb-move"></select></div><button type="button" class="btn" data-move>Move note</button><button type="button" class="btn ghost nb-danger" data-del>Delete note</button></div>`);
    const sel = body.querySelector("select");
    for (const b of books()) {
      const o = el(`<option></option>`);
      o.value = b.id;
      o.textContent = b.name;
      o.selected = b.id === current.notebook;
      sel.append(o);
    }
    body.querySelector("[data-move]").onclick = () => {
      current = saveNote({ ...current, notebook: sel.value });
      closeSheet();
      drawMeta();
      drawAll();
    };
    body.querySelector("[data-del]").onclick = () => {
      const del = body.querySelector("[data-del]");
      if (del.dataset.sure !== "1") { del.dataset.sure = "1"; del.textContent = "Tap again to delete"; return; }
      deleteNote(current.id);
      closeSheet();
      emptyEditor();
      app.dataset.view = "list";
      drawAll();
    };
    openSheet("Note options", body);
  };

  const printNote = () => {
    if (!current) return;
    flush();
    const root = el(`<div id="nb-print-root"><h1></h1><p class="nb-print-meta"></p><div class="nb-print-body"></div></div>`);
    root.querySelector("h1").textContent = current.title || "Untitled note";
    root.querySelector(".nb-print-meta").textContent = `${bookOf(current.notebook).name} · ${fmtWhen(current.updatedAt)}`;
    root.querySelector(".nb-print-body").innerHTML = sanitizeNote(current.body);
    document.body.append(root);
    document.documentElement.classList.add("nb-printing");
    const done = () => { document.documentElement.classList.remove("nb-printing"); root.remove(); window.removeEventListener("afterprint", done); };
    window.addEventListener("afterprint", done);
    window.print();
    setTimeout(done, 1000);
  };

  const copyText = async (button) => {
    if (!current) return;
    flush();
    const text = `${current.title || "Untitled note"}\n\n${editor.querySelector(".nb-body")?.innerText || ""}`;
    try { await navigator.clipboard.writeText(text); button.querySelector("span").textContent = "Copied ✓"; }
    catch { button.querySelector("span").textContent = "Couldn't copy"; }
    setTimeout(() => (button.querySelector("span").textContent = "Copy note text"), 1600);
  };

  app.querySelectorAll("[data-tool]").forEach((b) => (b.onclick = () => {
    const t = b.dataset.tool;
    if (t === "fav") return toggleFav();
    if (t === "tags") return tagSheet();
    if (t === "course") return courseSheet();
    if (t === "print") return current ? printNote() : null;
    if (t === "copy") return copyText(b);
  }));

  // ── Right: today's classes ───────────────────────────────────────────────
  const today = new Date();
  app.querySelector(".nb-today").textContent = `Today – ${today.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}`;
  let classes = [];
  try { classes = await todaysClasses((await getCourses().catch(() => [])).filter((c) => !preferences().currentTermOnly || splitByTerm([c]).current.length)); }
  catch { classes = []; }
  const colourFor = (code) => books().find((b) => b.course === code)?.color || "#64748b";
  const classList = app.querySelector(".nb-classes");
  classList.replaceChildren(...(classes.length ? classes.map((c) => {
    const li = el(`<li><span class="nb-class-dot" style="background:${escapeHtml(colourFor(c.code))}"></span><time></time><b></b></li>`);
    li.querySelector("time").textContent = c.start || "—";
    li.querySelector("b").textContent = c.name;
    return li;
  }) : [el(`<li class="nb-empty">No classes found for this semester.</li>`)]));
  app.querySelector("[data-copy-schedule]").onclick = () => {
    const rows = classes.map((c) => `<tr><td>${escapeHtml(c.time || c.start || "")}</td><td>${escapeHtml(c.name)}</td><td>${escapeHtml(c.code)}</td></tr>`).join("");
    const html = `<h2>Class schedule – ${escapeHtml(today.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }))}</h2><table><thead><tr><th>Time</th><th>Class</th><th>Code</th></tr></thead><tbody>${rows}</tbody></table><p><br></p>`;
    if (!current) newNote({ title: `Class schedule – ${today.toLocaleDateString(undefined, { month: "short", day: "numeric" })}` });
    insertHtml(html);
    flush();
  };

  // ── Draw, then bring in the cloud copy ───────────────────────────────────
  function drawAll() {
    drawBooks();
    drawList();
    if (current) drawMeta();
  }
  emptyEditor();
  drawAll();
  // Open the newest note on wide screens, so the editor isn't empty.
  if (window.matchMedia?.("(min-width: 1100px)").matches) {
    const first = listNotes()[0];
    if (first) openNote(first.id);
  }
  syncNotes().then((changedRemote) => {
    if (!changedRemote || !container.isConnected) return;
    drawAll();
  });
  const onCloud = (e) => {
    if (!container.isConnected) return window.removeEventListener("ta:notes", onCloud);
    if (!current) return;
    if (e.detail.state === "offline") status("Saved on this device · backup will retry");
    else if (e.detail.state === "saved") status("Saved automatically");
  };
  window.addEventListener("ta:notes", onCloud);
  window.addEventListener("pagehide", flush, { once: true });
}
