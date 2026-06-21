// ============================================================================
// Course detail (live) — reference-style layout
// ----------------------------------------------------------------------------
// Header gauge + performance label + midterm, an "Evaluations" list of cards
// (each with its own ring gauge + performance label), and an "Analytics"
// section with a Grade Progression line chart and an Assignment Overview bar
// chart. Renders whatever the Worker returns in `course.evaluations`.
// ============================================================================

import { el, escapeHtml, fmtPercent } from "./courses.js";
import { displayMark, markKind } from "./ta-client.js";

let charts = [];

/** Open the detail screen for a (live) course object. */
export async function openCourseDetail(container, course) {
  destroyCharts();
  container.innerHTML = "";

  const evals = (Array.isArray(course.evaluations) ? course.evaluations : []).filter(
    (e) => e && typeof e.percent === "number"
  );
  const mark = displayMark(course);
  const kind = markKind(course);

  // ── Top nav ──
  const nav = el(`
    <div class="detail-nav">
      <button class="back-btn">Courses</button>
      <span class="detail-title">${escapeHtml(course.code || "")}</span>
      <div class="detail-actions"></div>
    </div>
  `);
  nav.querySelector(".back-btn").addEventListener("click", () => window.AppNav.toCourses());
  container.appendChild(nav);

  // ── Header card: course info + big ring gauge + midterm + performance ──
  const header = el(`
    <div class="card course-hero">
      <div class="hero-info">
        <div class="hero-perf">${escapeHtml(performanceLabel(mark))}</div>
        <div class="hero-name">${escapeHtml(course.name || course.code || "")}</div>
        <div class="hero-sub">${escapeHtml(course.code || "")}</div>
        ${
          course.midterm != null
            ? `<span class="hero-badge">Midterm ${fmtPercent(Number(course.midterm))}</span>`
            : ""
        }
      </div>
      <div class="hero-gauge">${ringGauge(mark, 116, 11)}</div>
    </div>
  `);
  container.appendChild(header);

  // ── Evaluations list ──
  container.appendChild(el(`<div class="section-label">Evaluations</div>`));
  if (!evals.length) {
    container.appendChild(
      el(`<div class="empty centered"><div class="empty-title">No evaluations yet</div>${
        kind === "midterm"
          ? "This course is showing a midterm mark; individual assessments aren't posted yet."
          : 'This course shows "please see teacher" on TeachAssist.'
      }</div>`)
    );
  } else {
    const list = document.createElement("div");
    for (const e of evals) {
      list.appendChild(
        el(`
        <div class="card eval-card">
          <div class="eval-main">
            <div class="eval-name">${escapeHtml(e.name || e.category || "Assessment")}</div>
            <div class="eval-sub">${escapeHtml(
              [performanceLabel(e.percent), e.category && e.category !== e.name ? e.category : ""]
                .filter(Boolean)
                .join(" · ")
            )}${e.weight ? ` · weight ${escapeHtml(String(e.weight))}` : ""}</div>
          </div>
          <div class="eval-ring">${ringGauge(e.percent, 58, 6)}</div>
        </div>
      `)
      );
    }
    container.appendChild(list);
  }

  // ── Analytics: Grade Progression + Assignment Overview ──
  if (evals.length >= 1 && window.Chart) {
    container.appendChild(el(`<div class="section-label">Analytics</div>`));
    container.appendChild(
      el(`
      <div class="card">
        <div class="muted small" style="font-weight:600">GRADE PROGRESSION</div>
        <div class="chart-box"><canvas id="progress-chart"></canvas></div>
      </div>
    `)
    );
    container.appendChild(
      el(`
      <div class="card" style="margin-top:12px">
        <div class="muted small" style="font-weight:600">ASSIGNMENT OVERVIEW</div>
        <div class="chart-box"><canvas id="overview-chart"></canvas></div>
      </div>
    `)
    );
    drawCharts(container, evals);
  }
}

// ───────────────────────────── helpers ─────────────────────────────────────

function performanceLabel(p) {
  if (p == null) return "Not marked yet";
  if (p >= 97) return "Perfect Performance";
  if (p >= 90) return "Excellent Performance";
  if (p >= 85) return "Strong Performance";
  if (p >= 75) return "Good Performance";
  if (p >= 60) return "Fair Performance";
  return "Developing";
}

