// ============================================================================
// Dreams — three steps: your next chapter, your dream grades, your goals.
// Each finished step collapses to a one-line summary. Everything is saved on
// this device first and copied to the student's account (see cloud-store.js).
// ============================================================================

import { el, escapeHtml, fmtPercent, courseLabel, courseTitle } from "./courses.js";
import { courseFacts } from "./course-names.js";
import { getCourses, displayMark } from "./ta-client.js";
import { preferences } from "./personalization.js";
import { saveDreams, saveGoalList, syncFromCloud } from "./cloud-store.js";
import { splitByTerm } from "./term.js";
import {
  countUp,
  initDisclosure,
  marksHidden,
  motionEnabled,
  savedFeedback,
  sparkleBurst,
  stagger,
} from "./motion.js";

// Which course goals have already been seen at (or above) their target, so a
// sparkle burst only plays when a target is NEWLY reached.
const reachedBefore = new Map();

const CLOUD_TEXT = {
  saving: "Saving…",
  saved: "Saved to your account ✓",
  offline: "Saved on this device. We'll retry the cloud copy shortly.",
};

const tick = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>';

function steps(p) {
  const goalCount = p.goalsList.length;
  const list = [
    ["Next chapter", p.dreamDone],
    ["Dream grades", p.gradesDone],
    ["Goals", goalCount > 0],
  ];
  const active = list.findIndex(([, done]) => !done);
  return `<ol class="dream-steps" aria-label="Your progress">${list
    .map(([label, done], i) => `<li class="${done ? "is-done" : i === active ? "is-active" : ""}"><span class="dot">${done ? tick : i + 1}</span>${label}</li>`)
    .join("")}</ol>`;
}

export async function renderDreams(container) {
  const p = preferences();
  container.innerHTML = "";
  container.append(
    el(
      `<div class="screen-header v5-header"><div><h1>Dreams</h1><p>Where you're headed, the marks to get there, and the goals that matter.</p></div></div>`,
    ),
  );
  const status = el(`<p class="cloud-status small muted" role="status" aria-live="polite"></p>`);
  const onCloud = (e) => {
    if (!container.isConnected) return window.removeEventListener("ta:cloud", onCloud);
    status.textContent = CLOUD_TEXT[e.detail.state] || "";
  };
  window.addEventListener("ta:cloud", onCloud);

  container.append(el(steps(p)));
  const chapter = chapterBlock(p, container);
  const gradesHost = el(`<div class="dream-grades-host"></div>`);
  const goalsHost = goalsBlock(p);
  container.append(chapter, gradesHost, goalsHost, status);
  stagger([container.querySelector(".screen-header"), chapter, gradesHost, goalsHost]);

  // Pull the account copy once: a new phone or cleared browser gets its dreams back.
  syncFromCloud().then((changed) => {
    if (changed && container.isConnected && !container.classList.contains("hidden")) renderDreams(container);
  });

  await gradesBlock(p, gradesHost, container);
}

// ── Step 1: your next chapter ───────────────────────────────────────────────
function chapterForm(p) {
  const field = ([id, label, ph, max]) =>
    `<div class="field"><label for="dream-${id}">${label}</label><input id="dream-${id}" name="${id}" maxlength="${max}" required placeholder="${ph}" value="${escapeHtml(p[id])}" autocomplete="off"></div>`;
  return el(`<form class="dream-form-body" novalidate>
    <div class="form-grid">
      ${field(["career", "Dream career", "e.g. Software engineer", 120])}
      ${field(["school", "School or destination", "e.g. University of Waterloo", 120])}
    </div>
    <div class="field"><label for="dream-target">Dream average (%)</label>
      <div class="chip-row" role="group" aria-label="Quick picks">${[85, 90, 95].map((n) => `<button type="button" class="chip" data-pick="${n}" aria-pressed="${Number(p.target) === n}">${n}%</button>`).join("")}</div>
      <input id="dream-target" name="target" type="number" inputmode="decimal" min="0" max="100" step="0.1" required value="${escapeHtml(p.target)}"></div>
    <div class="field"><label for="dream-motivation">Your reason to keep going</label><input id="dream-motivation" name="motivation" maxlength="240" placeholder="What makes this matter to you?" value="${escapeHtml(p.motivation)}" autocomplete="off"></div>
    <button class="btn" type="submit">${p.dreamDone ? "Update my dream" : "Save my dream"}</button>
    <p class="small muted form-msg" role="alert"></p>
  </form>`);
}

