// ============================================================================
// Science course detail
// ----------------------------------------------------------------------------
// A self-contained Science marks page that follows the same app shell,
// section, card, row, table, and Chart.js language as the TeachAssist dashboard.
// ============================================================================

import { el, escapeHtml, fmtPercent } from "./courses.js";

const SCIENCE_COURSE = {
  title: "Science",
  subtitle: "Grade 9 Science Performance Overview",
  calculatedMark: 93.4,
  termWork: 95.7,
  culminatingWork: 87.9,
  termEntries: 18,
  culminatingTasks: 2,
  expectationsTracked: 10,
  highestWeightedExpectation: 105.0,
  lowestWeightedExpectation: 88.3,
};

const EXPECTATIONS = [
  {
    code: "A1",
    strand: "STEM Skills, Careers, and Connections",
    expectation: "STEM Investigation Skills",
    mark: 88.3,
    weight: 3,
  },
  {
    code: "A2",
    strand: "STEM Skills, Careers, and Connections",
    expectation: "Applications, Careers, and Connections",
    mark: null,
    weight: 0,
  },
  {
    code: "B1",
    strand: "Biology",
    expectation: "Relating Science to Our Changing World",
    mark: 101.7,
    weight: 2,
  },
  {
    code: "B2",
    strand: "Biology",
    expectation: "Investigating and Understanding Concepts",
    mark: 101.7,
    weight: 2,
  },
  {
    code: "C1",
    strand: "Chemistry",
    expectation: "Relating Science to Our Changing World",
    mark: 90.2,
    weight: 4,
  },
  {
    code: "C2",
    strand: "Chemistry",
    expectation: "Investigating and Understanding Concepts",
    mark: 94.1,
    weight: 4,
  },
];

let expectationsChart = null;

export async function renderScienceAnalytics(container) {
  destroyScienceChart();
  container.innerHTML = "";
  container.appendChild(buildBreadcrumb());
  container.appendChild(buildCourseHeader());
  container.appendChild(buildSummaryCards());
  container.appendChild(buildChartSection());
  container.appendChild(buildExpectationsTable());
  renderScienceTrendChart(container);
}

function buildBreadcrumb() {
  const node = el(`
    <nav class="science-breadcrumb" aria-label="Courses / Science">
      <button type="button" class="science-back-link">Courses</button>
      <span aria-hidden="true">/</span>
      <span>Science</span>
    </nav>
  `);
  node.querySelector(".science-back-link").addEventListener("click", () => window.AppNav.toCourses());
  return node;
}

function buildCourseHeader() {
  return el(`
    <section class="card science-course-hero" aria-labelledby="science-title">
      <div class="science-course-copy">
        <h1 id="science-title">${escapeHtml(SCIENCE_COURSE.title)}</h1>
        <p>${escapeHtml(SCIENCE_COURSE.subtitle)}</p>
        <div class="science-mini-meta" aria-label="Course metadata">
          <span>${SCIENCE_COURSE.termEntries} term assessment entries</span>
          <span>${SCIENCE_COURSE.culminatingTasks} culminating tasks</span>
          <span>${SCIENCE_COURSE.expectationsTracked} overall expectations tracked</span>
        </div>
      </div>
      <div class="science-main-mark" aria-label="Calculated mark">
        <span class="science-main-mark-value tnum">${fmtPercent(SCIENCE_COURSE.calculatedMark)}</span>
        <span class="science-main-mark-label">Calculated Mark</span>
      </div>
      <div class="science-work-split" aria-label="Science mark components">
        <div>
          <span>Term Work</span>
          <strong class="tnum">${fmtPercent(SCIENCE_COURSE.termWork)}</strong>
        </div>
        <div>
          <span>Culminating Work</span>
          <strong class="tnum">${fmtPercent(SCIENCE_COURSE.culminatingWork)}</strong>
        </div>
      </div>
    </section>
  `);
}

