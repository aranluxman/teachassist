import { el, escapeHtml, fmtPercent } from "./courses.js";
import { getCourses, displayMark } from "./ta-client.js";
import { preferences, savePreferences } from "./personalization.js";
export async function renderDreams(container) {
  const p = preferences();
  container.innerHTML = "";
  container.append(
    el(
      `<div class="screen-header"><div><div class="eyebrow">A LITTLE CLOSER, EVERY DAY</div><h1>Dream big.<br><span class="accent-text">Start here.</span></h1></div><span class="feature-symbol">✧</span></div>`,
    ),
  );
  const form = el(
    `<form class="card dream-form"><h2>Your next chapter</h2><p class="muted">A place for what you’re working toward. You can change your mind anytime.</p><div class="form-grid">${[
      ["career", "Dream career", "e.g. Software engineer"],
      [
        "school",
        "School or destination",
        "e.g. University, college, apprenticeship",
      ],
    ]
      .map(
        ([id, label, ph]) =>
          `<div class="field"><label for="dream-${id}">${label}</label><input id="dream-${id}" name="${id}" maxlength="120" placeholder="${ph}" value="${escapeHtml(p[id])}"></div>`,
      )
      .join(
        "",
      )}<div class="field"><label for="dream-target">Dream average (%)</label><input id="dream-target" name="target" type="number" min="0" max="100" step="0.1" required value="${escapeHtml(p.target)}"></div><div class="field"><label for="dream-motivation">Your reason to keep going</label><input id="dream-motivation" name="motivation" maxlength="240" placeholder="What makes this matter to you?" value="${escapeHtml(p.motivation)}"></div></div><button class="btn" type="submit">Save my dreams <span>↗</span></button><p class="small muted" role="status">Saved only in this browser, separately for each account.</p></form>`,
  );
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const d = new FormData(form);
    try {
      savePreferences({
        career: d.get("career").trim(),
        school: d.get("school").trim(),
        motivation: d.get("motivation").trim(),
        target: Number(d.get("target")),
      });
      form.querySelector("[role=status]").textContent =
        "Your dreams are saved. One step at a time.";
    } catch {
      form.querySelector("[role=status]").textContent =
        "Could not save. Check browser storage access.";
    }
  });
  container.append(form);
  const section = el(
    '<section><div class="section-label">Dream grades by course</div><p class="muted small">Personal targets, not admission requirements or official grade predictions.</p><div class="goal-list"></div></section>',
  );
  container.append(section);
  try {
    const courses = await getCourses();
    if (!courses.length)
      section.querySelector(".goal-list").textContent =
        "Your courses will appear here once available.";
    courses.forEach((c, i) => {
      const mark = displayMark(c),
        target = p.goals[c.code] ?? p.target;
      const row = el(
        `<div class="card goal-row"><div><h3>${escapeHtml(c.name || c.code)}</h3><div class="muted small">Current <span class="private-mark">${fmtPercent(mark)}</span> · ${escapeHtml(c.code)}</div></div><p class="goal-gap small accent-text"></p><label for="goal-${i}" class="small">Target %<input id="goal-${i}" type="number" min="0" max="100" step="0.1" required value="${escapeHtml(target)}"></label></div>`,
      );
      const updateGap = () => {
        const target = Number(row.querySelector("input").value);
        row.querySelector(".goal-gap").textContent =
          mark == null
            ? "Awaiting a grade"
            : mark >= target
              ? "Target reached ✧"
              : `${(target - mark).toFixed(1)} points to your target`;
      };
      updateGap();
      row.querySelector("input").addEventListener("input", (e) => {
        if (e.target.checkValidity()) {
          savePreferences({
            goals: { ...preferences().goals, [c.code]: Number(e.target.value) },
          });
          updateGap();
        }
      });
      section.querySelector(".goal-list").append(row);
    });
  } catch {
    section.querySelector(".goal-list").textContent =
      "Courses could not load. Your dream profile can still be saved.";
  }
}
