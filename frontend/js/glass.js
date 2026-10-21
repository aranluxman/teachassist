// ============================================================================
// Liquid Glass — behaviour for css/glass.css
// ----------------------------------------------------------------------------
// Decorates DOM the other modules already rendered; touches no data. With
// this module removed every screen still works, it just stops reacting.
//
//   • Header     the visible screen's header turns to glass once the page
//                scrolls past 8px (.g-stuck).
//   • Light      on pointer devices the glass catches light under the cursor
//                (--mx/--my). Touch devices get a slow CSS drift instead; no
//                device-orientation (it needs a permission prompt on iOS).
//   • Press      a soft ripple from the touch point on glass buttons.
//   • Reveal     cards and rows below the fold fade up once, as they arrive.
//   • Lens       press the tab bar and its thumb lifts into a glass lens you
//                can drag between tabs; release snaps to the nearest one.
//                Settings toggles do the same with their knob, and so do
//                segmented controls (Evaluations ⇄ Breakdown): their thumb
//                follows the finger 1:1 and a flick throws it to the other side.
//   • Glow       wherever you tap, a soft glow in the theme's accent colour.
//
// Everything that moves checks motionEnabled(), so Settings → Interface
// animations off (or prefers-reduced-motion) leaves the app static. Nothing
// here animates a mark, so Hide grades has nothing to guard.
// ============================================================================

import { motionEnabled } from "./motion.js";

const SURFACES = ".tabbar, .g-header.g-stuck, .segmented, .g-btn, .app-notice, .composer, .auth-card, .sheet";
const PRESSABLE = ".g-btn, .tabbar button, .segmented button, .suggest-chip, .msg-actions .chip";
const REVEALABLE = ".card, .disclosure, .g-row";
// These already play their own entrance in css/motion.css.
const ANIMATED_ELSEWHERE = ".g-list > .g-row, #seg-content .eval-row, .schedule-row .g-row, .sheet .g-row";

let booted = false;

export function initGlass() {
  if (booted || typeof document === "undefined") return;
  booted = true;
  initHeader();
  initLight();
  initPress();
  initReveal();
  initTabLens();
  initToggleLens();
  initSegmentLens();
}

/** Swallow the browser's own click that follows a drag (programmatic
 *  clicks are not trusted, so they still go through). */
let swallow = { node: null, until: 0 };
function swallowNextClick(node) {
  swallow = { node, until: performance.now() + 450 };
}
if (typeof document !== "undefined") {
  document.addEventListener(
    "click",
    (e) => {
      if (!e.isTrusted || !swallow.node || performance.now() > swallow.until) return;
      if (!swallow.node.contains(e.target)) return;
      swallow.node = null;
      e.preventDefault();
      e.stopPropagation();
    },
    true,
  );
}

// ─────────────────────────────── header ─────────────────────────────────────

function visibleHeader() {
  return document.querySelector(".screen:not(.hidden) .g-header:not(.sheet-header)");
}

function initHeader() {
  let queued = false;
  let current = null;
  const sync = () => {
    queued = false;
    const header = visibleHeader();
    if (current && current !== header) current.classList.remove("g-stuck");
    current = header;
    const scrolled = window.scrollY > 8;
    document.documentElement.classList.toggle("g-scrolled", scrolled);
    if (header) header.classList.toggle("g-stuck", scrolled);
  };
  const queue = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(sync);
  };
  window.addEventListener("scroll", queue, { passive: true });
  window.addEventListener("hashchange", queue);
  // Screens re-render their header; pick the new one up.
  const shell = document.querySelector(".shell");
  if (shell) new MutationObserver(queue).observe(shell, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
  queue();
}

// ──────────────────────────────── light ─────────────────────────────────────

function initLight() {
  const fine = window.matchMedia?.("(hover: hover) and (pointer: fine)");
  if (!fine || !fine.matches) return;
  let surface = null;
  let point = null;
  let queued = false;

  const paint = () => {
    queued = false;
    if (!surface || !point) return;
    const r = surface.getBoundingClientRect();
    surface.style.setProperty("--mx", `${(((point.x - r.left) / r.width) * 100).toFixed(1)}%`);
    surface.style.setProperty("--my", `${(((point.y - r.top) / r.height) * 100).toFixed(1)}%`);
  };
  const clear = (node) => {
    node?.style.removeProperty("--mx");
    node?.style.removeProperty("--my");
  };

  document.addEventListener(
    "pointermove",
    (e) => {
      if (!motionEnabled()) return;
      const next = e.target.closest?.(SURFACES) || null;
      if (next !== surface) {
        clear(surface);
        surface = next;
      }
      if (!surface) return;
      point = { x: e.clientX, y: e.clientY };
      if (!queued) {
        queued = true;
        requestAnimationFrame(paint);
      }
    },
    { passive: true },
  );
  document.addEventListener("pointerleave", () => {
    clear(surface);
    surface = null;
  });
}

