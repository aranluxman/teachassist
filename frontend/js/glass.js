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
