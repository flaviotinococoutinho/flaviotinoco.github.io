/** Text alternatives of the lab plots: one sentence per state, in both languages, with the numbers in it. */
import { describe, expect, it } from 'vitest';
import { LOCALES } from '../../../src/core/domain/locale.ts';
import { GIBBS_FRACTION } from '../../../src/core/labs/fourier.ts';
import {
  channelSummary,
  cltSummary,
  entropySummary,
  fourierSummary,
  logisticSummary,
  samplingSummary,
} from '../../../src/core/labs/summary.ts';

describe('summaries', () => {
  for (const locale of LOCALES) {
    it(`${locale}: Fourier, with and without a crest`, () => {
      const jump = fourierSummary(locale, {
        wave: 'square',
        harmonics: 7,
        sigma: false,
        crest: { x: 0.2, peak: 1.17, fraction: 0.085 },
        maxError: 0,
      });
      expect(jump).toMatch(/1[.,]170/);
      expect(jump).toMatch(/8[.,]50/);
      expect(jump).toContain(
        String(Math.round(GIBBS_FRACTION * 10000) / 100).replace('.', locale === 'en' ? '.' : ','),
      );
      const below = fourierSummary(locale, {
        wave: 'sawtooth',
        harmonics: 3,
        sigma: true,
        crest: { x: 3, peak: 0.98, fraction: -0.01 },
        maxError: 0,
      });
      expect(below).toMatch(/0[.,]980/);
      const flat = fourierSummary(locale, {
        wave: 'triangle',
        harmonics: 5,
        sigma: false,
        crest: null,
        maxError: 0.0123,
      });
      expect(flat).toMatch(/0[.,]012/);
      expect(flat.charAt(0)).toBe(flat.charAt(0).toLocaleUpperCase());
    });

    it(`${locale}: sampling in every regime`, () => {
      const base = { phase: 0, alias: 0, amplitude: 1 };
      expect(samplingSummary(locale, { ...base, f: 3000, fs: 12000 })).toMatch(/12 kHz/);
      expect(samplingSummary(locale, { ...base, f: 3000, fs: 6000, phase: 45, amplitude: 0.71 })).toMatch(/45°/);
      expect(samplingSummary(locale, { ...base, f: 7000, fs: 12000, alias: 5000 })).toMatch(/5 kHz/);
      const constant = samplingSummary(locale, { ...base, f: 12000, fs: 12000, alias: 0 });
      expect(constant.length).toBeGreaterThan(0);
      expect(constant).not.toBe(samplingSummary(locale, { ...base, f: 7000, fs: 12000, alias: 5000 }));
    });

    it(`${locale}: entropy, including the empty and one-symbol texts`, () => {
      expect(
        entropySummary(locale, {
          unit: 'char',
          total: 0,
          distinct: 0,
          entropy: 0,
          conditional: 0,
          meanLength: 0,
          top: null,
          topShare: 0,
        }),
      ).not.toBe('');
      expect(
        entropySummary(locale, {
          unit: 'char',
          total: 5,
          distinct: 1,
          entropy: 0,
          conditional: 0,
          meanLength: 1,
          top: 'a',
          topShare: 1,
        }),
      ).toContain('a');
      const full = entropySummary(locale, {
        unit: 'byte',
        total: 120,
        distinct: 9,
        entropy: 2.75,
        conditional: 1.5,
        meanLength: 2.8,
        top: '␣',
        topShare: 0.2,
      });
      expect(full).toMatch(/2[.,]750/);
      expect(full).toMatch(/20[.,]0/);
      expect(full).toContain('␣');
    });

    it(`${locale}: channel, with the flipped positions listed only up to eight`, () => {
      const few = channelSummary(locale, { p: 0.1, capacity: 0.531, flips: 3, bits: 32, positions: [2, 7, 19] });
      expect(few).toMatch(/0[.,]531/);
      expect(few).toMatch(/2, 7/);
      const many = channelSummary(locale, {
        p: 0.5,
        capacity: 0,
        flips: 9,
        bits: 32,
        positions: [1, 2, 3, 4, 5, 6, 7, 8, 9],
      });
      expect(many).not.toMatch(/1, 2, 3/);
      expect(channelSummary(locale, { p: 0, capacity: 1, flips: 0, bits: 0, positions: [] })).toMatch(/0[.,]0/);
    });

    it(`${locale}: logistic and central limit`, () => {
      expect(logisticSummary(locale, { r: 3.2, x0: 0.2, lambda: -0.3, period: 2 })).toMatch(/3[.,]200/);
      expect(logisticSummary(locale, { r: 4, x0: 0.2, lambda: 0.693, period: null })).toMatch(/0[.,]693/);
      expect(cltSummary(locale, { n: 12, samples: 20000, distance: 0.0123, bound: 6 })).toMatch(/0[.,]0123/);
    });
  }
});
