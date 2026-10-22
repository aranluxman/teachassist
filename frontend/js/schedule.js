// ============================================================================
// Class Schedule — the sheet behind the header's schedule button.
// ----------------------------------------------------------------------------
// One tinted glass card per class, in period order: course code, name, class
// time and room, with the current mark in a pill. Two glass capsules sit at
// the bottom: Add to Calendar (each class as a Google Calendar event that
// repeats every school day) and Manage Courses (rename a course, fix its room
// or its start/end time). Times come from js/class-times.js.
// ============================================================================

import { closeSheet, courseLabel, courseSubtitle, courseTitle, el, escapeHtml, openSheet } from "./courses.js";
import { GLYPHS, glassButton, pct } from "./ui-kit.js";
import { fullCode, scheduleOf, subjectStyle } from "./subjects.js";
import { courseName } from "./course-names.js";
import { displayMark } from "./ta-client.js";
import { mySchool } from "./schools.js";
import { readStudentData, writeStudentData } from "./student-store.js";
import {
  DEFAULT_BELL_TIMES,
  classTime,
  courseOverride,
  fmtClock,
  googleCalendarUrl,
  classRange,
  periodTimes,
  saveCourseOverride,
  toInputTime,
} from "./class-times.js";

/** Every class with its period, room, time and display name, in day order. */
function scheduleRows(courses, bellTimes) {
  return courses
    .map((c) => {
      const info = scheduleOf(c);
      const code = fullCode(c);
      // Short name ("Science"), or the one picked in Manage Courses.
      const name = courseTitle(c);
      return { c, code, name, ...info, time: classTime(code, info.period, bellTimes) };
    })
    .sort((a, b) => (a.time?.start ?? 9999) - (b.time?.start ?? 9999) || a.code.localeCompare(b.code));
}

const timeText = (t) => (t ? `${fmtClock(t.start)} – ${fmtClock(t.end)}` : "");
// "94%" rather than "94.0%" in the small pill, like the iOS widgets.
const pill = (mark) => pct(mark).replace(/\.0(?=<small>)/, "");

