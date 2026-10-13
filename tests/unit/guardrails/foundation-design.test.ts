/**
 * Laws of the design system (src/core/design) and of the shared TeX notation
 * (src/core/latex/macros.ts). Like foundation-algebra/-domain, these back the
 * coverage gate of the functional core for foundation modules that shipped
 * without tests; they belong in tests/unit/core/ once the owners adopt them.
 */
import { readFileSync } from 'node:fs';
import katex from 'katex';
import { describe, expect, it } from 'vitest';
import { fc, test } from '@fast-check/vitest';
import {
  CVD_TYPES,
  MACHADO_2009,
  feColorMatrixValues,
  simulateLinear,
  type Vec3,
} from '../../../src/core/design/cvd.ts';
import { PHI, fluidStep, phiSpace, stepName, type FluidScaleSpec } from '../../../src/core/design/scale.ts';
import { compileCss, parseTokens } from '../../../src/core/design/tokens.ts';
import { KATEX_OPTIONS, MACROS } from '../../../src/core/latex/macros.ts';

const read = (path: string): string => readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8');
type TokenDocument = Parameters<typeof parseTokens>[0];
// JSON.parse only ever yields JSON values, so the cast states a fact the type system cannot see.
const tokenDocument = (): TokenDocument => JSON.parse(read('src/core/design/tokens.json')) as TokenDocument;

const unit = fc.double({ min: 0, max: 1, noNaN: true });
const rgb: fc.Arbitrary<Vec3> = fc.tuple(unit, unit, unit);

describe('colour-vision-deficiency simulation (Machado, Oliveira & Fernandes, 2009)', () => {
  it('uses matrices whose rows sum to 1, so achromatic colours are invariant', () => {
    for (const matrix of Object.values(MACHADO_2009)) {
      for (const row of matrix) expect(row[0] + row[1] + row[2]).toBeCloseTo(1, 5);
    }
  });

  test.prop([unit, fc.constantFrom(...CVD_TYPES)])('maps every grey to itself', (y, type) => {
    const [r, g, b] = simulateLinear([y, y, y], type);
    expect(r).toBeCloseTo(y, 4);
    expect(g).toBeCloseTo(y, 4);
    expect(b).toBeCloseTo(y, 4);
  });

  test.prop([rgb, fc.constantFrom(...CVD_TYPES)])('stays inside the linear-sRGB unit cube', (c, type) => {
    for (const x of simulateLinear(c, type)) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(1);
    }
  });

  test.prop([rgb])('achromatopsia keeps only relative luminance (ITU-R BT.709)', (c) => {
    const [r, g, b] = simulateLinear(c, 'achromatopsia');
    expect(r).toBeCloseTo(0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2], 10);
    expect(g).toBe(r);
    expect(b).toBe(r);
  });

  test.prop([fc.constantFrom(...CVD_TYPES)])('emits a 4×5 feColorMatrix that preserves alpha', (type) => {
    const values = feColorMatrixValues(type).split(' ').map(Number);
    expect(values).toHaveLength(20);
    expect(values.every(Number.isFinite)).toBe(true);
    expect(values.slice(15)).toEqual([0, 0, 0, 1, 0]);
  });
});

describe('proportional scales (Utopia fluid type, powers of φ)', () => {
  const spec: FluidScaleSpec = {
    baseMinPx: 17,
    baseMaxPx: 20,
    ratioMin: 1.2,
    ratioMax: Math.sqrt(PHI),
    viewportMinPx: 320,
    viewportMaxPx: 1240,
  };
  const parse = (css: string): readonly number[] => {
    const m = /^clamp\((-?[\d.]+)rem, (-?[\d.]+)rem \+ (-?[\d.]+)vw, (-?[\d.]+)rem\)$/.exec(css);
    expect(m).not.toBeNull();
    return (m ?? []).slice(1).map(Number);
  };

  test.prop([fc.integer({ min: -3, max: 6 })])('interpolates exactly between the two viewport endpoints', (n) => {
    const [lo = 0, intercept = 0, slope = 0, hi = 0] = parse(fluidStep(spec, n));
    const at = (px: number): number => intercept + (slope / 100) * (px / 16);
    const minRem = (spec.baseMinPx * spec.ratioMin ** n) / 16;
    const maxRem = (spec.baseMaxPx * spec.ratioMax ** n) / 16;
    expect(lo).toBeLessThanOrEqual(hi);
    expect(at(spec.viewportMinPx)).toBeCloseTo(minRem, 2);
    expect(at(spec.viewportMaxPx)).toBeCloseTo(maxRem, 2);
  });

  it('makes every even step at the large viewport a power of φ (ratio √φ)', () => {
    const [, , , hi = 0] = parse(fluidStep(spec, 4));
    expect(hi).toBeCloseTo((spec.baseMaxPx * PHI ** 2) / 16, 3);
  });

  test.prop([fc.integer({ min: -4, max: 6 })])('spaces are powers of φ with explicit signed names', (n) => {
    expect(Number(phiSpace(n).replace('rem', ''))).toBeCloseTo(PHI ** n, 3);
    expect(stepName(n)).toBe(n < 0 ? `n${-n}` : String(n));
  });
});

