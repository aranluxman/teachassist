// ============================================================================
// Motion layer
// ----------------------------------------------------------------------------
// Every animation helper the app uses lives here. Nothing in this module
// touches data, credentials or storage — it only decorates DOM that the other
// modules have already rendered, so the screens still work with it removed.
//
// There is ONE motion switch, and it is the one that already existed:
//   • Settings → "Interface animations" writes data-motion="true|false" on
//     <html> (see personalization.js), and
//   • the device may ask for `prefers-reduced-motion: reduce`.
// Either of those turning motion off removes the `.m-on` class that all of
// css/motion.css is scoped under, adds `.no-motion`, and makes every helper
// below jump straight to its final value.
//
// A second rule applies to anything numeric: when Settings → "Hide grades" is
// on (data-hide-marks="true"), marks are never counted up, drawn or grown —
// the concealed final state is written immediately so no animation can reveal
// a mark mid-flight.
// ============================================================================

const reduceQuery =
  typeof window !== "undefined" && window.matchMedia
    ? window.matchMedia("(prefers-reduced-motion: reduce)")
    : null;

/** True when new motion should run: the Settings toggle AND the OS agree. */
export function motionEnabled() {
  if (typeof document === "undefined") return false;
  if (document.documentElement.dataset.motion === "false") return false;
  return !(reduceQuery && reduceQuery.matches);
}

/** True when Settings → "Hide grades" is concealing marks. */
export function marksHidden() {
  return (
    typeof document !== "undefined" &&
    document.documentElement.dataset.hideMarks === "true"
  );
}

function syncMotionClass() {
  const on = motionEnabled();
  document.documentElement.classList.toggle("m-on", on);
  document.documentElement.classList.toggle("no-motion", !on);
}

let booted = false;

/** Wire the motion switch, the loop pausing and the top-bar shadow. Safe to
 *  call more than once. */
export function initMotion() {
  if (typeof document === "undefined") return;
  syncMotionClass();
  if (booted) return;
  booted = true;

  // Follow the existing Settings toggle without adding a second switch: the
  // toggle writes data-motion on <html>, so watch that attribute.
  new MutationObserver(syncMotionClass).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-motion"],
  });
  reduceQuery?.addEventListener?.("change", syncMotionClass);

  // Park every infinite animation while the tab is in the background.
  const syncVisibility = () => {
    document.documentElement.dataset.tabHidden = String(document.hidden);
  };
  syncVisibility();
  document.addEventListener("visibilitychange", syncVisibility);

  initTopbarShadow();
}

// ────────────────────────────── small helpers ──────────────────────────────

/** Number the children of a staggered group so CSS can offset each delay. */
export function stagger(nodes, startAt = 0) {
  let i = startAt;
  for (const node of nodes || []) {
    if (node && node.style) node.style.setProperty("--m-i", String(i++));
  }
}

/** Re-run a one-shot CSS animation class on an element. */
export function replay(node, className) {
  if (!node) return;
  node.classList.remove(className);
  // Reading offsetWidth flushes the removal so the animation restarts.
  void node.offsetWidth;
  node.classList.add(className);
}

/** Horizontal shake — used for a failed sign in and impossible results. */
export function shake(node) {
  if (!node || !motionEnabled()) return;
  replay(node, "m-shake");
  node.addEventListener(
    "animationend",
    () => node.classList.remove("m-shake"),
    { once: true },
  );
}

const easeOut = (t) => 1 - Math.pow(1 - t, 3);

/**
 * Count a number up (or down) to its final value.
 * Skipped entirely — final value written at once — when motion is off, or
 * when the value is a mark and "Hide grades" is on.
 */
export function countUp(node, to, options = {}) {
  const {
    from = 0,
    decimals = 1,
    suffix = "%",
    prefix = "",
    duration = 1200,
    isMark = true,
    format,
  } = options;
  if (!node) return;
  const render = (v) =>
    (node.textContent = format
      ? format(v)
      : `${prefix}${v.toFixed(decimals)}${suffix}`);

  if (to == null || !isFinite(to)) return;
  if (!motionEnabled() || (isMark && marksHidden())) {
    render(to);
    return;
  }
  const start = performance.now();
  const delta = to - from;
  const step = (now) => {
    const t = Math.min(1, (now - start) / duration);
    render(from + delta * easeOut(t));
    if (t < 1 && node.isConnected) requestAnimationFrame(step);
    else render(to);
  };
  render(from);
  requestAnimationFrame(step);
}

