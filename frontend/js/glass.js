// ============================================================================
// Liquid Glass — behaviour for css/glass.css
// ----------------------------------------------------------------------------
// Decorates DOM the other modules already rendered; touches no data. With
// this module removed every screen still works, it just stops reacting.
//
//   • Header     the visible screen's header turns to glass once the page
//                scrolls past 8px (.g-stuck); html.g-scrolling is set while
//                the page is moving.
//   • Light      on pointer devices the glass catches light under the cursor
//                (--mx/--my). Touch devices get a slow CSS drift instead; no
//                device-orientation (it needs a permission prompt on iOS).
//   • Press      a soft ripple from the touch point on glass buttons.
//   • Reveal     cards and rows below the fold fade up once, as they arrive.
//   • Lens       press the tab bar and its thumb lifts into a glass lens you
//                can drag between tabs; release snaps to the nearest one.
//                Settings toggles do the same with their knob.
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
  let settle = 0;
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
  // While scrolling, the ambient drift pauses (css/glass.css) so the glass
  // only re-blurs what actually moved.
  const scrolling = () => {
    document.documentElement.classList.add("g-scrolling");
    clearTimeout(settle);
    settle = setTimeout(() => document.documentElement.classList.remove("g-scrolling"), 200);
    queue();
  };
  window.addEventListener("scroll", scrolling, { passive: true });
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
  document.addEventListener(
    "pointerdown",
    (e) => {
      if (!motionEnabled()) return;
      const host = e.target.closest?.(PRESSABLE);
      if (!host || host.disabled) return;
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
      ripple.addEventListener("animationend", () => wrap.remove(), { once: true });
      // Belt and braces: never leave one behind if the animation is skipped.
      setTimeout(() => wrap.remove(), 600);
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
