import { describe, expect, it } from 'vitest';
import { fc, test } from '@fast-check/vitest';
import {
  activeStep,
  bandPosition,
  clamp01,
  currentSection,
  crossingProgress,
  narrativeTime,
  panelAt,
  pinnedProgress,
  progressOfPanel,
  scrollOffsetForPanel,
  smoothstep,
} from '../../../src/core/reading/scroll.ts';
import { stackNotes } from '../../../src/core/reading/margin.ts';

const unit = fc.double({ min: 0, max: 1, noNaN: true });
const real = fc.double({ min: -1e6, max: 1e6, noNaN: true });

describe('smoothstep: the non-linear map from scroll distance to narrative time', () => {
  it('fixes the ends and the midpoint, and is clamped outside [0, 1]', () => {
    expect([smoothstep(0), smoothstep(0.5), smoothstep(1)]).toEqual([0, 0.5, 1]);
    expect([smoothstep(-3), smoothstep(7), smoothstep(Number.NaN)]).toEqual([0, 1, 0]);
  });
  test.prop([unit, unit])('is monotone (scrolling forward never moves the narrative back)', (a, b) => {
    const [lo, hi] = a <= b ? [a, b] : [b, a];
    expect(smoothstep(lo)).toBeLessThanOrEqual(smoothstep(hi));
  });
  test.prop([unit])('is symmetric: s(1 − x) = 1 − s(x)', (x) => {
    expect(smoothstep(1 - x)).toBeCloseTo(1 - smoothstep(x), 12);
  });
  test.prop([real])('stays in [0, 1]', (x) => {
    const s = smoothstep(x);
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThanOrEqual(1);
  });
  test.prop([fc.double({ min: 0.001, max: 0.2, noNaN: true })])(
    'lingers at the ends: slower than linear near 0 and 1',
    (x) => {
      expect(smoothstep(x)).toBeLessThan(x);
      expect(1 - smoothstep(1 - x)).toBeLessThan(x);
    },
  );
});

describe('progress of a step across the reading line', () => {
  it('is 0 before the step reaches the line and 1 after it has passed', () => {
    expect(crossingProgress(600, 200, 1000)).toBe(0);
    expect(crossingProgress(400, 200, 1000)).toBe(0.5);
    expect(crossingProgress(200, 200, 1000)).toBe(1);
    expect(crossingProgress(499, 0, 1000)).toBe(1);
    expect(narrativeTime(450, 200, 1000)).toBeCloseTo(smoothstep(0.25), 12);
  });
  test.prop([real, fc.double({ min: 1, max: 1e4, noNaN: true }), fc.double({ min: 1, max: 1e4, noNaN: true })])(
    'decreases as the step moves down the viewport',
    (top, height, vh) => {
      expect(crossingProgress(top + 10, height, vh)).toBeLessThanOrEqual(crossingProgress(top, height, vh));
    },
  );
});

describe('activeStep', () => {
  it('picks the latest step crossing the line, and keeps the previous one between steps', () => {
    expect(activeStep([2, 3], 1)).toBe(3);
    expect(activeStep([], 1)).toBe(1);
    expect(activeStep(new Set<number>(), null)).toBeNull();
    expect(activeStep(new Set([0]), 4)).toBe(0);
  });
});

describe('pinned progress (horizontal passage, reading progress)', () => {
  it('runs from 0 (top at the top) to 1 (bottom at the bottom)', () => {
    expect(pinnedProgress(0, 3000, 1000)).toBe(0);
    expect(pinnedProgress(-1000, 3000, 1000)).toBe(0.5);
    expect(pinnedProgress(-2000, 3000, 1000)).toBe(1);
    expect(pinnedProgress(50, 3000, 1000)).toBe(0);
    expect(pinnedProgress(-10, 500, 1000)).toBe(1);
    expect(pinnedProgress(10, 500, 1000)).toBe(0);
  });
  test.prop([
    fc.integer({ min: 2, max: 12 }),
    fc.nat(11),
    fc.integer({ min: 0, max: 5000 }),
    fc.integer({ min: 300, max: 1200 }),
  ])('scrolling to scrollOffsetForPanel(i) shows panel i (inverse of pinnedProgress)', (panels, k, boxTop, vh) => {
    const i = k % panels;
    const height = panels * vh;
    const y = scrollOffsetForPanel(i, panels, boxTop, height, vh);
    const progress = pinnedProgress(boxTop - y, height, vh);
    expect(progress).toBeCloseTo(progressOfPanel(i, panels), 9);
    expect(panelAt(progress, panels)).toBe(i);
  });
  it('handles single panels and clamps', () => {
    expect(progressOfPanel(0, 1)).toBe(0);
    expect(panelAt(0.7, 1)).toBe(0);
    expect(clamp01(2)).toBe(1);
  });
});

describe('stackNotes (sidenotes never overlap, and stay as close to their marks as possible)', () => {
  const boxes = fc.array(
    fc.record({ top: fc.integer({ min: 0, max: 5000 }), height: fc.integer({ min: 0, max: 300 }) }),
    {
      maxLength: 20,
    },
  );
  const gap = fc.integer({ min: 0, max: 40 });
  test.prop([boxes, gap])('never above the mark, never overlapping, tight', (notes, g) => {
    const tops = stackNotes(notes, g);
    expect(tops).toHaveLength(notes.length);
    notes.forEach((n, i) => {
      const t = tops[i] ?? 0;
      expect(t).toBeGreaterThanOrEqual(n.top);
      const prev = i > 0 ? (tops[i - 1] ?? 0) + (notes[i - 1]?.height ?? 0) + g : Number.NEGATIVE_INFINITY;
      expect(t).toBeGreaterThanOrEqual(prev);
      expect(t === n.top || t === prev).toBe(true);
    });
  });
  test.prop([boxes, gap])('is idempotent', (notes, g) => {
    const once = stackNotes(notes, g);
    const again = stackNotes(
      notes.map((n, i) => ({ ...n, top: once[i] ?? 0 })),
      g,
    );
    expect(again).toEqual(once);
  });
  it('pushes a crowded note down below the previous one', () => {
    expect(
      stackNotes(
        [
          { top: 0, height: 100 },
          { top: 50, height: 10 },
          { top: 500, height: 10 },
        ],
        8,
      ),
    ).toEqual([0, 108, 500]);
  });
});

describe('currentSection (scroll-spy over IntersectionObserver band positions)', () => {
  it('prefers the last heading inside the band, then the last one above it', () => {
    expect(
      currentSection(
        new Map([
          [0, 'above'],
          [1, 'in'],
          [2, 'in'],
          [3, 'below'],
        ]),
      ),
    ).toBe(2);
    expect(
      currentSection(
        new Map([
          [0, 'above'],
          [1, 'above'],
          [2, 'below'],
        ]),
      ),
    ).toBe(1);
    expect(currentSection(new Map([[0, 'below']]))).toBeNull();
    expect(currentSection(new Map())).toBeNull();
  });
  it('classifies boxes against the band', () => {
    expect(bandPosition(true, 500, 0)).toBe('in');
    expect(bandPosition(false, -40, 0)).toBe('above');
    expect(bandPosition(false, 700, 0)).toBe('below');
  });
});
