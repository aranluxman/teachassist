// ============================================================================
// Calendar & Test Planner (Guidance → Calendar, #guidance/calendar).
// Month and week views, upcoming list, tests list, quick add, and reminder
// settings. Data lives in calendar-store.js; reminders go out from
// notifications.js (in-app, plus phone notifications when allowed).
// ============================================================================

import { el, escapeHtml, openSheet, closeSheet, courseTitle } from "./courses.js";
import { GLYPHS } from "./ui-kit.js";
import { getCourses } from "./ta-client.js";
import { splitByTerm } from "./term.js";
import { preferences } from "./personalization.js";
import {
  EVENT_TYPES, REMINDER_LEADS, typeOf, listEvents, getEvent, saveEvent, deleteEvent,
  isoDay, parseDay, daysUntil, whenText, calendarSettings, saveCalendarSettings, syncCalendar,
} from "./calendar-store.js";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const I = {
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  prev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 5-7 7 7 7"/></svg>',
  test: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M10 13h6M10 17h4"/></svg>',
  quiz: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.6v.4M12 17h.01"/></svg>',
  assignment: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 4h6v3H9z"/><path d="M15 5.5h2.5A1.5 1.5 0 0 1 19 7v12.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 19.5V7a1.5 1.5 0 0 1 1.5-1.5H9"/><path d="m9 14 2 2 4-4"/></svg>',
  project: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6.5C3 5.7 3.7 5 4.5 5H10c.8 0 1.5.4 2 1v14c-.5-.6-1.2-1-2-1H4.5c-.8 0-1.5-.7-1.5-1.5zM21 6.5c0-.8-.7-1.5-1.5-1.5H14c-.8 0-1.5.4-2 1v14c.5-.6 1.2-1 2-1h5.5c.8 0 1.5-.7 1.5-1.5z"/></svg>',
  event: GLYPHS.calendar,
  noschool: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/></svg>',
  list: GLYPHS.list,
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="m8 12.5 2.8 2.8L16.5 9.5"/></svg>',
  bell: GLYPHS.bell,
  bolt: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M13 2.5 4.5 13.5H11l-1 8 8.5-11H12z"/></svg>',
  gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
  phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18h2"/></svg>',
  mail: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="m3.5 6.5 8.5 6.5 8.5-6.5"/></svg>',
};

const color = (t) => EVENT_TYPES[typeOf(t)].color;
const shortDate = (day, opts = { weekday: "short", month: "short", day: "numeric" }) => parseDay(day)?.toLocaleDateString(undefined, opts) || day;
const timeText = (t) => {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  return new Date(2000, 0, 1, h, m).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
};

let courseCache = null;
async function courseOptions() {
  if (courseCache) return courseCache;
  try {
    let courses = await getCourses();
    if (preferences().currentTermOnly) courses = splitByTerm(courses).current;
    courseCache = courses.map((c) => ({ code: c.code, title: courseTitle(c) }));
  } catch { courseCache = []; }
  return courseCache;
}

