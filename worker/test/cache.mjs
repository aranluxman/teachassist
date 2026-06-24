// Tests for the daily-cache feature:
//   A) storeMarks() writes the right `latest` + `snapshot:DAY` shapes (Node,
//      with an in-memory KV stub — no HTMLRewriter needed).
//   B) GET /api/cached enforces the API key and serves the cached payload
//      (real src/index.js under Miniflare/workerd, KV seeded directly).
import assert from "node:assert";
import { storeMarks, overallOf, marksOf } from "../src/index.js";

// ── A) storeMarks shape ─────────────────────────────────────────────────────
{
  const store = new Map();
  const env = {
    MARKS: {
      async put(k, v) { store.set(k, v); },
      async get(k, type) { const v = store.get(k); return v == null ? null : type === "json" ? JSON.parse(v) : v; },
    },
  };
  const out = [
    { code: "ENG4U", name: "English", currentMark: 90, midterm: null, evaluations: [] },
    { code: "MHF4U", name: "Advanced Functions", currentMark: null, midterm: 80, evaluations: [] },
    { code: "SCH4U", name: "Chemistry", currentMark: null, midterm: null, evaluations: [] },
  ];

  assert.strictEqual(overallOf(out), 85, "overall = mean(90, 80) ignoring the null course");
  assert.deepStrictEqual(marksOf(out), { ENG4U: 90, MHF4U: 80, SCH4U: null }, "per-course marks map");

  await storeMarks(env, null, out); // ctx=null -> await the writes

  const latest = JSON.parse(store.get("latest"));
  assert.ok(typeof latest.scrapedAt === "string", "latest.scrapedAt is set");
  assert.strictEqual(latest.courses.length, 3, "latest carries all courses");
  assert.strictEqual(latest.courses[0].code, "ENG4U", "latest preserves course shape");

  const day = latest.scrapedAt.slice(0, 10);
  const snap = JSON.parse(store.get(`snapshot:${day}`));
  assert.strictEqual(snap.overall, 85, "snapshot overall");
  assert.deepStrictEqual(snap.marks, { ENG4U: 90, MHF4U: 80, SCH4U: null }, "snapshot marks");

  // No KV binding -> no throw, no write.
  assert.doesNotThrow(() => storeMarks({}, null, out), "missing KV binding is a no-op");
  console.log("storeMarks shape assertions passed.");
}

// ── B) /api/cached route under Miniflare ────────────────────────────────────
const { build } = await import("esbuild");
const { Miniflare } = await import("miniflare");

const bundle = await build({
  entryPoints: ["src/index.js"],
  bundle: true,
  format: "esm",
  write: false,
  platform: "browser",
  conditions: ["worker", "browser"],
});

const mf = new Miniflare({
  modules: true,
  script: bundle.outputFiles[0].text,
  compatibilityDate: "2025-09-01",
  kvNamespaces: { MARKS: "marks-test" },
  bindings: { API_KEY: "test-key" },
});

const base = "http://localhost";
const KEY = { headers: { "x-api-key": "test-key" } };

// Unauthorized without the key.
{
  const res = await mf.dispatchFetch(`${base}/api/cached`);
  assert.strictEqual(res.status, 401, "no key -> 401");
}

// Empty cache -> 404.
{
  const res = await mf.dispatchFetch(`${base}/api/cached`, KEY);
  assert.strictEqual(res.status, 404, "empty cache -> 404");
}

// Seed KV directly, then the route should serve it verbatim.
{
  const payload = {
    scrapedAt: "2026-06-24T11:00:00.000Z",
    courses: [
      { code: "ENG4U", name: "English", currentMark: 90, midterm: null, evaluations: [] },
      { code: "MHF4U", name: "Advanced Functions", currentMark: 94, midterm: null, evaluations: [] },
    ],
  };
  const kv = await mf.getKVNamespace("MARKS");
  await kv.put("latest", JSON.stringify(payload));

  // Still gated.
  const noKey = await mf.dispatchFetch(`${base}/api/cached`);
  assert.strictEqual(noKey.status, 401, "seeded cache still requires the key");

  const res = await mf.dispatchFetch(`${base}/api/cached`, KEY);
  assert.strictEqual(res.status, 200, "populated cache -> 200");
  assert.match(res.headers.get("access-control-allow-origin") || "", /pages\.dev/, "CORS header present");
  const body = await res.json();
  assert.strictEqual(body.scrapedAt, payload.scrapedAt, "scrapedAt round-trips");
  assert.strictEqual(body.courses.length, 2, "courses round-trip");
  assert.strictEqual(body.courses[1].currentMark, 94, "mark round-trips");

  // The ?key= query param also authorizes (for opening in a browser).
  const viaQuery = await mf.dispatchFetch(`${base}/api/cached?key=test-key`);
  assert.strictEqual(viaQuery.status, 200, "?key= authorizes too");
}

await mf.dispose();
console.log("/api/cached route assertions passed.");
console.log("\n✅ Cache feature tests passed.");
