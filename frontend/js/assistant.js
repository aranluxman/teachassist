// ============================================================================
// Assistant screen — a conversational chat.
// ----------------------------------------------------------------------------
// Compact header (New chat, Quick calculator), a scrolling conversation, and
// a composer pinned above the tab bar. Conversation memory and follow-ups
// come from assistant-chat.js; storage (session-only, per account) from
// assistant-session.js. Marks, plans and school questions are answered on
// this device and grade numbers are always calculated locally. When the site
// has the AI tutor (/api/status → tutor), other questions go to /api/chat with
// only the tutor thread (and marks only if "Share my marks" is on). Without
// it, grade maths it can't parse goes to the /api/assistant extractor.
// ============================================================================

import { el, escapeHtml, courseLabel, courseTitle } from "./courses.js";
import { workerUrl, sessionToken, isDemo, getCourses, displayMark } from "./ta-client.js";
import { splitByTerm } from "./term.js";
import { accountKey } from "./student-store.js";
import { respond, aiClarification, STARTERS } from "./assistant-chat.js";
import { conversation, saveConversation, resetConversation, messageId } from "./assistant-session.js";
import { mySchool } from "./schools.js";
import { ossdProgress } from "./ossd.js";
import { volunteerTotal } from "./volunteer.js";
import { calculatePlan } from "./grade-math.js";
import { preferences } from "./personalization.js";
import { countUp, motionEnabled, replay, shake, typingIndicator } from "./motion.js";

const SEND_ICON = `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7"/></svg>`;
const CALC_KIND = { required: "Target grade", projected: "Final grade", arithmetic: "Arithmetic", average: "Weighted average" };

let view = null; // the mounted screen: { container, renderLog, setBusy }
let controller = null; // aborts an AI request when the chat is reset
let lastSend = { text: "", at: 0 };
let tutorStatus = null; // Promise<boolean>: does this site have the AI tutor?

/** Ask the backend once per page load whether the AI tutor is set up. */
function tutorAvailable() {
  if (isDemo()) return Promise.resolve(false);
  tutorStatus ||= fetch(workerUrl() + "/api/status", { signal: AbortSignal.timeout(8000) })
    .then((r) => (r.ok ? r.json() : {}))
    .then((d) => d.tutor === true)
    .catch(() => false);
  return tutorStatus;
}

// What the assistant knows: the student's own data on this device.
async function loadContext() {
  const courses = await getCourses().catch(() => []);
  return {
    courses,
    school: await mySchool().catch(() => null),
    ossd: ossdProgress(courses),
    volunteerHours: Math.round(volunteerTotal() * 100) / 100,
    demo: isDemo(),
    tutor: await tutorAvailable(),
  };
}

function calcReply(plan) {
  const result = calculatePlan(plan);
  return {
    title: CALC_KIND[plan.kind] || "Calculation",
    badge: "Calculated",
    text: result.text,
    detail: "Worked out on this device from the numbers in your message — not an official grade.",
    suggestions: ["What do I need on my math final to get 90?", "Make me a study plan for this week"],
  };
}

async function askAI(question, signal) {
  let response;
  try {
    response = await fetch(workerUrl() + "/api/assistant", {
      method: "POST",
      headers: { "content-type": "application/json", Authorization: `Bearer ${sessionToken()}` },
      body: JSON.stringify({ question }),
      signal: AbortSignal.any ? AbortSignal.any([signal, AbortSignal.timeout(30000)]) : signal,
    });
  } catch (err) {
    if (err.name === "AbortError" && signal.aborted) throw err;
    if (err.name === "TimeoutError") throw new Error("The assistant took too long to answer.");
    throw new Error("Couldn't reach the assistant. Check your connection.");
  }
  const data = await response.json().catch(() => ({}));
  if (response.status === 401) throw new Error("Your assistant session expired. Refresh your courses (↻ on Courses), then retry.");
  if (!response.ok) throw new Error(data.error || "The AI helper is unavailable right now. The quick calculator still works.");
  return data;
}

/** The marks a student chose to share: course names and current marks only. */
function sharedMarks(courses) {
  const shown = preferences().currentTermOnly ? splitByTerm(courses).current : courses;
  return shown.slice(0, 12).map((c) => ({ course: `${courseTitle(c)} (${courseLabel(c)})`, mark: displayMark(c) }));
}

