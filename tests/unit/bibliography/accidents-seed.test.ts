/**
 * The bibliography of the "accidents" layer (bibliography/accidents.bib), read
 * together with every other bibliography/*.bib exactly as the build reads them
 * (sorted by name, one index): no error and no warning, the required works
 * present, keys unique across files, and every entry formatted in both styles
 * (ABNT NBR 6023 for pt-BR, APA 7 for en) and citable through the citation stage.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { buildBibliography, formatDiagnostic, type BibSource } from '../../../src/core/bibliography/index.ts';
import { buildReferenceList } from '../../../src/core/bibliography/cite/engine.ts';
import type { Reference } from '../../../src/core/bibliography/model/reference.ts';
import { toPlainText } from '../../../src/core/bibliography/render/inline.ts';
import { abnt } from '../../../src/core/bibliography/style/abnt.ts';
import { apa } from '../../../src/core/bibliography/style/apa.ts';
import { render, spaces } from './helpers.ts';

const DIR = new URL('../../../bibliography/', import.meta.url);

/** All bibliography/*.bib, sorted by name — the order of src/adapters/unified/load-bibliography.ts. */
const sources: readonly BibSource[] = readdirSync(DIR)
  .filter((name) => name.endsWith('.bib'))
  .sort()
  .map((name) => ({ name: `bibliography/${name}`, text: readFileSync(new URL(name, DIR), 'utf8') }));

const result = buildBibliography(sources);
const index = result.ok ? result.value : undefined;

/** Works the accidents layer and its essays cite (the assignment's list, none omitted). */
const REQUIRED = [
  'aristotle-categories',
  'aristotle-metaphysics',
  'brooks1987',
  'moseley2006',
  'parnas1972',
  'liskov1994',
  'putnam1967',
  'heidegger1927',
  'simondon1958',
  'gibson1979',
  'norman1988',
  'simon1969',
  'hevner2004',
  'orlikowski2001',
  'davis1989',
  'kolmogorov1965',
  'hartley1928',
  'claessen2000',
  'johnson1988',
  'evans2003',
  'cunningham1992',
  'shapiro1999',
  'gawer2014',
  'vandeursen2000',
  'sugiyama1981',
] as const;

/** Added so that quotations can cite the edition actually quoted (see the comments in accidents.bib). */
const COMPANIONS = ['brooks1995', 'heidegger1962', 'heidegger2012', 'kolmogorov1968'] as const;

const ACCIDENTS = [...REQUIRED, ...COMPANIONS];

const referenceOf = (key: string): Reference => {
  const r = index?.get(key);
  if (r === undefined) throw new Error(`missing entry ${key}`);
  return r;
};