/** Render the planner into the Guidance screen. */
export async function renderCalendar(container) {
  container.innerHTML = "";
  const nav = el(`<div class="detail-nav"><button class="back-btn">Guidance</button><div class="detail-titlewrap"><div class="detail-title">Calendar</div><div class="detail-subtitle">Tests, assignments and due dates</div></div><div></div></div>`);
  nav.querySelector(".back-btn").onclick = () => window.AppNav.toGuidance();
  container.append(nav);

  const today = isoDay(new Date());
  const ui = { tab: "calendar", mode: "month", cursor: parseDay(today) };

  const app = el(`<div class="cal-app">
    <header class="cal-head">
      <span class="cal-head-icon" aria-hidden="true">${GLYPHS.calendar}</span>
      <div class="cal-head-text">
        <h1>Calendar &amp; Test Planner</h1>
        <p>Keep track of your tests, assignments and key school dates.</p>
      </div>
      <button type="button" class="cal-btn cal-btn-primary" data-add>${I.plus}<span>Add Event</span></button>
    </header>
    <div class="cal-tabs" role="tablist" aria-label="Planner view">
      <button type="button" role="tab" data-tab="calendar">${GLYPHS.calendar}<span>Calendar</span></button>
      <button type="button" role="tab" data-tab="upcoming">${I.list}<span>Upcoming</span></button>
      <button type="button" role="tab" data-tab="tests">${I.check}<span>My Tests</span></button>
    </div>
    <div class="cal-layout">
      <section class="cal-main card" aria-live="polite"></section>
      <aside class="cal-side">
        <section class="card cal-card cal-upcoming" aria-labelledby="cal-up-h">
          <div class="cal-card-head"><h2 id="cal-up-h">Upcoming Tests &amp; Events</h2><button type="button" class="cal-link" data-view-all>View all ${GLYPHS.chevron}</button></div>
          <ul class="cal-up-list" role="list"></ul>
        </section>
        <section class="card cal-card cal-remind" aria-labelledby="cal-rem-h">
          <div class="cal-card-head"><span class="cal-card-icon">${I.bell}</span><h2 id="cal-rem-h">Reminders &amp; Alerts</h2></div>
          <label class="cal-remind-row"><span class="cal-remind-check" aria-hidden="true">${GLYPHS.check}</span><span>Get reminders for upcoming tests and important dates.</span><input type="checkbox" role="switch" class="cal-switch" data-reminders></label>
        </section>
      </aside>
      <section class="card cal-card cal-quick" aria-labelledby="cal-q-h">
        <div class="cal-card-head"><span class="cal-card-icon">${I.bolt}</span><h2 id="cal-q-h">Quick Actions</h2></div>
        <div class="cal-quick-grid">
          ${["test", "assignment", "project", "event"].map((t) => `<button type="button" class="cal-quick-btn" data-quick="${t}" style="--c:${color(t)}">${I[t]}<span>${I.plus}Add ${EVENT_TYPES[t].label}</span></button>`).join("")}
        </div>
      </section>
      <section class="card cal-card cal-notify" aria-labelledby="cal-n-h">
        <div class="cal-card-head"><span class="cal-card-icon">${I.gear}</span><h2 id="cal-n-h">Notification Settings</h2></div>
        <p class="cal-notify-lead">Remind me before a test or due date:</p>
        <div class="cal-notify-grid">
          <div class="cal-checks">
            ${REMINDER_LEADS.map((l) => `<label class="cal-check"><input type="checkbox" data-lead="${l}"><span>${l === 7 ? "1 week" : l === 1 ? "1 day" : `${l} days`} before</span></label>`).join("")}
          </div>
          <div class="cal-checks">
            <label class="cal-check"><input type="checkbox" data-push><span class="cal-check-icon">${I.phone}</span><span>Phone notifications<small>(in-app / mobile)</small></span></label>
            <label class="cal-check is-soon"><input type="checkbox" disabled><span class="cal-check-icon">${I.mail}</span><span>Email reminders<small>Coming soon</small></span></label>
          </div>
        </div>
        <p class="cal-push-note small muted" hidden></p>
      </section>
    </div>
  </div>`);
  container.append(app);

  const main = app.querySelector(".cal-main");

  // ── Drawing ──────────────────────────────────────────────────────────────
  const draw = () => {
    app.querySelectorAll("[data-tab]").forEach((b) => {
      const on = b.dataset.tab === ui.tab;
      b.classList.toggle("is-active", on);
      b.setAttribute("aria-selected", String(on));
    });
    if (ui.tab === "calendar") drawCalendar();
    else drawList(ui.tab);
    drawUpcoming();
    drawSettings();
  };

  const chip = (e, { compact = false } = {}) => {
    const b = el(`<button type="button" class="cal-chip${e.done ? " is-done" : ""}" style="--c:${color(e.type)}"><span class="cal-chip-icon" aria-hidden="true">${I[typeOf(e.type)]}</span><span class="cal-chip-text"></span></button>`);
    b.querySelector(".cal-chip-text").textContent = compact ? e.title : `${e.time ? `${timeText(e.time)} · ` : ""}${e.title}`;
    b.setAttribute("aria-label", `${EVENT_TYPES[typeOf(e.type)].label}: ${e.title}, ${shortDate(e.date)}${e.done ? ", done" : ""}`);
    b.onclick = (ev) => { ev.stopPropagation(); openEventSheet({ id: e.id }); };
    return b;
  };

  const drawCalendar = () => {
    const c = ui.cursor;
    const week = ui.mode === "week";
    let start, end, title;
    if (week) {
      start = new Date(c.getFullYear(), c.getMonth(), c.getDate() - c.getDay());
      end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
      title = `${start.toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${end.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;
    } else {
      const first = new Date(c.getFullYear(), c.getMonth(), 1);
      start = new Date(first.getFullYear(), first.getMonth(), 1 - first.getDay());
      const last = new Date(c.getFullYear(), c.getMonth() + 1, 0);
      end = new Date(last.getFullYear(), last.getMonth(), last.getDate() + (6 - last.getDay()));
      title = `${MONTHS[c.getMonth()]} ${c.getFullYear()}`;
    }
    const byDay = new Map();
    for (const e of listEvents({ from: isoDay(start), to: isoDay(end) })) {
      if (!byDay.has(e.date)) byDay.set(e.date, []);
      byDay.get(e.date).push(e);
    }
    main.replaceChildren(el(`<div class="cal-bar">
      <div class="cal-nav">
        <button type="button" class="cal-round" data-step="-1" aria-label="Previous ${week ? "week" : "month"}">${I.prev}</button>
        <h2 class="cal-title"></h2>
        <button type="button" class="cal-round cal-next" data-step="1" aria-label="Next ${week ? "week" : "month"}">${I.prev}</button>
        <button type="button" class="cal-today" data-today>Today</button>
      </div>
      <div class="cal-seg" role="group" aria-label="Calendar range">
        <button type="button" data-mode="month" aria-pressed="${!week}">${GLYPHS.calendar}<span>Month</span></button>
        <button type="button" data-mode="week" aria-pressed="${week}">${I.list}<span>Week</span></button>
      </div>
    </div>`));
    main.querySelector(".cal-title").textContent = title;
    main.querySelectorAll("[data-step]").forEach((b) => {
      b.onclick = () => {
        const n = +b.dataset.step;
        ui.cursor = week ? new Date(c.getFullYear(), c.getMonth(), c.getDate() + 7 * n) : new Date(c.getFullYear(), c.getMonth() + n, 1);
        drawCalendar();
      };
    });
    main.querySelector("[data-today]").onclick = () => { ui.cursor = parseDay(today); drawCalendar(); };
    main.querySelectorAll("[data-mode]").forEach((b) => (b.onclick = () => { ui.mode = b.dataset.mode; drawCalendar(); }));

    const grid = el(`<div class="cal-grid${week ? " is-week" : ""}" role="grid" aria-label="${escapeHtml(title)}">
      <div class="cal-row cal-dow" role="row">${DAYS.map((d) => `<span role="columnheader">${d}</span>`).join("")}</div>
    </div>`);
    let row = null;
    for (let d = new Date(start); d <= end; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) {
      if (d.getDay() === 0) { row = el(`<div class="cal-row" role="row"></div>`); grid.append(row); }
      const day = isoDay(d);
      const events = byDay.get(day) || [];
      const outside = !week && d.getMonth() !== c.getMonth();
      const cell = el(`<div class="cal-cell${day === today ? " is-today" : ""}${outside ? " is-outside" : ""}" role="gridcell" tabindex="0">
        <span class="cal-num">${d.getDate()}</span><div class="cal-chips"></div><div class="cal-dots" aria-hidden="true"></div>
      </div>`);
      cell.setAttribute("aria-label", `${d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}${events.length ? `, ${events.length} item${events.length === 1 ? "" : "s"}` : ""}`);
      const max = week ? 20 : 2;
      events.slice(0, max).forEach((e) => cell.querySelector(".cal-chips").append(chip(e, { compact: !week })));
      if (events.length > max) cell.querySelector(".cal-chips").append(el(`<span class="cal-more">+${events.length - max} more</span>`));
      // Phones: coloured dots instead of labels.
      cell.querySelector(".cal-dots").innerHTML = events.slice(0, 4).map((e) => `<i style="background:${color(e.type)}"></i>`).join("");
      const open = () => openDaySheet(day);
      cell.addEventListener("click", open);
      cell.addEventListener("keydown", (ev) => { if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); open(); } });
      row.append(cell);
    }
    main.append(grid);
    const legend = el(`<div class="cal-legend">${Object.entries(EVENT_TYPES).map(([, v]) => `<span><i style="background:${v.color}"></i>${escapeHtml(v.label)}</span>`).join("")}</div>`);
    main.append(legend);
  };

  const listRow = (e) => {
    const n = daysUntil(e.date);
    const d = parseDay(e.date);
    const li = el(`<li class="cal-item${e.done ? " is-done" : ""}" style="--c:${color(e.type)}">
      <button type="button" class="cal-item-main">
        <span class="cal-date"><small>${d.toLocaleDateString(undefined, { month: "short" })}</small><b>${d.getDate()}</b></span>
        <span class="cal-item-text">
          <b></b>
          <small><span class="cal-item-when"></span><span class="cal-in ${n === 0 ? "is-today" : n < 0 ? "is-past" : ""}"></span></small>
        </span>
        ${GLYPHS.chevron}
      </button>
    </li>`);
    li.querySelector(".cal-item-text b").textContent = e.title;
    const bits = [shortDate(e.date)];
    if (e.time) bits.push(timeText(e.time));
    if (e.course) bits.push(courseTitle({ code: e.course }));
    li.querySelector(".cal-item-when").textContent = bits.join(" · ");
    li.querySelector(".cal-in").textContent = e.done ? "Done" : whenText(n);
    li.querySelector(".cal-item-main").onclick = () => openEventSheet({ id: e.id });
    return li;
  };

  const drawUpcoming = () => {
    const ul = app.querySelector(".cal-up-list");
    const items = listEvents({ from: today }).filter((e) => !e.done).slice(0, 4);
    ul.replaceChildren(...items.map(listRow));
    if (!items.length) ul.append(el(`<li class="cal-empty">Nothing coming up. Add a test or due date to get reminders.</li>`));
  };

  const drawList = (tab) => {
    const tests = tab === "tests";
    const types = tests ? ["test", "quiz"] : null;
    const upcoming = listEvents({ from: today, types });
    const past = tests ? listEvents({ to: isoDay(new Date(Date.now() - 86400000)), types }).reverse() : [];
    main.replaceChildren(el(`<div class="cal-bar"><h2 class="cal-title">${tests ? "My Tests" : "Upcoming"}</h2>
      <button type="button" class="cal-btn" data-add-here>${I.plus}<span>Add ${tests ? "Test" : "Event"}</span></button></div>`));
    main.querySelector("[data-add-here]").onclick = () => openEventSheet({ type: tests ? "test" : "event" });
    const section = (label, items, emptyText) => {
      main.append(el(`<h3 class="cal-section">${escapeHtml(label)}</h3>`));
      const ul = el(`<ul class="cal-list" role="list"></ul>`);
      items.forEach((e) => ul.append(listRow(e)));
      if (!items.length) ul.append(el(`<li class="cal-empty">${escapeHtml(emptyText)}</li>`));
      main.append(ul);
    };
    // Group upcoming by how soon.
    const groups = [["This week", (n) => n <= 7], ["Next few weeks", (n) => n > 7 && n <= 28], ["Later", (n) => n > 28]];
    if (!upcoming.length) section("Coming up", [], tests ? "No tests or quizzes coming up." : "Nothing coming up.");
    for (const [label, fits] of groups) {
      const items = upcoming.filter((e) => fits(daysUntil(e.date)));
      if (items.length) section(label, items, "");
    }
    if (tests) section("Past tests", past.slice(0, 20), "No past tests yet.");
  };

  const drawSettings = () => {
    const s = calendarSettings();
    app.querySelector("[data-reminders]").checked = s.reminders;
    app.querySelectorAll("[data-lead]").forEach((b) => { b.checked = !!s.leads[b.dataset.lead]; b.disabled = !s.reminders; });
    const push = app.querySelector("[data-push]");
    push.checked = s.push && pushAllowed();
    push.disabled = !s.reminders;
    const note = app.querySelector(".cal-push-note");
    const denied = "Notification" in window && Notification.permission === "denied";
    note.hidden = !(s.push && denied);
    note.textContent = "Phone notifications are blocked for this site. Turn them on in your browser settings; reminders still show in the app.";
  };

  // ── Sheets ───────────────────────────────────────────────────────────────
  const openDaySheet = (day) => {
    const events = listEvents({ from: day, to: day });
    if (!events.length) return openEventSheet({ date: day });
    const body = el(`<div class="cal-sheet"><ul class="cal-list" role="list"></ul><button type="button" class="btn" data-add-day>${I.plus} Add on this day</button></div>`);
    events.forEach((e) => body.querySelector("ul").append(listRow(e)));
    body.querySelector("[data-add-day]").onclick = () => openEventSheet({ date: day });
    openSheet(shortDate(day, { weekday: "long", month: "long", day: "numeric" }), body, { subtitle: `${events.length} item${events.length === 1 ? "" : "s"}` });
  };

  const openEventSheet = async ({ id = null, type = "test", date = null } = {}) => {
    const existing = id ? getEvent(id) : null;
    const e = existing || { type, date: date || (ui.tab === "calendar" && ui.cursor && isoDay(ui.cursor) > today ? isoDay(ui.cursor) : today), title: "", time: "", course: "", notes: "", done: false };
    const courses = await courseOptions();
    const form = el(`<form class="cal-form" novalidate>
      <fieldset class="cal-types"><legend>Type</legend>
        ${Object.entries(EVENT_TYPES).map(([k, v]) => `<label class="cal-type" style="--c:${v.color}"><input type="radio" name="type" value="${k}" ${typeOf(e.type) === k ? "checked" : ""}><span>${I[k]}${escapeHtml(v.label)}</span></label>`).join("")}
      </fieldset>
      <div class="field"><label for="cal-title">Title</label><input id="cal-title" name="title" required maxlength="120" placeholder="Biology Test — Unit 3" autocomplete="off"></div>
      <div class="cal-form-row">
        <div class="field"><label for="cal-date">Date</label><input id="cal-date" name="date" type="date" required></div>
        <div class="field"><label for="cal-time">Time <small class="muted">(optional)</small></label><input id="cal-time" name="time" type="time"></div>
      </div>
      <div class="field"><label for="cal-course">Course <small class="muted">(optional)</small></label><select id="cal-course" name="course"><option value="">No course</option>${courses.map((c) => `<option value="${escapeHtml(c.code)}">${escapeHtml(c.title)}</option>`).join("")}</select></div>
      <div class="field"><label for="cal-notes">Notes <small class="muted">(optional)</small></label><textarea id="cal-notes" name="notes" rows="3" maxlength="1000" placeholder="Chapters 4–6, bring a calculator"></textarea></div>
      ${existing ? `<label class="cal-check cal-done"><input type="checkbox" name="done"><span>Done</span></label>` : ""}
      <p class="cal-error" role="alert" hidden></p>
      <div class="cal-form-actions">
        ${existing ? `<button type="button" class="btn ghost cal-delete" data-delete>Delete</button>` : ""}
        <button type="submit" class="btn">${existing ? "Save" : "Add to calendar"}</button>
      </div>
    </form>`);
    const f = form.elements;
    f.title.value = e.title;
    f.date.value = e.date;
    f.time.value = e.time || "";
    f.course.value = courses.some((c) => c.code === e.course) ? e.course : "";
    if (e.course && !f.course.value) {
      // A course no longer listed (last term) still shows as linked.
      f.course.append(new Option(courseTitle({ code: e.course }), e.course, true, true));
    }
    f.notes.value = e.notes || "";
    if (existing) f.done.checked = !!e.done;
    form.addEventListener("submit", (ev) => {
      ev.preventDefault();
      const err = form.querySelector(".cal-error");
      const saved = saveEvent({
        id: existing?.id, title: f.title.value, type: f.type.value, date: f.date.value, time: f.time.value,
        course: f.course.value, notes: f.notes.value, done: existing ? f.done.checked : false,
      });
      if (!saved) {
        err.hidden = false;
        err.textContent = !f.title.value.trim() ? "Give it a title." : "Pick a date.";
        (!f.title.value.trim() ? f.title : f.date).focus();
        return;
      }
      closeSheet();
      const d = parseDay(saved.date);
      if (ui.tab === "calendar") ui.cursor = d;
      draw();
    });
    form.querySelector("[data-delete]")?.addEventListener("click", () => {
      if (!confirm(`Delete "${existing.title}"?`)) return;
      deleteEvent(existing.id);
      closeSheet();
      draw();
    });
    openSheet(existing ? "Edit" : `Add ${EVENT_TYPES[typeOf(e.type)].label.toLowerCase()}`, form);
    if (!existing) setTimeout(() => f.title.focus(), 280);
  };

  // ── Wiring ───────────────────────────────────────────────────────────────
  app.querySelector("[data-add]").onclick = () => openEventSheet({ type: "test" });
  app.querySelectorAll("[data-tab]").forEach((b) => (b.onclick = () => { ui.tab = b.dataset.tab; draw(); }));
  app.querySelector("[data-view-all]").onclick = () => { ui.tab = "upcoming"; draw(); main.scrollIntoView({ behavior: "smooth", block: "start" }); };
  app.querySelectorAll("[data-quick]").forEach((b) => (b.onclick = () => openEventSheet({ type: b.dataset.quick })));
  app.querySelector("[data-reminders]").onchange = (ev) => { saveCalendarSettings({ reminders: ev.target.checked }); drawSettings(); };
  app.querySelectorAll("[data-lead]").forEach((b) => (b.onchange = () => saveCalendarSettings({ leads: { ...calendarSettings().leads, [b.dataset.lead]: b.checked } })));
  app.querySelector("[data-push]").onchange = async (ev) => {
    const want = ev.target.checked;
    if (want && "Notification" in window && Notification.permission === "default") {
      try { await Notification.requestPermission(); } catch { /* older browsers */ }
    }
    saveCalendarSettings({ push: want });
    drawSettings();
  };

  // Redraw when another tab (or the cloud) changes events.
  const onChange = () => { if (container.isConnected && app.isConnected) draw(); };
  window.addEventListener("ta:calendar", onChange);
  const stop = new MutationObserver(() => {
    if (!app.isConnected) { window.removeEventListener("ta:calendar", onChange); stop.disconnect(); }
  });
  stop.observe(container, { childList: true });

  draw();
  void syncCalendar();
}

/** True when phone notifications can actually be shown. */
function pushAllowed() {
  return !("Notification" in window) || Notification.permission !== "denied";
}
