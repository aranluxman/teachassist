// ============================================================================
// Course detail (live) — reference style: semicircular gauge carousel +
// Evaluations / Breakdown tabs.
// ============================================================================

import { el, escapeHtml, fmtPercent, semiGauge } from "./courses.js";
import { displayMark, markKind } from "./ta-client.js";
import { COURSE_COLORS } from "./config.js";

let charts = [];
let activeSeg = "evals";

/** Open the detail screen for a (live) course object. */
export async function openCourseDetail(container, course) {
  destroyCharts();
  activeSeg = "evals";
  container.innerHTML = "";

  const evals = (Array.isArray(course.evaluations) ? course.evaluations : []).filter(
    (e) => e && typeof e.percent === "number"
  );
  const mark = displayMark(course);
  const kind = markKind(course);

  // ── Nav ──
  const nav = el(`
    <div class="detail-nav">
      <button class="back-btn">Courses</button>
      <div class="detail-titlewrap">
        <div class="detail-title">${escapeHtml(course.code || "")}</div>
        <div class="detail-subtitle">${escapeHtml(course.name || "")}</div>
      </div>
      <div class="detail-actions"></div>
    </div>
  `);
  nav.querySelector(".back-btn").addEventListener("click", () => window.AppNav.toCourses());
  container.appendChild(nav);

  // ── Carousel: gauge / progression chart / info ──
  const carousel = el(`<div class="carousel" id="d-carousel"></div>`);

  carousel.appendChild(
    el(`
    <div class="panel"><div class="card gauge-card">
      ${semiGauge(mark)}
      ${
        course.midterm != null
          ? `<div class="midterm-pill">Midterm: ${fmtPercent(Number(course.midterm))}</div>`
          : ""
      }
      <div class="gauge-cap">${kind === "midterm" ? "Midterm Mark" : "Current Mark"}</div>
    </div></div>
  `)
  );

  const hasChart = evals.length >= 1 && window.Chart;
  if (hasChart) {
    carousel.appendChild(
      el(`
      <div class="panel"><div class="card gauge-card">
        <div class="muted small" style="font-weight:600;align-self:flex-start">GRADE PROGRESSION</div>
        <div class="chart-box"><canvas id="d-chart"></canvas></div>
      </div></div>
    `)
    );
  }

  carousel.appendChild(
    el(`
    <div class="panel"><div class="card gauge-card">
      <div class="info-list" style="width:100%">
        <div class="info-row"><span>Code</span><span>${escapeHtml(course.code || "—")}</span></div>
        <div class="info-row"><span>Current mark</span><span>${course.currentMark != null ? fmtPercent(Number(course.currentMark)) : "—"}</span></div>
        <div class="info-row"><span>Midterm</span><span>${course.midterm != null ? fmtPercent(Number(course.midterm)) : "—"}</span></div>
        <div class="info-row"><span>Evaluations</span><span>${evals.length}</span></div>
      </div>
    </div></div>
  `)
  );
  container.appendChild(carousel);

  // dots
  const nPanels = carousel.querySelectorAll(".panel").length;
  const dots = el(
    `<div class="dots">${Array.from({ length: nPanels }, (_, i) => `<span class="dot ${i === 0 ? "active" : ""}"></span>`).join("")}</div>`
  );
  container.appendChild(dots);
  carousel.addEventListener("scroll", () => {
    const i = Math.round(carousel.scrollLeft / carousel.clientWidth);
    dots.querySelectorAll(".dot").forEach((d, idx) => d.classList.toggle("active", idx === i));
  });

  // ── Segmented: Evaluations / Breakdown ──
  const seg = el(`
    <div class="segmented">
      <button data-seg="evals">Evaluations</button>
      <button data-seg="breakdown">Breakdown</button>
    </div>
  `);
  const content = el(`<div id="seg-content"></div>`);
  container.appendChild(seg);
  container.appendChild(content);

  const show = (s) => {
    activeSeg = s;
    seg.querySelectorAll("button").forEach((b) => b.classList.toggle("active", b.dataset.seg === s));
    content.innerHTML = "";
    content.appendChild(s === "evals" ? buildEvals(evals, kind) : buildBreakdown(evals));
  };
  seg.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => show(b.dataset.seg)));
  show(activeSeg);

  if (hasChart) drawProgress(container, evals);
}