function ringColor(p) {
  if (p == null) return "var(--track)";
  if (p >= 90) return "#34c759";
  if (p >= 75) return "var(--accent)";
  if (p >= 60) return "#ff9500";
  return "#ff3b30";
}

/** Full-circle ring gauge with the percent centered. */
function ringGauge(percent, size = 58, stroke = 6) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(100, percent ?? 0));
  const dash = (p / 100) * c;
  const cx = size / 2;
  const label = percent == null ? "—" : fmtPercent(percent);
  return `
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="${label}">
      <circle cx="${cx}" cy="${cx}" r="${r}" fill="none" style="stroke:var(--track)" stroke-width="${stroke}"/>
      ${
        p > 0
          ? `<circle cx="${cx}" cy="${cx}" r="${r}" fill="none" stroke="${ringColor(percent)}" stroke-width="${stroke}"
               stroke-linecap="round" stroke-dasharray="${dash} ${c}" transform="rotate(-90 ${cx} ${cx})"/>`
          : ""
      }
      <text x="50%" y="50%" text-anchor="middle" dominant-baseline="central"
        font-size="${Math.round(size * 0.23)}" font-weight="800" style="fill:var(--text)"
        font-family="-apple-system, sans-serif">${label}</text>
    </svg>`;
}

function destroyCharts() {
  for (const c of charts) {
    try {
      c.destroy();
    } catch {
      /* ignore */
    }
  }
  charts = [];
}

function drawCharts(container, evals) {
  const accent =
    getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#2563eb";
  const grid = "rgba(127,127,127,0.15)";
  const tick = "#9a9aa2";

  // Grade Progression: running average across the evaluations (in order).
  const running = [];
  let sum = 0;
  evals.forEach((e, i) => {
    sum += e.percent;
    running.push(Math.round((sum / (i + 1)) * 10) / 10);
  });
  const labels = evals.map((_, i) => i + 1);
  const lo = Math.max(0, Math.floor(Math.min(...running, ...evals.map((e) => e.percent))) - 4);

  const progCanvas = container.querySelector("#progress-chart");
  if (progCanvas) {
    const ctx = progCanvas.getContext("2d");
    const grad = ctx.createLinearGradient(0, 0, 0, 180);
    grad.addColorStop(0, accent + "40");
    grad.addColorStop(1, accent + "00");
    charts.push(
      new window.Chart(progCanvas, {
        type: "line",
        data: {
          labels,
          datasets: [
            {
              data: running,
              borderColor: accent,
              backgroundColor: grad,
              fill: true,
              tension: 0.35,
              pointRadius: 3,
              pointBackgroundColor: accent,
              borderWidth: 2.5,
            },
          ],
        },
        options: chartOpts(lo, 100, tick, grid, true),
      })
    );
  }

  // Assignment Overview: each evaluation's percent as a bar (green ≥90).
  const overCanvas = container.querySelector("#overview-chart");
  if (overCanvas) {
    charts.push(
      new window.Chart(overCanvas, {
        type: "bar",
        data: {
          labels: evals.map((e, i) => shortName(e.name, i)),
          datasets: [
            {
              data: evals.map((e) => Math.round(e.percent * 10) / 10),
              backgroundColor: evals.map((e) => ringColor(e.percent)),
              borderRadius: 6,
              maxBarThickness: 26,
            },
          ],
        },
        options: chartOpts(0, 100, tick, grid, false),
      })
    );
  }
}

function chartOpts(min, max, tick, grid, pct) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false }, tooltip: { displayColors: false } },
    scales: {
      y: {
        min,
        max,
        ticks: { callback: (v) => v + (pct ? "%" : ""), maxTicksLimit: 5, color: tick },
        grid: { color: grid, drawTicks: false },
        border: { display: false },
      },
      x: {
        grid: { display: false },
        ticks: { color: tick, maxRotation: 0, autoSkip: true, autoSkipPadding: 8 },
        border: { display: false },
      },
    },
  };
}

function shortName(name, i) {
  const s = String(name || `#${i + 1}`).trim();
  return s.length > 10 ? s.slice(0, 9) + "…" : s;
}