describe('design tokens (DTCG 2025.10 subset → CSS)', () => {
  it('compiles the committed tokens.json to exactly the committed tokens.css (generated file is current)', () => {
    const parsed = parseTokens(tokenDocument());
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(compileCss(parsed.value)).toBe(read('src/styles/tokens.css'));
  });

  it('emits every token family the stylesheets are allowed to use', () => {
    const parsed = parseTokens(tokenDocument());
    const css = parsed.ok ? compileCss(parsed.value) : '';
    for (const family of ['--paper', '--ink', '--rule', '--link', '--focus', '--mark', '--stratum-', '--step-0']) {
      expect(css).toContain(`${family}`);
    }
    for (const family of ['--space-0', '--duration-', '--ease-', '--leading-body', '--measure']) {
      expect(css).toContain(family);
    }
  });

  it('accumulates every problem instead of stopping at the first', () => {
    const broken = {
      color: {
        light: { ink: { $value: { colorSpace: 'srgb', components: [0, 0, 0] } } },
        dark: { ink: { $value: { colorSpace: 'oklch', components: [2, 0, 0] } } },
        'light-more': {},
        'dark-more': 'nope',
      },
      duration: { 1: { $value: { value: 89, unit: 's' } } },
      easing: { standard: { $value: [0, 0, 1] } },
    };
    const parsed = parseTokens(broken);
    expect(parsed.ok).toBe(false);
    const errors = parsed.ok ? [] : parsed.error;
    for (const fragment of [
      'color.light.ink: expected {colorSpace:"oklch"}',
      'color.dark.ink: component out of range',
      'color.dark-more: expected an object',
      'duration.1: expected {value, unit:"ms"}',
      'easing.standard: expected four numbers',
    ]) {
      expect(errors).toContain(fragment);
    }
  });

  /*
   * KNOWN BUG (reported to the integrator as a requested shared change): parseTokens
   * checks `errors` BEFORE the typography/proportion fields are read (they are read
   * lazily inside the returned object literal), so an invalid number is silently
   * replaced by the fallback 0 or 1 and the document is accepted. `it.fails` pins
   * the current behaviour; once src/core/design/tokens.ts reads those fields before
   * the check, this test fails and must become a plain `it`.
   */
  it.fails('rejects a non-numeric typography value instead of defaulting it to 0', () => {
    const doc = tokenDocument() as Readonly<Record<string, TokenDocument>>;
    const typography = doc['typography'] as Readonly<Record<string, TokenDocument>>;
    const parsed = parseTokens({ ...doc, typography: { ...typography, 'base-min-px': { $value: 'x' } } });
    expect(parsed.ok ? [] : parsed.error).toContain('typography.base-min-px: expected a finite number');
  });

  it('rejects colours whose components are not three numbers', () => {
    const doc = tokenDocument();
    const parsed = parseTokens({
      ...(doc as Readonly<Record<string, TokenDocument>>),
      color: { light: { x: { $value: { colorSpace: 'oklch', components: [0.5, 0.1] } } } },
    });
    expect(parsed.ok ? [] : parsed.error).toContain('color.light.x: expected three numeric components');
  });
});

describe('site TeX macros under the strict KaTeX options', () => {
  const samples: Readonly<Record<string, string>> = {
    '\\KL': '\\KL{p}{q}',
    '\\infdivx': '\\infdivx{p}{q}',
    '\\abs': '\\abs{x}',
    '\\norm': '\\norm{x}',
    '\\set': '\\set{x}',
  };

  it.each(Object.keys(MACROS))('%s renders without errors', (macro) => {
    const source = samples[macro] ?? `${macro} x`;
    const html = katex.renderToString(source, {
      ...KATEX_OPTIONS,
      macros: { ...KATEX_OPTIONS.macros },
      throwOnError: true,
    });
    expect(html).toContain('class="katex"');
  });

  it('is strict about LaTeX compatibility but trusts only the HTML extensions it needs', () => {
    expect(KATEX_OPTIONS.strict('htmlExtension')).toBe('ignore');
    expect(KATEX_OPTIONS.strict('unicodeTextInMathMode')).toBe('error');
    expect(KATEX_OPTIONS.trust({ command: '\\htmlClass' })).toBe(true);
    expect(KATEX_OPTIONS.trust({ command: '\\htmlData' })).toBe(true);
    expect(KATEX_OPTIONS.trust({ command: '\\href' })).toBe(false);
    expect(KATEX_OPTIONS.trust({ command: '\\url' })).toBe(false);
  });
});
