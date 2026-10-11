// ============================================================================
// Theme — appearance (System / Dark / Light) × colour (six accents).
// ----------------------------------------------------------------------------
// Two independent choices, both saved on this device:
//   appearance: "system" | "dark" | "light"
//   color:      "default" | "mono" | "tide" | "olive" | "ember" | "blossom"
//
// They land on <html> as data-mode / data-accent; css/v6.css turns each pair
// into a full token set. data-theme is still set to "dark" / "indigo" so the
// older stylesheet layers pick the matching light or dark base.
// First run: Ember on Dark.
// ============================================================================

export const APPEARANCES = [
  { id: "system", name: "System" },
  { id: "dark", name: "Dark" },
  { id: "light", name: "Light" },
];

export const COLORS = [
  { id: "default", name: "Default", orb: "radial-gradient(circle at 35% 30%, #3fd3a4, #0b7a5c 70%)" },
  { id: "mono", name: "Mono", orb: "radial-gradient(circle at 35% 30%, #f2f2f7, #8e8e93 70%)" },
  { id: "tide", name: "Tide", orb: "radial-gradient(circle at 35% 30%, #8f9bff, #3a46b8 70%)" },
  { id: "olive", name: "Olive", orb: "radial-gradient(circle at 35% 30%, #a3c45e, #3f5a1c 70%)" },
  { id: "ember", name: "Ember", orb: "radial-gradient(circle at 35% 30%, #ffb347, #d4560b 70%)" },
  { id: "blossom", name: "Blossom", orb: "radial-gradient(circle at 35% 30%, #f2a6ff, #9b4dff 70%)" },
];

const APPEARANCE_KEY = "appearance";
const COLOR_KEY = "theme-color";
const LEGACY_KEY = "theme";

// Old single-choice themes → the closest appearance + colour.
const LEGACY = {
  auto: ["system", "default"],
  dark: ["dark", "default"],
  midnight: ["dark", "tide"],
  indigo: ["light", "tide"],
  ocean: ["light", "tide"],
  arctic: ["light", "tide"],
  sunset: ["light", "ember"],
  peach: ["light", "ember"],
  coffee: ["light", "ember"],
  rose: ["light", "blossom"],
  grape: ["light", "blossom"],
  lavender: ["light", "blossom"],
  forest: ["light", "olive"],
  matcha: ["light", "olive"],
  slate: ["light", "mono"],
  pearl: ["light", "mono"],
};

function read(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode: the choice just lasts for this page */
  }
}

/** The saved { appearance, color }, migrating the old theme key once. */
export function themeChoice() {
  let appearance = read(APPEARANCE_KEY);
  let color = read(COLOR_KEY);
  if (!appearance && !color) {
    const legacy = LEGACY[read(LEGACY_KEY)];
    [appearance, color] = legacy || ["dark", "ember"];
    write(APPEARANCE_KEY, appearance);
    write(COLOR_KEY, color);
  }
  if (!APPEARANCES.some((a) => a.id === appearance)) appearance = "dark";
  if (!COLORS.some((c) => c.id === color)) color = "ember";
  return { appearance, color };
}

/** Save part of the choice and apply it with a short cross-fade. */
export function setTheme(patch) {
  const next = { ...themeChoice(), ...patch };
  write(APPEARANCE_KEY, next.appearance);
  write(COLOR_KEY, next.color);
  applyTheme({ crossfade: true });
  return next;
}

const darkQuery = typeof matchMedia === "function" ? matchMedia("(prefers-color-scheme: dark)") : null;
let watching = false;
let fadeTimer = 0;

/** Resolve the saved choice onto <html>. */
export function applyTheme({ crossfade = false } = {}) {
  const root = document.documentElement;
  const { appearance, color } = themeChoice();
  if (appearance === "system" && darkQuery && !watching) {
    watching = true;
    darkQuery.addEventListener?.("change", () => {
      if (themeChoice().appearance === "system") applyTheme({ crossfade: true });
    });
  }
  const mode = appearance === "system" ? (darkQuery?.matches ? "dark" : "light") : appearance;
  if (crossfade) {
    // `m-theming` eases the themed surfaces instead of flashing them.
    root.classList.add("m-theming");
    clearTimeout(fadeTimer);
    fadeTimer = setTimeout(() => root.classList.remove("m-theming"), 400);
  }
  root.dataset.mode = mode;
  root.dataset.accent = color;
  root.dataset.theme = mode === "dark" ? "dark" : "indigo";
  root.style.colorScheme = mode;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", mode === "dark" ? "#000000" : "#f4f2f0");
}

/** Human label, e.g. "Ember · Dark". */
export function themeLabel() {
  const { appearance, color } = themeChoice();
  return `${COLORS.find((c) => c.id === color).name} · ${APPEARANCES.find((a) => a.id === appearance).name}`;
}
