/**
 * Pure interaction logic of the islands: view-box algebra (pan/zoom) and the
 * WAI-ARIA APG tree-view keyboard model.
 */
import { describe, expect, it } from 'vitest';
import { fc, test } from '@fast-check/vitest';
import {
  MAX_SCALE,
  MIN_SCALE,
  clampToBase,
  clientToUser,
  ensureVisible,
  panBy,
  parseTranslate,
  parseViewBox,
  pixelsToUser,
  scaleOf,
  viewBoxString,
  zoomAt,
  zoomCentre,
  type ViewBox,
} from '../../../src/core/ontology/viewport.ts';
import {
  ancestorsOf,
  isParent,
  parentOf,
  siblingsOf,
  treeKey,
  typeahead,
  visibleItems,
  type TreeItem,
} from '../../../src/core/ontology/treenav.ts';

const BASE: ViewBox = { x: 0, y: 0, width: 1440, height: 900 };
const close = (a: number, b: number, eps = 1e-6): boolean =>
  Math.abs(a - b) <= eps * Math.max(1, Math.abs(a), Math.abs(b));

const pointIn = (v: ViewBox) =>
  fc.record({
    x: fc.double({ min: v.x, max: v.x + v.width, noNaN: true }),
    y: fc.double({ min: v.y, max: v.y + v.height, noNaN: true }),
  });

describe('viewport', () => {
  test.prop([fc.double({ min: 1.01, max: 2.4, noNaN: true }), pointIn(BASE)])(
    'zooming in and out about the same anchor returns the base view',
    (factor, anchor) => {
      const zoomed = zoomAt(BASE, BASE, factor, anchor);
      const back = zoomAt(BASE, zoomed, 1 / factor, anchor);
      expect(close(back.width, BASE.width)).toBe(true);
      expect(close(back.x, BASE.x, 1e-6)).toBe(true);
      expect(close(back.y, BASE.y, 1e-6)).toBe(true);
    },
  );

  test.prop([fc.double({ min: 1.01, max: 3, noNaN: true }), pointIn(BASE)])(
    'the anchor stays fixed on screen',
    (factor, anchor) => {
      const v = zoomAt(BASE, BASE, factor, anchor);
      // Relative position of the anchor inside the view is invariant (unless the centre clamp moved the view).
      const centreX = v.x + v.width / 2;
      const clamped = centreX <= BASE.x || centreX >= BASE.x + BASE.width;
      if (!clamped) expect(close((anchor.x - v.x) / v.width, anchor.x / BASE.width)).toBe(true);
    },
  );

  test.prop([fc.array(fc.double({ min: 0.1, max: 10, noNaN: true }), { maxLength: 12 })])(
    'the scale stays within its limits',
    (factors) => {
      const v = factors.reduce((view, f) => zoomCentre(BASE, view, f), BASE);
      expect(scaleOf(BASE, v)).toBeGreaterThanOrEqual(MIN_SCALE - 1e-9);
      expect(scaleOf(BASE, v)).toBeLessThanOrEqual(MAX_SCALE + 1e-9);
    },
  );

  test.prop([fc.double({ min: -1e5, max: 1e5, noNaN: true }), fc.double({ min: -1e5, max: 1e5, noNaN: true })])(
    'panning never moves the centre outside the drawing',
    (dx, dy) => {
      const v = panBy(BASE, zoomCentre(BASE, BASE, 2), dx, dy);
      const cx = v.x + v.width / 2;
      const cy = v.y + v.height / 2;
      expect(cx).toBeGreaterThanOrEqual(BASE.x - 1e-9);
      expect(cx).toBeLessThanOrEqual(BASE.x + BASE.width + 1e-9);
      expect(cy).toBeGreaterThanOrEqual(BASE.y - 1e-9);
      expect(cy).toBeLessThanOrEqual(BASE.y + BASE.height + 1e-9);
      expect(clampToBase(BASE, v)).toEqual(v);
    },
  );

  it('ignores degenerate zoom factors', () => {
    expect(zoomCentre(BASE, BASE, 0)).toBe(BASE);
    expect(zoomCentre(BASE, BASE, Number.NaN)).toBe(BASE);
    expect(zoomCentre(BASE, BASE, Infinity)).toBe(BASE);
  });

  it('maps client points through a letterboxed SVG (xMidYMid meet)', () => {
    // 1440×900 drawn in a 720×900 box: scale 0.5, 225 px bands above and below.
    const rect = { left: 10, top: 20, width: 720, height: 900 };
    expect(clientToUser(BASE, rect, { x: 10, y: 245 })).toEqual({ x: 0, y: 0 });
    expect(clientToUser(BASE, rect, { x: 730, y: 695 })).toEqual({ x: 1440, y: 900 });
    expect(pixelsToUser(BASE, rect, 10)).toBe(20);
    expect(clientToUser(BASE, { left: 0, top: 0, width: 0, height: 0 }, { x: 5, y: 5 })).toEqual({ x: 720, y: 450 });
  });

  it('pans just enough to reveal a point', () => {
    const v = zoomCentre(BASE, BASE, 4); // 360 × 225 around the centre
    expect(ensureVisible(BASE, v, { x: 720, y: 450 }, 20)).toBe(v);
    const moved = ensureVisible(BASE, v, { x: 1000, y: 450 }, 20);
    expect(moved.x + moved.width - 20).toBeCloseTo(1000);
    expect(moved.width).toBe(v.width);
  });

  test.prop([
    fc.record({
      x: fc.integer({ min: -500, max: 500 }),
      y: fc.integer({ min: -500, max: 500 }),
      width: fc.integer({ min: 1, max: 5000 }),
      height: fc.integer({ min: 1, max: 5000 }),
    }),
  ])('viewBox codec: parse ∘ format = id on integer boxes', (v) => {
    expect(parseViewBox(viewBoxString(v))).toEqual(v);
  });

  it('rejects malformed view boxes and transforms', () => {
    expect(parseViewBox('0 0 10')).toBeNull();
    expect(parseViewBox('0 0 -1 5')).toBeNull();
    expect(parseViewBox(null)).toBeNull();
    expect(parseViewBox('0,0,10,20')).toEqual({ x: 0, y: 0, width: 10, height: 20 });
    expect(parseTranslate('translate(12.5 -3)')).toEqual({ x: 12.5, y: -3 });
    expect(parseTranslate('translate(1, 2)')).toEqual({ x: 1, y: 2 });
    expect(parseTranslate('scale(2)')).toBeNull();
    expect(parseTranslate(undefined)).toBeNull();
  });
});

