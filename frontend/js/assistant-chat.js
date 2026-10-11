// ============================================================================
// Assistant conversation engine
// ----------------------------------------------------------------------------
// Turns one student message + the conversation so far into the next step:
//   { kind: "reply", reply, state }        answered on this device
//   { kind: "calc", plan, state }           a formula the student typed
//   { kind: "ai", question, state }         needs the AI input extractor
//   { kind: "chat", state }                 goes to the AI tutor (/api/chat)
// `state` is the conversation's updated topic/pending info, applied by the
// caller only if the reply is still wanted (no late responses after New chat).
//
// The AI service (/api/assistant) is single-shot: it extracts numbers for the
// grade calculator and keeps no history. Conversation memory therefore lives
// here: the course being discussed, the last intent and its numbers, the
// student's daily study time, and any open clarification. Follow-ups like
// "make that a plan for this week" or "I only have 30 minutes a day" are
// resolved locally against that memory. The only thing ever added to an AI
// request is the earlier question + clarification of that same AI exchange —
// text that was already sent — never marks, course lists or other answers.
// The AI tutor (ctx.tutor) only receives its own thread: messages the student
// sent to it and its replies — plus course marks only if the student turns on
// "Share my marks". On-device answers never go to it.
// ============================================================================

import { answer, findCourse } from "./assistant-brain.js";
import { localPlan } from "./grade-math.js";
import { courseLabel } from "./courses.js";
import { emptyState } from "./assistant-session.js";

export { emptyState };

export const STARTERS = [
  "How can I improve my lowest course?",
  "Make me a study plan for this week",
  "What do I need on my math final to get 90?",
];


/** "30 minutes a day" → 30, "an hour" → 60, "1.5 hours" → 90, else null. */
export function parseMinutes(text) {
  const t = String(text).toLowerCase();
  let m = t.match(/(\d+(?:\.\d+)?)\s*(?:min|mins|minutes?)\b/);
  if (m) return clampMinutes(Number(m[1]));
  m = t.match(/(\d+(?:\.\d+)?)\s*(?:h|hrs?|hours?)\b/);
  if (m) return clampMinutes(Number(m[1]) * 60);
  if (/\b(an|one|1) hour\b/.test(t)) return 60;
  if (/\bhalf (an )?hour\b/.test(t)) return 30;
  return null;
}
const clampMinutes = (n) => (Number.isFinite(n) && n > 0 ? Math.min(240, Math.max(5, Math.round(n))) : null);

const words = (t) => t.trim().split(/\s+/).filter(Boolean).length;
const FOLLOW = /^(what|how) about\b|^and\b|^same (for|with)\b|^what if\b|^ok(ay)?,? (what|how) about\b/i;
const PLAN_REF = /\b(make|turn|put) (that|it|this) (into )?(a )?(plan|schedule)|\b(plan|schedule) for this week\b|\bmake (that|it|this) a plan\b/i;
const GRADE_Q = /\b(need|final|exam|if i (get|got|score))\b/i;

/** The canonical question for a remembered intent, so it can be re-run. */
function canonical(meta) {
  switch (meta.intent) {
    case "required": {
      const worth = meta.assumed ? "" : ` worth ${meta.weight}%`;
      return meta.overall
        ? `what do I need on my finals to get ${meta.target} average${worth}`
        : `what do I need on the final to get ${meta.target}${worth}`;
    }
    case "whatif":
      return `if I get ${meta.score}${meta.weight ? ` worth ${meta.weight}` : ""}`;
    case "plan":
      return "make me a study plan";
    default:
      return "how can I improve";
  }
}

/** Remember what this reply was about. */
function nextState(state, reply) {
  const meta = reply.meta || null;
  const topic = { ...state.topic };
  if (meta) {
    if (meta.course) topic.course = courseLabel(meta.course);
    if (meta.intent) {
      topic.intent = meta.intent;
      const { course, ...rest } = meta;
      topic.meta = rest;
    }
    if (meta.minutes) topic.minutes = meta.minutes;
  }
  const pending = reply.ask === "course" ? { kind: "course", meta: { ...meta } } : null;
  return { topic, pending };
}

const reply = (state, r) => ({ kind: "reply", reply: r, state: nextState(state, r) });

