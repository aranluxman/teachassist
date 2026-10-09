// ============================================================================
// Volunteer hours — the 40-hour community involvement log.
// Saved per student on this device (same "volunteer" store the old Profile
// sheet used, so existing entries carry over). Schools approve hours
// separately — this is the student's own record for filling in the form.
// ============================================================================

import { el, escapeHtml as esc } from "./courses.js";
import { readStudentData, writeStudentData } from "./student-store.js";
import { icon } from "./schools.js";

export const GOAL = 40;
const FORM_PDF = "https://www2.yrdsb.ca/sites/default/files/2023-06/FOR-communityinvolvement.pdf";
const RULES = "https://www2.yrdsb.ca/schools-programs/secondary-school/course-planning-and-graduation/graduation-requirements/community";

export const volunteerEntries = () =>
  readStudentData("volunteer", []).filter((r) => r && Number.isFinite(r.hours));
export const volunteerTotal = () => volunteerEntries().reduce((s, r) => s + r.hours, 0);

/** Circular progress ring (SVG), value out of max. */
export function ring(value, max, { size = 120, stroke = 11, label = "" } = {}) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, value / max));
  return `<svg class="ring" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="${esc(label || `${value} of ${max}`)}">
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--track)" stroke-width="${stroke}"/>
    <circle class="ring-fill" cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--accent)" stroke-width="${stroke}" stroke-linecap="round"
      stroke-dasharray="${(pct * c).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 ${size / 2} ${size / 2})"/>
  </svg>`;
}

const fmtHours = (h) => (Math.round(h * 100) / 100).toString();

export function renderVolunteer(container) {
  container.innerHTML = "";
  const nav = el(`<div class="detail-nav"><button class="back-btn">Guidance</button><div class="detail-titlewrap"><div class="detail-title">Volunteer hours</div><div class="detail-subtitle">40 hours needed to graduate</div></div><div></div></div>`);
  nav.querySelector(".back-btn").onclick = () => window.AppNav.toGuidance();
  container.append(nav);

  const hero = el(`<section class="card volunteer-hero"></section>`);
  const list = el(`<section class="card"><div class="tool-heading"><h2>Your log</h2><button type="button" class="btn ghost" data-copy>Copy list</button></div><div class="volunteer-list"></div><p class="small muted" role="status"></p></section>`);
  const form = el(`<form class="card volunteer-form">
    <h2>Log hours</h2>
    <div class="field"><label for="vol-activity">Activity</label><input id="vol-activity" name="activity" maxlength="120" placeholder="Food bank sorting" required></div>
    <div class="field"><label for="vol-org">Organization</label><input id="vol-org" name="org" maxlength="120" placeholder="Markham Food Bank"></div>
    <div class="form-grid">
      <div class="field"><label for="vol-date">Date</label><input id="vol-date" name="date" type="date" required></div>
      <div class="field"><label for="vol-hours">Hours</label><input id="vol-hours" name="hours" type="number" min="0.25" max="24" step="0.25" placeholder="3" required></div>
    </div>
    <div class="field"><label for="vol-sup">Supervisor (name / contact)</label><input id="vol-sup" name="supervisor" maxlength="120" placeholder="Jane Lee, 905-555-0100"></div>
    <p role="status" class="small"></p>
    <button class="btn">Add hours</button>
  </form>`);
  const info = el(`<section class="card"><h2>Before you volunteer</h2>
    <ul class="tip-list">
      <li>Get the activity <b>pre-approved</b> by your school — the board's insurance only covers approved hours.</li>
      <li>Paid work, class requirements and court-ordered hours don't count.</li>
      <li>Have your supervisor sign the completion form, then hand it in to Guidance.</li>
    </ul>
    <div class="link-list">
      <a class="link-row" href="${FORM_PDF}" target="_blank" rel="noopener"><span class="link-icon tone-pdf">${icon("doc")}</span><span><b>Community involvement form</b><small>YRDSB · PDF</small></span><span class="chevron"></span></a>
      <a class="link-row" href="${RULES}" target="_blank" rel="noopener"><span class="link-icon tone-board">${icon("globe")}</span><span><b>What counts as hours</b><small>YRDSB · Web page</small></span><span class="chevron"></span></a>
    </div></section>`);
  container.append(hero, form, list, info);
  form.elements.date.valueAsDate = new Date();

  const render = () => {
    const entries = volunteerEntries().sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    const total = entries.reduce((s, r) => s + r.hours, 0);
    const left = Math.max(0, GOAL - total);
    hero.innerHTML = `<div class="ring-wrap">${ring(total, GOAL, { size: 150, stroke: 13, label: `${fmtHours(total)} of ${GOAL} hours` })}<div class="ring-center"><b>${fmtHours(total)}</b><span>of ${GOAL} hrs</span></div></div>
      <div><div class="eyebrow">COMMUNITY INVOLVEMENT</div><h2>${left ? `${fmtHours(left)} hours to go` : "Requirement complete 🎉"}</h2><p class="muted">${entries.length} activit${entries.length === 1 ? "y" : "ies"} logged. ${left ? "About " + Math.ceil(left / 3) + " three-hour shifts left." : "Keep logging — extra hours look great on applications."}</p></div>`;
    const box = list.querySelector(".volunteer-list");
    box.innerHTML = "";
    if (!entries.length) box.append(el(`<p class="muted">No hours yet. Add your first activity above.</p>`));
    for (const row of entries) {
      const item = el(`<div class="log-row"><div class="log-hours">${fmtHours(row.hours)}<small>hrs</small></div><div class="log-main"><b>${esc(row.activity)}</b><p class="small muted">${esc([row.org, row.date ? new Date(row.date + "T00:00").toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "", row.supervisor].filter(Boolean).join(" · "))}</p></div><button class="icon-btn" aria-label="Remove ${esc(row.activity)}">×</button></div>`);
      item.querySelector("button").onclick = () => {
        if (!confirm(`Remove "${row.activity}"?`)) return;
        writeStudentData("volunteer", volunteerEntries().filter((r) => r.id !== row.id));
        render();
      };
      box.append(item);
    }
  };

  form.onsubmit = (e) => {
    e.preventDefault();
    const f = form.elements;
    const entry = { id: crypto.randomUUID(), activity: f.activity.value.trim(), org: f.org.value.trim(), date: f.date.value, hours: Number(f.hours.value), supervisor: f.supervisor.value.trim() };
    if (!entry.activity || !entry.date || !Number.isFinite(entry.hours) || entry.hours <= 0 || entry.hours > 24) return;
    try {
      writeStudentData("volunteer", [...volunteerEntries(), entry]);
      form.reset(); f.date.valueAsDate = new Date();
      form.querySelector("[role=status]").textContent = `Added ${fmtHours(entry.hours)} hours.`;
      render();
    } catch { form.querySelector("[role=status]").textContent = "Could not save. Device storage may be full."; }
  };

  list.querySelector("[data-copy]").onclick = async () => {
    const lines = volunteerEntries().map((r) => [r.date, r.activity, r.org, `${fmtHours(r.hours)} h`, r.supervisor].filter(Boolean).join(" — "));
    const text = `Community involvement hours (${fmtHours(volunteerTotal())}/${GOAL})\n` + lines.join("\n");
    const status = list.querySelector("[role=status]");
    try { await navigator.clipboard.writeText(text); status.textContent = "Copied — paste it into an email or your form."; }
    catch { status.textContent = "Copy isn't available in this browser."; }
  };
  render();
}

