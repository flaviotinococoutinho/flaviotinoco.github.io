/**
 * Reference model → BibTeX (src/core/bibliography/bibtex/encode.ts): the
 * printer is the inverse of the parser — toReference(parse(toBibtex(r))) = r —
 * on every entry of the seed bibliography and of the fixtures, and on generated
 * marked text.
 */
import { describe, expect, it } from 'vitest';
import { fc, test } from '@fast-check/vitest';
import { buildBibliography, type BibliographyIndex } from '../../../src/core/bibliography/index.ts';
import {
  encodeMarked,
  encodeNames,
  escapeBibtex,
  toBibtex,
  toBibtexFile,
} from '../../../src/core/bibliography/bibtex/encode.ts';
import { decodeLatex, type MarkedText } from '../../../src/core/bibliography/bibtex/latex.ts';
import { parseNames } from '../../../src/core/bibliography/bibtex/names.ts';
import type { Reference } from '../../../src/core/bibliography/model/reference.ts';
import { MAIN_BIB_PATH, fixture, loadIndex } from './helpers.ts';

const main = loadIndex(MAIN_BIB_PATH, 'main.bib');

const reparse = (bib: string): BibliographyIndex => {
  const r = buildBibliography([{ name: 'export.bib', text: bib }]);
  if (!r.ok) throw new Error(r.error.map((d) => `${d.span.start.line}:${d.span.start.column} ${d.message}`).join('\n'));
  expect(r.value.warnings).toEqual([]);
  return r.value;
};

const all = (index: BibliographyIndex): readonly Reference[] =>
  index.keys.map((k) => index.get(k)).filter((r): r is Reference => r !== undefined);

describe('toBibtex', () => {
  it.each([
    ['main.bib', main],
    ['fixture.bib', fixture],
  ])('round-trips every entry of %s exactly (fields, protected and italic spans)', (_name, index) => {
    for (const ref of all(index)) {
      const back = reparse(toBibtex(ref)).get(ref.key);
      expect(back, ref.key).toEqual(ref);
    }
  });

  it('prints a conventional biblatex entry', () => {
    const ref = main.get('shannon1948');
    expect(ref).toBeDefined();
    if (ref === undefined) return;
    expect(toBibtex(ref)).toBe(
      [
        '@article{shannon1948,',
        '  author  = {Shannon, Claude Elwood},',
        '  title   = {A mathematical theory of communication},',
        '  journal = {Bell System Technical Journal},',
        '  volume  = {27},',
        '  number  = {3-4},',
        '  pages   = {379--423, 623--656},',
        '  date    = {1948-07/1948-10},',
        '  doi     = {10.1002/j.1538-7305.1948.tb01338.x},',
        '  langid  = {english},',
        '}',
        '',
      ].join('\n'),
    );
  });

  it('keeps names, particles, corporate authors, case protection and inferred years', () => {
    const bib = toBibtexFile(
      all(main).filter((r) => ['saussure1916', 'seco2004', 'w3c2023', 'kotelnikov1933', 'cooley1965'].includes(r.key)),
    );
    expect(bib).toContain('author    = {de Saussure, Ferdinand},');
    expect(bib).toContain('editor      = {{López de Mántaras}, Ramón and Saitta, Lorenza},');
    expect(bib).toContain('author    = {{World Wide Web Consortium}},');
    expect(bib).toContain('year      = {[1933]},');
    expect(bib).toContain('title   = {An algorithm for the machine calculation of complex {Fourier} series},');
    expect(bib).toContain('langid    = {russian},');
    expect(reparse(bib).size).toBe(5);
  });
});

describe('encodeMarked / escapeBibtex', () => {
  it('escapes the LaTeX special characters and breaks the en-dash ligature', () => {
    expect(escapeBibtex('50% & {x} #1 $2 a_b ~ ^ \\ 1--2')).toBe(
      '50\\% \\& \\textbraceleft{}x\\textbraceright{} \\#1 \\$2 a\\_b \\textasciitilde{} \\textasciicircum{} \\textbackslash{} 1-{}-2',
    );
  });

  it('writes protected spans as groups and italic spans as \\emph', () => {
    const m: MarkedText = {
      text: 'The %SKOS book in vivo',
      protected: [{ start: 4, end: 9 }],
      italic: [
        { start: 6, end: 14 },
        { start: 15, end: 22 },
      ],
    };
    expect(encodeMarked(m)).toBe('The {{}\\%S}\\emph{{KOS} book} \\emph{in vivo}');
    expect(decodeLatex(encodeMarked(m)).value).toEqual(m);
  });

  const segment = fc.stringMatching(/^[A-Za-zÀ-ÿ0-9 %&#$_~^{}\\.,;:!?()«»\u00A0–—-]{0,8}$/u);
  const marked = fc
    .array(fc.record({ text: segment, protect: fc.boolean(), italic: fc.boolean() }), { maxLength: 6 })
    .map((parts): MarkedText => {
      let text = '';
      const protectedRanges: { start: number; end: number }[] = [];
      const italic: { start: number; end: number }[] = [];
      for (const p of parts) {
        const start = text.length;
        text += p.text;
        if (p.text === '') continue;
        if (p.protect) protectedRanges.push({ start, end: text.length });
        if (p.italic) italic.push({ start, end: text.length });
      }
      // The decoder collapses white space runs and trims nothing inside: generate what it can produce.
      return decodeLatex(encodeMarked({ text, protected: merge(protectedRanges), italic: merge(italic) })).value;
    });

  test.prop([marked], { numRuns: 300 })('decode ∘ encode = id on marked text', (m) => {
    expect(decodeLatex(encodeMarked(m)).value).toEqual(m);
    expect(decodeLatex(encodeMarked(m)).problems).toEqual([]);
  });

  it('writes name lists that the name parser reads back', () => {
    for (const raw of [
      'de Saussure, Ferdinand',
      'Ford, Jr., Henry',
      'Brinch~Hansen, Per',
      '{López de Mántaras}, Ramón and others',
      '{Barnes and Noble}',
      'van der Waals, Johannes Diderik',
    ]) {
      const list = parseNames(raw).value;
      expect(parseNames(encodeNames(list)).value, raw).toEqual(list);
    }
  });
});

/** Merges overlapping or adjacent ranges (as the decoder reports them). */
function merge(ranges: readonly { start: number; end: number }[]): { start: number; end: number }[] {
  const out: { start: number; end: number }[] = [];
  for (const r of [...ranges].sort((a, b) => a.start - b.start)) {
    const last = out.at(-1);
    if (last !== undefined && r.start <= last.end) last.end = Math.max(last.end, r.end);
    else out.push({ ...r });
  }
  return out;
}
