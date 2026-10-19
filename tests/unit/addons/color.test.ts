/**
 * OKLCH → sRGB (Ottosson 2020), cross-checked against colorjs.io on every colour
 * token of the site, and the theme-color values derived from the paper tokens.
 */
import { readFileSync } from 'node:fs';
import Color from 'colorjs.io';
import { describe, expect, it } from 'vitest';
import { fc, test } from '@fast-check/vitest';
import { oklchToHex, oklchToSrgb8, themeColors, tokenHex } from '../../../src/core/addons/color.ts';
import { parseTokens, type ColorScheme, type Oklch, type Tokens } from '../../../src/core/design/tokens.ts';

const loadTokens = (): Tokens => {
  const raw = JSON.parse(
    readFileSync(new URL('../../../src/core/design/tokens.json', import.meta.url), 'utf8'),
  ) as Parameters<typeof parseTokens>[0];
  const parsed = parseTokens(raw);
  if (!parsed.ok) throw new Error(parsed.error.join('; '));
  return parsed.value;
};

const reference = (c: Oklch): readonly number[] =>
  new Color('oklch', [c[0], c[1], c[2]])
    .to('srgb')
    .coords.map((v) => Math.round(Math.min(1, Math.max(0, v ?? 0)) * 255));

describe('OKLCH → sRGB', () => {
  const tokens = loadTokens();
  const schemes: readonly ColorScheme[] = ['light', 'dark', 'light-more', 'dark-more'];

  it('agrees with colorjs.io within one 8-bit step on every colour token', () => {
    for (const scheme of schemes)
      for (const [name, color] of Object.entries(tokens.colors[scheme])) {
        const ours = oklchToSrgb8(color);
        const theirs = reference(color);
        ours.forEach((v, i) => expect(Math.abs(v - (theirs[i] ?? -99)), `${scheme}.${name}`).toBeLessThanOrEqual(1));
      }
  });

  test.prop([
    fc.double({ min: 0, max: 1, noNaN: true }),
    fc.double({ min: 0, max: 0.4, noNaN: true }),
    fc.double({ min: 0, max: 359.99, noNaN: true }),
  ])('is total and in range for any OKLCH value (clipped to the gamut)', (l, c, h) => {
    const rgb = oklchToSrgb8([l, c, h]);
    for (const v of rgb) {
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(255);
    }
    expect(oklchToHex([l, c, h])).toMatch(/^#[0-9a-f]{6}$/u);
  });

  it('maps the achromatic extremes to black and white', () => {
    expect(oklchToHex([0, 0, 0])).toBe('#000000');
    expect(oklchToHex([1, 0, 0])).toBe('#ffffff');
  });

  it('derives theme-color from the paper of each scheme', () => {
    const r = themeColors(tokens);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const hex = (c: Oklch | undefined): string =>
      `#${reference(c ?? [0, 0, 0])
        .map((v) => v.toString(16).padStart(2, '0'))
        .join('')}`;
    expect(r.value.light).toBe(hex(tokens.colors.light['paper']));
    expect(r.value.dark).toBe(hex(tokens.colors.dark['paper']));
  });

  it('names a missing token instead of guessing', () => {
    expect(tokenHex(tokens, 'light', 'no-such-token')).toEqual({
      ok: false,
      error: 'color.light.no-such-token is not a design token',
    });
    const broken: Tokens = { ...tokens, colors: { ...tokens.colors, dark: {} } };
    expect(themeColors(broken).ok).toBe(false);
  });
});
