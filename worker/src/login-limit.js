// Sign-in attempt limits, so this site can't be used to guess a student's
// TeachAssist password. Only wrong-password answers count, in hourly buckets:
//   • per student number — protects each account wherever guesses come from
//   • per network address — slows one source trying many student numbers
//     (set high because a whole school can share one address)
// Counts live in the CHAT_LIMITS KV namespace (a per-isolate Map without it).
// Student numbers are stored only as a one-way hash.
export const MAX_FAILS_PER_STUDENT = 10;
export const MAX_FAILS_PER_ADDRESS = 100;
const HOUR = 3600000;

const memory = new Map();
const hex = (bytes) => Array.from(new Uint8Array(bytes), (n) => n.toString(16).padStart(2, '0')).join('');

async function keys(username, address, now) {
  const bucket = Math.floor(now / HOUR);
  const id = hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`login:${username}`))).slice(0, 24);
  return [
    [`login:s:${bucket}:${id}`, MAX_FAILS_PER_STUDENT],
    ...(address ? [[`login:a:${bucket}:${address}`, MAX_FAILS_PER_ADDRESS]] : []),
  ];
}
async function read(kv, key) {
  return kv ? Number(await kv.get(key)) || 0 : memory.get(key) || 0;
}

/** True once this student number or address has used up this hour's wrong-password attempts. */
export async function loginBlocked(kv, username, address, now = Date.now()) {
  for (const [key, max] of await keys(username, address, now)) if (await read(kv, key) >= max) return true;
  return false;
}

/** Count one wrong password against the student number and the address. */
export async function recordLoginFailure(kv, username, address, now = Date.now()) {
  for (const [key] of await keys(username, address, now)) {
    const next = (await read(kv, key)) + 1;
    if (kv) await kv.put(key, String(next), { expirationTtl: 7200 });
    else {
      if (memory.size > 5000) memory.clear();
      memory.set(key, next);
    }
  }
}
