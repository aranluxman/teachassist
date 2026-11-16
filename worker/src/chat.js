// ============================================================================
// AI assistant (Guidance → Ask AI), powered by Google Gemini.
// ----------------------------------------------------------------------------
// POST /api/chat  { messages: [{ role: "user" | "assistant", text }], marks? }
//              →  { reply, remaining }
// - The key lives only here, as the Pages secret GEMINI_API_KEY. The browser
//   never sees it. Model: GEMINI_MODEL, else gemini-3.5-flash-lite, falling
//   back to gemini-3.8-flash if a model isn't available to this key.
//   (New keys can't use Gemini 2.x, and 3.x rejects sampling settings such as
//   temperature, so none are sent.)
// - Signed-in students only (the session token), 30 messages per student per
//   day (Toronto time), counted in the CHAT_LIMITS KV by the session's one-way
//   subject — never the student number.
// - Only the chat thread (last 12 messages) is sent, plus course marks when the
//   student turns on "Share my marks". Self-harm messages get Kids Help Phone
//   right away, without calling the model.
// ============================================================================

import { readSessionWith } from './session.js';
import { sessionKeys } from './keys.js';
import { readJson } from './store.js';

export const DAILY_LIMIT = 30;
const MAX_MESSAGES = 12;
const MAX_TEXT = 2000;
export const DEFAULT_MODELS = ['gemini-3.5-flash-lite', 'gemini-3.8-flash'];

const json = (body, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

export const SYSTEM_PROMPT = `You are the TeachAssist study assistant for Ontario high school students (Grades 9–12, YRDSB).
Help with school: explaining concepts step by step, homework guidance, essay structure and grammar, French practice, study plans, test prep, course selection, OSSD requirements, university/college and career questions, and wellbeing tips.
Rules:
- Teach, don't just hand over answers. For homework, guide with hints and worked examples so the student learns; for essays, give feedback and outlines rather than writing the whole essay.
- Be warm, clear and concise. Use short paragraphs, bullet points, and simple analogies. Use plain text math (e.g. x^2, sqrt(x)).
- Stay on school, learning, careers and student wellbeing. Politely decline anything else (or anything unsafe, hateful, sexual or illegal) and steer back to school.
- If a student seems in crisis or unsafe, tell them to contact Kids Help Phone (call 1-800-668-6868 or text CONNECT to 686868), a trusted adult, or 911 in an emergency.
- Never ask for passwords, student numbers, addresses or other personal details.
- If you're unsure about a school-specific rule or date, say so and suggest asking their teacher or guidance counsellor.`;

export const CRISIS_REPLY = `It sounds like you're going through something really hard, and I'm glad you said something. You don't have to handle this alone.

• Kids Help Phone — call 1-800-668-6868 or text CONNECT to 686868 (free, 24/7, confidential)
• Talk to a trusted adult: a parent, teacher or your guidance counsellor
• If you're in immediate danger, call 911

You matter. Please reach out to one of them right now.`;

const CRISIS = /\b(kill(ing)? my ?self|suicid\w*|end(ing)? my life|want to die|self[- ]?harm\w*|hurt(ing)? my ?self|cut(ting)? my ?self|no reason to live)\b/i;
export const isCrisis = (text) => CRISIS.test(String(text || ''));

/** The messages and marks as the model gets them, or null when they aren't valid. */
export function cleanChat(body) {
  const raw = Array.isArray(body?.messages) ? body.messages.slice(-MAX_MESSAGES) : null;
  if (!raw?.length) return null;
  const messages = [];
  for (const m of raw) {
    if (!m || (m.role !== 'user' && m.role !== 'assistant') || typeof m.text !== 'string') return null;
    const text = m.text.trim().slice(0, MAX_TEXT);
    if (text) messages.push({ role: m.role, text });
  }
  if (!messages.length || messages.at(-1).role !== 'user') return null;
  const marks = Array.isArray(body.marks)
    ? body.marks.slice(0, 12).flatMap((c) => {
        const name = typeof c?.name === 'string' ? c.name.trim().slice(0, 60) : '';
        const mark = Number(c?.mark);
        return name ? [{ name, mark: Number.isFinite(mark) && mark >= 0 && mark <= 110 ? Math.round(mark * 10) / 10 : null }] : [];
      })
    : [];
  return { messages, marks };
}

/** The Gemini request body. */
export function geminiRequest({ messages, marks }) {
  let system = SYSTEM_PROMPT;
  if (marks.length) {
    system += `\n\nThe student chose to share their current courses and marks:\n${marks.map((m) => `- ${m.name}: ${m.mark == null ? 'no mark yet' : `${m.mark}%`}`).join('\n')}\nUse them only when relevant to the question.`;
  }
  const block = (category) => ({ category, threshold: 'BLOCK_MEDIUM_AND_ABOVE' });
  return {
    systemInstruction: { parts: [{ text: system }] },
    contents: messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.text }] })),
    generationConfig: { maxOutputTokens: 1500 },
    safetySettings: ['HARM_CATEGORY_HARASSMENT', 'HARM_CATEGORY_HATE_SPEECH', 'HARM_CATEGORY_SEXUALLY_EXPLICIT', 'HARM_CATEGORY_DANGEROUS_CONTENT'].map(block),
  };
}

