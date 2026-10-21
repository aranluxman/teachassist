// ============================================================================
// Assistant brain — answers questions from the student's own data, locally.
// ----------------------------------------------------------------------------
// Pure function: answer(question, context) → reply | null.
//   reply = { title, text, actions, detail?, badge?, suggestions?, ask?, meta? }
// context = { courses, school, ossd, volunteerHours } plus optional
// conversation hints from assistant-chat.js:
//   forceCourse   — the course this question is definitely about
//   defaultCourse — the course the conversation is about (used only when the
//                   question names none and isn't about the overall average)
//   minutes       — the student's daily study time, for plans
//   forcePlan     — rebuild a weekly plan (e.g. after "I only have 30 min")
// Nothing leaves the device. Returns null when it doesn't recognise the
// question, so the caller can fall back to the formula parser / AI worker.
// Grade maths always goes through grade-math.js.
// ============================================================================

import { requiredGrade } from "./grade-math.js";
import { courseLabel, courseTitle } from "./courses.js";
import { courseName } from "./course-names.js";
import { strandBreakdown } from "./course-detail.js";
import { marksHidden } from "./motion.js";

const FINAL_WEIGHT = 30; // Ontario: final evaluations are usually 30% of the grade.

const ALIASES = [
  [/\bmath|maths|calc|functions\b/, (p) => p[0] === "M"],
  [/\benglish|essay|writing\b/, (p) => ["ENG", "ENL", "EWC", "ETS", "OLC", "NBE"].includes(p)],
  [/\bscience|bio|chem|physics\b/, (p) => p[0] === "S"],
  [/\bfrench\b/, (p) => p[0] === "F"],
  [/\bgeo(graphy)?\b/, (p) => p === "CGC"],
  [/\bhistory\b/, (p) => p === "CHC" || p === "CHW" || p === "CHY"],
  [/\bgym|phys(ical)? ?ed|pe\b|health\b/, (p) => p[0] === "P"],
  [/\bart|music|drama|dance\b/, (p) => p[0] === "A"],
  [/\bbusiness|accounting\b/, (p) => p[0] === "B"],
  [/\bcomputer|coding|programming|cs\b/, (p) => p.startsWith("IC")],
  [/\btech\b/, (p) => p[0] === "T"],
  [/\bcareers?|civics\b/, (p) => p === "GLC" || p === "CHV"],
];

const mark = (c) => {
  const v = c.currentMark ?? c.midterm;
  return v == null || !isFinite(Number(v)) ? null : Number(v);
};
// Hide grades masks marks in answers too.
const pct = (v) => (marksHidden() ? "••%" : `${(Math.round(v * 10) / 10).toFixed(1)}%`);
const graded = (courses) => courses.filter((c) => mark(c) != null);
const OVERALL = /\baverage|overall|all (my )?courses|every course\b/i;

/** The course the question is about (by code, name or nickname), or null. */
export function findCourse(q, courses) {
  const text = q.toLowerCase();
  for (const c of courses) {
    const code = courseLabel(c).toLowerCase();
    if (code && (text.includes(code) || text.includes(code.slice(0, 5)))) return c;
  }
  for (const c of courses) {
    const name = (courseName(courseLabel(c)) || courseTitle(c)).toLowerCase();
    if (name && name.length > 3 && text.includes(name)) return c;
  }
  for (const [re, test] of ALIASES) {
    if (!re.test(text)) continue;
    const hit = courses.find((c) => test(courseLabel(c).slice(0, 3)));
    if (hit) return hit;
  }
  return null;
}

/** The course for this question: explicit, named, or the conversation's. */
function courseFor(q, ctx, { allowDefault = true } = {}) {
  return ctx.forceCourse || findCourse(q, ctx.courses) || (allowDefault ? ctx.defaultCourse || null : null);
}

/** Numbers in the question, in order ("90", "75.5"), ignoring course-code digits. */
function numbers(q) {
  return [...q.replace(/\b[a-z]{3}\d[a-z]\w*/gi, " ").matchAll(/(\d+(?:\.\d+)?)\s*%?/g)].map((m) => Number(m[1])).filter((n) => n <= 100);
}

const go = (label, route) => ({ label, route });
const openCourse = (c) => go(`Open ${courseLabel(c)}`, `course/${courseLabel(c)}`);

/** "Which course?" — one clarification, with the student's courses as replies. */
function whichCourse(ctx, example, meta) {
  return {
    title: "Which course?",
    text: `Which course is this for? ${example}`,
    badge: "Needs info",
    ask: "course",
    actions: [],
    suggestions: ctx.courses.slice(0, 4).map((c) => courseTitle(c)),
    meta,
  };
}

