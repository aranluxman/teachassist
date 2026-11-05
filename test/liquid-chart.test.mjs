import { test } from 'node:test';
import assert from 'node:assert/strict';
globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {}, length: 0, key: () => null };
const { smoothPath, trendChart } = await import('../frontend/js/courses.js');

// Every cubic's control points must stay between its two end points' heights,
// or the curve could draw a mark above 100% (or below the real low).
test('the smooth curve never overshoots the marks', () => {
  const pts = [[0, 10], [50, 10], [100, 40], [150, 60], [200, 55], [250, 58]];
  const d = smoothPath(pts);
  const segs = [...d.matchAll(/C([\d.-]+),([\d.-]+) ([\d.-]+),([\d.-]+) ([\d.-]+),([\d.-]+)/g)];
  assert.equal(segs.length, pts.length - 1);
  segs.forEach((m, i) => {
    const [ya, yb] = [pts[i][1], pts[i + 1][1]];
    const lo = Math.min(ya, yb) - 0.05, hi = Math.max(ya, yb) + 0.05;
    for (const y of [Number(m[2]), Number(m[4])]) assert.ok(y >= lo && y <= hi, `segment ${i} control y ${y} outside ${lo}..${hi}`);
  });
});

test('the chart has the glass fill, glow, line and one dot per change', () => {
  const svg = trendChart([
    { date: 0, value: 100 }, { date: 1, value: 100 }, { date: 2, value: 97 }, { date: 3, value: 94.4 }, { date: 4, value: 95 },
  ]);
  for (const cls of ['g-area', 'g-line-glow', 'g-line', 'g-halo', 'g-cursor']) assert.match(svg, new RegExp(`class="${cls}"`));
  assert.equal((svg.match(/class="g-dot"/g) || []).length, 4); // the flat 100 → 100 step adds no dot
  // Each chart gets its own gradient ids, so two charts on a page don't clash.
  const a = trendChart([{ date: 0, value: 90 }, { date: 1, value: 91 }]).match(/id="(gc\d+)-fill"/)[1];
  const b = trendChart([{ date: 0, value: 90 }, { date: 1, value: 91 }]).match(/id="(gc\d+)-fill"/)[1];
  assert.notEqual(a, b);
});
