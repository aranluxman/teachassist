// ============================================================================
// Course detail — swipeable gauge / progression / info pages + Evaluations and
// Breakdown tabs.
// ----------------------------------------------------------------------------
// Each evaluation row carries its Ontario achievement category as a round
// letter badge (K/U, T, C, A, F) with its weight and mark; tapping it opens a
// sheet with the strand bars and how much it moved the average. The Breakdown
// tab aggregates a weighted average per category as segmented bars.
// ============================================================================

import { achievementLevel, courseLabel, courseTitle, el, escapeHtml, fmtPercent, openSheet, trendChart } from "./courses.js";
import { GLYPHS, arcGauge, glassButton, pageHeader, pager, pct, segBar } from "./ui-kit.js";
import { fmtDay, fullCode, letterBadge, scheduleOf, subjectBadge } from "./subjects.js";
import { courseMeta } from "./course-names.js";
import { teacherFor, editTeacher } from "./teachers.js";
import { askAboutCourse } from "./assistant-session.js";
import { preferences } from "./personalization.js";
import { displayMark, markKind } from "./ta-client.js";
import { animateGauge, countUp, mountThumb, previousValue, rememberValue } from "./motion.js";

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

function fmtDate(iso) {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  if (isNaN(d)) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// Strand letter-badge gradients (TeachAssist's yellow / green / blue / orange,
// plus pink for Final/Culminating and other categories).
const STRAND_STYLE = {
  k: ["K/U", "#ffcf4a", "#f59e0b"],
  t: ["T", "#3ee0a1", "#10a37a"],
  c: ["C", "#8f96ff", "#5b5ff0"],
  a: ["A", "#ffa25a", "#f2640c"],
  f: ["F", "#ff7aa0", "#e8336a"],
};
function strandBadge(category) {
  const key = strandKey(category) || "f";
  const [letter, from, to] = STRAND_STYLE[key];
  const text = strandKey(category) ? letter : (String(category || "?").trim().charAt(0).toUpperCase() || "?");
  return letterBadge(escapeHtml(text), from, to);
}
const strandColor = (category) => `var(--strand-${strandKey(category) || "f"}-bar)`;

/** Weighted mean of evaluations (weight 1 when missing; weight 0 = formative, not counted). */
function weightedMean(list) {
  let sum = 0, w = 0;
  for (const e of list) {
    const wt = typeof e.weight === "number" && e.weight >= 0 ? e.weight : 1;
    sum += e.percent * wt;
    w += wt;
  }
  return w ? sum / w : null;
}

/** Open the detail screen for a (live or demo) course object. */
export async function openCourseDetail(container, course) {
  activeSeg = "evals";
  container.innerHTML = "";

  const evals = (Array.isArray(course.evaluations) ? course.evaluations : []).filter(
    (e) => e && typeof e.percent === "number"
  );
  const mark = displayMark(course);
  const kind = markKind(course);
  const { period, room, term } = scheduleOf(course);

  // ── Header: back · code · ask the assistant ──
  const nav = el(
    pageHeader({
      title: fullCode(course) || courseLabel(course),
      subtitle: escapeHtml(courseTitle(course)),
      left: glassButton("back", "Back to courses", "data-back"),
      right: glassButton("wand", "Ask the assistant about this course", "data-ask"),
    }),
  );
  nav.querySelector("[data-back]").addEventListener("click", () => window.AppNav.toCourses());
  nav.querySelector("[data-ask]").addEventListener("click", () => {
    askAboutCourse({
      code: courseLabel(course),
      title: courseTitle(course),
      markText: mark != null && !preferences().hideMarks ? fmtPercent(mark) : "",
    });
    window.AppNav.toAssistant();
  });
  container.appendChild(nav);

  // ── Pager: mark gauge · progression · course info ──
  const track = el(`<div class="g-pager" id="d-carousel"></div>`);
  const gaugePage = el(`
    <section class="g-page g-hero" aria-label="${kind === "midterm" ? "Midterm mark" : "Current mark"} ${mark == null ? "not available" : fmtPercent(mark)}">
      <div class="g-gauge-wrap">
        ${arcGauge(mark, { id: "course" })}
        <div class="g-gauge-center">
          <div class="g-hero-num private-mark">${pct(mark)}</div>
          ${course.midterm != null && kind !== "midterm" ? `<div class="g-delta">Midterm ${pct(Number(course.midterm))}</div>` : ""}
        </div>
      </div>
      <p class="g-caption">${kind === "midterm" ? "Midterm Mark" : "Current Mark"}${mark != null ? ` · ${achievementLevel(mark)}` : ""}</p>
    </section>`);
  track.appendChild(gaugePage);

  const labels = ["Mark"];
  if (evals.length) {
    let sum = 0;
    const rows = evals.map((e, i) => ((sum += e.percent), { date: i, value: sum / (i + 1) }));
    const page = el(`<section class="g-page g-hero" aria-label="Grade progression"></section>`);
    page.insertAdjacentHTML("beforeend", preferences().hideMarks ? `<p class="g-empty-note">Hidden while “Hide grades” is on.</p>` : trendChart(rows));
    page.append(el(`<p class="g-caption">Grade Progression</p>`));
    track.appendChild(page);
    labels.push("Grade progression");
  }

  const chip = (glyph, text) => `<span class="g-chip">${GLYPHS[glyph]}${text}</span>`;
  const chips = [
    period && chip("clock", `Period ${escapeHtml(period)}`),
    room && chip("pin", `Room ${escapeHtml(room)}`),
    term && chip("calendar", `${escapeHtml(fmtDay(term.start))} <span class="g-chip-arrow">${GLYPHS.arrowRight}</span> ${escapeHtml(fmtDay(term.end))}`),
    !term && courseMeta(courseLabel(course)) && chip("calendar", escapeHtml(courseMeta(courseLabel(course)))),
  ].filter(Boolean);
  const stat = (glyph, value, label) =>
    `<div class="g-stat">${GLYPHS[glyph]}<div><b class="private-mark">${value == null ? `<span class="g-pct g-none">No Mark</span>` : pct(Number(value))}</b><small>${label}</small></div></div>`;
  track.appendChild(
    el(`
    <section class="g-page g-info" aria-label="Course info">
      <div class="g-info-top">
        ${subjectBadge(course.code, "g-badge-xl")}
        <div class="g-chips">${chips.join("") || chip("clock", "Timetable details not listed")}</div>
      </div>
      <div class="g-stats">
        ${stat("percent", course.midterm, "Midterm")}
        ${stat("seal", course.final ?? course.finalMark ?? null, "Final")}
      </div>
    </section>`),
  );
  labels.push("Course info");
  container.appendChild(track);
  container.appendChild(pager(track, labels));
  if (mark != null) {
    const key = `course:${course.code || courseLabel(course)}`;
    const from = previousValue(key, 0);
    animateGauge(gaugePage, mark, { from });
    countUp(gaugePage.querySelector(".g-hero-num .g-pct"), mark, {
      from,
      duration: 1100,
      format: (v) => `${(Math.round(v * 10) / 10).toFixed(1)}<small>%</small>`,
      html: true,
    });
    rememberValue(key, mark);
  }

  // ── Segmented: Evaluations / Breakdown ──
  const seg = el(`
    <div class="segmented g-segmented" role="tablist" aria-label="Course details">
      <button type="button" role="tab" data-seg="evals">Evaluations</button>
      <button type="button" role="tab" data-seg="breakdown">Breakdown</button>
    </div>
  `);
  const content = el(`<div id="seg-content" class="g-list"></div>`);
  container.appendChild(seg);
  container.appendChild(content);

  const moveSegThumb = mountThumb(seg, { inset: 5, radius: "999px" });
  const show = (s) => {
    activeSeg = s;
    seg.querySelectorAll("button").forEach((b) => {
      b.classList.toggle("active", b.dataset.seg === s);
      b.setAttribute("aria-selected", String(b.dataset.seg === s));
    });
    moveSegThumb(seg.querySelector("button.active"));
    content.innerHTML = "";
    content.appendChild(s === "evals" ? buildEvals(evals, kind) : buildBreakdown(evals));
  };
  window.addEventListener("resize", () => moveSegThumb(seg.querySelector("button.active")));
  seg.querySelectorAll("button").forEach((b) => b.addEventListener("click", () => show(b.dataset.seg)));
  show(activeSeg);
  requestAnimationFrame(() => moveSegThumb(seg.querySelector("button.active")));

  container.appendChild(teacherCard(course));
}

/** Teacher contact card — add once, then tap to email. */
function teacherCard(course) {
  const t = teacherFor(course);
  const card = el(`
    <section class="card teacher-card">
      <div class="person-row">
        <span class="avatar">${t.name ? escapeHtml(t.name.replace(/^(mr|ms|mrs|dr|mx)\.?\s+/i, "").charAt(0).toUpperCase()) : "?"}</span>
        <div class="person-main">
          <div class="eyebrow">TEACHER</div>
          <b>${t.name ? escapeHtml(t.name) : "Add your teacher"}</b>
          <p class="small muted">${t.name ? escapeHtml([t.room && `Room ${t.room}`, t.help && `Extra help: ${t.help}`].filter(Boolean).join(" · ") || "Add room and extra-help times") : "Name, email, room and extra-help times"}</p>
        </div>
        ${t.email ? `<a class="btn secondary" href="mailto:${encodeURIComponent(t.email)}?subject=${encodeURIComponent(courseLabel(course))}">Email</a>` : ""}
        <button type="button" class="btn ghost" data-edit>${t.name ? "Edit" : "Add"}</button>
      </div>
    </section>`);
  card.querySelector("[data-edit]").onclick = () => editTeacher(course, () => card.replaceWith(teacherCard(course)));
  return card;
}

// ── Evaluations list (letter badge + name + weight + mark → detail sheet) ──
function buildEvals(evals, kind) {
  const frag = document.createElement("div");
  frag.className = "g-list";
  if (!evals.length) {
    frag.appendChild(
      el(`<div class="card empty-inline" role="status"><b>No evaluations yet</b>${
        kind === "midterm"
          ? "Showing the midterm mark — individual assessments aren't posted yet."
          : kind === "current"
            ? "TeachAssist shows a mark for this course but no individual assessments yet."
            : 'Nothing has been posted for this course yet, or it shows "please see teacher" on TeachAssist.'
      }</div>`)
    );
    return frag;
  }
  evals.forEach((e, i) => {
    const sub = [e.weight != null ? `Weight: <span class="g-mono">${escapeHtml(String(e.weight))}</span>` : "", fmtDate(e.date)].filter(Boolean).join(" · ");
    const row = el(`
      <button type="button" class="g-row eval-row" aria-haspopup="dialog">
        ${strandBadge(e.category || e.name)}
        <span class="g-row-main">
          <b>${escapeHtml(e.name || e.category || "Assessment")}</b>
          ${sub ? `<small>${sub}</small>` : ""}
        </span>
        <span class="g-row-value">${pct(e.percent)}</span>
        <span class="g-chev">${GLYPHS.chevron}</span>
      </button>
    `);
    row.style.setProperty("--m-i", String(i));
    row.addEventListener("click", () => openEvaluation(e, evals));
    frag.appendChild(row);
  });
  return frag;
}

/** Bottom sheet for one evaluation: big mark, strand bars, impact. */
function openEvaluation(e, evals) {
  const others = evals.filter((x) => x !== e);
  const impact = others.length ? weightedMean(evals) - weightedMean(others) : null;
  const strands = Array.isArray(e.strands) && e.strands.length ? e.strands : [{ category: e.category || e.name, percent: e.percent, weight: e.weight }];
  const body = el(`
    <div class="eval-sheet">
      <div class="eval-sheet-head">
        ${subjectBadge("ENG", "g-badge-lg")}
        <h3>${escapeHtml(e.name || e.category || "Assessment")}</h3>
        <div class="g-hero-num private-mark">${pct(e.percent)}</div>
        <p class="g-caption">Overall${e.date ? ` · ${escapeHtml(fmtDate(e.date))}` : ""}</p>
      </div>
      <div class="eval-strands">
        ${strands
          .map(
            (s) => `<div class="eval-strand">
              <div class="eval-strand-top"><b>${escapeHtml(s.category || "Mark")}</b><span class="private-mark">${pct(s.percent)}</span></div>
              <div class="eval-strand-sub"><span>${s.weight != null ? `Weight: <span class="g-mono">${escapeHtml(String(s.weight))}</span>` : ""}</span></div>
              ${segBar(s.percent, strandColor(s.category))}
            </div>`,
          )
          .join("")}
      </div>
      ${e.feedback ? `<p class="eval-feedback">“${escapeHtml(e.feedback)}”</p>` : ""}
      ${
        impact != null && Math.abs(impact) >= 0.05 && !preferences().hideMarks
          ? `<p class="eval-impact ${impact >= 0 ? "up" : "down"}">${impact >= 0 ? GLYPHS.trendUp : GLYPHS.trendDown}This evaluation ${impact >= 0 ? "raised" : "lowered"} your average by about ${Math.abs(Math.round(impact * 10) / 10).toFixed(1)}%</p>`
          : ""
      }
    </div>`);
  openSheet(" ", body, { className: "sheet-eval" });
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

// ── Breakdown (weighted per-category segmented bars) ──
function buildBreakdown(evals) {
  const frag = document.createElement("div");
  frag.className = "g-list";
  if (!evals.length) {
    frag.appendChild(el(`<div class="card empty-inline" role="status"><b>No breakdown yet</b>The category breakdown appears once TeachAssist lists individual assessments for this course.</div>`));
    return frag;
  }
  if (evals.every((e) => !e.percent)) {
    frag.appendChild(el(`<p class="g-empty-note">Your teacher hasn't posted assignment marks yet, so percentages are 0%. The weightings below are from TeachAssist.</p>`));
  }
  const card = el(`<div class="g-panel eval-strands"></div>`);
  strandBreakdown(evals).forEach((s, i) => {
    const row = el(`
      <div class="eval-strand strand-row">
        <div class="eval-strand-top"><span class="eval-strand-name">${strandBadge(s.name)}<b>${escapeHtml(s.name)}</b></span><span class="strand-value private-mark">${pct(s.average)}</span></div>
        <div class="eval-strand-sub"><span>Weight: <span class="g-mono">${Math.round(s.weight * 10) / 10}</span></span><span class="g-mono">${s.count} ${s.count === 1 ? "entry" : "entries"}</span></div>
        ${segBar(s.average, `var(--strand-${s.key}-bar)`, 10)}
      </div>`);
    row.style.setProperty("--m-i", String(i));
    card.appendChild(row);
  });
  frag.appendChild(card);
  return frag;
}
