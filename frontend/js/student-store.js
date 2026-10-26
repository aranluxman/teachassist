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
/** Remove everything this browser keeps for one student (settings, goals, history, profile). */
export function forgetStudentData(studentNumber) {
  if (!studentNumber) return;
  const keys = [];
  for (let i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i));
  for (const key of keys) {
    if (key === `ta-personal:${studentNumber}` || key?.startsWith(`ta-tools:${studentNumber}:`)) localStorage.removeItem(key);
  }
}
