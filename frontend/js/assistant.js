import { el } from "./courses.js";
import { workerUrl, apiKey, isDemo } from "./ta-client.js";
import { calculatePlan, localPlan } from "./grade-math.js";
export function renderAssistant(container) {
  container.innerHTML = `<div class="screen-header"><div><div class="eyebrow">LESS GUESSWORK. MORE CLARITY.</div><h1>A little help.<br><span class="accent-text">A clearer path.</span></h1></div><span class="feature-symbol">✦</span></div><div class="card assistant-intro"><span class="badge">MATH & GRADE ASSISTANT</span><h2>Let’s work out your next move.</h2><p class="muted">Find the grade you need, project a final mark, calculate a weighted average, or solve arithmetic. Answers show the numbers and assumptions.</p><div class="prompt-chips"><button type="button">Current 85, target 90, remaining 30</button><button type="button">Current 88, score 95, remaining 20</button><button type="button">sqrt(144) + 2^3</button></div></div><div class="chat-log" role="log" aria-label="Calculation conversation" aria-live="polite"></div><form class="card chat-form"><label for="question">What would you like to calculate?</label><textarea id="question" rows="3" maxlength="1500" required placeholder="I have 85% and my exam is worth 30%. What do I need to finish with 90%?"></textarea><div class="chat-footer"><span class="small muted">${isDemo() ? "Demo: use the examples or calculator below." : "AI reads only your question; your account and marks are not attached."}</span><button class="btn" type="submit">Calculate ↗</button></div></form><details class="card"><summary>Quick calculator · works without AI</summary><form class="quick-calc"><div class="form-grid"><div class="field"><label for="calc-current">Current grade (%)</label><input id="calc-current" name="current" type="number" min="0" max="100" step="any" value="85" required></div><div class="field"><label for="calc-target">Target grade (%)</label><input id="calc-target" name="target" type="number" min="0" max="100" step="any" value="90" required></div><div class="field"><label for="calc-remaining">Remaining weight (%)</label><input id="calc-remaining" name="remaining" type="number" min="0.01" max="100" step="any" value="30" required></div></div><button class="btn secondary">Find required grade</button><p class="calc-result" role="status"></p></form></details>`;
  const input = container.querySelector("textarea"),
    form = container.querySelector(".chat-form"),
    log = container.querySelector(".chat-log");
  container.querySelectorAll(".prompt-chips button").forEach((b) =>
    b.addEventListener("click", () => {
      input.value = b.textContent;
      input.focus();
    }),
  );
  const add = (label, text, cls) => {
    const node = el(
      `<article class="card chat-message ${cls}"><div class="eyebrow"></div><p></p></article>`,
    );
    node.querySelector(".eyebrow").textContent = label;
    node.querySelector("p").textContent = text;
    log.append(node);
  };
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const q = input.value.trim();
    if (!q) return;
    const button = form.querySelector("button");
    button.disabled = true;
    button.textContent = "Calculating…";
    add("YOU", q, "from-user");
    input.value = "";
    try {
      let plan = localPlan(q);
      if (!plan) {
        if (isDemo())
          throw new Error(
            "Natural-language AI is available with the connected Worker. In demo mode, try an example above or the quick calculator.",
          );
        const response = await fetch(workerUrl() + "/api/assistant", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-api-key": apiKey(),
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
      button.disabled = false;
      button.textContent = "Calculate ↗";
    }
  });
  container.querySelector(".quick-calc").addEventListener("submit", (e) => {
    e.preventDefault();
    const d = new FormData(e.target);
    try {
      e.target.querySelector(".calc-result").textContent = calculatePlan({
        kind: "required",
        current: Number(d.get("current")),
        target: Number(d.get("target")),
        remaining: Number(d.get("remaining")),
      }).text;
    } catch (err) {
      e.target.querySelector(".calc-result").textContent = err.message;
    }
  });
}
