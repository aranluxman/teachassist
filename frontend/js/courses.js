// ============================================================================
// Courses — main screen + add/edit course
// ----------------------------------------------------------------------------
// This module doubles as the shared "hub": it exports the small UI helpers
// (sheets, formatting), the data-access + grade calculation functions, and the
// profile (term dates) helpers that the other view modules import. Keeping
// these here avoids a circular dependency between the view files.
// ============================================================================

import { sb } from "./supabase.js";
import { getCurrentUser } from "./auth.js";
import { COURSE_COLORS, DEFAULT_CATEGORIES } from "./config.js";

// ───────────────────────────── UI helpers ──────────────────────────────────

/** Build a DOM element from an HTML string. */
export function el(html) {
  const t = document.createElement("template");
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

/** Escape user text before putting it in innerHTML. */
export function escapeHtml(s) {
  return String(s ?? "").replace(
    /[&<>"']/g,
    (m) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m])
  );
}

/** Format an ISO date (YYYY-MM-DD) like "Jan 29, 2026"; null if invalid. */
export function fmtDate(iso) {
  if (!iso) return null;
  const d = new Date(iso + "T00:00:00");
  if (isNaN(d)) return null;
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** Round to one decimal and add "%". Shows "—" when there is no value. */
export function fmtPercent(v) {
  if (v == null || isNaN(v)) return "—";
  return (Math.round(v * 10) / 10).toFixed(1) + "%";
}

let activeSheet = null;
let activeSheetCleanup = null;

function calendarIcon() {
  return `<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <rect x="3" y="5" width="18" height="16" rx="3"></rect>
    <path d="M8 3v4M16 3v4M3 10h18"></path>
  </svg>`;
}

function emptyBookIcon() {
  return `<svg class="empty-state-book" viewBox="0 0 48 48" fill="none" aria-hidden="true">
    <path d="M10 11.5C10 8.5 12.5 6 15.5 6H38v31H15.5C12.5 37 10 39.5 10 42.5v-31Z" fill="currentColor" opacity=".16"/>
    <path d="M10 11.5C10 8.5 12.5 6 15.5 6H38v31H15.5C12.5 37 10 39.5 10 42.5v-31Z" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/>
    <path d="M16 14h14M16 21h16M16 28h10" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
  </svg>`;
}

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
    h.id = "sheet-title";
    const close = document.createElement("button");
    close.type = "button";
    close.className = "sheet-close";
    close.setAttribute("aria-label", "Close dialog");
    close.textContent = "×";
    close.addEventListener("click", closeSheet);
    header.append(h, close);
    sheet.setAttribute("aria-labelledby", "sheet-title");
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
  sheet.querySelector("input, select, textarea, button")?.focus({ preventScroll: true });
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

// ───────────────────────── Data access (Supabase) ──────────────────────────

/** Load every course, category and evaluation for the user in three queries. */
export async function loadAll(userId) {
  const [courses, categories, evaluations] = await Promise.all([
    sb.from("courses").select("*").eq("user_id", userId).order("created_at", { ascending: true }),
    sb.from("categories").select("*").eq("user_id", userId),
    sb.from("evaluations").select("*").eq("user_id", userId),
  ]);
  return {
    courses: courses.data || [],
    categories: categories.data || [],
    evaluations: evaluations.data || [],
  };
}

/** Load (creating if needed) the user's profile row that holds term dates. */
export async function getProfile(userId) {
  const { data } = await sb.from("profiles").select("*").eq("id", userId).maybeSingle();
  if (data) return data;
  const { data: created } = await sb
    .from("profiles")
    .upsert({ id: userId })
    .select()
    .maybeSingle();
  return created || { id: userId, term_start: null, term_end: null };
}

/** Update the term dates on the user's profile. */
export async function saveProfile(userId, fields) {
  const { data, error } = await sb
    .from("profiles")
    .upsert({ id: userId, ...fields })
    .select()
    .maybeSingle();
  if (error) throw error;
  return data;
}

// ──────────────────────── Grade calculations (pure) ─────────────────────────
// See README for the exact rules. All functions take plain arrays so they can
// be unit-reasoned about and reused by the course-detail view.

/** Evaluation percentage = earned / total * 100 (null if total is 0/blank). */
export function evalPercent(ev) {
  const total = Number(ev.score_total);
  if (!total) return null;
  return (Number(ev.score_earned) / total) * 100;
}

/** Category average = simple mean of its evaluations' percentages (null if none). */
export function categoryAverage(categoryId, evaluations) {
  const ps = evaluations
    .filter((e) => e.category_id === categoryId)
    .map(evalPercent)
    .filter((p) => p != null);
  if (!ps.length) return null;
  return ps.reduce((a, b) => a + b, 0) / ps.length;
}

/**
 * Course current mark = Σ(categoryAvg × weight) / Σ(weights of categories that
 * have at least one evaluation). Categories with no evaluations are excluded.
 * Returns null when nothing can be calculated yet.
 */
export function courseMark(categories, evaluations) {
  let weighted = 0;
  let totalWeight = 0;
  for (const c of categories) {
    const avg = categoryAverage(c.id, evaluations);
    if (avg == null) continue;
    const w = Number(c.weight) || 0;
    weighted += avg * w;
    totalWeight += w;
  }
  if (totalWeight === 0) return null;
  return weighted / totalWeight;
}

/**
 * "Mark over time": sort the course's evaluations by date, and recompute the
 * course mark after each one. Returns [{ label, mark }] in date order.
 */
export function courseMarkSeries(categories, evaluations) {
  const sorted = [...evaluations].sort(
    (a, b) =>
      String(a.date || "").localeCompare(String(b.date || "")) ||
      String(a.created_at || "").localeCompare(String(b.created_at || ""))
  );
  const points = [];
  const acc = [];
  for (const ev of sorted) {
    acc.push(ev);
    const mark = courseMark(categories, acc);
    if (mark != null) {
      points.push({ label: fmtDate(ev.date) || `#${points.length + 1}`, mark });
    }
  }
  return points;
}

/** Overall average = simple mean of the courses' (non-null) current marks. */
export function overallAverage(marks) {
  const ms = marks.filter((m) => m != null);
  if (!ms.length) return null;
  return ms.reduce((a, b) => a + b, 0) / ms.length;
}

// ─────────────────────────────── Rendering ─────────────────────────────────

/** Render the Courses screen into `container`. */
export async function renderCourses(container) {
  const user = getCurrentUser();
  const headerHtml = `<div class="screen-header"><h1>Courses</h1></div>`;
  let loading = true;
  container.innerHTML = headerHtml;
  const skeletonTimer = setTimeout(() => {
    if (loading) container.innerHTML = `${headerHtml}${skeletonCards(4)}`;
  }, 180);

  const [{ courses, categories, evaluations }, profile] = await Promise.all([
    loadAll(user.id),
    getProfile(user.id),
  ]);
  loading = false;
  clearTimeout(skeletonTimer);
  document.getElementById("fab")?.classList.toggle("fab-attention", !courses.length);

  // Pre-compute each course's current mark and the overall average.
  const markById = {};
  for (const c of courses) {
    markById[c.id] = courseMark(
      categories.filter((cat) => cat.course_id === c.id),
      evaluations.filter((e) => e.course_id === c.id)
    );
  }
  const overall = overallAverage(courses.map((c) => markById[c.id]));

  const termText =
    profile?.term_start && profile?.term_end
      ? `${fmtDate(profile.term_start)} to ${fmtDate(profile.term_end)}`
      : "Set term dates";

  container.innerHTML = "";

  const header = el(`
    <div>
      <div class="screen-header"><h1>Courses</h1></div>
      <button class="term-pill" id="term-pill">${calendarIcon()} ${escapeHtml(termText)}</button>
    </div>
  `);
  container.appendChild(header);

  // Optional overall-average card (green bar-chart icon, like the reference)
  if (overall != null) {
    container.appendChild(
      el(`
      <div class="card overall">
        <div class="icon-circle" style="background:var(--good)">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round">
            <path d="M5 19V11M12 19V5M19 19v-6" />
          </svg>
        </div>
        <div class="overall-main">
          <div class="cc-code">Overall Average</div>
          <div class="muted small">${courses.length} course${courses.length === 1 ? "" : "s"}</div>
        </div>
        <div class="big-number">${fmtPercent(overall)}</div>
      </div>
    `)
    );
  }

  if (!courses.length) {
    container.appendChild(
      el(`
      <div class="empty centered">
        <div class="empty-icon">${emptyBookIcon()}</div>
        <div class="empty-title">No courses yet</div>
        Tap the + button to add your first course.
      </div>
    `)
    );
  } else {
    const list = document.createElement("div");
    for (const c of courses) {
      const color = COURSE_COLORS[(c.color_index ?? 0) % COURSE_COLORS.length];
      const letter = (c.code || "?").trim().charAt(0).toUpperCase();
      const meta = [c.period && `P${escapeHtml(c.period)}`, c.room && `rm ${escapeHtml(c.room)}`]
        .filter(Boolean)
        .join(" · ");
      // Show the calculated current mark when there are evaluations; otherwise
      // fall back to the midterm mark (e.g. "Please see teacher" courses), with
      // a small tag so it's clear which one is shown.
      const computed = markById[c.id];
      const big = computed != null ? computed : c.midterm;
      const tag = computed != null ? "current" : c.midterm != null ? "midterm" : "";
      const card = el(`
        <div class="card course-card" data-id="${c.id}">
          <div class="icon-circle" style="background:${color}">${escapeHtml(letter)}</div>
          <div class="cc-main">
            <div class="cc-code">${escapeHtml(c.code || "")}</div>
            <div class="cc-name">${escapeHtml(c.name || "")}</div>
            ${meta ? `<div class="cc-meta">${meta}</div>` : ""}
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
      card.addEventListener("click", () => window.AppNav.toDetail(c.id));
      list.appendChild(card);
    }
    container.appendChild(list);
  }

  // Tapping the term pill edits the term range.
  header.querySelector("#term-pill").addEventListener("click", () =>
    openTermEditor(profile)
  );
}

/**
 * Bottom-sheet editor for the term date range (used from the Courses header and
 * from Settings). `onSaved` (optional) runs after a successful save instead of
 * the default Courses-list refresh.
 */
export function openTermEditor(profile, onSaved) {
  const user = getCurrentUser();
  const afterSave = onSaved || (() => window.AppNav.refreshCourses());
  const body = el(`
    <form>
      <div class="field-row">
        <div class="field">
          <label>Term start</label>
          <input type="date" name="term_start" value="${profile?.term_start || ""}" />
        </div>
        <div class="field">
          <label>Term end</label>
          <input type="date" name="term_end" value="${profile?.term_end || ""}" />
        </div>
      </div>
      <div class="error-text"></div>
      <div class="form-actions">
        <button type="submit" class="btn">Save</button>
        <button type="button" class="btn ghost" data-cancel>Cancel</button>
      </div>
    </form>
  `);
  body.querySelector("[data-cancel]").addEventListener("click", closeSheet);
  body.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = new FormData(body);
    try {
      await saveProfile(user.id, {
        term_start: f.get("term_start") || null,
        term_end: f.get("term_end") || null,
      });
      closeSheet();
      afterSave();
    } catch (err) {
      body.querySelector(".error-text").textContent = err.message || "Could not save.";
    }
  });
  openSheet("Term Dates", body);
}

/**
 * Add (courseId = null) or edit a course. Seeds the Ontario default categories
 * on create. Allows delete when editing. `onSaved` (optional) runs after a
 * successful add/edit instead of the default Courses-list refresh.
 */
export async function openCourseForm(courseId, onSaved) {
  const user = getCurrentUser();
  const afterSave = onSaved || (() => window.AppNav.refreshCourses());
  let course = null;
  let existingCount = 0;

  if (courseId) {
    const { data } = await sb.from("courses").select("*").eq("id", courseId).maybeSingle();
    course = data;
  } else {
    const { count } = await sb
      .from("courses")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id);
    existingCount = count || 0;
    // Default the new course's term to the profile's term dates.
    const profile = await getProfile(user.id);
    course = { start_date: profile?.term_start || "", end_date: profile?.term_end || "" };
  }

  const v = (k) => escapeHtml(course?.[k] ?? "");
  const body = el(`
    <form novalidate>
      <div class="field" id="course-code-field">
        <label for="course-code">Course code *</label>
        <input id="course-code" name="code" placeholder="ENG4U" value="${v("code")}" required aria-describedby="course-code-error" />
        <div class="field-error-text" id="course-code-error"></div>
      </div>
      <div class="field">
        <label>Course name</label>
        <input name="name" placeholder="English" value="${v("name")}" />
      </div>
      <div class="field">
        <label>Teacher</label>
        <input name="teacher" placeholder="Ms. Smith" value="${v("teacher")}" />
      </div>
      <div class="field-row">
        <div class="field">
          <label>Period</label>
          <input name="period" placeholder="1" value="${v("period")}" />
        </div>
        <div class="field">
          <label>Room</label>
          <input name="room" placeholder="213" value="${v("room")}" />
        </div>
      </div>
      <div class="field-row">
        <div class="field">
          <label>Term start</label>
          <input type="date" name="start_date" value="${v("start_date")}" />
        </div>
        <div class="field">
          <label>Term end</label>
          <input type="date" name="end_date" value="${v("end_date")}" />
        </div>
      </div>
      <div class="field-row">
        <div class="field">
          <label>Midterm % (optional)</label>
          <input type="number" name="midterm" step="0.1" min="0" max="100" value="${v("midterm")}" />
        </div>
        <div class="field">
          <label>Final % (optional)</label>
          <input type="number" name="final" step="0.1" min="0" max="100" value="${v("final")}" />
        </div>
      </div>
      <div class="error-text"></div>
      <div class="form-actions">
        <button type="submit" class="btn">${courseId ? "Save Changes" : "Add Course"}</button>
        ${courseId ? '<button type="button" class="btn danger" data-delete>Delete Course</button>' : ""}
        <button type="button" class="btn ghost" data-cancel>Cancel</button>
      </div>
    </form>
  `);

  body.querySelector("[data-cancel]").addEventListener("click", closeSheet);
  body.querySelector("#course-code").addEventListener("input", () => {
    body.querySelector("#course-code-field").classList.remove("field-error");
    body.querySelector("#course-code").removeAttribute("aria-invalid");
    body.querySelector("#course-code-error").textContent = "";
  });

  if (courseId) {
    body.querySelector("[data-delete]").addEventListener("click", async () => {
      if (!confirm("Delete this course and all its evaluations?")) return;
      await sb.from("courses").delete().eq("id", courseId);
      closeSheet();
      window.AppNav.toCourses();
    });
  }

  body.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = new FormData(body);
    const num = (k) => (f.get(k) === "" ? null : Number(f.get(k)));
    const payload = {
      code: f.get("code").trim(),
      name: f.get("name").trim() || null,
      teacher: f.get("teacher").trim() || null,
      period: f.get("period").trim() || null,
      room: f.get("room").trim() || null,
      start_date: f.get("start_date") || null,
      end_date: f.get("end_date") || null,
      midterm: num("midterm"),
      final: num("final"),
    };
    const errEl = body.querySelector(".error-text");
    const codeField = body.querySelector("#course-code-field");
    const codeInput = body.querySelector("#course-code");
    const codeError = body.querySelector("#course-code-error");
    codeField.classList.remove("field-error");
    codeInput.removeAttribute("aria-invalid");
    codeError.textContent = "";
    if (!payload.code) {
      codeField.classList.add("field-error");
      codeInput.setAttribute("aria-invalid", "true");
      codeError.textContent = "Course code is required.";
      codeInput.focus();
      return;
    }
    try {
      if (courseId) {
        const { error } = await sb.from("courses").update(payload).eq("id", courseId);
        if (error) throw error;
      } else {
        payload.user_id = user.id;
        payload.color_index = existingCount % COURSE_COLORS.length;
        const { data: created, error } = await sb
          .from("courses")
          .insert(payload)
          .select()
          .single();
        if (error) throw error;
        // Seed the Ontario default categories for the new course.
        await sb.from("categories").insert(
          DEFAULT_CATEGORIES.map((c) => ({
            user_id: user.id,
            course_id: created.id,
            name: c.name,
            weight: c.weight,
          }))
        );
      }
      closeSheet();
      afterSave();
    } catch (err) {
      errEl.textContent = err.message || "Could not save the course.";
    }
  });

  openSheet(courseId ? "Edit Course" : "Add Course", body);
}
