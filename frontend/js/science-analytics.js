// ============================================================================
// Science marks analytics
// ----------------------------------------------------------------------------
// Minimal science-only dashboard built from the live TeachAssist course payload.
// ============================================================================

import { el, escapeHtml, fmtPercent, skeletonCards } from "./courses.js";
import { getCourses, overallAverage, displayMark, markKind } from "./ta-client.js";
import { COURSE_COLORS } from "./config.js";

export const scienceCoursePrefixes = ["SNC", "SBI", "SCH", "SPH", "SES", "SVN"];

let scienceTrendChart = null;

export async function renderScienceAnalytics(container, { refresh = false } = {}) {
  container.innerHTML = `<div class="screen-header"><h1>Science Marks</h1></div>${skeletonCards(3)}`;

  let courses;
  try {
    courses = await getCourses({ refresh });
  } catch (err) {
    container.innerHTML = "";
    container.appendChild(el(`<div class="screen-header"><h1>Science Marks</h1></div>`));
    container.appendChild(
      el(`
        <div class="empty centered">
          <div class="empty-title">Couldn't load science marks</div>
          ${escapeHtml(err.message || "Please try again.")}
        </div>
      `)
    );
    const retry = el(`<button class="btn" style="margin-top:8px">Try again</button>`);
    retry.addEventListener("click", () => renderScienceAnalytics(container, { refresh: true }));
    container.appendChild(retry);
    return;
  }

  const state = buildScienceState(courses);
  destroyScienceChart();

  container.innerHTML = "";
  container.appendChild(buildHeader(container));

  if (!state.courses.length) {
    container.appendChild(
      el(`
        <div class="empty centered">
          <div class="empty-icon science-empty-icon">${scienceIcon()}</div>
          <div class="empty-title">No science courses yet</div>
          Science courses are detected from SNC, SBI, SCH, SPH, SES, and SVN codes.
        </div>
      `)
    );
    return;
  }

  container.appendChild(buildScienceHero(state));
  container.appendChild(buildMetrics(state));
  container.appendChild(buildTrendCard(state));
  container.appendChild(buildInsights(state));
  container.appendChild(buildCourseList(state));
  renderScienceTrendChart(container, state);
}

function buildScienceState(courses) {
  const scienceCourses = (courses || []).filter(isScienceCourse);
  const courseSummaries = scienceCourses.map((course, index) => {
    const evaluations = normalizedEvaluations(course);
    return {
      course,
      evaluations,
      mark: displayMark(course),
      source: markKind(course) || "none",
      color: COURSE_COLORS[index % COURSE_COLORS.length],
    };
  });

  const scienceAverage = overallAverage(scienceCourses);
  const target = nextScienceTarget(scienceAverage);

  return {
    courses: scienceCourses,
    courseSummaries,
    evaluations: courseSummaries.flatMap((item) => item.evaluations),
    scienceAverage,
    target,
  };
}

function normalizedEvaluations(course) {
  return (Array.isArray(course.evaluations) ? course.evaluations : []).filter(
    (evaluation) => evaluation && typeof evaluation.percent === "number"
  );
}

function isScienceCourse(course) {
  const code = String(course.code || "").trim().toUpperCase();
  const name = String(course.name || "").trim().toUpperCase();
  return scienceCoursePrefixes.some((prefix) => code.startsWith(prefix)) || name.includes("SCIENCE");
}

function nextScienceTarget(mark) {
  if (mark == null) return null;
  const targets = [50, 60, 70, 80, 90, 95, 100];
  return targets.find((target) => mark < target) || 100;
}

function buildHeader(container) {
  const header = el(`
    <div class="screen-header analytics-header">
      <h1>Science Marks</h1>
      <button class="btn ghost" id="science-refresh" style="width:auto;padding:6px 10px" aria-label="Refresh science marks">Refresh</button>
    </div>
  `);
  header
    .querySelector("#science-refresh")
    .addEventListener("click", () => renderScienceAnalytics(container, { refresh: true }));
  return header;
}