// Previous on-screen values, so a refresh animates from the old number to the
// new one instead of restarting from zero.
const remembered = new Map();
export function previousValue(key, fallback = 0) {
  return remembered.has(key) ? remembered.get(key) : fallback;
}
export function rememberValue(key, value) {
  remembered.set(key, value);
}

// ───────────────────────────────── gauges ──────────────────────────────────

/**
 * Draw a semicircular gauge arc from `from` % to `to` % and count its number
 * up over the same time. Reads the hooks semiGauge() puts on the SVG.
 */
export function animateGauge(root, to, options = {}) {
  if (!root) return;
  const svg = root.matches?.("svg") ? root : root.querySelector("svg");
  if (!svg) return;
  const arc = svg.querySelector(".gauge-arc");
  const num = svg.querySelector(".gauge-num");
  const { from = 0, duration = 1200 } = options;
  const target = Number(svg.dataset.value);
  const value = to == null ? (isFinite(target) ? target : null) : to;
  if (value == null) return;

  if (num) {
    countUp(num, value, { from, duration, decimals: 1, suffix: "%" });
  }
  if (!arc) return;

  const len = Number(arc.dataset.len);
  if (!isFinite(len) || len <= 0) return;
  const clamp = (v) => Math.max(0, Math.min(100, v));
  const offsetFor = (pct) => len - (clamp(pct) / 100) * len;

  arc.style.strokeDasharray = `${len} ${len + 4}`;
  if (!motionEnabled() || marksHidden()) {
    arc.style.strokeDashoffset = String(offsetFor(value));
    return;
  }
  arc.style.transitionDuration = `${duration}ms`;
  arc.style.strokeDashoffset = String(offsetFor(from));
  void arc.getBoundingClientRect();
  requestAnimationFrame(() => {
    arc.style.strokeDashoffset = String(offsetFor(value));
  });
}

// ───────────────────────────────── ticker ──────────────────────────────────

/**
 * Rotate short encouraging lines inside one grid cell, so the line changes
 * without the page ever reflowing. Announces nothing (aria-live="off").
 */
export function mountTicker(host, lines, everyMs = 3000) {
  if (!host || !Array.isArray(lines) || !lines.length) return;
  host.classList.add("m-ticker");
  host.setAttribute("aria-live", "off");
  host.textContent = "";
  lines.forEach((line, i) => {
    const span = document.createElement("span");
    span.textContent = line;
    if (i === 0) span.classList.add("m-tick-current");
    host.appendChild(span);
  });
  if (!motionEnabled()) return; // Only the first line, shown instantly.

  const spans = [...host.children];
  let index = 0;
  const timer = setInterval(() => {
    if (!host.isConnected) return clearInterval(timer);
    if (document.hidden || !motionEnabled()) return;
    const current = spans[index];
    index = (index + 1) % spans.length;
    const next = spans[index];
    current.classList.remove("m-tick-current");
    replay(current, "m-tick-leaving");
    next.classList.remove("m-tick-leaving");
    replay(next, "m-tick-current");
  }, everyMs);
}

// ───────────────────────────── sliding thumbs ──────────────────────────────

/**
 * A pill that slides between the options of a segmented control instead of
 * each option flicking on and off. Returns a `move(button)` function.
 */
export function mountThumb(host, options = {}) {
  if (!host) return () => {};
  const { inset = 0, radius = null } = options;
  let thumb = host.querySelector(":scope > .m-thumb");
  if (!thumb) {
    thumb = document.createElement("span");
    thumb.className = "m-thumb";
    thumb.setAttribute("aria-hidden", "true");
    host.prepend(thumb);
  }
  if (radius) thumb.style.borderRadius = radius;
  host.classList.add("m-has-thumb");

  const move = (button) => {
    if (!button || !button.offsetParent) return;
    thumb.style.width = `${button.offsetWidth - inset * 2}px`;
    thumb.style.transform = `translateX(${button.offsetLeft + inset}px)`;
    thumb.classList.add("m-thumb-ready");
  };
  return move;
}

