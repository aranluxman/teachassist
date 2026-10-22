// A sealed credential ("locked box") so a student's phone never stores their
// TeachAssist password. The Worker seals the password with AES-GCM under a key
// derived from API_KEY and hands the phone only the sealed box; on refresh it
// opens the box, signs in, and forgets the password again.
//
// The box is bound to the student number (AES-GCM additional data), so one
// student's box can't be used with another number, and it carries its own
// expiry. Changing API_KEY makes every box unopenable (students sign in again).
const encoder = new TextEncoder();
const decoder = new TextDecoder();
export const CRED_TTL_DAYS = 90;
const VERSION = 'v1';

const b64url = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64url = (text) => Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));

async function vaultKey(secret) {
  const base = await crypto.subtle.importKey('raw', encoder.encode(secret), 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: encoder.encode('teachassist-vault'), info: encoder.encode('student-credential-v1') },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'],
  );
}

/** Seal a password for one student number. Returns '' without a secret. */
export async function sealCredential(secret, studentNumber, password, now = Date.now()) {
  if (!secret || !studentNumber || !password) return '';
  const expires = Math.floor(now / 1000) + CRED_TTL_DAYS * 86400;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: encoder.encode(`${VERSION}:${studentNumber}`) },
    await vaultKey(secret), encoder.encode(JSON.stringify({ p: password, e: expires })),
  );
  return `${VERSION}.${b64url(iv)}.${b64url(data)}`;
}

/** The password inside a box, or null when it is forged, for another student, or expired. */
export async function openCredential(secret, studentNumber, box, now = Date.now()) {
  if (!secret || !studentNumber || typeof box !== 'string' || box.length > 2048) return null;
  const parts = box.split('.');
  if (parts.length !== 3 || parts[0] !== VERSION) return null;
  try {
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: unb64url(parts[1]), additionalData: encoder.encode(`${VERSION}:${studentNumber}`) },
      await vaultKey(secret), unb64url(parts[2]),
    );
    const { p, e } = JSON.parse(decoder.decode(plain));
    if (typeof p !== 'string' || !p || !(e > Math.floor(now / 1000))) return null;
    return p;
  } catch {
    return null;
  }
}
