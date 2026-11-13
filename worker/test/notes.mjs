import assert from "node:assert";
import { cleanNote, cleanNotebooks } from "../src/notes.js";

const base = { id: "note-1234abcd", title: "Cell cycle", body: "<p>hi</p>", updatedAt: "2026-11-12T10:00:00Z" };

// A good note keeps its fields; extras are trimmed to size.
const n = cleanNote({ ...base, tags: ["exam", " exam ", "", 5, "x".repeat(50)], favorite: true, notebook: "bio" });
assert.deepStrictEqual(n.tags, ["exam", "x".repeat(30)]);
assert.strictEqual(n.favorite, true);
assert.strictEqual(n.notebook, "bio");
assert.strictEqual(n.createdAt, "2026-11-12T10:00:00.000Z");

// Bad ids, missing or far-future times and oversized bodies are refused.
assert.strictEqual(cleanNote({ ...base, id: "../../etc" }), null);
assert.strictEqual(cleanNote({ ...base, updatedAt: "not a date" }), null);
assert.strictEqual(cleanNote({ ...base, updatedAt: new Date(Date.now() + 3 * 86400000).toISOString() }), null);
assert.strictEqual(cleanNote({ ...base, body: "x".repeat(200001) }), null);

// A deleted note keeps no body.
assert.strictEqual(cleanNote({ ...base, deleted: true }).body, "");

// Notebooks: a short list of id + name.
assert.deepStrictEqual(cleanNotebooks([{ id: "general", name: "General" }]), [{ id: "general", name: "General", color: "", course: "" }]);
assert.strictEqual(cleanNotebooks([{ id: "bad id!", name: "x" }]), null);
assert.strictEqual(cleanNotebooks(new Array(61).fill({ id: "a", name: "a" })), null);
assert.strictEqual(cleanNotebooks("nope"), null);

console.log("notes tests passed");