/** The tab bar's sliding indicator. Returns a `move(button)` function. */
export function mountTabIndicator(tabbar) {
  if (!tabbar) return () => {};
  let pill = tabbar.querySelector(":scope > .m-tab-indicator");
  if (!pill) {
    pill = document.createElement("span");
    pill.className = "m-tab-indicator";
    pill.setAttribute("aria-hidden", "true");
    tabbar.prepend(pill);
  }
  tabbar.classList.add("m-has-indicator");

  return (button) => {
    if (!button || !button.offsetParent) return;
    // Match the highlight the theme already draws behind the active icon, so
    // the pill is identical at every breakpoint.
    const before = getComputedStyle(button, "::before");
    const w = parseFloat(before.width) || 50;
    const h = parseFloat(before.height) || 30;
    const top = parseFloat(before.top);
    pill.style.width = `${w}px`;
    pill.style.height = `${h}px`;
    if (isFinite(top)) pill.style.top = `${top}px`;
    pill.style.transform = `translateX(${
      button.offsetLeft + (button.offsetWidth - w) / 2
    }px)`;
    pill.classList.add("m-thumb-ready");
    replay(button, "m-bounce");
  };
}

// ─────────────────────────── screens & chrome ──────────────────────────────

const TAB_ORDER = ["courses", "guidance", "dreams", "assistant", "settings"];

/** Which way a move between two screens should travel: 1 right, -1 left. */
export function screenDirection(from, to) {
  if (to === "detail") return 1;
  if (from === "detail") return -1;
  const a = TAB_ORDER.indexOf(from);
  const b = TAB_ORDER.indexOf(to);
  if (a < 0 || b < 0 || a === b) return 0;
  return b > a ? 1 : -1;
}

/** Play a screen's entrance from the direction of travel. */
export function enterScreen(node, direction) {
  if (!node) return;
  node.classList.remove("m-from-right", "m-from-left");
  if (!motionEnabled() || !direction) return;
  replay(node, direction > 0 ? "m-from-right" : "m-from-left");
}

/** Lift the top bar with a soft shadow once the screen scrolls past 8px. */
export function initTopbarShadow() {
  const bar = document.querySelector(".app-topbar");
  if (!bar) return;
  const sync = () => bar.classList.toggle("m-scrolled", window.scrollY > 8);
  sync();
  window.addEventListener("scroll", sync, { passive: true });
}

// ─────────────────────────────── sparkles ──────────────────────────────────

/** Tiny ✦ sparkles that orbit the dream card's mark. */
export function orbitSparkles(host, count = 4) {
  if (!host || host.querySelector(".m-orbit-ring")) return;
  const ring = document.createElement("div");
  ring.className = "m-orbit-ring m-loop";
  ring.setAttribute("aria-hidden", "true");
  const radius = Math.max(28, Math.round((host.offsetWidth || 96) / 2 - 4));
  for (let i = 0; i < count; i++) {
    // An arm places the sparkle; the glyph inside it does the spinning, so no
    // two animations ever compete for the same transform.
    const arm = document.createElement("span");
    arm.className = "m-orbit-arm";
    arm.style.setProperty("--m-a", `${(360 / count) * i}deg`);
    arm.style.setProperty("--m-r", `${radius}px`);
    const spark = document.createElement("i");
    spark.textContent = "✦";
    spark.className = "m-loop";
    spark.style.setProperty("--m-i", String(i));
    arm.appendChild(spark);
    ring.appendChild(arm);
  }
  host.appendChild(ring);
  observeLoop(ring);
}

/** A one-shot burst of ✦ radiating out of `host` (which must be positioned). */
export function sparkleBurst(host, count = 9) {
  if (!host || !motionEnabled()) return;
  host.querySelector(":scope > .m-burst")?.remove();
  const burst = document.createElement("span");
  burst.className = "m-burst";
  burst.setAttribute("aria-hidden", "true");
  for (let i = 0; i < count; i++) {
    const spark = document.createElement("i");
    spark.textContent = "✦";
    spark.style.setProperty("--m-a", `${(360 / count) * i}deg`);
    spark.style.setProperty("--m-i", String(i));
    burst.appendChild(spark);
  }
  host.appendChild(burst);
  setTimeout(() => burst.remove(), 1100);
}

// Pause looping animations while they are scrolled out of view.
let loopObserver = null;
function observeLoop(node) {
  if (!node || typeof IntersectionObserver === "undefined") return;
  if (!loopObserver) {
    loopObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        entry.target.classList.toggle("m-paused", !entry.isIntersecting);
        entry.target
          .querySelectorAll(".m-loop")
          .forEach((child) =>
            child.classList.toggle("m-paused", !entry.isIntersecting),
          );
      }
    });
  }
  loopObserver.observe(node);
}
export { observeLoop };

// ───────────────────────── button feedback helpers ─────────────────────────

