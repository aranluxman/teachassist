// ============================================================================
// UI kit — the shared pieces of the dark-glass design.
// ----------------------------------------------------------------------------
//   glassButton()   round translucent icon button (back, close, share…)
//   iconTile()      rounded-square tinted icon (rows, fields, sections)
//   pageHeader()    glass button · centred title + subtitle · glass button
//   pct()           a mark as big monospaced digits with a small "%"
//   arcGauge()      the semicircle gauge with a gradient stroke
//   pager()         a swipeable row of panels with dots underneath
//   minimizable()   a ⌃/⌄ button that folds a card down to its heading
// ============================================================================

import { el, escapeHtml } from "./courses.js";
import { marksHidden, motionEnabled } from "./motion.js";
import { readStudentData, writeStudentData } from "./student-store.js";

export const GLYPHS = {
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 5-7 7 7 7"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12M7.5 7.5 12 3l4.5 4.5"/><path d="M8 10H6.5A1.5 1.5 0 0 0 5 11.5v8A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5v-8a1.5 1.5 0 0 0-1.5-1.5H16"/></svg>',
  wand: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20 15 9"/><path d="M17.5 2.5 18.4 5l2.6.9-2.6.9-.9 2.6-.9-2.6L14 5.9l2.6-.9zM8 3l.5 1.5L10 5l-1.5.5L8 7l-.5-1.5L6 5l1.5-.5zM20 13l.5 1.5L22 15l-1.5.5L20 17l-.5-1.5L18 15l1.5-.5z" fill="currentColor" stroke-width="0.8"/></svg>',
  schedule: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="6" y="7" width="15" height="10" rx="2.5"/><path d="M8 4h11M8 20h11"/><circle cx="3" cy="7.5" r=".9" fill="currentColor"/><circle cx="3" cy="12" r=".9" fill="currentColor"/><circle cx="3" cy="16.5" r=".9" fill="currentColor"/></svg>',
  inbox: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M6.2 4h11.6a2 2 0 0 1 1.8 1.1L22 10v7.5a2.5 2.5 0 0 1-2.5 2.5h-15A2.5 2.5 0 0 1 2 17.5V10l2.4-4.9A2 2 0 0 1 6.2 4Zm-.1 2-2 4H8a1 1 0 0 1 1 .9 3 3 0 0 0 6 0 1 1 0 0 1 1-.9h3.9l-2-4z"/></svg>',
  refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.3-5.7L20 8.5"/><path d="M20 3.5v5h-5"/></svg>',
  pin: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="6.5" r="3.5"/><rect x="11" y="9" width="2" height="12" rx="1"/></svg>',
  calc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="5" y="3" width="14" height="18" rx="3"/><path d="M8.5 7.5h7M8.5 12h.01M12 12h.01M15.5 12h.01M8.5 16h.01M12 16h.01M15.5 16h.01" stroke-width="2.4"/></svg>',
  compose: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4H6.5A2.5 2.5 0 0 0 4 6.5v11A2.5 2.5 0 0 0 6.5 20h11a2.5 2.5 0 0 0 2.5-2.5V12"/><path d="M17.6 3.6a2 2 0 0 1 2.8 2.8L12 14.8l-3.6.8.8-3.6z"/></svg>',
  chevron: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 5 7 7-7 7"/></svg>',
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  calendar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 10h17M8 3v4M16 3v4"/><path d="M7.5 13.5h1M11.5 13.5h1M15.5 13.5h1M7.5 16.5h1M11.5 16.5h1" stroke-linecap="round"/></svg>',
  percent: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M19 5 5 19"/><circle cx="7" cy="7" r="2.5"/><circle cx="17" cy="17" r="2.5"/></svg>',
  seal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="m12 2.5 2.4 1.7 2.9-.2 1 2.8 2.5 1.5-.7 2.8 1 2.7-2.4 1.6-.7 2.9-2.9.3-2.1 2-2.6-1.3-2.8.8-1.5-2.5-2.7-1.1.2-2.9L2.5 12l1.7-2.4-.2-2.9 2.8-1 1.5-2.5 2.8.7z"/><path d="m8.5 12 2.3 2.3 4.7-4.7" stroke-linecap="round"/></svg>',
  arrowRight: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  trendUp: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 18 18 6M9 6h9v9"/></svg>',
  cap: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 9.5 12 5l10 4.5L12 14z"/><path d="M6 11.6V16c0 1.4 2.7 3 6 3s6-1.6 6-3v-4.4"/><path d="M22 9.5v5"/></svg>',
  person: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="7.5" r="4.5"/><path d="M3.5 21a8.5 8.5 0 0 1 17 0z"/></svg>',
  lock: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="4.5" y="10.5" width="15" height="11" rx="2.6"/><path d="M8 10.5V7.8a4 4 0 0 1 8 0v2.7" fill="none" stroke="currentColor" stroke-width="2.3"/></svg>',
  palette: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.9-.8 1.9-1.8 0-.5-.2-.9-.5-1.2-.3-.3-.5-.8-.5-1.2 0-1 .8-1.8 1.8-1.8H17a4 4 0 0 0 4-4C21 6.6 17 3 12 3z"/><circle cx="7.5" cy="11.5" r="1.3" fill="currentColor" stroke="none"/><circle cx="10.5" cy="7.5" r="1.3" fill="currentColor" stroke="none"/><circle cx="15.2" cy="8" r="1.3" fill="currentColor" stroke="none"/></svg>',
  access: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="4.6" r="1.9" fill="currentColor" stroke="none"/><path d="m5 8.6 7 1.4 7-1.4M12 10v5m0 0-3.2 6m3.2-6 3.2 6"/></svg>',
  shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M12 3 20 6v6c0 4.8-3.4 8-8 9-4.6-1-8-4.2-8-9V6z"/><path d="m9 12 2.2 2.2L15.5 10" stroke-linecap="round"/></svg>',
  bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 16v-5a6 6 0 0 1 12 0v5l1.6 2H4.4z"/><path d="M10 21a2.2 2.2 0 0 0 4 0"/></svg>',
  doc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M10 13h6M10 17h6"/></svg>',
  book: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3 5.6C3 4.7 3.7 4 4.6 4H10c.9 0 1.7.4 2 1.1V20c-.5-.6-1.2-1-2-1H4.6c-.9 0-1.6-.7-1.6-1.6zM21 5.6c0-.9-.7-1.6-1.6-1.6H14c-.9 0-1.7.4-2 1.1V20c.5-.6 1.2-1 2-1h5.4c.9 0 1.6-.7 1.6-1.6z"/></svg>',
  heart: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 20.5S3.5 15.5 3.5 9.4A4.6 4.6 0 0 1 12 6.8a4.6 4.6 0 0 1 8.5 2.6c0 6.1-8.5 11.1-8.5 11.1z"/></svg>',
  flag: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M5 3.5a1 1 0 0 1 2 0V21a1 1 0 0 1-2 0z"/><path d="M7 4h11.5l-2.5 4.5L18.5 13H7z"/></svg>',
  list: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M9 6.5h11M9 12h11M9 17.5h11"/><circle cx="4.5" cy="6.5" r="1.3" fill="currentColor" stroke="none"/><circle cx="4.5" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="4.5" cy="17.5" r="1.3" fill="currentColor" stroke="none"/></svg>',
  play: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8.5 5.6v12.8c0 .8.9 1.3 1.6.9l10-6.4c.6-.4.6-1.3 0-1.7l-10-6.4c-.7-.5-1.6 0-1.6.8z"/></svg>',
  signout: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 4h3.5A2.5 2.5 0 0 1 20 6.5v11a2.5 2.5 0 0 1-2.5 2.5H14"/><path d="M10 8 6 12l4 4M6 12h10"/></svg>',
  chart: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="4" y="12" width="3.6" height="8" rx="1.2"/><rect x="10.2" y="7.5" width="3.6" height="12.5" rx="1.2"/><rect x="16.4" y="4" width="3.6" height="16" rx="1.2"/></svg>',
  compass: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="m15.8 8.2-2.4 5.2-5.2 2.4 2.4-5.2z" fill="currentColor"/></svg>',
  sparkle: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2.5c.5 4.6 2.9 7 9.5 9.5-6.6 2.5-9 4.9-9.5 9.5-.5-4.6-2.9-7-9.5-9.5 6.6-2.5 9-4.9 9.5-9.5z"/></svg>',
  target: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" aria-hidden="true"><circle cx="12" cy="12" r="8.2"/><circle cx="12" cy="12" r="3.4" fill="currentColor" stroke="none"/></svg>',
  seedling: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M11 21v-7.5h2V21z"/><path d="M12 13.2c.1-4.6 2.9-7.6 8.5-7.7-.1 5.2-3.2 7.8-8.5 7.7zM11.6 13.6C6.8 13.7 4 11.3 3.5 7c4.9-.1 7.7 2.2 8.1 6.6z"/></svg>',
  eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 12S6 5 12 5s9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7Z"/><circle cx="12" cy="12" r="3"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m5.5 12.5 4.2 4.2L18.5 8"/></svg>',
  sliders: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M4 6.5h9M18 6.5h2M4 12h3M12 12h8M4 17.5h11"/><circle cx="15.5" cy="6.5" r="2.3"/><circle cx="9.5" cy="12" r="2.3"/><circle cx="17.5" cy="17.5" r="2.3"/></svg>',
  trendDown: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 6l12 12M18 9v9H9"/></svg>',
};

