// ============================================================================
// AI tutor — POST /api/chat on the Pages backend.
// ----------------------------------------------------------------------------
// A student mentor chat for Grade 9–12 students using OpenAI: any subject,
// grades, study skills, university/college, careers and student life. The key comes
// from the OPENAI_API_KEY secret and never reaches the browser.
//
// Request:  { messages: [{ role: "user"|"assistant", content }], marks?: [{ course, mark }] }
//   messages — only the tutor conversation (text the student typed and the
//              tutor's own replies), at most 12, newest last.
//   marks    — sent only when the student turns on "Share my marks"; course
//              names and current marks only.
// Response: { reply, remaining }
//
// Each student gets DAILY_LIMIT messages per day (Toronto time), counted by
// the hashed subject in their session token, in the CHAT_LIMITS KV namespace.
// Every student message is checked with OpenAI's moderation endpoint first.
// ============================================================================

import { readSession } from './session.js';

export const DAILY_LIMIT = 30;
const MODEL = 'gpt-4o-mini';
const MAX_MESSAGES = 12;
const MAX_CHARS = 1500;
const MAX_BODY = 24000;

const SYSTEM_PROMPT = `You are the TeachAssist assistant: a smart, friendly mentor for Ontario high school students (Grades 9–12, ages about 13–18), inside a YRDSB marks app. Think of yourself as a knowledgeable older student who has already been through high school and university applications.

Tone: warm, direct and practical. No fluff. Keep most answers under about 200 words and easy to scan; go longer (up to about 400 words) only when the student asks for a full explanation, an essay plan or a step-by-step walkthrough. Format as plain text: short paragraphs and "•" bullets, **bold** only for key terms, no headings or tables. End with one short follow-up offer when it helps.

You can help with anything a high school student deals with, including:
• Any subject: explain concepts simply (math, sciences, English, French, history, geography, business, computer science, tech, arts, etc.), with analogies and worked examples.
• Homework and assignments: hints, steps and similar examples so they learn it.
• Raising grades: study plans, test and exam prep, how Ontario achievement categories work (Knowledge, Thinking, Communication, Application), getting more marks on essays and labs, talking to teachers, extra help, retakes.
• Study skills: note-taking, active recall, spaced repetition, focus, procrastination, time management, balancing sports, jobs and school.
• Writing: essay structure, thesis statements, grammar, citations, proofreading tips, French grammar and vocab practice.
• High school planning: course selection, prerequisites, OSSD requirements, the literacy requirement, volunteer hours, summer school, e-learning, extracurriculars.
• University and college: Ontario programs (OUAC/OCAS), admission averages and which courses count, supplementary applications, personal statements, scholarships and bursaries, co-op, choosing a school or program, life in first year, studying in the US or abroad.
• Careers and money: exploring careers, apprenticeships and the trades, résumés, cover letters, interviews, first jobs, starting a small side business, budgeting and saving as a student.
• Wellbeing that affects school: stress, test anxiety, sleep, motivation, confidence, burnout, friendships at school.
• General learning and curiosity questions, tech and coding help, and life skills a student needs.

Rules:
- Be genuinely helpful on all of the above; don't refuse just because a question isn't strictly about a class. Only decline things that are clearly unrelated to a student's growth (celebrity gossip, gaming walkthroughs, dating advice, etc.) or unsafe, with a brief friendly redirect.
- For homework or anything that looks like a graded assignment, guide with hints, steps and similar worked examples. Don't write the whole assignment or essay for them or hand over final answers to graded work; offer to check their attempt instead.
- Never invent the student's grades, assessment weights, deadlines, school schedules, teacher names or graduation status. If you need them, ask.
- Don't calculate the student's exact course marks or required exam grades — tell them to use the app's Calculator button or ask "What do I need on my final…", which calculates exactly.
- If marks are provided, they come from TeachAssist and may be incomplete; treat them as current marks, not final or official results. Courses in progress are not earned credits yet.
- Admission averages, cutoffs and deadlines change every year: give typical ranges as estimates and tell the student to confirm on the school's official page or OUAC/OCAS.
- Graduation rules (OSSD, credits, literacy, volunteer hours) depend on the student; for official status point them to their guidance counsellor.
- Never ask for passwords, student numbers, addresses or other personal information.
- If a student seems unsafe, in crisis, or mentions self-harm or abuse, respond with care and share: Kids Help Phone, 24/7 — call 1-800-668-6868 or text CONNECT to 686868; in an emergency call 911. Encourage talking to a trusted adult or their guidance counsellor.
- Be honest when you're unsure. You can't browse the internet or see their timetable or their teachers' materials.`;

const CRISIS_REPLY = "I'm really glad you reached out, and I'm sorry you're dealing with this. You don't have to handle it alone.\n\n• Kids Help Phone, 24/7: call 1-800-668-6868 or text CONNECT to 686868\n• If you're in danger right now, call 911\n• Talking to a trusted adult or your guidance counsellor can help too\n\nI'm here for school stuff whenever you're ready.";
const BLOCKED_REPLY = "I can't help with that one. Ask me anything about school, grades, university, college or careers — what are you working on?";

const memoryCounts = new Map(); // fallback when no KV namespace is bound (best effort, per isolate)

