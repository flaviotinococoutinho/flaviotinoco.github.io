import { describe, expect, it } from 'vitest';
import { fc, test } from '@fast-check/vitest';
import { analyseText } from '../../../src/core/abnt/engine.ts';
import { leaves } from '../../../src/core/abnt/intervals.ts';
import { compileLexicon } from '../../../src/core/lexicon/compile.ts';
import { loadFixtureLexicon, textFor } from '../lexicon/helpers.ts';

const lexicon = loadFixtureLexicon();
const compiled = compileLexicon(lexicon);

const textArb = fc
  .tuple(
    textFor(lexicon.entries),
    fc.array(fc.constantFrom('10 kHz', 'p. 12', 'C. E. Shannon', '3 maio 2024', 'e\u0301', 'cafe\u0301 ', '’'), {
      maxLength: 4,
    }),
  )
  .map(([t, extra]) => [t, ...extra].join(' '));

describe('analyseText', () => {
  test.prop([textArb, fc.constantFrom('pt-BR', 'en')], { numRuns: 300 })(
    'LAW (injectivity): the text leaves of the mark forest reproduce the input exactly',
    (text, locale) => {
      const a = analyseText(text, { locale, matcher: compiled.matchers[locale] });
      expect(
        leaves(a.segments)
          .map((l) => text.slice(l.start, l.end))
          .join(''),
      ).toBe(text);
    },
  );

  it('maps matches found on the NFC copy back to the original (NFD) code units', () => {
    const text = 'the lo\u0301gos';
    const a = analyseText(text, { locale: 'en', matcher: compiled.matchers.en });
    const mark = a.segments.find((s) => s.kind === 'mark');
    expect(mark && text.slice(mark.start, mark.end)).toBe('lo\u0301gos');
  });

  it('uses the surrounding characters for boundaries but never marks them', () => {
    const ctx = { locale: 'pt-BR' as const, matcher: compiled.matchers['pt-BR'] };
    expect(analyseText('soft', ctx, { before: '', after: 'wa' }).segments).toEqual([
      { kind: 'text', start: 0, end: 4 },
    ]);
    expect(analyseText('et al.', ctx, { before: '', after: 'so' }).segments).toEqual([
      { kind: 'text', start: 0, end: 6 },
    ]);
    expect(analyseText('et al.', ctx, { before: '', after: ' x' }).segments[0]?.kind).toBe('mark');
  });

  it('returns homographs separately (never as marks)', () => {
    const a = analyseText('a data', { locale: 'pt-BR', matcher: compiled.matchers['pt-BR'] });
    expect(a.segments.every((s) => s.kind === 'text')).toBe(true);
    expect(a.homographs.map((h) => h.entry.term)).toEqual(['data']);
  });
});
