import { describe, expect, it } from 'vitest';
import { fc, test } from '@fast-check/vitest';
import { compileMatcher, type Matcher } from '../../../src/core/lexicon/matcher.ts';
import { surfaceForms } from '../../../src/core/lexicon/forms.ts';
import { entriesFor } from '../../../src/core/lexicon/activation.ts';
import { naiveAlternationBody } from '../../../src/core/lexicon/trie.ts';
import type { Match } from '../../../src/core/lexicon/resolve.ts';
import { dictionaryArb, loadFixtureLexicon, makeEntry, naiveMatch, REAL_LEXICON, textFor } from './helpers.ts';

const show = (text: string, ms: readonly Match[]): readonly [string, string][] =>
  ms.map((m) => [text.slice(m.start, m.end), m.entry.id]);

const both = (m: Matcher, text: string): readonly [string, string][] => show(text, m.match(text));

/** Property tests compile hundreds of Unicode-property regexes: allow for a loaded CI machine. */
const SLOW = 30_000;

describe('matcher engines — LAW: equal to the naive reference', () => {
  test.prop([dictionaryArb.chain((d) => fc.tuple(fc.constant(d), textFor(d)))], { numRuns: 400 })(
    'trie-compiled regex finds exactly the naive matches',
    ([entries, text]) => {
      const reference = naiveMatch(surfaceForms(entries), text);
      expect(show(text, compileMatcher(entries, { engine: 'regex' }).match(text))).toEqual(show(text, reference));
    },
    SLOW,
  );

  test.prop([dictionaryArb.chain((d) => fc.tuple(fc.constant(d), textFor(d)))], { numRuns: 400 })(
    'Aho–Corasick finds exactly the naive matches',
    ([entries, text]) => {
      const reference = naiveMatch(surfaceForms(entries), text);
      expect(show(text, compileMatcher(entries, { engine: 'aho-corasick' }).match(text))).toEqual(
        show(text, reference),
      );
    },
    SLOW,
  );

  it('both engines agree with the reference on the real pt-BR dictionary over a varied corpus', () => {
    const lexicon = loadFixtureLexicon(REAL_LEXICON);
    const entries = entriesFor(lexicon.entries, 'pt-BR');
    const forms = surfaceForms(entries);
    const corpus = [
      'O software livre e o design thinking de Shannon, a FFT e a DFT; et al. e a priori.',
      'A Gestalt, o Zeitgeist e o lógos — big  data, Big\ndata e BIG DATA; os tokens e os pixels.',
      'Peirce, Saussure, Frege e Wittgenstein (Tractatus Logico-Philosophicus) na Escola de Frankfurt.',
      'A reação ao design não é designação; e-mail, e-mails, plug-ins, CPUs e APIs.',
      'Data, data e DATA; o time da ABNT e a NBR 6023; o SI e o Inmetro; Robert May e May.',
    ].map((s) => s.normalize('NFC'));
    const regex = compileMatcher(entries, { engine: 'regex' });
    const ac = compileMatcher(entries, { engine: 'aho-corasick' });
    for (const text of corpus) {
      const expected = show(text, naiveMatch(forms, text));
      expect(both(regex, text)).toEqual(expected);
      expect(both(ac, text)).toEqual(expected);
    }
  });
});

describe('matcher semantics', () => {
  const entries = [
    makeEntry('foreign', 'ação', 'insensitive', 'en'),
    makeEntry('foreign', 'big data', 'sentence'),
    makeEntry('foreign', 'data science', 'insensitive'),
    makeEntry('homograph', 'data', 'sentence'),
    makeEntry('proper', 'Shannon', 'exact'),
    makeEntry('acronym', 'CPU', 'exact'),
    makeEntry('latin', 'et al.', 'sentence'),
    makeEntry('foreign', 'Übermensch', 'exact', 'de'),
    makeEntry('foreign', 'fiancé', 'sentence', 'fr'),
  ];
  for (const engine of ['regex', 'aho-corasick'] as const) {
    const m = compileMatcher(entries, { engine });
    const hits = (s: string): readonly string[] =>
      m.match(s.normalize('NFC')).map((x) => s.normalize('NFC').slice(x.start, x.end));

    it(`${engine}: Unicode word boundaries (JS \\b is ASCII-only)`, () => {
      expect(hits('reação e ação')).toEqual(['ação']);
      expect(hits('o Übermensch e a fiancé.')).toEqual(['Übermensch', 'fiancé']);
      expect(hits('Shannons e Shannon')).toEqual(['Shannon']);
    });

    it(`${engine}: combining marks are never boundaries (NFD input normalised by the caller)`, () => {
      expect(hits('cafe\u0301')).toEqual([]);
      expect(hits('ac\u0327a\u0303o')).toEqual(['ação']);
    });

    it(`${engine}: leftmost-longest, flexible whitespace runs, case policies`, () => {
      // "big data" is case `sentence`: BIG DATA is not a form of it, and the homograph "data" is not "DATA".
      expect(hits('big  data e Big\ndata, BIG DATA')).toEqual(['big  data', 'Big\ndata']);
      expect(hits('Data Science e data')).toEqual(['Data Science', 'data']);
      expect(hits('shannon, SHANNON, Shannon')).toEqual(['Shannon']);
      expect(hits('Maciel et al. (2019); Et al.')).toEqual(['et al.', 'Et al.']);
    });

    it(`${engine}: acronym plurals and exact case`, () => {
      expect(hits('CPUs e CPU, cpu')).toEqual(['CPUs', 'CPU']);
    });
  }

  it('auto engine: regex below the source budget, Aho–Corasick above it', () => {
    expect(compileMatcher(entries).engine).toBe('regex');
    expect(compileMatcher(entries, { regexBudget: 10 }).engine).toBe('aho-corasick');
    // Pseudo-random, prefix-poor keys (multiplicative hashing), so the trie cannot factor them away.
    const word = (i: number): string =>
      `${(Math.imul(i + 1, 2654435761) >>> 0).toString(36)}q${(Math.imul(i + 7, 40503) >>> 0).toString(36)}`;
    const many = Array.from({ length: 3000 }, (_, i) => makeEntry('foreign', word(i), 'exact'));
    const auto = compileMatcher(many);
    expect(auto.engine).toBe('aho-corasick');
    expect(compileMatcher(many, { engine: 'regex' }).sources[0]?.length ?? 0).toBeGreaterThan(16 * 1024);
  });

  it('the trie pattern is much smaller than the naive alternation', () => {
    const keys = Array.from({ length: 500 }, (_, i) => `prefixo comum ${i.toString(36)}`);
    const trie = compileMatcher(
      keys.map((k) => makeEntry('foreign', k, 'exact')),
      { engine: 'regex' },
    ).sources[0];
    expect((trie ?? '').length).toBeLessThan((naiveAlternationBody(keys) ?? '').length / 3);
  });
});