// Study-skill questions that don't need marks. Short, practical, honest.
const SKILLS = [
  {
    re: /\b(anxi|stress|nervous|overwhelm|panic)/i,
    title: "Feeling stressed",
    text: "That's really common before tests. A few things that help:\n• Break it down: pick one small task and do just that.\n• Practise under test conditions so the real thing feels familiar.\n• Sleep matters more than one extra hour of cramming.\n• Breathe slowly for a minute before you start.\n\nIf stress feels like too much, talk to someone — your guidance counsellor, or Kids Help Phone any time (call 1-800-668-6868 or text CONNECT to 686868).",
    actions: [{ label: "Support resources", route: "guidance" }],
  },
  {
    re: /\b(procrastinat|motivat|can'?t focus|distract|lazy)/i,
    title: "Getting started",
    text: "Make starting tiny:\n• Set a 10-minute timer and do just one question.\n• Phone in another room (not just face-down).\n• Same time, same place each day — it becomes routine.\n• Write tomorrow's first task before you stop today.",
  },
  {
    re: /\b(memori[sz]e|remember|flashcards?|vocab)/i,
    title: "Remembering more",
    text: "• Test yourself instead of rereading — cover your notes and recall.\n• Space it out: review after 1 day, 3 days, then a week.\n• Explain it out loud as if teaching a friend.\n• Use flashcards for terms, formulas and vocab.",
  },
  {
    re: /\bhow (do|should|can) i study\b|\bstudy (tips|habits|techniques)\b|\bstudy for (a|my|the) (test|exam|quiz)\b/i,
    title: "Studying for a test",
    text: "• Start 5–7 days out, not the night before.\n• Do old test and practice questions — they show you the format.\n• Mark what you got wrong and redo those until they're easy.\n• Finish with a one-page summary of each unit.\n\nTell me the course and I'll build a plan from your marks.",
  },
  {
    re: /\b(time management|balance|too busy|practice after school|sports and school)\b/i,
    title: "Fitting it all in",
    text: "• Use short, fixed blocks (20–30 min) on busy days.\n• Do the hardest subject first while you're fresh.\n• Use weekends for one longer review.\n• Tell me how much time you have each day and I'll size a plan to it.",
  },
];

const GREETING = /^(hi|hey|hello|yo|sup|good (morning|afternoon|evening))\b[\s!.?]*$/i;
const THANKS = /^(thanks|thank you|thx|ty|ok(ay)?|cool|got it|nice)\b[\s!.?]*$/i;
const CONCEPT = /^(what is|what are|what's|whats|explain|how does|how do|why does|why do|define|meaning of|who was|who is)\b/i;
const MATHY = /\d|\b(sqrt|average|weighted|percent|grade|mark|score)\b/i;

/**
 * Work out the next step for `text`.
 * ctx = { courses, school, ossd, volunteerHours, demo }
 */
export function respond(text, state = emptyState(), ctx = {}) {
  const t = String(text || "").trim();
  const courses = ctx.courses || [];
  const base = { courses, school: ctx.school, ossd: ctx.ossd, volunteerHours: ctx.volunteerHours };
  const topicCourse = state.topic.course ? courses.find((c) => courseLabel(c) === state.topic.course) || null : null;
  const minutes = state.topic.minutes || undefined;
  const brain = (q, extra = {}) => answer(q, { ...base, defaultCourse: topicCourse, minutes, ...extra });
  const named = findCourse(t, courses);

  // A. Answering "Which course?": re-run the original question for that course.
  if (state.pending?.kind === "course" && named && words(t) <= 6) {
    const meta = state.pending.meta || {};
    const r = meta.intent === "required" || meta.intent === "whatif"
      ? brain(canonical(meta), { forceCourse: named })
      : brain(meta.question || "how can I improve", { forceCourse: named });
    if (r) return reply(state, r);
  }

  // B. A time budget ("I only have 30 minutes a day") reshapes the plan.
  const mins = parseMinutes(t);
  if (mins && !GRADE_Q.test(t)) {
    const course = named || (["plan", "improve", "required", "whatif", "marks", "course"].includes(state.topic.intent) ? topicCourse : null);
    const r = answer("make me a study plan", { ...base, forceCourse: course, defaultCourse: null, minutes: mins, forcePlan: true });
    if (r) {
      r.meta = { ...r.meta, minutes: mins };
      r.text = `Got it — ${mins} minutes a day. Here's a plan that fits:\n\n` + r.text;
      return reply(state, r);
    }
  }

  // C. "What if the final is worth 20%?" — change the weight, keep the rest.
  const worth = t.match(/\b(?:worth|weighted?|counts? for)\s*(\d+(?:\.\d+)?)\s*%?/i);
  if (worth && state.topic.intent === "required" && !named && !/\bneed|get\b/i.test(t)) {
    const r = brain(canonical({ ...state.topic.meta, weight: Number(worth[1]), assumed: false }), { forceCourse: topicCourse });
    if (r) return reply(state, r);
  }

  // D. "What about English?" / "What about 85?" — same question, one change.
  if (FOLLOW.test(t) && state.topic.intent && !/\bif i (get|got|score)/i.test(t)) {
    if (named && ["required", "whatif", "improve", "plan"].includes(state.topic.intent)) {
      const r = brain(canonical(state.topic.meta), { forceCourse: named, forcePlan: state.topic.intent === "plan" });
      if (r) return reply(state, r);
    }
    const n = t.replace(/\b[a-z]{3}\d[a-z]\w*/gi, " ").match(/(\d+(?:\.\d+)?)/);
    if (!named && n && Number(n[1]) <= 100) {
      const meta = state.topic.intent === "required" ? { ...state.topic.meta, target: Number(n[1]) }
        : state.topic.intent === "whatif" ? { ...state.topic.meta, score: Number(n[1]) } : null;
      if (meta) {
        const r = brain(canonical(meta), { forceCourse: topicCourse });
        if (r) return reply(state, r);
      }
    }
  }

  // E. "Make that a plan for this week" — a plan for what we were discussing.
  if (PLAN_REF.test(t) && !named) {
    const r = brain("make me a study plan", { forceCourse: topicCourse, forcePlan: true });
    if (r) return reply(state, r);
  }

  // F. Everything else: the on-device brain, with the conversation's course
  //    as a default when the question names none.
  const r = brain(t);
  if (r) return reply(state, r);

  const cleared = { ...state, pending: state.pending?.kind === "ai" ? state.pending : null };

  if (GREETING.test(t)) return reply(cleared, { title: "Hey! 👋", text: "I can help with your marks, study plans, school info and graduation. What's on your mind?", suggestions: STARTERS });
  if (THANKS.test(t)) return reply(cleared, { title: "Anytime", text: "Good luck — you've got this. Ask me anything else whenever.", suggestions: ["Make me a study plan for this week", "What's my lowest course?"] });

  // Canned study tips only when there is no AI tutor; with one, the tutor
  // gives a fuller answer to the same question.
  const skill = !ctx.tutor && SKILLS.find((s) => s.re.test(t));
  if (skill) return reply(cleared, { title: skill.title, badge: "Study tips", text: skill.text, actions: skill.actions || [], suggestions: ["Make me a study plan for this week", "I only have 30 minutes a day"] });

  // A formula the student typed ("current 85, target 90, remaining 30").
  const plan = localPlan(t);
  if (plan) return { kind: "calc", plan, state: { ...cleared, pending: null } };

  // Replying to the AI's own clarification: resend that exchange with the answer.
  if (state.pending?.kind === "ai" && !ctx.demo) {
    const thread = state.pending.thread || [];
    const question = [...thread, `Student reply: ${t}`].join("\n").slice(-1500);
    return { kind: "ai", question, original: t, state: { ...state, pending: null } };
  }

  // Everything else goes to the AI tutor when this site has one.
  if (ctx.tutor) return { kind: "chat", state: cleared };

  if (CONCEPT.test(t) && !MATHY.test(t)) {
    return reply(cleared, {
      title: "That one's outside what I can do",
      badge: "Limitation",
      text: "I can't explain school topics yet — I work with your marks, study plans, school info, graduation and grade math.\n\nFor explanations, try TVO Learn (free, Ontario curriculum) or bring the question to your teacher's extra help.",
      actions: [{ label: "Open resources", route: "guidance" }],
      suggestions: ["How do I study for a test?", "Make me a study plan for this week"],
    });
  }

  if (MATHY.test(t)) {
    if (ctx.demo) {
      return reply(cleared, {
        title: "Not in the demo",
        badge: "Limitation",
        text: "The demo doesn't use the AI service. Try a full formula like \"current 85, target 90, remaining 30\", or open the quick calculator.",
        suggestions: ["current 85, target 90, remaining 30", "What do I need on my math final to get 90?"],
      });
    }
    return { kind: "ai", question: t.slice(0, 1500), original: t, state: cleared };
  }

  return reply(cleared, {
    title: "I didn't catch that",
    text: "I'm best with your marks, finals, study plans, school info, credits and volunteer hours. Try one of these:",
    suggestions: [...STARTERS.slice(0, 2), "How many credits do I still need?"],
  });
}

/** Remember an AI clarification so the student's next reply continues it. */
export function aiClarification(state, question, clarification) {
  const asked = /^Earlier question:/.test(question) ? question : `Earlier question: ${question}`;
  const thread = [asked, `Assistant asked: ${clarification}`];
  return { ...state, pending: { kind: "ai", thread } };
}