function requiredOnFinal(q, ctx) {
  if (!/\b(need|get|make|finish|end( up)? with|keep|reach)\b/i.test(q) || !/\b(final|exam|culminating|isu|for|to get|average|target)\b/i.test(q)) return null;
  const nums = numbers(q);
  if (!nums.length) return null;
  const worth = q.match(/(?:worth|weighted?|counts? for|is)\s*(\d+(?:\.\d+)?)\s*%/i);
  const weight = worth ? Number(worth[1]) : FINAL_WEIGHT;
  const target = nums.find((n) => n !== weight) ?? nums[0];
  const overall = OVERALL.test(q);
  const course = overall ? ctx.forceCourse || null : courseFor(q, ctx);
  const assumed = worth ? "" : `\nI assumed finals are worth ${FINAL_WEIGHT}% (the usual Ontario split). If yours is different, tell me the real weight.`;
  if (course && mark(course) != null) {
    const v = requiredGrade(mark(course), target, weight);
    const name = courseTitle(course);
    return {
      title: `${name} · what you need`,
      badge: "Calculated estimate",
      text: `To finish ${name} with ${pct(target)}, you need ${pct(v)} on the remaining ${weight}% (final evaluations).\n` +
        (v > 100 ? "That's above 100% — not reachable this term. Aim for the highest you can and talk to your teacher about improvement opportunities." :
          v <= 0 ? "You've already locked that in, even with 0% on the final. Still show up 😉" :
            v >= 90 ? "Tight but possible. Start reviewing 2 weeks out, past tests first." : "Very doable. Keep your current pace.") + assumed,
      detail: `Now: ${pct(mark(course))} (from TeachAssist). Math: (${target} − ${mark(course)} × ${(1 - weight / 100).toFixed(2)}) ÷ ${(weight / 100).toFixed(2)}.\nThis is an estimate from your current mark, not an official result. TeachAssist weights categories, so your teacher's final calculation can differ.`,
      actions: [openCourse(course)],
      suggestions: [`What if the final is worth ${weight === 20 ? 25 : 20}%?`, `What about ${target >= 90 ? target - 5 : Math.min(100, target + 5)}?`, `Make me a study plan for ${name}`],
      meta: { intent: "required", course, target, weight, assumed: !worth },
    };
  }
  if (course && mark(course) == null) {
    return { title: courseTitle(course), badge: "Needs info", text: `${courseTitle(course)} doesn't have a mark on TeachAssist yet, so I can't work this out. What's your current mark in it? Then use the quick calculator, or ask "current 85, target ${target}, remaining ${weight}".`, actions: [openCourse(course)], meta: { intent: "required", course: null, target, weight } };
  }
  if (overall) {
    const list = graded(ctx.courses);
    if (!list.length) return null;
    const avg = list.reduce((s, c) => s + mark(c), 0) / list.length;
    const v = requiredGrade(avg, target, weight);
    return {
      title: "Overall average · what you need",
      badge: "Calculated estimate",
      text: `Your average is ${pct(avg)}. To end at ${pct(target)}, you'd need about ${pct(v)} on every course's final ${weight}%.\n` +
        (v > 100 ? "Not reachable on finals alone — pick the courses with the most room to grow." : `Biggest wins: ${weakest(list, 2).map((c) => `${courseTitle(c)} (${pct(mark(c))})`).join(", ")}.`) + assumed,
      detail: "A simple average of the course marks shown on TeachAssist. Your school's official average may be calculated differently.",
      actions: [go("See my courses", "courses")],
      suggestions: [`How can I improve in ${courseTitle(weakest(list, 1)[0])}?`, "Make me a study plan"],
      meta: { intent: "required", course: null, overall: true, target, weight, assumed: !worth },
    };
  }
  return whichCourse(ctx, `For example: "Math".`, { intent: "required", target, weight, assumed: !worth, question: q });
}

