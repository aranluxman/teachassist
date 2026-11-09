import { studentNumber, isDemo } from "./ta-client.js";
import { applyLook } from "./customize.js";
import { deviceStore } from "./device-store.js";
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
  // Settings → Accessibility
  textSize: "default",
  font: "default",
  boldText: false,
  // Settings → Experience
  haptics: true,
  refreshButton: true,
  // Off: the big home layout (large average, full-size course cards).
  compactHome: false,
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
    const p = JSON.parse(deviceStore().getItem(key()) || "{}");
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
  deviceStore().setItem(key(), JSON.stringify(p));
  applyPreferences();
  return p;
}
export function applyPreferences() {
  const p = preferences();
  const root = document.documentElement.dataset;
  for (const k of ["motion", "glass", "hideMarks", "compactHome"]) root[k] = String(p[k]);
  applyLook(p);
  // "Compact layout" and "Larger text" were removed from Settings: a choice
  // saved before then no longer applies.
  delete root.compact;
  delete root.largeText;
}
