// ============================================================================
// Assistant brain — answers questions from the student's own data, locally.
// ----------------------------------------------------------------------------
// Pure function: answer(question, context) → { title, text, actions } | null.
// context = { courses, school, ossd, volunteerHours }. Nothing leaves the
// device. Returns null when it doesn't recognise the question, so the caller
// can fall back to the formula parser / AI worker.
// ============================================================================

import { requiredGrade } from "./grade-math.js";
import { courseLabel, courseTitle } from "./courses.js";
import { courseName } from "./course-names.js";
import { strandBreakdown } from "./course-detail.js";

const FINAL_WEIGHT = 30; // Ontario: final evaluations are 30% of the grade.

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
const pct = (v) => `${(Math.round(v * 10) / 10).toFixed(1)}%`;
const graded = (courses) => courses.filter((c) => mark(c) != null);

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

/** Numbers in the question, in order ("90", "75.5"), ignoring course-code digits. */
function numbers(q) {
  return [...q.replace(/\b[a-z]{3}\d[a-z]\w*/gi, " ").matchAll(/(\d+(?:\.\d+)?)\s*%?/g)].map((m) => Number(m[1])).filter((n) => n <= 100);
}

const go = (label, route) => ({ label, route });

function requiredOnFinal(q, ctx) {
  if (!/\b(need|get|make|finish|end( up)? with|keep|reach)\b/i.test(q) || !/\b(final|exam|culminating|isu|for|to get|average|target)\b/i.test(q)) return null;
  const nums = numbers(q);
  if (!nums.length) return null;
  const worth = q.match(/(?:worth|weighted?|counts? for|is)\s*(\d+(?:\.\d+)?)\s*%/i);
  const weight = worth ? Number(worth[1]) : FINAL_WEIGHT;
  const target = nums.find((n) => n !== weight) ?? nums[0];
  const course = findCourse(q, ctx.courses);
  if (course && mark(course) != null) {
    const v = requiredGrade(mark(course), target, weight);
    const name = courseTitle(course);
    return {
      title: `${name} · what you need`,
      text: `To finish ${name} with ${pct(target)}, you need ${pct(v)} on the remaining ${weight}% (final evaluations).\n` +
        `Now: ${pct(mark(course))}. Math: (${target} − ${mark(course)} × ${(1 - weight / 100).toFixed(2)}) ÷ ${(weight / 100).toFixed(2)}.\n` +
        (v > 100 ? "That's above 100% — not reachable this term. Aim for the highest you can and talk to your teacher about improvement opportunities." :
          v <= 0 ? "You've already locked that in, even with 0% on the final. Still show up 😉" :
            v >= 90 ? "Tight but possible. Start reviewing 2 weeks out, past tests first." : "Very doable. Keep your current pace."),
      actions: [go(`Open ${courseLabel(course)}`, `course/${courseLabel(course)}`)],
    };
  }
  if (/\baverage|overall|all (my )?courses\b/i.test(q) || !course) {
    const list = graded(ctx.courses);
    if (!list.length) return null;
    const avg = list.reduce((s, c) => s + mark(c), 0) / list.length;
    const v = requiredGrade(avg, target, weight);
    return {
      title: "Overall average · what you need",
      text: `Your average is ${pct(avg)}. To end at ${pct(target)}, you'd need about ${pct(v)} on every course's final ${weight}%.\n` +
        (v > 100 ? "Not reachable on finals alone — pick the courses with the most room to grow." : `Biggest wins: ${weakest(list, 2).map((c) => `${courseTitle(c)} (${pct(mark(c))})`).join(", ")}.`),
      actions: [go("See my courses", "courses")],
    };
  }
  return null;
}

