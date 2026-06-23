// ============================================================================
// Courses screen + shared UI helpers
// ----------------------------------------------------------------------------
// Renders the live course list pulled from the Worker, an Overall Average card,
// and a "Recent updates" feed of day-over-day mark changes. Also exports the
// small UI helpers (el, escapeHtml, sheets, skeletons) used by the other views.
// ============================================================================

import { COURSE_COLORS } from "./config.js";
import {
  getCourses,
  overallAverage,
  displayMark,
  markKind,
  getUpdates,
} from "./ta-client.js";
import { renderAdInto } from "./ads.js";

// ───────────────────────────── UI helpers ──────────────────────────────────

/** Build a DOM element from an HTML string. */
export function el(html) {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

/** Escape user/remote text before putting it in innerHTML. */
export function escapeHtml(s) {
  return String(s ?? "").replace(
    /[&<>"']/g,
    (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m])
  );
}

/** Round to one decimal and add "%". Shows "—" when there is no value. */
export function fmtPercent(v) {
  if (v == null || isNaN(v)) return "—";
  return (Math.round(v * 10) / 10).toFixed(1) + "%";
}

let activeSheet = null;
let activeSheetCleanup = null;

/** Open a bottom-sheet modal containing `bodyNode`. Returns { close }. */
export function openSheet(title, bodyNode) {
  closeSheet();
  const root = document.getElementById("modal-root");
  const backdrop = el(
    `<div class="sheet-backdrop"><div class="sheet" role="dialog" aria-modal="true"><div class="sheet-grabber"></div></div></div>`
  );
  const sheet = backdrop.querySelector(".sheet");
  if (title) {
    const header = document.createElement("div");
    header.className = "sheet-header";
    const h = document.createElement("h2");
    h.textContent = title;
    const close = document.createElement("button");
    close.type = "button";
    close.className = "sheet-close";
    close.setAttribute("aria-label", "Close");
    close.textContent = "×";
    close.addEventListener("click", closeSheet);
    header.append(h, close);
    sheet.appendChild(header);
  }
  sheet.appendChild(bodyNode);
  root.appendChild(backdrop);
  requestAnimationFrame(() => backdrop.classList.add("show"));
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) closeSheet();
  });
  const onKeyDown = (e) => {
    if (e.key === "Escape") closeSheet();
  };
  document.addEventListener("keydown", onKeyDown);
  activeSheetCleanup = () => document.removeEventListener("keydown", onKeyDown);
  activeSheet = backdrop;
  return { close: closeSheet };
}

/** Close the open bottom sheet (if any). */
export function closeSheet() {
  if (!activeSheet) return;
  const backdrop = activeSheet;
  activeSheet = null;
  activeSheetCleanup?.();
  activeSheetCleanup = null;
  backdrop.classList.remove("show");
  setTimeout(() => backdrop.remove(), 220);
}

