// Finger swiping for the pagers (home: average gauge / chart, course page:
// grade / progression / info). The browser only scrolls the page up and down
// on a pager (`touch-action: pan-y`), so a vertical scroll never drags the
// average sideways; sideways moves are handled here instead. That way a small
// nudge or quick flick switches pages, while the browser's own snap needed a
// drag past halfway.

/** Pixels a finger travels before we decide it's sideways or up/down. */
export const LOCK_PX = 6;
/** A sideways drag this long switches the page, even slowly. */
export const SWIPE_PX = 20;
/** A flick this fast (px per ms) switches the page, however short. */
export const FLICK_SPEED = 0.3;
/** How long to press a chart before sliding inspects points instead of swiping. */
export const HOLD_MS = 300;

/**
 * Which page to land on when the finger lifts. `dx` is the total sideways
 * travel (negative = finger moved left = next page) and `velocity` the speed
 * at release in px/ms (same sign convention). A fast flick decides the
 * direction on its own, so flicking back after a long drag still works.
 */
export function swipeTarget(index, count, dx, velocity = 0) {
  let step = 0;
  if (Math.abs(velocity) >= FLICK_SPEED) step = velocity < 0 ? 1 : -1;
  else if (Math.abs(dx) >= SWIPE_PX) step = dx < 0 ? 1 : -1;
  return Math.min(Math.max(index + step, 0), Math.max(count - 1, 0));
}

/**
 * Let a finger swipe `track` page to page. `go(i)` scrolls to page i.
 * Mouse users keep the dots, trackpad scrolling and arrow keys.
 */
export function attachSwipe(track, go) {
  let s = null;
  const pageCount = () => track.children.length;
  const width = () => Math.max(1, track.clientWidth);
  // A chart being inspected (press and hold) owns the finger.
  const inspecting = () => track.querySelector(".g-trend.is-inspecting");

  const end = (e, cancelled) => {
    if (!s || e.pointerId !== s.id) return;
    const done = s;
    s = null;
    if (!done.axis) return;
    const dx = e.clientX - done.x;
    // A finger that stopped before lifting isn't flicking.
    const v = e.timeStamp - done.lastT > 100 ? 0 : done.v;
    const target = cancelled ? done.i : swipeTarget(done.i, pageCount(), dx, v);
    go(target, () => track.classList.remove("is-swiping"));
    // Don't let the lift count as a tap on whatever was under the finger.
    if (Math.abs(dx) >= LOCK_PX) {
      const swallow = (c) => { c.stopPropagation(); c.preventDefault(); };
      track.addEventListener("click", swallow, { capture: true, once: true });
      setTimeout(() => track.removeEventListener("click", swallow, { capture: true }), 400);
    }
  };

  track.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "mouse" || !e.isPrimary || pageCount() < 2) return;
    s = {
      id: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      i: Math.round(track.scrollLeft / width()),
      left: track.scrollLeft,
      axis: null,
      lastX: e.clientX,
      lastT: e.timeStamp,
      v: 0,
    };
  });

  track.addEventListener("pointermove", (e) => {
    if (!s || e.pointerId !== s.id) return;
    if (inspecting()) {
      if (s.axis) { s.axis = null; go(s.i, () => track.classList.remove("is-swiping")); }
      s = null;
      return;
    }
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (!s.axis) {
      if (Math.abs(dx) < LOCK_PX && Math.abs(dy) < LOCK_PX) return;
      if (Math.abs(dy) > Math.abs(dx)) { s = null; return; } // up/down: the page scrolls
      s.axis = "x";
      track.classList.add("is-swiping"); // snap off while the finger drags
      try { track.setPointerCapture(e.pointerId); } catch { /* finger already gone */ }
    }
    // Release speed: smoothed over the last few moves.
    const dt = Math.max(1, e.timeStamp - s.lastT); // coalesced events can share a timestamp
    s.v = 0.6 * ((e.clientX - s.lastX) / dt) + 0.4 * s.v;
    s.lastX = e.clientX;
    s.lastT = e.timeStamp;
    // Follow the finger; past the first or last page it stretches a little.
    const max = (pageCount() - 1) * width();
    let left = s.left - dx;
    if (left < 0) left /= 3;
    else if (left > max) left = max + (left - max) / 3;
    track.scrollLeft = left;
  });

  track.addEventListener("pointerup", (e) => end(e, false));
  track.addEventListener("pointercancel", (e) => end(e, true));
}