function whatIfScore(q, ctx) {
  const m = q.match(/\bif i (?:get|got|score|scored|make)\s*(?:an? )?(\d+(?:\.\d+)?)\s*%?/i);
  if (!m) return null;
  const score = Number(m[1]);
  const course = courseFor(q, ctx);
  if (!course || mark(course) == null) {
    return whichCourse(ctx, `Then I can estimate what ${pct(score)} would do.`, { intent: "whatif", score, question: q });
  }
  const evals = (course.evaluations || []).filter((e) => typeof e.percent === "number");
  const weights = evals.map((e) => (e.weight > 0 ? e.weight : 1));
  const avgWeight = weights.length ? weights.reduce((a, b) => a + b, 0) / weights.length : 10;
  const worth = q.match(/(?:worth|weighted?)\s*(\d+(?:\.\d+)?)/i);
  const w = worth ? Number(worth[1]) : avgWeight;
  const total = weights.reduce((a, b) => a + b, 0) || w * 3;
  const now = mark(course);
  const next = (now * total + score * w) / (total + w);
  const d = next - now;
  return {
    title: `${courseTitle(course)} · what if`,
    badge: "Estimate",
    text: `If you get ${pct(score)} on the next assessment (weight ≈ ${Math.round(w * 10) / 10}), ${courseTitle(course)} goes from ${pct(now)} to about ${pct(next)} (${d >= 0 ? "+" : ""}${d.toFixed(1)}).\n` +
      "Estimate — TeachAssist also weights by category (K/T/C/A), so the real change can differ a bit.",
    actions: [openCourse(course)],
    suggestions: [`What about ${score >= 95 ? score - 10 : Math.min(100, score + 10)}?`, `What do I need on the ${courseTitle(course)} final to get 90?`],
    meta: { intent: "whatif", course, score, weight: worth ? w : null },
  };
}

function weakest(list, n) {
  return [...list].sort((a, b) => mark(a) - mark(b)).slice(0, n);
}

const TIPS = {
  k: "Knowledge: redo old test questions without notes, then check. Flashcards for terms.",
  t: "Thinking: practise multi-step / unfamiliar problems; explain *why* each step works.",
  c: "Communication: outline before writing (thesis → 3 points → evidence). Reread for grammar out loud. Show all work in math.",
  a: "Application: do real-world / word problems and connect ideas to new situations.",
  f: "Finals: build a one-page summary per unit, then do a full timed practice test.",
};

function lowStrand(c) {
  const strands = strandBreakdown((c.evaluations || []).filter((e) => typeof e.percent === "number")).filter((s) => ["k", "t", "c", "a"].includes(s.key));
  return [...strands].sort((a, b) => a.average - b.average)[0] || null;
}

/** A weekly schedule sized to the student's daily time. */
function schedule(focus, minutes) {
  const [a, b = a] = focus;
  const task = (f) => f.low ? f.low.name : "your last test's mistakes";
  const m = minutes;
  const long = Math.max(m, Math.round(m * 1.5));
  return [
    `Mon: ${courseTitle(a.c)} — ${m} min on ${task(a)}`,
    `Tue: ${courseTitle(b.c)} — ${m} min on ${task(b)}`,
    `Wed: ${courseTitle(a.c)} — ${m} min of practice questions, then check answers`,
    `Thu: ${courseTitle(a.c)} — ask your teacher one specific question (extra help), then ${Math.max(10, m - 10)} min review`,
    `Fri: ${courseTitle(b.c)} — ${m} min redoing one past assignment`,
    `Sat: ${long} min mixed review, then rest`,
    `Sun: ${Math.min(20, m)} min to plan the week + pack notes`,
  ];
}

function studyPlan(q, ctx) {
  const wantsPlan = /\b(plan|schedule|this week|weekly|timetable)\b/i.test(q) || ctx.forcePlan;
  const wantsAdvice = /\b(study|improve|weak|struggl|focus|work on|raise|boost|bring up|better)\b/i.test(q);
  if (!wantsPlan && !wantsAdvice) return null;
  const list = graded(ctx.courses);
  if (!list.length) return null;
  const asked = courseFor(q, { ...ctx, courses: list }, { allowDefault: !OVERALL.test(q) });
  const lowestAsked = !asked && /\b(lowest|weakest|worst)\b/i.test(q) ? weakest(list, 1)[0] : null;
  const askedOk = asked && mark(asked) != null ? asked : lowestAsked;
  const targets = askedOk ? [askedOk] : weakest(list, 2);
  const focus = targets.map((c) => ({ c, low: lowStrand(c) }));
  const lines = focus.map(({ c, low }) => `• ${courseTitle(c)} — ${pct(mark(c))}${low ? `, weakest: ${low.name} (${pct(low.average)})` : ""}`);
  const tips = [...new Set(focus.map((f) => f.low?.key).filter(Boolean))].map((k) => TIPS[k]);
  const name = askedOk ? courseTitle(askedOk) : null;

  // "How can I improve in Science?" — advice first; the plan is one tap away.
  if (!wantsPlan && askedOk) {
    const low = focus[0].low;
    return {
      title: `Improving in ${name}`,
      badge: "From your TeachAssist marks",
      text: `You're at ${pct(mark(askedOk))} in ${name}.${low ? ` Your lowest category is ${low.name} (${pct(low.average)}) — that's where extra effort pays off most.` : ""}\n\nTry this:\n` +
        (tips.length ? tips.map((t) => "• " + t).join("\n") : "• Redo your last test's mistakes without notes, then check.") +
        "\n• Go to extra help once with one specific question.\n• Review a little every day instead of cramming.",
      actions: [openCourse(askedOk)],
      suggestions: ["Make that a plan for this week", `What do I need on the ${name} final to get 90?`, `What if I get 90 on the next ${name} test?`],
      meta: { intent: "improve", course: askedOk },
    };
  }

  const minutes = ctx.minutes || 30;
  const days = schedule(focus, minutes);
  const short = ctx.minutes && ctx.minutes < 25 ? "\n\nShort sessions work: set a timer, put your phone in another room, and do one thing only." : "";
  return {
    title: name ? `Study plan · ${name}` : "Your study plan for this week",
    badge: "Plan from your marks",
    text: `Focus here first:\n${lines.join("\n")}\n\n${days.join("\n")}${short}`,
    detail: tips.length ? "How:\n" + tips.map((t) => "• " + t).join("\n") : "",
    actions: focus.map(({ c }) => openCourse(c)),
    suggestions: [
      ctx.minutes ? (ctx.minutes > 30 ? "I only have 20 minutes a day" : "I have an hour a day") : "I only have 30 minutes a day",
      ...(name ? [`What do I need on the ${name} final to get 90?`] : ["What's my lowest course?"]),
    ],
    meta: { intent: "plan", course: askedOk, minutes: ctx.minutes || null },
  };
}