function whatIfScore(q, ctx) {
  const m = q.match(/\bif i (?:get|got|score|scored|make)\s*(?:an? )?(\d+(?:\.\d+)?)\s*%?/i);
  if (!m) return null;
  const score = Number(m[1]);
  const course = findCourse(q, ctx.courses);
  if (!course || mark(course) == null) {
    return { title: "Which course?", text: `Tell me the course too, e.g. “If I get ${score} on the next math test”.`, actions: [] };
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
    text: `If you get ${pct(score)} on the next assessment (weight ≈ ${Math.round(w * 10) / 10}), ${courseTitle(course)} goes from ${pct(now)} to about ${pct(next)} (${d >= 0 ? "+" : ""}${d.toFixed(1)}).\n` +
      "Estimate — TeachAssist also weights by category (K/T/C/A), so the real change can differ a bit.",
    actions: [go(`Open ${courseLabel(course)}`, `course/${courseLabel(course)}`)],
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

function studyPlan(q, ctx) {
  if (!/\b(study|plan|improve|weak|struggl|focus|work on|raise|boost|bring up)\b/i.test(q)) return null;
  const list = graded(ctx.courses);
  if (!list.length) return null;
  const asked = findCourse(q, list);
  const targets = asked ? [asked] : weakest(list, 2);
  const lines = [];
  const focus = targets.map((c) => {
    const strands = strandBreakdown((c.evaluations || []).filter((e) => typeof e.percent === "number")).filter((s) => s.key !== "f");
    const low = [...strands].sort((a, b) => a.average - b.average)[0];
    return { c, low };
  });
  focus.forEach(({ c, low }) => {
    lines.push(`• ${courseTitle(c)} — ${pct(mark(c))}${low ? `, weakest: ${low.name} (${pct(low.average)})` : ""}`);
  });
  const [a, b = a] = focus;
  const days = [
    `Mon: ${courseTitle(a.c)} — 30 min on ${a.low ? a.low.name : "your last test's mistakes"}`,
    `Tue: ${courseTitle(b.c)} — 30 min on ${b.low ? b.low.name : "your last test's mistakes"}`,
    `Wed: ${courseTitle(a.c)} — practice questions, check answers`,
    `Thu: Ask ${courseTitle(a.c)} teacher one specific question (extra help)`,
    `Fri: ${courseTitle(b.c)} — redo one past assignment`,
    "Sat: 45 min mixed review, then rest",
    "Sun: 20 min plan the week + pack notes",
  ];
  const tips = [...new Set(focus.map((f) => f.low?.key).filter(Boolean))].map((k) => TIPS[k]);
  return {
    title: asked ? `Study plan · ${courseTitle(asked)}` : "Your study plan for this week",
    text: `Focus here first:\n${lines.join("\n")}\n\n${days.join("\n")}${tips.length ? "\n\nHow:\n" + tips.map((t) => "• " + t).join("\n") : ""}`,
    actions: focus.map(({ c }) => go(`Open ${courseLabel(c)}`, `course/${courseLabel(c)}`)),
  };
}

function marksQuestion(q, ctx) {
  const list = graded(ctx.courses);
  if (!list.length) return null;
  if (/\b(lowest|worst|weakest) (course|class|mark|subject)/i.test(q) || /\bwhat('?s| is) my (lowest|worst)/i.test(q)) {
    const c = weakest(list, 1)[0];
    return { title: "Lowest mark", text: `${courseTitle(c)} (${courseLabel(c)}) at ${pct(mark(c))}. Ask me for a study plan for it.`, actions: [go(`Open ${courseLabel(c)}`, `course/${courseLabel(c)}`)] };
  }
  if (/\b(highest|best|strongest|top) (course|class|mark|subject)/i.test(q)) {
    const c = [...list].sort((a, b) => mark(b) - mark(a))[0];
    return { title: "Highest mark", text: `${courseTitle(c)} (${courseLabel(c)}) at ${pct(mark(c))}.`, actions: [go(`Open ${courseLabel(c)}`, `course/${courseLabel(c)}`)] };
  }
  if (/\b(my )?(overall )?average\b/i.test(q) && !/\bneed|get\b/i.test(q)) {
    const avg = list.reduce((s, c) => s + mark(c), 0) / list.length;
    return { title: "Overall average", text: `${pct(avg)} across ${list.length} course${list.length === 1 ? "" : "s"}.\n` + list.map((c) => `• ${courseTitle(c)}: ${pct(mark(c))}`).join("\n"), actions: [go("See my courses", "courses")] };
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
  if (!s) return { title: "Pick your school first", text: "I don't know your school yet. Choose it on the school map and I'll know its bell times, principal, phone and boundary.", actions: [go("Open school map", "guidance/map")] };
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
  return { title: s.name, text, actions: [go("My school", "guidance"), go("School map", "guidance/map")] };
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
      text: `You've logged ${h} of 40 hours. ${left ? `${left} to go — about ${Math.ceil(left / 3)} three-hour shifts. Get activities pre-approved by your school first.` : "Requirement done! 🎉"}`,
      actions: [go("Log hours", "guidance/volunteer")],
    };
  }
  const p = ctx.ossd;
  if (/\bwhat is|what's the|explain\b/i.test(q) || !p) {
    return {
      title: "The OSSD (Ontario diploma)",
      text: "To graduate (started Grade 9 in 2024+): 30 credits (17 compulsory, 13 optional), the literacy requirement (OSSLT/OSSLC), 2 online learning credits, and 40 volunteer hours. Grade 10 math also includes a financial-literacy test you need 70%+ on.",
      actions: [go("Open diploma tracker", "guidance")],
    };
  }
  const todo = p.slots.filter((s) => s.status === "todo" || s.status === "partial").map((s) => s.label);
  return {
    title: "Diploma progress",
    text: `${p.credits} of 30 credits on track. ${todo.length ? `Compulsory still to do: ${todo.join(", ")}.` : "All compulsory slots covered."}\nLiteracy: ${p.literacy ? "done" : "not yet"} · Online credits: ${p.online}/2 · Volunteer: ${ctx.volunteerHours || 0}/40 h.`,
    actions: [go("Open diploma tracker", "guidance")],
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