async function askTutor(messages, marks, signal) {
  let response;
  try {
    response = await fetch(workerUrl() + "/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json", Authorization: `Bearer ${sessionToken()}` },
      body: JSON.stringify(marks.length ? { messages, marks } : { messages }),
      signal: AbortSignal.any ? AbortSignal.any([signal, AbortSignal.timeout(35000)]) : signal,
    });
  } catch (err) {
    if (err.name === "AbortError" && signal.aborted) throw err;
    if (err.name === "TimeoutError") throw new Error("The AI tutor took too long to answer.");
    throw new Error("Couldn't reach the AI tutor. Check your connection.");
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "The AI tutor is unavailable right now.");
  return data;
}

/** Send one student message (or retry one) and add the reply. */
async function send(text, { retryId = null } = {}) {
  const convo = conversation();
  const q = String(text || "").trim();
  if (!q || convo.busy) return;
  // A double tap or repeated Enter never sends the same message twice.
  if (!retryId && q === lastSend.text && Date.now() - lastSend.at < 1500) return;
  lastSend = { text: q, at: Date.now() };

  const account = accountKey();
  const stale = () => conversation() !== convo || accountKey() !== account;
  convo.busy = true;
  if (retryId) convo.messages = convo.messages.filter((m) => m.id !== retryId);
  else convo.messages.push({ id: messageId(), role: "user", text: q, status: "done" });
  const pending = { id: messageId(), role: "assistant", status: "pending", retryText: q };
  convo.messages.push(pending);
  saveConversation(convo);
  view?.renderLog({ stick: true });
  view?.setBusy(true);

  controller = new AbortController();
  const signal = controller.signal;
  let message, nextState = convo.state;
  try {
    const ctx = await loadContext();
    if (stale()) return;
    const step = respond(q, convo.state, ctx);
    nextState = step.state;
    if (step.kind === "reply") message = step.reply;
    else if (step.kind === "calc") message = calcReply(step.plan);
    else if (step.kind === "chat") {
      // The tutor sees only its own thread: what was sent to it and its replies.
      const asked = convo.messages.findLast((m) => m.role === "user" && m.text === q);
      if (asked) asked.via = "chat";
      const history = convo.messages
        .filter((m) => m.via === "chat" && m.status === "done")
        .map((m) => ({ role: m.role, content: m.text }))
        .slice(-12);
      const data = await askTutor(history, convo.shareMarks ? sharedMarks(ctx.courses) : [], signal);
      const left = Number.isFinite(data.remaining) && data.remaining <= 5 ? ` · ${data.remaining} left today` : "";
      message = { badge: `AI tutor${left}`, text: data.reply, via: "chat", tutor: true, suggestions: [] };
    } else {
      const data = await askAI(step.question, signal);
      if (data.clarification) {
        message = { title: "One more thing", badge: "Needs info", text: data.clarification };
        nextState = aiClarification(step.state, step.question, data.clarification);
      } else message = calcReply(data.plan);
    }
  } catch (err) {
    if (err.name === "AbortError" || stale()) return;
    message = { status: "error", text: err.message || "Something went wrong.", retryText: q };
  } finally {
    if (!stale()) {
      convo.busy = false;
      const i = convo.messages.findIndex((m) => m.id === pending.id);
      if (i >= 0 && message) convo.messages[i] = { id: pending.id, role: "assistant", status: "done", ...message };
      else if (i >= 0) convo.messages.splice(i, 1);
      if (message && message.status !== "error") convo.state = nextState;
      saveConversation(convo);
      view?.renderLog({ stick: false });
      view?.setBusy(false);
    }
  }
}

function newChat() {
  controller?.abort();
  controller = null;
  lastSend = { text: "", at: 0 };
  resetConversation();
  view?.resetShare?.();
}

// ───────────────────────────── rendering ───────────────────────────────────

function actionLinks(actions = []) {
  if (!actions.length) return "";
  return `<div class="msg-actions">${actions.map((a) => `<a class="chip" href="#${escapeHtml(a.route)}">${escapeHtml(a.label)} →</a>`).join("")}</div>`;
}

let tutorOn = false; // set once /api/status answers

/**
 * Tutor replies may use light Markdown. Render **bold**, headings and list
 * markers safely as text nodes — never as HTML.
 */