/** Semicircular gauge (big, for the Overall Average) with the percent centered. */
export function semiGauge(percent) {
  const cx = 100,
    cy = 100,
    r = 82,
    sw = 15;
  const clamped = Math.max(0, Math.min(100, percent ?? 0));
  const len = Math.PI * r;
  const fill = (clamped / 100) * len;
  const arc = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`;
  // Unique gradient id per gauge — otherwise multiple gauges (incl. ones on a
  // display:none screen) share an id and the fill fails to paint.
  const gid = "ovg-" + Math.random().toString(36).slice(2, 9);
  return `
    <svg viewBox="0 0 200 116" width="100%" style="max-width:248px" role="img" aria-label="${percent == null ? "no average" : fmtPercent(percent)}">
      <defs><linearGradient id="${gid}" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="#6aa8ff"/><stop offset="1" stop-color="#4f46e5"/>
      </linearGradient></defs>
      <path d="${arc}" fill="none" style="stroke:var(--track)" stroke-width="${sw}" stroke-linecap="round"/>
      ${
        clamped > 0
          ? `<path d="${arc}" fill="none" stroke="url(#${gid})" stroke-width="${sw}" stroke-linecap="round" stroke-dasharray="${fill} ${len + 4}"/>`
          : ""
      }
      <text x="100" y="92" text-anchor="middle" font-size="40" font-weight="800" letter-spacing="-1" style="fill:var(--text)" font-family="-apple-system, sans-serif">${
        percent == null ? "—" : fmtPercent(percent)
      }</text>
    </svg>`;
}

/** Shimmering placeholder cards shown while data loads. */
export function skeletonCards(n = 4) {
  const one = `
    <div class="skel-card">
      <div class="skel-dot skeleton"></div>
      <div class="skel-lines">
        <div class="skel-line skeleton" style="width:55%"></div>
        <div class="skel-line skeleton" style="width:32%"></div>
      </div>
      <div class="skel-line skeleton" style="width:46px;height:26px;border-radius:8px"></div>
    </div>`;
  return Array.from({ length: n }, () => one).join("");
}

// ─────────────────────────── Courses rendering ─────────────────────────────

/** Render the Courses screen. Pass {refresh:true} to re-scrape from TeachAssist. */
export async function renderCourses(container, { refresh = false } = {}) {
  container.innerHTML = `<div class="screen-header"><h1>Courses</h1></div>${skeletonCards(4)}`;

  let courses;
  try {
    courses = await getCourses({ refresh });
  } catch (err) {
    container.innerHTML = "";
    container.appendChild(el(`<div class="screen-header"><h1>Courses</h1></div>`));
    container.appendChild(
      el(`
      <div class="empty centered">
        <div class="empty-title">Couldn't load your marks</div>
        ${escapeHtml(err.message || "Please try again.")}
      </div>`)
    );
    const retry = el(`<button class="btn" style="margin-top:8px">Try again</button>`);
    retry.addEventListener("click", () => renderCourses(container, { refresh: true }));
    container.appendChild(retry);
    return;
  }

  const overall = overallAverage(courses);
  const updates = getUpdates();

  container.innerHTML = "";

  // Header with a refresh button.
  const header = el(`
    <div class="screen-header">
      <h1>Courses</h1>
      <button class="btn ghost" id="refresh" style="width:auto;padding:6px 10px" aria-label="Refresh">↻</button>
    </div>
  `);
  header.querySelector("#refresh").addEventListener("click", () =>
    renderCourses(container, { refresh: true })
  );
  container.appendChild(header);

  // Overall average — semicircular gauge with a change pill (reference look).
  const ov = updates.find((u) => u.overall);
  const delta = ov ? ov.to - ov.from : null;
  const deltaPill =
    delta != null && Math.abs(delta) >= 0.05
      ? `<div class="delta-pill ${delta >= 0 ? "up" : "down"}">${delta >= 0 ? "↑" : "↓"} ${Math.abs(Math.round(delta * 10) / 10).toFixed(1)}%</div>`
      : "";
  container.appendChild(
    el(`
    <div class="card overall-gauge">
      ${semiGauge(overall)}
      ${deltaPill}
      <div class="gauge-cap">Overall Average · ${courses.length} course${courses.length === 1 ? "" : "s"}</div>
    </div>
  `)
  );

  // Ad banner (AdSense if configured, else a placeholder) — right up top.
  renderAdInto(container);

  // Course cards.
  if (!courses.length) {
    container.appendChild(el(`<div class="empty centered"><div class="empty-title">No courses found</div>Your TeachAssist account has no courses listed.</div>`));
    return;
  }
  const list = document.createElement("div");
  courses.forEach((c, i) => {
    const color = COURSE_COLORS[i % COURSE_COLORS.length];
    const letter = (c.code || "?").trim().charAt(0).toUpperCase();
    const big = displayMark(c);
    const tag = markKind(c);
    const card = el(`
      <div class="card course-card">
        <div class="icon-circle" style="background:${color}">${escapeHtml(letter)}</div>
        <div class="cc-main">
          <div class="cc-code">${escapeHtml(c.code || "")}</div>
          <div class="cc-name">${escapeHtml(c.name || "")}</div>
        </div>
        <div class="cc-right">
          <div class="cc-markwrap">
            <div class="cc-mark">${fmtPercent(big)}</div>
            ${tag ? `<div class="cc-tag">${tag}</div>` : ""}
          </div>
          <span class="chevron"></span>
        </div>
      </div>
    `);
    card.addEventListener("click", () => window.AppNav.toDetail(c));
    list.appendChild(card);
  });
  container.appendChild(list);
}

/** One "Recent updates" row: label, what changed, from → to, delta pill. */
function updateCard(u) {
  const delta = u.to - u.from;
  const up = delta >= 0;
  const color = u.overall ? "var(--good)" : "var(--accent)";
  const glyph = u.overall
    ? `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round"><path d="M5 19V11M12 19V5M19 19v-6"/></svg>`
    : `<span style="font-weight:800">%</span>`;
  return el(`
    <div class="card update-card">
      <div class="icon-circle" style="background:${color}">${glyph}</div>
      <div class="cc-main">
        <div class="cc-code">${escapeHtml(u.label)}</div>
        <div class="muted small">${u.overall ? "Overall average changed" : "Mark changed"}</div>
        <div class="update-trend">${fmtPercent(u.from)} <span class="muted">→</span> <b>${fmtPercent(u.to)}</b></div>
      </div>
      <div class="delta-pill ${up ? "up" : "down"}">${up ? "↑" : "↓"} ${Math.abs(Math.round(delta * 10) / 10).toFixed(1)}%</div>
    </div>
  `);
}
