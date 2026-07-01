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
      { label: "Community involvement hours", sub: "The 40-hour requirement and what counts", url: "https://www2.yrdsb.ca/schools-programs/community-involvement-hours" },
      { label: "OUInfo — Ontario universities", sub: "Programs, prerequisites, admission averages", url: "https://www.ontariouniversitiesinfo.ca" },
      { label: "ontariocolleges.ca", sub: "Explore and apply to Ontario college programs", url: "https://www.ontariocolleges.ca" },
    ],
  },
  {
    group: "Academics",
    items: [
      { label: "OSSLT information", sub: "The literacy test: format and practice", url: "https://www.eqao.com/the-assessments/osslt/" },
      { label: "TVO Learn — course support", sub: "Free Ontario-curriculum lessons and review", url: "https://www.tvolearn.com" },
      { label: "Summer school & night school", sub: "YRDSB continuing education options", url: "https://www2.yrdsb.ca/schools-programs/continuing-education" },
    ],
  },
  {
    group: "Support",
    items: [
      { label: "YRDSB Guidance & Student Services", sub: "Counselling and student support", url: "https://www2.yrdsb.ca/student-support/guidance-student-services" },
      { label: "YRDSB Mental Health resources", sub: "Wellbeing and crisis supports", url: "https://www2.yrdsb.ca/student-support/mental-health-wellbeing" },
      { label: "Kids Help Phone", sub: "24/7 support — call 1-800-668-6868 or text 686868", url: "https://kidshelpphone.ca" },
      { label: "One Stop Talk", sub: "Free virtual counselling for Ontario youth", url: "https://onestoptalk.ca" },
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
