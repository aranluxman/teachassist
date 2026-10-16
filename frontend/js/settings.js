import { installCard } from "./install.js";
import { notificationSettings, debugCard } from "./notification-settings.js";
import { WORKER_URL } from "./config.js";
import {
  preferences,
  savePreferences,
  applyPreferences,
} from "./personalization.js";
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
  isDemo,
} from "./ta-client.js";
import { mountThumb, savedFeedback, stagger } from "./motion.js";
import { APPEARANCES, COLORS, applyTheme, setTheme, themeChoice, themeLabel } from "./theme.js";
import { glassButton, pageHeader, GLYPHS } from "./ui-kit.js";

const APP_VERSION = "5.0.0";

/** Apply the saved theme on app boot (called from app.html). */
export function applyStoredTheme() {
  applyTheme();
  applyPreferences();
}

/** The Theme page: appearance segmented control + six colour tiles. */
export function renderThemeSettings(container) {
  container.innerHTML = "";
  const head = el(pageHeader({ title: "Theme", left: glassButton("back", "Back to settings", "data-back") }));
  head.querySelector("[data-back]").onclick = () => window.AppNav.toSettings();
  container.append(head);

  const { appearance, color } = themeChoice();
  const body = el(`
    <div class="theme-page">
      <h2 class="g-section">Appearance</h2>
      <div class="segmented g-segmented" role="radiogroup" aria-label="Appearance">
        ${APPEARANCES.map((a) => `<button type="button" role="radio" data-appearance="${a.id}" aria-checked="${a.id === appearance}" class="${a.id === appearance ? "active" : ""}">${a.name}</button>`).join("")}
      </div>
      <h2 class="g-section">Color</h2>
      <div class="theme-grid" role="radiogroup" aria-label="Color">
        ${COLORS.map((c) => `<button type="button" role="radio" class="theme-tile" data-color="${c.id}" aria-checked="${c.id === color}"><span class="theme-orb" style="background:${c.orb}"></span><b>${c.name}</b></button>`).join("")}
      </div>
    </div>`);
  container.append(body);

  const seg = body.querySelector(".segmented");
  const moveThumb = mountThumb(seg, { inset: 5, radius: "999px" });
  requestAnimationFrame(() => moveThumb(seg.querySelector(".active")));
  seg.querySelectorAll("button").forEach((b) =>
    b.addEventListener("click", () => {
      setTheme({ appearance: b.dataset.appearance });
      seg.querySelectorAll("button").forEach((x) => {
        x.classList.toggle("active", x === b);
        x.setAttribute("aria-checked", String(x === b));
      });
      moveThumb(b);
    }),
  );
  body.querySelectorAll(".theme-tile").forEach((tile) =>
    tile.addEventListener("click", () => {
      setTheme({ color: tile.dataset.color });
      body.querySelectorAll(".theme-tile").forEach((x) => x.setAttribute("aria-checked", String(x === tile)));
    }),
  );
  stagger(container.children);
}

