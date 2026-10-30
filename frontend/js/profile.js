import { el, escapeHtml as esc, openSheet, closeSheet } from './courses.js';
import { preferences, savePreferences } from './personalization.js';
import { readStudentData, writeStudentData } from './student-store.js';
import { studentNumber, isDemo } from './ta-client.js';
import { requiredGrade, projectedGrade } from './grade-math.js';
import { checkReminders } from './notifications.js';
import { minimizable } from './ui-kit.js';

const icon = paths => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
const personIcon = icon('<circle cx="12" cy="7" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>');
const ACTIONS = [
  ['website', 'TeachAssist website', icon('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a18 18 0 0 1 0 18 18 18 0 0 1 0-18Z"/>')],
  ['teachers', 'Find a teacher', icon('<circle cx="10" cy="10" r="7"/><path d="m15 15 6 6"/>')],
  ['volunteer', 'My volunteer hours', icon('<path d="M20 5a5 5 0 0 0-8 1 5 5 0 0 0-8-1c-4 4 1 9 8 15 7-6 12-11 8-15Z"/>')],
  ['exam', 'Exam calculator', icon('<rect x="4" y="2" width="16" height="20" rx="3"/><path d="M8 6h8M8 11h1m6 0h1M8 15h1m6 0h1M8 19h1m6 0h1"/>')],
  ['id', 'Student ID', icon('<rect x="2" y="4" width="20" height="16" rx="3"/><circle cx="8" cy="10" r="2"/><path d="M5 16a3 3 0 0 1 6 0m4-6h4m-4 4h4"/>')],
];
function profile() { return readStudentData('profile', { school: '', photo: '', background: '' }); }
function photoElement(src) {
  // Only small, locally uploaded raster images can be used as profile media.
  return typeof src === 'string' && /^data:image\/(png|jpeg|webp);base64,/.test(src) && src.length < 1100000 ? src : '';
}
/** Decode any photo the browser can read (a full-size phone photo is fine). */
function decodeImage(file) {
  if (window.createImageBitmap) return createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => createImageBitmap(file));
  return new Promise((resolve, reject) => {
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error()); };
    img.src = url;
  });
}
/** Shrink a photo on this device to at most `max` px wide/tall, saved as a small JPEG. */
async function mediaFile(file, max) {
  if (!file) return null;
  if (file.type && !file.type.startsWith('image/')) throw new Error('Choose a photo (JPG, PNG, WebP or HEIC).');
  let img;
  try { img = await decodeImage(file); }
  catch { throw new Error('That photo could not be opened. Try a JPG or PNG, or take a screenshot of it.'); }
  const w = img.width || img.naturalWidth, h = img.height || img.naturalHeight;
  const scale = Math.min(1, max / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w * scale)); canvas.height = Math.max(1, Math.round(h * scale));
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); // transparent PNGs get a white back
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  img.close?.();
  // Step quality down until it fits comfortably in device storage.
  for (const q of [0.85, 0.72, 0.6, 0.45]) {
    const data = canvas.toDataURL('image/jpeg', q);
    if (data.length < 600000) return data;
  }
  throw new Error('That photo is too detailed to save. Try a different one.');
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
    button.onclick = () => ({ website: () => window.open('https://ta.yrdsb.ca', '_blank', 'noopener,noreferrer'), teachers: teacherSearch, volunteer: () => window.AppNav.toGuidance('volunteer'), exam: examCalculator, id: studentId })[id]();
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
  const form = el(`<form><div class="field"><label for="student-name">Name</label><input id="student-name" maxlength="50" value="${esc(preferences().name)}"></div><div class="field"><label for="student-school">School</label><input id="student-school" maxlength="120" value="${esc(p.school)}"></div><div class="field"><label for="student-photo">Profile photo</label><input id="student-photo" type="file" accept="image/*"></div><div class="field"><label for="student-background">Cover photo</label><input id="student-background" type="file" accept="image/*"></div><p class="small muted">Any size photo works — it\u2019s shrunk on your phone before saving. Profile information stays on this device.</p><label><input type="checkbox" name="remove"> Remove saved photos</label><p role="status"></p><button class="btn">Save profile</button></form>`);
  form.onsubmit = async e => {
    e.preventDefault();
    const button = form.querySelector('button'); button.disabled = true;
    form.querySelector('[role=status]').textContent = [...form.querySelectorAll('input[type=file]')].some(i => i.files.length) ? 'Preparing your photo…' : '';
    try {
      const photo = await mediaFile(form.querySelector('#student-photo').files[0], 512);
      const background = await mediaFile(form.querySelector('#student-background').files[0], 1280);
      const remove = form.elements.remove.checked;
      writeStudentData('profile', { school: form.querySelector('#student-school').value.trim(), photo: remove ? '' : photo ?? p.photo, background: remove ? '' : background ?? p.background });
      savePreferences({ name: form.querySelector('#student-name').value.trim() });
      closeSheet(); done();
    } catch (err) { form.querySelector('[role=status]').textContent = err?.name === 'QuotaExceededError' ? 'Your device storage is full. Remove saved photos, then try again.' : err.message; }
    finally { button.disabled = false; }
  };
  openSheet('Edit profile', form);
}
// Ontario College of Teachers public register. Opened in a new tab, one name
// at a time; the register itself is never copied into this app.
const OCT_SEARCH = 'https://apps.oct.ca/FindATeacher/members?searchStr=';
/** "Mr. John A. Smith" → "John Smith": OCT wants First Last, no titles or middle names. */
export function octQuery(name) {
  const words = String(name).replace(/[^\p{L}\p{N}'\- ]/gu, ' ').split(/\s+/).filter(Boolean)
    .filter((w, i) => !(i === 0 && /^(mr|mrs|ms|miss|mx|dr|mme|mlle|m|coach|prof|sir|madame|monsieur)$/i.test(w)));
  return words.length > 2 ? `${words[0]} ${words[words.length - 1]}` : words.join(' ');
}
function teacherSearch() {
  const form = el('<form class="teacher-form"><p class="muted">Search Ontario\u2019s official register of certified teachers on the Ontario College of Teachers website.</p><div class="field"><label for="teacher-query">Teacher name or registration number</label><input id="teacher-query" name="q" type="search" maxlength="80" placeholder="First name Last name" autocomplete="off" required></div><p class="small muted">Use first and last name only. Titles like Mr. or Ms. and middle names are removed for you.</p><p role="status" class="small"></p><button class="btn">Search on OCT \u2197</button></form>');
  form.onsubmit = e => {
    e.preventDefault();
    const q = octQuery(form.elements.q.value);
    if (!q) { form.querySelector('[role=status]').textContent = 'Type a teacher\u2019s name first.'; return; }
    window.open(OCT_SEARCH + encodeURIComponent(q), '_blank', 'noopener,noreferrer');
  };
  openSheet('Find a teacher', form);
}
function studentId() {
  const p = profile();
  openSheet('Student ID', el(`<div class="student-id card"><div class="eyebrow">PERSONAL REFERENCE</div><h2>${esc(preferences().name || (isDemo() ? 'Demo student' : 'Student'))}</h2><p class="id-number">${esc(isDemo() ? 'Demo — no student number' : studentNumber())}</p><p>${esc(p.school || 'School not added')}</p><p class="small muted">This is a personal reference, not an official school-issued ID.</p></div>`));
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
  const card = el('<section class="card appointments"><div class="tool-heading"><h2>Guidance reminders</h2></div><div class="appointment-body"><p class="muted">Add an appointment you have already booked with your school. This does not book an appointment.</p><div class="appointment-list"></div><form><div class="field"><label for="appointment-title">Appointment label</label><input id="appointment-title" name="title" maxlength="80" placeholder="Course planning" required></div><div class="field"><label for="appointment-time">Date and time</label><input id="appointment-time" name="time" type="datetime-local" required></div><p role="status"></p><button class="btn secondary">Save reminder</button></form><p class="small muted">Turn on guidance reminders in Settings → Notifications. A reminder appears 15 minutes before, but only while TeachAssist is open — a closed tab can’t remind you, so add important appointments to your phone calendar too.</p></div></section>');
  minimizable(card.querySelector('.tool-heading'), [card.querySelector('.appointment-body')], 'reminders', 'guidance reminders');
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
