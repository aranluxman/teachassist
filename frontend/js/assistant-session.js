// ============================================================================
// Assistant conversation storage — session-only and per account.
// ----------------------------------------------------------------------------
// The chat lives in memory while the app is open and in this tab's
// sessionStorage, so switching tabs or reloading keeps it, while closing the
// tab ends it. Every conversation is keyed by the active account (student
// number, or "demo"), so one student's chat never appears for another.
// Nothing here is sent anywhere.
// ============================================================================

import { accountKey } from "./student-store.js";

const memory = new Map();
const MAX_MESSAGES = 80;
const storeKey = (account) => `ta-chat:${account}`;
const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export function emptyState() {
  return { topic: { course: null, intent: null, meta: null, minutes: null }, pending: null };
}

function fresh() {
  return { id: newId(), messages: [], state: emptyState(), draft: "", busy: false };
}

function load(account) {
  try {
    const saved = JSON.parse(sessionStorage.getItem(storeKey(account)) || "null");
    if (saved && Array.isArray(saved.messages)) {
      // A reply that was still on its way when the page reloaded can't arrive.
      const messages = saved.messages.map((m) =>
        m.status === "pending"
          ? { ...m, status: "error", text: "This reply was interrupted.", retryText: m.retryText }
          : m,
      ).filter((m) => m.status !== "error" || m.retryText);
      return { ...fresh(), ...saved, messages, busy: false, state: saved.state || emptyState() };
    }
  } catch { /* storage unavailable or corrupt — start fresh */ }
  return fresh();
}

/** The active account's conversation (created on first use). */
export function conversation() {
  const account = accountKey();
  if (!memory.has(account)) memory.set(account, load(account));
  return memory.get(account);
}

/** Persist the active account's conversation for this tab session. */
export function saveConversation(convo = conversation()) {
  const account = accountKey();
  if (memory.get(account) !== convo) return; // a stale conversation never overwrites
  convo.messages = convo.messages.slice(-MAX_MESSAGES);
  try {
    const { busy, ...rest } = convo;
    sessionStorage.setItem(storeKey(account), JSON.stringify(rest));
  } catch { /* the chat still works for this page view */ }
}

/** Start a new chat for the active account. */
export function resetConversation() {
  const account = accountKey();
  const convo = fresh();
  memory.set(account, convo);
  try { sessionStorage.removeItem(storeKey(account)); } catch { /* ignore */ }
  return convo;
}

export function messageId() {
  return newId();
}

/**
 * Open the assistant focused on one course (from its detail page). Only the
 * course's code, name and visible mark are used, on this device.
 */
export function askAboutCourse({ code, title, markText }) {
  const convo = conversation();
  const last = convo.messages.at(-1);
  convo.state = { ...convo.state, topic: { ...convo.state.topic, course: code, intent: "course", meta: null }, pending: null };
  if (!(last && last.courseIntro === code)) {
    convo.messages.push({
      id: newId(),
      role: "assistant",
      courseIntro: code,
      title: `Let's talk ${title}`,
      badge: "Course context",
      text: `${markText ? `You're at ${markText} in ${title} right now (from TeachAssist). ` : ""}What would you like to know about ${title}?`,
      suggestions: [`How can I improve in ${title}?`, `What do I need on the ${title} final to get 90?`, `Make me a study plan for ${title}`],
      status: "done",
    });
  }
  saveConversation(convo);
}