// ──────────────────────────────── press ─────────────────────────────────────

function initPress() {
  // One glow per pointer: a drag doesn't leave a trail of them.
  const live = new Map();
  document.addEventListener(
    "pointerdown",
    (e) => {
      if (!motionEnabled() || e.button > 0) return;
      live.get(e.pointerId)?.remove();
      const host = e.target.closest?.(PRESSABLE);
      if (host && !host.disabled) {
        // Inside a glass button: the glow is clipped to the button.
        const r = host.getBoundingClientRect();
        const wrap = document.createElement("span");
        wrap.className = "glass-ripple-wrap";
        wrap.setAttribute("aria-hidden", "true");
        const ripple = document.createElement("span");
        ripple.className = "glass-ripple";
        ripple.style.setProperty("--rx", `${e.clientX - r.left}px`);
        ripple.style.setProperty("--ry", `${e.clientY - r.top}px`);
        wrap.appendChild(ripple);
        if (getComputedStyle(host).position === "static") host.style.position = "relative";
        host.appendChild(wrap);
        setTimeout(() => wrap.remove(), 650);
      }
      // Everywhere: a soft accent-coloured glow under the finger.
      const glow = document.createElement("span");
      glow.className = "tap-glow";
      glow.setAttribute("aria-hidden", "true");
      glow.style.left = `${e.clientX}px`;
      glow.style.top = `${e.clientY}px`;
      document.body.appendChild(glow);
      live.set(e.pointerId, glow);
      const done = () => {
        glow.remove();
        if (live.get(e.pointerId) === glow) live.delete(e.pointerId);
      };
      glow.addEventListener("animationend", done, { once: true });
      setTimeout(done, 900);
    },
    { passive: true },
  );
}

// ──────────────────────────────── reveal ────────────────────────────────────

function initReveal() {
  if (!("IntersectionObserver" in window)) return;
  const seen = new WeakSet();
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const node = entry.target;
        io.unobserve(node);
        node.classList.add("g-revealed");
        // Drop the classes afterwards so nothing keeps a transform.
        setTimeout(() => node.classList.remove("g-reveal", "g-revealed"), 900);
      }
    },
    { rootMargin: "0px 0px -6% 0px" },
  );

  let queued = false;
  const scan = () => {
    queued = false;
    const screen = document.querySelector(".screen:not(.hidden)");
    if (!screen) return;
    // Number the chart's dots so they pop in one after another.
    screen.querySelectorAll(".g-chart").forEach((chart) => {
      chart.querySelectorAll(".g-dot").forEach((dot, i) => dot.style.setProperty("--g-i", String(i)));
    });
    if (!motionEnabled()) return;
    let i = 0;
    for (const node of screen.querySelectorAll(REVEALABLE)) {
      if (seen.has(node)) continue;
      seen.add(node);
      if (node.matches(ANIMATED_ELSEWHERE) || node.closest(".g-reveal")) continue;
      // Only what is still below the fold; what is on screen is already shown.
      if (node.getBoundingClientRect().top < window.innerHeight) continue;
      node.style.setProperty("--g-i", String(Math.min(i++ % 6, 5)));
      node.classList.add("g-reveal");
      io.observe(node);
    }
  };
  const queue = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(scan);
  };
  const shell = document.querySelector(".shell");
  if (shell) new MutationObserver(queue).observe(shell, { childList: true, subtree: true });
  queue();
}

// ─────────────────────────────── tab lens ───────────────────────────────────

