// ============================================================================
// Course detail (live)
// ----------------------------------------------------------------------------
// Shows a gauge of the course's current (or midterm) mark and the category
// breakdown (weightings + per-category achievement) returned by the Worker.
// ============================================================================

import { el, escapeHtml, fmtPercent } from "./courses.js";
import { displayMark, markKind } from "./ta-client.js";

/** Open the detail screen for a (live) course object. */
export async function openCourseDetail(container, course) {
  container.innerHTML = "";

  // Top nav
  const nav = el(`
    <div class="detail-nav">
      <button class="back-btn">Courses</button>
      <span class="detail-title">${escapeHtml(course.code || "")}</span>
      <div class="detail-actions"></div>
    </div>
  `);
  nav.querySelector(".back-btn").addEventListener("click", () => window.AppNav.toCourses());
  container.appendChild(nav);

  // Gauge
  const mark = displayMark(course);
  const kind = markKind(course);
  const sub = [];
  if (kind === "current" && course.midterm != null) sub.push("Midterm: " + fmtPercent(Number(course.midterm)));
  else if (kind === "midterm") sub.push("Midterm mark");
  else if (kind === "") sub.push("No mark posted yet");
  container.appendChild(
    el(`
    <div class="card" style="display:flex;flex-direction:column;align-items:center;padding:22px 16px">
      <div class="gauge-wrap">
        ${gaugeSVG(mark)}
        <div class="gauge-label">${kind === "midterm" ? "Midterm Mark" : "Current Mark"}</div>
        <div class="gauge-sub">${escapeHtml(sub.join(" · "))}</div>
      </div>
    </div>
  `)
  );

  // Course info
  container.appendChild(el(`<div class="section-label">Course</div>`));
  container.appendChild(
    el(`
    <div class="card">
      <div class="info-list">
        <div class="info-row"><span>Code</span><span>${escapeHtml(course.code || "—")}</span></div>
        <div class="info-row"><span>Name</span><span>${escapeHtml(course.name || "—")}</span></div>
        <div class="info-row"><span>Current mark</span><span>${course.currentMark != null ? fmtPercent(Number(course.currentMark)) : "—"}</span></div>
        <div class="info-row"><span>Midterm</span><span>${course.midterm != null ? fmtPercent(Number(course.midterm)) : "—"}</span></div>
      </div>
    </div>
  `)
  );

  // Category breakdown
  const evals = Array.isArray(course.evaluations) ? course.evaluations : [];
  container.appendChild(el(`<div class="section-label">Breakdown</div>`));

  if (!evals.length) {
    container.appendChild(
      el(`<div class="empty centered"><div class="empty-title">No breakdown available</div>This course shows "please see teacher" on TeachAssist — there's no report to break down yet.</div>`)
    );
    return;
  }

  const allZero = evals.every((e) => !e.percent);
  if (allZero) {
    container.appendChild(
      el(`
      <div class="card" style="margin-bottom:12px;background:var(--accent-tint);box-shadow:none">
        <div class="muted small" style="color:var(--text)">
          Your teacher hasn't posted assignment marks yet, so category
          percentages are 0%. The weightings below are from TeachAssist.
        </div>
      </div>`)
    );
  }

  const rows = el(`<div class="rows"></div>`);
  for (const e of evals) {
    rows.appendChild(
      el(`
      <div class="row" style="cursor:default">
        <div class="row-main">
          <div class="row-title">${escapeHtml(e.name || e.category || "Category")}</div>
          <div class="row-sub">Weight ${escapeHtml(String(e.weight ?? 0))}</div>
        </div>
        <div class="row-value">${fmtPercent(e.percent)}</div>
      </div>`)
    );
  }
  container.appendChild(rows);
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
  const len = Math.PI * r;
  const fill = (clamped / 100) * len;
  const arc = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`;
  return `
    <svg viewBox="0 0 200 116" width="100%" style="max-width:262px" role="img" aria-label="Mark gauge">
      <defs>
        <linearGradient id="gaugeGrad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stop-color="#5b9bff"/><stop offset="1" stop-color="#2563eb"/>
        </linearGradient>
      </defs>
      <path d="${arc}" fill="none" style="stroke:var(--track)" stroke-width="${sw}" stroke-linecap="round"/>
      ${
        clamped > 0
          ? `<path d="${arc}" fill="none" stroke="url(#gaugeGrad)" stroke-width="${sw}" stroke-linecap="round" stroke-dasharray="${fill} ${len + 4}"/>`
          : ""
      }
      <text x="100" y="92" text-anchor="middle" font-size="42" font-weight="800" letter-spacing="-1" style="fill:var(--text)" font-family="-apple-system, sans-serif">${
        percent == null ? "—" : fmtPercent(percent)
      }</text>
    </svg>`;
}
