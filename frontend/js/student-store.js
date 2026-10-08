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
export function validServerUrl(value) {
  const url = new URL(value.trim());
  if (url.username || url.password || url.search || url.hash ||
      (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))) {
    throw new Error('Use an HTTPS server URL without credentials, query parameters, or a fragment. HTTP is allowed for localhost.');
  }
  return url.href.replace(/\/+$/, '');
}
