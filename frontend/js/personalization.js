import { studentNumber, isDemo } from "./ta-client.js";
const defaults = {
  name: "",
  // Set once the dashboard has asked for a name (saved or "Not now").
  namePrompted: false,
  career: "",
  school: "",
  motivation: "",
  target: 90,
  motion: true,
  glass: true,
  compact: false,
  hideMarks: false,
  largeText: false,
  // Show only the courses running this semester (dates come from TeachAssist).
  currentTermOnly: true,
  goals: {},
  // Dreams: set once the student has finished each step (drives the collapsed view).
  dreamDone: false,
  gradesDone: false,
  goalsList: [],
  updatedAt: 0,
  goalsAt: 0,
};
function key() {
  return `ta-personal:${isDemo() ? "demo" : studentNumber() || "guest"}`;
}
export function preferences() {
  try {
    const p = JSON.parse(localStorage.getItem(key()) || "{}");
    return {
      ...defaults,
      ...p,
      goals: p.goals && typeof p.goals === "object" ? p.goals : {},
      goalsList: Array.isArray(p.goalsList) ? p.goalsList : [],
    };
  } catch {
    return { ...defaults, goals: {} };
  }
}
export function savePreferences(patch) {
  const p = { ...preferences(), ...patch };
  localStorage.setItem(key(), JSON.stringify(p));
  applyPreferences();
  return p;
}
export function applyPreferences() {
  const p = preferences();
  for (const k of ["motion", "glass", "compact", "hideMarks", "largeText"])
    document.documentElement.dataset[k] = String(p[k]);
}
