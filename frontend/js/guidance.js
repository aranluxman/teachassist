// ============================================================================
// Guidance tab
// ----------------------------------------------------------------------------
// My school (from YRDSB school profiles) · school map & boundaries · OSSD
// tracker (hidden) · my counsellor · appointment reminders ·
// verified resource links with icons that say where each one goes.
// ============================================================================

import { appointmentCard, teacherSearch, examCalculator, profilePhoto, profileSchool } from "./profile.js";
import { preferences } from "./personalization.js";
import { openSchedule } from "./schedule.js";
import { el, escapeHtml, openSheet, closeSheet, courseLabel } from "./courses.js";
import { iconTile, GLYPHS } from "./ui-kit.js";
import { getCourses, isDemo, displayMark } from "./ta-client.js";
import { computeGpa, gpaFor, GPA_SCALE, GPA_MAX } from "./gpa.js";
import { listNotes, readNotes } from "./notes-store.js";
import { marksHidden } from "./motion.js";
import { readStudentData, writeStudentData } from "./student-store.js";
import { mySchool, schoolCard, icon } from "./schools.js";
import { ossdProgress, saveOssd, ossdState, TOTAL_CREDITS } from "./ossd.js";

// Link icon per destination type, so students know where a tap takes them.
const KIND = {
  board: { label: "YRDSB", svg: '<path d="M3 21h18M5 21V10l7-5 7 5v11"/><path d="M9 21v-6h6v6"/>' },
  gov: { label: "Ontario.ca", svg: '<path d="M3 21h18M4 10h16M12 3 4 7v3h16V7Z"/><path d="M6 10v8M10 10v8M14 10v8M18 10v8"/>' },
  school: { label: "Post-secondary", svg: '<path d="m2 9 10-5 10 5-10 5Z"/><path d="M6 11v5c0 1.5 3 3 6 3s6-1.5 6-3v-5M22 9v6"/>' },
  plan: { label: "Planner", svg: '<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5Z"/>' },
  learn: { label: "Learning", svg: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2Z"/><path d="M4 19a2 2 0 0 1 2-2h13"/><path d="m10 8 4 2-4 2Z"/>' },
  test: { label: "Test info", svg: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="m9 12 2 2 4-4M9 7h6"/>' },
  help: { label: "Free support", svg: '<path d="M20 5a5 5 0 0 0-8 1 5 5 0 0 0-8-1c-4 4 1 9 8 15 7-6 12-11 8-15Z"/>' },
  pdf: { label: "PDF", svg: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>' },
};

// Every URL was checked to load (2026-10). The old YRDSB paths 404'd after
// the board's site redesign; these are their current homes.
export const RESOURCES = [
  {
    group: "Planning",
    items: [
      { label: "myBlueprint — Pathway Planner", sub: "Course selection & post-secondary planning", url: "https://www.myblueprint.ca", kind: "plan" },
      { label: "YRDSB graduation requirements", sub: "Credits, literacy, online learning, volunteer hours", url: "https://www2.yrdsb.ca/schools-programs/secondary-school/course-planning-and-graduation/graduation-requirements", kind: "board" },
      { label: "Community involvement hours", sub: "The 40-hour requirement and what counts", url: "https://www2.yrdsb.ca/schools-programs/secondary-school/course-planning-and-graduation/graduation-requirements/community", kind: "board" },
      { label: "Ontario diploma requirements", sub: "The province's official OSSD page", url: "https://www.ontario.ca/page/high-school-graduation-requirements", kind: "gov" },
      { label: "OUInfo — Ontario universities", sub: "Programs, prerequisites, admission averages", url: "https://www.ontariouniversitiesinfo.ca", kind: "school" },
      { label: "ontariocolleges.ca", sub: "Explore and apply to Ontario college programs", url: "https://www.ontariocolleges.ca", kind: "school" },
    ],
  },
  {
    group: "Academics",
    items: [
      { label: "OSSLT — literacy test", sub: "Dates, format and practice tests", url: "https://www.eqao.com/the-assessments/osslt/", kind: "test" },
      { label: "TVO Learn", sub: "Free Ontario-curriculum lessons and review", url: "https://www.tvolearn.com", kind: "learn" },
      { label: "Summer school", sub: "YRDSB secondary summer credit courses", url: "https://www2.yrdsb.ca/schools-programs/secondary-school/summer-learning-opportunities", kind: "board" },
      { label: "Night school", sub: "Earn or upgrade credits in the evening", url: "https://www2.yrdsb.ca/schools-programs/secondary-school/school-programs-and-opportunities/night-school-opportunities", kind: "board" },
    ],
  },
  {
    group: "Support",
    items: [
      { label: "YRDSB Guidance & student support", sub: "Find counselling and support at your school", url: "https://www2.yrdsb.ca/find-support", kind: "board" },
      { label: "YRDSB Mental Health", sub: "Well-being resources and supports", url: "https://www2.yrdsb.ca/student-support/mental-health", kind: "board" },
      { label: "Kids Help Phone", sub: "24/7 — call 1-800-668-6868 or text CONNECT to 686868", url: "https://kidshelpphone.ca", kind: "help", call: "tel:18006686868", text: "sms:686868?body=CONNECT" },
      { label: "One Stop Talk", sub: "Free virtual therapy for Ontario youth", url: "https://onestoptalk.ca", kind: "help" },
    ],
  },
];

const host = (url) => new URL(url).hostname.replace(/^www2?\./, "");

/** One resource link row: type icon, title, where it goes. */
export function linkRow(item) {
  const kind = KIND[item.kind] || KIND.board;
  const row = el(`
    <div class="link-row-wrap">
      <a class="link-row" href="${escapeHtml(item.url)}" target="_blank" rel="noopener">
        <span class="link-icon tone-${item.kind}" aria-hidden="true"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${kind.svg}</svg></span>
        <span class="link-text"><b>${escapeHtml(item.label)}</b><small>${escapeHtml(item.sub)}</small><small class="link-host">${escapeHtml(kind.label)} · ${escapeHtml(host(item.url))} ↗</small></span>
      </a>
      ${item.call ? `<div class="link-actions"><a class="chip" href="${item.call}">${icon("phone", 14)} Call</a><a class="chip" href="${item.text}">Text</a></div>` : ""}
    </div>`);
  return row;
}


// ── The hub at the top: header, profile card and Quick Tools ─────────────
// (App Settings and Help & Legal live at the top of the Settings tab:
// js/settings-panel.js.)
// Liquid-glass cards drawn from theme tokens (css/guidance-hub.css), so they
// pick up the chosen colour and Light/Dark. Only the tool and settings icon
// colours are fixed, like app icons.
const svg = (paths, w = 2) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
const HUB_ICONS = {
  search: svg('<circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/>', 2.2),
  heart: svg('<path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.3a4.3 4.3 0 0 1 7.5 2.5C19.5 15.4 12 20 12 20Z"/>', 2.2),
  classroom: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2.5" y="4" width="19" height="16" rx="2" fill="#f6c026"/><rect x="4.5" y="6" width="15" height="12" rx="1" fill="#1e8e3e"/><circle cx="12" cy="10.3" r="1.7" fill="#fff"/><path d="M8.6 15.4a3.4 3.4 0 0 1 6.8 0z" fill="#fff"/><circle cx="7.6" cy="11.3" r="1.2" fill="#a8dab5"/><circle cx="16.4" cy="11.3" r="1.2" fill="#a8dab5"/><rect x="13.5" y="16.2" width="4" height="1" rx=".5" fill="#fff"/></svg>',
  calendar: svg('<rect x="3.5" y="5" width="17" height="15.5" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/>'),
  calc: svg('<rect x="5" y="3" width="14" height="18" rx="2.5"/><path d="M8.5 7h7M8.5 11h.01M12 11h.01M15.5 11h.01M8.5 14.5h.01M12 14.5h.01M15.5 14.5h.01M8.5 18h.01M12 18h3.5" stroke-width="2.4"/>'),
  external: svg('<path d="M14 4h6v6M20 4l-9 9"/><path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4"/>', 2.2),
  compass: svg('<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5Z"/>'),
  map: svg('<path d="m9 4-6 2.5v13.5l6-2.5 6 2.5 6-2.5V4l-6 2.5z"/><path d="M9 4v13.5M15 6.5V20"/>'),
  pencil: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="m14.7 5.3 4 4L8.4 19.6 3.6 20.4l.8-4.8z"/><path d="m16.1 3.9 1.5-1.5a1.4 1.4 0 0 1 2 0l2 2a1.4 1.4 0 0 1 0 2l-1.5 1.5z"/></svg>',
  gear: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 7 19.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0-1.2-2.9H3a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 4.7 7l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H10a1.7 1.7 0 0 0 1-1.6V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V10a1.7 1.7 0 0 0 1.6 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>', 1.9),
  person: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="8" r="4.2"/><path d="M4 20.5a8 8 0 0 1 16 0z"/></svg>',
};

function hubHeader() {
  const head = el(`<header class="gh-top">
    <div class="gh-heading"><h1>Guidance</h1><p>Your student hub for learning, support, and school tools.</p></div>
    <div class="gh-actions">
      <button type="button" class="gh-round" data-bell aria-label="Notification settings">${GLYPHS.bell}</button>
      <button type="button" class="gh-round" data-gear aria-label="Settings">${HUB_ICONS.gear}</button>
    </div>
  </header>`);
  head.querySelector("[data-bell]").onclick = () => window.AppNav.toSettings("notifications");
  head.querySelector("[data-gear]").onclick = () => window.AppNav.toSettings();
  return head;
}

function profileCard(school) {
  // No saved name yet: a friendly placeholder, never "Student" twice.
  const name = preferences().name || (isDemo() ? "Demo student" : "Your profile");
  const photo = profilePhoto();
  const sub = school?.name || profileSchool() || "Student";
  const card = el(`<section class="gh-glass gh-profile">
    <span class="gh-avatar">${photo ? `<img src="${photo}" alt="">` : HUB_ICONS.person}</span>
    <span class="gh-who"><b>${escapeHtml(name)}</b><small>${escapeHtml(sub)}</small></span>
    <button type="button" class="gh-pill" data-edit>${HUB_ICONS.pencil}<span>Edit Profile</span>${GLYPHS.chevron}</button>
  </section>`);
  card.querySelector("[data-edit]").onclick = () => window.AppNav.toProfile();
  return card;
}

/** One group of tool tiles under its own heading. */
function toolGroup(id, title, tools, lead) {
  const wrap = el(`<section class="gh-section" aria-labelledby="gh-${id}-title"><h2 class="gh-title" id="gh-${id}-title">${escapeHtml(title)}</h2><div class="gh-tools"></div></section>`);
  if (lead) wrap.querySelector(".gh-tools").before(lead);
  for (const [tid, label, glyph, action] of tools) {
    const isLink = typeof action === "string";
    const tile = el(isLink
      ? `<a class="gh-glass gh-tool" data-tool="${tid}" href="${escapeHtml(action)}" target="_blank" rel="noopener"></a>`
      : `<button type="button" class="gh-glass gh-tool" data-tool="${tid}"></button>`);
    tile.innerHTML = `<span class="gh-tool-icon">${glyph}</span><span class="gh-tool-label">${escapeHtml(label)}</span>`;
    if (isLink) tile.setAttribute("aria-label", `${label} (opens in a new tab)`);
    else tile.onclick = action;
    wrap.querySelector(".gh-tools").append(tile);
  }
  return wrap;
}

/** The Notes quick button: every notebook and note, one tap away. */
function notesButton() {
  const notes = listNotes();
  const books = readNotes().notebooks?.length || 0;
  const sub = notes.length
    ? `${notes.length} note${notes.length === 1 ? "" : "s"}${books ? ` in ${books} notebook${books === 1 ? "" : "s"}` : ""}`
    : "Class notes, saved as you type";
  const btn = el(`<button type="button" class="gh-glass gh-notes-btn"><span class="gh-notes-icon" aria-hidden="true">${NOTES_ICON}</span><span><b>Notes</b><small></small></span>${GLYPHS.chevron}</button>`);
  btn.querySelector("small").textContent = sub;
  btn.onclick = () => window.AppNav.toGuidance("notes");
  return btn;
}
const NOTES_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3.5h10.5A2.5 2.5 0 0 1 19 6v15H7.5A2.5 2.5 0 0 1 5 18.5V4.5a1 1 0 0 1 1-1z"/><path d="M5 18.5A2.5 2.5 0 0 1 7.5 16H19M9 8h6M9 11.5h4"/></svg>';

/** School: things that depend on which school you go to. Choose it first. */
function schoolTools(school) {
  const toMap = () => window.AppNav.toGuidance("map");
  const lead = school
    ? null
    : el(`<button type="button" class="gh-glass gh-choose-school">${HUB_ICONS.map}<span><b>Choose your school</b><small>Unlocks its website, bell times and boundary map.</small></span>${GLYPHS.chevron}</button>`);
  if (lead) lead.onclick = toMap;
  return toolGroup("school", "School", [
    ["website", "School Website", HUB_ICONS.external, school?.website || toMap],
    ["map", "School Map", HUB_ICONS.map, toMap],
    ["teacher", "Find a Teacher", HUB_ICONS.search, teacherSearch],
    ["classroom", "Google Classroom", HUB_ICONS.classroom, "https://classroom.google.com"],
  ], lead);
}

/** Planning: your timetable, exams and graduation steps. */
function planningTools() {
  return toolGroup("planning", "Planning", [
    ["schedule", "My Schedule", HUB_ICONS.calendar, async () => openSchedule(await getCourses().catch(() => []))],
    ["exam", "Exam Calculator", HUB_ICONS.calc, examCalculator],
    ["volunteer", "Volunteer Hours", HUB_ICONS.heart, () => window.AppNav.toGuidance("volunteer")],
    ["blueprint", "myBlueprint", HUB_ICONS.compass, "https://myblueprint.ca"],
  ]);
}

/** Render the Guidance screen. */
export async function renderGuidance(container) {
  container.innerHTML = "";
  const school = await mySchool().catch(() => null);

  const hub = el(`<div class="gh-hub"></div>`);
  // Tools grouped by purpose (School · Planning); GPA sits in the middle.
  hub.append(hubHeader(), profileCard(school), notesButton(), schoolTools(school), planningTools(), gpaCard());
  container.append(hub);

  // School details, once one is chosen (the School group asks for it first).
  const schoolSection = el(`<section class="card my-school"><div class="tool-heading"><h2>My school</h2><button class="btn ghost" data-change>${school ? "Change" : "Choose"}</button></div></section>`);
  schoolSection.querySelector("[data-change]").onclick = () => window.AppNav.toGuidance("map");
  if (school) {
    schoolSection.append(schoolCard(school));
    schoolSection.append(el(`<p class="small muted">Guidance office: call the main line and ask for Guidance, or book through your school website.</p>`));
  }
  if (school) container.append(schoolSection);

  // The diploma/credits tracker (ossdCard) is hidden for now.

  // Support: the people to talk to, and reminders for when you've booked them.
  container.append(el(`<h2 class="gh-title gh-title-sub">Support</h2>`));
  container.append(counsellorCard());
  container.append(appointmentCard());

  // Resources: grouped and all folded up, so the page stays short.
  container.append(el(`<h2 class="gh-title gh-title-sub">Resources</h2>`));
  const blurbs = { Planning: "Graduation rules, myBlueprint, universities & colleges", Academics: "OSSLT, TVO Learn, summer and night school", Support: "Kids Help Phone, mental health, counselling" };
  const sectionTiles = { Planning: ["cap", "accent"], Academics: ["book", "purple"], Support: ["heart", "pink"] };
  for (const section of RESOURCES) {
    const [glyph, tone] = sectionTiles[section.group] || ["doc", "accent"];
    const box = el(`<details class="card disclosure"><summary>${iconTile(glyph, tone)}<span>${escapeHtml(section.group)}<small>${escapeHtml(blurbs[section.group] || "")}</small></span></summary><div class="disclosure-body"><div class="link-list"></div></div></details>`);
    section.items.forEach((item) => box.querySelector(".link-list").append(linkRow(item)));
    container.append(box);
  }
  container.append(el(`<p class="muted small" style="text-align:center;margin-top:18px">Talk to your school's guidance department for personalized advice.</p>`));
}

/** GPA on the 4.33 scale from every course mark, with a per-course breakdown. */
function gpaCard() {
  const card = el(`<section class="gh-glass gh-gpa" aria-labelledby="gh-gpa-title" aria-busy="true">
    <h2 class="gh-gpa-title" id="gh-gpa-title">Your GPA</h2>
    <p class="gh-gpa-value"><b class="private-mark">…</b><span>/ ${GPA_MAX.toFixed(2)}</span></p>
    <p class="gh-gpa-sub muted small">Loading your marks…</p>
    <p class="gh-gpa-scale-note">Ontario 4.33 scale · a personal estimate, not an admissions GPA</p>
  </section>`);
  getCourses()
    .then((courses) => fillGpa(card, courses))
    .catch(() => fillGpa(card, []));
  return card;
}

function fillGpa(card, courses) {
  card.removeAttribute("aria-busy");
  const rows = (courses || [])
    .map((c) => ({ code: courseLabel(c), mark: displayMark(c) }))
    .filter((r) => r.mark != null);
  const g = computeGpa(rows.map((r) => r.mark));
  const value = card.querySelector(".gh-gpa-value b");
  const sub = card.querySelector(".gh-gpa-sub");
  if (!g) {
    value.textContent = "—";
    sub.textContent = "Your GPA shows up here once TeachAssist has a mark for a course.";
    return;
  }
  const hidden = marksHidden();
  value.textContent = hidden ? "•.••" : g.gpa.toFixed(2);
  sub.innerHTML = hidden
    ? `${g.count} course${g.count === 1 ? "" : "s"}`
    : `<b>${escapeHtml(g.letter)}</b> · ${g.average.toFixed(1)}% average · ${g.count} course${g.count === 1 ? "" : "s"}`;
  const list = rows
    .map((r) => {
      const { letter, points } = gpaFor(r.mark);
      return `<li><span>${escapeHtml(r.code)}</span><span class="private-mark">${hidden ? "••%" : `${(Math.round(r.mark * 10) / 10).toFixed(1)}%`}</span><span class="private-mark">${hidden ? "•" : escapeHtml(letter)}</span><b class="private-mark">${hidden ? "•.••" : points.toFixed(2)}</b></li>`;
    })
    .join("");
  const scale = GPA_SCALE.map(([min, letter, points], i) => {
    const top = i ? GPA_SCALE[i - 1][0] - 1 : 100;
    return `<li><span>${escapeHtml(letter)}</span><span>${min ? `${min}–${top}` : `Below ${GPA_SCALE[i - 1][0]}`}</span><b>${points.toFixed(2)}</b></li>`;
  }).join("");
  card.append(el(`<details class="gh-gpa-more"><summary>How it's worked out</summary>
    <ul class="gh-gpa-list">${list}</ul>
    <p class="muted small">Each course mark is rounded to a whole percent, turned into points on the scale below, and averaged. Every course counts the same. Universities convert marks their own way, so treat this as an estimate.</p>
    <ul class="gh-gpa-list gh-gpa-scale">${scale}</ul>
  </details>`));
}

function counsellorCard() {
  const c = readStudentData("counsellor", { name: "", email: "", notes: "" });
  const card = el(`<section class="card counsellor">
    <div class="tool-heading"><h2>My counsellor</h2><button class="btn ghost" data-edit>${c.name ? "Edit" : "Add"}</button></div>
    ${c.name ? `<div class="person-row"><span class="avatar">${escapeHtml(c.name.trim().charAt(0).toUpperCase())}</span><div><b>${escapeHtml(c.name)}</b>${c.email ? `<p class="small muted">${escapeHtml(c.email)}</p>` : ""}</div>${c.email ? `<a class="btn secondary" href="mailto:${encodeURIComponent(c.email)}">Email</a>` : ""}</div>${c.notes ? `<p class="note">${escapeHtml(c.notes)}</p>` : ""}`
      : `<p class="muted">Save your guidance counsellor's name and email so they're one tap away. Most schools assign counsellors by last name.</p>`}
  </section>`);
  card.querySelector("[data-edit]").onclick = () => {
    const form = el(`<form>
      <div class="field"><label for="c-name">Name</label><input id="c-name" name="name" maxlength="80" value="${escapeHtml(c.name)}" required></div>
      <div class="field"><label for="c-email">Email</label><input id="c-email" name="email" type="email" maxlength="120" value="${escapeHtml(c.email)}" placeholder="firstname.lastname@yrdsb.ca"></div>
      <div class="field"><label for="c-notes">Notes</label><textarea id="c-notes" name="notes" rows="3" maxlength="400" placeholder="Ask about summer school for French">${escapeHtml(c.notes)}</textarea></div>
      <button class="btn">Save</button></form>`);
    form.onsubmit = (e) => {
      e.preventDefault();
      writeStudentData("counsellor", { name: form.elements.name.value.trim(), email: form.elements.email.value.trim(), notes: form.elements.notes.value.trim() });
      closeSheet();
      card.replaceWith(counsellorCard());
    };
    openSheet("My counsellor", form);
  };
  return card;
}

const STATUS = { done: "Done", "on-track": "On track", partial: "In progress", todo: "To do" };

function ossdCard(courses, rerender) {
  const p = ossdProgress(courses);
  const card = el(`<section class="card ossd-card">
    <div class="tool-heading"><div><h2>Diploma tracker</h2><p class="small muted">OSSD · for students who started Grade 9 in 2024 or later</p></div></div>
    <div class="ossd-summary">
      <div><b>${p.credits}</b><span>/ ${TOTAL_CREDITS} credits</span></div>
      <div><b>${p.compulsoryLeft}</b><span>compulsory left</span></div>
      <div><b>${p.literacy ? "✓" : "—"}</b><span>literacy</span></div>
      <div><b>${p.online}/2</b><span>online</span></div>
    </div>
    <div class="bar-track ossd-bar"><i style="width:${(p.credits / TOTAL_CREDITS) * 100}%"></i></div>
    <p class="small muted">${p.prior ? `${p.prior} earned before this year + ` : ""}${p.onTrack} in progress on TeachAssist this year. Courses you're taking now count once you pass them — this is an estimate, not your official transcript. Tick off anything you finished in earlier years.</p>
    <details class="req-details"><summary>Compulsory credits · ${p.compulsoryLeft} left</summary><ul class="req-list"></ul></details>
    <details><summary>Earlier credits, literacy & online learning</summary>
      <form class="ossd-form">
        <div class="form-grid">
          <div class="field"><label for="o-prior">Credits earned in past years</label><input id="o-prior" name="prior" type="number" min="0" max="34" step="0.5" value="${p.prior}"></div>
          <div class="field"><label for="o-online">Online credits</label><input id="o-online" name="online" type="number" min="0" max="10" step="1" value="${p.online}"></div>
        </div>
        <label class="preference-row"><span>Literacy requirement complete (OSSLT or OSSLC)</span><input type="checkbox" role="switch" name="literacy" ${p.literacy ? "checked" : ""}></label>
        <button class="btn secondary">Save</button>
      </form>
    </details>
  </section>`);
  const list = card.querySelector(".req-list");
  for (const s of p.slots) {
    const item = el(`<li class="req req-${s.status}">
      <label><input type="checkbox" ${s.done ? "checked" : ""} aria-label="Mark ${escapeHtml(s.label)} done"><span class="req-check" aria-hidden="true"></span>
      <span class="req-text"><b>${escapeHtml(s.label)}</b><small>${s.need} credit${s.need === 1 ? "" : "s"}${s.from.length ? ` · ${escapeHtml(s.from.join(", "))}` : ""}</small></span></label>
      <span class="req-status">${STATUS[s.status]}</span></li>`);
    item.querySelector("input").onchange = (e) => {
      const st = ossdState();
      saveOssd({ done: { ...st.done, [s.id]: e.target.checked } });
      rerender();
    };
    list.append(item);
  }
  card.querySelector(".ossd-form").onsubmit = (e) => {
    e.preventDefault();
    const f = e.target.elements;
    saveOssd({ prior: Math.max(0, Number(f.prior.value) || 0), online: Math.max(0, Number(f.online.value) || 0), literacy: f.literacy.checked });
    rerender();
  };
  return card;
}
