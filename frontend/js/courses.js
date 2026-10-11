import { preferences } from "./personalization.js";
import { GLYPHS, arcGauge, glassButton, pageHeader, pager, pct } from "./ui-kit.js";
import { fmtDay, fullCode, scheduleOf, subjectBadge, subjectStyle } from "./subjects.js";
// ============================================================================
// Courses screen + shared UI helpers
// ----------------------------------------------------------------------------
// Renders the glass header (class schedule · TeachAssist · recent updates),
// a swipeable Overall Average gauge / average-over-time chart, and the course
// pills. Also exports the small UI helpers (el, escapeHtml, sheets,
// skeletons) used by the other views.
// ============================================================================

import { courseName, courseMeta } from "./course-names.js";
import { teacherFor } from "./teachers.js";
import { splitByTerm } from "./term.js";
import {
  animateGauge,
  countUp,
  marksHidden,
  orbitSparkles,
  previousValue,
  rememberValue,
  savedFeedback,
} from "./motion.js";
import {
  getCourses,
  overallAverage,
  displayMark,
  markKind,
  getUpdates,
  getSnapshots,
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

/** Ontario achievement level for a percentage ("Level 4", "Level 3"…). */
export function achievementLevel(v) {
  if (v == null || isNaN(v)) return "";
  if (v >= 80) return "Level 4";
  if (v >= 70) return "Level 3";
  if (v >= 60) return "Level 2";
  if (v >= 50) return "Level 1";
  return "Below Level 1";
}

/** Letter grade, the way university/college applications read a mark. */
export function letterGrade(v) {
  if (v == null || isNaN(v)) return "";
  const bands = [[90, "A+"], [85, "A"], [80, "A−"], [77, "B+"], [73, "B"], [70, "B−"], [67, "C+"], [63, "C"], [60, "C−"], [57, "D+"], [53, "D"], [50, "D−"]];
  return (bands.find(([min]) => v >= min) || [0, "R"])[1];
}

/** The readable course title: scraped name if real, else the code lookup. */
export function courseTitle(course) {
  const label = courseLabel(course);
  return courseName(label) || courseSubtitle(course).split(",")[0] || label;
}

/** Round to one decimal and add "%". Shows "—" when there is no value. */
export function fmtPercent(v) {
  if (v == null || isNaN(v)) return "—";
  return (Math.round(v * 10) / 10).toFixed(1) + "%";
}

/**
 * Clean class code for the UI: just the course code, no section suffix.
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

/**
 * Open a bottom-sheet modal containing `bodyNode`. Returns { close }.
 * The header is the glass one: centred title (+ optional subtitle) with a
 * round close button. `options.left` / `options.right` replace the default
 * button slots (raw HTML; give any close button a `data-close` attribute).
 */
export function openSheet(title, bodyNode, options = {}) {
  closeSheet();
  const root = document.getElementById("modal-root");
  const backdrop = el(
    `<div class="sheet-backdrop"><div class="sheet ${options.className || ""}" role="dialog" aria-modal="true"><div class="sheet-grabber"></div></div></div>`,
  );
  const sheet = backdrop.querySelector(".sheet");
  if (title) {
    sheet.setAttribute("aria-label", title);
    const right = options.right ?? (options.left ? "" : glassButton("close", "Close", "data-close"));
    const header = el(
      pageHeader({ title, subtitle: options.subtitle ? escapeHtml(options.subtitle) : "", left: options.left || "", right, tag: "h2" }),
    );
    header.classList.add("sheet-header");
    sheet.appendChild(header);
  }
  sheet.appendChild(bodyNode);
  sheet.querySelectorAll("[data-close]").forEach((b) => b.addEventListener("click", closeSheet));
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
  // Move focus into the dialog (not onto a button, which would draw a ring).
  sheet.tabIndex = -1;
  requestAnimationFrame(() => sheet.focus({ preventScroll: true }));
  return { close: closeSheet, sheet };
}

/** Close the open bottom sheet (if any). */
export function closeSheet() {
  if (!activeSheet) return;
  const backdrop = activeSheet;
  activeSheet = null;
  activeSheetCleanup?.();
  activeSheetCleanup = null;
  backdrop.classList.remove("show");
  setTimeout(() => backdrop.remove(), 260);
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
  const header = (subtitle, dot = false) =>
    pageHeader({
      title: "TeachAssist",
      subtitle,
      left: glassButton("schedule", "Class schedule", "data-schedule"),
      right: glassButton("inbox", "Recent updates", `data-inbox${dot ? ' data-dot="true"' : ""}`),
    });
  if (!refresh || !container.querySelector(".g-header")) {
    container.innerHTML = `${header("Loading your marks…")}<div class="g-list">${skeletonCards(5)}</div>`;
  } else {
    container.querySelector(".g-header-title p").textContent = "Refreshing…";
  }

  let courses;
  try {
    courses = await getCourses({ refresh });
  } catch (err) {
    container.innerHTML = header("Couldn't refresh");
    container.appendChild(
      el(`<div class="empty centered"><div class="empty-title">Couldn't load your marks</div>${escapeHtml(err.message || "Please try again.")}</div>`),
    );
    const retry = el(`<button class="btn" style="margin-top:8px">Try again</button>`);
    retry.addEventListener("click", () => renderCourses(container, { refresh: true }));
    container.appendChild(retry);
    return;
  }

  // TeachAssist lists the whole year; show only this semester's courses unless
  // the student has turned that off in Settings.
  const allCourses = courses;
  if (preferences().currentTermOnly) courses = splitByTerm(allCourses).current;
  const shownCodes = new Set(courses.map((c) => c.code));

  const overall = overallAverage(courses);
  const updates = getUpdates();
  const changes = updates.filter((u) => !u.overall && shownCodes.has(u.label));

  container.innerHTML = "";

  // ── Header: schedule · TeachAssist / Updated… (tap to refresh) · updates ──
  const top = el(header("", changes.length > 0));
  const status = isDemo() ? "Demo · bundled snapshot" : relativeUpdated(lastSyncedAt());
  const sub = top.querySelector(".g-header-title");
  sub.insertAdjacentHTML(
    "beforeend",
    `<button type="button" class="g-status" aria-label="${escapeHtml(status)}. Refresh marks">${escapeHtml(status)}${isDemo() ? "" : GLYPHS.refresh}</button>`,
  );
  sub.querySelector(".g-status").addEventListener("click", async (e) => {
    if (isDemo()) return savedFeedback(e.currentTarget, "Demo data is bundled");
    await renderCourses(container, { refresh: true });
  });
  top.querySelector("[data-schedule]").addEventListener("click", () => openSchedule(courses));
  top.querySelector("[data-inbox]").addEventListener("click", () => openUpdates(changes, updates.find((u) => u.overall)));
  container.appendChild(top);

  // ── Hero pager: overall gauge · average over time ──
  const ov = updates.find((u) => u.overall);
  const delta = ov ? ov.to - ov.from : null;
  const track = el(`<div class="g-pager" aria-label="Overall average"></div>`);
  const gaugePage = el(`
    <section class="g-page g-hero" aria-label="Overall average ${overall == null ? "not available" : fmtPercent(overall)}">
      <div class="g-gauge-wrap">
        ${arcGauge(overall, { id: "overall" })}
        <div class="g-gauge-center">
          <div class="g-hero-num private-mark">${pct(overall)}</div>
          ${delta != null && Math.abs(delta) >= 0.05 ? `<div class="g-delta ${delta >= 0 ? "up" : "down"} delta-pill">${delta >= 0 ? "↑" : "↓"} ${pct(Math.abs(delta))}</div>` : ""}
        </div>
      </div>
      <p class="g-caption">Overall Average${overall != null ? ` · ${achievementLevel(overall)} · ${letterGrade(overall)}` : ""}</p>
    </section>`);
  track.appendChild(gaugePage);
  track.appendChild(trendPage(courses.map((c) => c.code)));
  container.appendChild(track);
  container.appendChild(pager(track, ["Overall average", "Average over time"]));
  if (overall != null) {
    const from = previousValue("overall", 0);
    animateGauge(gaugePage, overall, { from });
    const num = gaugePage.querySelector(".g-hero-num .g-pct");
    countUp(num, overall, {
      from,
      duration: 1100,
      format: (v) => `${(Math.round(v * 10) / 10).toFixed(1)}<small>%</small>`,
      html: true,
    });
    rememberValue("overall", overall);
  }

  // ── Course list ──
  if (!courses.length) {
    container.appendChild(
      el(`<div class="empty centered"><div class="empty-title">No courses found</div>Your TeachAssist account has no courses listed.</div>`),
    );
    return;
  }
  const list = el(`<div class="g-list course-grid"></div>`);
  courses.forEach((c, i) => {
    const big = displayMark(c);
    const label = courseLabel(c);
    const title = courseTitle(c);
    const teacher = teacherFor(c).name;
    const row = el(`
      <button type="button" class="g-row course-card" aria-label="${escapeHtml(title)}, ${escapeHtml(label)}, ${big == null ? "no mark" : fmtPercent(big)}">
        ${subjectBadge(c.code || label)}
        <span class="g-row-main">
          <b>${escapeHtml(title)}</b>
          <small>${escapeHtml([label, teacher].filter(Boolean).join(" · "))}</small>
        </span>
        <span class="g-row-value cc-mark">${pct(big)}</span>
        <span class="g-chev">${GLYPHS.chevron}</span>
      </button>`);
    row.addEventListener("click", () => window.AppNav.toDetail(c));
    row.style.setProperty("--m-i", String(i));
    const markEl = row.querySelector(".g-pct:not(.g-none)");
    if (markEl && big != null) {
      const key = `course:${c.code || label}`;
      countUp(markEl, big, {
        from: previousValue(key, 0),
        duration: 900,
        format: (v) => `${(Math.round(v * 10) / 10).toFixed(1)}<small>%</small>`,
        html: true,
      });
      rememberValue(key, big);
    }
    list.appendChild(row);
  });
  container.appendChild(list);

  const p = preferences();
  const dream = el(
    `<div class="card dream-preview"><div><div class="eyebrow">THE BIG PICTURE</div><h2>${escapeHtml(p.career || "What’s your next chapter?")}</h2><p class="muted">${escapeHtml(p.school || "Give your grades a little direction. Set a dream, make a plan.")} </p><button class="btn secondary" style="width:auto">${p.career ? "View my dreams" : "Set a dream"} ↗</button></div><div class="dream-orbit" aria-hidden="true">✧</div></div>`,
  );
  dream.querySelector("button").addEventListener("click", () => window.AppNav.toDreams());
  container.append(dream);
  orbitSparkles(dream.querySelector(".dream-orbit"), 4);
}

/** "Overall Average Over Time": one point per saved snapshot. */
function trendPage(codes) {
  const page = el(`<section class="g-page g-hero" aria-label="Overall average over time"></section>`);
  const rows = getSnapshots()
    .map((s) => {
      const marks = codes.map((code) => s.marks[code]).filter(Number.isFinite);
      return { date: Date.parse(s.date), value: marks.length ? marks.reduce((a, b) => a + b, 0) / marks.length : null };
    })
    .filter((r) => r.value != null && Number.isFinite(r.date));
  if (marksHidden()) {
    page.append(el(`<p class="g-empty-note">Hidden while “Hide grades” is on.</p>`));
  } else if (!rows.length) {
    page.append(el(`<p class="g-empty-note">Your average over time appears after your first refresh.</p>`));
  } else {
    page.insertAdjacentHTML("beforeend", trendChart(rows));
  }
  page.append(el(`<p class="g-caption">Overall Average Over Time</p>`));
  return page;
}

/** Mono-labelled line chart with dashed verticals, like the TeachAssist app. */
export function trendChart(rows) {
  const W = 300, H = 170, L = 52, R = 14, T = 10, B = 26;
  const values = rows.map((r) => r.value);
  let hi = Math.min(100, Math.ceil(Math.max(...values) + 1));
  let lo = Math.max(0, Math.floor(Math.min(...values) - 3));
  if (hi - lo < 6) lo = Math.max(0, hi - 6);
  const step = (hi - lo) / 3;
  const y = (v) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const start = rows[0].date, end = rows.at(-1).date;
  const x = (d) => L + (end === start ? 0.5 : (d - start) / (end - start)) * (W - L - R);
  const grid = [0, 1, 2, 3]
    .map((i) => {
      const v = hi - i * step;
      return `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" class="g-grid"/><text x="${L - 8}" y="${y(v) + 4}" text-anchor="end" class="g-axis">${Math.round(v)}%</text>`;
    })
    .join("");
  const xs = rows.length === 1 ? [L, x(start), W - R] : [L, (L + W - R) / 2, W - R];
  const verticals = xs.map((vx) => `<line x1="${vx}" x2="${vx}" y1="${T}" y2="${H - B}" class="g-grid g-dash"/>`).join("");
  const path = rows.map((r, i) => `${i ? "L" : "M"}${x(r.date).toFixed(1)},${y(r.value).toFixed(1)}`).join(" ");
  const dots = rows.map((r) => `<circle cx="${x(r.date).toFixed(1)}" cy="${y(r.value).toFixed(1)}" r="4" class="g-dot"/>`).join("");
  const label = `From ${fmtPercent(rows[0].value)} to ${fmtPercent(rows.at(-1).value)} over ${rows.length} snapshot${rows.length === 1 ? "" : "s"}`;
  return `<svg class="g-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${label}">${grid}${verticals}${rows.length > 1 ? `<path d="${path}" class="g-line"/>` : ""}${dots}</svg>`;
}

/** The Class Schedule sheet: one tinted card per period. */
export function openSchedule(courses) {
  const rows = courses
    .map((c) => ({ c, ...scheduleOf(c) }))
    .sort((a, b) => (parseInt(a.period.slice(1)) || 99) - (parseInt(b.period.slice(1)) || 99));
  const terms = rows.map((r) => r.term).filter(Boolean);
  const range = terms.length
    ? `${fmtDay(Math.min(...terms.map((t) => t.start)))} - ${fmtDay(Math.max(...terms.map((t) => t.end)))}`
    : "This semester";
  const body = el(`<div class="schedule-list" role="list"></div>`);
  rows.forEach(({ c, period, room }, i) => {
    const s = subjectStyle(c.code);
    const name = courseSubtitle(c) || courseName(courseLabel(c)) || "";
    const card = el(`
      <div class="schedule-row" role="listitem">
        <span class="schedule-period">${escapeHtml(period || "–")}</span>
        <button type="button" class="schedule-card" style="--tint:${s.tint}">
          ${subjectBadge(c.code)}
          <span class="g-row-main">
            <b>${escapeHtml(fullCode(c))}</b>
            ${name ? `<small>${escapeHtml(name)}</small>` : ""}
            ${room ? `<em>${GLYPHS.pin} Room ${escapeHtml(room)}</em>` : ""}
          </span>
        </button>
      </div>`);
    card.style.setProperty("--m-i", String(i));
    card.querySelector("button").addEventListener("click", () => {
      closeSheet();
      if (displayMark(c) != null || (c.evaluations || []).length) window.AppNav.toDetail(c);
    });
    body.appendChild(card);
  });
  const text = rows
    .map(({ c, period, room }) => [period, fullCode(c), courseSubtitle(c) || courseName(courseLabel(c)), room && `Room ${room}`].filter(Boolean).join(" · "))
    .join("\n");
  const { sheet } = openSheet("Class Schedule", body, {
    subtitle: range,
    className: "sheet-tall",
    left: glassButton("close", "Close", "data-close"),
    right: glassButton("share", "Share schedule", "data-share"),
  });
  sheet.querySelector("[data-share]").addEventListener("click", async (e) => {
    const shareText = `My class schedule (${range})\n${text}`;
    try {
      if (navigator.share) await navigator.share({ title: "Class Schedule", text: shareText });
      else {
        await navigator.clipboard.writeText(shareText);
        e.currentTarget.classList.add("g-done");
      }
    } catch {
      /* cancelled */
    }
  });
}

/** The inbox sheet: day-over-day mark changes. */
function openUpdates(changes, overallChange) {
  const body = el(`<div class="g-list"></div>`);
  const items = overallChange ? [overallChange, ...changes] : changes;
  if (!items.length) {
    body.appendChild(el(`<p class="g-empty-note">No new marks since your last refresh. We'll show changes here.</p>`));
  }
  items.forEach((u) => body.appendChild(updateCard(u)));
  openSheet("Recent updates", body, { subtitle: items.length ? `${items.length} change${items.length === 1 ? "" : "s"}` : "" });
}

/** One "Recent updates" row: label, what changed, from → to, delta. */
function updateCard(u) {
  const delta = u.to - u.from;
  const up = delta >= 0;
  return el(`
    <div class="g-row update-card">
      ${u.overall ? `<span class="g-badge" style="--b-from:var(--gauge-to);--b-to:var(--gauge-from)">${GLYPHS.percent}</span>` : subjectBadge(u.label)}
      <span class="g-row-main">
        <b>${escapeHtml(u.overall ? "Overall average" : courseTitle({ code: u.label }))}</b>
        <small class="update-trend">${fmtPercent(u.from)} → ${fmtPercent(u.to)}</small>
      </span>
      <span class="g-delta ${up ? "up" : "down"} delta-pill">${up ? "↑" : "↓"} ${pct(Math.abs(delta))}</span>
    </div>
  `);
}