/*
 * The example tree (pre-order):
 *   0 A            level 1, expanded
 *   1   A.1        level 2, collapsed
 *   2     A.1.a    level 3
 *   3   A.2        level 2 (leaf)
 *   4 B            level 1, collapsed
 *   5   B.1        level 2
 */
const item = (level: number, label: string, expanded = false): TreeItem => ({ level, label, expanded });
const TREE: readonly TreeItem[] = [
  item(1, 'a', true),
  item(2, 'a1'),
  item(3, 'a1a'),
  item(2, 'a2'),
  item(1, 'b'),
  item(2, 'b1'),
];

describe('tree navigation (WAI-ARIA APG)', () => {
  it('derives structure from levels', () => {
    expect([0, 1, 2, 3, 4, 5].map((i) => isParent(TREE, i))).toEqual([true, true, false, false, true, false]);
    expect([0, 1, 2, 3, 4, 5].map((i) => parentOf(TREE, i))).toEqual([null, 0, 1, 0, null, 4]);
    expect(ancestorsOf(TREE, 2)).toEqual([0, 1]);
    expect(siblingsOf(TREE, 1)).toEqual([1, 3]);
    expect(siblingsOf(TREE, 4)).toEqual([0, 4]);
    expect(visibleItems(TREE)).toEqual([0, 1, 3, 4]);
  });

  it.each([
    [0, 'ArrowDown', { kind: 'focus', index: 1 }],
    [1, 'ArrowDown', { kind: 'focus', index: 3 }], // skips the hidden child of a closed parent
    [4, 'ArrowDown', { kind: 'none' }],
    [3, 'ArrowUp', { kind: 'focus', index: 1 }],
    [0, 'ArrowUp', { kind: 'none' }],
    [1, 'ArrowRight', { kind: 'expand', index: 1 }],
    [0, 'ArrowRight', { kind: 'focus', index: 1 }],
    [3, 'ArrowRight', { kind: 'none' }],
    [0, 'ArrowLeft', { kind: 'collapse', index: 0 }],
    [3, 'ArrowLeft', { kind: 'focus', index: 0 }],
    [4, 'ArrowLeft', { kind: 'none' }],
    [3, 'Home', { kind: 'focus', index: 0 }],
    [0, 'End', { kind: 'focus', index: 4 }],
    [0, '*', { kind: 'expand-all', indices: [4] }],
    [3, '*', { kind: 'expand-all', indices: [1] }],
  ] as const)('item %i, key %s', (current, key, action) => {
    expect(treeKey(TREE, current, key)).toEqual(action);
  });

  it('type-ahead cycles through visible matches and wraps', () => {
    expect(typeahead(TREE, 0, 'a')).toBe(1);
    expect(typeahead(TREE, 1, 'a')).toBe(3);
    expect(typeahead(TREE, 3, 'a')).toBe(0);
    expect(typeahead(TREE, 0, 'b')).toBe(4);
    expect(typeahead(TREE, 1, 'a1')).toBe(1);
    expect(typeahead(TREE, 0, 'z')).toBeNull();
    expect(typeahead(TREE, 0, '')).toBeNull();
  });

  // Random trees: pre-order lists where each level is at most one deeper than the previous item.
  const treeArb = fc
    .array(fc.tuple(fc.integer({ min: 0, max: 3 }), fc.boolean()), { minLength: 1, maxLength: 30 })
    .map((steps) => {
      const out: TreeItem[] = [];
      let level = 1;
      steps.forEach(([up, expanded], i) => {
        level = i === 0 ? 1 : Math.max(1, Math.min(level + 1, level + 1 - up));
        out.push({ level, expanded, label: `n${String(i)}` });
      });
      return out;
    });

  test.prop([treeArb])('↓ then ↑ returns to the same visible item; focus never lands on a hidden item', (items) => {
    const visible = visibleItems(items);
    for (const i of visible) {
      const down = treeKey(items, i, 'ArrowDown');
      if (down.kind === 'focus') {
        expect(visible).toContain(down.index);
        expect(treeKey(items, down.index, 'ArrowUp')).toEqual({ kind: 'focus', index: i });
      }
      const left = treeKey(items, i, 'ArrowLeft');
      if (left.kind === 'focus') expect(left.index).toBe(parentOf(items, i));
    }
  });

  test.prop([treeArb])('every visible item has all its ancestors expanded', (items) => {
    for (const i of visibleItems(items)) for (const a of ancestorsOf(items, i)) expect(items[a]?.expanded).toBe(true);
  });
});
