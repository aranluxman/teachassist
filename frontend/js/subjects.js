// ============================================================================
// Subjects — an icon + gradient per course, and the timetable details
// (period, room, term dates) read from a course row.
// ----------------------------------------------------------------------------
// Ontario course codes start with a subject prefix (SNC = science, FIF/FSF =
// French, TDJ = tech design, CHC = history…). That prefix picks the icon.
// The colour comes from the theme: each course takes one of its four shades
// (--shade-1…4, set by js/theme.js) by its place in the course list, so the
// courses look different from each other and every screen matches the theme.
// ============================================================================

import { courseTerm } from "./term.js";
import { courseOverride } from "./class-times.js";
import { readStudentData, writeStudentData } from "./student-store.js";

const svg = (body) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

const ICONS = {
  atom: svg('<circle cx="12" cy="12" r="1.6" fill="currentColor"/><ellipse cx="12" cy="12" rx="9" ry="3.6"/><ellipse cx="12" cy="12" rx="9" ry="3.6" transform="rotate(60 12 12)"/><ellipse cx="12" cy="12" rx="9" ry="3.6" transform="rotate(120 12 12)"/>'),
  globe: svg('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>'),
  wrench: svg('<path d="M14.7 6.3a4 4 0 0 0 5 5L21 13l-2 2-1.3-1.3a4 4 0 0 1-5-5L4 17.4 6.6 20l8.7-8.7"/><path d="M14.7 6.3 17 4"/>'),
  fork: svg('<path d="M7 3v8a2 2 0 0 0 4 0V3M9 11v10M16 21V3c-2 1.5-3 4-3 7h3"/>'),
  clock: svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>'),
  sigma: svg('<path d="M18 5H6l6 7-6 7h12"/>'),
  book: svg('<path d="M3 5.5A1.5 1.5 0 0 1 4.5 4H10a2 2 0 0 1 2 2v14a2 2 0 0 0-2-2H3z"/><path d="M21 5.5A1.5 1.5 0 0 0 19.5 4H14a2 2 0 0 0-2 2v14a2 2 0 0 1 2-2h7z"/>'),
  map: svg('<path d="m3 6 6-2 6 2 6-2v14l-6 2-6-2-6 2z"/><path d="M9 4v14M15 6v14"/>'),
  run: svg('<circle cx="14" cy="4.5" r="1.8"/><path d="m6 21 3.5-6 3 2.5V22M8 11l3-3 3 2 3 1M12.5 8 10 14"/>'),
  palette: svg('<path d="M12 3a9 9 0 1 0 0 18c1.1 0 1.6-.9 1.2-1.8-.5-1 .2-2.2 1.3-2.2H17a4 4 0 0 0 4-4c0-5.5-4-10-9-10z"/><circle cx="7.5" cy="11" r="1.2" fill="currentColor"/><circle cx="10.5" cy="7" r="1.2" fill="currentColor"/><circle cx="15" cy="7.5" r="1.2" fill="currentColor"/>'),
  music: svg('<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>'),
  chip: svg('<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/>'),
  briefcase: svg('<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 13h18"/>'),
  compass: svg('<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5z"/>'),
  people: svg('<circle cx="9" cy="8" r="3"/><path d="M3.5 20a5.5 5.5 0 0 1 11 0M16 4.5a3 3 0 0 1 0 6M20.5 20a5.5 5.5 0 0 0-4-5.3"/>'),
  study: svg('<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z"/>'),
};

// [code prefix pattern, icon]
const SUBJECTS = [
  [/^LUNCH/, "fork"],
  [/^S(NC|BI|CH|PH|ES|VN)/, "atom"],
  [/^F(IF|SF|EF|RE)/, "globe"],
  [/^L(K|W|V|D|B|N|Y)/, "globe"],
  [/^T(DJ|EJ|GJ|IJ|MJ|TJ|CJ|HJ|FJ|D|E|G|I|M|T|C|H|F)/, "wrench"],
  [/^C(HC|HV|HW|HA|HT|LU|IE)/, "clock"],
  [/^CG/, "map"],
  [/^M(TH|PM|FM|CR|CF|HF|DM|CV|BF|EL)/, "sigma"],
  [/^(ENG|ENL|EN|ESL|NBE|OLC)/, "book"],
  [/^P(PL|AF|SE|AI|SK|PZ|AD)/, "run"],
  [/^A(VI|WQ|MU|MI|DA|TC|EA|WS|SM|V|D|T|W)/, "palette"],
  [/^AM/, "music"],
  [/^I(CS|CD|CT|DC)/, "chip"],
  [/^B(AF|BI|BT|TT|MI|OH|AT|DI)/, "briefcase"],
  [/^G(LC|LE|LS|PP|WL)/, "compass"],
  [/^H(HS|RE|SP|PC|ZT|SB|FN|PW|IF)/, "people"],
];
const FALLBACK_ICON = "study";

