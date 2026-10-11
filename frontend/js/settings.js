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
import { savedFeedback, stagger } from "./motion.js";

const THEME_KEY = "theme";
const APP_VERSION = "4.1.0";

// Selectable colour themes. Every accent keeps AA contrast when used as text
// (dark-on-light for the light themes, light-on-dark for the dark themes).
export const THEMES = [
  { id: "auto", name: "Auto — follows your device's light/dark mode", color: "linear-gradient(135deg, #f5f5f7 50%, #1c1c1e 50%)" },
  { id: "pearl", name: "Pearl", color: "#52525b" },
  { id: "lavender", name: "Lavender", color: "#7050a0" },
  { id: "matcha", name: "Matcha", color: "#526b35" },
  { id: "peach", name: "Peach", color: "#a34c35" },
  { id: "coffee", name: "Coffee", color: "#795548" },
  { id: "arctic", name: "Arctic", color: "#276682" },
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
  if (t === "light") return "indigo";
  return THEMES.some((x) => x.id === t) ? t : "auto";
}

function applyTheme(id, { crossfade = false } = {}) {
  // `m-theming` puts a short transition on the themed surfaces so switching
  // theme fades rather than flashes. It is removed again straight after.
  if (crossfade) {
    document.documentElement.classList.add("m-theming");
    clearTimeout(applyTheme.timer);
    applyTheme.timer = setTimeout(
      () => document.documentElement.classList.remove("m-theming"),
      400,
    );
  }
  // "auto" resolves to the default light theme or Dark, live with the OS.
  if (id === "auto") {
    const dark = matchMedia("(prefers-color-scheme: dark)");
    if (!applyTheme.watching) {
      applyTheme.watching = true;
      dark.addEventListener?.("change", () => currentTheme() === "auto" && applyTheme("auto", { crossfade: true }));
    }
    id = dark.matches ? "dark" : "indigo";
  }
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
  applyPreferences();
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

  // Appearance — theme picker and layout.
  const active = currentTheme();
  const appearance = group("Appearance", "", [
    ["glass", "Translucent surfaces", "Frosted navigation and layered depth"],
    ["compact", "Compact layout", "Fit more courses on screen"],
  ]);
  appearance.querySelector(".preference-row").before(el(`
    <div>
      <div class="theme-swatches" role="group" aria-label="Colour theme">
        ${THEMES.map(
          (t) =>
            `<button type="button" class="swatch ${t.id === active ? "active" : ""}" data-theme-id="${t.id}" title="${escapeHtml(t.name)}" aria-pressed="${t.id === active}" aria-label="${escapeHtml(t.name)} theme" style="background:${t.color}"></button>`,
        ).join("")}
      </div>
      <p class="small muted" style="margin:10px 0 4px">Theme: <span class="theme-current" id="theme-name">${escapeHtml(
        THEMES.find((t) => t.id === active)?.name || "Indigo",
      )}</span></p>
    </div>`));
  appearance.querySelectorAll(".swatch").forEach((sw) =>
    sw.addEventListener("click", () => {
      const id = sw.dataset.themeId;
      localStorage.setItem(THEME_KEY, id);
      applyTheme(id, { crossfade: true });
      appearance
        .querySelectorAll(".swatch")
        .forEach(
          (s) => (
            s.classList.toggle("active", s.dataset.themeId === id),
            s.setAttribute("aria-pressed", String(s.dataset.themeId === id))
          ),
        );
      appearance.querySelector("#theme-name").textContent =
        THEMES.find((t) => t.id === id)?.name || "";
    }),
  );
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
