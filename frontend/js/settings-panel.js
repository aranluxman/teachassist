// ============================================================================
// Settings tab — the App Settings panel and the Help & Legal card at the top.
// ----------------------------------------------------------------------------
// Six rows (two glass cards side by side on iPad/desktop, one list on a
// phone). Each row opens its own page, #settings/<view>, with a back
// button (settings.js renderSettingsPage). Styles: css/guidance-hub.css.
// ============================================================================

import { el, escapeHtml } from "./courses.js";
import { GLYPHS } from "./ui-kit.js";
import { isInstalled } from "./install.js";

const svg = (paths, w = 2) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
const ICONS = {
  download: svg('<path d="M12 4v11M7 10.5l5 5 5-5M5 19.5h14"/>', 2.3),
  database: svg('<ellipse cx="12" cy="6" rx="7" ry="2.8"/><path d="M5 6v12c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8V6M5 12c0 1.5 3.1 2.8 7 2.8s7-1.3 7-2.8"/>', 2.1),
  help: svg('<circle cx="12" cy="12" r="9"/><path d="M9.6 9.3a2.5 2.5 0 0 1 4.8 1c0 1.7-2.4 2.3-2.4 3.7"/><path d="M12 17.3h.01" stroke-width="2.8"/>', 2.1),
};

const ROWS = [
  ["appearance", "Appearance", "Theme, colour, and style", GLYPHS.palette],
  ["accessibility", "Accessibility", "Animations and motion", GLYPHS.access],
  ["notifications", "Notifications", "Reminders and updates", GLYPHS.bell],
  ["privacy", "Courses & Privacy", "Grade visibility and preferences", GLYPHS.shield],
  ["install", "Install the App", "Add to your home screen", ICONS.download],
  ["account", "Account & Data", "Sign in, refresh, or delete data", ICONS.database],
];

// Row id → the #settings/<view> page it opens. Appearance is the theme page.
const VIEW = { appearance: "theme" };
const open = (id) => window.AppNav.toSettings(VIEW[id] || id);

function row([id, title, sub, glyph]) {
  // Already installed: nothing to open, so say so.
  const installed = id === "install" && isInstalled();
  const node = el(`<button type="button" class="gh-row" data-row="${id}"${installed ? " disabled" : ""}>
    <span class="gh-row-icon" data-tone="${id}">${glyph}</span>
    <span class="gh-row-text"><b>${escapeHtml(title)}</b><small>${escapeHtml(installed ? "Installed on this device" : sub)}</small></span>
    ${installed ? "" : `<span class="gh-chev">${GLYPHS.chevron}</span>`}
  </button>`);
  node.onclick = () => open(id);
  return node;
}

/** The App Settings panel + Help & Legal card. */
export function settingsPanel() {
  const wrap = el(`<div class="gh-scope gh-settings-top">
    <section class="gh-section gh-settings" aria-labelledby="gh-settings-title">
      <h2 class="gh-title" id="gh-settings-title">App Settings</h2>
      <div class="gh-set-cols"><div class="gh-glass gh-set-card"></div><div class="gh-glass gh-set-card"></div></div>
    </section>
    <button type="button" class="gh-glass gh-help">
      <span class="gh-row-icon" data-tone="help">${ICONS.help}</span>
      <span class="gh-row-text"><b>Help &amp; Legal</b><small>Get support, report a bug, or review our policies.</small></span>
      <span class="gh-chev">${GLYPHS.chevron}</span>
    </button>
  </div>`);
  const [left, right] = wrap.querySelectorAll(".gh-set-card");
  ROWS.forEach((r, i) => (i < 3 ? left : right).append(row(r)));
  wrap.querySelector(".gh-help").onclick = () => open("help");
  return wrap;
}
