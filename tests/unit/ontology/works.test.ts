import { describe, expect, it } from 'vitest';
import { fc, test } from '@fast-check/vitest';
import type { ConceptId } from '../../../src/core/domain/identifiers.ts';
import { glossary, initialOf } from '../../../src/core/ontology/glossary.ts';
import { backlinks, bestMatchAverage, relatedWorks, sharedConcepts, shortTitleOf, type Work } from '../../../src/core/ontology/works.ts';
import { cid, siteOntology } from './helpers.ts';

const o = siteOntology();
const work = (key: string, concepts: readonly string[], title = key): Work => ({
  key,
  kind: key.startsWith('lab') ? 'lab' : 'essay',
  locale: 'en',
  title,
  shortTitle: shortTitleOf(title),
  stratum: 'theory',
  href: `/en/${key}/`,
  concepts: concepts.map(cid),
});
const ids = o.graph.ids;
const conceptSet = fc.subarray([...ids], { minLength: 1, maxLength: 6 });

describe('related works (best-match average of Lin)', () => {
  test.prop([conceptSet, conceptSet])('is symmetric, in [0, 1] and 1 for identical sets', (a, b) => {
    const x = bestMatchAverage(o.taxonomy, o.ic, a, b);
    expect(x).toBeGreaterThanOrEqual(0);
    expect(x).toBeLessThanOrEqual(1 + 1e-12);
    expect(bestMatchAverage(o.taxonomy, o.ic, b, a)).toBeCloseTo(x, 12);
    expect(bestMatchAverage(o.taxonomy, o.ic, a, a)).toBeCloseTo(1, 12);
  });

  it('credits structurally close concepts, unlike Jaccard', () => {
    const huffman = work('essay:huffman', ['huffman-code', 'entropy']);
    const prefix = work('lab:prefix', ['prefix-code', 'mutual-information']);
    const chaos = work('lab:chaos', ['logistic-map', 'bifurcation']);
    const ranked = relatedWorks(o.taxonomy, o.ic, huffman, [huffman, prefix, chaos], 3);
    expect(ranked[0]?.work.key).toBe('lab:prefix');
    expect(ranked.every((r) => r.work.key !== huffman.key)).toBe(true);
    expect(bestMatchAverage(o.taxonomy, o.ic, [], [cid('entropy')])).toBe(0);
  });
});

describe('backlinks and shared concepts', () => {
  const a = work('essay:a', ['entropy', 'channel', 'noise']);
  const b = work('lab:b', ['entropy', 'channel']);
  const c = work('lab:c', ['entropy']);
  it('maps concepts to the works that discuss them', () => {
    const map = backlinks([a, b, c]);
    expect(map.get(cid('entropy'))?.map((w) => w.key)).toEqual(['essay:a', 'lab:b', 'lab:c']);
    expect(map.has(cid('model'))).toBe(false);
  });
  it('lists works sharing at least two concepts', () => {
    expect(sharedConcepts(a, [a, b, c]).map((s) => [s.work.key, s.shared])).toEqual([['lab:b', ['channel', 'entropy']]]);
    expect(sharedConcepts(a, [a, b, c], 1)).toHaveLength(2);
  });
  it('shortens titles at a colon or an em dash', () => {
    expect(shortTitleOf('To sample is to decide: the Nyquist–Shannon theorem')).toBe('To sample is to decide');
    expect(shortTitleOf('Escolher custa bits — entropia')).toBe('Escolher custa bits');
    expect(shortTitleOf('Entropy')).toBe('Entropy');
  });
});

describe('glossary', () => {
  for (const locale of ['pt-BR', 'en'] as const) {
    it(`lists every label once, sorted and grouped by initial (${locale})`, () => {
      const sections = glossary(o.graph, locale);
      const entries = sections.flatMap((s) => s.entries);
      const expected = o.graph.ids.reduce((n, id) => n + 1 + (o.graph.concepts.get(id)?.altLabel[locale].length ?? 0), 0);
      expect(entries).toHaveLength(expected);
      const collator = new Intl.Collator(locale, { sensitivity: 'base', numeric: true });
      for (let i = 1; i < entries.length; i += 1) {
        expect(collator.compare(entries[i - 1]!.term, entries[i]!.term)).toBeLessThanOrEqual(0);
      }
      for (const s of sections) for (const e of s.entries) expect(initialOf(e.term, locale)).toBe(s.letter);
      expect(new Set(sections.map((s) => s.letter)).size).toBe(sections.length);
      expect(entries.filter((e) => e.kind === 'pref').map((e) => e.id).sort()).toEqual([...o.graph.ids].sort() as ConceptId[]);
    });
  }
  it('files accented and non-letter initials correctly', () => {
    expect(initialOf('Égua', 'pt-BR')).toBe('E');
    expect(initialOf('3D', 'en')).toBe('#');
  });
});
