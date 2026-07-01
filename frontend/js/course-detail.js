// ============================================================================
// Course detail — semicircular gauge carousel + Evaluations / Breakdown tabs.
// ----------------------------------------------------------------------------
// Evaluations are rendered TeachAssist-style: each assessment shows its
// Ontario achievement category (Knowledge/Understanding, Thinking,
// Communication, Application, Final/Culminating) as a colour-coded pill, plus
// its weight, date and teacher feedback when available. The Breakdown tab
// aggregates a weighted average per category with strand-coloured bars.
// ============================================================================

import { el, escapeHtml, fmtPercent, semiGauge } from "./courses.js";
import { displayMark, markKind } from "./ta-client.js";

let charts = [];
let activeSeg = "evals";

/** Map a category label to its strand key: k / t / c / a / f (or ""). */
export function strandKey(category) {
  const s = String(category || "").toLowerCase();
  if (/knowledge|understanding/.test(s)) return "k";
  if (/think/.test(s)) return "t";
  if (/communicat/.test(s)) return "c";
  if (/applicat/.test(s)) return "a";
  if (/final|culminat|exam|other/.test(s)) return "f";
  return "";
}

/** Short display label for a category ("Knowledge/Understanding" -> "K/U"). */
function strandShort(category) {
  return (
    { k: "K/U", t: "Thinking", c: "Comm", a: "App", f: "Final" }[strandKey(category)] ||
    category ||
    ""
  );
}

function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  if (isNaN(d)) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function catPill(category) {
  const key = strandKey(category);
  return `<span class="cat-pill ${key ? `cat-${key}` : ""}" title="${escapeHtml(category || "")}">${escapeHtml(strandShort(category))}</span>`;
}

/** Open the detail screen for a (live or demo) course object. */
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
        ${course.teacher ? `<div class="info-row"><span>Teacher</span><span>${escapeHtml(course.teacher)}</span></div>` : ""}
        ${course.block ? `<div class="info-row"><span>Block</span><span>${escapeHtml(course.block)}</span></div>` : ""}
        ${course.room ? `<div class="info-row"><span>Room</span><span>${escapeHtml(course.room)}</span></div>` : ""}
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

// ── Evaluations list (strand-tinted icon + name + pill/weight/date + %) ──
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
  evals.forEach((e) => {
    const key = strandKey(e.category) || "f";
    const letter = (e.name || e.category || "?").trim().charAt(0).toUpperCase();
    const meta = [];
    if (e.category) meta.push(catPill(e.category));
    if (e.weight != null) meta.push(`<span>Weight ${escapeHtml(String(e.weight))}</span>`);
    const date = fmtDate(e.date);
    if (date) meta.push(`<span>${escapeHtml(date)}</span>`);
    frag.appendChild(
      el(`
      <div class="card eval-row">
        <div class="icon-circle" style="width:38px;height:38px;min-width:38px;font-size:15px;background:var(--strand-${key}-tint);color:var(--strand-${key});text-shadow:none">${escapeHtml(letter)}</div>
        <div class="eval-main">
          <div class="eval-name">${escapeHtml(e.name || e.category || "Assessment")}</div>
          ${meta.length ? `<div class="eval-sub">${meta.join("")}</div>` : ""}
          ${e.feedback ? `<div class="eval-feedback">“${escapeHtml(e.feedback)}”</div>` : ""}
        </div>
        <div class="row-value">${fmtPercent(e.percent)}</div>
      </div>
    `)
    );
  });
  return frag;
}

/** Weighted average per achievement category, in TeachAssist strand order. */
export function strandBreakdown(evals) {
  const order = ["k", "t", "c", "a", "f"];
  const names = {
    k: "Knowledge/Understanding",
    t: "Thinking",
    c: "Communication",
    a: "Application",
    f: "Final/Culminating",
  };
  const acc = {};
  for (const e of evals) {
    if (typeof e.percent !== "number") continue;
    const key = strandKey(e.category) || "f";
    const w = typeof e.weight === "number" && e.weight > 0 ? e.weight : 1;
    acc[key] ||= { sum: 0, weight: 0, count: 0 };
    acc[key].sum += e.percent * w;
    acc[key].weight += w;
    acc[key].count += 1;
  }
  return order
    .filter((key) => acc[key])
    .map((key) => ({
      key,
      name: names[key],
      average: acc[key].sum / acc[key].weight,
      weight: acc[key].weight,
      count: acc[key].count,
    }));
}

// ── Breakdown (weighted per-category bars) ──
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
        <div class="small" style="color:var(--text)">Your teacher hasn't posted assignment marks yet, so percentages are 0%. The weightings below are from TeachAssist.</div>
      </div>`)
    );
  }

  const strands = strandBreakdown(evals);
  const card = el(`<div class="card" style="padding:6px var(--gap)"></div>`);
  strands.forEach((s) => {
    card.appendChild(
      el(`
      <div class="strand-row">
        <div class="strand-head">
          <span class="strand-name">${escapeHtml(s.name)}</span>
          <span class="strand-value tnum">${fmtPercent(s.average)}</span>
        </div>
        <div class="strand-meta">${s.count} assessment${s.count === 1 ? "" : "s"} · weight ${Math.round(s.weight * 10) / 10}</div>
        <div class="bar-track"><i class="bar-fill cat-${s.key}" style="width:${Math.max(0, Math.min(100, s.average))}%"></i></div>
      </div>
    `)
    );
  });
  frag.appendChild(card);

  // Every individual entry with its weight, for the fine print.
  frag.appendChild(el(`<div class="section-label">All entries</div>`));
  const rows = el(`<div class="rows"></div>`);
  evals.forEach((e) =>
    rows.appendChild(
      el(`<div class="row" style="cursor:default">
        <div class="row-main"><div class="row-title">${escapeHtml(e.name || e.category || "")}</div>
        <div class="row-sub">${e.category ? `${escapeHtml(e.category)} · ` : ""}Weight ${escapeHtml(String(e.weight ?? 0))}</div></div>
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
  const styles = getComputedStyle(document.documentElement);
  const accent = styles.getPropertyValue("--accent").trim() || "#4338ca";
  const tick = styles.getPropertyValue("--text-faint").trim() || "#64748b";
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
          y: { min: lo, max: 100, ticks: { callback: (v) => v + "%", maxTicksLimit: 5, color: tick }, grid: { color: "rgba(127,127,127,0.15)", drawTicks: false }, border: { display: false } },
          x: { grid: { display: false }, ticks: { color: tick }, border: { display: false } },
        },
      },
    })
  );
}