function chapterBlock(p, container) {
  const form = chapterForm(p);
  form.querySelectorAll("[data-pick]").forEach((b) => {
    b.onclick = () => {
      form.elements.target.value = b.dataset.pick;
      form.querySelectorAll("[data-pick]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    };
  });
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const d = new FormData(form);
    const career = d.get("career").trim(), school = d.get("school").trim(), target = Number(d.get("target"));
    const msg = form.querySelector(".form-msg");
    if (!career || !school) { msg.textContent = "Add a dream career and where you want to go."; return; }
    if (!(target >= 0 && target <= 100) || d.get("target") === "") { msg.textContent = "Enter a dream average from 0 to 100."; return; }
    try {
      saveDreams({ career, school, motivation: d.get("motivation").trim(), target, dreamDone: true });
      savedFeedback(form.querySelector('button[type="submit"]'), "Saved ✓");
      setTimeout(() => container.isConnected && renderDreams(container), motionEnabled() ? 450 : 0);
    } catch {
      msg.textContent = "Could not save. Check browser storage access.";
    }
  });

  if (!p.dreamDone) {
    const card = el(`<section class="card dream-block"><div class="dream-head"><span class="dream-icon" aria-hidden="true">✦</span><div><h2>Create your dream</h2><p class="muted small">Two minutes. You can change your mind anytime.</p></div></div></section>`);
    card.append(form);
    return card;
  }
  const line = [p.career, p.school, `aiming for ${p.target}%`].filter(Boolean).join(" · ");
  const box = el(`<details class="card disclosure dream-block is-done"><summary><span class="dream-icon" aria-hidden="true">✦</span><span class="dream-sum"><b>Your next chapter</b><small></small></span><span class="done-pill">${tick} Saved</span></summary><div class="disclosure-body"></div></details>`);
  box.querySelector("small").textContent = line;
  const body = box.querySelector(".disclosure-body");
  if (p.motivation) body.append(el(`<blockquote class="dream-why"></blockquote>`));
  if (p.motivation) body.querySelector("blockquote").textContent = `“${p.motivation}”`;
  body.append(form);
  initDisclosure(box);
  return box;
}

// ── Step 2: dream grades by course ──────────────────────────────────────────
async function gradesBlock(p, host, container) {
  host.replaceChildren(
    el(`<section class="card dream-block"><div class="dream-head"><span class="dream-icon" aria-hidden="true">◎</span><div><h2>Dream grades by course</h2><p class="muted small">Loading your courses…</p></div></div></section>`),
  );
  let courses = [];
  try {
    courses = await getCourses();
    if (p.currentTermOnly) courses = splitByTerm(courses).current;
  } catch {
    host.replaceChildren(
      el(`<section class="card dream-block"><div class="dream-head"><span class="dream-icon" aria-hidden="true">◎</span><div><h2>Dream grades by course</h2><p class="muted small">Courses could not load. Your dream and goals still save.</p></div></div></section>`),
    );
    return;
  }
  if (!host.isConnected) return;
  if (!courses.length) {
    host.replaceChildren(
      el(`<section class="card dream-block"><div class="dream-head"><span class="dream-icon" aria-hidden="true">◎</span><div><h2>Dream grades by course</h2><p class="muted small">Your courses will appear here once they're available.</p></div></div></section>`),
    );
    return;
  }

  const list = el(`<div class="goal-list"></div>`);
  courses.forEach((c, i) => list.append(courseRow(c, i)));
  const save = el(`<button class="btn" type="button">${p.gradesDone ? "Update grade targets" : "Save my grade targets"}</button>`);
  save.onclick = () => {
    saveDreams({ gradesDone: true });
    savedFeedback(save, "Saved ✓");
    setTimeout(() => container.isConnected && renderDreams(container), motionEnabled() ? 450 : 0);
  };
  const note = `<p class="muted small">Personal targets, not admission requirements or official grade predictions.</p>`;

  if (!p.gradesDone) {
    const card = el(`<section class="card dream-block"><div class="dream-head"><span class="dream-icon" aria-hidden="true">◎</span><div><h2>Dream grades by course</h2>${note}</div></div></section>`);
    card.append(list, save);
    host.replaceChildren(card);
    return;
  }
  const targets = courses.map((c) => preferences().goals[c.code] ?? preferences().target);
  const avg = targets.reduce((a, b) => a + b, 0) / targets.length;
  const box = el(`<details class="card disclosure dream-block is-done"><summary><span class="dream-icon" aria-hidden="true">◎</span><span class="dream-sum"><b>Dream grades</b><small>${courses.length} course${courses.length === 1 ? "" : "s"} · average target ${Math.round(avg * 10) / 10}%</small></span><span class="done-pill">${tick} Saved</span></summary><div class="disclosure-body">${note}</div></details>`);
  box.querySelector(".disclosure-body").append(list, save);
  host.replaceChildren(box);
  initDisclosure(box);
}

