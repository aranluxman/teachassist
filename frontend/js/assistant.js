import { el, escapeHtml } from "./courses.js";
import { workerUrl, sessionToken, isDemo, getCourses } from "./ta-client.js";
import { answer } from "./assistant-brain.js";
import { mySchool } from "./schools.js";
import { ossdProgress } from "./ossd.js";
import { volunteerTotal } from "./volunteer.js";
import { calculatePlan, localPlan } from "./grade-math.js";
import {
  countUp,
  motionEnabled,
  replay,
  shake,
  stagger,
  typingIndicator,
} from "./motion.js";
export function renderAssistant(container) {
  container.innerHTML = `<div class="screen-header"><div><div class="eyebrow">LESS GUESSWORK. MORE CLARITY.</div><h1>A little help.<br><span class="accent-text">A clearer path.</span></h1></div><span class="feature-symbol">✦</span></div><div class="card assistant-intro"><span class="badge">YOUR MARKS · YOUR SCHOOL · YOUR PLAN</span><h2>Ask about your marks, your school or graduating.</h2><p class="muted">It reads your courses, school and diploma tracker on this device. Try one:</p><div class="prompt-chips"><button type="button">What do I need on the math final to get 90?</button><button type="button">If I get 75 on the next science test?</button><button type="button">Make me a study plan</button><button type="button">What's my lowest course?</button><button type="button">What are my bell times?</button><button type="button">How many credits do I still need?</button><button type="button">How many volunteer hours do I have left?</button></div></div><div class="chat-log" role="log" aria-label="Calculation conversation" aria-live="polite"></div><form class="card chat-form"><label for="question">Ask anything about your school year</label><textarea id="question" rows="3" maxlength="1500" required placeholder="What do I need on the English final to finish with 85?"></textarea><div class="chat-footer"><span class="small muted">Answers use your data on this device. Only unrecognised maths questions go to the AI, without your marks.</span><button class="btn" type="submit">Ask ↗</button></div></form><details class="card"><summary>Quick calculator · works without AI</summary><form class="quick-calc"><div class="form-grid"><div class="field"><label for="calc-current">Current grade (%)</label><input id="calc-current" name="current" type="number" min="0" max="100" step="any" value="85" required></div><div class="field"><label for="calc-target">Target grade (%)</label><input id="calc-target" name="target" type="number" min="0" max="100" step="any" value="90" required></div><div class="field"><label for="calc-remaining">Remaining weight (%)</label><input id="calc-remaining" name="remaining" type="number" min="0.01" max="100" step="any" value="30" required></div></div><button class="btn secondary">Find required grade</button><p class="calc-result" role="status"></p></form></details>`;
  const input = container.querySelector("textarea"),
    form = container.querySelector(".chat-form"),
    log = container.querySelector(".chat-log");
  stagger([
    container.querySelector(".screen-header"),
    container.querySelector(".assistant-intro"),
  ]);
  stagger(container.querySelectorAll(".prompt-chips button"));
  container.querySelectorAll(".prompt-chips button").forEach((b) =>
    b.addEventListener("click", () => {
      input.value = b.textContent;
      form.requestSubmit();
    }),
  );
  const add = (label, text, cls, actions = []) => {
    const node = el(
      `<article class="card chat-message ${cls}"><div class="eyebrow"></div><p></p>${actions.length ? `<div class="chat-actions">${actions.map((a) => `<a class="chip" href="#${escapeHtml(a.route)}">${escapeHtml(a.label)} →</a>`).join("")}</div>` : ""}</article>`,
    );
    node.querySelector(".eyebrow").textContent = label;
    node.querySelector("p").textContent = text;
    log.append(node);
    node.scrollIntoView({ behavior: motionEnabled() ? "smooth" : "auto", block: "nearest" });
  };
  // What the assistant knows: loaded once per visit, all from this device.
  const context = (async () => {
    const courses = await getCourses().catch(() => []);
    return { courses, school: await mySchool(), ossd: ossdProgress(courses), volunteerHours: Math.round(volunteerTotal() * 100) / 100 };
  })();
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const q = input.value.trim();
    if (!q) return;
    const button = form.querySelector("button");
    button.disabled = true;
    button.textContent = "Thinking…";
    add("YOU", q, "from-user");
    input.value = "";
    // A three-dot bubble holds the assistant's place while it works.
    const pending = el(
      `<article class="card chat-message"><div class="eyebrow">THINKING</div><p></p></article>`,
    );
    pending.querySelector("p").appendChild(typingIndicator());
    log.append(pending);
    try {
      const smart = answer(q, await context);
      if (smart) {
        add(smart.title.toUpperCase(), smart.text, "", smart.actions);
        return;
      }
      let plan = localPlan(q);
      if (!plan) {
        if (isDemo())
          throw new Error(
            "I didn't catch that one. Try asking about a course mark, a final, a study plan, your school, credits or volunteer hours — or use the quick calculator.",
          );
        const response = await fetch(workerUrl() + "/api/assistant", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "Authorization": `Bearer ${sessionToken()}`,
          },
          body: JSON.stringify({ question: q }),
          signal: AbortSignal.timeout(30000),
        });
        const data = await response.json();
        if (!response.ok)
          throw new Error(
            data.error || "AI is unavailable. Please use the quick calculator.",
          );
        if (data.clarification) {
          add("ASSISTANT", data.clarification, "");
          return;
        }
        plan = data.plan;
      }
      const result = calculatePlan(plan);
      add(
        "CALCULATED · " +
          (plan.kind === "required"
            ? "TARGET GRADE"
            : plan.kind === "projected"
              ? "FINAL GRADE"
              : plan.kind === "arithmetic"
                ? "ARITHMETIC"
                : "WEIGHTED AVERAGE"),
        result.text,
        "",
      );
    } catch (err) {
      add(
        "LET’S TRY THAT AGAIN",
        err.name === "TimeoutError"
          ? "The assistant took too long. Use the quick calculator or try again."
          : err.message,
        "",
      );
    } finally {
      pending.remove();
      button.disabled = false;
      button.textContent = "Ask ↗";
    }
  });
  container.querySelector(".quick-calc").addEventListener("submit", (e) => {
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
  });
}
