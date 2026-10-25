// A sealed credential ("locked box") so a student's phone never stores their
// TeachAssist password. The Worker seals the password with AES-GCM under a key
// derived from VAULT_SECRET (or API_KEY) and hands the phone only the sealed
// box; on refresh it opens the box, signs in, and forgets the password again.
//
// The box is bound to the student number (AES-GCM additional data), so one
// student's box can't be used with another number. It expires after
// CRED_TTL_DAYS without use, and never lives past CRED_MAX_DAYS from the last
// time the student typed their password (refreshes carry that date forward).
// Each box also carries a login id, kept across refreshes, so signing out can
// cancel every copy of that login (see /api/signout).
// Boxes open with any key in the list given, so a new VAULT_SECRET doesn't
// sign anyone out; removing a key makes its boxes unopenable.
const encoder = new TextEncoder();
const decoder = new TextDecoder();
export const CRED_TTL_DAYS = 90;
export const CRED_MAX_DAYS = 180;
const VERSION = 'v1';

const b64url = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64url = (text) => Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
const LOGIN_ID = /^[a-f0-9]{24}$/;
/** A fresh random login id (24 hex characters). */
export const newLoginId = () => Array.from(crypto.getRandomValues(new Uint8Array(12)), (n) => n.toString(16).padStart(2, '0')).join('');
const keyList = (secrets) => (Array.isArray(secrets) ? secrets : [secrets]).filter(Boolean);

async function vaultKey(secret) {
  const base = await crypto.subtle.importKey('raw', encoder.encode(secret), 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: encoder.encode('teachassist-vault'), info: encoder.encode('student-credential-v1') },
    base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'],
  );
}

/**
 * Seal a password for one student number. Returns '' without a secret.
 * `signedInAt` (ms) is when the password was last typed and `loginId` names
 * this login; a refresh passes both from the box it opened, so the 180-day
 * limit can't be extended and sign-out can cancel every copy.
 */
export async function sealCredential(secret, studentNumber, password, now = Date.now(), signedInAt = now, loginId = '') {
  if (!secret || !studentNumber || !password) return '';
  const id = LOGIN_ID.test(loginId || '') ? loginId : newLoginId();
  const issued = Math.floor(Math.min(signedInAt, now) / 1000);
  const expires = Math.min(Math.floor(now / 1000) + CRED_TTL_DAYS * 86400, issued + CRED_MAX_DAYS * 86400);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: encoder.encode(`${VERSION}:${studentNumber}`) },
    await vaultKey(secret), encoder.encode(JSON.stringify({ p: password, e: expires, i: issued, l: id })),
  );
  return `${VERSION}.${b64url(iv)}.${b64url(data)}`;
}

/** The password inside a box, or null when it is forged, for another student, or expired. */
export async function openCredential(secret, studentNumber, box, now = Date.now()) {
  return (await openCredentialBox(secret, studentNumber, box, now))?.password ?? null;
}

/**
 * { password, signedInAt (ms), loginId } from a box, or null (see
 * openCredential). `secrets` is one key or a list to try in order. Boxes from
 * before login ids have loginId ''.
 */
export async function openCredentialBox(secrets, studentNumber, box, now = Date.now()) {
  const keys = keyList(secrets);
  if (!keys.length || !studentNumber || typeof box !== 'string' || box.length > 2048) return null;
  const parts = box.split('.');
  if (parts.length !== 3 || parts[0] !== VERSION) return null;
  for (const secret of keys) {
    let plain;
    try {
      plain = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: unb64url(parts[1]), additionalData: encoder.encode(`${VERSION}:${studentNumber}`) },
        await vaultKey(secret), unb64url(parts[2]),
      );
    } catch { continue; } // not this key (or not a genuine box)
    try {
      const { p, e, i, l } = JSON.parse(decoder.decode(plain));
      const nowS = Math.floor(now / 1000);
      // Boxes sealed before `i` existed count from when they were sealed.
      const issued = Number.isFinite(i) ? i : e - CRED_TTL_DAYS * 86400;
      if (typeof p !== 'string' || !p || !(e > nowS) || !(issued + CRED_MAX_DAYS * 86400 > nowS)) return null;
      return { password: p, signedInAt: issued * 1000, loginId: LOGIN_ID.test(l || '') ? l : '' };
    } catch { return null; }
  }
  return null;
}

/** Whether this login was signed out (its id is on the revoked list). */
export async function loginRevoked(kv, loginId) {
  return !!(kv && loginId && await kv.get(`revoked:${loginId}`));
}

/** Put a login on the revoked list for as long as any of its boxes could live. */
export async function revokeLogin(kv, loginId) {
  if (kv && LOGIN_ID.test(loginId || '')) await kv.put(`revoked:${loginId}`, '1', { expirationTtl: (CRED_MAX_DAYS + 1) * 86400 });
}