function courseRow(c, i) {
  const p = preferences();
  const mark = displayMark(c);
  const target = p.goals[c.code] ?? p.target;
  const facts = courseFacts(c);
  const meta = [courseLabel(c), facts.period, facts.room, facts.dates].filter(Boolean).join(" · ");
  const row = el(
    `<div class="card goal-row dream-course"><div class="dc-main"><h3>${escapeHtml(courseTitle(c))}</h3><div class="goal-meta">${escapeHtml(meta)}</div><div class="muted small">Current <span class="private-mark">${fmtPercent(mark)}</span></div><div class="goal-meter" aria-hidden="true"><i></i></div><p class="goal-gap small accent-text"></p></div><div class="dc-target"><span class="small muted" id="goal-label-${i}">Target %</span><div class="stepper" role="group" aria-labelledby="goal-label-${i}"><button type="button" data-step="-1" aria-label="Lower target for ${escapeHtml(courseTitle(c))}">−</button><input id="goal-${i}" type="number" inputmode="decimal" min="0" max="100" step="0.1" required value="${escapeHtml(target)}" aria-describedby="goal-saved-${i}"><button type="button" data-step="1" aria-label="Raise target for ${escapeHtml(courseTitle(c))}">+</button></div><p class="goal-saved" id="goal-saved-${i}" role="status"></p></div></div>`,
  );
  row.style.setProperty("--m-i", String(i));
  row.querySelector(".goal-meter > i").style.setProperty("--m-i", String(i));
  const gapEl = row.querySelector(".goal-gap");
  const input = row.querySelector("input");

  // `first` keeps the very first paint from counting down from nothing and
  // from claiming a target was "newly" reached on arrival.
  const updateGap = (first = false) => {
    const t = Number(input.value);
    const reached = mark != null && mark >= t;
    const progress = mark == null || !(t > 0) ? 0 : Math.max(0, Math.min(100, (mark / t) * 100));
    row.querySelector(".goal-meter > i").style.width = `${progress}%`;
    if (mark == null) {
      gapEl.textContent = "Awaiting a grade";
    } else if (reached) {
      gapEl.textContent = "Target reached ✧";
      if (reachedBefore.get(c.code) !== true && !marksHidden() && motionEnabled()) sparkleBurst(gapEl, 9);
    } else if (first && !marksHidden()) {
      countUp(gapEl, t - mark, { from: t, duration: 900, format: (v) => `${v.toFixed(1)} points to your target` });
    } else {
      gapEl.textContent = `${(t - mark).toFixed(1)} points to your target`;
    }
    reachedBefore.set(c.code, reached);
  };
  updateGap(true);

  const commit = () => {
    const saved = row.querySelector(".goal-saved");
    if (input.checkValidity() && input.value !== "") {
      try {
        saveDreams({ goals: { ...preferences().goals, [c.code]: Number(input.value) } });
        saved.textContent = "Saved ✓";
      } catch {
        saved.textContent = "Couldn't save — check browser storage.";
      }
      updateGap();
    } else {
      saved.textContent = "Enter a target from 0 to 100.";
    }
  };
  input.addEventListener("input", commit);
  row.querySelectorAll("[data-step]").forEach((b) => {
    b.addEventListener("click", () => {
      const next = Math.min(100, Math.max(0, Math.round((Number(input.value || 0) + Number(b.dataset.step)) * 10) / 10));
      input.value = String(next);
      commit();
    });
  });
  return row;
}

