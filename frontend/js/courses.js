import { preferences, savePreferences } from "./personalization.js";
import { mySchool, studentSite, icon } from "./schools.js";
import { syncFromCloud } from "./cloud-store.js";
import { GLYPHS, arcGauge, glassButton, pageHeader, pager, pct } from "./ui-kit.js";
import { fullCode, rememberCourseOrder, subjectBadge, subjectStyle } from "./subjects.js";
// ============================================================================
// Courses screen + shared UI helpers
// ----------------------------------------------------------------------------
// Renders the glass header (class schedule · TeachAssist · recent updates),
// a swipeable Overall Average gauge / average-over-time chart, and the course
// pills. Also exports the small UI helpers (el, escapeHtml, sheets,
// skeletons) used by the other views.
// ============================================================================

import { courseName, courseMeta } from "./course-names.js";
import { courseOverride } from "./class-times.js";
import { openSchedule } from "./schedule.js";
import { teacherFor } from "./teachers.js";
import { splitByTerm } from "./term.js";
import { haptic } from "./customize.js";
import { HOLD_MS, LOCK_PX } from "./swipe.js";
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
  showingSavedCopy,
  isDemo,
  hasLiveCourses,
  getSavedCourses,
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
/** "Show grades" while marks are hidden: an eye with a slash. */
const EYE_OFF = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 3l18 18"/><path d="M10.6 5.1A10 10 0 0 1 12 5c6 0 9.5 7 9.5 7a17 17 0 0 1-3.2 4.2M6.5 6.6A17 17 0 0 0 2.5 12S6 19 12 19a9.6 9.6 0 0 0 4.4-1.1"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>';

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
  return courseOverride(fullCode(course)).name || courseName(label) || courseSubtitle(course).split(",")[0] || label;
}

/** Round to one decimal and add "%". Shows "—" when there is no value. */
export function fmtPercent(v) {
  if (v == null || isNaN(v)) return "—";
  if (marksHidden()) return "••%"; // Hide grades: never print the number.
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
  // Focus goes back here when the sheet closes.
  const opener = document.activeElement;
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
    // No visible title (the body carries its own heading): drop the empty
    // heading and name the dialog after that body heading instead.
    if (!title.trim()) {
      header.querySelector(".g-header-title")?.replaceChildren();
      sheet.removeAttribute("aria-label");
    }
    sheet.appendChild(header);
  }
  sheet.appendChild(bodyNode);
  const named = options.labelledBy && bodyNode.querySelector?.(`#${options.labelledBy}`);
  if (named) sheet.setAttribute("aria-labelledby", options.labelledBy);
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
  activeSheetCleanup = () => {
    document.removeEventListener("keydown", onKeyDown);
    options.onClose?.();
    if (opener?.isConnected && typeof opener.focus === "function") opener.focus({ preventScroll: true });
  };
  activeSheet = backdrop;
  dragToDismiss(sheet);
  // Move focus into the dialog (not onto a button, which would draw a ring).
  sheet.tabIndex = -1;
  requestAnimationFrame(() => sheet.focus({ preventScroll: true }));
  return { close: closeSheet, sheet };
}

/**
 * Pull a sheet down by its grabber or header to dismiss it. Tracks the finger
 * 1:1, resists when pulled up, and on release projects the flick's momentum:
 * far or fast enough closes, otherwise it springs back from where it is.
 */