function json(body, status = 200, headers = {}) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store', ...headers } });
}

/** "2026-10-11" in Toronto, so the limit resets at local midnight. */
export function torontoDay(now = Date.now()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(now));
}

async function readBody(request) {
  const reader = request.body?.getReader();
  if (!reader) return null;
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY) { await reader.cancel(); throw Object.assign(new Error('too large'), { status: 413 }); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) { bytes.set(c, at); at += c.length; }
  return JSON.parse(new TextDecoder().decode(bytes));
}

/** Validate and trim the request to exactly what the tutor may see. */
export function cleanInput(input) {
  if (!input || !Array.isArray(input.messages)) return null;
  const messages = input.messages.slice(-MAX_MESSAGES)
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .map((m) => ({ role: m.role, content: m.content.trim().slice(0, MAX_CHARS) }));
  if (!messages.length || messages.at(-1).role !== 'user') return null;
  let marks = [];
  if (Array.isArray(input.marks)) {
    marks = input.marks.slice(0, 12)
      .filter((m) => m && typeof m.course === 'string' && m.course.trim())
      .map((m) => ({ course: m.course.trim().slice(0, 80), mark: Number.isFinite(m.mark) && m.mark >= 0 && m.mark <= 100 ? Math.round(m.mark * 10) / 10 : null }));
  }
  return { messages, marks };
}

async function countToday(env, subject, now) {
  const key = `chat:${subject}:${torontoDay(now)}`;
  if (env.CHAT_LIMITS) return { key, used: Number(await env.CHAT_LIMITS.get(key)) || 0 };
  return { key, used: memoryCounts.get(key) || 0 };
}
async function recordUse(env, key, used) {
  if (env.CHAT_LIMITS) await env.CHAT_LIMITS.put(key, String(used), { expirationTtl: 60 * 60 * 48 });
  else {
    if (memoryCounts.size > 5000) memoryCounts.clear();
    memoryCounts.set(key, used);
  }
}

async function openai(env, path, body, signal) {
  return fetch(`https://api.openai.com/v1/${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
}

export async function handleChat(request, env, now = Date.now()) {
  if (!env.OPENAI_API_KEY || !env.API_KEY) {
    return json({ error: 'The AI tutor is not set up on this site yet.' }, 503);
  }
  const token = request.headers.get('Authorization')?.replace(/^Bearer /, '');
  const session = await readSession(token, env.API_KEY, now);
  if (!session) return json({ error: 'Your session expired. Refresh your courses (↻ on Courses), then retry.' }, 401);
  if (!session.subject) return json({ error: 'Please refresh your courses (↻ on Courses) to start using the AI tutor.' }, 401);

  let input;
  try { input = cleanInput(await readBody(request)); }
  catch (err) { return json({ error: err.status === 413 ? 'That conversation is too long. Start a new chat.' : 'Invalid message format.' }, err.status || 400); }
  if (!input) return json({ error: 'Type a message first (up to 1,500 characters).' }, 400);

  const { key, used } = await countToday(env, session.subject, now);
  if (used >= DAILY_LIMIT) {
    return json({ error: `You've used today's ${DAILY_LIMIT} AI tutor messages. Marks, plans and school questions still work — the tutor resets at midnight.`, remaining: 0 }, 429);
  }

  const signal = AbortSignal.timeout(25000);
  try {
    // Screen the student's newest message before it reaches the model.
    const latest = input.messages.at(-1).content;
    const mod = await openai(env, 'moderations', { model: 'omni-moderation-latest', input: latest }, signal);
    if (mod.ok) {
      const result = (await mod.json()).results?.[0];
      if (result?.flagged) {
        const c = result.categories || {};
        const crisis = c['self-harm'] || c['self-harm/intent'] || c['self-harm/instructions'];
        await recordUse(env, key, used + 1);
        return json({ reply: crisis ? CRISIS_REPLY : BLOCKED_REPLY, remaining: DAILY_LIMIT - used - 1, flagged: true });
      }
    }

    const context = input.marks.length
      ? [{ role: 'system', content: `The student chose to share their current TeachAssist marks for this chat (current marks, not final or official): ${input.marks.map((m) => `${m.course}: ${m.mark == null ? 'no mark yet' : `${m.mark}%`}`).join('; ')}.` }]
      : [];
    const response = await openai(env, 'chat/completions', {
      model: MODEL,
      messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...context, ...input.messages],
      max_tokens: 700,
      temperature: 0.5,
    }, signal);
    if (response.status === 429) return json({ error: 'The AI tutor is busy right now. Try again in a minute.' }, 503);
    if (!response.ok) return json({ error: 'The AI tutor is unavailable right now. Try again soon.' }, 502);
    const reply = (await response.json()).choices?.[0]?.message?.content?.trim();
    if (!reply) return json({ error: "The AI tutor didn't answer. Try asking another way." }, 502);
    await recordUse(env, key, used + 1);
    return json({ reply: reply.slice(0, 4000), remaining: DAILY_LIMIT - used - 1 });
  } catch (err) {
    if (err?.name === 'TimeoutError') return json({ error: 'The AI tutor took too long to answer. Try again.' }, 504);
    return json({ error: 'Could not reach the AI tutor. Try again soon.' }, 502);
  }
}