function buildSummaryCards() {
  const atOrAbove = expectationsAtOrAbove100(EXPECTATIONS);
  const cards = [
    ["Calculated Mark", fmtPercent(SCIENCE_COURSE.calculatedMark)],
    ["Term Work", fmtPercent(SCIENCE_COURSE.termWork)],
    ["Culminating Work", fmtPercent(SCIENCE_COURSE.culminatingWork)],
    ["Highest weighted expectation", fmtPercent(SCIENCE_COURSE.highestWeightedExpectation)],
    ["Lowest weighted expectation", fmtPercent(SCIENCE_COURSE.lowestWeightedExpectation)],
    ["Expectations at or above 100%", String(atOrAbove)],
  ];

  return el(`
    <section aria-labelledby="science-summary-title">
      <div class="section-label" id="science-summary-title">Summary</div>
      <div class="science-summary-grid">
        ${cards
          .map(
            ([label, value]) => `
              <article class="card science-summary-card">
                <span>${escapeHtml(label)}</span>
                <strong class="tnum">${escapeHtml(value)}</strong>
              </article>`
          )
          .join("")}
      </div>
    </section>
  `);
}

export function expectationsAtOrAbove100(expectations = EXPECTATIONS) {
  return expectations.filter((item) => typeof item.mark === "number" && item.mark >= 100).length;
}

function buildChartSection() {
  return el(`
    <section aria-labelledby="science-chart-title">
      <div class="section-label" id="science-chart-title">Analytics</div>
      <div class="card science-chart-card">
        <div class="muted small science-chart-label">EXPECTATION PERFORMANCE</div>
        <div class="chart-box science-chart-box"><canvas id="science-expectations-chart"></canvas></div>
      </div>
    </section>
  `);
}

function buildExpectationsTable() {
  const rows = EXPECTATIONS.map(
    (item) => `
      <tr>
        <td class="expectation-code">${escapeHtml(item.code)}</td>
        <td>${escapeHtml(item.strand)}</td>
        <td>${escapeHtml(`${item.code}. ${item.expectation}`)}</td>
        <td class="tnum">${item.mark == null ? "No mark shown" : fmtPercent(item.mark)}</td>
        <td class="tnum">${escapeHtml(String(item.weight))}</td>
        <td>${expectationStatus(item)}</td>
      </tr>`
  ).join("");

  return el(`
    <section aria-labelledby="overall-expectations-title">
      <div class="section-label" id="overall-expectations-title">Overall Expectations</div>
      <div class="card expectations-table-card">
        <div class="expectations-table-wrap">
          <table class="expectations-table" id="overall-expectations-table">
            <thead>
              <tr>
                <th scope="col">Code</th>
                <th scope="col">Strand</th>
                <th scope="col">Expectation</th>
                <th scope="col">Mark</th>
                <th scope="col">Weight</th>
                <th scope="col">Status</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>
    </section>
  `);
}

function expectationStatus(item) {
  if (item.weight === 0 || item.mark == null) return '<span class="status-pill neutral">Not weighted</span>';
  if (item.mark >= 100) return '<span class="status-pill strong">Above target</span>';
  if (item.mark >= 90) return '<span class="status-pill good">On track</span>';
  return '<span class="status-pill watch">Watch</span>';
}

export function renderScienceTrendChart(container) {
  const canvas = container.querySelector("#science-expectations-chart");
  if (!canvas || !window.Chart) return;

  const chartRows = EXPECTATIONS.filter((item) => typeof item.mark === "number");
  const accent =
    getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#4f46e5";
  const good =
    getComputedStyle(document.documentElement).getPropertyValue("--good").trim() || "#34c759";
  const warning =
    getComputedStyle(document.documentElement).getPropertyValue("--accent-3").trim() || "#ff7a59";

  expectationsChart = new window.Chart(canvas, {
    type: "bar",
    data: {
      labels: chartRows.map((item) => item.code),
      datasets: [
        {
          data: chartRows.map((item) => item.mark),
          backgroundColor: chartRows.map((item) =>
            item.mark >= 100 ? good : item.mark >= 90 ? accent : warning
          ),
          borderRadius: 7,
          maxBarThickness: 30,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { displayColors: false } },
      scales: {
        y: {
          min: 80,
          max: 110,
          ticks: { callback: (value) => value + "%", maxTicksLimit: 5, color: "#9a9aa2" },
          grid: { color: "rgba(0,0,0,0.05)", drawTicks: false },
          border: { display: false },
        },
        x: {
          grid: { display: false },
          ticks: { color: "#9a9aa2" },
          border: { display: false },
        },
      },
    },
  });
}

function destroyScienceChart() {
  if (!expectationsChart) return;
  expectationsChart.destroy();
  expectationsChart = null;
}