function dragToDismiss(sheet) {
  let drag = null;
  const handle = (t) => t.closest?.(".sheet-grabber, .sheet-header") && !t.closest("button, a, input");
  sheet.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || !handle(e.target)) return;
    drag = { id: e.pointerId, y0: e.clientY, dy: 0, moved: false, hist: [{ y: e.clientY, t: performance.now() }] };
  });
  sheet.addEventListener("pointermove", (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const raw = e.clientY - drag.y0;
    if (!drag.moved) {
      if (Math.abs(raw) < 6) return;
      drag.moved = true;
      sheet.classList.add("g-sheet-dragging");
      try { sheet.setPointerCapture(e.pointerId); } catch { /* pointer already gone */ }
    }
    // Upward pulls rubber-band; downward pulls follow the finger exactly.
    drag.dy = raw >= 0 ? raw : -((-raw * 0.55 * 300) / (300 + 0.55 * -raw));
    drag.hist.push({ y: e.clientY, t: performance.now() });
    if (drag.hist.length > 5) drag.hist.shift();
    sheet.style.transform = `translateY(${drag.dy}px)`;
  });
  const end = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const { dy, moved, hist } = drag;
    drag = null;
    sheet.classList.remove("g-sheet-dragging");
    if (!moved) return;
    const a = hist[0], b = hist[hist.length - 1];
    const v = b.t > a.t ? ((b.y - a.y) / (b.t - a.t)) * 1000 : 0; // px/s
    const projected = dy + (v / 1000) * 0.998 / (1 - 0.998);
    if (projected > sheet.offsetHeight * 0.35) {
      sheet.style.transform = `translateY(${sheet.offsetHeight + 40}px)`;
      closeSheet();
    } else {
      sheet.style.transform = "";
    }
  };
  sheet.addEventListener("pointerup", end);
  sheet.addEventListener("pointercancel", end);
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
let loads = 0;
/**
 * The Courses screen. A TeachAssist sign-in can take 10+ seconds, so on first
 * open the student's last saved marks (this device, else the cloud) are shown
 * straight away and swapped for live marks when they arrive. `saved` draws one
 * of those saved copies: { courses, status }.
 */
