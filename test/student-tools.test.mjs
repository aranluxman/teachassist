import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readStudentData, writeStudentData, validServerUrl } from '../frontend/js/student-store.js';
import { readHistory, recordSnapshot, snapshotChanges } from '../frontend/js/history.js';
import { notificationMessage } from '../frontend/js/notifications.js';
import { issueSession, verifySession } from '../worker/src/session.js';

beforeEach(() => {
  const storage = new Map();
  globalThis.localStorage = { getItem: k => storage.get(k) ?? null, setItem: (k,v) => storage.set(k,String(v)), removeItem: k => storage.delete(k) };
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
test('custom servers accept HTTPS or local development only', () => {
  assert.equal(validServerUrl('https://server.example/'),'https://server.example');
  assert.equal(validServerUrl('http://localhost:8787'),'http://localhost:8787');
  for(const value of ['javascript:alert(1)','http://server.example','https://user:pass@server.example','https://server.example?key=secret']) assert.throws(()=>validServerUrl(value));
});
test('assistant session capabilities expire and reject tampering or the wrong signing key', async () => {
  const now = Date.now(), token = await issueSession('server-secret',now);
  assert.equal(await verifySession(token,'server-secret',now),true);
  assert.equal(await verifySession(token,'other-secret',now),false);
  assert.equal(await verifySession(token,'server-secret',now+3600000),false);
  assert.equal(await verifySession(token.replace(/^\d+/, '9999999999'),'server-secret',now),false);
  assert.equal(await verifySession('', 'server-secret'),false);
});
