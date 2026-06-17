// ============================================================================
// Course detail
// ----------------------------------------------------------------------------
// A swipeable 3-panel carousel (gauge, "mark over time" chart, course info)
// followed by two tabs: Evaluations and Breakdown (categories). Handles
// add/edit/delete of evaluations and categories.
// ============================================================================

import { sb } from "./supabase.js";
import { getCurrentUser } from "./auth.js";
import {
  el,
  escapeHtml,
  fmtDate,
  fmtPercent,
  openSheet,
  closeSheet,
  evalPercent,
  categoryAverage,
  courseMark,
  courseMarkSeries,
  openCourseForm,
  skeletonCards,
} from "./courses.js";

let chartInstance = null; // current Chart.js instance (destroyed on re-render)
let activeSeg = "evals"; // remembered across re-renders within a detail view

/** Open the detail screen for a course into `container`. */
export async function openCourseDetail(container, courseId) {
  activeSeg = "evals";
  container.innerHTML = `<div class="skeleton skel-block" style="margin:8px 0 14px"></div>${skeletonCards(2)}`;

  // Local state + a reload helper used after every mutation.
  const state = { course: null, categories: [], evaluations: [] };

  async function load() {
    const [course, cats, evals] = await Promise.all([
      sb.from("courses").select("*").eq("id", courseId).maybeSingle(),
      sb.from("categories").select("*").eq("course_id", courseId).order("name"),
      sb.from("evaluations").select("*").eq("course_id", courseId),
    ]);
    state.course = course.data;
    state.categories = cats.data || [];
    state.evaluations = evals.data || [];
  }

  async function reload() {
    await load();
    render();
  }

  function render() {
    if (chartInstance) {
      chartInstance.destroy();
      chartInstance = null;
    }
    if (!state.course) {
      container.innerHTML = '<div class="empty">Course not found.</div>';
      return;
    }
    container.innerHTML = "";
    container.appendChild(buildNav(state, reload));
    container.appendChild(buildCarousel(state));
    container.appendChild(buildDots());
    container.appendChild(buildSegmented(state, reload));
    wireCarousel(container);
    drawChart(container, state);
  }

  await load();
  render();
}

// ───────────────────────────── Top nav bar ─────────────────────────────────

function buildNav(state, reload) {
  const nav = el(`
    <div class="detail-nav">
      <button class="back-btn">Courses</button>
      <span class="detail-title">${escapeHtml(state.course.code || "")}</span>
      <div class="detail-actions">
        <button class="btn ghost" style="width:auto;padding:6px 10px">Edit</button>
      </div>
    </div>
  `);
  nav.querySelector(".back-btn").addEventListener("click", () => window.AppNav.toCourses());
  nav
    .querySelector(".detail-actions .btn")
    .addEventListener("click", () => openCourseForm(state.course.id, reload));
  return nav;
}

// ─────────────────────────── Carousel (3 panels) ───────────────────────────

function buildCarousel(state) {
  // Prefer the mark computed from entered evaluations; else the live current
  // mark synced from TeachAssist.
  const computed = courseMark(state.categories, state.evaluations);
  const reported = state.course.current_mark != null ? Number(state.course.current_mark) : null;
  const mark = computed != null ? computed : reported;
  const fromTA = computed == null && reported != null;
  const wrap = el(`<div class="carousel" id="detail-carousel"></div>`);

  // Panel 1 — gauge
  const subBits = [];
  if (state.course.midterm != null) subBits.push("Midterm: " + fmtPercent(Number(state.course.midterm)));
  if (fromTA) subBits.push("from TeachAssist");
  wrap.appendChild(
    el(`
    <div class="panel"><div class="card">
      <div class="gauge-wrap">
        ${gaugeSVG(mark)}
        <div class="gauge-label">Current Mark</div>
        <div class="gauge-sub">${escapeHtml(subBits.join(" · ") || "No mark yet")}</div>
      </div>
    </div></div>
  `)
  );

  // Panel 2 — chart (canvas filled in by drawChart), caption below like the reference
  wrap.appendChild(
    el(`
    <div class="panel"><div class="card">
      <div class="chart-box"><canvas id="mark-chart"></canvas></div>
      <div class="chart-caption">Mark Over Time</div>
    </div></div>
  `)
  );

  // Panel 3 — course info
  const c = state.course;
  const info = [
    ["Period", c.period || "—"],
    ["Room", c.room || "—"],
    ["Teacher", c.teacher || "—"],
    ["Start Date", fmtDate(c.start_date) || "—"],
    ["End Date", fmtDate(c.end_date) || "—"],
    ["Midterm", c.midterm != null ? fmtPercent(Number(c.midterm)) : "—"],
    ["Final", c.final != null ? fmtPercent(Number(c.final)) : "—"],
  ];
  wrap.appendChild(
    el(`
    <div class="panel"><div class="card">
      <div class="info-list" style="width:100%">
        ${info
          .map(
            ([k, val]) =>
              `<div class="info-row"><span>${k}</span><span>${escapeHtml(val)}</span></div>`
          )
          .join("")}
      </div>
    </div></div>
  `)
  );

  return wrap;
}

