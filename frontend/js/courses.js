import { preferences } from "./personalization.js";
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
  lastSyncedAt,
  isDemo,
} from "./ta-client.js";

/** Human "Updated 3h ago" string from an ISO timestamp (for the top bar). */
function relativeUpdated(iso) {
  if (!iso) return "Updated just now";
  const ms = Date.now() - new Date(iso).getTime();
  if (!isFinite(ms) || ms < 0) return "Updated just now";
  const min = Math.floor(ms / 60000);
  if (min < 1) return "Updated just now";
  if (min < 60) return `Updated ${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `Updated ${hr}h ago`;
  const d = Math.floor(hr / 24);
  return d === 1 ? "Updated yesterday" : `Updated ${d} days ago`;
}

/** Reflect the cached scrape time (or demo mode) in the app top bar. */
function refreshTopbarStatus() {
  const status = document.querySelector(".app-status");
  if (status) {
    status.textContent = isDemo()
      ? "Bundled snapshot"
      : relativeUpdated(lastSyncedAt());
  }
  const topbar = document.querySelector(".app-topbar");
  if (topbar && isDemo() && !topbar.querySelector(".demo-pill")) {
    topbar.appendChild(el(`<span class="demo-pill">Demo</span>`));
  }
}

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
    (m) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        m
      ],
  );
}

/** Round to one decimal and add "%". Shows "—" when there is no value. */
export function fmtPercent(v) {
  if (v == null || isNaN(v)) return "—";
  return (Math.round(v * 10) / 10).toFixed(1) + "%";
}

/**
 * Clean class label for the UI: just the course code, no section suffix.
 * TeachAssist reports codes like "SNC2D1-8" or "FIF2DF-3"; the dashboard only
 * ever shows the course part ("SNC2D1"). Falls back to the first word of the
 * course name when a scrape hands us no code at all.
 */
export function courseLabel(course) {
  const raw = String(course?.code || "").trim();
  const source = raw || String(course?.name || "").trim().split(/[\s:]+/)[0] || "";
  return source.split("-")[0].trim().toUpperCase();
}

/**
 * The course name, but only when it is a real name. A live scrape packs the
 * timetable line into `name` ("SNC2D1-8 : Science Block: P1 - rm. 302 2026-09-08
 * ~ ..."), which is noise — return "" for those so callers can drop the row.
 */
export function courseSubtitle(course) {
  const name = String(course?.name || "").trim();
  if (!name) return "";
  if (/block\s*:|\brm\.?\s|\broom\b|\d{4}-\d{2}-\d{2}/i.test(name)) return "";
  const label = courseLabel(course);
  if (label && name.toUpperCase().startsWith(label)) return "";
  return name;
}

let activeSheet = null;
let activeSheetCleanup = null;

/** Open a bottom-sheet modal containing `bodyNode`. Returns { close }. */
export function openSheet(title, bodyNode) {
  closeSheet();
  const root = document.getElementById("modal-root");
  const backdrop = el(
    `<div class="sheet-backdrop"><div class="sheet" role="dialog" aria-modal="true"><div class="sheet-grabber"></div></div></div>`,
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

/** Semicircular gauge (for the Overall Average / course mark), theme-aware. */
export function semiGauge(percent) {
  const cx = 100,
    cy = 100,
    r = 82,
    sw = 14;
  const clamped = Math.max(0, Math.min(100, percent ?? 0));
  const len = Math.PI * r;
  const fill = (clamped / 100) * len;
  const arc = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`;
  const accent =
    (typeof document !== "undefined" &&
      getComputedStyle(document.documentElement)
        .getPropertyValue("--accent")
        .trim()) ||
    "#4338ca";
  return `
    <svg viewBox="0 0 200 116" width="100%" style="max-width:230px" role="img" aria-label="${percent == null ? "no average" : fmtPercent(percent)}">
      <path d="${arc}" fill="none" style="stroke:var(--track)" stroke-width="${sw}" stroke-linecap="round"/>
      ${
        clamped > 0
          ? `<path d="${arc}" fill="none" stroke="${accent}" stroke-width="${sw}" stroke-linecap="round" stroke-dasharray="${fill} ${len + 4}"/>`
          : ""
      }
      <text x="100" y="93" text-anchor="middle" font-size="33" font-weight="800" letter-spacing="-0.5" style="fill:var(--text)" font-family="-apple-system, sans-serif">${
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
    container.appendChild(
      el(`<div class="screen-header"><h1>Courses</h1></div>`),
    );
    container.appendChild(
      el(`
      <div class="empty centered">
        <div class="empty-title">Couldn't load your marks</div>
        ${escapeHtml(err.message || "Please try again.")}
      </div>`),
    );
    const retry = el(
      `<button class="btn" style="margin-top:8px">Try again</button>`,
    );
    retry.addEventListener("click", () =>
      renderCourses(container, { refresh: true }),
    );
    container.appendChild(retry);
    return;
  }

  const overall = overallAverage(courses);
  const updates = getUpdates();
  refreshTopbarStatus();

  container.innerHTML = "";

  // Header with a refresh button.
  const header = el(`
    <div class="screen-header">
      <div><div class="eyebrow">YOUR DAY, IN PERSPECTIVE</div><h1>${preferences().name ? `Hey, ${escapeHtml(preferences().name)}.` : "Room to grow."}</h1><p class="muted dashboard-subtitle">Small steps today. Bigger possibilities tomorrow.</p></div>
      <button class="btn ghost" id="refresh" style="width:auto;padding:6px 10px" aria-label="Refresh">↻</button>
    </div>
  `);
  header
    .querySelector("#refresh")
    .addEventListener("click", () =>
      renderCourses(container, { refresh: true }),
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
  `),
  );

  const p = preferences();
  const dream = el(
    `<div class="card dream-preview"><div><div class="eyebrow">THE BIG PICTURE</div><h2>${escapeHtml(p.career || "What’s your next chapter?")}</h2><p class="muted">${escapeHtml(p.school || "Give your grades a little direction. Set a dream, make a plan.")} </p><button class="btn secondary" style="width:auto">${p.career ? "View my dreams" : "Set a dream"} ↗</button></div><div class="dream-orbit" aria-hidden="true">✧</div></div>`,
  );
  dream
    .querySelector("button")
    .addEventListener("click", () => window.AppNav.toDreams());
  container.append(dream);
  const actions = el(
    `<div class="dashboard-actions"><h2>Your courses <span class="muted small">${courses.length} total</span></h2><button class="btn ghost" style="width:auto">✦ Ask the assistant</button></div>`,
  );
  actions
    .querySelector("button")
    .addEventListener("click", () => window.AppNav.toAssistant());
  container.append(actions);
  // Course cards.
  if (!courses.length) {
    container.appendChild(
      el(
        `<div class="empty centered"><div class="empty-title">No courses found</div>Your TeachAssist account has no courses listed.</div>`,
      ),
    );
    return;
  }
  const list = document.createElement("div");
  list.className = "course-grid";
  courses.forEach((c, i) => {
    const color = COURSE_COLORS[i % COURSE_COLORS.length];
    const letter = (courseLabel(c) || "?").charAt(0).toUpperCase();
    const big = displayMark(c);
    const tag = markKind(c);
    const label = courseLabel(c);
    const card = el(`
      <div class="card course-card" role="button" tabindex="0" aria-label="Open ${escapeHtml(label)}">
        <div class="icon-circle" style="background:${color}">${escapeHtml(letter)}</div>
        <div class="cc-main">
          <div class="cc-code">${escapeHtml(label)}</div>
          ${big != null ? `<div class="cc-bar"><i style="width:${Math.max(0, Math.min(100, big))}%"></i></div>` : ""}
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
    card.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        window.AppNav.toDetail(c);
      }
    });
    list.appendChild(card);
  });
  container.appendChild(list);

  // Recent updates — day-over-day mark changes from the local snapshots.
  const changes = updates.filter((u) => !u.overall);
  if (changes.length) {
    container.appendChild(
      el(`<div class="section-label">Recent updates</div>`),
    );
    const feed = document.createElement("div");
    changes.forEach((u) => feed.appendChild(updateCard(u)));
    container.appendChild(feed);
  }
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
        <div class="cc-code">${escapeHtml(u.overall ? u.label : courseLabel({ code: u.label }))}</div>
        <div class="muted small">${u.overall ? "Overall average changed" : "Mark changed"}</div>
        <div class="update-trend">${fmtPercent(u.from)} <span class="muted">→</span> <b>${fmtPercent(u.to)}</b></div>
      </div>
      <div class="delta-pill ${up ? "up" : "down"}">${up ? "↑" : "↓"} ${Math.abs(Math.round(delta * 10) / 10).toFixed(1)}%</div>
    </div>
  `);
}