function buildScienceHero(state) {
  const average = state.scienceAverage;
  const targetText =
    average == null || state.target == null
      ? "Add marks"
      : `${Math.max(0, state.target - average).toFixed(1)} pts to ${state.target}%`;

  return el(`
    <section class="card science-hero" aria-label="Science Average">
      <div class="science-hero-label">Overall Average</div>
      <div class="science-average tnum">${fmtPercent(average)}</div>
      <div class="science-target">Next target: ${escapeHtml(targetText)}</div>
    </section>
  `);
}

function buildMetrics(state) {
  const graded = state.courseSummaries.filter((item) => item.mark != null).length;
  const completed = state.evaluations.length;
  const strongest = strongestCategory(state);

  return el(`
    <section class="metric-grid" aria-label="Science summary">
      <div class="card metric-card">
        <span>Courses</span>
        <strong class="tnum">${state.courses.length}</strong>
      </div>
      <div class="card metric-card">
        <span>With marks</span>
        <strong class="tnum">${graded}</strong>
      </div>
      <div class="card metric-card">
        <span>Evaluations</span>
        <strong class="tnum">${completed}</strong>
      </div>
      <div class="card metric-card">
        <span>Strongest</span>
        <strong>${escapeHtml(strongest)}</strong>
      </div>
    </section>
  `);
}

function strongestCategory(state) {
  const byCategory = new Map();
  for (const evaluation of state.evaluations) {
    const key = evaluation.category || "Assessments";
    const row = byCategory.get(key) || { total: 0, count: 0 };
    row.total += evaluation.percent;
    row.count += 1;
    byCategory.set(key, row);
  }

  const best = [...byCategory.entries()]
    .map(([name, row]) => ({ name, average: row.total / row.count }))
    .sort((a, b) => b.average - a.average)[0];
  return best ? best.name : "Not yet";
}

function buildTrendCard(state) {
  const trend = scienceTrend(state);
  return el(`
    <section class="card analytics-card">
      <div class="analytics-card-head">
        <div>
          <h2>Mark Trend</h2>
          <p>${escapeHtml(trend)}</p>
        </div>
      </div>
      <div class="chart-box science-chart-box"><canvas id="science-trend-chart"></canvas></div>
    </section>
  `);
}

function scienceTrend(state) {
  const points = buildScienceTrendPoints(state);
  if (points.length < 2) return "Add more evaluations to build a trend.";
  const change = points.at(-1).mark - points.at(-2).mark;
  if (Math.abs(change) < 0.05) return "Holding steady from the last update.";
  return `${change > 0 ? "Up" : "Down"} ${Math.abs(change).toFixed(1)} pts from the last update.`;
}

export function buildScienceInsights(state) {
  const rows = state.courseSummaries
    .filter((item) => item.mark != null)
    .sort((a, b) => b.mark - a.mark);

  const top = rows[0];
  const focus = rows.at(-1);
  const target =
    state.scienceAverage == null || state.target == null
      ? "Add one science mark to unlock targets."
      : `${Math.max(0, state.target - state.scienceAverage).toFixed(1)} points away from ${state.target}%.`;

  return [
    ["Best course", top ? `${top.course.code}: ${fmtPercent(top.mark)}` : "No marks yet"],
    ["Focus course", focus ? `${focus.course.code}: ${fmtPercent(focus.mark)}` : "No marks yet"],
    ["Next target", target],
  ];
}

function buildInsights(state) {
  const rows = buildScienceInsights(state)
    .map(
      ([label, value]) => `
        <div class="info-row">
          <span>${escapeHtml(label)}</span>
          <span>${escapeHtml(value)}</span>
        </div>`
    )
    .join("");

  return el(`
    <section>
      <div class="section-label">Science Analytics</div>
      <div class="rows science-insights">${rows}</div>
    </section>
  `);
}

