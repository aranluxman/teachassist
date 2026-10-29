// ============================================================================
// Theme — appearance (System / Dark / Light) × colour (fifteen accents).
// ----------------------------------------------------------------------------
// Three choices, all saved on this device:
//   appearance: "system" | "dark" | "light"
//   color:      one of COLORS below ("default" is Mint)
//   shade:      which of that colour's four dots is in use (0–3)
//
// They land on <html> as data-mode / data-accent; css/v6.css turns each pair
// into a full token set, and the shade's accent, glow and gauge are set
// inline on <html> on top (shadeTokens). data-theme is still set to
// "dark" / "indigo" so the older stylesheet layers pick the matching light or
// dark base. First run: Mint, first shade, on Light.
// ============================================================================

export const APPEARANCES = [
  { id: "system", name: "System" },
  { id: "dark", name: "Dark" },
  { id: "light", name: "Light" },
];

// Each colour: four shades (the dots on its tile, tapped through in order)
// and the soft tint its tile is washed with on the Theme page.
export const COLORS = [
  { id: "default", name: "Mint", dots: ["#6ee7b7", "#0f8f6e", "#4fd1a0", "#7fdcb8"], tint: "#c9f3e2" },
  { id: "ocean", name: "Ocean", dots: ["#22c3ee", "#3b82f6", "#6366f1", "#a5b4fc"], tint: "#d4e6ff" },
  { id: "sunset", name: "Sunset", dots: ["#fdba74", "#fb7185", "#f0abfc", "#c4a1f5"], tint: "#ffe1d6" },
  { id: "forest", name: "Forest", dots: ["#4a7c59", "#6b8f71", "#a3bfa0", "#a8a68a"], tint: "#dce9dc" },
  { id: "lavender", name: "Lavender", dots: ["#7c5ce0", "#6347d6", "#a993f2", "#c4b5fd"], tint: "#e6e0fc" },
  { id: "blossom", name: "Blossom", dots: ["#f472b6", "#e879b9", "#f0abfc", "#d8b4fe"], tint: "#fbe0ef" },
  { id: "sky", name: "Sky", dots: ["#3b82f6", "#4f8ff5", "#7aa7ff", "#bfdbfe"], tint: "#dcefff" },
  { id: "coral", name: "Coral", dots: ["#f87171", "#fb6b5b", "#f9a3a3", "#fecaca"], tint: "#ffe0dc" },
  { id: "gold", name: "Gold", dots: ["#eab308", "#e5b23a", "#e8cf8a", "#e6d5a8"], tint: "#fbefc6" },
  { id: "slate", name: "Slate", dots: ["#4b5563", "#64748b", "#94a3b8", "#cbd5e1"], tint: "#e3e6ec" },
  { id: "rose", name: "Rose", dots: ["#f08ca0", "#f05470", "#ef7fae", "#fbb4c0"], tint: "#fde0e5" },
  { id: "indigo", name: "Indigo", dots: ["#8b5cf6", "#6d4fd8", "#a78bfa", "#c4b5fd"], tint: "#e2e2fd" },
  { id: "teal", name: "Teal", dots: ["#14b8a6", "#2aaea2", "#7dd3c8", "#99d8cf"], tint: "#cdf3ee" },
  { id: "amber", name: "Amber", dots: ["#fb923c", "#f59e0b", "#fcd34d", "#fbbf5a"], tint: "#ffe8cc" },
  { id: "nord", name: "Nord", dots: ["#6b8db5", "#8fa9c8", "#b9c7d9", "#c4ccd6"], tint: "#e3eaf3" },
];

// ── Shades ──────────────────────────────────────────────────────────────
// A dot is a swatch, not a usable accent: pale ones would put white button
// text on near-white. Each shade keeps its OKLCH hue and chroma and moves
// only its lightness, just far enough that accent text on the card and the
// button label on the accent both reach WCAG AA, with a little headroom.
const CARD = { light: "#ffffff", dark: "#161618" };
const ON_ACCENT = { light: "#ffffff", dark: "#111111" };
const MIN_CONTRAST = 4.6;

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
const toHex = (c) => `#${c.map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, "0")).join("")}`;
/** `a` weighted p (0–1) against `b`, in sRGB like CSS color-mix. */
const mix = (a, b, p) => toHex(rgb(a).map((v, i) => v * p + rgb(b)[i] * (1 - p)));
function luminance(hex) {
  const [r, g, b] = rgb(hex).map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
/** WCAG contrast ratio between two #rrggbb colours. */
export function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
// OKLCH: lightness as the eye sees it, so a pale dot darkens into a soft,
// dusty version of itself instead of a neon one.
const lin = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const gam = (v) => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);
function toOklch(hex) {
  const [r, g, b] = rgb(hex).map(lin);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return [L, Math.hypot(A, B), Math.atan2(B, A)];
}
function fromOklch(L, C, h) {
  const A = C * Math.cos(h), B = C * Math.sin(h);
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return toHex(
    [
      4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
      -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
      -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
    ].map(gam),
  );
}
/** The dot's colour, darkened (light mode) or lightened (dark mode) until readable. */
function readable(dot, mode) {
  const [L0, C, h] = toOklch(dot);
  const ok = (hex) => contrast(hex, CARD[mode]) >= MIN_CONTRAST && contrast(ON_ACCENT[mode], hex) >= MIN_CONTRAST;
  const step = mode === "light" ? -0.005 : 0.005;
  for (let L = L0; L >= 0 && L <= 1; L += step) {
    const hex = fromOklch(L, C, h);
    if (ok(hex)) return hex;
  }
  return mode === "light" ? "#000000" : "#ffffff";
}

