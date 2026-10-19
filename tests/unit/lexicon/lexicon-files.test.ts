/**
 * The shipped dictionaries (lexicon/*.tsv): they parse without a single issue,
 * meet the seeding targets, and compile to the regex engine within budget.
 */
import { describe, expect, it } from 'vitest';
import { compileLexicon } from '../../../src/core/lexicon/compile.ts';
import { DEFAULT_REGEX_BUDGET } from '../../../src/core/lexicon/matcher.ts';
import { primaryLanguage } from '../../../src/core/lexicon/language-tag.ts';
import { loadFixtureLexicon, REAL_LEXICON } from './helpers.ts';

const lexicon = loadFixtureLexicon(REAL_LEXICON);
const count = (kind: string): number => lexicon.entries.filter((e) => e.kind === kind).length;

describe('lexicon/*.tsv', () => {
  it('meets the seeding targets', () => {
    expect(count('foreign')).toBeGreaterThanOrEqual(120);
    expect(count('latin')).toBeGreaterThanOrEqual(40);
    expect(count('proper')).toBeGreaterThanOrEqual(100);
    expect(count('acronym')).toBeGreaterThanOrEqual(60);
    expect(count('homograph')).toBeGreaterThanOrEqual(8);
  });

  it('excludes naturalised loanwords and keeps the documented ambiguous acronyms out', () => {
    const terms = new Set(lexicon.entries.map((e) => e.term));
    for (const naturalised of ['site', 'internet', 'bit', 'byte', 'etc.', 'e.g.', 'i.e.', 'vice-versa', 'IC', 'LCS']) {
      expect(terms.has(naturalised), naturalised).toBe(false);
    }
  });

  it('has foreign terms in several languages, Greek romanised as grc-Latn', () => {
    const langs = new Set(lexicon.entries.filter((e) => e.kind === 'foreign').map((e) => primaryLanguage(e.lang)));
    for (const l of ['en', 'de', 'fr', 'grc', 'it', 'ja', 'pt']) expect(langs.has(l), l).toBe(true);
    const greek = lexicon.entries.filter((e) => e.kind === 'foreign' && primaryLanguage(e.lang) === 'grc');
    expect(greek.every((e) => e.lang === 'grc-Latn')).toBe(true);
  });

  it('compiles both locales with the regex engine, each pattern within the 16 KiB budget', () => {
    const compiled = compileLexicon(lexicon);
    for (const locale of ['pt-BR', 'en'] as const) {
      const m = compiled.matchers[locale];
      expect(m.engine).toBe('regex');
      for (const s of m.sources) expect(s.length).toBeLessThanOrEqual(DEFAULT_REGEX_BUDGET);
    }
  });
});
