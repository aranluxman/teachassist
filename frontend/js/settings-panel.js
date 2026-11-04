// ============================================================================
// Settings tab — the App Settings panel and the Help & Legal card at the top.
// ----------------------------------------------------------------------------
// Six rows (two glass cards side by side on iPad/desktop, one list on a
// phone). Each row scrolls the Settings page down to the matching section
// and gives it a short accent pulse. Styles: css/guidance-hub.css (.gh-*).
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
  ["accessibility", "Accessibility", "Text size, animations, and more", GLYPHS.access],
  ["notifications", "Notifications", "Reminders and updates", GLYPHS.bell],
  ["privacy", "Courses & Privacy", "Grade visibility and preferences", GLYPHS.shield],
  ["install", "Install the App", "Add to your home screen", ICONS.download],
  ["account", "Account & Data", "Sign in, refresh, or delete data", ICONS.database],
];

/** Scroll a Settings section into view and pulse it. */
export function revealSection(root, name) {
  const node = name === "install"
    ? root.querySelector("#settings-install")
    : root.querySelector(`[data-section="${name}"]`);
  if (!node) return false;
  requestAnimationFrame(() => {
    node.scrollIntoView({ block: "start", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
    node.classList.remove("section-flash");
    void node.offsetWidth;
    node.classList.add("section-flash");
  });
  return true;
}

function row([id, title, sub, glyph], root) {
  // Already installed: nothing to jump to, so say so.
  const installed = id === "install" && isInstalled();
  const node = el(`<button type="button" class="gh-row" data-row="${id}"${installed ? " disabled" : ""}>
    <span class="gh-row-icon" data-tone="${id}">${glyph}</span>
    <span class="gh-row-text"><b>${escapeHtml(title)}</b><small>${escapeHtml(installed ? "Installed on this device" : sub)}</small></span>
    ${installed ? "" : `<span class="gh-chev">${GLYPHS.chevron}</span>`}
  </button>`);
  node.onclick = () => revealSection(root, id);
  return node;
}

/** The App Settings panel + Help & Legal card. `root` is the Settings screen. */
export function settingsPanel(root) {
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
  ROWS.forEach((r, i) => (i < 3 ? left : right).append(row(r, root)));
  wrap.querySelector(".gh-help").onclick = () => revealSection(root, "help");
  return wrap;
}