function fillText(target, text, rich) {
  if (!rich) { target.textContent = text; return; }
  const lines = String(text).replace(/\r/g, "").split("\n").map((line) =>
    line.replace(/^\s*#{1,6}\s+(.*)$/, "**$1**").replace(/^(\s*)[-*]\s+/, "$1• "));
  lines.forEach((line, i) => {
    line.split(/\*\*(.+?)\*\*/g).forEach((part, j) => {
      if (!part) return;
      if (j % 2) { const b = document.createElement("b"); b.textContent = part; target.append(b); }
      else target.append(part.replace(/`([^`]+)`/g, "$1"));
    });
    if (i < lines.length - 1) target.append("\n");
  });
}

function messageNode(m, isLatest) {
  if (m.role === "user") {
    const node = el(`<div class="msg msg-user"><span class="sr-only">You said:</span><p></p></div>`);
    node.querySelector("p").textContent = m.text;
    return node;
  }
  if (m.status === "pending") {
    const node = el(`<div class="msg msg-bot msg-pending"><span class="sr-only">The assistant is replying…</span><p></p></div>`);
    node.querySelector("p").append(typingIndicator());
    return node;
  }
  if (m.status === "error") {
    const node = el(`<div class="msg msg-bot msg-error" role="alert"><b>That didn't work</b><p></p><div class="msg-actions"><button type="button" class="chip" data-retry>Retry</button></div></div>`);
    node.querySelector("p").textContent = m.text;
    node.querySelector("[data-retry]").onclick = () => send(m.retryText, { retryId: m.id });
    return node;
  }
  const node = el(`<div class="msg msg-bot"><span class="sr-only">Assistant:</span>${m.title || m.badge ? `<div class="msg-head">${m.title ? `<b class="msg-title"></b>` : ""}${m.badge ? `<span class="msg-badge"></span>` : ""}</div>` : ""}<p class="msg-text"></p>${m.detail ? `<details class="msg-detail"><summary>More detail</summary><p></p></details>` : ""}${actionLinks(m.actions)}</div>`);
  if (m.title) node.querySelector(".msg-title").textContent = m.title;
  if (m.badge) node.querySelector(".msg-badge").textContent = m.badge;
  fillText(node.querySelector(".msg-text"), m.text, m.tutor);
  if (m.detail) node.querySelector(".msg-detail p").textContent = m.detail;
  if (isLatest && m.suggestions?.length) {
    const row = el(`<div class="msg-suggest" role="group" aria-label="Suggested replies"></div>`);
    for (const s of m.suggestions.slice(0, 4)) {
      const b = el(`<button type="button" class="suggest-chip"></button>`);
      b.textContent = s;
      b.onclick = () => send(s);
      row.append(b);
    }
    node.append(row);
  }
  return node;
}

function emptyNode() {
  const name = preferences().name;
  const node = el(`<div class="chat-empty">
    <span class="chat-empty-mark" aria-hidden="true">✦</span>
    <h2>${name ? `Hey ${escapeHtml(name)}, what can I help with?` : "What can I help with?"}</h2>
    <p class="muted">Marks, finals, study plans, school info and graduation. Ask in your own words — I'll follow along.</p>
    <div class="chat-starters" role="group" aria-label="Starter questions"></div>
    <p class="small muted chat-privacy">${tutorOn
      ? "Marks, plans and school questions are answered on this device. Other questions go to the AI tutor (OpenAI): only the messages you send it and its replies — plus course names and current marks if you turn on “Share my marks”. Never your login or student number. Up to 30 tutor messages a day. This chat clears when you close the tab."
      : "Answers are worked out on this device from your TeachAssist marks. If I can't parse a grade-math question, only the words you typed (and the question it follows up on) go to the AI helper — never your marks, courses or login. This chat clears when you close the tab."}</p>
  </div>`);
  const row = node.querySelector(".chat-starters");
  const starters = tutorOn ? [STARTERS[0], STARTERS[1], "Explain photosynthesis simply"] : STARTERS;
  for (const s of starters) {
    const b = el(`<button type="button" class="suggest-chip"></button>`);
    b.textContent = s;
    b.onclick = () => send(s);
    row.append(b);
  }
  return node;
}

/** Fit the chat between the top bar and the tab bar, above the keyboard. */
function sizeChat() {
  const root = document.documentElement;
  const vv = window.visualViewport;
  const height = vv ? vv.height : window.innerHeight;
  const typing = document.activeElement?.id === "chat-input";
  root.classList.toggle("kb-open", typing && window.innerHeight - height > 120);
  const topbar = document.querySelector(".app-topbar");
  const tabbar = document.getElementById("tabbar");
  const top = topbar ? Math.max(0, topbar.getBoundingClientRect().bottom) : 0;
  const tabTop = tabbar && getComputedStyle(tabbar).display !== "none" ? tabbar.getBoundingClientRect().top : window.innerHeight;
  root.style.setProperty("--chat-vh", `${Math.round(height)}px`);
  root.style.setProperty("--chat-top", `${Math.round(top)}px`);
  root.style.setProperty("--chat-bottom", `${Math.max(0, Math.round(window.innerHeight - tabTop))}px`);
}
let sizingInstalled = false;
function installSizing() {
  if (sizingInstalled) return;
  sizingInstalled = true;
  const onChange = () => { if (view?.container.isConnected && !view.container.classList.contains("hidden")) sizeChat(); };
  window.addEventListener("resize", onChange);
  window.visualViewport?.addEventListener("resize", onChange);
  window.visualViewport?.addEventListener("scroll", onChange);
  document.addEventListener("focusin", onChange);
  document.addEventListener("focusout", () => setTimeout(onChange, 50));
  new MutationObserver(() => { if (view?.container.classList.contains("hidden")) document.documentElement.classList.remove("kb-open"); })
    .observe(document.getElementById("screen-assistant") || document.body, { attributes: true, attributeFilter: ["class"] });
}

export function renderAssistant(container) {
  container.classList.add("chat-screen");
  container.innerHTML = `
    <header class="chat-head">
      <h1>Assistant</h1>
      <div class="chat-head-actions">
        <button type="button" class="btn ghost chat-tool" data-calc aria-expanded="false" aria-controls="chat-calc">Calculator</button>
        <button type="button" class="btn ghost chat-tool" data-new>New chat</button>
      </div>
    </header>
    <section id="chat-calc" class="card chat-calc" hidden aria-label="Quick calculator">
      <form class="quick-calc"><p class="small muted">Quick calculator · works without AI</p><div class="form-grid"><div class="field"><label for="calc-current">Current grade (%)</label><input id="calc-current" name="current" type="number" inputmode="decimal" min="0" max="100" step="any" value="85" required></div><div class="field"><label for="calc-target">Target grade (%)</label><input id="calc-target" name="target" type="number" inputmode="decimal" min="0" max="100" step="any" value="90" required></div><div class="field"><label for="calc-remaining">Remaining weight (%)</label><input id="calc-remaining" name="remaining" type="number" inputmode="decimal" min="0.01" max="100" step="any" value="30" required></div></div><button class="btn secondary">Find required grade</button><p class="calc-result" role="status"></p></form>
    </section>
    <div class="chat-scroll" role="log" aria-label="Conversation" aria-live="polite" tabindex="0"><div class="chat-list"></div></div>
    <button type="button" class="chat-jump hidden">New message ↓</button>
    <form class="composer" novalidate>
      <label for="chat-input" class="sr-only">Message the assistant</label>
      <textarea id="chat-input" rows="1" maxlength="1500" enterkeyhint="send" placeholder="Ask about marks, plans, school…"></textarea>
      <button type="submit" class="send-btn" aria-label="Send message">${SEND_ICON}</button>
    </form>
    <label class="share-toggle" hidden><input type="checkbox" role="switch" id="share-marks"><span>Share my marks with the AI tutor</span></label>`;

  const scroll = container.querySelector(".chat-scroll");
  const list = container.querySelector(".chat-list");
  const jump = container.querySelector(".chat-jump");
  const form = container.querySelector(".composer");
  const input = form.querySelector("textarea");
  const sendBtn = form.querySelector(".send-btn");
  const calcBtn = container.querySelector("[data-calc]");
  const calcPanel = container.querySelector("#chat-calc");

  const nearBottom = () => scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight < 80;
  const toBottom = () => { scroll.scrollTop = scroll.scrollHeight; jump.classList.add("hidden"); };
  let seen = conversation().messages.length;

  const renderLog = ({ stick = false } = {}) => {
    if (!container.isConnected) return;
    const convo = conversation();
    const follow = stick || nearBottom();
    const keep = scroll.scrollTop;
    container.classList.toggle("has-messages", convo.messages.length > 0);
    list.replaceChildren();
    if (!convo.messages.length) list.append(emptyNode());
    const lastBot = convo.messages.findLastIndex((m) => m.role === "assistant" && m.status === "done");
    convo.messages.forEach((m, i) => list.append(messageNode(m, i === lastBot && i === convo.messages.length - 1)));
    if (follow) toBottom();
    else {
      scroll.scrollTop = keep;
      if (convo.messages.length > seen) jump.classList.remove("hidden");
    }
    seen = convo.messages.length;
  };
  const setBusy = (busy) => {
    sendBtn.disabled = busy;
    sendBtn.setAttribute("aria-label", busy ? "Waiting for the reply" : "Send message");
    form.classList.toggle("is-busy", busy);
  };
  // "Share my marks": off by default, per chat. Only course names and current
  // marks are added to tutor messages while it's on.
  const shareRow = container.querySelector(".share-toggle");
  const share = shareRow.querySelector("input");
  const shareLabel = shareRow.querySelector("span");
  const syncShare = () => {
    share.checked = !!conversation().shareMarks;
    shareLabel.textContent = share.checked ? "Sharing course names + current marks with the AI tutor" : "Share my marks with the AI tutor";
  };
  share.addEventListener("change", () => { const c = conversation(); c.shareMarks = share.checked; saveConversation(c); syncShare(); });
  const resetShare = () => { const c = conversation(); c.shareMarks = false; syncShare(); };
  view = { container, renderLog, setBusy, resetShare };
  syncShare();
  tutorAvailable().then((on) => {
    tutorOn = on;
    shareRow.hidden = !on;
    if (!container.isConnected) return;
    sizeChat();
    if (!conversation().messages.length) renderLog({ stick: true });
  });

  // The draft survives tab switches and re-renders; typing never resets it.
  const grow = () => { input.style.height = "auto"; input.style.height = `${Math.min(input.scrollHeight, 140)}px`; };
  input.value = conversation().draft || "";
  input.addEventListener("input", () => { const c = conversation(); c.draft = input.value; saveConversation(c); grow(); });
  input.addEventListener("keydown", (e) => {
    // Enter sends on keyboards; on touch screens Enter adds a line and the button sends.
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing && !matchMedia("(pointer: coarse)").matches) {
      e.preventDefault();
      form.requestSubmit();
    }
  });
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text || conversation().busy) return;
    input.value = "";
    const c = conversation(); c.draft = ""; saveConversation(c);
    grow();
    send(text);
  });

  scroll.addEventListener("scroll", () => { if (nearBottom()) jump.classList.add("hidden"); }, { passive: true });
  jump.onclick = toBottom;
  container.querySelector("[data-new]").onclick = () => {
    newChat();
    seen = 0;
    renderLog({ stick: true });
    setBusy(false);
    input.focus({ preventScroll: true });
  };
  calcBtn.onclick = () => {
    const open = calcPanel.hidden;
    calcPanel.hidden = !open;
    calcBtn.setAttribute("aria-expanded", String(open));
    calcBtn.classList.toggle("is-on", open);
    if (open) calcPanel.querySelector("input").focus({ preventScroll: true });
  };
  container.querySelector(".quick-calc").addEventListener("submit", quickCalc);

  installSizing();
  sizeChat();
  requestAnimationFrame(sizeChat);
  grow();
  renderLog({ stick: true });
  setBusy(conversation().busy);
}

/** The existing quick calculator — unchanged behaviour. */
function quickCalc(e) {
  e.preventDefault();
  const d = new FormData(e.target);
  const out = e.target.querySelector(".calc-result");
  out.classList.remove("m-impossible", "m-shake");
  try {
    const result = calculatePlan({
      kind: "required",
      current: Number(d.get("current")),
      target: Number(d.get("target")),
      remaining: Number(d.get("remaining")),
    });
    out.textContent = result.text;
    replay(out, "m-reveal");
    // A grade above 100 % cannot be earned — say so, gently.
    const impossible = typeof result.value === "number" && result.value > 100;
    if (impossible) {
      out.classList.add("m-impossible");
      shake(out);
    } else if (motionEnabled() && typeof result.value === "number") {
      // Count the headline number up, then restore the calculator's own
      // wording verbatim so the final text is exactly what it always was.
      const rest = result.text.slice(result.text.indexOf("\n"));
      countUp(out, result.value, {
        from: 0,
        duration: 700,
        isMark: false,
        format: (v) => `You need ${v.toFixed(1)}% on the remaining work.${rest}`,
      });
      setTimeout(() => {
        if (out.isConnected) out.textContent = result.text;
      }, 780);
    }
  } catch (err) {
    out.textContent = err.message;
    out.classList.add("m-impossible");
    replay(out, "m-reveal");
    shake(out);
  }
}
