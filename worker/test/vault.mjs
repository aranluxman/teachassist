import assert from 'node:assert/strict';
import { sealCredential, openCredential, CRED_TTL_DAYS } from '../src/vault.js';

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
console.log('vault: ok');
