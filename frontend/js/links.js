// ============================================================================
// Links (Student Tools)
// ----------------------------------------------------------------------------
// An editable list of handy links. There is no links table in the database, so
// these are stored locally (localStorage), keyed per signed-in user, seeded
// from DEFAULT_LINKS on first use. Tapping a row opens the link in a new tab;
// tap "Edit" to rename / re-point / add / delete rows.
// ============================================================================

import { el, escapeHtml, openSheet, closeSheet } from "./courses.js";
import { getCurrentUser } from "./auth.js";
import { DEFAULT_LINKS, COURSE_COLORS } from "./config.js";

let editing = false;

function storageKey() {
  return "links:" + (getCurrentUser()?.id || "anon");
}

function loadLinks() {
  try {
    const raw = localStorage.getItem(storageKey());
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore corrupt storage */
  }
  const seeded = DEFAULT_LINKS.map((l) => ({ ...l }));
  saveLinks(seeded);
  return seeded;
}

function saveLinks(arr) {
  localStorage.setItem(storageKey(), JSON.stringify(arr));
}

/** Render the Links screen into `container`. */
export async function renderLinks(container) {
  const links = loadLinks();
  container.innerHTML = "";

  const header = el(`
    <div class="screen-header">
      <h1>Links</h1>
      <button class="btn ghost" style="width:auto;padding:6px 10px" id="links-edit">
        ${editing ? "Done" : "Edit"}
      </button>
    </div>
  `);
  container.appendChild(header);
  container.appendChild(el(`<div class="section-label">Student Tools</div>`));

  const rows = el(`<div class="rows"></div>`);
  links.forEach((link, i) => {
    const color = COURSE_COLORS[i % COURSE_COLORS.length];
    const letter = (link.label || "?").trim().charAt(0).toUpperCase();
    const row = el(`
      <button class="row">
        <div class="icon-circle" style="width:36px;height:36px;min-width:36px;font-size:15px;background:${color}">${escapeHtml(letter)}</div>
        <div class="row-main"><div class="row-title">${escapeHtml(link.label)}</div></div>
        <span class="chevron"></span>
      </button>
    `);
    row.addEventListener("click", () => {
      if (editing) {
        openLinkForm(links, i, container);
      } else {
        window.open(link.url, "_blank", "noopener");
      }
    });
    rows.appendChild(row);
  });
  container.appendChild(rows);

  if (editing) {
    const add = el(`<button class="btn secondary" style="margin-top:14px">+ Add Link</button>`);
    add.addEventListener("click", () => openLinkForm(links, null, container));
    container.appendChild(add);

    const reset = el(`<button class="btn ghost" style="margin-top:8px">Reset to defaults</button>`);
    reset.addEventListener("click", () => {
      if (!confirm("Reset the links list to the defaults?")) return;
      saveLinks(DEFAULT_LINKS.map((l) => ({ ...l })));
      renderLinks(container);
    });
    container.appendChild(reset);
  }

  header.querySelector("#links-edit").addEventListener("click", () => {
    editing = !editing;
    renderLinks(container);
  });
}

/** Add (index = null) or edit a link row. */
function openLinkForm(links, index, container) {
  const link = index != null ? links[index] : { label: "", url: "" };
  const body = el(`
    <form>
      <div class="field">
        <label>Label</label>
        <input name="label" value="${escapeHtml(link.label)}" placeholder="My Pathway Planner" required />
      </div>
      <div class="field">
        <label>URL</label>
        <input name="url" type="url" value="${escapeHtml(link.url)}" placeholder="https://example.com" required />
      </div>
      <div class="error-text"></div>
      <div class="form-actions">
        <button type="submit" class="btn">${index != null ? "Save Changes" : "Add Link"}</button>
        ${index != null ? '<button type="button" class="btn danger" data-delete>Delete</button>' : ""}
        <button type="button" class="btn ghost" data-cancel>Cancel</button>
      </div>
    </form>
  `);

  body.querySelector("[data-cancel]").addEventListener("click", closeSheet);
  if (index != null) {
    body.querySelector("[data-delete]").addEventListener("click", () => {
      links.splice(index, 1);
      saveLinks(links);
      closeSheet();
      renderLinks(container);
    });
  }

  body.addEventListener("submit", (e) => {
    e.preventDefault();
    const f = new FormData(body);
    let url = f.get("url").trim();
    if (url && !/^https?:\/\//i.test(url)) url = "https://" + url; // be forgiving
    const entry = { label: f.get("label").trim(), url };
    if (!entry.label || !entry.url) {
      body.querySelector(".error-text").textContent = "Label and URL are required.";
      return;
    }
    if (index != null) links[index] = entry;
    else links.push(entry);
    saveLinks(links);
    closeSheet();
    renderLinks(container);
  });

  openSheet(index != null ? "Edit Link" : "Add Link", body);
}
