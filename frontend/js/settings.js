import { installCard } from "./install.js";
import { notificationSettings } from "./notification-settings.js";
import {
  preferences,
  savePreferences,
  applyPreferences,
} from "./personalization.js";
// ============================================================================
// Settings
// ----------------------------------------------------------------------------
// Shows the signed-in student number (or demo state), the theme picker,
// a refresh action, Sign Out, and Delete my data.
// ============================================================================

import { el, escapeHtml, openSheet } from "./courses.js";
import {
  studentNumber,
  signOut,
  getCourses,
  isDemo,
} from "./ta-client.js";
import { mountThumb, savedFeedback, stagger } from "./motion.js";
import { APPEARANCES, COLORS, applyTheme, orbFill, setTheme, themeChoice, themeLabel } from "./theme.js";
import { glassButton, pageHeader, GLYPHS, iconTile } from "./ui-kit.js";
import { CONTACT_FORM_URL, CONTACT_EMAIL } from "./config.js";
import { deleteCloudData } from "./cloud-store.js";
import { forgetStudentData } from "./student-store.js";

// Each settings group's heading icon, keyed by its title.
const GROUP_ICONS = {
  You: "person",
  Appearance: "palette",
  Accessibility: "access",
  "Courses & privacy": "shield",
  Notifications: "bell",
  "Account & data": "person",
  "Help & feedback": "compose",
  Legal: "doc",
};
/** Put the matching icon in front of every group heading (look only). */
function decorateGroups(root) {
  for (const h of root.querySelectorAll(".card > h2")) {
    const glyph = GROUP_ICONS[h.textContent.trim()];
    if (glyph && !h.querySelector(".ui-h-icon")) h.insertAdjacentHTML("afterbegin", `<span class="ui-h-icon" aria-hidden="true">${GLYPHS[glyph]}</span>`);
  }
}

const APP_VERSION = "5.0.0";

/** Apply the saved theme on app boot (called from app.html). */
export function applyStoredTheme() {
  applyTheme();
  applyPreferences();
}

/** The Theme page: a live preview, the appearance switch and the colour tiles. */
export function renderThemeSettings(container) {
  container.innerHTML = "";
  const head = el(pageHeader({ title: "Theme", left: glassButton("back", "Back to settings", "data-back") }));
  head.querySelector("[data-back]").onclick = () => window.AppNav.toSettings();
  container.append(head);

  const { appearance, color } = themeChoice();
  const name = preferences().name;
  // The sample card is drawn only from theme tokens, so it repaints live as
  // a colour or appearance is tapped. Its mark is made up, never a real one.
  const body = el(`
    <div class="theme-page">
      <section class="card theme-hero">
        ${iconTile("palette")}
        <div><b>${COLORS.length} themes</b><p>Choose a theme that fits your style.</p></div>
        <button type="button" class="theme-preview-btn" aria-expanded="false" aria-controls="theme-preview">${GLYPHS.eye}Preview</button>
      </section>
      <div class="card theme-preview" id="theme-preview" hidden>
        <div class="tp-top">
          <div><b>Hi ${escapeHtml(name || "there")}</b><small>Overall average</small><span class="tp-mark">91.4<small>%</small></span></div>
          <svg class="tp-ring" viewBox="0 0 44 44" aria-hidden="true"><circle cx="22" cy="22" r="18"/><circle cx="22" cy="22" r="18" pathLength="100" stroke-dasharray="91.4 100"/></svg>
        </div>
        <div class="tp-row"><span class="tp-btn">Refresh</span><span class="tp-chip">Sample</span></div>
      </div>
      <h2 class="g-section">Appearance</h2>
      <div class="segmented g-segmented" role="radiogroup" aria-label="Appearance">
        ${APPEARANCES.map((a) => `<button type="button" role="radio" data-appearance="${a.id}" aria-checked="${a.id === appearance}" class="${a.id === appearance ? "active" : ""}">${a.name}</button>`).join("")}
      </div>
      <h2 class="g-section">Color</h2>
      <div class="theme-grid" role="radiogroup" aria-label="Color">
        ${COLORS.map(
          (c) => `<button type="button" role="radio" class="theme-tile" data-color="${c.id}" aria-checked="${c.id === color}" style="--tile-tint:${c.tint}">
          <span class="theme-orb" style="background:${orbFill(c)}"></span>
          <span class="theme-tile-text"><b>${c.name}</b><span class="theme-dots" aria-hidden="true">${c.dots.map((d) => `<i style="background:${d}"></i>`).join("")}</span></span>
          <span class="theme-check" aria-hidden="true">${GLYPHS.check}</span>
        </button>`,
        ).join("")}
      </div>
    </div>`);
  container.append(body);

  const previewBtn = body.querySelector(".theme-preview-btn");
  const preview = body.querySelector(".theme-preview");
  previewBtn.addEventListener("click", () => {
    preview.hidden = !preview.hidden;
    previewBtn.setAttribute("aria-expanded", String(!preview.hidden));
  });

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
  // Once a name is saved it folds into one slim row; tap it to change.
  container.append(personalCard(prefs.name));

  // Appearance — theme page and layout.
  const appearance = group("Appearance", "", [
    ["glass", "Translucent surfaces", "Frosted navigation and layered depth"],
    ["compact", "Compact layout", "Fit more courses on screen"],
  ]);
  const themeRow = el(
    `<button type="button" class="preference-row theme-row">${iconTile("palette")}<span><b>Theme</b><small>${escapeHtml(themeLabel())}</small></span><span class="g-chev">${GLYPHS.chevron}</span></button>`,
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
        ${iconTile("person")}
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
        ${iconTile("refresh")}
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
    <button class="btn danger" data-signout style="margin-top:14px">${GLYPHS.signout}Sign Out</button>
    ${isDemo() ? "" : `<button class="btn ghost delete-data" data-delete-data>Delete my data</button>
    <p class="small muted delete-data-note" role="status">Removes your cloud backup and this device's saved data, then signs you out. Your TeachAssist account isn't affected.</p>`}
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
  account.querySelector("[data-delete-data]")?.addEventListener("click", async (e) => {
    const button = e.currentTarget;
    const note = account.querySelector(".delete-data-note");
    if (!confirm("Delete your data? This permanently removes your cloud backup (saved marks, dreams, goals and name) and everything this app saved on this device, then signs you out. Your TeachAssist account isn't affected.")) return;
    button.disabled = true;
    note.textContent = "Deleting…";
    if (!(await deleteCloudData())) {
      button.disabled = false;
      note.textContent = `Couldn't delete your cloud data right now. Try again, or email ${CONTACT_EMAIL}.`;
      return;
    }
    forgetStudentData(studentNumber());
    signOut();
  });
  container.append(account);
  container.append(contactCard());
  container.append(legalCard());

  container.appendChild(
    el(
      `<div class="muted small" style="text-align:center;margin-top:18px">TeachAssist Dashboard · v${APP_VERSION}</div>`,
    ),
  );
  container.appendChild(el(MADE_BY));

  decorateGroups(container);
  stagger(container.children);
}

/** The "You" card: a name form, or a compact row once a name is saved. */
function personalCard(name) {
  if (name) {
    const row = el(
      `<section class="card settings-group you-compact"><button type="button" class="preference-row you-row">${iconTile("person")}<span><b>Hi, ${escapeHtml(name)}</b><small>Tap to change your name</small></span><span class="g-chev">${GLYPHS.chevron}</span></button><button type="button" class="btn secondary you-profile" data-profile>My profile & quick actions</button></section>`,
    );
    row.querySelector(".you-row").onclick = () => row.replaceWith(personalForm(name, true));
    row.querySelector("[data-profile]").onclick = () => window.AppNav.toProfile();
    return row;
  }
  return personalForm(name, false);
}

function personalForm(name, focus) {
  const form = el(
    `<form class="card settings-group"><h2>You</h2><div class="field"><label for="profile-name">What should we call you?</label><input id="profile-name" maxlength="50" value="${escapeHtml(name)}" placeholder="Your first name"></div><div class="tool-buttons"><button class="btn secondary">Save name</button><button type="button" class="btn secondary" data-profile>My profile & quick actions</button></div><p role="status" class="small muted"></p></form>`,
  );
  form.querySelector("h2").insertAdjacentHTML("afterbegin", `<span class="ui-h-icon" aria-hidden="true">${GLYPHS.person}</span>`);
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const next = form.querySelector("input").value.trim();
    savePreferences({ name: next });
    savedFeedback(form.querySelector("button"), "Saved ✓");
    // Fold away once there is a name to keep.
    setTimeout(() => form.isConnected && next && form.replaceWith(personalCard(next)), 700);
    if (!next) form.querySelector("[role=status]").textContent = "Saved on this device.";
  });
  form.querySelector("[data-profile]").onclick = () => window.AppNav.toProfile();
  if (focus) requestAnimationFrame(() => form.querySelector("input").focus());
  return form;
}

