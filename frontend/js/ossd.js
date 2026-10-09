// ============================================================================
// OSSD tracker — Ontario Secondary School Diploma progress.
// Rules for students who started Grade 9 in fall 2024 or later (YRDSB
// graduation requirements page): 30 credits (17 compulsory), 40 volunteer
// hours, the literacy requirement, and 2 online learning credits.
// Courses on TeachAssist with a passing mark count as "on track"; the student
// ticks off credits from earlier years themselves (TeachAssist only shows the
// current school year).
// ============================================================================

import { courseLabel } from "./courses.js";
import { parseCourseCode } from "./course-names.js";
import { readStudentData, writeStudentData } from "./student-store.js";

export const TOTAL_CREDITS = 30;

/** Compulsory credits. `match` decides if a course code fills the slot. */
export const COMPULSORY = [
  { id: "english", label: "English", need: 4, match: (p) => ["ENG", "ENL", "OLC", "NBE", "ESL", "ELD"].includes(p.prefix) },
  { id: "math", label: "Mathematics", need: 3, match: (p) => p.prefix[0] === "M" },
  { id: "science", label: "Science", need: 2, match: (p) => p.prefix[0] === "S" },
  { id: "tech", label: "Technological education (Gr 9/10)", need: 1, match: (p) => p.prefix[0] === "T" && (p.grade ?? 9) <= 10 },
  { id: "history", label: "Canadian history (Gr 10)", need: 1, match: (p) => p.prefix === "CHC" },
  { id: "geography", label: "Canadian geography (Gr 9)", need: 1, match: (p) => p.prefix === "CGC" },
  { id: "arts", label: "The Arts", need: 1, match: (p) => p.prefix[0] === "A" },
  { id: "hpe", label: "Health & Phys. Ed.", need: 1, match: (p) => p.prefix[0] === "P" },
  { id: "french", label: "French as a second language", need: 1, match: (p) => p.prefix[0] === "F" },
  { id: "career", label: "Career Studies", need: 0.5, match: (p) => p.prefix === "GLC" },
  { id: "civics", label: "Civics", need: 0.5, match: (p) => p.prefix === "CHV" },
  { id: "stem", label: "STEM-related (extra)", need: 1, match: (p) => ["B", "I"].includes(p.prefix[0]) || p.prefix === "COO" },
];

const HALF = new Set(["GLC", "CHV"]);
const creditValue = (p) => (HALF.has(p.prefix) ? 0.5 : 1);

export function ossdState() {
  return { prior: 0, done: {}, literacy: false, online: 0, ...readStudentData("ossd", {}) };
}
export function saveOssd(next) {
  writeStudentData("ossd", { ...ossdState(), ...next });
}

/** Snapshot of diploma progress from the courses on TeachAssist + manual ticks. */
export function ossdProgress(courses = []) {
  const state = ossdState();
  const passing = courses
    .map((c) => ({ c, p: parseCourseCode(courseLabel(c)), mark: c.currentMark ?? c.midterm }))
    .filter((x) => x.p && (x.mark == null || Number(x.mark) >= 50));
  const used = new Set();
  const slots = COMPULSORY.map((req) => {
    let have = 0;
    const from = [];
    for (const x of passing) {
      if (have >= req.need || used.has(x)) continue;
      if (req.match(x.p)) { have += creditValue(x.p); used.add(x); from.push(courseLabel(x.c)); }
    }
    const done = !!state.done[req.id];
    return { ...req, have: done ? req.need : Math.min(have, req.need), from, done, status: done ? "done" : have >= req.need ? "on-track" : have > 0 ? "partial" : "todo" };
  });
  const onTrack = passing.reduce((s, x) => s + creditValue(x.p), 0);
  const credits = Math.min(TOTAL_CREDITS, Number(state.prior || 0) + onTrack);
  return {
    credits,
    prior: Number(state.prior || 0),
    onTrack,
    slots,
    compulsoryLeft: slots.filter((s) => s.status === "todo" || s.status === "partial").length,
    literacy: state.literacy,
    online: Number(state.online || 0),
  };
}