export async function renderCourses(container, { refresh = false, saved = null } = {}) {
  // Left: schedule + Hide grades. Right: refresh (Settings → Experience →
  // Refresh button) + inbox. The status line gets its own row underneath.
  const header = (subtitle, dot = false) => {
    const withRefresh = preferences().refreshButton;
    const hidden = marksHidden();
    const html = pageHeader({
      title: "TA Dashboard",
      subtitle,
      left: glassButton("schedule", "Class schedule", "data-schedule") +
        glassButton(hidden ? EYE_OFF : "eye", hidden ? "Show grades" : "Hide grades", `data-privacy aria-pressed="${hidden}"`),
      right: (withRefresh ? glassButton("refresh", "Refresh marks", "data-refresh") : "") +
        glassButton("inbox", "Recent updates", `data-inbox${dot ? ' data-dot="true"' : ""}`),
    });
    return html.replace('class="g-header"', 'class="g-header g-header-wide"');
  };
  if (!refresh || !container.querySelector(".g-header")) {
    container.innerHTML = `${header("Loading your marks…")}<div class="g-list">${skeletonCards(5)}</div>`;
  } else {
    container.querySelector(".g-header-title p").textContent = "Refreshing…";
  }

  let courses = saved?.courses;
  if (!saved) try {
    const load = (container.dataset.load = String(++loads));
    const live = getCourses({ refresh });
    if (!refresh && !hasLiveCourses()) {
      live.catch(() => {}); // a failure is handled once the saved copy is up
      const copy = await getSavedCourses();
      const current = () => container.isConnected && container.dataset.load === load;
      if (copy && !hasLiveCourses() && current()) {
        const when = copy.savedAt ? relativeUpdated(copy.savedAt).replace(/^Updated\s*/i, "") : "";
        renderCourses(container, { saved: { courses: copy.courses, status: `${when ? `Saved ${when}` : "Saved marks"}…` } });
        live.then(
          () => current() && renderCourses(container),
          () => current() && renderCourses(container, { saved: { courses: copy.courses, status: "Saved · tap to retry" } }),
        );
        return;
      }
    }
    courses = await live;
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
  const status = saved ? saved.status : isDemo() ? "Demo data" : showingSavedCopy() ? `Last saved marks · ${relativeUpdated(lastSyncedAt()).replace(/^Updated\s*/i, "")}` : relativeUpdated(lastSyncedAt());
  const sub = top.querySelector(".g-header-title");
  // One refresh control: with the ↻ button on, the status is just a label;
  // with it off, the status pill itself refreshes.
  const tapToRefresh = !preferences().refreshButton && !isDemo();
  sub.insertAdjacentHTML(
    "beforeend",
    tapToRefresh
      ? `<button type="button" class="g-status" aria-label="${escapeHtml(status)}. Refresh marks">${escapeHtml(status)}${GLYPHS.refresh}</button>`
      : `<span class="g-status" role="status">${escapeHtml(status)}</span>`,
  );
  if (tapToRefresh) sub.querySelector(".g-status").addEventListener("click", () => renderCourses(container, { refresh: true }));
  top.querySelector("[data-privacy]").addEventListener("click", () => {
    savePreferences({ hideMarks: !marksHidden() });
    renderCourses(container);
  });
  top.querySelector("[data-schedule]").addEventListener("click", () => openSchedule(courses, { onEdit: () => renderCourses(container) }));
  top.querySelector("[data-inbox]").addEventListener("click", () => openUpdates(changes, updates.find((u) => u.overall)));
  top.querySelector("[data-refresh]")?.addEventListener("click", async (e) => {
    const btn = e.currentTarget;
    if (isDemo()) {
      haptic("warning");
      return savedFeedback(sub.querySelector(".g-status"), "Demo data is bundled");
    }
    if (btn.classList.contains("is-spinning")) return;
    btn.classList.add("is-spinning");
    btn.setAttribute("aria-busy", "true");
    await renderCourses(container, { refresh: true });
    haptic("success");
  });
  container.appendChild(top);
  const hello = greeting();
  if (hello) container.appendChild(hello);
  const footer = el(`<p class="muted small student-run-note">This is a student-run website and is not affiliated with YRDSB.</p>`);

  // ── Hero pager: overall gauge · average over time ──
  const ov = updates.find((u) => u.overall);
  const delta = ov ? ov.to - ov.from : null;
  const track = el(`<div class="g-pager" aria-label="Overall average"></div>`);
  const gaugePage = el(`
    <section class="g-page g-hero" aria-label="Overall average ${overall == null ? "not available" : fmtPercent(overall)}">
      <div class="g-gauge-wrap">
        <span class="g-hero-icon" aria-hidden="true">${GLYPHS.cap}</span>
        ${arcGauge(overall, { id: "overall" })}
        <div class="g-gauge-center">
          <div class="g-hero-num private-mark">${pct(overall)}</div>
          ${delta != null && Math.abs(delta) >= 0.05 ? `<div class="g-delta ${delta >= 0 ? "up" : "down"} delta-pill">${delta >= 0 ? "↑" : "↓"} ${pct(Math.abs(delta))}</div>` : ""}
        </div>
      </div>
      <p class="g-caption">Overall Average</p>
      ${overall != null && !marksHidden() ? `<p class="g-level private-mark">${achievementLevel(overall)} · ${letterGrade(overall)}</p>` : ""}
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
    container.appendChild(footer);
    return;
  }
  // The list's order picks each course's theme shade on every screen.
  rememberCourseOrder(courses.map((c) => c.code || courseLabel(c)));
  const list = el(`<div class="g-list course-grid"></div>`);
  courses.forEach((c, i) => {
    const big = displayMark(c);
    const label = courseLabel(c);
    const title = courseTitle(c);
    const teacher = teacherFor(c).name;
    const row = el(`
      <button type="button" class="g-row course-card" style="--tint:${subjectStyle(c.code || label).from}" aria-label="${escapeHtml(title)}, ${escapeHtml(label)}, ${big == null ? "no mark" : fmtPercent(big)}">
        ${subjectBadge(c.code || label)}
        <span class="g-row-main">
          <b>${escapeHtml(title)}</b>
          <small>${escapeHtml([label, teacher, c.saved ? "Last saved mark" : markKind(c) === "estimate" ? "Estimated" : ""].filter(Boolean).join(" · "))}</small>
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
  container.appendChild(footer);

  // A quick link to the school's student-run site (e.g. Bill Hogarth).
  mySchool()
    .then((school) => {
      const site = studentSite(school);
      if (!site || !container.isConnected) return;
      list.after(el(`
        <section class="card link-list school-site">
          <a class="link-row" href="${escapeHtml(site.url)}" target="_blank" rel="noopener">
            <span class="link-icon tone-school" aria-hidden="true">${icon("star", 20)}</span>
            <span class="link-text"><b>${escapeHtml(site.name)}</b><small>${escapeHtml(site.sub)}</small><small class="link-host">Student-run site · ${escapeHtml(new URL(site.url).hostname)} ↗</small></span>
          </a>
        </section>`));
    })
    .catch(() => {});

  // The dream card: an invitation until it's filled in, then a quiet summary.
  // Either way it comes after the courses.
  const dreamCard = () => {
    const p = preferences();
    const card = p.dreamDone
      ? el(`<div class="card dream-preview"><div><div class="eyebrow">THE BIG PICTURE</div><h2></h2><p class="muted"></p><button class="btn secondary" style="width:auto">View my dreams ↗</button></div><div class="dream-orbit" aria-hidden="true">✧</div></div>`)
      : el(`<div class="card dream-preview dream-nudge"><div><div class="eyebrow">YOUR DREAM</div><h2>Create your dream</h2><p class="muted">Tell us where you're headed and we'll turn your marks into a plan. It takes two minutes.</p><button class="btn" style="width:auto">Create your dream ↗</button></div><div class="dream-orbit" aria-hidden="true">✧</div></div>`);
    if (p.dreamDone) {
      card.querySelector("h2").textContent = p.career;
      card.querySelector("p").textContent = [p.school, `aiming for ${p.target}%`].filter(Boolean).join(" · ");
    }
    card.querySelector("button").addEventListener("click", () => window.AppNav.toDreams());
    return card;
  };
  let dream = dreamCard();
  // Compact home keeps every course on the first screen: the dream goes below.
  // Courses come first; the dream invitation sits below them.
  const place = (card) => footer.before(card);
  place(dream);
  // A new phone or cleared browser: pull the saved dream, then refresh the card.
  syncFromCloud().then((changed) => {
    if (!changed || !container.isConnected) return;
    if (hello?.isConnected && hello.matches(".name-prompt") && preferences().name) hello.replaceWith(greeting());
    const next = dreamCard();
    dream.remove();
    dream = next;
    place(dream);
  });
  orbitSparkles(dream.querySelector(".dream-orbit"), 4);
}

/**
 * "Good morning, Sam 👋" once the student has a name. On their first visit
 * without one, a small card asks what to call them (once — "Not now" sticks).
 */
function greeting() {
  const p = preferences();
  if (p.name) {
    const h = new Date().getHours();
    const part = h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
    return el(`<p class="g-greeting">${part}, ${escapeHtml(p.name)} 👋</p>`);
  }
  if (p.namePrompted) return null;
  const form = el(`
    <form class="card name-prompt">
      <label for="welcome-name"><b>Welcome! What should we call you?</b><small>We'll greet you by name. Change it anytime in Settings.</small></label>
      <div class="name-prompt-row">
        <input id="welcome-name" maxlength="50" placeholder="Your first name" autocomplete="given-name" required>
        <button class="btn">Save</button>
      </div>
      <button type="button" class="name-prompt-skip" data-skip>Not now</button>
    </form>`);
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = form.querySelector("input").value.trim();
    if (!name) return;
    savePreferences({ name, namePrompted: true });
    form.replaceWith(greeting());
  });
  form.querySelector("[data-skip]").addEventListener("click", () => {
    savePreferences({ namePrompted: true });
    form.remove();
  });
  return form;
}