/** Render the Settings screen. */
export async function renderSettings(container) {
  container.innerHTML = "";
  container.appendChild(
    el(`<div class="screen-header v5-header"><div><h1>Settings</h1><p>Saved on this device, separately for each account.</p></div></div>`),
  );

  const prefs = preferences();
  const switchRow = ([id, title, desc]) =>
    `<label class="preference-row"><span><b>${title}</b><small>${desc}</small></span><input type="checkbox" role="switch" data-pref="${id}" ${prefs[id] ? "checked" : ""}></label>`;
  const group = (title, note, rows) =>
    el(`<section class="card settings-group preference-list"><h2>${title}</h2>${note ? `<p class="group-note">${note}</p>` : ""}${rows.map(switchRow).join("")}</section>`);
  const bindSwitches = (node) =>
    node.querySelectorAll("input[data-pref]").forEach((input) =>
      input.addEventListener("change", () =>
        savePreferences({ [input.dataset.pref]: input.checked }),
      ),
    );

  // You — the name the app greets you with, plus profile & quick actions.
  const personal = el(
    `<form class="card settings-group"><h2>You</h2><div class="field"><label for="profile-name">What should we call you?</label><input id="profile-name" maxlength="50" value="${escapeHtml(prefs.name)}" placeholder="Your first name"></div><div class="tool-buttons"><button class="btn secondary">Save name</button><button type="button" class="btn secondary" data-profile>My profile & quick actions</button></div><p role="status" class="small muted"></p></form>`,
  );
  personal.addEventListener("submit", (e) => {
    e.preventDefault();
    savePreferences({ name: personal.querySelector("input").value.trim() });
    personal.querySelector("[role=status]").textContent =
      "Saved on this device.";
    savedFeedback(personal.querySelector("button"), "Saved ✓");
  });
  personal.querySelector("[data-profile]").onclick = () => window.AppNav.toProfile();
  container.append(personal);

  // Appearance — theme page and layout.
  const appearance = group("Appearance", "", [
    ["glass", "Translucent surfaces", "Frosted navigation and layered depth"],
    ["compact", "Compact layout", "Fit more courses on screen"],
  ]);
  const themeRow = el(
    `<button type="button" class="preference-row theme-row"><span><b>Theme</b><small>${escapeHtml(themeLabel())}</small></span><span class="g-chev">${GLYPHS.chevron}</span></button>`,
  );
  themeRow.onclick = () => window.AppNav.go("settings", "theme");
  appearance.querySelector(".preference-row").before(themeRow);
  container.append(appearance);

  // Accessibility & privacy on screen.
  const access = group("Accessibility", "Your device's reduce-motion setting is always respected too.", [
    ["motion", "Interface animations", "Gentle transitions and press feedback"],
    ["largeText", "Larger text", "A little more room to read"],
  ]);
  const courseView = group("Courses & privacy", "", [
    ["hideMarks", "Hide grades", "Conceal marks on the course dashboard"],
    ["currentTermOnly", "Current semester only", "Hide courses from other semesters"],
  ]);
  [appearance, access, courseView].forEach(bindSwitches);
  container.append(access, courseView);

  // Install as an app (hidden once installed).
  const install = installCard();
  if (install) container.append(install);

  // Notifications (existing card, unchanged behaviour).
  const notes = notificationSettings();
  notes.classList.add("settings-group");
  container.append(notes);

  // Account & data
  const account = el(`
    <section class="card settings-group"><h2>Account & data</h2>
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
      <button class="row" id="refresh">
        <div class="row-main">
          <div class="row-title">Refresh from TeachAssist</div>
          <div class="row-sub" id="refresh-sub" role="status">${
            isDemo()
              ? "Demo data is bundled — nothing to re-scrape."
              : "Re-scrape your latest marks"
          }</div>
        </div>
        <span class="chevron"></span>
      </button>
    </div>
    <button class="btn danger" data-signout style="margin-top:14px">Sign Out</button>
    </section>
  `);
  account.querySelector("#refresh").addEventListener("click", async (e) => {
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
  account.querySelector("[data-signout]").addEventListener("click", () => {
    if (confirm("Sign out? Your saved login will be cleared from this device."))
      signOut();
  });
  container.append(account);

  container.appendChild(el(`<h2 class="section-title">Advanced</h2>`));
  // Optional custom server; regular student sign-in needs no setup or API key.
  const conn = el(`
    <details class="card"><summary>Custom sign-in server</summary>
      <h2>Custom server</h2>
      <p class="muted small">Use the default unless you operate your own TeachAssist-compatible sign-in service. Your login will be sent to the server you choose.</p>
      <form>
        <div class="field"><label for="w-url">Server URL</label><input id="w-url" type="url" required autocapitalize="off" spellcheck="false" value="${escapeHtml(workerUrl())}"></div>
        <p class="small muted" data-current>Currently using ${escapeHtml(workerUrl())}</p>
        <p role="status"></p>
        <div class="tool-buttons"><button class="btn secondary">Save server</button><button class="btn secondary" type="button" data-reset>Reset default</button></div>
      </form>
    </details>
  `);
  const saveConnection = value => {
    try {
      setWorkerUrl(value);
      conn.querySelector('input').value = workerUrl();
      conn.querySelector('[data-current]').textContent = `Currently using ${workerUrl()}`;
      conn.querySelector('[role=status]').textContent = 'Saved on this device. Refresh your courses to connect.';
    } catch (err) { conn.querySelector('[role=status]').textContent = err.message || 'Enter a valid server URL.'; }
  };
  conn.querySelector('form').onsubmit = e => { e.preventDefault(); saveConnection(conn.querySelector('input').value); };
  conn.querySelector('[data-reset]').onclick = () => saveConnection(WORKER_URL);
  container.append(conn, debugCard());

  container.appendChild(
    el(
      `<div class="muted small" style="text-align:center;margin-top:18px">TeachAssist Dashboard · v${APP_VERSION}</div>`,
    ),
  );

  stagger(container.children);
}
