import { describe, expect, it } from 'vitest';
import { fc, test } from '@fast-check/vitest';
import { fold, hasWordBoundaries, nfcView, normalizeSpaces, upperFirst } from '../../../src/core/lexicon/text.ts';
import { parseLanguageTag, primaryLanguage } from '../../../src/core/lexicon/language-tag.ts';

const unicodeText = fc.string({
  unit: fc.oneof(
    fc.constantFrom(
      'a',
      'e',
      'i',
      'o',
      'c',
      'Σ',
      'İ',
      'ß',
      ' ',
      '\n',
      '\u00a0',
      '.',
      '\u0301',
      '\u0303',
      '\u0327',
      '\u200d',
    ),
    fc.constantFrom('é', 'ç', 'ã', 'ǅ', '가', '\u1100', '\u1161', '\u11a8', '𝐀', '😀'),
    fc.string({ unit: 'grapheme', maxLength: 1 }),
  ),
  maxLength: 40,
});

describe('fold', () => {
  test.prop([unicodeText])('is length-preserving', (s) => {
    expect(fold(s)).toHaveLength(s.length);
  });

  test.prop([unicodeText, unicodeText])('is context-free: fold(a + b) = fold(a) + fold(b)', (a, b) => {
    fc.pre(!/[\ud800-\udbff]$/u.test(a));
    expect(fold(a + b)).toBe(fold(a) + fold(b));
  });

  test.prop([unicodeText])('maps exactly the whitespace characters to U+0020', (s) => {
    const f = fold(s);
    for (let i = 0; i < s.length; i++) expect(f.charAt(i) === ' ').toBe(/\s/u.test(s.charAt(i)));
  });

  it('lower-cases letters, keeps İ (whose lower case has two code units) and final sigma context-free', () => {
    expect(fold('ÁRVORE Gestalt')).toBe('árvore gestalt');
    expect(fold('İ')).toBe('İ');
    expect(fold('ΛΌΓΟΣ')).toBe('λόγοσ');
  });
});

describe('word boundaries', () => {
  it('treat letters, digits and combining marks as word characters (JS \\b does not)', () => {
    expect(hasWordBoundaries('reação', 2, 6)).toBe(false);
    expect(hasWordBoundaries('a ação.', 2, 6)).toBe(true);
    expect(hasWordBoundaries('cafe\u0301', 0, 4)).toBe(false);
    expect(hasWordBoundaries('𝐀b', 2, 3)).toBe(false);
    expect(/\bção\b/u.test('reação')).toBe(true); // the ASCII-only \b would wrongly accept this
  });
});

describe('nfcView', () => {
  test.prop([unicodeText])('nfc equals String#normalize("NFC") whenever the view exists', (s) => {
    const view = nfcView(s);
    if (view !== undefined) expect(view.nfc).toBe(s.normalize('NFC'));
  });

  test.prop([unicodeText])('maps the ends of every unchanged cluster back exactly', (s) => {
    const view = nfcView(s);
    fc.pre(view !== undefined);
    expect(view?.toOriginal(0)).toBe(0);
    expect(view?.toOriginal(view.nfc.length)).toBe(s.length);
    for (let i = 0; i <= (view?.nfc.length ?? 0); i++) {
      const o = view?.toOriginal(i);
      if (o !== undefined) expect(s.slice(o).normalize('NFC')).toBe(view?.nfc.slice(i));
    }
  });

  it('keeps the original code points: offsets inside a recomposed character are not mappable', () => {
    const s = 'cafe\u0301 bar';
    const view = nfcView(s);
    expect(view?.nfc).toBe('café bar');
    expect(view?.toOriginal(3)).toBe(3);
    expect(view?.toOriginal(4)).toBe(5);
    expect(view?.toOriginal(5)).toBe(6);
  });
});

describe('small helpers', () => {
  it('normalizeSpaces collapses runs; upperFirst capitalises the first code point', () => {
    expect(normalizeSpaces('big \n\u00a0data')).toBe('big data');
    expect(upperFirst('ação')).toBe('Ação');
    expect(upperFirst('')).toBe('');
  });
});

describe('BCP 47 language tags (RFC 5646)', () => {
  it('canonicalises case and accepts well-formed tags with known primary subtags', () => {
    const ok = (s: string): string => {
      const r = parseLanguageTag(s);
      if (!r.ok) throw new Error(r.error);
      return r.value;
    };
    expect(ok('PT-br')).toBe('pt-BR');
    expect(ok('grc-latn')).toBe('grc-Latn');
    expect(ok('ru-Latn')).toBe('ru-Latn');
    expect(ok('en-US-x-twain')).toBe('en-US-x-twain');
    expect(ok('de-CH-1996')).toBe('de-CH-1996');
    expect(ok('es-419')).toBe('es-419');
    expect(ok('mul')).toBe('mul');
  });

  it('rejects malformed tags and unregistered primary subtags', () => {
    for (const bad of [
      '',
      'e',
      'eng',
      'gr',
      'pt_BR',
      'pt-',
      '-pt',
      'pt-BR-BR-x',
      'de-1996-1996',
      'en-Xxxx',
      'pt BR',
      ' pt',
    ]) {
      expect(parseLanguageTag(bad).ok, bad).toBe(false);
    }
  });

  test.prop([fc.constantFrom('pt-BR', 'en', 'grc-Latn', 'de-CH-1996', 'la', 'zh-Hant-TW', 'en-a-bbb-x-ccc')])(
    'canonicalisation is idempotent and preserves the primary language',
    (input) => {
      const once = parseLanguageTag(input);
      const twice = once.ok ? parseLanguageTag(once.value) : once;
      expect(twice).toEqual(once);
      if (once.ok) expect(primaryLanguage(once.value)).toBe(input.split('-')[0]?.toLowerCase());
    },
  );
});
