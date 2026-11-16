import assert from "node:assert";
import { cleanChat, geminiRequest, replyText, isCrisis, torontoDay } from "../src/chat.js";

// Only user/assistant text, last 12, ending on the student's question.
const c = cleanChat({ messages: [{ role: "user", text: " hi " }, { role: "assistant", text: "Hello" }, { role: "user", text: "What is a mole?" }], marks: [{ name: "Chemistry", mark: 84.36 }, { name: "", mark: 9 }] });
assert.strictEqual(c.messages.length, 3);
assert.strictEqual(c.messages[0].text, "hi");
assert.deepStrictEqual(c.marks, [{ name: "Chemistry", mark: 84.4, items: [] }]);
assert.strictEqual(cleanChat({ messages: [{ role: "system", text: "x" }] }), null);
assert.strictEqual(cleanChat({ messages: [{ role: "user", text: "q" }, { role: "assistant", text: "a" }] }), null);
assert.strictEqual(cleanChat({ messages: [] }), null);
assert.strictEqual(cleanChat({ messages: new Array(20).fill({ role: "user", text: "x" }) }).messages.length, 12);

// Gemini shape: assistant → model; marks only in the system text when shared.
const r = geminiRequest(c);
assert.deepStrictEqual(r.contents.map((m) => m.role), ["user", "model", "user"]);
assert.match(r.systemInstruction.parts[0].text, /Chemistry: 84.4%/);
assert.doesNotMatch(geminiRequest({ ...c, marks: [] }).systemInstruction.parts[0].text, /shared/);

assert.strictEqual(replyText({ candidates: [{ content: { parts: [{ text: "A mole is " }, { text: "6.02e23." }] } }] }), "A mole is 6.02e23.");
assert.strictEqual(replyText({ promptFeedback: { blockReason: "SAFETY" } }), null);
assert.strictEqual(replyText({}), null);

assert.ok(isCrisis("i want to kill myself"));
assert.ok(isCrisis("thinking about self-harm"));
assert.ok(!isCrisis("how do cells kill bacteria"));
assert.match(torontoDay(new Date("2026-11-15T03:00:00Z")), /^2026-11-14$/);

console.log("chat tests passed");

// Models: GEMINI_MODEL first, then the 3.x defaults (2.x isn't offered to new keys).
import { modelsFor, geminiErrorMessage, DEFAULT_MODELS } from "../src/chat.js";
assert.deepStrictEqual(modelsFor({}), DEFAULT_MODELS);
assert.ok(!DEFAULT_MODELS.some((m) => m.startsWith("gemini-2")));
assert.deepStrictEqual(modelsFor({ GEMINI_MODEL: "gemini-3.8-flash" }), ["gemini-3.8-flash", "gemini-3.5-flash-lite"]);
assert.deepStrictEqual(modelsFor({ GEMINI_MODEL: "../evil" }), DEFAULT_MODELS);
// No sampling settings: Gemini 3.x rejects them.
assert.strictEqual(geminiRequest(c).generationConfig.temperature, undefined);
assert.match(geminiErrorMessage(400, { error: { message: "API key not valid. Please pass a valid API key." } }), /not valid/);
assert.match(geminiErrorMessage(403, { error: { status: "PERMISSION_DENIED" } }), /not allowed/);
assert.match(geminiErrorMessage(500, { error: { status: "INTERNAL" } }), /Gemini 500 INTERNAL/);
assert.match(geminiErrorMessage(403, { error: { status: "PERMISSION_DENIED", message: "User location is not supported for the API use." } }), /server location/);
console.log("chat model tests passed");

// Shared assessments: only name/category/score/weight/date, newest 15, no comments.
import { cleanItems, marksText } from "../src/chat.js";
const items = cleanItems([
  ...Array.from({ length: 20 }, (_, i) => ({ name: `Quiz ${i}`, category: "K/U", percent: 70 + i, weight: 5, date: "2026-10-01" })),
  { name: "Lab\nReport", category: "Thinking", percent: 68, weight: 10, feedback: "secret teacher comment", teacher: "Mr. X" },
]);
assert.strictEqual(items.length, 15);
assert.strictEqual(items.at(-1).name, "Lab Report");
assert.ok(!JSON.stringify(items).includes("secret"), "teacher comments are dropped");
const withItems = cleanChat({ messages: [{ role: "user", text: "weakest?" }], marks: [{ name: "Biology", mark: 81, items: [{ name: "Cell Lab", category: "T", percent: 68, weight: 10 }] }] });
const sys = geminiRequest(withItems).systemInstruction.parts[0].text;
assert.match(sys, /Biology: 81%\n    • Cell Lab \[T\]: 68%, weight 10/);
assert.match(marksText([{ name: "Math", mark: null, items: [] }]), /no mark yet/);
console.log("chat assessment tests passed");
