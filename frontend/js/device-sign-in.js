// A WebAuthn PRF supplies the key to unwrap the browser's private key. The
// matching public key can re-encrypt refreshed Worker credentials without
// retaining the PRF output or invoking the passkey again in an unlocked tab.
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const RSA = { name: "RSA-OAEP", hash: "SHA-256" };
const AES = { name: "AES-GCM", length: 256 };
const TIMEOUT = 60000;
const random = (length) => crypto.getRandomValues(new Uint8Array(length));
const encode = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes)))
  .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const decode = (text) => Uint8Array.from(atob(text.replace(/-/g, "+").replace(/_/g, "/")), char => char.charCodeAt(0));

export async function deviceVerificationAvailable() {
  try {
    return !!(globalThis.isSecureContext && globalThis.crypto?.subtle &&
      await globalThis.PublicKeyCredential?.isUserVerifyingPlatformAuthenticatorAvailable?.());
  } catch {
    return false;
  }
}

export function deviceVerificationError(error) {
  if (error?.name === "NotAllowedError" || error?.name === "AbortError") {
    return "Device verification was cancelled or unavailable.";
  }
  if (error?.code === "TA_DEVICE_UNSUPPORTED") return error.message;
  return "Couldn’t complete device verification.";
}

function unavailable() {
  return Object.assign(new Error("This browser or passkey doesn’t support encrypted device sign-in."), { code: "TA_DEVICE_UNSUPPORTED" });
}

async function authenticate(id, salt) {
  const credential = await navigator.credentials.get({ publicKey: {
    challenge: random(32),
    allowCredentials: [{ type: "public-key", id: decode(id), transports: ["internal"] }],
    userVerification: "required",
    timeout: TIMEOUT,
    extensions: { prf: { eval: { first: salt } } },
  } });
  if (!credential || encode(credential.rawId) !== id) throw unavailable();
  return credential.getClientExtensionResults().prf?.results?.first;
}

async function importPasskeyKey(result) {
  if (result?.byteLength !== 32) throw unavailable();
  const bytes = new Uint8Array(result);
  try {
    return await crypto.subtle.importKey("raw", bytes, AES, false, ["wrapKey", "unwrapKey"]);
  } finally {
    bytes.fill(0);
  }
}

function cipher(record, purpose, iv) {
  const additionalData = encoder.encode(JSON.stringify(["teachassist-device-sign-in", record.version, record.student, record.id, purpose]));
  return { name: AES.name, iv, additionalData };
}

export async function createDeviceSignIn(student, serverCred) {
  const salt = random(32);
  const registration = await navigator.credentials.create({ publicKey: {
    challenge: random(32),
    rp: { name: "TeachAssist Dashboard" },
    user: { id: random(32), name: "TeachAssist sign-in", displayName: "TeachAssist sign-in" },
    pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
    authenticatorSelection: { authenticatorAttachment: "platform", residentKey: "required", userVerification: "required" },
    attestation: "none",
    timeout: TIMEOUT,
    extensions: { prf: { eval: { first: salt } } },
  } });
  const prf = registration?.getClientExtensionResults().prf;
  if (!prf?.enabled) throw unavailable();
  const id = encode(registration.rawId);
  const result = prf.results?.first ?? await authenticate(id, salt);
  const passkey = await importPasskeyKey(result);
  const { publicKey, privateKey } = await crypto.subtle.generateKey({
    ...RSA, modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]),
  }, true, ["wrapKey", "unwrapKey"]);
  const record = { version: 1, student, id, generation: crypto.randomUUID(), salt: encode(salt) };
  const privateIv = random(12);
  record.publicKey = encode(await crypto.subtle.exportKey("spki", publicKey));
  record.privateIv = encode(privateIv);
  record.privateKey = encode(await crypto.subtle.wrapKey("pkcs8", privateKey, passkey, cipher(record, "private-key", privateIv)));
  return { ...record, box: await encryptDeviceCredential(record, serverCred) };
}

export async function encryptDeviceCredential(record, serverCred) {
  const publicKey = await crypto.subtle.importKey("spki", decode(record.publicKey), RSA, false, ["wrapKey"]);
  const boxKey = await crypto.subtle.generateKey(AES, true, ["encrypt"]);
  const iv = random(12);
  const key = await crypto.subtle.wrapKey("raw", boxKey, publicKey, RSA.name);
  const data = await crypto.subtle.encrypt(cipher(record, "server-credential", iv), boxKey, encoder.encode(serverCred));
  return { key: encode(key), iv: encode(iv), data: encode(data) };
}

export async function unlockDeviceCredential(record) {
  const passkey = await importPasskeyKey(await authenticate(record.id, decode(record.salt)));
  const privateKey = await crypto.subtle.unwrapKey(
    "pkcs8", decode(record.privateKey), passkey, cipher(record, "private-key", decode(record.privateIv)), RSA, false, ["unwrapKey"],
  );
  const boxKey = await crypto.subtle.unwrapKey("raw", decode(record.box.key), privateKey, RSA.name, AES, false, ["decrypt"]);
  const data = await crypto.subtle.decrypt(cipher(record, "server-credential", decode(record.box.iv)), boxKey, decode(record.box.data));
  return decoder.decode(data);
}
