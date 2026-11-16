import assert from "node:assert";
import { cleanChat, geminiRequest, replyText, isCrisis, torontoDay } from "../src/chat.js";

// Only user/assistant text, last 12, ending on the student's question.
const c = cleanChat({ messages: [{ role: "user", text: " hi " }, { role: "assistant", text: "Hello" }, { role: "user", text: "What is a mole?" }], marks: [{ name: "Chemistry", mark: 84.36 }, { name: "", mark: 9 }] });
assert.strictEqual(c.messages.length, 3);
assert.strictEqual(c.messages[0].text, "hi");
assert.deepStrictEqual(c.marks, [{ name: "Chemistry", mark: 84.4 }]);
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
