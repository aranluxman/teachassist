// ============================================================================
// Settings
// ----------------------------------------------------------------------------
// Shows the signed-in student number, a dark-theme toggle, a refresh action,
// the Worker connection settings, and Sign Out.
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
} from "./ta-client.js";

const THEME_KEY = "theme";
const APP_VERSION = "2.0.0";

/** Apply the saved theme on app boot (called from app.html). */
export function applyStoredTheme() {
  const dark = localStorage.getItem(THEME_KEY) === "dark";
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
}

/** Render the Settings screen. */
export async function renderSettings(container) {
  const isDark = localStorage.getItem(THEME_KEY) === "dark";
  container.innerHTML = "";
  container.appendChild(el(`<div class="screen-header"><h1>Settings</h1></div>`));

  // Account
  container.appendChild(el(`<div class="section-label">Account</div>`));
  container.appendChild(
    el(`
    <div class="rows">
      <div class="row" style="cursor:default">
        <div class="row-main">
          <div class="row-title">Signed in as</div>
          <div class="row-sub">Student #${escapeHtml(studentNumber() || "—")}</div>
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
          <div class="row-sub" id="refresh-sub">Re-scrape your latest marks</div>
        </div>
        <span class="chevron"></span>
      </button>
    </div>
  `);
  dataRows.querySelector("#refresh").addEventListener("click", async (e) => {
    const sub = e.currentTarget.querySelector("#refresh-sub");
    sub.textContent = "Refreshing…";
    try {
      const courses = await getCourses({ refresh: true });
      sub.textContent = `Updated — ${courses.length} course${courses.length === 1 ? "" : "s"}. Open the Courses tab.`;
    } catch (err) {
      sub.textContent = err.message || "Refresh failed.";
    }
  });
  container.appendChild(dataRows);

  // Appearance
  container.appendChild(el(`<div class="section-label">Appearance</div>`));
  const appearance = el(`
    <div class="rows">
      <div class="row" style="cursor:default">
        <div class="row-main">
          <div class="row-title">Dark theme</div>
          <div class="row-sub">Switch between light and dark mode</div>
        </div>
        <label class="switch">
          <input type="checkbox" id="theme-toggle" aria-label="Toggle dark theme" ${isDark ? "checked" : ""} />
        </label>
      </div>
    </div>
  `);
  appearance.querySelector("#theme-toggle").addEventListener("change", (e) => {
    const dark = e.target.checked;
    localStorage.setItem(THEME_KEY, dark ? "dark" : "light");
    document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
  });
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