function buildDots() {
  return el(`
    <div class="dots" id="detail-dots">
      <span class="dot active"></span><span class="dot"></span><span class="dot"></span>
    </div>
  `);
}

/** Update the dot indicators as the carousel is swiped. */
function wireCarousel(container) {
  const carousel = container.querySelector("#detail-carousel");
  const dots = [...container.querySelectorAll("#detail-dots .dot")];
  if (!carousel) return;
  carousel.addEventListener("scroll", () => {
    const i = Math.round(carousel.scrollLeft / carousel.clientWidth);
    dots.forEach((d, idx) => d.classList.toggle("active", idx === i));
  });
}

/**
 * Semicircular SVG gauge. The accent arc fills left→right proportional to the
 * percentage on a light track. `percent` may be null (renders an empty gauge).
 */
function gaugeSVG(percent) {
  const cx = 100,
    cy = 100,
    r = 80,
    sw = 18;
  const clamped = Math.max(0, Math.min(100, percent ?? 0));
  const len = Math.PI * r; // length of the semicircle arc
  const fill = (clamped / 100) * len;
  // sweep-flag 1 draws the arc up and over the TOP (semicircle), left→right.
  const arc = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`;
  return `
    <svg viewBox="0 0 200 116" width="100%" style="max-width:262px" role="img" aria-label="Current mark gauge">
      <defs>
        <linearGradient id="gaugeGrad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="#5b9bff"/>
          <stop offset="1" stop-color="#2563eb"/>
        </linearGradient>
      </defs>
      <path d="${arc}" fill="none" style="stroke:var(--track)" stroke-width="${sw}" stroke-linecap="round"/>
      ${
        clamped > 0
          ? `<path d="${arc}" fill="none" stroke="url(#gaugeGrad)" stroke-width="${sw}"
               stroke-linecap="round" stroke-dasharray="${fill} ${len + 4}"/>`
          : ""
      }
      <text x="100" y="92" text-anchor="middle" font-size="42" font-weight="800"
        letter-spacing="-1" style="fill:var(--text)" font-family="-apple-system, sans-serif">${
          percent == null ? "—" : fmtPercent(percent)
        }</text>
    </svg>`;
}

/** Build the Chart.js line chart inside the already-rendered canvas. */
function drawChart(container, state) {
  const canvas = container.querySelector("#mark-chart");
  if (!canvas || !window.Chart) return;
  const series = courseMarkSeries(state.categories, state.evaluations);

  if (!series.length) {
    // Replace the canvas with a friendly placeholder.
    canvas.replaceWith(
      el(`<div class="muted" style="margin:auto;text-align:center">Add evaluations to see your mark trend.</div>`)
    );
    return;
  }

  const accent =
    getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() ||
    "#2563eb";

  const ys = series.map((p) => Math.round(p.mark * 10) / 10);
  // Auto-scale tightly around the data (with a little padding) so the trend is
  // legible, like the reference, instead of a flat line near the top.
  const lo = Math.max(0, Math.floor(Math.min(...ys)) - 3);
  const hi = Math.min(100, Math.ceil(Math.max(...ys)) + 2);

  // Soft vertical gradient fill under the line.
  const ctx = canvas.getContext("2d");
  const grad = ctx.createLinearGradient(0, 0, 0, canvas.clientHeight || 196);
  grad.addColorStop(0, accent + "40");
  grad.addColorStop(1, accent + "00");

  chartInstance = new window.Chart(canvas, {
    type: "line",
    data: {
      labels: series.map((p) => p.label),
      datasets: [
        {
          data: ys,
          borderColor: accent,
          backgroundColor: grad,
          fill: true,
          tension: 0.35,
          pointRadius: 3,
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
          ticks: { callback: (v) => v + "%", maxTicksLimit: 5, color: "#9a9aa2" },
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

// ──────────────── Segmented control: Evaluations / Breakdown ────────────────

function buildSegmented(state, reload) {
  const wrap = el(`
    <div>
      <div class="segmented">
        <button data-seg="evals">Evaluations</button>
        <button data-seg="breakdown">Breakdown</button>
      </div>
      <div id="seg-content"></div>
    </div>
  `);
  const content = wrap.querySelector("#seg-content");
  const buttons = [...wrap.querySelectorAll(".segmented button")];

  function show(seg) {
    activeSeg = seg;
    buttons.forEach((b) => b.classList.toggle("active", b.dataset.seg === seg));
    content.innerHTML = "";
    content.appendChild(seg === "evals" ? buildEvaluations(state, reload) : buildBreakdown(state, reload));
  }
  buttons.forEach((b) => b.addEventListener("click", () => show(b.dataset.seg)));
  show(activeSeg);
  return wrap;
}

// ───────────────────────────── Evaluations tab ─────────────────────────────

function buildEvaluations(state, reload) {
  const frag = document.createElement("div");
  const catName = (id) => state.categories.find((c) => c.id === id)?.name || "Uncategorized";

  if (!state.evaluations.length) {
    frag.appendChild(el(`<div class="empty" style="padding:28px">No evaluations yet.</div>`));
  } else {
    // Newest first by date.
    const sorted = [...state.evaluations].sort((a, b) =>
      String(b.date || "").localeCompare(String(a.date || ""))
    );
    const rows = el(`<div class="rows"></div>`);
    for (const ev of sorted) {
      const sub = [catName(ev.category_id), fmtDate(ev.date)].filter(Boolean).join(" · ");
      const row = el(`
        <button class="row">
          <div class="row-main">
            <div class="row-title">${escapeHtml(ev.name || "Untitled")}</div>
            <div class="row-sub">${escapeHtml(sub)}</div>
          </div>
          <div class="row-value">${fmtPercent(evalPercent(ev))}</div>
          <span class="chevron"></span>
        </button>
      `);
      row.addEventListener("click", () => openEvalForm(state, ev, reload));
      rows.appendChild(row);
    }
    frag.appendChild(rows);
  }

  const add = el(`<button class="btn secondary" style="margin-top:14px">+ Add Evaluation</button>`);
  add.addEventListener("click", () => openEvalForm(state, null, reload));
  frag.appendChild(add);
  return frag;
}

/** Add (ev = null) or edit an evaluation. */
function openEvalForm(state, ev, reload) {
  const user = getCurrentUser();
  if (!state.categories.length) {
    alert("Add a category first (in the Breakdown tab).");
    return;
  }
  const v = (k) => escapeHtml(ev?.[k] ?? "");
  const options = state.categories
    .map(
      (c) =>
        `<option value="${c.id}" ${ev?.category_id === c.id ? "selected" : ""}>${escapeHtml(c.name)}</option>`
    )
    .join("");

  const body = el(`
    <form>
      <div class="field">
        <label>Name *</label>
        <input name="name" placeholder="Unit 1 Test" value="${v("name")}" required />
      </div>
      <div class="field">
        <label>Category</label>
        <select name="category_id">${options}</select>
      </div>
      <div class="field-row">
        <div class="field">
          <label>Score earned</label>
          <input type="number" name="score_earned" step="0.01" min="0" value="${v("score_earned")}" required />
        </div>
        <div class="field">
          <label>Out of</label>
          <input type="number" name="score_total" step="0.01" min="0.01" value="${v("score_total")}" required />
        </div>
      </div>
      <div class="field">
        <label>Date</label>
        <input type="date" name="date" value="${ev?.date || new Date().toISOString().slice(0, 10)}" />
      </div>
      <div class="error-text"></div>
      <div class="form-actions">
        <button type="submit" class="btn">${ev ? "Save Changes" : "Add Evaluation"}</button>
        ${ev ? '<button type="button" class="btn danger" data-delete>Delete</button>' : ""}
        <button type="button" class="btn ghost" data-cancel>Cancel</button>
      </div>
    </form>
  `);

  body.querySelector("[data-cancel]").addEventListener("click", closeSheet);
  if (ev) {
    body.querySelector("[data-delete]").addEventListener("click", async () => {
      await sb.from("evaluations").delete().eq("id", ev.id);
      closeSheet();
      reload();
    });
  }

  body.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = new FormData(body);
    const errEl = body.querySelector(".error-text");
    const total = Number(f.get("score_total"));
    if (!total) {
      errEl.textContent = "‘Out of’ must be greater than 0.";
      return;
    }
    const payload = {
      name: f.get("name").trim(),
      category_id: f.get("category_id"),
      score_earned: Number(f.get("score_earned")),
      score_total: total,
      date: f.get("date") || null,
    };
    try {
      if (ev) {
        const { error } = await sb.from("evaluations").update(payload).eq("id", ev.id);
        if (error) throw error;
      } else {
        payload.user_id = user.id;
        payload.course_id = state.course.id;
        const { error } = await sb.from("evaluations").insert(payload);
        if (error) throw error;
      }
      closeSheet();
      reload();
    } catch (err) {
      errEl.textContent = err.message || "Could not save.";
    }
  });

  openSheet(ev ? "Edit Evaluation" : "Add Evaluation", body);
}

// ────────────────────────── Breakdown (categories) ─────────────────────────

function buildBreakdown(state, reload) {
  const frag = document.createElement("div");

  // Explain blank category averages when no assignment marks exist yet.
  const hasEvals = state.evaluations.length > 0;
  if (!hasEvals && state.categories.length) {
    frag.appendChild(
      el(`
      <div class="card" style="margin-bottom:12px;background:var(--accent-tint);box-shadow:none">
        <div class="muted small" style="color:var(--text)">
          Your teacher hasn't posted assignment marks yet, so category
          percentages are blank (0%). The weightings below are from TeachAssist.
        </div>
      </div>
    `)
    );
  }

  const rows = el(`<div class="rows"></div>`);
  for (const cat of state.categories) {
    const avg = categoryAverage(cat.id, state.evaluations);
    const row = el(`
      <button class="row">
        <div class="row-main">
          <div class="row-title">${escapeHtml(cat.name)}</div>
          <div class="row-sub">Weight ${escapeHtml(String(cat.weight ?? 0))}</div>
        </div>
        <div class="row-value">${fmtPercent(avg)}</div>
        <span class="chevron"></span>
      </button>
    `);
    row.addEventListener("click", () => openCategoryForm(state, cat, reload));
    rows.appendChild(row);
  }
  frag.appendChild(rows);

  const add = el(`<button class="btn secondary" style="margin-top:14px">+ Add Category</button>`);
  add.addEventListener("click", () => openCategoryForm(state, null, reload));
  frag.appendChild(add);
  return frag;
}

/** Add (cat = null) or edit a category (rename / change weight / delete). */
function openCategoryForm(state, cat, reload) {
  const user = getCurrentUser();
  const v = (k) => escapeHtml(cat?.[k] ?? "");
  const body = el(`
    <form>
      <div class="field">
        <label>Category name</label>
        <input name="name" value="${v("name")}" placeholder="Knowledge/Understanding" required />
      </div>
      <div class="field">
        <label>Weight</label>
        <input type="number" name="weight" step="0.1" min="0" value="${cat ? escapeHtml(String(cat.weight ?? 0)) : "0"}" required />
      </div>
      <div class="error-text"></div>
      <div class="form-actions">
        <button type="submit" class="btn">${cat ? "Save Changes" : "Add Category"}</button>
        ${cat ? '<button type="button" class="btn danger" data-delete>Delete</button>' : ""}
        <button type="button" class="btn ghost" data-cancel>Cancel</button>
      </div>
    </form>
  `);

  body.querySelector("[data-cancel]").addEventListener("click", closeSheet);
  if (cat) {
    body.querySelector("[data-delete]").addEventListener("click", async () => {
      if (!confirm("Delete this category? Evaluations in it will become uncategorized.")) return;
      await sb.from("categories").delete().eq("id", cat.id);
      closeSheet();
      reload();
    });
  }

  body.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = new FormData(body);
    const payload = { name: f.get("name").trim(), weight: Number(f.get("weight")) || 0 };
    const errEl = body.querySelector(".error-text");
    if (!payload.name) {
      errEl.textContent = "Name is required.";
      return;
    }
    try {
      if (cat) {
        const { error } = await sb.from("categories").update(payload).eq("id", cat.id);
        if (error) throw error;
      } else {
        payload.user_id = user.id;
        payload.course_id = state.course.id;
        const { error } = await sb.from("categories").insert(payload);
        if (error) throw error;
      }
      closeSheet();
      reload();
    } catch (err) {
      errEl.textContent = err.message || "Could not save.";
    }
  });

  openSheet(cat ? "Edit Category" : "Add Category", body);
}
