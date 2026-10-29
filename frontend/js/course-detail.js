// ============================================================================
// Course detail — swipeable gauge / progression / info pages + Evaluations and
// Breakdown tabs.
// ----------------------------------------------------------------------------
// Each evaluation row carries its Ontario achievement category as a round
// letter badge (K/U, T, C, A, F) with its weight and mark; tapping it opens a
// sheet with the strand bars and how much it moved the average. The Breakdown
// tab aggregates a weighted average per category as segmented bars.
// ============================================================================

import { achievementLevel, courseLabel, courseTitle, el, escapeHtml, fmtPercent, openSheet, trendChartEl } from "./courses.js";
import { GLYPHS, arcGauge, glassButton, pageHeader, pager, pct } from "./ui-kit.js";
import { fmtDay, fullCode, letterBadge, scheduleOf, shadeColors, subjectBadge, subjectStyle } from "./subjects.js";
import { courseMeta } from "./course-names.js";
import { teacherFor, editTeacher } from "./teachers.js";
import { preferences } from "./personalization.js";
import { displayMark, markKind } from "./ta-client.js";
import { animateGauge, countUp, marksHidden, motionEnabled, mountThumb, previousValue, rememberValue, replay } from "./motion.js";

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

// Strand letters and their theme shade: K/U, T, C, A take shades 1–4 of the
// theme; Final/Culminating (and anything else) takes the accent.
const STRAND_STYLE = {
  k: ["K/U", 1],
  t: ["T", 2],
  c: ["C", 3],
  a: ["A", 4],
  f: ["F", 0],
};
/** The strand's shade: 1–4, or 0 for the accent. Expectations like "C2" or
 *  "B3" use their number, so C1, C2 and C3 look different. */
function strandShade(category) {
  const key = strandKey(category);
  if (key) return STRAND_STYLE[key][1];
  const n = /^[a-z]\s?(\d+)$/i.exec(String(category || "").trim())?.[1];
  return n ? ((Number(n) - 1) % 4) + 1 : 0;
}
function strandBadge(category) {
  const key = strandKey(category);
  const text = key ? STRAND_STYLE[key][0] : String(category || "?").trim().charAt(0).toUpperCase() || "?";
  return letterBadge(escapeHtml(text), strandShade(category));
}
/** The strand's colour, used to tint its mark pill. */
const strandTint = (category) => shadeColors(strandShade(category)).tint;

