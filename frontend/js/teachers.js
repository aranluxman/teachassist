// ============================================================================
// Teacher info per course — TeachAssist doesn't send it, so students add it
// once (name, email, room, extra-help times). Saved on this device, per
// student, keyed by course code. Demo/scraped teacher names are the default.
// ============================================================================

import { courseLabel, el, escapeHtml, openSheet, closeSheet } from "./courses.js";
import { readStudentData, writeStudentData } from "./student-store.js";

const KEY = "course-teachers";
const all = () => readStudentData(KEY, {});

/** { name, email, room, help } for a course; blank fields when unknown. */
export function teacherFor(course) {
  const saved = all()[courseLabel(course)] || {};
  return {
    name: saved.name || course?.teacher || "",
    email: saved.email || "",
    room: saved.room || course?.room || "",
    help: saved.help || "",
  };
}

/** Every course teacher the student knows about, for the Profile search. */
export function savedTeachers() {
  return Object.entries(all()).filter(([, t]) => t.name).map(([code, t]) => ({ code, teacher: t.name, room: t.room, email: t.email }));
}

const validEmail = (v) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

/** Bottom sheet to add or edit the teacher for one course. */
export function editTeacher(course, done) {
  const t = teacherFor(course);
  const form = el(`<form class="teacher-form">
    <div class="field"><label for="t-name">Teacher name</label><input id="t-name" name="name" maxlength="80" placeholder="Ms. Alvarez" value="${escapeHtml(t.name)}" required></div>
    <div class="field"><label for="t-email">Email</label><input id="t-email" name="email" type="email" maxlength="120" placeholder="firstname.lastname@yrdsb.ca" value="${escapeHtml(t.email)}"></div>
    <div class="form-grid">
      <div class="field"><label for="t-room">Room</label><input id="t-room" name="room" maxlength="20" placeholder="214" value="${escapeHtml(t.room)}"></div>
      <div class="field"><label for="t-help">Extra help</label><input id="t-help" name="help" maxlength="80" placeholder="Tue lunch" value="${escapeHtml(t.help)}"></div>
    </div>
    <p class="small muted">Saved on this device only. YRDSB teacher emails are usually firstname.lastname@yrdsb.ca.</p>
    <p role="status" class="small"></p>
    <button class="btn">Save teacher</button>
  </form>`);
  form.onsubmit = (e) => {
    e.preventDefault();
    const v = Object.fromEntries(["name", "email", "room", "help"].map((k) => [k, form.elements[k].value.trim()]));
    if (!validEmail(v.email)) { form.querySelector("[role=status]").textContent = "That email doesn't look right."; return; }
    try {
      writeStudentData(KEY, { ...all(), [courseLabel(course)]: v });
      closeSheet();
      done?.();
    } catch { form.querySelector("[role=status]").textContent = "Couldn't save — device storage may be full."; }
  };
  openSheet(t.name ? "Edit teacher" : "Add teacher", form);
}
