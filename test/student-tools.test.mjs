import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readStudentData, writeStudentData, forgetStudentData } from '../frontend/js/student-store.js';
import { readHistory, recordSnapshot, snapshotChanges } from '../frontend/js/history.js';
import { notificationMessage } from '../frontend/js/notifications.js';
import { issueSession, verifySession } from '../worker/src/session.js';
import { COLORS, themeChoice, shadeTokens, contrast, courseShades } from '../frontend/js/theme.js';
import { rememberCourseOrder, shadeIndex, subjectStyle } from '../frontend/js/subjects.js';

beforeEach(() => {
  const storage = new Map();
  globalThis.localStorage = { getItem: k => storage.get(k) ?? null, setItem: (k,v) => storage.set(k,String(v)), removeItem: k => storage.delete(k),
    get length() { return storage.size; }, key: i => [...storage.keys()][i] ?? null };
});
test('Delete my data wipes only that student from this device', () => {
  for (const [k, v] of [['ta-personal:111','{}'],['ta-tools:111:profile','{}'],['ta-tools:111:history:x','[]'],
    ['ta-personal:222','{}'],['ta-tools:222:profile','{}'],['ta-tools:1111:profile','{}'],['ta_links','[]']]) localStorage.setItem(k, v);
  forgetStudentData('111');
  for (const gone of ['ta-personal:111','ta-tools:111:profile','ta-tools:111:history:x']) assert.equal(localStorage.getItem(gone), null, gone);
  for (const kept of ['ta-personal:222','ta-tools:222:profile','ta-tools:1111:profile','ta_links']) assert.notEqual(localStorage.getItem(kept), null, `${kept} is kept`);
  forgetStudentData('');
  assert.equal(localStorage.getItem('ta-personal:222'), '{}', 'no student number deletes nothing');
});
const snap = (date, mark) => ({ date, marks: { ENG: mark }, overall: mark });
test('student tools and history remain separate across students, demo, and servers', () => {
  localStorage.setItem('ta_student_number','111');
  writeStudentData('profile',{school:'School A'});
  recordSnapshot('server-a',snap('2026-10-08T09:00:00Z',80));
  assert.equal(readHistory('server-b').length,0);
  localStorage.setItem('ta_student_number','222');
  assert.deepEqual(readStudentData('profile',{}),{});
  assert.equal(readHistory('server-a').length,0);
  localStorage.setItem('ta_student_number','111');
  assert.equal(readHistory('server-a')[0].overall,80);
  localStorage.setItem('ta_demo_mode','1');
  assert.equal(readHistory('server-a').length,0);
});
test('history rejects stale observations, deduplicates a cached snapshot, and caps retention', () => {
  recordSnapshot('a',snap('2026-10-08T09:00:00Z',80));
  recordSnapshot('a',snap('2026-10-08T09:00:00Z',80));
  assert.equal(readHistory('a').length,1);
  assert.equal(recordSnapshot('a',snap('2026-10-07T09:00:00Z',90)).stale,true);
  for(let i=0;i<70;i++) recordSnapshot('a',snap(new Date(Date.UTC(2026,9,9,0,i)).toISOString(),80));
  assert.equal(readHistory('a').length,60);
});
test('alerts distinguish missing marks from removed courses and preserve privacy', () => {
  const changes = snapshotChanges({marks:{ENG:80,MATH:90,ART:null,GEO:70}}, {marks:{ENG:82,MATH:null,ART:75,NEW:99}});
  assert.deepEqual(changes.map(c=>c.kind),['changed','unavailable','changed']);
  assert.equal(notificationMessage(changes,{marks:false,unavailable:false}),null);
  const privateText = notificationMessage(changes,{marks:true,private:true});
  assert.doesNotMatch(privateText,/ENG|82|80|MATH|75/);
  assert.match(notificationMessage(changes,{marks:false,unavailable:true,private:false}),/MATH.*unavailable/);
});
test('assistant session capabilities expire and reject tampering or the wrong signing key', async () => {
  const now = Date.now(), token = await issueSession('server-secret',now);
  assert.equal(await verifySession(token,'server-secret',now),true);
  assert.equal(await verifySession(token,'other-secret',now),false);
  assert.equal(await verifySession(token,'server-secret',now+3600000),false);
  assert.equal(await verifySession(token.replace(/^\d+/, '9999999999'),'server-secret',now),false);
  assert.equal(await verifySession('', 'server-secret'),false);
});
test('theme picker has fifteen colours and old colour names carry over', () => {
  assert.equal(COLORS.length, 15);
  assert.equal(new Set(COLORS.map(c => c.id)).size, 15, 'ids are unique');
  for (const c of COLORS) assert.equal(c.dots.length, 4, `${c.name} has four swatch dots`);
  assert.deepEqual(themeChoice(), { appearance: 'light', color: 'default', shade: 0 }, 'first run is Mint, first shade, on Light');
  for (const [old, now] of [['mono','slate'],['tide','indigo'],['olive','forest'],['ember','amber']]) {
    localStorage.setItem('theme-color', old);
    assert.equal(themeChoice().color, now, `${old} becomes ${now}`);
    assert.equal(localStorage.getItem('theme-color'), now, 'and is saved under the new name');
  }
  localStorage.setItem('theme-color', 'nonsense');
  assert.equal(themeChoice().color, 'default');
});
test('every shade of every colour is readable in light and dark', () => {
  const bad = [];
  for (const c of COLORS) c.dots.forEach((dot, i) => {
    for (const [mode, card, onAccent] of [['light', '#ffffff', '#ffffff'], ['dark', '#161618', '#111111']]) {
      const { accent } = shadeTokens(dot, mode);
      if (contrast(accent, card) < 4.5 || contrast(onAccent, accent) < 4.5) bad.push(`${c.name} ${i + 1} ${mode}: ${accent}`);
    }
  });
  assert.deepEqual(bad, []);
});
test('a stored shade is kept only when valid', () => {
  localStorage.setItem('theme-color', 'sky');
  for (const [stored, want] of [['2', 2], ['3', 3], ['4', 0], ['-1', 0], ['1.5', 0], ['x', 0]]) {
    localStorage.setItem('theme-shade', stored);
    assert.equal(themeChoice().shade, want, `shade "${stored}"`);
  }
});
test('course shades are readable under their icon and tell the four apart', () => {
  // OKLab distance: about 0.02 is the smallest difference people notice.
  const lab = (hex) => {
    const [r, g, b] = [1, 3, 5].map((i) => { const v = parseInt(hex.slice(i, i + 2), 16) / 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b), m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b), q = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * q, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * q, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * q];
  };
  const bad = [];
  for (const [mode, ink] of [['light', '#ffffff'], ['dark', '#111111']]) {
    for (const c of COLORS) {
      const shades = courseShades(c.dots, mode);
      shades.forEach((x, i) => { if (contrast(ink, x) < 4.5) bad.push(`${mode} ${c.name} ${i + 1}: icon on ${x}`); });
      for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) {
        const [a, b] = [lab(shades[i]), lab(shades[j])];
        if (Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) < 0.04) bad.push(`${mode} ${c.name}: shades ${i + 1} and ${j + 1} look alike`);
      }
    }
  }
  assert.deepEqual(bad, []);
});
test('each course takes a theme shade by its place in the list', () => {
  localStorage.setItem('ta_student_number', '111');
  rememberCourseOrder(['SNC2D1-8', 'MPM2D1-2', 'ENG2D1-1', 'FSF2D1-3', 'CHC2D1-4']);
  assert.deepEqual(['SNC2D1-8', 'mpm2d1-2', ' ENG2D1-1 ', 'FSF2D1-3', 'CHC2D1-4'].map(shadeIndex), [1, 2, 3, 4, 1]);
  const lunch = shadeIndex('LUNCH');
  assert.ok(lunch >= 1 && lunch <= 4 && shadeIndex('LUNCH') === lunch, 'a code not in the list still gets a fixed shade');
  const sci = subjectStyle('SNC2D1-8');
  assert.equal(sci.to, 'var(--shade-1)');
  assert.match(sci.icon, /<svg/);
  assert.doesNotMatch(sci.from + sci.to + sci.tint, /#(?!fff\b)[0-9a-f]{3,6}/i, 'no fixed subject colour is left');
});