function marksQuestion(q, ctx) {
  const list = graded(ctx.courses);
  if (!list.length) return null;
  if (/\b(lowest|worst|weakest) (course|class|mark|subject)/i.test(q) || /\bwhat('?s| is) my (lowest|worst)/i.test(q)) {
    const c = weakest(list, 1)[0];
    return { title: "Lowest mark", badge: "From your TeachAssist marks", text: `${courseTitle(c)} (${courseLabel(c)}) at ${pct(mark(c))}.`, actions: [openCourse(c)], suggestions: [`How can I improve in ${courseTitle(c)}?`, "Make me a study plan"], meta: { intent: "marks", course: c } };
  }
  if (/\b(highest|best|strongest|top) (course|class|mark|subject)/i.test(q)) {
    const c = [...list].sort((a, b) => mark(b) - mark(a))[0];
    return { title: "Highest mark", badge: "From your TeachAssist marks", text: `${courseTitle(c)} (${courseLabel(c)}) at ${pct(mark(c))}.`, actions: [openCourse(c)], suggestions: ["What's my lowest course?"], meta: { intent: "marks", course: c } };
  }
  if (/\b(my )?(overall )?average\b/i.test(q) && !/\bneed|get\b/i.test(q)) {
    const avg = list.reduce((s, c) => s + mark(c), 0) / list.length;
    return {
      title: "Overall average",
      badge: "From your TeachAssist marks",
      text: `${pct(avg)} across ${list.length} course${list.length === 1 ? "" : "s"}.\n` + list.map((c) => `• ${courseTitle(c)}: ${pct(mark(c))}`).join("\n"),
      detail: "A simple average of the current marks TeachAssist shows. Courses without a mark are left out. It isn't an official report card average.",
      actions: [go("See my courses", "courses")],
      suggestions: ["What do I need on my finals to get a 90 average?", "What's my lowest course?"],
      meta: { intent: "marks", course: null },
    };
  }
  return null;
}

function schoolQuestion(q, ctx) {
  const asks = {
    bell: /\b(bell|start|end|dismiss|what time).*(school|class|day)|\bbell times?\b|\bwhen does school\b/i,
    principal: /\bprincipal\b/i,
    vp: /\bvice|vp\b/i,
    phone: /\b(phone|call|number)\b.*\bschool|school('?s)? (phone|number)|guidance (office|phone|number)/i,
    address: /\b(address|where is my school|located)\b/i,
    trustee: /\btrustee\b/i,
    boundary: /\bboundar(y|ies)|zone|catchment\b/i,
    website: /\bschool (website|site)\b/i,
  };
  const key = Object.keys(asks).find((k) => asks[k].test(q));
  if (!key) return null;
  const s = ctx.school;
  if (!s) return { title: "Pick your school first", badge: "Needs info", text: "I don't know your school yet. Choose it on the school map and I'll know its bell times, principal, phone and boundary.", actions: [go("Open school map", "guidance/map")], meta: { intent: "school" } };
  const text = {
    bell: `${s.name} bell times: ${s.bellTimes || "not listed"}.`,
    principal: `The principal of ${s.name} is ${s.principal || "not listed"}.`,
    vp: s.vicePrincipals?.length ? `Vice-principal${s.vicePrincipals.length > 1 ? "s" : ""} at ${s.name}: ${s.vicePrincipals.join(", ")}.` : `No vice-principal is listed for ${s.name}.`,
    phone: `${s.name}: ${s.phones?.join(" or ") || "no phone listed"}. Ask the office for Guidance.`,
    address: `${s.name} is at ${s.address}, ${s.city} ${s.postal}.`,
    trustee: `Your school trustee is ${s.trustee || "not listed"}.`,
    boundary: `${s.name}'s official boundary map is a YRDSB PDF — open it from your school card.`,
    website: `${s.name}: ${s.website || "no website listed"}`,
  }[key];
  const more = { bell: "Who is my principal?", principal: "What's the school phone number?", phone: "What are my bell times?" };
  return {
    title: s.name,
    badge: "From YRDSB school profiles",
    text,
    detail: "From YRDSB's public school profiles, saved with this app. Times can change — check your school website for the latest.",
    actions: [go("My school", "guidance"), go("School map", "guidance/map")],
    suggestions: [more[key] || "What are my bell times?"],
    meta: { intent: "school" },
  };
}

function diplomaQuestion(q, ctx) {
  const vol = /\bvolunteer|community (hours|involvement)|40 hours\b/i.test(q);
  const ossd = /\bossd|diploma|graduat|credits?|compulsory|literacy|osslt\b/i.test(q);
  if (!vol && !ossd) return null;
  if (vol) {
    const h = ctx.volunteerHours || 0;
    const left = Math.max(0, 40 - h);
    return {
      title: "Volunteer hours",
      badge: "From your volunteer log",
      text: `You've logged ${h} of 40 hours. ${left ? `${left} to go — about ${Math.ceil(left / 3)} three-hour shifts. Get activities pre-approved by your school first.` : "Requirement done! 🎉"}`,
      detail: "This counts the hours you logged in this app. Your school confirms the official total.",
      actions: [go("Log hours", "guidance/volunteer")],
      suggestions: ["How many credits do I still need?"],
      meta: { intent: "diploma" },
    };
  }
  const p = ctx.ossd;
  if (/\bwhat is|what's the|explain\b/i.test(q) || !p) {
    return {
      title: "The OSSD (Ontario diploma)",
      badge: "Ontario requirements",
      text: "To graduate (started Grade 9 in 2024+): 30 credits (17 compulsory, 13 optional), the literacy requirement (OSSLT/OSSLC), 2 online learning credits, and 40 volunteer hours. Grade 10 math also includes a financial-literacy test you need 70%+ on.",
      detail: "Check with your guidance counsellor for your exact requirements — they depend on when you started Grade 9.",
      actions: [go("Open diploma tracker", "guidance")],
      suggestions: ["How many credits do I still need?", "How many volunteer hours do I have left?"],
      meta: { intent: "diploma" },
    };
  }
  const todo = p.slots.filter((s) => s.status === "todo" || s.status === "partial").map((s) => s.label);
  const prior = p.prior || 0;
  const now = p.onTrack ?? Math.max(0, p.credits - prior);
  return {
    title: "Diploma progress",
    badge: "Estimate — not official",
    text: `${p.credits} of 30 credits on track: ${prior} you marked as earned in past years + ${now} in progress this year.\nCourses you're taking now only count once you pass them, so treat them as "on track", not earned.\n${todo.length ? `Compulsory still to do: ${todo.join(", ")}.` : "All compulsory slots covered."}\nLiteracy: ${p.literacy ? "done" : "not yet"} · Online credits: ${p.online}/2 · Volunteer: ${ctx.volunteerHours || 0}/40 h.`,
    detail: "Your official record is your Ontario Student Transcript — your guidance counsellor can confirm your status.",
    actions: [go("Open diploma tracker", "guidance")],
    suggestions: ["How many volunteer hours do I have left?", "What is the OSSD?"],
    meta: { intent: "diploma" },
  };
}

/** Try every intent in order; null when none match. */
export function answer(question, ctx) {
  const q = String(question || "").trim();
  if (!q) return null;
  const c = { courses: [], ...ctx };
  for (const intent of [schoolQuestion, diplomaQuestion, whatIfScore, requiredOnFinal, studyPlan, marksQuestion]) {
    try {
      const out = intent(q, c);
      if (out) return out;
    } catch (err) {
      return { title: "Let's try that again", text: err.message, actions: [] };
    }
  }
  return null;
}
