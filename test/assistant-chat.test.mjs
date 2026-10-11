import assert from "node:assert/strict";
import { test, beforeEach } from "node:test";

const local = new Map();
const session = new Map();
const store = (m) => ({ getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), clear: () => m.clear() });
globalThis.localStorage = store(local);
globalThis.sessionStorage = store(session);

const { respond, emptyState, parseMinutes, aiClarification } = await import("../frontend/js/assistant-chat.js");
const { conversation, saveConversation, resetConversation } = await import("../frontend/js/assistant-session.js");
const { DEMO_COURSES } = await import("../frontend/js/demo-data.js");
const { ossdProgress } = await import("../frontend/js/ossd.js");

const ctx = { courses: DEMO_COURSES, ossd: ossdProgress(DEMO_COURSES), volunteerHours: 0, demo: false };
function chat(lines, c = ctx) {
  let state = emptyState();
  return lines.map((line) => {
    const step = respond(line, state, c);
    state = step.state;
    return step;
  });
}

beforeEach(() => { local.clear(); session.clear(); });

test("follow-ups continue one conversation instead of starting over", () => {
  const [improve, plan, budget] = chat(["How can I improve in Science?", "Make that a plan for this week", "I only have 30 minutes a day"]);
  assert.match(improve.reply.title, /Science/);
  assert.match(plan.reply.title, /Study plan · Science/);
  assert.match(budget.reply.text, /30 minutes a day/);
  assert.match(budget.reply.text, /Mon: Science — 30 min/);
  assert.ok(budget.reply.suggestions.length > 0);
});

test("missing course triggers one clarification, and the reply resumes the question", () => {
  const [ask, answer, weight, target] = chat(["What do I need on the final to get 90?", "math", "What if the final is worth 20%?", "What about 85?"]);
  assert.equal(ask.reply.ask, "course");
  assert.match(answer.reply.text, /Mathematics with 90\.0%.*remaining 30%/s);
  assert.match(answer.reply.text, /assumed finals are worth 30%/);
  assert.match(weight.reply.text, /remaining 20%/);
  assert.match(target.reply.text, /Mathematics with 85\.0%.*remaining 20%/s);
});

test("estimates and limits are labelled honestly", () => {
  const [credits] = chat(["How many credits do I still need?"]);
  assert.match(credits.reply.badge, /not official/);
  assert.match(credits.reply.text, /only count once you pass/);
  const [concept] = chat(["What is photosynthesis?"]);
  assert.match(concept.reply.text, /can't explain school topics/);
  const [demoMath] = chat(["what is 5 percent of 80"], { ...ctx, demo: true });
  assert.equal(demoMath.kind, "reply");
});

test("only typed text from the same AI exchange is ever sent to AI", () => {
  const [first] = chat(["what's 15% of my 80 grade plus 4"]);
  assert.equal(first.kind, "ai");
  assert.doesNotMatch(first.question, /88\.4|93\.4|ENL1W|Science/);
  const state = aiClarification(first.state, first.question, "What is the remaining weight?");
  const next = respond("30 percent", state, ctx);
  assert.equal(next.kind, "ai");
  assert.match(next.question, /^Earlier question: .*\nAssistant asked: .*\nStudent reply: 30 percent$/s);
  assert.ok(next.question.length <= 1500);
});

test("typed formulas stay on the local calculator", () => {
  const [step] = chat(["current 85, target 90, remaining 30"]);
  assert.equal(step.kind, "calc");
  assert.deepEqual(step.plan, { kind: "required", current: 85, target: 90, remaining: 30 });
});

test("study time parsing", () => {
  assert.equal(parseMinutes("I only have 30 minutes a day"), 30);
  assert.equal(parseMinutes("about an hour"), 60);
  assert.equal(parseMinutes("1.5 hours"), 90);
  assert.equal(parseMinutes("no time info"), null);
});

test("conversations are session-only and separate for each account", () => {
  local.set("ta_student_number", "111");
  const a = conversation();
  a.messages.push({ id: "1", role: "user", text: "student A secret", status: "done" });
  saveConversation(a);
  local.set("ta_student_number", "222");
  assert.equal(conversation().messages.length, 0);
  local.set("ta_demo_mode", "1");
  assert.equal(conversation().messages.length, 0);
  local.delete("ta_demo_mode");
  local.set("ta_student_number", "111");
  assert.equal(conversation().messages[0].text, "student A secret");
  assert.ok(session.has("ta-chat:111"));
  assert.ok(![...local.keys()].some((k) => k.startsWith("ta-chat")), "never written to localStorage");
  resetConversation();
  assert.equal(conversation().messages.length, 0);
  assert.ok(!session.has("ta-chat:111"));
});

test("with the AI tutor, open questions go to it but marks questions stay on the device", () => {
  const tutor = { ...ctx, tutor: true };
  const [concept] = chat(["What is photosynthesis?"], tutor);
  assert.equal(concept.kind, "chat");
  const [marks, plan, follow] = chat(["How can I improve in Science?", "Make that a plan for this week", "Can you explain that more simply?"], tutor);
  assert.equal(marks.kind, "reply");
  assert.equal(plan.kind, "reply");
  assert.equal(follow.kind, "chat");
  const [calc] = chat(["current 85, target 90, remaining 30"], tutor);
  assert.equal(calc.kind, "calc", "grade maths stays deterministic");
  const [demo] = chat(["What is photosynthesis?"], { ...ctx, tutor: false, demo: true });
  assert.equal(demo.kind, "reply");
});