/** A rounded-square icon tile (Settings rows, form fields, sections).
 *  `tone` picks a tint: accent (default), blue, purple, pink, orange. */
export function iconTile(glyph, tone = "accent") {
  return `<span class="ui-tile" data-tone="${tone}" aria-hidden="true">${GLYPHS[glyph] || glyph}</span>`;
}

/** A round glass icon button. `attrs` is raw attribute text. */
export function glassButton(glyph, label, attrs = "") {
  return `<button type="button" class="g-btn" aria-label="${escapeHtml(label)}" ${attrs}>${GLYPHS[glyph] || glyph}</button>`;
}

/** Glass button · centred title (+ subtitle) · glass button. */
export function pageHeader({ title, subtitle = "", left = "", right = "", tag = "h1" }) {
  return `<header class="g-header">
    <div class="g-header-side">${left}</div>
    <div class="g-header-title"><${tag}>${escapeHtml(title)}</${tag}>${subtitle ? `<p>${subtitle}</p>` : ""}</div>
    <div class="g-header-side">${right}</div>
  </header>`;
}

/** "97.5%" as monospaced digits with a smaller percent sign. */
export function pct(v, cls = "") {
  if (v == null || isNaN(v)) return `<span class="g-pct g-none ${cls}">No Mark</span>`;
  // Hide grades: the number never reaches the page (a blur can be read).
  if (marksHidden()) return `<span class="g-pct g-masked ${cls}" aria-label="Hidden">••<small>%</small></span>`;
  return `<span class="g-pct ${cls}">${(Math.round(v * 10) / 10).toFixed(1)}<small>%</small></span>`;
}