function initTabLens() {
  const bar = document.querySelector(".tabbar");
  if (!bar) return;
  const tabs = () => [...bar.querySelectorAll("button[data-tab]")];
  const nearest = (x) => {
    let best = null;
    for (const b of tabs()) {
      const r = b.getBoundingClientRect();
      const d = Math.abs(r.left + r.width / 2 - x);
      if (!best || d < best.d) best = { b, d };
    }
    return best?.b || null;
  };
  // Centre the thumb under a point (clamped inside the bar).
  const place = (pill, clientX) => {
    const r = bar.getBoundingClientRect();
    const w = pill.offsetWidth;
    const x = Math.max(4, Math.min(r.width - w - 4, clientX - r.left - w / 2));
    pill.style.translate = `${x}px 0px`;
  };
  let drag = null;

  bar.addEventListener("pointerdown", (e) => {
    const pill = bar.querySelector(":scope > .m-tab-indicator");
    const tab = e.target.closest("button[data-tab]");
    if (!pill || !tab || e.button !== 0) return;
    drag = { id: e.pointerId, x0: e.clientX, pill, rest: pill.style.translate, moved: false };
    bar.classList.add("g-lens");
    // The lens appears under the finger, like iOS.
    const r = tab.getBoundingClientRect();
    place(pill, r.left + r.width / 2);
    tab.classList.add("g-under");
  });

  bar.addEventListener("pointermove", (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    if (!drag.moved) {
      if (Math.abs(e.clientX - drag.x0) < 6) return;
      drag.moved = true;
      bar.classList.add("g-dragging");
      try {
        bar.setPointerCapture(e.pointerId);
      } catch {
        /* the pointer already left */
      }
    }
    place(drag.pill, e.clientX);
    const under = nearest(e.clientX);
    for (const b of tabs()) b.classList.toggle("g-under", b === under);
  });

  const end = (e, cancelled) => {
    if (!drag || e.pointerId !== drag.id) return;
    const { pill, rest, moved } = drag;
    drag = null;
    bar.classList.remove("g-lens", "g-dragging");
    for (const b of tabs()) b.classList.remove("g-under");
    const target = cancelled ? null : nearest(e.clientX);
    if (!moved && !cancelled) return; // a tap: the normal click navigates
    swallowNextClick(bar);
    if (target && !target.classList.contains("active")) target.click();
    else pill.style.translate = rest; // back where it was
  };
  bar.addEventListener("pointerup", (e) => end(e, false));
  bar.addEventListener("pointercancel", (e) => end(e, true));
}

// ────────────────────────────── toggle lens ─────────────────────────────────

const SWITCH = ".preference-row input[role=switch], .share-toggle input[role=switch]";
const KNOB_TRAVEL = 20; // px between off and on (css: translateX(--g-k * 20px))

function initToggleLens() {
  let drag = null;

  document.addEventListener("pointerdown", (e) => {
    const input = e.target.closest?.(SWITCH);
    if (!input || input.disabled || e.button !== 0) return;
    const k = input.checked ? 1 : 0;
    drag = { id: e.pointerId, input, x0: e.clientX, k0: k, k, moved: false };
    input.classList.add("g-lens");
  });

  document.addEventListener(
    "pointermove",
    (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const dx = e.clientX - drag.x0;
      if (!drag.moved) {
        if (Math.abs(dx) < 4) return;
        drag.moved = true;
        drag.input.classList.add("g-dragging");
        try {
          drag.input.setPointerCapture(e.pointerId);
        } catch {
          /* the pointer already left */
        }
      }
      drag.k = Math.max(0, Math.min(1, drag.k0 + dx / KNOB_TRAVEL));
      drag.input.style.setProperty("--g-k", drag.k.toFixed(3));
    },
    { passive: true },
  );

  const end = (e, cancelled) => {
    if (!drag || e.pointerId !== drag.id) return;
    const { input, moved, k, k0 } = drag;
    drag = null;
    input.classList.remove("g-lens", "g-dragging");
    input.style.removeProperty("--g-k");
    if (!moved) return; // a tap: the browser toggles it as usual
    // A drag decides by where the knob was let go; the browser's own click
    // (which would flip it again) is swallowed.
    swallowNextClick(input);
    const on = cancelled ? k0 === 1 : k >= 0.5;
    if (on !== input.checked) {
      input.checked = on;
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }
  };
  document.addEventListener("pointerup", (e) => end(e, false));
  document.addEventListener("pointercancel", (e) => end(e, true));
}

// ───────────────────────────── segment lens ─────────────────────────────────

