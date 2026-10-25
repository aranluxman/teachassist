// A short-lived, signed session for the signed-in student (cloud saving uses
// it). Never contains credentials. It may carry a subject: a one-way HMAC of
// the student number (16 hex chars) that keys the student's saved data. The
// number itself is never in the token and can't be recovered from it.
const encoder = new TextEncoder();
const hex = bytes => Array.from(new Uint8Array(bytes), n => n.toString(16).padStart(2, '0')).join('');
async function key(secret) {
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}
/** Opaque, stable id for a student: HMAC(secret, student number), shortened. */
export async function subjectFor(secret, studentId) {
  if (!secret || !studentId) return '';
  return hex(await crypto.subtle.sign('HMAC', await key(secret), encoder.encode(`student:${studentId}`))).slice(0, 16);
}
export async function issueSession(secret, now = Date.now(), subject = '') {
  if (!secret) return '';
  const sub = /^[a-f0-9]{16}$/.test(subject) ? `.${subject}` : '';
  const payload = `${Math.floor(now / 1000) + 3600}.${crypto.randomUUID()}${sub}`;
  return `${payload}.${hex(await crypto.subtle.sign('HMAC', await key(secret), encoder.encode(payload)))}`;
}
/** The verified session ({ subject }) or null when missing, expired or forged. */
export async function readSession(token, secret, now = Date.now()) {
  if (!secret || typeof token !== 'string') return null;
  const parts = token.match(/^(\d+)\.([a-f0-9-]{36})(?:\.([a-f0-9]{16}))?\.([a-f0-9]{64})$/);
  if (!parts || +parts[1] <= Math.floor(now / 1000)) return null;
  const payload = `${parts[1]}.${parts[2]}${parts[3] ? `.${parts[3]}` : ''}`;
  const signature = Uint8Array.from(parts[4].match(/../g), h => parseInt(h, 16));
  const ok = await crypto.subtle.verify('HMAC', await key(secret), signature, encoder.encode(payload));
  return ok ? { subject: parts[3] || '' } : null;
}
export async function verifySession(token, secret, now = Date.now()) {
  return !!(await readSession(token, secret, now));
}
