// ============================================================================
// GPA on the common 4.0 scale
// ----------------------------------------------------------------------------
// Each course mark is rounded to a whole percent (the way report cards show
// it), turned into a letter and points, and the points are averaged with every
// course counting equally. An estimate: universities each convert differently.
// ============================================================================

/** [lowest whole percent, letter, points], highest band first. */
export const GPA_SCALE = [
  [97, "A+", 4.0],
  [93, "A", 4.0],
  [90, "A-", 3.7],
  [87, "B+", 3.3],
  [83, "B", 3.0],
  [80, "B-", 2.7],
  [77, "C+", 2.3],
  [73, "C", 2.0],
  [70, "C-", 1.7],
  [67, "D+", 1.3],
  [65, "D", 1.0],
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
