// Liquid Glass legibility and wiring (css/glass.css, js/glass.js).
//
// Text on glass must pass WCAG AA against the lightest AND darkest content
// that can scroll behind it. This rebuilds each glass colour exactly as the
// browser composites it (color-mix in sRGB, then source-over onto the
// content) for every theme, over pure white and pure black, and checks the
// ratio. Pure white/black is stricter than anything the app actually shows.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const v6 = read("frontend/css/v6.css");
const glass = read("frontend/css/glass.css");
const appHtml = read("frontend/app.html");
const indexHtml = read("frontend/index.html");

const COLORS = ["default", "mono", "tide", "olive", "ember", "blossom"];

// ── colour maths ────────────────────────────────────────────────────────────
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
const lum = (rgb) => {
  const [r, g, b] = rgb.map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
/** A premultiplied colour: [r, g, b] already multiplied by alpha, plus alpha. */
const pm = (rgb, a = 1) => ({ c: rgb.map((v) => v * a), a });
/** color-mix(in srgb, A p%, B): premultiplied interpolation. */
const mix = (A, p, B) => ({ c: A.c.map((v, i) => v * p + B.c[i] * (1 - p)), a: A.a * p + B.a * (1 - p) });
/** Paint `top` over an opaque backdrop. */
const over = (top, back) => top.c.map((v, i) => v + back[i] * (1 - top.a));
const WHITE = [1, 1, 1];
const BLACK = [0, 0, 0];

// ── tokens ──────────────────────────────────────────────────────────────────
function block(css, selector) {
  const m = css.match(new RegExp(`(?:^|\\n)${selector.replace(/[[\]"=]/g, "\\$&")}\\s*\\{([^}]*)\\}`));
  assert.ok(m, `${selector} exists`);
  return m[1];
}
const val = (body, name) => {
  const m = body.match(new RegExp(`${name}:\\s*([^;]+);`));
  return m ? m[1].trim() : null;
};
const pct = (s) => parseFloat(s) / 100;

const glassBase = block(glass, "html[data-mode]");
const glassLight = block(glass, 'html[data-mode="light"]');
function alpha(mode, name) {
  return pct(val(mode === "light" ? glassLight : glassBase, name) ?? val(glassBase, name));
}
// The mixing percentages are part of each token's definition; read them back
// so a change in glass.css is checked rather than silently ignored.
const accentIn = (name) => pct(val(glassBase, name).match(/var\(--accent\)\s*([\d.]+)%/)[1]);
const textIn = () => pct(val(glassBase, "--glass-text-2").match(/var\(--text\)\s*([\d.]+)%/)[1]);
const tintSurface = () => pct(val(glassBase, "--glass-tint").match(/var\(--glass-surface\)\s*([\d.]+)%/)[1]);
const firstAlpha = (name) => parseFloat(val(glassBase, name).match(/rgba\([^)]*,\s*([\d.]+)\)/)[1]);
const accentText = (t) => mix(pm(t.accent), accentIn("--glass-accent-text"), pm(t.text)).c;

function theme(mode, accentId) {
  const base = block(v6, `html[data-mode="${mode}"]`);
  const acc = block(v6, `html[data-mode="${mode}"][data-accent="${accentId}"]`);
  return {
    text: hex(val(base, "--text")),
    text2: hex(val(base, "--text-secondary")),
    surface: hex(val(base, "--card-solid")),
    bg: hex(val(base, "--bg")),
    accent: hex(val(acc, "--accent")),
    glow: hex(val(acc, "--glow")),
  };
}

/** The glass fill, composited onto a backdrop. Dark glass also gets its
 *  sheen and the pointer highlight at full strength (both lighten it, which
 *  is the worst case for white text); light glass gets neither (they only
 *  lighten it further, which helps dark text). */
function glassOver(t, mode, alphaName, accentName, back) {
  const fill = mix(pm(t.accent), accentIn(accentName), pm(t.surface, alpha(mode, alphaName)));
  let out = over(fill, back);
  if (mode === "dark") out = over(pm(WHITE, firstAlpha("--glass-sheen") + firstAlpha("--glass-spot")), out);
  return out;
}
const text2On = (t) => mix(pm(t.text), textIn(), pm(t.surface)).c;

const failures = [];
function check(label, fg, bg, min) {
  const r = ratio(fg, bg);
  if (r < min) failures.push(`${label}: ${r.toFixed(2)}:1 (needs ${min})`);
}

