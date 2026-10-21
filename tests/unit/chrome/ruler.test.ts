/**
 * Reading ruler geometry: the band always lies inside the viewport, is at
 * least MIN_BAND tall, follows the pointer when there is room and covers a
 * focused element's box; line heights are decoded totally.
 */
import { describe, expect, it } from 'vitest';
import { fc, test } from '@fast-check/vitest';
import {
  MAX_LINE,
  MIN_BAND,
  bandAround,
  bandForRect,
  clampBand,
  lineHeightOf,
} from '../../../src/core/chrome/ruler.ts';

const px = fc.double({ min: -5000, max: 5000, noNaN: true });
const viewport = fc.double({ min: 0, max: 4000, noNaN: true });
const positive = fc.double({ min: 0, max: 400, noNaN: true });

describe('bands', () => {
  test.prop([px, positive, viewport])(
    'bandAround stays inside the viewport and is at least MIN_BAND tall',
    (y, lh, vh) => {
      const band = bandAround(y, lh, vh);
      expect(band.top).toBeGreaterThanOrEqual(0);
      expect(band.height).toBeGreaterThanOrEqual(Math.min(MIN_BAND, Math.max(vh, 1)));
      expect(band.top + band.height).toBeLessThanOrEqual(Math.max(vh, band.height));
    },
  );

  test.prop([fc.double({ min: 200, max: 800, noNaN: true }), fc.double({ min: 12, max: 40, noNaN: true })])(
    'bandAround centres two lines on the pointer when there is room',
    (y, lh) => {
      const band = bandAround(y, lh, 2000);
      expect(band.height).toBeCloseTo(Math.max(MIN_BAND, 2 * lh));
      expect(band.top + band.height / 2).toBeCloseTo(y);
    },
  );

  test.prop([px, positive, positive, viewport])('bandForRect covers the rect when it fits', (top, height, lh, vh) => {
    const band = bandForRect({ top, height }, lh, vh);
    expect(band.top).toBeGreaterThanOrEqual(0);
    expect(band.top + band.height).toBeLessThanOrEqual(Math.max(vh, band.height));
    if (top >= 0 && top + Math.max(height, lh, MIN_BAND) <= vh) {
      expect(band.top).toBe(top);
      expect(band.height).toBe(Math.max(height, lh, MIN_BAND));
    }
  });

  it('clamps a band that would leave the viewport, and shrinks one taller than it', () => {
    expect(clampBand(-10, 50, 600)).toEqual({ top: 0, height: 50 });
    expect(clampBand(590, 50, 600)).toEqual({ top: 550, height: 50 });
    expect(clampBand(100, 900, 600)).toEqual({ top: 0, height: 600 });
    expect(clampBand(Number.NaN, Number.NaN, Number.NaN)).toEqual({ top: 0, height: 1 });
  });
});

describe('lineHeightOf', () => {
  it('decodes px values, "normal" and anything else', () => {
    expect(lineHeightOf('27px', 16)).toBe(27);
    expect(lineHeightOf(' 24.5px ', 16)).toBe(24.5);
    expect(lineHeightOf('normal', 20)).toBeCloseTo(24);
    expect(lineHeightOf('1.5', 20)).toBe(30);
    expect(lineHeightOf('', Number.NaN)).toBe(24);
    expect(lineHeightOf('0px', 10)).toBe(15);
    expect(lineHeightOf('1e308px', 10)).toBe(MAX_LINE);
  });

  test.prop([fc.string(), fc.double({ noNaN: false })])('is total and positive', (value, size) => {
    const lh = lineHeightOf(value, size);
    expect(Number.isFinite(lh)).toBe(true);
    expect(lh).toBeGreaterThan(0);
    expect(lh).toBeLessThanOrEqual(MAX_LINE * 1.5);
  });
});
