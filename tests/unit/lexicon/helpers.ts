/**
 * Test helpers for the lexicon: fixture loading, entry builders, the NAIVE
 * REFERENCE matcher (the specification the engines are checked against) and
 * fast-check generators of dictionaries and texts.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { fc } from '@fast-check/vitest';
import { unsafeBrand } from '../../../src/core/algebra/brand.ts';
import { parseLanguageTag, type LanguageTag } from '../../../src/core/lexicon/language-tag.ts';
import type { SurfaceForm } from '../../../src/core/lexicon/forms.ts';
import { parseLexicon, type LexiconSource } from '../../../src/core/lexicon/parse.ts';
import type { Match } from '../../../src/core/lexicon/resolve.ts';
import { fold, hasWordBoundaries } from '../../../src/core/lexicon/text.ts';
import type { CasePolicy, Lexicon, LexiconEntry } from '../../../src/core/lexicon/types.ts';

export const FIXTURES = new URL('../../fixtures/lexicon/', import.meta.url);
export const REAL_LEXICON = new URL('../../../lexicon/', import.meta.url);

export const readSources = (dir: URL): readonly LexiconSource[] =>
  readdirSync(dir)
    .filter((n) => n.endsWith('.tsv'))
    .sort()
    .map((name) => ({ name, text: readFileSync(new URL(name, dir), 'utf8') }));

export const loadFixtureLexicon = (dir: URL = FIXTURES): Lexicon => {
  const r = parseLexicon(readSources(dir));
  if (!r.ok) throw new Error(r.error.map((i) => `${i.file}:${i.line}:${i.column} ${i.message}`).join('\n'));
  return r.value;
};

export const tag = (s: string): LanguageTag => {
  const r = parseLanguageTag(s);
  if (!r.ok) throw new Error(r.error);
  return r.value;
};

let line = 0;
/** Builds an entry directly (bypassing the TSV), for generated dictionaries. */
export const makeEntry = (
  kind: 'foreign' | 'latin' | 'proper' | 'acronym' | 'homograph',
  term: string,
  casePolicy: CasePolicy,
  lang = 'en',
  variants: readonly string[] = [],
): LexiconEntry => {
  line += 1;
  const base = {
    id: unsafeBrand<string, 'LexiconEntryId'>(`${kind}:${term}:${line}`),
    term,
    lang: tag(lang),
    casePolicy,
    source: { file: 'generated', line },
  };
  switch (kind) {
    case 'foreign':
      return { ...base, kind, variants, vernacularIn: [], note: '' };
    case 'latin':
      return { ...base, lang: tag('la'), kind, variants, vernacularIn: [], note: '' };
    case 'proper':
      return { ...base, kind, category: 'person', note: '' };
    case 'acronym':
      return { ...base, kind, expansion: { 'pt-BR': 'x', en: 'x' }, expansionLang: tag('en') };
    case 'homograph':
      return { ...base, kind, homographOf: ['pt'], note: '' };
  }
};

/**
 * NAIVE REFERENCE MATCHER — the specification. Scan every position; at each,
 * take the longest surface form that matches there (a space in a key matches a
 * whitespace run; folded forms compare against the folded text) with valid
 * Unicode word boundaries; ties go to the lowest rank. Accept and jump past it.
 */
export const naiveMatch = (forms: readonly SurfaceForm[], text: string): readonly Match[] => {
  const folded = fold(text);
  const isSpace = (c: string | undefined): boolean => c !== undefined && /\s/u.test(c);
  const matchAt = (key: string, hay: string, i: number): number | undefined => {
    let j = i;
    for (const c of key) {
      if (c === ' ') {
        if (!isSpace(hay[j])) return undefined;
        while (isSpace(hay[j])) j++;
      } else {
        if (hay.slice(j, j + c.length) !== c) return undefined;
        j += c.length;
      }
    }
    return j;
  };
  const out: Match[] = [];
  let i = 0;
  while (i < text.length) {
    let best: { end: number; form: SurfaceForm } | undefined;
    for (const f of forms) {
      const end = matchAt(f.key, f.fold ? folded : text, i);
      if (end === undefined || end === i || !hasWordBoundaries(text, i, end)) continue;
      if (best === undefined || end > best.end || (end === best.end && f.rank < best.form.rank))
        best = { end, form: f };
    }
    if (best === undefined) i++;
    else {
      out.push({ start: i, end: best.end, entry: best.form.entry });
      i = best.end;
    }
  }
  return out;
};

/* ------------------------------------------------------------ generators */

/** Letters chosen to stress folding, NFC and boundaries (accents, combining marks, ß, İ, Σ, ǅ, astral). */
const LETTERS = ['a', 'b', 'c', 'e', 'ç', 'á', 'ã', 'é', 'ß', 'İ', 'Σ', 'σ', 'ς', 'ǅ', 'Ä', 'o', 'z', '𝐀'];
const MARKS = ['\u0301', '\u0303', '\u0327'];
const NOISE = [' ', ' ', '  ', '\n', '\u00a0', '.', ',', '-', '’', '(', ')', '1', '2', '\u0301', '\u200d', ':'];

export const wordArb = fc
  .array(fc.oneof({ weight: 6, arbitrary: fc.constantFrom(...LETTERS) }, fc.constantFrom(...MARKS)), {
    minLength: 1,
    maxLength: 4,
  })
  .map((cs) => cs.join(''))
  .filter((w) => /^[\p{L}\p{N}]/u.test(w));

export const termArb = fc
  .array(wordArb, { minLength: 1, maxLength: 3 })
  .map((ws) => ws.join(' ').normalize('NFC'))
  .filter((t) => /[\p{L}\p{N}]/u.test(t) && !/^\s|\s$|\s\s/u.test(t));

export const entryArb: fc.Arbitrary<LexiconEntry> = fc
  .record({
    kind: fc.constantFrom('foreign', 'latin', 'proper', 'acronym', 'homograph'),
    term: termArb,
    casePolicy: fc.constantFrom<CasePolicy>('exact', 'insensitive', 'sentence'),
    variants: fc.array(termArb, { maxLength: 1 }),
  })
  .map((r) => makeEntry(r.kind, r.term, r.casePolicy, 'en', r.kind === 'foreign' ? r.variants : []));

export const dictionaryArb = fc.array(entryArb, { minLength: 1, maxLength: 8 });

/** A surface rendering of a term as an author might type it. */
const variantOf = (term: string, how: number, space: string): string => {
  const spaced = term.replace(/ /gu, space);
  switch (how % 4) {
    case 0:
      return spaced;
    case 1:
      return spaced.charAt(0).toUpperCase() + spaced.slice(1);
    case 2:
      return spaced.toUpperCase();
    default:
      return spaced.toLowerCase();
  }
};

/** Texts made of dictionary terms (in varied case and spacing) and noise, then NFC-normalised. */
export const textFor = (entries: readonly LexiconEntry[]): fc.Arbitrary<string> =>
  fc
    .array(
      fc.oneof(
        fc
          .tuple(fc.constantFrom(...entries), fc.nat(7), fc.constantFrom(' ', '  ', '\n', '\u00a0'))
          .map(([e, how, space]) => variantOf(e.term, how, space)),
        fc.constantFrom(...NOISE),
        wordArb,
      ),
      { maxLength: 24 },
    )
    .map((parts) => parts.join('').normalize('NFC'));
