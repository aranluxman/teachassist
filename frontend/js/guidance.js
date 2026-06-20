// ============================================================================
// Guidance tab
// ----------------------------------------------------------------------------
// A small curated set of YRDSB guidance / planning resources. (Static links —
// TeachAssist doesn't expose guidance data to scrape.)
// ============================================================================

import { el, escapeHtml } from "./courses.js";

const RESOURCES = [
  {
    group: "Planning",
    items: [
      { label: "myBlueprint — Pathway Planner", sub: "Course selection & post-secondary planning", url: "https://www.myblueprint.ca" },
      { label: "Graduation requirements (OSSD)", sub: "Credits, literacy, community hours", url: "https://www.ontario.ca/page/high-school-graduation-requirements" },
    ],
  },
  {
    group: "Support",
    items: [
      { label: "YRDSB Guidance & Student Services", sub: "Counselling and student support", url: "https://www2.yrdsb.ca/student-support/guidance-student-services" },
      { label: "YRDSB Mental Health resources", sub: "Wellbeing and crisis supports", url: "https://www2.yrdsb.ca/student-support/mental-health-wellbeing" },
    ],
  },
];

/** Render the Guidance screen. */
export async function renderGuidance(container) {
  container.innerHTML = "";
  container.appendChild(el(`<div class="screen-header"><h1>Guidance</h1></div>`));

  for (const section of RESOURCES) {
    container.appendChild(el(`<div class="section-label">${escapeHtml(section.group)}</div>`));
    const rows = el(`<div class="rows"></div>`);
    for (const item of section.items) {
      const row = el(`
        <button class="row">
          <div class="row-main">
            <div class="row-title">${escapeHtml(item.label)}</div>
            <div class="row-sub">${escapeHtml(item.sub)}</div>
          </div>
          <span class="chevron"></span>
        </button>
      `);
      row.addEventListener("click", () => window.open(item.url, "_blank", "noopener"));
      rows.appendChild(row);
    }
    container.appendChild(rows);
  }

  container.appendChild(
    el(`<div class="muted small" style="text-align:center;margin-top:18px">Talk to your school's guidance department for personalized advice.</div>`)
  );
}
