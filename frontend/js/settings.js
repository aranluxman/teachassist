// ============================================================================
// Settings
// ----------------------------------------------------------------------------
// Shows the signed-in student number (or demo state), the theme picker,
// a refresh action, the Worker connection settings, and Sign Out.
// ============================================================================

import { el, escapeHtml } from "./courses.js";
import {
  studentNumber,
  signOut,
  getCourses,
  workerUrl,
  setWorkerUrl,
  apiKey,
  setApiKey,
  isDemo,
} from "./ta-client.js";

const THEME_KEY = "theme";
const APP_VERSION = "3.0.0";

// Selectable colour themes. Every accent keeps AA contrast when used as text
// (dark-on-light for the light themes, light-on-dark for the dark themes).
export const THEMES = [
  { id: "indigo", name: "Indigo", color: "#4338ca" },
  { id: "ocean", name: "Ocean", color: "#0e7490" },
  { id: "sunset", name: "Sunset", color: "#c2410c" },
  { id: "rose", name: "Rose", color: "#be123c" },
  { id: "forest", name: "Forest", color: "#15803d" },
  { id: "grape", name: "Grape", color: "#6d28d9" },
  { id: "slate", name: "Slate", color: "#334155" },
  { id: "dark", name: "Dark", color: "#1a1c22" },
  { id: "midnight", name: "Midnight", color: "#14203a" },
];

function currentTheme() {
  const t = localStorage.getItem(THEME_KEY);
  // Migrate the old light/dark values.
  if (t === "light" || !t) return "indigo";
  return THEMES.some((x) => x.id === t) ? t : "indigo";
}

function applyTheme(id) {
  document.documentElement.setAttribute("data-theme", id);
  // Keep the browser/OS chrome colour in step with the theme's top wash.
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    const wash = getComputedStyle(document.documentElement)
      .getPropertyValue("--bg-tint-top")
      .trim();
    if (wash) meta.setAttribute("content", wash);
  }
}

/** Apply the saved theme on app boot (called from app.html). */
export function applyStoredTheme() {
  applyTheme(currentTheme());
}

/** Render the Settings screen. */
export async function renderSettings(container) {
  container.innerHTML = "";
  container.appendChild(el(`<div class="screen-header"><h1>Settings</h1></div>`));

  // Account
  container.appendChild(el(`<div class="section-label">Account</div>`));
  container.appendChild(
    el(`
    <div class="rows">
      <div class="row" style="cursor:default">
        <div class="row-main">
          <div class="row-title">${isDemo() ? "Demo mode" : "Signed in as"}</div>
          <div class="row-sub">${
            isDemo()
              ? "Browsing the bundled TeachAssist snapshot — sign out to use your real login."
              : `Student #${escapeHtml(studentNumber() || "—")}`
          }</div>
        </div>
      </div>
    </div>
  `)
  );

  // Data — refresh now
  container.appendChild(el(`<div class="section-label">Data</div>`));
  const dataRows = el(`
    <div class="rows">
      <button class="row" id="refresh">
        <div class="row-main">
          <div class="row-title">Refresh from TeachAssist</div>
          <div class="row-sub" id="refresh-sub">${
            isDemo() ? "Demo data is bundled — nothing to re-scrape." : "Re-scrape your latest marks"
          }</div>
        </div>
        <span class="chevron"></span>
      </button>
    </div>
  `);
  dataRows.querySelector("#refresh").addEventListener("click", async (e) => {
    const sub = e.currentTarget.querySelector("#refresh-sub");
    if (isDemo()) {
      sub.textContent = "Demo data is bundled — nothing to re-scrape.";
      return;
    }
    sub.textContent = "Refreshing…";
    try {
      const courses = await getCourses({ refresh: true });
      sub.textContent = `Updated — ${courses.length} course${courses.length === 1 ? "" : "s"}. Open the Courses tab.`;
    } catch (err) {
      sub.textContent = err.message || "Refresh failed.";
    }
  });
  container.appendChild(dataRows);

  // Appearance — theme picker
  container.appendChild(el(`<div class="section-label">Theme</div>`));
  const active = currentTheme();
  const appearance = el(`
    <div class="card">
      <div class="theme-swatches">
        ${THEMES.map(
          (t) =>
            `<button class="swatch ${t.id === active ? "active" : ""}" data-theme-id="${t.id}" title="${escapeHtml(t.name)}" aria-label="${escapeHtml(t.name)} theme" style="background:${t.color}"></button>`
        ).join("")}
      </div>
      <div class="muted small" id="theme-name" style="margin-top:10px">${escapeHtml(
        THEMES.find((t) => t.id === active)?.name || "Indigo"
      )}</div>
    </div>
  `);
  appearance.querySelectorAll(".swatch").forEach((sw) =>
    sw.addEventListener("click", () => {
      const id = sw.dataset.themeId;
      localStorage.setItem(THEME_KEY, id);
      applyTheme(id);
      appearance.querySelectorAll(".swatch").forEach((s) =>
        s.classList.toggle("active", s.dataset.themeId === id)
      );
      appearance.querySelector("#theme-name").textContent =
        THEMES.find((t) => t.id === id)?.name || "";
    })
  );
  container.appendChild(appearance);

  // Worker connection
  container.appendChild(el(`<div class="section-label">Worker</div>`));
  const conn = el(`
    <div class="card">
      <div class="field">
        <label for="w-url">Worker URL</label>
        <input id="w-url" type="url" autocapitalize="off" spellcheck="false" value="${escapeHtml(workerUrl())}" />
      </div>
      <div class="field">
        <label for="w-key">API key</label>
        <input id="w-key" type="password" autocomplete="off" value="${escapeHtml(apiKey())}" />
      </div>
      <div id="w-status" class="error-text" style="color:var(--good)"></div>
      <button class="btn secondary" id="w-save">Save connection</button>
    </div>
  `);
  conn.querySelector("#w-save").addEventListener("click", () => {
    setWorkerUrl(conn.querySelector("#w-url").value);
    setApiKey(conn.querySelector("#w-key").value);
    conn.querySelector("#w-status").textContent = "Saved on this device.";
  });
  container.appendChild(conn);

  // Sign out
  const out = el(`<button class="btn danger" style="margin-top:26px">Sign Out</button>`);
  out.addEventListener("click", () => {
    if (confirm("Sign out? Your saved login will be cleared from this device.")) signOut();
  });
  container.appendChild(out);

  container.appendChild(
    el(`<div class="muted small" style="text-align:center;margin-top:18px">TeachAssist Dashboard · v${APP_VERSION}</div>`)
  );
}