// ── Evaluations list (colored icon + name + percent + chevron) ──
function buildEvals(evals, kind) {
  const frag = document.createElement("div");
  if (!evals.length) {
    frag.appendChild(
      el(`<div class="empty centered"><div class="empty-title">No evaluations yet</div>${
        kind === "midterm"
          ? "Showing the midterm mark — individual assessments aren't posted yet."
          : 'This course shows "please see teacher" on TeachAssist.'
      }</div>`)
    );
    return frag;
  }
  evals.forEach((e, i) => {
    const color = COURSE_COLORS[i % COURSE_COLORS.length];
    const letter = (e.name || e.category || "?").trim().charAt(0).toUpperCase();
    frag.appendChild(
      el(`
      <div class="card eval-row">
        <div class="icon-circle" style="width:38px;height:38px;min-width:38px;font-size:15px;background:${color}">${escapeHtml(letter)}</div>
        <div class="eval-main">
          <div class="eval-name">${escapeHtml(e.name || e.category || "Assessment")}</div>
          ${e.category && e.category !== e.name ? `<div class="eval-sub">${escapeHtml(e.category)}</div>` : ""}
        </div>
        <div class="row-value">${fmtPercent(e.percent)}</div>
        <span class="chevron"></span>
      </div>
    `)
    );
  });
  return frag;
}

// ── Breakdown (weight-focused) ──
function buildBreakdown(evals) {
  const frag = document.createElement("div");
  if (!evals.length) {
    frag.appendChild(el(`<div class="empty centered"><div class="empty-title">No breakdown available</div></div>`));
    return frag;
  }
  const allZero = evals.every((e) => !e.percent);
  if (allZero) {
    frag.appendChild(
      el(`<div class="card" style="margin-bottom:12px;background:var(--accent-tint);box-shadow:none">
        <div class="muted small" style="color:var(--text)">Your teacher hasn't posted assignment marks yet, so percentages are 0%. The weightings below are from TeachAssist.</div>
      </div>`)
    );
  }
  const rows = el(`<div class="rows"></div>`);
  evals.forEach((e) =>
    rows.appendChild(
      el(`<div class="row" style="cursor:default">
        <div class="row-main"><div class="row-title">${escapeHtml(e.name || e.category || "")}</div>
        <div class="row-sub">Weight ${escapeHtml(String(e.weight ?? 0))}</div></div>
        <div class="row-value">${fmtPercent(e.percent)}</div>
      </div>`)
    )
  );
  frag.appendChild(rows);
  return frag;
}

// ── Grade Progression chart (running average) ──
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

function drawProgress(container, evals) {
  const canvas = container.querySelector("#d-chart");
  if (!canvas || !window.Chart) return;
  const accent =
    getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#4f46e5";
  const running = [];
  let sum = 0;
  evals.forEach((e, i) => {
    sum += e.percent;
    running.push(Math.round((sum / (i + 1)) * 10) / 10);
  });
  const lo = Math.max(0, Math.floor(Math.min(...running, ...evals.map((e) => e.percent))) - 4);
  const ctx = canvas.getContext("2d");
  const grad = ctx.createLinearGradient(0, 0, 0, 180);
  grad.addColorStop(0, accent + "40");
  grad.addColorStop(1, accent + "00");
  charts.push(
    new window.Chart(canvas, {
      type: "line",
      data: {
        labels: running.map((_, i) => i + 1),
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
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { displayColors: false } },
        scales: {
          y: { min: lo, max: 100, ticks: { callback: (v) => v + "%", maxTicksLimit: 5, color: "#9a9aa2" }, grid: { color: "rgba(127,127,127,0.15)", drawTicks: false }, border: { display: false } },
          x: { grid: { display: false }, ticks: { color: "#9a9aa2" }, border: { display: false } },
        },
      },
    })
  );
}