/** Apple's momentum projection: where a flick at `v` px/s comes to rest. */
const project = (v, d = 0.998) => ((v / 1000) * d) / (1 - d);

/**
 * Drag a segmented control's thumb. It lifts into a glass lens, tracks the
 * finger from where it was grabbed, rubber-bands past the ends, and on release
 * the flick's momentum picks the option it lands on. While dragging, the
 * control dispatches `g-seg-drag` ({ progress: 0…1 across the options }) so a
 * screen can let its content follow; `g-seg-drag-end` when it lets go.
 */
function initSegmentLens() {
  let drag = null;
  const options = (seg) => [...seg.querySelectorAll(":scope > button")];

  document.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    const seg = e.target.closest?.(".segmented.m-has-thumb");
    const thumb = seg?.querySelector(":scope > .m-thumb");
    if (!seg || !thumb || !e.target.closest("button")) return;
    const x0 = parseFloat(thumb.style.translate) || 0;
    drag = { id: e.pointerId, seg, thumb, cx: e.clientX, x0, x: x0, moved: false, hist: [{ x: e.clientX, t: performance.now() }] };
  });

  document.addEventListener(
    "pointermove",
    (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const dx = e.clientX - drag.cx;
      if (!drag.moved) {
        if (Math.abs(dx) < 6 || !motionEnabled()) return;
        drag.moved = true;
        drag.seg.classList.add("g-lens", "g-dragging");
        try {
          drag.seg.setPointerCapture(e.pointerId);
        } catch {
          /* the pointer already left */
        }
      }
      const btns = options(drag.seg);
      const first = btns[0], last = btns[btns.length - 1];
      const min = first.offsetLeft + 5;
      const max = last.offsetLeft + last.offsetWidth - drag.thumb.offsetWidth - 5;
      let x = drag.x0 + dx;
      // Past the ends the thumb resists more the further it goes.
      if (x < min) x = min - rubberband(min - x, drag.seg.offsetWidth);
      if (x > max) x = max + rubberband(x - max, drag.seg.offsetWidth);
      drag.x = x;
      drag.thumb.style.translate = `${x}px 0px`;
      drag.hist.push({ x: e.clientX, t: performance.now() });
      if (drag.hist.length > 5) drag.hist.shift();
      const progress = max > min ? Math.max(0, Math.min(1, (x - min) / (max - min))) : 0;
      const centre = x + drag.thumb.offsetWidth / 2;
      for (const b of btns) b.classList.toggle("g-under", Math.abs(b.offsetLeft + b.offsetWidth / 2 - centre) < b.offsetWidth / 2);
      drag.seg.dispatchEvent(new CustomEvent("g-seg-drag", { detail: { progress } }));
    },
    { passive: true },
  );

  const end = (e, cancelled) => {
    if (!drag || e.pointerId !== drag.id) return;
    const { seg, thumb, moved, x, x0, hist } = drag;
    drag = null;
    seg.classList.remove("g-lens", "g-dragging");
    const btns = options(seg);
    btns.forEach((b) => b.classList.remove("g-under"));
    if (!moved) return; // a tap: the normal click switches
    swallowNextClick(seg);
    const a = hist[0], b = hist[hist.length - 1];
    const v = b.t > a.t ? ((b.x - a.x) / (b.t - a.t)) * 1000 : 0;
    // Land where the flick was heading, not where the finger let go.
    const centre = (cancelled ? x0 : x + project(v)) + thumb.offsetWidth / 2;
    let target = btns[0];
    for (const btn of btns) {
      if (Math.abs(btn.offsetLeft + btn.offsetWidth / 2 - centre) < Math.abs(target.offsetLeft + target.offsetWidth / 2 - centre)) target = btn;
    }
    seg.dispatchEvent(new CustomEvent("g-seg-drag-end", { detail: { committed: !target.classList.contains("active") } }));
    if (!target.classList.contains("active")) target.click();
    else thumb.style.translate = `${x0}px 0px`; // springs back from where it is
  };
  document.addEventListener("pointerup", (e) => end(e, false));
  document.addEventListener("pointercancel", (e) => end(e, true));
}

/** Soft boundary (Apple's rubber-band): progressive resistance past an edge. */
function rubberband(overshoot, dimension, c = 0.55) {
  return (overshoot * dimension * c) / (dimension + c * Math.abs(overshoot));
}