/** Accent, glow and gauge colours for one shade (a dot) in one mode. */
export function shadeTokens(dot, mode) {
  const light = readable(dot, "light");
  const dark = readable(dot, "dark");
  return mode === "light"
    ? { accent: light, glow: mix(light, "#ffffff", 0.2), gaugeFrom: light, gaugeTo: mix(dark, light, 0.85) }
    : { accent: dark, glow: mix(dark, "#000000", 0.24), gaugeFrom: mix(light, dark, 0.6), gaugeTo: mix(dark, "#ffffff", 0.85) };
}

// Course and K/T/C/A colours: one per dot, readable in the current mode
// (deep with a white icon in light mode, bright with a dark one in dark
// mode). Similar dots (Mint's are all one green) would land on the same
// lightness once made readable, so, in lightness order, each is pushed
// just far enough from the one before to tell them apart.
const MIN_STEP = 0.055;
export function courseShades(dots, mode) {
  const dir = mode === "light" ? -1 : 1;
  const out = dots.map((dot) => toOklch(readable(dot, mode)));
  const order = out.map((_, i) => i).sort((i, j) => dir * (out[i][0] - out[j][0]));
  order.forEach((i, k) => {
    if (k) {
      const prev = out[order[k - 1]][0];
      out[i][0] = dir < 0 ? Math.min(out[i][0], prev - MIN_STEP) : Math.max(out[i][0], prev + MIN_STEP);
    }
  });
  return out.map(([L, C, h]) => fromOklch(L, C, h));
}

/** The CSS gradient for a shade's glossy orb: the dot, lit from above. */
export function orbFill(dot) {
  return `radial-gradient(circle at 35% 30%, ${mix(dot, "#ffffff", 0.55)}, ${mix(readable(dot, "light"), "#000000", 0.85)} 72%)`;
}

const APPEARANCE_KEY = "appearance";
const COLOR_KEY = "theme-color";
const SHADE_KEY = "theme-shade";
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

/** The saved { appearance, color, shade }, migrating the old theme key once. */
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
  const shade = Number(read(SHADE_KEY));
  return { appearance, color, shade: Number.isInteger(shade) && shade >= 0 && shade < 4 ? shade : 0 };
}

/** Save part of the choice and apply it with a short cross-fade. A new
 *  colour starts on its first shade unless a shade is given too. */
export function setTheme(patch) {
  const now = themeChoice();
  const next = { ...now, ...patch };
  if (next.color !== now.color && !("shade" in patch)) next.shade = 0;
  write(APPEARANCE_KEY, next.appearance);
  write(COLOR_KEY, next.color);
  write(SHADE_KEY, String(next.shade));
  applyTheme({ crossfade: true });
  return next;
}

const darkQuery = typeof matchMedia === "function" ? matchMedia("(prefers-color-scheme: dark)") : null;
let watching = false;
let fadeTimer = 0;

/** Resolve the saved choice onto <html>. */
export function applyTheme({ crossfade = false } = {}) {
  const root = document.documentElement;
  const { appearance, color, shade } = themeChoice();
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
  const tokens = shadeTokens(COLORS.find((c) => c.id === color).dots[shade], mode);
  root.style.setProperty("--accent", tokens.accent);
  root.style.setProperty("--glow", tokens.glow);
  root.style.setProperty("--gauge-from", tokens.gaugeFrom);
  root.style.setProperty("--gauge-to", tokens.gaugeTo);
  courseShades(COLORS.find((c) => c.id === color).dots, mode).forEach((hex, i) => root.style.setProperty(`--shade-${i + 1}`, hex));
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", mode === "dark" ? "#000000" : "#f4f2f0");
}

/** Human label, e.g. "Ember · Dark". */
export function themeLabel() {
  const { appearance, color } = themeChoice();
  return `${COLORS.find((c) => c.id === color).name} · ${APPEARANCES.find((a) => a.id === appearance).name}`;
}
