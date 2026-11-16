// ============================================================================
// Ask AI (Guidance → Ask AI, #guidance/assistant): a school-focused study
// assistant. Questions go to this site's backend (POST /api/chat), which calls
// Google Gemini with the key kept on the server. Only this chat thread is
// sent, plus course marks while "Share my marks" is on (off by default).
// The thread is kept on this device only.
// ============================================================================

import { el, escapeHtml, courseTitle } from "./courses.js";
import { getCourses, isDemo, sessionToken, workerUrl, displayMark } from "./ta-client.js";
import { readStudentData, writeStudentData } from "./student-store.js";

const KEY = "assistant";
const MAX_KEEP = 40;
const SUGGESTIONS = [
  "Explain photosynthesis like I'm 12",
  "How do I write a strong thesis statement?",
  "Quiz me on French passé composé",
  "Make me a study plan for a math test in 5 days",
  "What courses do I need for engineering?",
];
const SEND = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12 20 4l-6 16-3-7z"/></svg>';
const SPARK = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2.5c.5 4.6 2.9 7 9.5 9.5-6.6 2.5-9 4.9-9.5 9.5-.5-4.6-2.9-7-9.5-9.5 6.6-2.5 9-4.9 9.5-9.5z"/></svg>';

const readState = () => {
  const s = readStudentData(KEY, null);
  return { messages: Array.isArray(s?.messages) ? s.messages : [], shareMarks: s?.shareMarks === true };
};
const saveState = (s) => { try { writeStudentData(KEY, { ...s, messages: s.messages.slice(-MAX_KEEP) }); } catch { /* device full */ } };

/**
 * Light formatting for replies: **bold**, `code`, "- " / "* " / "1. " lists
 * and paragraphs. Everything is escaped first, so no HTML from the model runs.
 */