/** The reply text from a Gemini response, or null (blocked or empty). */
export function replyText(data) {
  if (data?.promptFeedback?.blockReason) return null;
  const parts = data?.candidates?.[0]?.content?.parts;
  const text = Array.isArray(parts) ? parts.map((p) => (typeof p?.text === 'string' ? p.text : '')).join('').trim() : '';
  return text || null;
}

/** "2026-11-15" in Toronto, so the daily limit resets at local midnight. */
export const torontoDay = (now = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Toronto' }).format(now);

// Without the KV binding, count per server instance (better than nothing).
const memory = new Map();
async function useOne(env, subject) {
  const key = `chat:${subject}:${torontoDay()}`;
  const kv = env.CHAT_LIMITS;
  const used = Number(kv ? await kv.get(key) : memory.get(key)) || 0;
  if (used >= DAILY_LIMIT) return null;
  if (kv) await kv.put(key, String(used + 1), { expirationTtl: 60 * 60 * 36 });
  else memory.set(key, used + 1);
  return DAILY_LIMIT - used - 1;
}

export const chatConfigured = (env) => !!env.GEMINI_API_KEY;

/** Models to try, in order: GEMINI_MODEL first when set, then the defaults. */
export function modelsFor(env) {
  const own = /^[\w.-]{3,60}$/.test(env.GEMINI_MODEL || '') ? [env.GEMINI_MODEL] : [];
  return [...new Set([...own, ...DEFAULT_MODELS])];
}

/** A message that says what went wrong, without exposing the key. */
export function geminiErrorMessage(status, data) {
  const s = data?.error?.status || '';
  const msg = data?.error?.message || '';
  if (status === 400 && /api key/i.test(msg)) return 'The AI key on this site is not valid. The site owner needs to check GEMINI_API_KEY.';
  if (status === 403 || s === 'PERMISSION_DENIED') return 'The AI key on this site is not allowed to use Gemini. The site owner needs to check the key in Google AI Studio.';
  if (/location|region|country/i.test(msg)) return 'Gemini is not available from this server location right now.';
  return `The assistant could not answer right now (Gemini ${status}${s ? ` ${s}` : ''}).`;
}

export async function handleChat(request, env) {
  if (request.method !== 'POST') return json({ error: 'Use POST.' }, 405);
  if (!chatConfigured(env)) return json({ error: 'The AI assistant is not set up on this site yet.', configured: false }, 503);
  const token = request.headers.get('Authorization')?.replace(/^Bearer /, '');
  const session = await readSessionWith(token, sessionKeys(env));
  if (!session?.subject) return json({ error: 'Your session expired. Refresh your courses, then try again.' }, 401);

  let body;
  try { body = await readJson(request, 40000); }
  catch (err) { return json({ error: err.status === 413 ? 'That message is too long.' : 'Invalid message.' }, err.status || 400); }
  const chat = cleanChat(body);
  if (!chat) return json({ error: 'Type a question first.' }, 400);

  // A student in crisis gets help right away, and it doesn't use up a message.
  if (isCrisis(chat.messages.at(-1).text)) return json({ reply: CRISIS_REPLY, crisis: true });

  const remaining = await useOne(env, session.subject);
  if (remaining == null) return json({ error: `You've used all ${DAILY_LIMIT} questions for today. They reset at midnight.`, remaining: 0 }, 429);

  const models = modelsFor(env);
  const payload = JSON.stringify(geminiRequest(chat));
  let res, data;
  for (const model of models) {
    try {
      res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
        body: payload,
        signal: AbortSignal.timeout(25000),
      });
    } catch {
      return json({ error: 'The assistant took too long to answer. Try again.', remaining }, 504);
    }
    data = await res.json().catch(() => null);
    // A model this key can't use (retired, or not offered to new keys): try the next.
    if (res.ok || !(res.status === 404 || (res.status === 400 && /model/i.test(data?.error?.message || '')))) break;
  }
  if (res.status === 429) return json({ error: 'The assistant is busy right now (free plan limit). Try again in a minute.', remaining }, 503);
  if (!res.ok) {
    // Logged for `wrangler pages deployment tail`; never includes the key.
    console.log('Gemini error', res.status, data?.error?.status, data?.error?.message);
    return json({ error: geminiErrorMessage(res.status, data), remaining }, 502);
  }
  const reply = replyText(data);
  if (!reply) return json({ reply: "I can't help with that one. Try asking about a school subject, studying, or your courses.", remaining });
  return json({ reply, remaining });
}