/**
 * Semicircle gauge with a gradient stroke from the accent's dark shade to its
 * light one. Carries the `gauge-arc` hooks that motion.animateGauge() reads to
 * draw the arc in.
 */
export function arcGauge(percent, { id = "g" } = {}) {
  const cx = 100, cy = 100, r = 80, sw = 15;
  // Hidden grades draw an empty track: the arc length would give the mark away.
  const value = percent == null || marksHidden() ? null : Math.max(0, Math.min(100, percent));
  const len = Math.PI * r;
  const fill = ((value ?? 0) / 100) * len;
  const arc = `M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`;
  return `<svg class="g-gauge" viewBox="0 0 200 112" role="img" data-value="${value ?? ""}" aria-label="${value == null ? (marksHidden() && percent != null ? "Mark hidden" : "No mark") : `${value.toFixed(1)} percent`}">
    <defs><linearGradient id="${id}-grad" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="var(--gauge-from)"/><stop offset="1" stop-color="var(--gauge-to)"/>
    </linearGradient></defs>
    <path d="${arc}" fill="none" class="g-gauge-track" stroke-width="${sw}" stroke-linecap="round"/>
    ${value ? `<path class="gauge-arc" d="${arc}" fill="none" stroke="url(#${id}-grad)" stroke-width="${sw}" stroke-linecap="round" stroke-dasharray="${fill} ${len + 4}" data-len="${len}" data-fill="${fill}"/>` : ""}
  </svg>`;
}

/**
 * Turn `track` (a row of .g-page panels) into a swipeable pager and add dots.
 * Dots are real buttons, so keyboard and screen-reader users can switch too.
 */
export function pager(track, labels, onChange) {
  const dots = document.createElement("div");
  dots.className = "g-dots";
  dots.setAttribute("role", "group");
  dots.setAttribute("aria-label", "Choose a view");
  labels.forEach((label, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.setAttribute("aria-label", label);
    b.setAttribute("aria-pressed", String(i === 0));
    b.addEventListener("click", () =>
      track.scrollTo({ left: i * track.clientWidth, behavior: motionEnabled() ? "smooth" : "instant" }),
    );
    dots.appendChild(b);
  });
  let current = 0;
  const sync = () => {
    const i = Math.round(track.scrollLeft / Math.max(1, track.clientWidth));
    if (i === current) return;
    current = i;
    [...dots.children].forEach((d, j) => d.setAttribute("aria-pressed", String(j === i)));
    onChange?.(i);
  };
  track.addEventListener("scroll", sync, { passive: true });
  return dots;
}

/**
 * Add a minimize button to `head` that hides `parts` (the card's body). The
 * choice is remembered per student under `key`, so a folded card stays folded.
 */
export function minimizable(head, parts, key, label) {
  const btn = el(`<button type="button" class="icon-btn minimize-btn">${GLYPHS.chevron}</button>`);
  const set = (open) => {
    parts.forEach((p) => (p.hidden = !open));
    btn.setAttribute("aria-expanded", String(open));
    btn.setAttribute("aria-label", `${open ? "Minimize" : "Expand"} ${label}`);
    head.closest(".card")?.classList.toggle("is-minimized", !open);
  };
  btn.onclick = () => {
    const open = btn.getAttribute("aria-expanded") !== "true";
    set(open);
    try { writeStudentData("minimized", { ...readStudentData("minimized", {}), [key]: !open }); } catch { /* storage full: still folds */ }
  };
  head.append(btn);
  set(!readStudentData("minimized", {})[key]);
  return btn;
}
