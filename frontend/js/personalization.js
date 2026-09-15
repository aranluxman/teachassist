import { studentNumber, isDemo } from "./ta-client.js";
const defaults = {
  name: "",
  career: "",
  school: "",
  motivation: "",
  target: 90,
  motion: true,
  glass: true,
  compact: false,
  hideMarks: false,
  largeText: false,
  goals: {},
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