/** Swap a button's label to "Saved ✓" with a pop, then put it back. */
export function savedFeedback(button, label = "Saved ✓", holdMs = 1400) {
  if (!button) return;
  if (button.dataset.mBusy === "1") return;
  const original = button.innerHTML;
  button.dataset.mBusy = "1";
  button.textContent = label;
  if (motionEnabled()) replay(button, "m-saved");
  setTimeout(() => {
    button.classList.remove("m-saved");
    button.innerHTML = original;
    delete button.dataset.mBusy;
  }, holdMs);
}

/** Spin the refresh glyph while working; pop a ✓ when it lands. */
export function startRefreshSpin(button) {
  if (!button) return;
  button.classList.add("m-working");
}
export function finishRefreshSpin(button, glyph = "↻", okGlyph = "✓") {
  if (!button) return;
  button.classList.remove("m-working");
  button.textContent = okGlyph;
  if (motionEnabled()) replay(button, "m-done");
  setTimeout(() => {
    button.classList.remove("m-done");
    button.textContent = glyph;
  }, 1200);
}

/** A three-dot "working on it" bubble for the assistant. */
export function typingIndicator() {
  const wrap = document.createElement("span");
  wrap.className = "m-typing";
  wrap.setAttribute("aria-hidden", "true");
  for (let i = 0; i < 3; i++) {
    const dot = document.createElement("i");
    dot.style.setProperty("--m-i", String(i));
    wrap.appendChild(dot);
  }
  return wrap;
}

// ─────────────────────────── disclosure (details) ──────────────────────────

/**
 * Give a <details> a height transition. The markup keeps working exactly as
 * before — this only delays the `open` flip long enough to animate out.
 */
export function initDisclosure(details) {
  if (!details || details.dataset.mDisclosure === "1") return;
  details.dataset.mDisclosure = "1";
  const summary = details.querySelector("summary");
  if (!summary) return;

  const body = document.createElement("div");
  body.className = "m-disclosure";
  const inner = document.createElement("div");
  inner.className = "m-disclosure-inner";
  const rest = [...details.childNodes].filter((n) => n !== summary);
  rest.forEach((node) => inner.appendChild(node));
  body.appendChild(inner);
  details.appendChild(body);
  details.classList.toggle("m-open", details.open);

  summary.addEventListener("click", (event) => {
    if (!motionEnabled()) return; // Native open/close, instantly.
    event.preventDefault();
    if (details.open) {
      details.classList.remove("m-open");
      setTimeout(() => {
        if (!details.classList.contains("m-open")) details.open = false;
      }, 320);
    } else {
      details.open = true;
      requestAnimationFrame(() => details.classList.add("m-open"));
    }
  });

  // Keep the class in step when something opens it programmatically.
  new MutationObserver(() => {
    if (details.open)
      requestAnimationFrame(() => details.classList.add("m-open"));
    else details.classList.remove("m-open");
  }).observe(details, { attributes: true, attributeFilter: ["open"] });
}

// ──────────────────────────────── Chart.js ─────────────────────────────────

/**
 * Chart.js animation config that draws the progression line left-to-right and
 * pops each point in. Returns `false` when motion is off, which is Chart.js's
 * own way of rendering the final chart with no animation at all.
 */
export function chartAnimation(pointCount) {
  if (!motionEnabled()) return false;
  const total = 900;
  const step = total / Math.max(1, pointCount);
  const previousY = (ctx) => {
    try {
      if (ctx.index === 0)
        return ctx.chart.scales.y.getPixelForValue(ctx.chart.scales.y.min);
      const points = ctx.chart.getDatasetMeta(ctx.datasetIndex).data;
      return points[ctx.index - 1].getProps(["y"], true).y;
    } catch {
      return undefined;
    }
  };
  return {
    x: {
      type: "number",
      easing: "linear",
      duration: step,
      from: NaN,
      delay(ctx) {
        if (ctx.type !== "data" || ctx.xStarted) return 0;
        ctx.xStarted = true;
        return ctx.index * step;
      },
    },
    y: {
      type: "number",
      easing: "linear",
      duration: step,
      from: previousY,
      delay(ctx) {
        if (ctx.type !== "data" || ctx.yStarted) return 0;
        ctx.yStarted = true;
        return ctx.index * step;
      },
    },
    radius: {
      type: "number",
      easing: "easeOutQuart",
      duration: 280,
      from: 0,
      delay(ctx) {
        if (ctx.type !== "data" || ctx.rStarted) return 0;
        ctx.rStarted = true;
        return 140 + ctx.index * step;
      },
    },
  };
}
