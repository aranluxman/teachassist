import { el, escapeHtml as esc, openSheet, closeSheet } from './courses.js';
import { preferences, savePreferences } from './personalization.js';
import { readStudentData, writeStudentData } from './student-store.js';
import { studentNumber, isDemo, getCourses } from './ta-client.js';
import { requiredGrade, projectedGrade } from './grade-math.js';
import { checkReminders } from './notifications.js';

const icon = paths => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
const personIcon = icon('<circle cx="12" cy="7" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>');
const ACTIONS = [
  ['website', 'TeachAssist website', icon('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a18 18 0 0 1 0 18 18 18 0 0 1 0-18Z"/>')],
  ['teachers', 'Teacher search', icon('<circle cx="10" cy="10" r="7"/><path d="m15 15 6 6"/>')],
  ['volunteer', 'My volunteer hours', icon('<path d="M20 5a5 5 0 0 0-8 1 5 5 0 0 0-8-1c-4 4 1 9 8 15 7-6 12-11 8-15Z"/>')],
  ['exam', 'Exam calculator', icon('<rect x="4" y="2" width="16" height="20" rx="3"/><path d="M8 6h8M8 11h1m6 0h1M8 15h1m6 0h1M8 19h1m6 0h1"/>')],
  ['id', 'Student ID', icon('<rect x="2" y="4" width="20" height="16" rx="3"/><circle cx="8" cy="10" r="2"/><path d="M5 16a3 3 0 0 1 6 0m4-6h4m-4 4h4"/>')],
];
function profile() { return readStudentData('profile', { school: '', photo: '', background: '' }); }
function photoElement(src) {
  // Only small, locally uploaded raster images can be used as profile media.
  return typeof src === 'string' && /^data:image\/(png|jpeg|webp);base64,/.test(src) && src.length < 1100000 ? src : '';
}
function mediaFile(file) {
  return new Promise((resolve, reject) => {
    if (!file) return resolve(null);
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 750000)
      return reject(new Error('Choose a PNG, JPG, or WebP image smaller than 750 KB.'));
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('That image could not be read.'));
    reader.readAsDataURL(file);
  });
}
export async function renderProfile(container) {
  const p = profile(), name = preferences().name;
  container.innerHTML = '<div class="screen-header"><h1>My profile</h1><button class="btn ghost" data-back>Back</button></div>';
  container.querySelector('[data-back]').onclick = () => window.AppNav.toCourses();
  const hero = el(`<section class="card profile-hero"><div class="profile-details"><div class="profile-avatar">${photoElement(p.photo) ? `<img src="${photoElement(p.photo)}" alt="Your profile photo">` : personIcon}</div><h2>${esc(name || (isDemo() ? 'Demo student' : studentNumber()))}</h2><p>${esc(p.school || 'Add your school')}</p><button class="btn secondary" data-edit>Edit profile</button></div></section>`);
  if (photoElement(p.background)) hero.style.backgroundImage = `linear-gradient(var(--card), transparent), url("${photoElement(p.background)}")`;
  hero.querySelector('[data-edit]').onclick = () => editProfile(() => renderProfile(container));
  container.append(hero);
  const section = el('<section class="card"><div class="tool-heading"><h2>Quick actions</h2><button class="btn ghost" data-edit-actions>Edit</button></div><div class="quick-actions"></div></section>');
  const hidden = readStudentData('hidden-actions', []);
  for (const [id, label, icon] of ACTIONS) {
    if (hidden.includes(id)) continue;
    const button = el(`<button class="quick-action"><span aria-hidden="true">${icon}</span>${label}</button>`);
    button.onclick = () => ({ website: () => window.open('https://ta.yrdsb.ca', '_blank', 'noopener,noreferrer'), teachers: teacherSearch, volunteer: volunteerHours, exam: examCalculator, id: studentId })[id]();
    section.querySelector('.quick-actions').append(button);
  }
  if (hidden.length === ACTIONS.length) section.querySelector('.quick-actions').append(el('<p class="muted">Choose Edit to show your quick actions.</p>'));
  section.querySelector('[data-edit-actions]').onclick = () => {
    const form = el(`<form>${ACTIONS.map(([id, label]) => `<label class="preference-row"><span>${label}</span><input type="checkbox" role="switch" value="${id}" ${hidden.includes(id) ? '' : 'checked'}></label>`).join('')}<button class="btn">Save quick actions</button></form>`);
    form.onsubmit = e => { e.preventDefault(); writeStudentData('hidden-actions', [...form.querySelectorAll('input:not(:checked)')].map(n => n.value)); closeSheet(); renderProfile(container); };
    openSheet('Edit quick actions', form);
  };
  container.append(section);
  const settings = el('<button class="btn secondary">Notifications & settings</button>');
  settings.onclick = () => window.AppNav.toSettings();
  container.append(settings);
}
function editProfile(done) {
  const p = profile();
  const form = el(`<form><div class="field"><label for="student-name">Name</label><input id="student-name" maxlength="50" value="${esc(preferences().name)}"></div><div class="field"><label for="student-school">School</label><input id="student-school" maxlength="120" value="${esc(p.school)}"></div><div class="field"><label for="student-photo">Profile photo</label><input id="student-photo" type="file" accept="image/png,image/jpeg,image/webp"></div><div class="field"><label for="student-background">Cover photo</label><input id="student-background" type="file" accept="image/png,image/jpeg,image/webp"></div><p class="small muted">Images up to 750 KB each. Profile information stays on this device.</p><label><input type="checkbox" name="remove"> Remove saved photos</label><p role="status"></p><button class="btn">Save profile</button></form>`);
  form.onsubmit = async e => {
    e.preventDefault();
    const button = form.querySelector('button'); button.disabled = true;
    try {
      const photo = await mediaFile(form.querySelector('#student-photo').files[0]);
      const background = await mediaFile(form.querySelector('#student-background').files[0]);
      const remove = form.elements.remove.checked;
      writeStudentData('profile', { school: form.querySelector('#student-school').value.trim(), photo: remove ? '' : photo ?? p.photo, background: remove ? '' : background ?? p.background });
      savePreferences({ name: form.querySelector('#student-name').value.trim() });
      closeSheet(); done();
    } catch (err) { form.querySelector('[role=status]').textContent = err.message; }
    finally { button.disabled = false; }
  };
  openSheet('Edit profile', form);
}
async function teacherSearch() {
  const body = el('<div><div class="field"><label for="teacher-query">Search your course teachers</label><input id="teacher-query" type="search" placeholder="Teacher name or course"></div><div class="teacher-results" role="status">Loading courses…</div><details><summary>Add a teacher to your personal directory</summary><p class="small muted">Some courses do not include teacher details. Save your own contacts here; these are not school-verified.</p><form><div class="field"><label for="teacher-name">Teacher name</label><input id="teacher-name" name="teacher" maxlength="100" required></div><div class="field"><label for="teacher-course">Course</label><input id="teacher-course" name="course" maxlength="50" required></div><button class="btn secondary">Save teacher</button><p role="status"></p></form></details></div>');
  openSheet('Teacher search', body);
  let courses = [];
  const render = () => {
    const query = body.querySelector('#teacher-query').value.trim().toLowerCase();
    const saved = readStudentData('teachers', []);
    const found = [...courses, ...saved].filter(c => c.teacher && `${c.teacher} ${c.code} ${c.name || ''}`.toLowerCase().includes(query));
    const results = body.querySelector('.teacher-results'); results.innerHTML = '';
    for (const c of found) {
      const item = el(`<div class="card"><b>${esc(c.teacher)}</b><p>${esc(c.code)}${c.name ? ` · ${esc(c.name)}` : ''}</p>${c.room ? `<p class="muted">Room ${esc(c.room)}</p>` : ''}${c.id ? '<p class="small muted">Personal contact</p><button class="btn ghost">Remove contact</button>' : ''}</div>`);
      if (c.id) item.querySelector('button').onclick = () => { writeStudentData('teachers', saved.filter(t => t.id !== c.id)); render(); };
      results.append(item);
    }
    if (!found.length) results.append(el('<p class="muted">No matching teacher details. Add a personal contact below, or check your school’s staff directory.</p>'));
  };
  body.querySelector('#teacher-query').oninput = render;
  const form = body.querySelector('form');
  form.onsubmit = e => {
    e.preventDefault();
    const teacher = form.elements.teacher.value.trim(), code = form.elements.course.value.trim();
    if (!teacher || !code) return;
    try {
      writeStudentData('teachers', [...readStudentData('teachers', []), { id: crypto.randomUUID(), teacher, code }]);
      form.reset(); body.querySelector('#teacher-query').value = ''; render();
      form.querySelector('[role=status]').textContent = 'Saved on this device.';
    } catch { form.querySelector('[role=status]').textContent = 'Could not save this contact.'; }
  };
  try { courses = await getCourses(); render(); }
  catch { render(); }
}
function studentId() {
  const p = profile();
  openSheet('Student ID', el(`<div class="student-id card"><div class="eyebrow">PERSONAL REFERENCE</div><h2>${esc(preferences().name || (isDemo() ? 'Demo student' : 'Student'))}</h2><p class="id-number">${esc(isDemo() ? 'Demo — no student number' : studentNumber())}</p><p>${esc(p.school || 'School not added')}</p><p class="small muted">This is a personal reference, not an official school-issued ID.</p></div>`));
}
function volunteerHours() {
  const body = el('<div><p class="muted">A personal log saved on this device. Your school must approve hours separately.</p><div class="volunteer-list"></div><form><div class="field"><label for="vol-activity">Activity</label><input id="vol-activity" name="activity" maxlength="120" required></div><div class="form-grid"><div class="field"><label for="vol-date">Date</label><input id="vol-date" name="date" type="date" required></div><div class="field"><label for="vol-hours">Hours</label><input id="vol-hours" name="hours" type="number" min="0.25" max="24" step="0.25" required></div></div><p role="status"></p><button class="btn">Add hours</button></form></div>');
  const render = () => {
    const entries = readStudentData('volunteer', []);
    const total = entries.reduce((sum, r) => sum + r.hours, 0);
    const list = body.querySelector('.volunteer-list');
    list.innerHTML = `<h3>${total} / 40 hours logged</h3><progress max="40" value="${Math.min(total,40)}" aria-label="Volunteer hours toward 40-hour goal"></progress>`;
    entries.forEach(row => {
      const item = el(`<div class="tool-heading"><div><b>${esc(row.activity)}</b><p class="small muted">${esc(row.date)} · ${row.hours} hours</p></div><button class="btn ghost" aria-label="Remove ${esc(row.activity)}">Remove</button></div>`);
      item.querySelector('button').onclick = () => { writeStudentData('volunteer', entries.filter(r => r.id !== row.id)); render(); };
      list.append(item);
    });
  };
  const form = body.querySelector('form');
  form.onsubmit = e => {
    e.preventDefault();
    const activity = form.elements.activity.value.trim(), hours = Number(form.elements.hours.value), date = form.elements.date.value;
    if (!activity || !Number.isFinite(hours) || hours <= 0 || hours > 24 || !date) return;
    try { writeStudentData('volunteer', [...readStudentData('volunteer', []), { id: crypto.randomUUID(), activity, hours, date }]); form.reset(); render(); }
    catch { form.querySelector('[role=status]').textContent = 'Could not save. Device storage may be full.'; }
  };
  render(); openSheet('My volunteer hours', body);
}
export function examCalculator() {
  const form = el(`<form><p class="muted">Use the exam’s share of your final grade. Assumes your current mark represents the rest of the course.</p><div class="field"><label for="exam-mode">Calculate</label><select id="exam-mode" name="mode"><option value="required">Exam mark needed for my target</option><option value="projected">Final grade from an exam mark</option></select></div>${[['current','Current grade (%)','85'],['score','Target final grade (%)','90'],['weight','Exam weight (%)','30']].map(([id,label,value]) => `<div class="field"><label for="exam-${id}">${label}</label><input id="exam-${id}" name="${id}" type="number" min="${id === 'weight' ? '0.01' : '0'}" max="100" step="any" value="${value}" required></div>`).join('')}<button class="btn">Calculate</button><p class="calc-result" role="status"></p></form>`);
  form.elements.mode.onchange = () => { form.querySelector('[for=exam-score]').textContent = form.elements.mode.value === 'required' ? 'Target final grade (%)' : 'Expected exam grade (%)'; form.querySelector('[role=status]').textContent = ''; };
  form.onsubmit = e => {
    e.preventDefault();
    try {
      const required = form.elements.mode.value === 'required';
      const value = (required ? requiredGrade : projectedGrade)(+form.elements.current.value, +form.elements.score.value, +form.elements.weight.value);
      form.querySelector('[role=status]').textContent = required ? `You need ${value.toFixed(2)}% on the exam. ${value > 100 ? 'This target would require more than 100%.' : value < 0 ? 'Your target is already secured, even with 0% on the exam.' : ''}` : `Your projected final grade is ${value.toFixed(2)}%.`;
    } catch (err) { form.querySelector('[role=status]').textContent = err.message; }
  };
  openSheet('Exam calculator', form);
}
export function appointmentCard() {
  const card = el('<section class="card"><h2>Guidance reminders</h2><p class="muted">Add an appointment you have already booked with your school. This does not book an appointment.</p><div class="appointment-list"></div><form><div class="field"><label for="appointment-title">Appointment label</label><input id="appointment-title" name="title" maxlength="80" placeholder="Course planning" required></div><div class="field"><label for="appointment-time">Date and time</label><input id="appointment-time" name="time" type="datetime-local" required></div><p role="status"></p><button class="btn secondary">Save reminder</button></form><p class="small muted">Enable guidance reminders in Settings. Reminders appear 15 minutes before the appointment while TeachAssist is open.</p></section>');
  const render = () => {
    const rows = readStudentData('appointments', []);
    const list = card.querySelector('.appointment-list'); list.innerHTML = '';
    rows.sort((a,b) => Date.parse(a.time)-Date.parse(b.time)).forEach(row => {
      const item = el(`<div class="tool-heading"><div><b>${esc(row.title)}</b><p class="small muted">${esc(new Date(row.time).toLocaleString())}</p></div><button class="btn ghost" aria-label="Remove appointment ${esc(row.title)}">Remove</button></div>`);
      item.querySelector('button').onclick = () => { writeStudentData('appointments', rows.filter(r => r.id !== row.id)); render(); }; list.append(item);
    });
  };
  const form = card.querySelector('form');
  form.onsubmit = e => {
    e.preventDefault();
    const time = new Date(form.elements.time.value), title = form.elements.title.value.trim();
    if (!title || !Number.isFinite(time.getTime()) || time.getTime() <= Date.now()) { form.querySelector('[role=status]').textContent = 'Choose a future date and time.'; return; }
    try { writeStudentData('appointments', [...readStudentData('appointments', []), { id: crypto.randomUUID(), title, time: time.toISOString(), notified: false }]); form.reset(); form.querySelector('[role=status]').textContent = 'Saved on this device.'; render(); checkReminders(); }
    catch { form.querySelector('[role=status]').textContent = 'Could not save this reminder.'; }
  };
  render(); return card;
}