/** "Overall Average Over Time": one point per saved snapshot. */
function trendPage(codes) {
  const page = el(`<section class="g-page g-hero" aria-label="Overall average over time"></section>`);
  const rows = getSnapshots()
    .map((s) => {
      const marks = codes.map((code) => s.marks[code]).filter(Number.isFinite);
      const date = Date.parse(s.date);
      return {
        date,
        value: marks.length ? marks.reduce((a, b) => a + b, 0) / marks.length : null,
        label: Number.isFinite(date) ? new Date(date).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "",
      };
    })
    .filter((r) => r.value != null && Number.isFinite(r.date));
  if (marksHidden()) {
    page.append(el(`<p class="g-empty-note">Hidden while “Hide grades” is on.</p>`));
  } else if (!rows.length) {
    page.append(el(`<p class="g-empty-note">Your average over time appears after your first refresh.</p>`));
  } else {
    page.append(trendChartEl(rows));
  }
  page.append(el(`<p class="g-caption">Overall Average Over Time</p>`));
  return page;
}

/** True for the first and latest point and wherever the value changes. */
function keyPoint(rows, i) {
  return i === 0 || i === rows.length - 1 || Math.abs(rows[i].value - rows[i - 1].value) >= 0.05;
}

/**
 * Smooth curve through the points that never overshoots them (monotone cubic,
 * Fritsch–Carlson), so a 100% → 94% drop never draws a bump above 100%.
 */