export function formatReply(text) {
  const inline = (s) => escapeHtml(s).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/`([^`]+)`/g, "<code>$1</code>");
  const out = [];
  let list = null;
  const close = () => { if (list) { out.push(`</${list}>`); list = null; } };
  for (const raw of String(text || "").split("\n")) {
    const line = raw.trimEnd();
    const bullet = /^\s*[-*•]\s+(.*)$/.exec(line);
    const num = /^\s*\d+[.)]\s+(.*)$/.exec(line);
    if (bullet || num) {
      const tag = bullet ? "ul" : "ol";
      if (list !== tag) { close(); out.push(`<${tag}>`); list = tag; }
      out.push(`<li>${inline((bullet || num)[1])}</li>`);
    } else if (!line.trim()) {
      close();
    } else {
      close();
      const h = /^#{1,4}\s+(.*)$/.exec(line);
      out.push(h ? `<p><b>${inline(h[1])}</b></p>` : `<p>${inline(line)}</p>`);
    }
  }
  close();
  return out.join("");
}

/** Ask the backend. Resolves { reply, remaining } or throws an Error with a friendly message. */
async function ask(messages, marks) {
  for (let attempt = 0; attempt < 2; attempt++) {
    let token = sessionToken();
    if (!token || attempt) {
      await getCourses({ refresh: true }).catch(() => {});
      token = sessionToken();
    }
    if (!token) throw new Error("Sign in again to use the assistant.");
    let res;
    try {
      res = await fetch(`${workerUrl()}/api/chat`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ messages, ...(marks ? { marks } : {}) }),
        signal: AbortSignal.timeout(30000),
      });
    } catch { throw new Error("Couldn't reach the assistant. Check your connection and try again."); }
    if (res.status === 401 && attempt === 0) continue;
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "The assistant couldn't answer right now.");
    return data;
  }
  throw new Error("Sign in again to use the assistant.");
}

export async function renderAssistant(container) {
  container.innerHTML = "";
  const nav = el(`<div class="detail-nav"><button class="back-btn">Guidance</button><div class="detail-titlewrap"><div class="detail-title">Ask AI</div><div class="detail-subtitle">Your study assistant</div></div><div></div></div>`);
  nav.querySelector(".back-btn").onclick = () => window.AppNav.toGuidance();
  container.append(nav);

  const state = readState();
  const app = el(`<section class="card ai-app" aria-label="AI assistant">
    <div class="ai-top">
      <label class="ai-share"><input type="checkbox" data-share><span>Share my marks<small>Lets it tailor advice. Off by default.</small></span></label>
      <button type="button" class="ai-new" data-new>New chat</button>
    </div>
    <div class="ai-log" role="log" aria-live="polite"></div>
    <p class="ai-status small muted" role="status"></p>
    <form class="ai-form">
      <label class="sr-only" for="ai-input">Ask a question</label>
      <textarea id="ai-input" rows="1" maxlength="2000" placeholder="Ask about any subject, essay, study plan…" enterkeyhint="send"></textarea>
      <button type="submit" class="ai-send" aria-label="Send">${SEND}</button>
    </form>
    <p class="ai-foot">AI can make mistakes, so double-check important facts with your teacher. Don't share passwords or personal info. Answers come from Google Gemini.</p>
  </section>`);
  container.append(app);

  const log = app.querySelector(".ai-log");
  const input = app.querySelector("textarea");
  const status = app.querySelector(".ai-status");
  const sendBtn = app.querySelector(".ai-send");
  const share = app.querySelector("[data-share]");
  share.checked = state.shareMarks;

  const bubble = (m) => {
    const b = el(`<div class="ai-msg ai-${m.role}"></div>`);
    if (m.role === "assistant") b.innerHTML = `<span class="ai-avatar" aria-hidden="true">${SPARK}</span><div class="ai-text">${formatReply(m.text)}</div>`;
    else b.append(Object.assign(document.createElement("div"), { className: "ai-text", textContent: m.text }));
    return b;
  };
  const draw = () => {
    log.replaceChildren(...state.messages.map(bubble));
    if (!state.messages.length) {
      const hello = el(`<div class="ai-hello"><span class="ai-hello-icon" aria-hidden="true">${SPARK}</span><h2>What do you want to learn?</h2><p>I can explain concepts, help you plan essays, quiz you, and build study plans. I'll guide you instead of just giving answers.</p><div class="ai-chips"></div></div>`);
      SUGGESTIONS.forEach((q) => {
        const chip = el(`<button type="button" class="ai-chip"></button>`);
        chip.textContent = q;
        chip.onclick = () => send(q);
        hello.querySelector(".ai-chips").append(chip);
      });
      log.append(hello);
    }
    log.scrollTop = log.scrollHeight;
  };

  if (isDemo()) {
    input.disabled = sendBtn.disabled = true;
    status.textContent = "Sign in with your TeachAssist account to use the assistant (it isn't available in demo mode).";
  }

  let busy = false;
  const send = async (text) => {
    text = String(text || "").trim();
    if (!text || busy || isDemo()) return;
    busy = true;
    sendBtn.disabled = true;
    status.textContent = "";
    state.messages.push({ role: "user", text });
    saveState(state);
    input.value = "";
    autosize();
    draw();
    const typing = el(`<div class="ai-msg ai-assistant ai-typing"><span class="ai-avatar" aria-hidden="true">${SPARK}</span><div class="ai-text"><i></i><i></i><i></i><span class="sr-only">Thinking…</span></div></div>`);
    log.append(typing);
    log.scrollTop = log.scrollHeight;
    try {
      let marks = null;
      if (state.shareMarks) {
        const courses = await getCourses().catch(() => []);
        marks = courses.map((c) => ({ name: courseTitle(c), mark: displayMark(c) }));
      }
      const { reply, remaining } = await ask(state.messages.slice(-12).map(({ role, text }) => ({ role, text })), marks);
      state.messages.push({ role: "assistant", text: reply });
      saveState(state);
      if (Number.isFinite(remaining) && remaining <= 5) status.textContent = `${remaining} question${remaining === 1 ? "" : "s"} left today.`;
    } catch (err) {
      // Put the question back so it isn't lost.
      state.messages.pop();
      saveState(state);
      input.value = text;
      autosize();
      status.textContent = err.message;
    } finally {
      typing.remove();
      busy = false;
      sendBtn.disabled = false;
      draw();
    }
  };

  const autosize = () => { input.style.height = "auto"; input.style.height = `${Math.min(input.scrollHeight, 160)}px`; };
  input.addEventListener("input", autosize);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(input.value); }
  });
  app.querySelector(".ai-form").addEventListener("submit", (e) => { e.preventDefault(); send(input.value); });
  share.onchange = () => { state.shareMarks = share.checked; saveState(state); };
  app.querySelector("[data-new]").onclick = () => {
    state.messages = [];
    state.shareMarks = false; // a new chat starts private again
    share.checked = false;
    status.textContent = "";
    saveState(state);
    draw();
    input.focus();
  };
  draw();
}