function buildCourseList(state) {
  const node = el(`
    <section>
      <div class="section-label">Courses</div>
      <div class="rows"></div>
    </section>
  `);
  const rows = node.querySelector(".rows");

  state.courseSummaries.forEach((item) => {
    const source = item.source || "mark";
    const row = el(`
      <button class="row science-course-row">
        <span class="analytics-dot" style="background:${item.color}"></span>
        <span class="row-main">
          <span class="row-title">${escapeHtml(item.course.code || "Science")}</span>
          <span class="row-sub">${escapeHtml(item.course.name || source)}</span>
          <span class="analytics-bar" aria-hidden="true">
            <span style="width:${markWidth(item.mark)}%"></span>
          </span>
        </span>
        <span class="row-value">${fmtPercent(item.mark)}</span>
        <span class="chevron"></span>
      </button>
    `);
    row.addEventListener("click", () => window.AppNav.toDetail(item.course));
    rows.appendChild(row);
  });

  return node;
}

function buildScienceTrendPoints(state) {
  const evaluations = state.courseSummaries.flatMap((summary) =>
    summary.evaluations.map((evaluation, index) => ({
      label: shortLabel(evaluation.name || summary.course.code || "Mark", index),
      percent: evaluation.percent,
    }))
  );

  const points = [];
  let sum = 0;
  evaluations.forEach((evaluation, index) => {
    sum += evaluation.percent;
    points.push({
      label: evaluation.label || `Mark ${index + 1}`,
      mark: sum / (index + 1),
    });
  });
  return points;
}

export function renderScienceTrendChart(container, state) {
  const canvas = container.querySelector("#science-trend-chart");
  if (!canvas || !window.Chart) return;

  const points = buildScienceTrendPoints(state);
  if (!points.length) {
    canvas.replaceWith(
      el(`<div class="muted science-chart-empty">Add science evaluations to see your trend.</div>`)
    );
    return;
  }

  const accent =
    getComputedStyle(document.documentElement).getPropertyValue("--accent-2").trim() || "#0f9f8f";
  const ys = points.map((point) => Math.round(point.mark * 10) / 10);
  const lo = Math.max(0, Math.floor(Math.min(...ys)) - 3);
  const hi = Math.min(100, Math.ceil(Math.max(...ys)) + 2);

  const ctx = canvas.getContext("2d");
  const grad = ctx.createLinearGradient(0, 0, 0, canvas.clientHeight || 186);
  grad.addColorStop(0, accent + "3d");
  grad.addColorStop(1, accent + "00");

  scienceTrendChart = new window.Chart(canvas, {
    type: "line",
    data: {
      labels: points.map((point) => point.label),
      datasets: [
        {
          data: ys,
          borderColor: accent,
          backgroundColor: grad,
          fill: true,
          tension: 0.35,
          pointRadius: 2.5,
          pointHoverRadius: 5,
          pointBackgroundColor: accent,
          pointBorderColor: "#fff",
          pointBorderWidth: 1.5,
          borderWidth: 2.5,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { displayColors: false } },
      scales: {
        y: {
          min: lo,
          max: hi,
          ticks: { callback: (value) => value + "%", maxTicksLimit: 5, color: "#9a9aa2" },
          grid: { color: "rgba(0,0,0,0.05)", drawTicks: false },
          border: { display: false },
        },
        x: {
          grid: { display: false },
          ticks: { color: "#9a9aa2", maxRotation: 0, autoSkipPadding: 16 },
          border: { display: false },
        },
      },
    },
  });
}

function destroyScienceChart() {
  if (!scienceTrendChart) return;
  scienceTrendChart.destroy();
  scienceTrendChart = null;
}

function shortLabel(name, index) {
  const text = String(name || `Mark ${index + 1}`).trim();
  return text.length > 10 ? `${text.slice(0, 9)}...` : text;
}

function markWidth(mark) {
  if (mark == null || Number.isNaN(mark)) return 0;
  return Math.max(0, Math.min(100, Math.round(mark)));
}

function scienceIcon() {
  return `<svg viewBox="0 0 48 48" width="42" height="42" fill="none" aria-hidden="true">
    <path d="M20 6v12L10 36c-1.5 2.8.5 6 3.6 6h20.8c3.1 0 5.1-3.2 3.6-6L28 18V6" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M17 29h14" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
    <path d="M17 6h14" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
  </svg>`;
}