export function smoothPath(pts) {
  if (pts.length < 2) return "";
  if (pts.length === 2) return `M${pts[0][0]},${pts[0][1]}L${pts[1][0]},${pts[1][1]}`;
  const n = pts.length, dx = [], m = [], t = new Array(n);
  for (let i = 0; i < n - 1; i++) {
    dx[i] = pts[i + 1][0] - pts[i][0] || 1e-6;
    m[i] = (pts[i + 1][1] - pts[i][1]) / dx[i];
  }
  t[0] = m[0];
  t[n - 1] = m[n - 2];
  for (let i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) { t[i] = t[i + 1] = 0; continue; }
    const a = t[i] / m[i], b = t[i + 1] / m[i], h = a * a + b * b;
    if (h > 9) { const k = 3 / Math.sqrt(h); t[i] = k * a * m[i]; t[i + 1] = k * b * m[i]; }
  }
  const f = (v) => v.toFixed(1);
  let d = `M${f(pts[0][0])},${f(pts[0][1])}`;
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[i + 1], h = dx[i] / 3;
    d += `C${f(x0 + h)},${f(y0 + t[i] * h)} ${f(x1 - h)},${f(y1 - t[i + 1] * h)} ${f(x1)},${f(y1)}`;
  }
  return d;
}

let chartSeq = 0;
/**
 * Liquid Glass grade chart: a smooth line in the theme colour with a glowing
 * fill under it and glossy dots where the mark changed.
 * Rows: { date, value, label?, detail? }. `label` names the point (a test or a
 * day) and `detail` adds a second line (e.g. "11 / 13 (84.6%)").
 */
