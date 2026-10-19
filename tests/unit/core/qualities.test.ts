import { describe, expect, it } from 'vitest';
import { test, fc } from '@fast-check/vitest';
import {
  CONTRARY_QUALITIES,
  QUALITY_GROUPS,
  QUALITY_KEYS,
  contraries,
  parseQuality,
  qualityGroup,
} from '../../../src/core/domain/qualities.ts';
import qualities from '../../../src/core/i18n/catalogs/qualities.ts';

describe('quality vocabulary', () => {
  it('every quality belongs to a declared group and has a label in both locales', () => {
    for (const q of QUALITY_KEYS) {
      expect(QUALITY_GROUPS).toContain(qualityGroup(q));
      expect(qualities['pt-BR'][`quality.${q}`]).toBeTruthy();
      expect(qualities.en[`quality.${q}`]).toBeTruthy();
    }
  });

  test.prop([fc.constantFrom(...QUALITY_KEYS)])('parse accepts exactly the vocabulary', (q) => {
    expect(parseQuality(q)).toEqual({ ok: true, value: q });
  });

  test.prop([fc.string().filter((s) => !(QUALITY_KEYS as readonly string[]).includes(s))])(
    'parse rejects anything else, inherited names included',
    (s) => {
      expect(parseQuality(s).ok).toBe(false);
    },
  );

  it('rejects inherited property names', () => {
    for (const s of ['toString', 'constructor', '__proto__']) expect(parseQuality(s).ok).toBe(false);
  });

  it('contrary pairs are pairs of distinct known qualities, in the same group', () => {
    for (const [a, b] of CONTRARY_QUALITIES) {
      expect(a).not.toBe(b);
      expect(qualityGroup(a)).toBe(qualityGroup(b));
    }
  });

  test.prop([fc.subarray([...QUALITY_KEYS])])('contraries reports exactly the contrary pairs present', (qs) => {
    const set = new Set(qs);
    expect(contraries(qs)).toEqual(CONTRARY_QUALITIES.filter(([a, b]) => set.has(a) && set.has(b)));
  });
});
