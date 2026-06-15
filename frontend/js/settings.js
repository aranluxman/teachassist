// ============================================================================
// Settings
// ----------------------------------------------------------------------------
// Shows the signed-in email, lets the user edit the term date range, toggle a
// (placeholder) dark theme, and sign out.
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

const THEME_KEY = "theme";

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

  // Appearance (dark theme placeholder)
  container.appendChild(el(`<div class="section-label">Appearance</div>`));
  const appearance = el(`
    <div class="rows">
      <div class="row" style="cursor:default">
        <div class="row-main">
          <div class="row-title">Dark theme</div>
          <div class="row-sub">Placeholder — basic dark palette</div>
        </div>
        <label class="switch">
          <input type="checkbox" id="theme-toggle" ${isDark ? "checked" : ""} />
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

  // Sign out
  const out = el(`<button class="btn danger" style="margin-top:26px">Sign Out</button>`);
  out.addEventListener("click", () => signOut());
  container.appendChild(out);

  container.appendChild(
    el(`<div class="muted small" style="text-align:center;margin-top:18px">Grade Dashboard · data stored in your Supabase project</div>`)
  );
}