/** The Class Schedule sheet. `onEdit` runs after Manage Courses changed something. */
export async function openSchedule(courses, { onEdit } = {}) {
  const school = await mySchool().catch(() => null);
  const bellTimes = school?.bellTimes || DEFAULT_BELL_TIMES;
  const rows = scheduleRows(courses, bellTimes);

  const body = el(`<div class="sched"><div class="sched-list" role="list"></div></div>`);
  const list = body.querySelector(".sched-list");
  rows.forEach(({ c, code, name, room, time }, i) => {
    const s = subjectStyle(c.code);
    const mark = displayMark(c);
    const card = el(`
      <button type="button" class="sched-card" role="listitem" style="--tint:${s.tint};--b-from:${s.from};--b-to:${s.to}">
        <span class="sched-icon" aria-hidden="true">${s.icon}</span>
        <span class="sched-main">
          <b>${escapeHtml(code)}</b>
          ${name ? `<small>${escapeHtml(name)}</small>` : ""}
          <span class="sched-meta">
            ${time ? `<em>${GLYPHS.clock}${escapeHtml(timeText(time))}</em>` : `<em class="sched-missing">${GLYPHS.clock}Add a time</em>`}
            ${room ? `<em>${GLYPHS.pin}Room ${escapeHtml(room)}</em>` : ""}
          </span>
        </span>
        ${mark != null ? `<span class="sched-mark private-mark">${pill(mark)}</span>` : ""}
        <span class="g-chev">${GLYPHS.chevron}</span>
      </button>`);
    card.style.setProperty("--m-i", String(i));
    card.addEventListener("click", () => {
      closeSheet();
      if (mark != null || (c.evaluations || []).length) window.AppNav.toDetail(c);
    });
    list.appendChild(card);
  });
  if (!rows.length) list.appendChild(el(`<p class="g-empty-note">No classes on your timetable yet.</p>`));

  if (rows.some((r) => r.time?.estimated)) {
    body.appendChild(
      el(`<p class="sched-note">${GLYPHS.clock}<span>Times are estimated from ${school ? `${escapeHtml(school.name)}’s` : "typical YRDSB"} bell times. Fix any of them in Manage Courses.</span></p>`),
    );
  }

  const actions = el(`
    <div class="sched-actions">
      <button type="button" class="sched-action" data-calendar>${GLYPHS.calendar}<span>Add to Calendar</span></button>
      <button type="button" class="sched-action" data-manage>${GLYPHS.sliders}<span>Manage Courses</span></button>
    </div>`);
  body.appendChild(actions);

  const { sheet } = openSheet("Class Schedule", body, {
    className: "sheet-tall sheet-glass sheet-sched",
    left: glassButton("close", "Close", "data-close"),
    right: glassButton("share", "Share schedule", "data-share"),
  });
  const back = () => openSchedule(courses, { onEdit });
  actions.querySelector("[data-calendar]").addEventListener("click", () => openAddToCalendar(rows, back));
  actions.querySelector("[data-manage]").addEventListener("click", () => openManageCourses(courses, bellTimes, back, onEdit));

  sheet.querySelector("[data-share]").addEventListener("click", async (e) => {
    const text = rows.map(({ code, name, room, time }) => [timeText(time), code, name, room && `Room ${room}`].filter(Boolean).join(" · ")).join("\n");
    const shareText = `My class schedule\n${text}`;
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

/** Add to Calendar: one Google Calendar event per class, repeating Mon–Fri. */
function openAddToCalendar(rows, back) {
  const added = new Set(readStudentData("calendar-added", []));
  const body = el(`<div class="sched"><div class="sched-list" role="list"></div></div>`);
  const list = body.querySelector(".sched-list");
  rows.forEach(({ c, code, name, room, term, period, time }, i) => {
    const s = subjectStyle(c.code);
    const url = time
      ? googleCalendarUrl({
          title: `${name || courseTitle(c)} (${code})`,
          room: room ? `Room ${room}` : "",
          details: [period && `Period ${period.replace(/\D/g, "")}`, "Added from TeachAssist Dashboard"].filter(Boolean).join(" · "),
          start: time.start,
          end: time.end,
          term,
        })
      : "";
    const row = el(`
      <div class="sched-card sched-cal" role="listitem" style="--tint:${s.tint};--b-from:${s.from};--b-to:${s.to}">
        <span class="sched-icon" aria-hidden="true">${s.icon}</span>
        <span class="sched-main">
          <b>${escapeHtml(code)}</b>
          <span class="sched-meta"><em>${GLYPHS.clock}${time ? escapeHtml(timeText(time)) : "No time set"}</em></span>
        </span>
        ${
          url
            ? `<a class="sched-add" href="${escapeHtml(url)}" target="_blank" rel="noopener" aria-label="Add ${escapeHtml(code)} to Google Calendar">${added.has(code) ? `${GLYPHS.check}Added` : "Add"}</a>`
            : `<button type="button" class="sched-add" data-fix>Set time</button>`
        }
      </div>`);
    row.style.setProperty("--m-i", String(i));
    row.querySelector("a.sched-add")?.addEventListener("click", (e) => {
      added.add(code);
      writeStudentData("calendar-added", [...added]);
      e.currentTarget.innerHTML = `${GLYPHS.check}Added`;
      e.currentTarget.classList.add("is-added");
    });
    row.querySelector("[data-fix]")?.addEventListener("click", () => back());
    if (added.has(code)) row.querySelector(".sched-add")?.classList.add("is-added");
    list.appendChild(row);
  });
  const until = classRange(rows.find((r) => r.term)?.term || null).last;
  body.insertBefore(
    el(`<p class="sched-note sched-note-top">${GLYPHS.calendar}<span>Opens Google Calendar with the class repeating every school day until ${escapeHtml(until.toLocaleDateString(undefined, { month: "long", day: "numeric" }))}. Tap Save there, then come back for the next one.</span></p>`),
    list,
  );
  openSheet("Add to Calendar", body, {
    className: "sheet-tall sheet-glass sheet-sched",
    left: glassButton("back", "Back to schedule", "data-back"),
  }).sheet.querySelector("[data-back]").addEventListener("click", back);
}

/** Manage Courses: rename a course, fix its room, start and end time. */
function openManageCourses(courses, bellTimes, back, onEdit) {
  let changed = false;
  const body = el(`<div class="sched manage-list"></div>`);
  scheduleRows(courses, bellTimes).forEach(({ c, code, period }, i) => {
    const s = subjectStyle(c.code);
    const o = courseOverride(code);
    const n = parseInt(String(period || "").replace(/\D/g, ""), 10);
    const est = n >= 1 && n <= 4 ? periodTimes(bellTimes)[n - 1] : null;
    const defaults = {
      name: courseName(courseLabel(c)) || courseSubtitle(c).split(",")[0] || "",
      room: String(c.room || "").replace(/^(rm\.?|room)\s*/i, "") || "",
    };
    const id = `mc-${i}`;
    const card = el(`
      <section class="manage-card" style="--tint:${s.tint};--b-from:${s.from};--b-to:${s.to}" aria-labelledby="${id}">
        <header>
          <span class="sched-icon" aria-hidden="true">${s.icon}</span>
          <b id="${id}">${escapeHtml(code)}</b>
          ${period ? `<span class="manage-period">${escapeHtml(period)}</span>` : ""}
          <button type="button" class="manage-reset" ${Object.keys(o).length ? "" : "hidden"}>Reset</button>
        </header>
        <label class="manage-field manage-wide"><span>Name</span><input data-k="name" type="text" maxlength="60" autocomplete="off" placeholder="${escapeHtml(defaults.name || "Course name")}" value="${escapeHtml(o.name || "")}"></label>
        <label class="manage-field manage-wide"><span>Room</span><input data-k="room" type="text" maxlength="20" autocomplete="off" placeholder="${escapeHtml(defaults.room || "e.g. 302")}" value="${escapeHtml(o.room || "")}"></label>
        <label class="manage-field"><span>Starts</span><input data-k="start" type="time" step="300" value="${escapeHtml(o.start || (est ? toInputTime(est.start) : ""))}"></label>
        <label class="manage-field"><span>Ends</span><input data-k="end" type="time" step="300" value="${escapeHtml(o.end || (est ? toInputTime(est.end) : ""))}"></label>
      </section>`);
    card.style.setProperty("--m-i", String(i));
    const reset = card.querySelector(".manage-reset");
    card.querySelectorAll("input").forEach((input) =>
      input.addEventListener("input", () => {
        saveCourseOverride(code, { [input.dataset.k]: input.value.trim() });
        changed = true;
        reset.hidden = !Object.keys(courseOverride(code)).length;
      }),
    );
    reset.addEventListener("click", () => {
      saveCourseOverride(code, { name: "", room: "", start: "", end: "" });
      changed = true;
      card.querySelectorAll("input[type=text]").forEach((x) => (x.value = ""));
      card.querySelector("[data-k=start]").value = est ? toInputTime(est.start) : "";
      card.querySelector("[data-k=end]").value = est ? toInputTime(est.end) : "";
      reset.hidden = true;
    });
    body.appendChild(card);
  });
  body.appendChild(el(`<p class="sched-note">${GLYPHS.lock}<span>Changes stay on this device. Your marks and TeachAssist itself are never edited.</span></p>`));
  openSheet("Manage Courses", body, {
    className: "sheet-tall sheet-glass sheet-sched",
    left: glassButton("back", "Back to schedule", "data-back"),
    onClose: () => changed && onEdit?.(),
  }).sheet.querySelector("[data-back]").addEventListener("click", back);
}