describe('bibliography/*.bib with accidents.bib', () => {
  it('reads accidents.bib as one of the sources', () => {
    expect(sources.map((s) => s.name)).toContain('bibliography/accidents.bib');
  });

  it('parses with no error and no warning', () => {
    expect(result.ok ? [] : result.error.map(formatDiagnostic)).toEqual([]);
    expect(result.ok && result.value.warnings.map(formatDiagnostic)).toEqual([]);
  });

  it('contains every work of the accidents layer', () => {
    expect(ACCIDENTS.filter((k) => index?.has(k) !== true)).toEqual([]);
  });

  it('keeps keys unique across files (case-insensitively, as the parser compares them)', () => {
    const owner = new Map<string, string>();
    const clashes: string[] = [];
    for (const source of sources) {
      const alone = buildBibliography([source]);
      expect(alone.ok ? [] : alone.error.map(formatDiagnostic), source.name).toEqual([]);
      for (const key of alone.ok ? alone.value.keys : []) {
        const folded = key.toLowerCase();
        const first = owner.get(folded);
        if (first !== undefined) clashes.push(`${key}: ${first} and ${source.name}`);
        else owner.set(folded, source.name);
      }
    }
    expect(clashes).toEqual([]);
    expect(index?.size).toBe(owner.size);
  });

  it('gives every new entry a language and only the documented key shapes', () => {
    for (const key of ACCIDENTS) {
      expect(referenceOf(key).language, key).toBeDefined();
      expect(key).toMatch(/^(?:[a-z]+\d{4}[a-z]?|aristotle-[a-z]+)$/u);
    }
  });

  it('formats every new entry in ABNT and APA, with no unresolved LaTeX, in NFC', () => {
    const refs = ACCIDENTS.map(referenceOf);
    for (const style of [abnt, apa]) {
      const list = buildReferenceList(refs, style);
      expect(list.entries.map((e) => e.key).sort(), style.id).toEqual([...ACCIDENTS].sort());
      for (const entry of list.entries) {
        const text = toPlainText(entry.content);
        const year = String(referenceOf(entry.key).issued.year);
        expect(text, `${style.id} ${entry.key}`).toContain(year);
        expect(text, `${style.id} ${entry.key}`).not.toMatch(/[\\{}]|undefined/u);
        expect(text.normalize('NFC'), `${style.id} ${entry.key}`).toBe(text);
        expect(toPlainText(style.label(referenceOf(entry.key), 'parenthetical')).trim(), entry.key).not.toBe('');
      }
    }
  });

  it('renders the recorded decisions', () => {
    const ref = (key: string, style = abnt): string => spaces(toPlainText(style.reference(referenceOf(key), '')));
    // Translator as a secondary responsibility (NBR 6023 §8.1.1.6) and in the APA parenthesis.
    expect(ref('aristotle-categories')).toContain('Tradução: John Lloyd Ackrill. Oxford: Clarendon Press, 1963.');
    expect(ref('aristotle-categories', apa)).toContain('(J. L. Ackrill, Trans.). Clarendon Press.');
    // Chapter in a multivolume work: volume and page range of the Metaphysics in Barnes, vol. 2.
    expect(ref('aristotle-metaphysics')).toContain('1984. v. 2, p. 1552-1728.');
    // "Jr." stays with the surname (NBR 6023 §8.1.1) and follows the initials in APA (§9.8).
    expect(ref('brooks1987')).toMatch(/^BROOKS JR\., Frederick Phillips\. No silver bullet: essence/u);
    expect(ref('brooks1987', apa)).toMatch(/^Brooks, F\. P\., Jr\. \(1987\)\./u);
    // Particle: van Deursen → DEURSEN, Arie van (ABNT) / van Deursen, A. (APA).
    expect(ref('vandeursen2000')).toMatch(/^DEURSEN, Arie van; KLINT, Paul; VISSER, Joost\./u);
    expect(ref('vandeursen2000', apa)).toMatch(/^van Deursen, A\., Klint, P\., & Visser, J\./u);
    // Original Russian title and journal, as in the scanned issue.
    expect(ref('kolmogorov1965')).toContain('Проблемы передачи информации, v. 1, n. 1, p. 3-11, 1965.');
    // Pages as printed in the article (Crossref: 75-106).
    expect(ref('hevner2004')).toContain('p. 75-105, mar. 2004');
  });

  it('cites the new keys through the citation stage in both languages, hyphenated keys included', () => {
    const bibliography = index ?? undefined;
    if (bibliography === undefined) throw new Error('bibliography did not build');
    const pt = render('[@aristotle-categories, p. 4] e [@brooks1995, p. 182].\n', 'pt-BR', bibliography);
    expect(spaces(pt.html)).toContain('Aristotle</a>, 1963, p. 4)');
    expect(spaces(pt.html)).toContain('Brooks Jr.</a>, 1995, p. 182)');
    expect(pt.frontmatter['citations']).toEqual(['aristotle-categories', 'brooks1995']);
    const en = render('As @heidegger1962 [p. 98] puts it.\n', 'en', bibliography);
    expect(spaces(en.html)).toContain('Heidegger</a> (1962, p. 98)');
  });
});