// ── Step 3: personal and school goals ───────────────────────────────────────
const dayMs = 86400000;
function when(date) {
  if (!date) return "";
  const days = Math.round((new Date(`${date}T00:00`) - new Date(new Date().toDateString())) / dayMs);
  const pretty = new Date(`${date}T00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  const rel = days === 0 ? "today" : days === 1 ? "tomorrow" : days > 1 ? `in ${days} days` : `${-days} day${days === -1 ? "" : "s"} ago`;
  return { text: `${pretty} · ${rel}`, overdue: days < 0 };
}

function goalsBlock(p) {
  const card = el(`<section class="card dream-block goals-block"><div class="dream-head"><span class="dream-icon" aria-hidden="true">⚑</span><div><h2>Personal &amp; school goals</h2><p class="muted small">A date, a goal, and why it matters: being happy with a mark, switching schools, anything.</p></div></div>
    <form class="goal-form" novalidate>
      <div class="seg" role="radiogroup" aria-label="Goal type"><label><input type="radio" name="type" value="personal" checked><span>Personal</span></label><label><input type="radio" name="type" value="school"><span>School</span></label></div>
      <div class="field"><label for="goal-title">What's the goal?</label><input id="goal-title" name="title" maxlength="120" required placeholder="e.g. Be proud of my French mark" autocomplete="off"></div>
      <div class="form-grid"><div class="field"><label for="goal-date">By when</label><input id="goal-date" name="date" type="date"></div>
      <div class="field"><label for="goal-details">First step or why (optional)</label><input id="goal-details" name="details" maxlength="400" placeholder="Extra help twice a week" autocomplete="off"></div></div>
      <button class="btn" type="submit">Add goal</button><p class="small muted form-msg" role="alert"></p>
    </form><ul class="goal-items" aria-label="Your goals"></ul></section>`);
  const form = card.querySelector(".goal-form");
  const ul = card.querySelector(".goal-items");

  const draw = () => {
    const goals = [...preferences().goalsList].sort((a, b) => Number(a.done) - Number(b.done) || (a.date || "9999").localeCompare(b.date || "9999"));
    ul.replaceChildren();
    if (!goals.length) {
      ul.append(el(`<li class="goal-empty muted small">No goals yet. Start with one you can finish this term.</li>`));
      return;
    }
    for (const g of goals) {
      const w = when(g.date);
      const li = el(`<li class="goal-item${g.done ? " is-done" : ""}"><label class="goal-check"><input type="checkbox" ${g.done ? "checked" : ""}><span class="box" aria-hidden="true">${tick}</span><span class="sr-only">Mark done</span></label><div class="goal-text"><b></b><p class="small muted"></p></div><button type="button" class="icon-btn" aria-label="Remove goal">×</button></li>`);
      li.querySelector("b").textContent = g.title;
      const bits = [g.type === "school" ? "School" : "Personal", w && w.text, g.details].filter(Boolean);
      li.querySelector("p").textContent = bits.join(" · ");
      if (w?.overdue && !g.done) li.classList.add("is-overdue");
      li.querySelector("input").onchange = (e) => {
        saveGoalList(preferences().goalsList.map((x) => (x.id === g.id ? { ...x, done: e.target.checked } : x)));
        draw();
      };
      li.querySelector(".icon-btn").onclick = () => {
        saveGoalList(preferences().goalsList.filter((x) => x.id !== g.id));
        draw();
      };
      ul.append(li);
    }
  };

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const d = new FormData(form);
    const title = d.get("title").trim();
    const msg = form.querySelector(".form-msg");
    if (!title) { msg.textContent = "Write what the goal is first."; return; }
    msg.textContent = "";
    saveGoalList([
      ...preferences().goalsList,
      { id: crypto.randomUUID(), type: d.get("type") === "school" ? "school" : "personal", title, date: d.get("date") || "", details: d.get("details").trim(), done: false },
    ].slice(-50));
    form.elements.title.value = "";
    form.elements.date.value = "";
    form.elements.details.value = "";
    savedFeedback(form.querySelector('button[type="submit"]'), "Added ✓");
    draw();
  });
  draw();
  return card;
}
