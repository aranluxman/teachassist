// A short-lived, signed capability for the grade assistant. Never contains credentials.
const encoder = new TextEncoder();
const hex = bytes => Array.from(new Uint8Array(bytes), n => n.toString(16).padStart(2, '0')).join('');
async function key(secret) {
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}
export async function issueSession(secret, now = Date.now()) {
  if (!secret) return '';
  const payload = `${Math.floor(now / 1000) + 3600}.${crypto.randomUUID()}`;
  return `${payload}.${hex(await crypto.subtle.sign('HMAC', await key(secret), encoder.encode(payload)))}`;
}
export async function verifySession(token, secret, now = Date.now()) {
  if (!secret || typeof token !== 'string') return false;
  const parts = token.match(/^(\d+)\.([a-f0-9-]{36})\.([a-f0-9]{64})$/);
  if (!parts || +parts[1] <= Math.floor(now / 1000)) return false;
  const signature = Uint8Array.from(parts[3].match(/../g), h => parseInt(h, 16));
  return crypto.subtle.verify('HMAC', await key(secret), signature, encoder.encode(`${parts[1]}.${parts[2]}`));
}