export function trendChart(rows) {
  // B leaves room under the plot for the glass floor shelf.
  const W = 300, H = 178, L = 44, R = 18, T = 14, B = 30;
  const DX = 7, DY = -6; // depth: how far the back layer sits up-and-right
  const id = `gc${++chartSeq}`;
  const values = rows.map((r) => r.value);
  let hi = Math.min(100, Math.ceil(Math.max(...values) + 1));
  let lo = Math.max(0, Math.floor(Math.min(...values) - 3));
  if (hi - lo < 6) lo = Math.max(0, hi - 6);
  const step = (hi - lo) / 3;
  const y = (v) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const start = rows[0].date, end = rows.at(-1).date;
  const x = (d) => L + (end === start ? 0.5 : (d - start) / (end - start)) * (W - L - R);
  const base = H - B;
  const grid = [0, 1, 2, 3]
    .map((i) => {
      const v = hi - i * step;
      return `<line x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}" class="g-grid"/><text x="${L - 8}" y="${y(v) + 4}" text-anchor="end" class="g-axis">${Math.round(v)}%</text>`;
    })
    .join("");
  const xs = rows.length === 1 ? [x(start)] : [L + (W - L - R) / 3, L + (2 * (W - L - R)) / 3];
  const verticals = xs.map((vx) => `<line x1="${vx}" x2="${vx}" y1="${T}" y2="${base}" class="g-grid g-vgrid"/>`).join("");
  const pts = rows.map((r) => [x(r.date), y(r.value)]);
  const line = smoothPath(pts);
  const area = line ? `${line}L${pts.at(-1)[0].toFixed(1)},${base}L${pts[0][0].toFixed(1)},${base}Z` : "";
  // One dot where the mark changes (plus the first and latest), not one per
  // refresh, so a flat stretch reads as a line instead of a row of beads.
  // Thin glass "drop lines" from each dot down to the floor.
  const drops = rows
    .map((r, i) => (keyPoint(rows, i) ? `<line x1="${pts[i][0].toFixed(1)}" x2="${pts[i][0].toFixed(1)}" y1="${pts[i][1].toFixed(1)}" y2="${base}" class="g-drop"/>` : ""))
    .join("");
  // The glass floor: a shelf in perspective with a bright front edge.
  const fl = L - 8, fr = W - R + DX + 6, fb = base + 9;
  const floor = `<g class="g-floor"><path d="M${fl + DX},${base + DY}L${fr},${base + DY}L${fr - DX - 4},${fb}L${fl - 2},${fb}Z" class="g-floor-top" fill="url(#${id}-floor)"/><path d="M${fl - 2},${fb}L${fr - DX - 4},${fb}L${fr - DX - 4},${fb + 3}L${fl - 2},${fb + 3}Z" class="g-floor-edge"/></g>`;
  const dots = rows
    .map((r, i) => (keyPoint(rows, i) ? `<circle cx="${pts[i][0].toFixed(1)}" cy="${pts[i][1].toFixed(1)}" r="5" class="g-dot" style="fill:url(#${id}-dot)" data-i="${i}"/>` : ""))
    .join("");
  const label = `From ${fmtPercent(rows[0].value)} to ${fmtPercent(rows.at(-1).value)} over ${rows.length} point${rows.length === 1 ? "" : "s"}`;
  const defs = `<defs>
    <linearGradient id="${id}-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--accent);stop-opacity:.42"/><stop offset="1" style="stop-color:var(--accent);stop-opacity:0"/></linearGradient>
    <linearGradient id="${id}-line" x1="0" y1="0" x2="1" y2="0"><stop offset="0" style="stop-color:var(--accent)"/><stop offset="1" style="stop-color:color-mix(in srgb, var(--accent) 70%, white)"/></linearGradient>
    <linearGradient id="${id}-floor" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--accent);stop-opacity:.10"/><stop offset="1" style="stop-color:var(--accent);stop-opacity:.32"/></linearGradient>
    <linearGradient id="${id}-wall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" style="stop-color:var(--accent);stop-opacity:.22"/><stop offset="1" style="stop-color:var(--accent);stop-opacity:.04"/></linearGradient>
    <radialGradient id="${id}-dot" cx=".35" cy=".3" r=".75"><stop offset="0" stop-color="#fff"/><stop offset=".35" style="stop-color:color-mix(in srgb, var(--accent) 45%, white)"/><stop offset="1" style="stop-color:var(--accent)"/></radialGradient>
  </defs>`;
  const halo = `<circle class="g-halo" r="11" cx="${pts.at(-1)[0].toFixed(1)}" cy="${pts.at(-1)[1].toFixed(1)}" visibility="hidden"/>`;
  const cursor = `<line class="g-cursor" x1="${L}" x2="${L}" y1="${T}" y2="${base}" visibility="hidden"/>`;
  return `<svg class="g-chart g-liquid" viewBox="0 0 ${W} ${H}" role="img" aria-label="${label}">${defs}${grid}${verticals}${
    area
      ? // Back layer (offset up-right) gives the glass sheet its thickness.
        `${floor}<g class="g-depth" transform="translate(${DX} ${DY})"><path d="${area}" class="g-area-back" fill="url(#${id}-wall)"/><path d="${line}" class="g-line-back"/></g><path d="${area}" class="g-area" fill="url(#${id}-fill)"/>${drops}<path d="${line}" class="g-line-glow"/><path d="${line}" class="g-line" stroke="url(#${id}-line)"/>`
      : ""
  }${cursor}${halo}${dots}</svg>`;
}

