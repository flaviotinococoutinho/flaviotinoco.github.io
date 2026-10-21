/** Static previews of the labs: deterministic shapes with valid path data and known roles. */
import { describe, expect, it } from 'vitest';
import { thumbnail } from '../../../src/core/labs/thumbnails.ts';
import { WIDGETS } from '../../../src/core/labs/widgets.ts';

const PATH = /^(?:[MLHV]-?\d+(?:\.\d+)?(?: -?\d+(?:\.\d+)?)?|Z)+$/;
const ROLES = ['axis', 'reference', 'curve', 'accent', 'bars', 'points'];

describe('thumbnails', () => {
  for (const widget of WIDGETS) {
    it(`${widget}: a 160 × 90 drawing of valid, deterministic path data`, () => {
      const t = thumbnail(widget);
      expect(t.width).toBe(160);
      expect(t.height).toBe(90);
      expect(t.shapes.length).toBeGreaterThanOrEqual(2);
      for (const s of t.shapes) {
        expect(ROLES).toContain(s.role);
        expect(s.d).toMatch(PATH);
        for (const n of s.d.match(/-?\d+(?:\.\d+)?/g) ?? []) {
          expect(Number(n)).toBeGreaterThanOrEqual(-1);
          expect(Number(n)).toBeLessThanOrEqual(161);
        }
      }
      expect(thumbnail(widget)).toEqual(t);
    });
  }

  it('draws the roles each preview needs', () => {
    expect(thumbnail('fourier').shapes.map((s) => s.role)).toEqual(['axis', 'reference', 'curve']);
    expect(thumbnail('sampling').shapes.map((s) => s.role)).toEqual(['axis', 'reference', 'curve', 'points']);
    expect(thumbnail('entropy').shapes.map((s) => s.role)).toEqual(['axis', 'bars']);
    expect(thumbnail('clt').shapes.map((s) => s.role)).toEqual(['axis', 'bars', 'curve']);
  });
});
