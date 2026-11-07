// ============================================================================
// Customize: text size, font, bold text and haptics
// ----------------------------------------------------------------------------
// The choices live in personalization.js (saved per student); this module
// turns them into the page's look (data-* attributes + the --ts text scale)
// and plays haptic taps. It reads nothing else, so it is safe to import early.
// ============================================================================

/** [id, label, scale]: every px font size in the CSS is multiplied by --ts. */
export const TEXT_SIZES = [
  ["small", "Small", 0.9],
  ["default", "Default", 1],
  ["large", "Large", 1.12],
  ["xlarge", "Extra large", 1.25],
];

/** [id, label, description, Google Fonts family or ""]. */
export const FONTS = [
  ["default", "Default", "Clean and modern, the app's normal look", ""],
  ["rounded", "Rounded", "Soft, friendly letters", "Nunito:wght@400;500;600;700;800"],
  ["readable", "Readable", "Extra-clear letters, made for low vision", "Atkinson+Hyperlegible:wght@400;700"],
  ["serif", "Classic", "A bookish serif, like a printed page", "Lora:wght@400;500;600;700"],
];

const scaleOf = (id) => (TEXT_SIZES.find(([k]) => k === id) || TEXT_SIZES[1])[2];

/** Apply text size, font, bold text and haptics to <html>. */
export function applyLook(p) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const size = TEXT_SIZES.some(([k]) => k === p.textSize) ? p.textSize : "default";
  const font = FONTS.some(([k]) => k === p.font) ? p.font : "default";
  root.dataset.textSize = size;
  root.style.setProperty("--ts", String(scaleOf(size)));
  root.dataset.font = font;
  root.dataset.boldText = String(!!p.boldText);
  root.dataset.haptics = String(p.haptics !== false);
  loadFont(font);
}

/** Settings → Accessibility draws every option in its own font. */
export function preloadFonts() {
  for (const [id] of FONTS) loadFont(id);
}

/** Fetch a font's files only once someone picks it (or opens the picker). */
function loadFont(id) {
  const family = (FONTS.find(([k]) => k === id) || [])[3];
  if (!family || document.getElementById(`font-${id}`)) return;
  const link = document.createElement("link");
  link.id = `font-${id}`;
  link.rel = "stylesheet";
  link.href = `https://fonts.googleapis.com/css2?family=${family}&display=swap`;
  document.head.append(link);
}

// ── Haptics ─────────────────────────────────────────────────────────────────
// Android: the Vibration API. iPhone (Safari 18+): toggling a hidden native
// switch is the only way a web page can make the Taptic Engine tick.

const PATTERNS = { light: 8, medium: 15, success: [10, 60, 16], warning: [20, 50, 20] };
let iosSwitch = null;
let last = 0;

const isIOS = () =>
  typeof navigator !== "undefined" &&
  (/iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));

/** One haptic tap, unless Settings → Haptic feedback is off. */
export function haptic(kind = "light") {
  if (typeof document === "undefined" || document.documentElement.dataset.haptics === "false") return;
  const now = Date.now();
  if (now - last < 40) return; // one tap, not one per nested element
  last = now;
  if (typeof navigator.vibrate === "function" && !isIOS()) {
    try {
      navigator.vibrate(PATTERNS[kind] ?? PATTERNS.light);
    } catch {
      /* some browsers block it until the first tap */
    }
    return;
  }
  if (!isIOS()) return;
  if (!iosSwitch) {
    iosSwitch = document.createElement("label");
    iosSwitch.setAttribute("aria-hidden", "true");
    iosSwitch.style.display = "none";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.setAttribute("switch", "");
    input.tabIndex = -1;
    iosSwitch.append(input);
    document.body.append(iosSwitch);
  }
  iosSwitch.click();
}

let wired = false;

/** A light tap for every button, link, switch and row the student presses. */
export function initHaptics() {
  if (wired || typeof document === "undefined") return;
  wired = true;
  document.addEventListener(
    "click",
    (e) => {
      if (!e.isTrusted || (iosSwitch && iosSwitch.contains(e.target))) return;
      const hit = e.target.closest?.("button, a[href], [role=switch], input[type=checkbox], summary, .g-row, select");
      if (hit && !hit.disabled) haptic(hit.matches("[role=switch], input[type=checkbox]") ? "medium" : "light");
    },
    { capture: true, passive: true },
  );
}
