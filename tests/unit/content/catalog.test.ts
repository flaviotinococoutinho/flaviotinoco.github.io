/**
 * Runtime laws of the content catalog (src/core/i18n/catalogs/content.ts).
 * Key parity is enforced by the type checker (defineMessages); these tests add
 * what types cannot see: no empty strings, identical placeholders in both
 * locales, and the single {date} slot that PageView.astro replaces by <time>.
 */
import { describe, expect, it } from 'vitest';
import { fc, test } from '@fast-check/vitest';
import { format, translator } from '../../../src/core/i18n/messages.ts';
import catalog from '../../../src/core/i18n/catalogs/content.ts';

const placeholders = (s: string): string[] => [...s.matchAll(/\{([a-zA-Z0-9_]+)\}/gu)].map((m) => m[1] ?? '').sort();

describe('content catalog', () => {
  const keys = Object.keys(catalog['pt-BR']) as (keyof (typeof catalog)['pt-BR'])[];

  it('has the same keys, non-empty messages and the same placeholders in both locales', () => {
    expect(Object.keys(catalog.en).sort()).toEqual([...keys].sort());
    for (const key of keys) {
      expect(catalog['pt-BR'][key].trim(), key).not.toBe('');
      expect(catalog.en[key].trim(), key).not.toBe('');
      expect(placeholders(catalog.en[key]), key).toEqual(placeholders(catalog['pt-BR'][key]));
    }
  });

  it('keeps exactly one {date} slot in page.lastRevised', () => {
    for (const locale of ['pt-BR', 'en'] as const) {
      expect(catalog[locale]['page.lastRevised'].split('{date}')).toHaveLength(2);
    }
  });

  test.prop([fc.constantFrom('pt-BR' as const, 'en' as const), fc.string({ minLength: 1, maxLength: 40 })])(
    'splitting around the date slot recovers the formatted message (no text is lost)',
    (locale, date) => {
      fc.pre(!date.includes('\u0000') && !/\{[a-zA-Z0-9_]+\}/u.test(date));
      const t = translator(catalog, locale);
      const [before = '', after = ''] = t('page.lastRevised', { date: '\u0000' }).split('\u0000');
      expect(`${before}${date}${after}`).toBe(format(catalog[locale]['page.lastRevised'], { date }));
    },
  );
});