test("text on glass passes WCAG AA over the lightest and darkest content", () => {
  for (const mode of ["light", "dark"]) {
    for (const id of COLORS) {
      const t = theme(mode, id);
      for (const [name, back] of [["white", WHITE], ["black", BLACK]]) {
        const tag = `${mode} ${id} over ${name}`;
        const regular = glassOver(t, mode, "--glass-alpha", "--glass-bg", back);
        const thick = glassOver(t, mode, "--glass-alpha-thick", "--glass-bg-thick", back);
        check(`${tag}: text on regular glass`, t.text, regular, 4.5);
        check(`${tag}: secondary text on regular glass`, text2On(t), regular, 4.5);
        check(`${tag}: text on sheet glass`, t.text, thick, 4.5);
        check(`${tag}: secondary text on sheet glass`, text2On(t), thick, 4.5);
        // The active tab's label sits on the tinted thumb, on the bar.
        const thumb = over(mix(pm(t.accent), accentIn("--glass-tint"), pm(t.surface, tintSurface())), regular);
        check(`${tag}: active tab label on its thumb`, accentText(t), thumb, 4.5);
      }
      // Clear glass (the round buttons) only ever rests on the ambient layer:
      // its icons need 3:1 against the page colour and the theme's glow.
      for (const [name, back] of [["bg", t.bg], ["glow", t.glow]]) {
        const clear = glassOver(t, mode, "--glass-alpha-clear", "--glass-bg-clear", back);
        check(`${mode} ${id} over ${name}: icon on clear glass`, t.text, clear, 3);
      }
    }
  }
  assert.deepEqual(failures, [], failures.join("\n"));
});

test("glass.css and glass.js are linked on both pages; v8.css is gone", () => {
  for (const html of [appHtml, indexHtml]) {
    assert.match(html, /href="css\/glass\.css"/);
    assert.match(html, /import \{ initGlass \} from "\.\/js\/glass\.js"/);
    assert.match(html, /initGlass\(\);/);
    assert.doesNotMatch(html, /css\/v8\.css/);
  }
});

/** Innermost CSS rules as [selector, body], comments removed. Keyframe steps
 *  ("from", "45%"…) are skipped. */
function rules(css) {
  const out = [];
  for (const m of css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = m[1].trim();
    if (/^(from|to|[\d.]+%)(\s*,\s*(from|to|[\d.]+%))*$/.test(selector)) continue;
    out.push([selector, m[2]]);
  }
  return out;
}

test("glass is a navigation material only and every switch turns it off", () => {
  // Content never blurs: the older layers carry no glass of their own.
  for (const file of ["style.css", "refresh.css", "v5.css", "v6.css", "v7.css", "mobile.css", "motion.css", "student-tools.css"]) {
    assert.doesNotMatch(read(`frontend/css/${file}`), /backdrop-filter/, `${file} has no glass of its own`);
  }
  // Every blur in glass.css goes through a --glass-* token (which the
  // fallbacks switch off), or is the blur(0) a sheet condenses from.
  for (const [selector, body] of rules(glass)) {
    for (const [, value] of body.matchAll(/backdrop-filter:\s*([^;]+);/g)) {
      assert.match(value.trim(), /^(var\(--glass-[a-z-]+\)|none|blur\(0\) saturate\(100%\))$/, `${selector}: ${value}`);
    }
  }
  for (const fallback of [
    block(glass, 'html[data-mode][data-glass="false"]'),
    glass.match(/@media \(prefers-reduced-transparency: reduce\) \{([\s\S]*?)\n\}/)[1],
    glass.match(/@media \(prefers-contrast: more\) \{([\s\S]*?)\n\}/)[1],
  ]) {
    for (const token of ["--glass-blur", "--glass-blur-clear", "--glass-blur-scrim"]) {
      assert.match(fallback, new RegExp(`${token}: none;`), `${token} is switched off`);
    }
    assert.match(fallback, /--glass-bg: var\(--glass-(bg-solid|surface)\);/);
  }
  assert.match(glass, /@supports not \(\(backdrop-filter: blur\(1px\)\) or \(-webkit-backdrop-filter: blur\(1px\)\)\)/);
});

test("glass motion is scoped to the motion switch and Hide grades", () => {
  // Every animation glass.css adds only runs under .m-on (the ripple element
  // itself is only ever created while motion is on).
  for (const [selector, body] of rules(glass)) {
    if (!/(^|;|\s)animation:(?!\s*none\b)/.test(body)) continue;
    for (const one of selector.split(",")) {
      assert.match(one, /\.m-on\b|^\s*\.glass-ripple\s*$/, `animation is motion-gated: ${one.trim()}`);
    }
  }
  const js = read("frontend/js/glass.js");
  assert.match(js, /"pointerdown",\s*\(e\) => \{\s*if \(!motionEnabled\(\)\) return;/);
  // The chart never draws itself while marks are hidden.
  assert.match(glass, /html\[data-hide-marks="true"\] \.g-chart \.g-line/);
});
