// ============================================================================
// Guidance tab
// ----------------------------------------------------------------------------
// My school (from YRDSB school profiles) · school map & boundaries · OSSD
// tracker · volunteer hours · my counsellor · appointment reminders ·
// verified resource links with icons that say where each one goes.
// ============================================================================

import { appointmentCard } from "./profile.js";
import { el, escapeHtml, openSheet, closeSheet } from "./courses.js";
import { getCourses } from "./ta-client.js";
import { readStudentData, writeStudentData } from "./student-store.js";
import { mySchool, schoolCard, icon } from "./schools.js";
import { ossdProgress, saveOssd, ossdState, TOTAL_CREDITS } from "./ossd.js";
import { volunteerTotal, GOAL, ring } from "./volunteer.js";

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

/** Render the Guidance screen. */
export async function renderGuidance(container) {
  container.innerHTML = "";
  container.append(el(`<div class="screen-header"><div><div class="eyebrow">GUIDANCE</div><h1>Plan your path.</h1><p class="muted dashboard-subtitle">Your school, your diploma, and the people who can help.</p></div></div>`));

  const [school, courses] = await Promise.all([mySchool(), getCourses().catch(() => [])]);

  // Quick tiles
  const p = ossdProgress(courses);
  const hours = volunteerTotal();
  const tiles = el(`<div class="tile-grid">
    <button class="tile" data-go="volunteer"><span class="tile-ring">${ring(hours, GOAL, { size: 56, stroke: 6, label: `${hours} of ${GOAL} volunteer hours` })}</span><span><b>${Math.round(hours * 10) / 10}<small>/${GOAL}</small></b><span>Volunteer hours</span></span></button>
    <button class="tile" data-go="ossd"><span class="tile-ring">${ring(p.credits, TOTAL_CREDITS, { size: 56, stroke: 6, label: `${p.credits} of 30 credits` })}</span><span><b>${p.credits}<small>/${TOTAL_CREDITS}</small></b><span>Credits on track</span></span></button>
    <button class="tile" data-go="map"><span class="tile-icon">${icon("map", 24)}</span><span><b>School map</b><span>Boundaries & info</span></span></button>
  </div>`);
  tiles.querySelector('[data-go="volunteer"]').onclick = () => window.AppNav.toGuidance("volunteer");
  tiles.querySelector('[data-go="map"]').onclick = () => window.AppNav.toGuidance("map");
  tiles.querySelector('[data-go="ossd"]').onclick = () => container.querySelector(".ossd-card")?.scrollIntoView({ behavior: "smooth", block: "start" });
  container.append(tiles);

  // My school
  const schoolSection = el(`<section class="card my-school"><div class="tool-heading"><h2>My school</h2><button class="btn ghost" data-change>${school ? "Change" : "Choose"}</button></div></section>`);
  schoolSection.querySelector("[data-change]").onclick = () => window.AppNav.toGuidance("map");
  if (school) {
    schoolSection.append(schoolCard(school));
    schoolSection.append(el(`<p class="small muted">Guidance office: call the main line and ask for Guidance, or book through your school website.</p>`));
  } else {
    schoolSection.append(el(`<div class="empty-cta">${icon("pin", 28)}<p>Pick your school to see its bell times, principal, phone and official boundary map.</p></div>`));
    const pick = el(`<button class="btn">Find my school</button>`);
    pick.onclick = () => window.AppNav.toGuidance("map");
    schoolSection.append(pick);
  }
  container.append(schoolSection);

  container.append(counsellorCard());
  container.append(ossdCard(courses, () => renderGuidance(container)));
  container.append(appointmentCard());

  for (const section of RESOURCES) {
    container.append(el(`<div class="section-label">${escapeHtml(section.group)}</div>`));
    const list = el(`<div class="card link-list"></div>`);
    section.items.forEach((item) => list.append(linkRow(item)));
    container.append(list);
  }
  container.append(el(`<p class="muted small" style="text-align:center;margin-top:18px">Talk to your school's guidance department for personalized advice.</p>`));
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
    <p class="small muted">${p.onTrack} credit${p.onTrack === 1 ? "" : "s"} from TeachAssist this year${p.prior ? ` + ${p.prior} earned before` : ""}. Tick off anything you finished in earlier years.</p>
    <ul class="req-list"></ul>
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
