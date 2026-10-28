// ============================================================================
// Theme — appearance (System / Dark / Light) × colour (fifteen accents).
// ----------------------------------------------------------------------------
// Two independent choices, both saved on this device:
//   appearance: "system" | "dark" | "light"
//   color:      one of COLORS below ("default" is Mint)
//
// They land on <html> as data-mode / data-accent; css/v6.css turns each pair
// into a full token set. data-theme is still set to "dark" / "indigo" so the
// older stylesheet layers pick the matching light or dark base.
// First run: Mint on Light.
// ============================================================================

export const APPEARANCES = [
  { id: "system", name: "System" },
  { id: "dark", name: "Dark" },
  { id: "light", name: "Light" },
];

// Each colour: the glossy orb (light → deep), four swatch dots and the
// soft tint its tile is washed with on the Theme page. The real accent per
// light / dark mode lives in css/v6.css.
export const COLORS = [
  { id: "default", name: "Mint", orb: ["#6ff0c4", "#0b8a66"], dots: ["#6ee7b7", "#0f8f6e", "#4fd1a0", "#7fdcb8"], tint: "#c9f3e2" },
  { id: "ocean", name: "Ocean", orb: ["#9fd0ff", "#1f6fe0"], dots: ["#22c3ee", "#3b82f6", "#6366f1", "#a5b4fc"], tint: "#d4e6ff" },
  { id: "sunset", name: "Sunset", orb: ["#ffcf86", "#e8425e"], dots: ["#fdba74", "#fb7185", "#f0abfc", "#c4a1f5"], tint: "#ffe1d6" },
  { id: "forest", name: "Forest", orb: ["#5e9a6a", "#14361f"], dots: ["#4a7c59", "#6b8f71", "#a3bfa0", "#a8a68a"], tint: "#dce9dc" },
  { id: "lavender", name: "Lavender", orb: ["#c9b8ff", "#5b3fd0"], dots: ["#7c5ce0", "#6347d6", "#a993f2", "#c4b5fd"], tint: "#e6e0fc" },
  { id: "blossom", name: "Blossom", orb: ["#ffb6dd", "#e0479a"], dots: ["#f472b6", "#e879b9", "#f0abfc", "#d8b4fe"], tint: "#fbe0ef" },
  { id: "sky", name: "Sky", orb: ["#b0e2ff", "#2f86e0"], dots: ["#3b82f6", "#4f8ff5", "#7aa7ff", "#bfdbfe"], tint: "#dcefff" },
  { id: "coral", name: "Coral", orb: ["#ffb8ad", "#e0463c"], dots: ["#f87171", "#fb6b5b", "#f9a3a3", "#fecaca"], tint: "#ffe0dc" },
  { id: "gold", name: "Gold", orb: ["#ffe08a", "#b07a00"], dots: ["#eab308", "#e5b23a", "#e8cf8a", "#e6d5a8"], tint: "#fbefc6" },
  { id: "slate", name: "Slate", orb: ["#d3d8e2", "#4b5263"], dots: ["#4b5563", "#64748b", "#94a3b8", "#cbd5e1"], tint: "#e3e6ec" },
  { id: "rose", name: "Rose", orb: ["#ffbcc8", "#cc3f60"], dots: ["#f08ca0", "#f05470", "#ef7fae", "#fbb4c0"], tint: "#fde0e5" },
  { id: "indigo", name: "Indigo", orb: ["#9a91ff", "#2e2392"], dots: ["#8b5cf6", "#6d4fd8", "#a78bfa", "#c4b5fd"], tint: "#e2e2fd" },
  { id: "teal", name: "Teal", orb: ["#6ce9d9", "#0f7a72"], dots: ["#14b8a6", "#2aaea2", "#7dd3c8", "#99d8cf"], tint: "#cdf3ee" },
  { id: "amber", name: "Amber", orb: ["#ffcc70", "#ec6a0c"], dots: ["#fb923c", "#f59e0b", "#fcd34d", "#fbbf5a"], tint: "#ffe8cc" },
  { id: "nord", name: "Nord", orb: ["#d4e0ee", "#6383a8"], dots: ["#6b8db5", "#8fa9c8", "#b9c7d9", "#c4ccd6"], tint: "#e3eaf3" },
];

/** The CSS gradient for a colour's glossy orb. */
export const orbFill = (c) => `radial-gradient(circle at 35% 30%, ${c.orb[0]}, ${c.orb[1]} 72%)`;

const APPEARANCE_KEY = "appearance";
const COLOR_KEY = "theme-color";
const LEGACY_KEY = "theme";

// Colours that were renamed when the picker grew to fifteen.
const RENAMED = { mono: "slate", tide: "indigo", olive: "forest", ember: "amber" };

// Old single-choice themes → the closest appearance + colour.
const LEGACY = {
  auto: ["system", "default"],
  dark: ["dark", "default"],
  midnight: ["dark", "indigo"],
  indigo: ["light", "indigo"],
  ocean: ["light", "ocean"],
  arctic: ["light", "sky"],
  sunset: ["light", "sunset"],
  peach: ["light", "coral"],
  coffee: ["light", "amber"],
  rose: ["light", "rose"],
  grape: ["light", "lavender"],
  lavender: ["light", "lavender"],
  forest: ["light", "forest"],
  matcha: ["light", "teal"],
  slate: ["light", "slate"],
  pearl: ["light", "nord"],
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
    [appearance, color] = legacy || ["light", "default"];
    write(APPEARANCE_KEY, appearance);
    write(COLOR_KEY, color);
  }
  if (!APPEARANCES.some((a) => a.id === appearance)) appearance = "light";
  if (RENAMED[color]) {
    color = RENAMED[color];
    write(COLOR_KEY, color);
  }
  if (!COLORS.some((c) => c.id === color)) color = "default";
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
