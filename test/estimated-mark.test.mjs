import { test } from 'node:test';
import assert from 'node:assert/strict';
globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {}, length: 0, key: () => null };
const { displayMark, markKind, estimatedMark } = await import('../frontend/js/ta-client.js');

// French from the bug report: "Please see teacher" on TeachAssist, but marked
// work is listed. Each category is averaged, then the categories.
const french = {
  code: 'FIF2DF', currentMark: null, midterm: null,
  evaluations: [
    { name: 'écoute', percent: 63.6, weight: 1, strands: [{ category: 'Knowledge/Understanding', percent: 63.6, weight: 1 }] },
    { name: 'Lecture', percent: 100, weight: 1, strands: [{ category: 'Knowledge/Understanding', percent: 100, weight: 1 }] },
    { name: 'grammaire', percent: 43.9, weight: 1, strands: [{ category: 'Application', percent: 43.9, weight: 1 }] },
    { name: 'écriture', percent: 68, weight: 1, strands: [{ category: 'Communication', percent: 68, weight: 1 }] },
  ],
};

test('a hidden mark is estimated from the marked work', () => {
  // K = (63.6 + 100) / 2 = 81.8; A = 43.9; C = 68 → (81.8 + 43.9 + 68) / 3
  assert.equal(estimatedMark(french), 64.6);
  assert.equal(displayMark(french), 64.6);
  assert.equal(markKind(french), 'estimate');
});

test('a real TeachAssist mark always wins over the estimate', () => {
  assert.equal(displayMark({ ...french, currentMark: 81 }), 81);
  assert.equal(markKind({ ...french, currentMark: 81 }), 'current');
});

test('no marked work means no estimate', () => {
  assert.equal(estimatedMark({ evaluations: [] }), null);
  assert.equal(markKind({ currentMark: null, evaluations: [] }), '');
});

test('formative (weight 0) work only counts when nothing else is weighted', () => {
  const c = { evaluations: [
    { percent: 90, weight: 2, category: 'C2' },
    { percent: 40, weight: 0, category: 'C2' },
  ] };
  assert.equal(estimatedMark(c), 90);
});