/** "24 / 24" when TeachAssist gave raw marks, else "". */
// "18 / 20" — left out entirely while Hide grades is on.
const rawMark = (x) => (!marksHidden() && typeof x?.mark === "number" && typeof x?.outOf === "number" ? `${x.mark} / ${x.outOf}` : "");

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

  // ── Header: back · code ──
  const nav = el(
    pageHeader({
      title: fullCode(course) || courseLabel(course),
      subtitle: escapeHtml(courseTitle(course)),
      left: glassButton("back", "Back to courses", "data-back"),
    }),
  );
  nav.querySelector("[data-back]").addEventListener("click", () => window.AppNav.toCourses());
  container.appendChild(nav);

  // ── Pager: mark gauge · progression · course info ──
  const track = el(`<div class="g-pager" id="d-carousel"></div>`);
  const gaugePage = el(`
    <section class="g-page g-hero" aria-label="${kind === "midterm" ? "Midterm mark" : "Current mark"} ${mark == null ? "not available" : fmtPercent(mark)}">
      <div class="g-gauge-wrap">
        <span class="g-hero-badge" aria-hidden="true">${subjectBadge(course.code)}</span>
        ${arcGauge(mark, { id: "course" })}
        <div class="g-gauge-center">
          <div class="g-hero-num private-mark">${pct(mark)}</div>
          ${course.midterm != null && kind !== "midterm" ? `<div class="g-delta">Midterm ${pct(Number(course.midterm))}</div>` : ""}
        </div>
      </div>
      <p class="g-caption">${kind === "midterm" ? "Midterm Mark" : "Current Mark"}</p>
      ${mark != null && !marksHidden() ? `<p class="g-level private-mark">${achievementLevel(mark)}</p>` : ""}
    </section>`);
  track.appendChild(gaugePage);

  const labels = ["Mark"];
  if (evals.length) {
    // One dot per test: the course mark right after it (weighted like the
    // course), labelled with that test's own score.
    const rows = evals.map((e, i) => {
      const sofar = evals.slice(0, i + 1);
      const value = weightedMean(sofar) ?? sofar.reduce((a, x) => a + x.percent, 0) / sofar.length;
      return { date: i, value, label: e.name || e.category || "Assessment", detail: rawMark(e) ? `${rawMark(e)} (${fmtPercent(e.percent)})` : fmtPercent(e.percent) };
    });
    const page = el(`<section class="g-page g-hero" aria-label="Grade progression"></section>`);
    if (preferences().hideMarks) page.insertAdjacentHTML("beforeend", `<p class="g-empty-note">Hidden while “Hide grades” is on.</p>`);
    else page.append(trendChartEl(rows));
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
    const changed = content.childElementCount > 0 && content.dataset.seg !== s;
    content.dataset.seg = s;
    content.innerHTML = "";
    content.appendChild(s === "evals" ? buildEvals(evals, kind, course) : buildBreakdown(evals, course));
    // The new view slides in from the side it was pulled from.
    if (changed && motionEnabled()) {
      content.style.setProperty("--seg-dir", s === "evals" ? "-1" : "1");
      replay(content, "g-seg-enter");
    }
  };
  // Dragging the glass thumb pulls the list with it, so the switch to the
  // other view is felt before it's committed (js/glass.js initSegmentLens).
  seg.addEventListener("g-seg-drag", (e) => {
    const d = e.detail.progress - (activeSeg === "evals" ? 0 : 1);
    content.classList.add("g-seg-following");
    content.style.transform = `translateX(${(-d * 36).toFixed(1)}px)`;
    content.style.opacity = String(1 - Math.min(0.55, Math.abs(d) * 0.55));
  });
  seg.addEventListener("g-seg-drag-end", () => {
    content.classList.remove("g-seg-following");
    content.style.transform = "";
    content.style.opacity = "";
  });
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
function buildEvals(evals, kind, course) {
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
    const sub = [rawMark(e) ? `<span class="g-mono private-mark">${escapeHtml(rawMark(e))}</span>` : "", e.weight != null ? `Weight: <span class="g-mono">${escapeHtml(String(e.weight))}</span>` : "", fmtDate(e.date)].filter(Boolean).join(" · ");
    const row = el(`
      <button type="button" class="g-row eval-row" style="--tint:${strandTint(e.category || e.name)}" aria-haspopup="dialog">
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
    row.addEventListener("click", () => openEvaluation(e, evals, course));
    frag.appendChild(row);
  });
  return frag;
}

/** The strand's short label for its round badge: "K/U", "T"… or "C2". */
function strandLetter(category) {
  const key = strandKey(category);
  if (key) return STRAND_STYLE[key][0];
  const label = String(category || "").trim();
  return label.length <= 3 ? label.toUpperCase() || "?" : label.charAt(0).toUpperCase();
}

/**
 * One strand as a glass tile: round badge · name and weight / glowing bar ·
 * `right` (raw mark or entry count) / percent. Shared by the evaluation sheet
 * and the Breakdown tab; the bar stays empty while Hide grades is on.
 */
function strandTile(category, weight, right, percent, i = 0, rightIsMark = true) {
  const name = String(category || "Mark");
  const letter = strandLetter(name);
  const width = marksHidden() || typeof percent !== "number" ? 0 : Math.max(0, Math.min(100, percent));
  const c = shadeColors(strandShade(name));
  return `<div class="ev-strand" aria-label="${escapeHtml(name)}" style="--m-i:${i};--tint:${c.tint};--b-from:${c.from};--b-to:${c.to}">
    <span class="ev-letter${letter.length > 2 ? " ev-letter-sm" : ""}" aria-hidden="true">${escapeHtml(letter)}</span>
    <span class="ev-strand-label">${letter.toUpperCase() !== name.toUpperCase() ? `<b>${escapeHtml(name).replace(/\//g, "/<wbr>")}</b>` : ""}${weight != null ? `<span>Weight: ${escapeHtml(String(weight))}</span>` : ""}</span>
    <span class="ev-raw g-mono${rightIsMark ? " private-mark" : ""}">${right}</span>
    <span class="ev-bar" aria-hidden="true"><i style="width:${width}%"></i></span>
    <span class="ev-value private-mark">${pct(percent)}</span>
  </div>`;
}

/** Bottom sheet for one evaluation: big mark, strand bars, impact. */
function openEvaluation(e, evals, course) {
  const others = evals.filter((x) => x !== e);
  const impact = others.length ? weightedMean(evals) - weightedMean(others) : null;
  const strands = Array.isArray(e.strands) && e.strands.length ? e.strands : [{ category: e.category || e.name, percent: e.percent, weight: e.weight, mark: e.mark, outOf: e.outOf }];
  const s = subjectStyle(course?.code);
  const caption = ["Overall", rawMark(e), fmtDate(e.date)].filter(Boolean).map(escapeHtml).join(" · ");
  const body = el(`
    <div class="ev" style="--tint:${s.tint};--b-from:${s.from};--b-to:${s.to}">
      <div class="ev-head">
        <span class="ev-icon" aria-hidden="true">${s.icon}</span>
        <h3>${escapeHtml(e.name || e.category || "Assessment")}</h3>
        <div class="ev-mark private-mark">${pct(e.percent)}</div>
        <p class="ev-caption">${caption}</p>
      </div>
      <div class="ev-strands">
        ${strands.map((x) => strandTile(x.category, x.weight, escapeHtml(rawMark(x)), x.percent)).join("")}
      </div>
      ${e.feedback ? `<p class="ev-feedback">“${escapeHtml(e.feedback)}”</p>` : ""}
      ${
        impact != null && Math.abs(impact) >= 0.05 && !preferences().hideMarks
          ? `<div class="ev-impact ${impact >= 0 ? "up" : "down"}">
              <span class="ev-impact-icon" aria-hidden="true">${impact >= 0 ? GLYPHS.trendUp : GLYPHS.trendDown}</span>
              <p>This evaluation ${impact >= 0 ? "raised" : "lowered"} your average by about <b>${Math.abs(Math.round(impact * 10) / 10).toFixed(1)}%</b></p>
            </div>`
          : ""
      }
    </div>`);
  openSheet(" ", body, { className: "sheet-eval" });
}

/**
 * Weighted average per category, in TeachAssist strand order. Uses each
 * evaluation's strands when present (K/T/C/A marks, or expectations like "C2"
 * for Overall Expectation courses); labels that aren't K/T/C/A/F get their own
 * row after the standard strands.
 */
export function strandBreakdown(evals) {
  const order = ["k", "t", "c", "a", "f"];
  const names = {
    k: "Knowledge/Understanding",
    t: "Thinking",
    c: "Communication",
    a: "Application",
    f: "Final/Culminating",
  };
  const acc = new Map();
  for (const e of evals) {
    const parts = Array.isArray(e.strands) && e.strands.length ? e.strands : [e];
    for (const p of parts) {
      if (typeof p.percent !== "number") continue;
      const label = String(p.category || "").trim();
      const known = strandKey(label) || (label ? "" : "f");
      const key = known || `x:${label}`;
      const w = typeof p.weight === "number" && p.weight >= 0 ? p.weight : 1;
      if (!acc.has(key)) acc.set(key, { key, name: known ? names[known] : label, sum: 0, weight: 0, plain: 0, count: 0 });
      const a = acc.get(key);
      a.sum += p.percent * w;
      a.weight += w;
      a.plain += p.percent;
      a.count += 1;
    }
  }
  const rank = (k) => (order.includes(k) ? order.indexOf(k) : order.length);
  return [...acc.values()]
    .sort((x, y) => rank(x.key) - rank(y.key) || x.name.localeCompare(y.name, undefined, { numeric: true }))
    .map((a) => ({
      key: a.key,
      name: a.name,
      // Weight-0 (formative) entries only count when nothing else is weighted.
      average: a.weight > 0 ? a.sum / a.weight : a.plain / a.count,
      weight: a.weight,
      count: a.count,
    }));
}

// ── Breakdown (weighted per-category segmented bars) ──
function buildBreakdown(evals, course) {
  const frag = document.createElement("div");
  frag.className = "g-list";
  if (!evals.length) {
    frag.appendChild(el(`<div class="card empty-inline" role="status"><b>No breakdown yet</b>The category breakdown appears once TeachAssist lists individual assessments for this course.</div>`));
    return frag;
  }
  if (evals.every((e) => !e.percent)) {
    frag.appendChild(el(`<p class="g-empty-note">Your teacher hasn't posted assignment marks yet, so percentages are 0%. The weightings below are from TeachAssist.</p>`));
  }
  const s = subjectStyle(course?.code);
  const tiles = strandBreakdown(evals).map((x, i) =>
    strandTile(x.name, Math.round(x.weight * 10) / 10, `${x.count} ${x.count === 1 ? "entry" : "entries"}`, x.average, i, false),
  );
  frag.appendChild(el(`<div class="ev ev-breakdown" style="--tint:${s.tint};--b-from:${s.from};--b-to:${s.to}"><div class="ev-strands">${tiles.join("")}</div></div>`));
  return frag;
}
