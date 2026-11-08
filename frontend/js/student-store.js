import { deviceStore } from './device-store.js';

// Personal tools stay in this browser, separated by account and demo mode.
// A shared-computer sign-in keeps them in this tab only (device-store.js).
export function accountKey() {
  return localStorage.getItem('ta_demo_mode') === '1' ? 'demo' : deviceStore().getItem('ta_student_number') || 'guest';
}
export function readStudentData(name, fallback) {
  try { return JSON.parse(deviceStore().getItem(`ta-tools:${accountKey()}:${name}`)) ?? fallback; }
  catch { return fallback; }
}
export function writeStudentData(name, value) {
  deviceStore().setItem(`ta-tools:${accountKey()}:${name}`, JSON.stringify(value));
}
/** Remove everything this browser keeps for one student (settings, goals, history, profile). */
export function forgetStudentData(studentNumber) {
  if (!studentNumber) return;
  for (const store of [localStorage, deviceStore()]) {
    const keys = [];
    for (let i = 0; i < store.length; i++) keys.push(store.key(i));
    for (const key of keys) {
      if (key === `ta-personal:${studentNumber}` || key?.startsWith(`ta-tools:${studentNumber}:`)) store.removeItem(key);
    }
  }
}