// ── Colour: the course's theme shade ─────────────────────────────────────
const codeKey = (code) => String(code || "").trim().toUpperCase();
let courseOrder = null;

/** Remember the course list's order, which decides each course's shade. */
export function rememberCourseOrder(codes) {
  const next = codes.map(codeKey).filter(Boolean);
  if (JSON.stringify(next) === JSON.stringify(courseOrder)) return;
  courseOrder = next;
  writeStudentData("course-order", next);
}

/** 1–4: the course's place in the list, or (for anything not in it, like
 *  Lunch) a fixed pick from its code. */
export function shadeIndex(code) {
  courseOrder ??= readStudentData("course-order", []);
  const key = codeKey(code);
  const at = courseOrder.indexOf(key);
  if (at >= 0) return (at % 4) + 1;
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return (h % 4) + 1;
}

/** CSS colours for theme shade `n` (1–4; 0 is the accent itself): a lighter
 *  start, the shade, its tint. */
export function shadeColors(n) {
  const shade = n ? `var(--shade-${n})` : "var(--accent)";
  return { from: `color-mix(in srgb, ${shade} 72%, #fff)`, to: shade, tint: shade };
}

/** { icon, from, to, tint } for a course code like "SNC2D1-8". */
export function subjectStyle(code) {
  const c = codeKey(code);
  const icon = SUBJECTS.find(([re]) => re.test(c))?.[1] || FALLBACK_ICON;
  return { icon: ICONS[icon], ...shadeColors(shadeIndex(c)) };
}

/** The round gradient icon used on cards, sheets and the course header. */
export function subjectBadge(code, size = "") {
  const s = subjectStyle(code);
  return `<span class="g-badge ${size}" style="--b-from:${s.from};--b-to:${s.to}">${s.icon}</span>`;
}

/** A round badge with letters instead of an icon (K/U, T, C, A) in shade `n`. */
export function letterBadge(text, n) {
  const { from, to } = shadeColors(n);
  return `<span class="g-badge g-letter" style="--b-from:${from};--b-to:${to}">${text}</span>`;
}

/** Period / room / term dates, from the scraped row or the demo fields. */
export function scheduleOf(course) {
  const text = [course?.name, course?.block, course?.room, course?.code].filter(Boolean).join(" ");
  const block = /block\s*:\s*(P?\s*\d+)/i.exec(text)?.[1] || /period\s*(\d+)/i.exec(course?.block || "")?.[1] || "";
  const period = block ? `P${block.replace(/\D/g, "")}` : "";
  const room =
    /\brm\.?\s*([A-Za-z0-9-]+(?:\s+[A-Za-z]+)?)/i.exec(String(course?.name || ""))?.[1]?.replace(/\s+\d{4}.*$/, "") ||
    String(course?.room || "").replace(/^(rm\.?|room)\s*/i, "") ||
    "";
  const term = courseTerm(course);
  // A room fixed in Manage Courses wins over the scraped one.
  const edited = courseOverride(fullCode(course)).room;
  return { period, room: edited || room.replace(/\s+\d{4}-.*$/, "").trim(), term };
}

/** "Sep 7, 2026" from a UTC timestamp. */
export function fmtDay(ts) {
  return new Date(ts).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

/** The full code TeachAssist shows, section included ("SNC2D1-8"). */
export function fullCode(course) {
  const raw = String(course?.code || "").trim();
  return (raw || String(course?.name || "").trim().split(/[\s:]+/)[0] || "").toUpperCase();
}
