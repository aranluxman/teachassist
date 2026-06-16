// ============================================================================
// Settings
// ----------------------------------------------------------------------------
// Shows the signed-in email, lets the user edit the term date range, toggle
// dark mode, and sign out.
// ============================================================================

import { getCurrentUser, signOut } from "./auth.js";
import {
  el,
  escapeHtml,
  fmtDate,
  getProfile,
  openTermEditor,
  skeletonCards,
} from "./courses.js";
import { getWorkerConfig, setWorkerConfig, fetchMarks } from "./marks-api.js";
import { SUPABASE_URL } from "./config.js";

const THEME_KEY = "theme";
const APP_VERSION = "1.1.0";

/** Apply the saved theme on app boot (called from app.html). */
export function applyStoredTheme() {
  const dark = localStorage.getItem(THEME_KEY) === "dark";
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
}

/** Render the Settings screen into `container`. */
export async function renderSettings(container) {
  const user = getCurrentUser();
  container.innerHTML = `<div class="screen-header"><h1>Settings</h1></div>${skeletonCards(3)}`;
  const profile = await getProfile(user.id);

  const termText =
    profile?.term_start && profile?.term_end
      ? `${fmtDate(profile.term_start)} to ${fmtDate(profile.term_end)}`
      : "Not set";
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
          <div class="row-sub">${escapeHtml(user.email || "")}</div>
        </div>
      </div>
    </div>
  `)
  );

  // Term
  container.appendChild(el(`<div class="section-label">Term</div>`));
  const termRows = el(`
    <div class="rows">
      <button class="row" id="edit-term">
        <div class="row-main"><div class="row-title">Term date range</div></div>
        <div class="row-sub" style="margin-right:6px">${escapeHtml(termText)}</div>
        <span class="chevron"></span>
      </button>
    </div>
  `);
  termRows
    .querySelector("#edit-term")
    .addEventListener("click", () =>
      // Refresh Settings after saving so the displayed range updates.
      openTermEditor(profile, () => renderSettings(container))
    );
  container.appendChild(termRows);

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

  // TeachAssist Sync (pull marks from the personal Worker) ------------------
  container.appendChild(el(`<div class="section-label">TeachAssist Sync</div>`));
  const cfg = getWorkerConfig();
  const sync = el(`
    <div class="card">
      <div class="field">
        <label for="ta-url">Worker URL</label>
        <input id="ta-url" type="url" inputmode="url" autocapitalize="off" autocorrect="off"
          spellcheck="false" placeholder="https://teachassist-marks.you.workers.dev"
          value="${escapeHtml(cfg.url)}" />
      </div>
      <div class="field">
        <label for="ta-key">API key (x-api-key)</label>
        <input id="ta-key" type="password" autocomplete="off" placeholder="your API_KEY secret"
          value="${escapeHtml(cfg.apiKey)}" />
      </div>
      <div class="muted small" style="margin:2px 2px 12px">
        Stored on this device only (not in the repo). The key just gates who can
        fetch your marks — it is not your TeachAssist password.
      </div>
      <div id="ta-status" class="error-text" style="color:var(--text-secondary)"></div>
      <div class="form-actions">
        <button id="ta-test" class="btn">Test connection</button>
        <button id="ta-save" class="btn secondary">Save</button>
      </div>
    </div>
  `);
  const urlEl = sync.querySelector("#ta-url");
  const keyEl = sync.querySelector("#ta-key");
  const statusEl = sync.querySelector("#ta-status");
  const persist = () => setWorkerConfig(urlEl.value, keyEl.value);

  sync.querySelector("#ta-save").addEventListener("click", () => {
    persist();
    statusEl.style.color = "var(--good)";
    statusEl.textContent = "Saved on this device.";
  });

  sync.querySelector("#ta-test").addEventListener("click", async (e) => {
    persist(); // test what's currently typed in
    const btn = e.currentTarget;
    btn.disabled = true;
    const label = btn.textContent;
    btn.innerHTML = '<span class="spinner"></span>';
    statusEl.style.color = "var(--text-secondary)";
    statusEl.textContent = "";
    try {
      const courses = await fetchMarks();
      const evalCount = courses.reduce(
        (n, c) => n + (Array.isArray(c.evaluations) ? c.evaluations.length : 0),
        0
      );
      statusEl.style.color = "var(--good)";
      statusEl.textContent = `✓ Fetched ${courses.length} course${courses.length === 1 ? "" : "s"} (${evalCount} evaluations).`;
    } catch (err) {
      statusEl.style.color = "var(--danger)";
      statusEl.textContent = err.message || "Could not reach the Worker.";
    } finally {
      btn.disabled = false;
      btn.textContent = label;
    }
  });
  container.appendChild(sync);

  // About
  container.appendChild(el(`<div class="section-label">About</div>`));
  container.appendChild(
    el(`
    <div class="rows">
      <div class="row" style="cursor:default">
        <div class="row-main">
          <div class="row-title">Version</div>
          <div class="row-sub">${APP_VERSION}</div>
        </div>
      </div>
      <a class="row" href="${escapeHtml(SUPABASE_URL)}" target="_blank" rel="noopener">
        <div class="row-main">
          <div class="row-title">Supabase project</div>
          <div class="row-sub">Open project endpoint</div>
        </div>
        <span class="chevron"></span>
      </a>
    </div>
  `)
  );

  // Sign out
  const out = el(`<button class="btn danger" style="margin-top:26px">Sign Out</button>`);
  out.addEventListener("click", () => {
    if (confirm("Sign out of Grade Dashboard?")) signOut();
  });
  container.appendChild(out);

  container.appendChild(
    el(`<div class="muted small" style="text-align:center;margin-top:18px">Grade Dashboard · data stored in your Supabase project</div>`)
  );
}
