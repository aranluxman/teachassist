// ============================================================================
// GPA on the 4.33 scale, with Ontario's percentage bands
// ----------------------------------------------------------------------------
// Each course mark is rounded to a whole percent (the way report cards show
// it), turned into a letter and points, and the points are averaged with every
// course counting equally. An estimate: universities each convert differently.
// ============================================================================

/** The top of the scale (an A+). */
export const GPA_MAX = 4.33;

/** [lowest whole percent, letter, points], highest band first. */
export const GPA_SCALE = [
  [90, "A+", 4.33],
  [85, "A", 4.0],
  [80, "A-", 3.67],
  [77, "B+", 3.33],
  [73, "B", 3.0],
  [70, "B-", 2.67],
  [67, "C+", 2.33],
  [63, "C", 2.0],
  [60, "C-", 1.67],
  [57, "D+", 1.33],
  [53, "D", 1.0],
  [50, "D-", 0.67],
  [0, "F", 0.0],
];

/** One mark (%) → { letter, points }, or null when there is no mark. */
export function gpaFor(percent) {
  if (typeof percent !== "number" || !Number.isFinite(percent)) return null;
  const whole = Math.round(percent);
  const [, letter, points] = GPA_SCALE.find(([min]) => whole >= min);
  return { letter, points };
}

/**
 * Course marks (%) → { gpa, average, letter, count }, or null with no marks.
 * gpa is rounded to two decimals; average to one.
 */
export function computeGpa(marks) {
  const real = (marks || []).filter((m) => typeof m === "number" && Number.isFinite(m));
  if (!real.length) return null;
  const points = real.reduce((a, m) => a + gpaFor(m).points, 0) / real.length;
  const average = real.reduce((a, m) => a + m, 0) / real.length;
  return {
    gpa: Math.round(points * 100) / 100,
    average: Math.round(average * 10) / 10,
    letter: gpaFor(average).letter,
    count: real.length,
  };
}