export function trendChartEl(rows) {
  const wrap = el(`<div class="g-trend" tabindex="0" aria-label="Grade history. Press and hold, then slide, or use arrow keys to see each point.">${trendChart(rows)}<div class="g-tip" role="status" hidden></div></div>`);
  const svg = wrap.querySelector("svg");
  const tip = wrap.querySelector(".g-tip");
  const cursor = wrap.querySelector(".g-cursor");
  const halo = wrap.querySelector(".g-halo");
  const dots = [...wrap.querySelectorAll(".g-dot")];
  let current = -1, hideTimer = 0;

  // Dots only mark changes, so the k-th dot is row `data-i`, and "change"
  // compares with the previous dot.
  const row = (k) => rows[Number(dots[k].dataset.i)];
  const show = (k) => {
    clearTimeout(hideTimer);
    if (k === current) return; // same dot: nothing to redraw (keeps sliding smooth)
    current = k;
    const r = row(k), prev = k > 0 ? row(k - 1) : null;
    const diff = prev ? r.value - prev.value : 0;
    const change = !prev
      ? "Start"
      : Math.abs(diff) < 0.05
        ? "No change"
        : `<span class="g-chg ${diff > 0 ? "up" : "down"}">${diff > 0 ? "▲" : "▼"} ${Math.abs(diff).toFixed(1)}%</span>`;
    tip.innerHTML = `<b class="g-tip-num">${escapeHtml(fmtPercent(r.value))}</b> · ${change}${
      r.label || r.detail ? `<br>${escapeHtml([r.label, r.detail].filter(Boolean).join(": "))}` : ""
    }`;
    tip.hidden = false;
    const dot = dots[k];
    const cx = Number(dot.getAttribute("cx"));
    cursor.setAttribute("x1", cx);
    cursor.setAttribute("x2", cx);
    cursor.setAttribute("visibility", "visible");
    const cy = Number(dot.getAttribute("cy"));
    halo.setAttribute("cx", cx);
    halo.setAttribute("cy", cy);
    halo.setAttribute("visibility", "visible");
    dots.forEach((d) => d.classList.toggle("is-active", d === dot));
    // The glass bubble floats just above the dot, kept inside the card; its
    // pointer still aims at the dot when the bubble is nudged sideways.
    const box = svg.getBoundingClientRect(), outer = wrap.getBoundingClientRect();
    const scale = box.width / 300;
    const px = box.left - outer.left + cx * scale;
    const py = box.top - outer.top + cy * scale;
    const half = Math.min(tip.offsetWidth / 2, outer.width / 2);
    const left = Math.min(Math.max(px, half), outer.width - half);
    tip.style.left = `${left}px`;
    tip.style.top = `${Math.max(0, py - tip.offsetHeight - 14)}px`;
    tip.style.setProperty("--tip-arrow", `${px - left}px`);
  };
  const hide = () => {
    current = -1;
    tip.hidden = true;
    cursor.setAttribute("visibility", "hidden");
    halo.setAttribute("visibility", "hidden");
    dots.forEach((d) => d.classList.remove("is-active"));
  };
  const nearest = (e) => {
    const box = svg.getBoundingClientRect();
    const sx = ((e.clientX - box.left) / box.width) * 300;
    let best = 0;
    dots.forEach((d, i) => {
      if (Math.abs(Number(d.getAttribute("cx")) - sx) < Math.abs(Number(dots[best].getAttribute("cx")) - sx)) best = i;
    });
    return best;
  };

  // Mouse: press and drag to inspect. Finger: a quick swipe belongs to the
  // pager (switches page); press and hold first, then slide, to inspect. A
  // plain tap shows the nearest point.
  let dragging = false, hold = null, holdTimer = 0;
  const startInspect = (p) => {
    dragging = true;
    wrap.classList.add("is-inspecting");
    try { svg.setPointerCapture(p.pointerId); } catch { /* finger already lifted */ }
    show(nearest(p));
  };
  svg.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse") {
      startInspect(e);
      e.stopPropagation();
      return;
    }
    hold = { pointerId: e.pointerId, x: e.clientX, y: e.clientY, clientX: e.clientX, moved: false };
    clearTimeout(holdTimer);
    holdTimer = setTimeout(() => hold && !hold.moved && startInspect(hold), HOLD_MS);
  });
  // At most one update per frame, however fast the finger moves.
  let frame = 0, lastMove = null;
  svg.addEventListener("pointermove", (e) => {
    if (hold && !dragging) {
      hold.clientX = e.clientX;
      if (Math.abs(e.clientX - hold.x) >= LOCK_PX || Math.abs(e.clientY - hold.y) >= LOCK_PX) {
        hold.moved = true; // it's a swipe or a scroll, not a hold
        clearTimeout(holdTimer);
      }
    }
    if (!(dragging || e.pointerType === "mouse")) return;
    lastMove = e;
    if (!frame) frame = requestAnimationFrame(() => { frame = 0; show(nearest(lastMove)); });
  });
  const release = (e) => {
    clearTimeout(holdTimer);
    const tapped = hold && !hold.moved && !dragging && e.type === "pointerup";
    hold = null;
    if (tapped) show(nearest(e));
    else if (!dragging) return;
    dragging = false;
    wrap.classList.remove("is-inspecting");
    hideTimer = setTimeout(hide, 2500);
  };
  svg.addEventListener("pointerup", release);
  svg.addEventListener("pointercancel", release);
  svg.addEventListener("pointerleave", (e) => e.pointerType === "mouse" && hide());
  wrap.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const next = current < 0 ? dots.length - 1 : current + (e.key === "ArrowRight" ? 1 : -1);
    show(Math.min(Math.max(next, 0), dots.length - 1));
  });
  wrap.addEventListener("blur", hide);
  return wrap;
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
