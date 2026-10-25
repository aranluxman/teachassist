import assert from 'node:assert/strict';
import { sealCredential, openCredential, openCredentialBox, CRED_TTL_DAYS, CRED_MAX_DAYS } from '../src/vault.js';

const now = Date.UTC(2026, 9, 22);
const box = await sealCredential('secret-a', '123456789', 'hunter2', now);
assert.match(box, /^v1\.[\w-]+\.[\w-]+$/, 'box is an opaque v1 token');
assert.ok(!box.includes('hunter2'), 'box does not contain the password');
assert.equal(await openCredential('secret-a', '123456789', box, now), 'hunter2', 'the server opens its own box');
assert.notEqual(await sealCredential('secret-a', '123456789', 'hunter2', now), box, 'each box is different (random IV)');
assert.equal(await openCredential('secret-a', '987654321', box, now), null, "another student's number can't open it");
assert.equal(await openCredential('secret-b', '123456789', box, now), null, 'a different API_KEY cannot open it');
assert.equal(await openCredential('secret-a', '123456789', box, now + (CRED_TTL_DAYS * 86400 + 1) * 1000), null, 'expired boxes do not open');
const tampered = box.slice(0, -2) + (box.endsWith('A') ? 'B' : 'A') + box.slice(-1);
assert.equal(await openCredential('secret-a', '123456789', tampered, now), null, 'a changed box does not open');
for (const bad of ['', 'garbage', 'v2.a.b', null, 'v1.!!.!!']) assert.equal(await openCredential('secret-a', '123456789', bad, now), null);
assert.equal(await sealCredential('', '123456789', 'x', now), '', 'no secret, no box');

// Refreshing every day can't keep a box alive past 180 days from the last typed password.
const DAY = 86400000;
let rolling = box;
for (let day = 30; day < CRED_MAX_DAYS; day += 30) {
  const opened = await openCredentialBox('secret-a', '123456789', rolling, now + day * DAY);
  assert.equal(opened.password, 'hunter2', `still opens on day ${day}`);
  assert.equal(opened.signedInAt, now, 'the first sign-in date is carried forward');
  rolling = await sealCredential('secret-a', '123456789', opened.password, now + day * DAY, opened.signedInAt);
}
assert.equal(await openCredential('secret-a', '123456789', rolling, now + (CRED_MAX_DAYS - 1) * DAY), 'hunter2', 'day 179 still opens');
assert.equal(await openCredential('secret-a', '123456789', rolling, now + CRED_MAX_DAYS * DAY), null, 'day 180 needs the password again');
// A box from before the 180-day field opens, counting from when it was sealed.
const enc = new TextEncoder();
const base = await crypto.subtle.importKey('raw', enc.encode('secret-a'), 'HKDF', false, ['deriveKey']);
const key = await crypto.subtle.deriveKey({ name: 'HKDF', hash: 'SHA-256', salt: enc.encode('teachassist-vault'), info: enc.encode('student-credential-v1') }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
const iv = new Uint8Array(12);
const b64 = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const oldData = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode('v1:123456789') }, key,
  enc.encode(JSON.stringify({ p: 'hunter2', e: Math.floor(now / 1000) + CRED_TTL_DAYS * 86400 })));
const oldBox = `v1.${b64(iv)}.${b64(oldData)}`;
const oldOpened = await openCredentialBox('secret-a', '123456789', oldBox, now + DAY);
assert.equal(oldOpened.password, 'hunter2', 'old boxes still open');
assert.equal(oldOpened.signedInAt, now, 'old boxes count from when they were sealed');

// Login ids: made on first seal, kept when passed back in, '' for old boxes.
const fresh = await openCredentialBox('secret-a', '123456789', box, now);
assert.match(fresh.loginId, /^[a-f0-9]{24}$/, 'every new box has a login id');
const kept = await sealCredential('secret-a', '123456789', 'hunter2', now, now, fresh.loginId);
assert.equal((await openCredentialBox('secret-a', '123456789', kept, now)).loginId, fresh.loginId, 'a refresh keeps the id');
assert.equal(oldOpened.loginId, '', 'boxes from before login ids have none');
// Several keys: any of them opens a box; the first one seals.
assert.equal(await openCredential(['new-key', 'secret-a'], '123456789', box, now), 'hunter2', 'an old key in the list still opens');
assert.equal(await openCredential(['new-key'], '123456789', box, now), null, 'a box opens only with its own key');
console.log('vault: ok');