// ── Legal: policies and credits, so students (and parents) know who runs this.
const EXTERNAL = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>`;
export const MADE_BY = `<p class="made-by">Built by <a href="https://intelligentautomations.ca" target="_blank" rel="noopener">Intelligent Automations</a></p>`;

function legalCard() {
  const card = el(`
    <section class="card settings-group"><h2>Legal</h2>
      <p class="group-note">See our policies and who made this app.</p>
      <div class="legal-links">
        <a href="legal/privacy.html" target="_blank" rel="noopener">Privacy Policy ${EXTERNAL}</a>
        <a href="legal/terms.html" target="_blank" rel="noopener">Terms of Service ${EXTERNAL}</a>
        <a href="legal/delete.html" target="_blank" rel="noopener">Delete your data ${EXTERNAL}</a>
        <button type="button" data-credits>Credits <span class="chevron"></span></button>
      </div>
    </section>`);
  card.querySelector("[data-credits]").onclick = () =>
    openSheet("Credits", el(`<div class="credits">
      <p><b>Developer</b><br><a href="https://intelligentautomations.ca" target="_blank" rel="noopener">Intelligent Automations</a>, Markham, Ontario</p>
      <p><b>Beta testers</b><br>Keshavan Venkat, Aadavan Mathi, Kavin Senthil, Allen Wu, Rayaan Shivji and Kiefer Jarchow</p>
      <p class="muted small">An independent student project. Not affiliated with or endorsed by the York Region District School Board or the TeachAssist Foundation. Your official marks are always on TeachAssist.</p>
      <p class="muted small">Made with the Inter and JetBrains Mono fonts, and hosted on Cloudflare.</p>
      <p class="muted small">Questions: ${CONTACT_EMAIL}</p>
    </div>`));
  return card;
}

// ── Help & feedback: questions and bug reports go to the Google Form
// (or an email until the form's link is set in config.js).
function contactCard() {
  const href = CONTACT_FORM_URL || `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent("TeachAssist app: question or bug")}`;
  return el(`
    <section class="card settings-group"><h2>Help & feedback</h2>
      <p class="group-note">Found a bug or have a question? Tell us and we'll get back to you.</p>
      <div class="legal-links">
        <a href="${escapeHtml(href)}"${CONTACT_FORM_URL ? ' target="_blank" rel="noopener"' : ""}>Contact us / report a bug ${EXTERNAL}</a>
      </div>
    </section>`);
}
