// Personal tools stay in this browser, separated by account and demo mode.
export function accountKey() {
  return localStorage.getItem('ta_demo_mode') === '1' ? 'demo' : localStorage.getItem('ta_student_number') || 'guest';
}
export function readStudentData(name, fallback) {
  try { return JSON.parse(localStorage.getItem(`ta-tools:${accountKey()}:${name}`)) ?? fallback; }
  catch { return fallback; }
}
export function writeStudentData(name, value) {
  localStorage.setItem(`ta-tools:${accountKey()}:${name}`, JSON.stringify(value));
}
