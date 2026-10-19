import { describe, expect, it } from 'vitest';
import { entriesFor, isActiveIn, parseOverrides } from '../../../src/core/lexicon/activation.ts';
import { compileLexicon, matcherFor } from '../../../src/core/lexicon/compile.ts';
import { loadFixtureLexicon } from './helpers.ts';

const lexicon = loadFixtureLexicon();
const byTerm = (term: string) => {
  const e = lexicon.entries.find((x) => x.term === term);
  if (e === undefined) throw new Error(term);
  return e;
};

describe('language-aware activation', () => {
  it('a foreign term is foreign only in documents of another language', () => {
    expect(isActiveIn(byTerm('software'), 'pt-BR')).toBe(true);
    expect(isActiveIn(byTerm('software'), 'en')).toBe(false);
    expect(isActiveIn(byTerm('saudade'), 'pt-BR')).toBe(false);
    expect(isActiveIn(byTerm('saudade'), 'en')).toBe(true);
  });

  it('vernacular_in: a phrase common in English stays roman in English text, italic in Portuguese', () => {
    expect(isActiveIn(byTerm('a priori'), 'pt-BR')).toBe(true);
    expect(isActiveIn(byTerm('a priori'), 'en')).toBe(false);
    expect(isActiveIn(byTerm('sic'), 'en')).toBe(true);
  });

  it('homographs apply only where they are also native words; acronyms by community; names always', () => {
    expect(isActiveIn(byTerm('data'), 'pt-BR')).toBe(true);
    expect(isActiveIn(byTerm('data'), 'en')).toBe(false);
    expect(isActiveIn(byTerm('logos'), 'en')).toBe(true);
    expect(isActiveIn(byTerm('CLT'), 'pt-BR')).toBe(false);
    expect(isActiveIn(byTerm('TCL'), 'pt-BR')).toBe(true);
    expect(isActiveIn(byTerm('FFT'), 'en')).toBe(true);
    expect(isActiveIn(byTerm('Shannon'), 'en')).toBe(true);
  });
});

describe('frontmatter overrides (precedence: frontmatter > dictionary)', () => {
  it('parses lexicon.ignore and lexicon.foreign, reporting invalid items', () => {
    const { overrides, problems } = parseOverrides(
      {
        ignore: ['Software', 42],
        foreign: [
          { term: 'bricolage', lang: 'fr' },
          { term: 'x', lang: 'eng' },
          { term: 'saudade', lang: 'pt-BR' },
        ],
      },
      'pt-BR',
    );
    expect(overrides).toEqual({ ignore: ['Software'], foreign: [{ term: 'bricolage', lang: 'fr' }] });
    expect(problems.map((p) => p.reason)).toEqual(['bad-ignore', 'bad-lang', 'same-language']);
    expect(parseOverrides('nope', 'pt-BR').problems.map((p) => p.reason)).toEqual(['not-an-object']);
    expect(parseOverrides(undefined, 'en').problems).toEqual([]);
  });

  it('ignore removes entries (any case); foreign adds or replaces them', () => {
    const terms = (xs: readonly { term: string }[]) => xs.map((e) => e.term);
    const ignored = entriesFor(lexicon.entries, 'pt-BR', { ignore: ['SOFTWARE'], foreign: [] });
    expect(terms(ignored)).not.toContain('software');
    const local = entriesFor(lexicon.entries, 'pt-BR', {
      ignore: [],
      foreign: [{ term: 'design', lang: 'fr' as never }],
    });
    const design = local.filter((e) => e.term === 'design');
    expect(design.map((e) => e.lang)).toEqual(['fr']);
  });

  it('a document matcher reflects its overrides and leaves the shared matcher untouched', () => {
    const compiled = compileLexicon(lexicon);
    const text = 'o software e o bricolage';
    const shared = compiled.matchers['pt-BR'].match(text).map((m) => m.entry.term);
    const local = matcherFor(compiled, 'pt-BR', {
      ignore: ['software'],
      foreign: [{ term: 'bricolage', lang: 'fr' as never }],
    })
      .match(text)
      .map((m) => m.entry.term);
    expect(shared).toEqual(['software']);
    expect(local).toEqual(['bricolage']);
  });
});
