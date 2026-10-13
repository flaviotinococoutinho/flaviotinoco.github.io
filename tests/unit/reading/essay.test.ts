import { describe, expect, it } from 'vitest';
import {
  bridgeTarget,
  CONFIDENCE_SCALE,
  confidenceScale,
  domainsPresent,
  groupByStratum,
  isoDate,
  kentBand,
  keywordList,
  lastRevision,
  provenanceMessage,
  revisionsNewestFirst,
} from '../../../src/core/reading/essay.ts';
import { slugify, uniqueSlugs } from '../../../src/core/reading/slug.ts';
import reading from '../../../src/core/i18n/catalogs/reading.ts';

describe('keywords per ABNT NBR 6028:2021, 4.1.7', () => {
  it('separates by semicolons and ends with a full stop, keeping the authors’ case', () => {
    expect(keywordList(['entropia', 'teoria da informação', 'Shannon'])).toBe('entropia; teoria da informação; Shannon.');
    expect(keywordList(['canal;', ' ruído. ', ''])).toBe('canal; ruído.');
    expect(keywordList([])).toBe('');
  });
});

describe('epistemic status (Kent, 1964)', () => {
  it('orders the scale from the lowest to the highest probability and marks the level', () => {
    expect(CONFIDENCE_SCALE[0]).toBe('almost-certainly-not');
    expect(CONFIDENCE_SCALE.at(-1)).toBe('certain');
    expect(confidenceScale('probable').filter((s) => s.active).map((s) => s.level)).toEqual(['probable']);
  });
  it('shows the probability band in the reader’s locale', () => {
    expect(kentBand('probable', 'en')).toBe('63%–87%');
    expect(kentBand('probable', 'pt-BR')).toMatch(/^63\s?%–87\s?%$/);
    expect(kentBand('certain', 'en')).toBe('100%');
    expect(kentBand('almost-certainly-not', 'en')).toBe('2%–12%');
  });
});

describe('provenance notice (editorial ethics)', () => {
  it('is shown whenever AI assistance was used or the author has not reviewed the text', () => {
    expect(provenanceMessage({ assistance: 'none', reviewed: true })).toBeNull();
    expect(provenanceMessage({ assistance: 'none', reviewed: false })).toBe('provenance.none.pending');
    expect(provenanceMessage({ assistance: 'assisted', reviewed: true })).toBe('provenance.assisted.reviewed');
    expect(provenanceMessage({ assistance: 'assisted', reviewed: false })).toBe('provenance.assisted.pending');
    expect(provenanceMessage({ assistance: 'generated', reviewed: true })).toBe('provenance.generated.reviewed');
    expect(provenanceMessage({ assistance: 'generated', reviewed: false })).toBe('provenance.generated.pending');
    expect(reading['pt-BR']['provenance.generated.pending']).toBe('Texto-semente gerado com assistência de IA; revisão do autor pendente.');
  });
});

describe('bridge, dates and grouping', () => {
  it('leads to the declared bridge, else to the next stratum, and ends at value', () => {
    expect(bridgeTarget('philosophy', undefined)).toBe('theory');
    expect(bridgeTarget('philosophy', 'formal')).toBe('formal');
    expect(bridgeTarget('value', undefined)).toBeNull();
  });
  it('finds the last revision after publication and sorts revisions newest first', () => {
    const published = new Date('2026-01-10');
    const revisions = [
      { date: new Date('2026-02-01'), note: 'b' },
      { date: new Date('2026-01-01'), note: 'antes' },
      { date: new Date('2026-03-05'), note: 'c' },
    ];
    expect(lastRevision(published, revisions)?.toISOString()).toBe('2026-03-05T00:00:00.000Z');
    expect(lastRevision(published, [])).toBeNull();
    expect(revisionsNewestFirst(revisions).map((r) => r.note)).toEqual(['c', 'b', 'antes']);
    expect(isoDate(published)).toBe('2026-01-10');
  });
  it('groups in bridge order and lists the domains present in facet order', () => {
    const items = [
      { s: 'value', d: ['product'] },
      { s: 'philosophy', d: ['logic', 'ontology'] },
      { s: 'value', d: ['design'] },
    ] as const;
    expect(groupByStratum(items, (i) => i.s).map((g) => [g.stratum, g.items.length])).toEqual([
      ['philosophy', 1],
      ['value', 2],
    ]);
    expect(domainsPresent(items, (i) => i.d)).toEqual(['ontology', 'logic', 'design', 'product']);
  });
});

describe('heading slugs (github-slugger 2 compatible)', () => {
  it('matches github-slugger on Portuguese headings', () => {
    // Expected values produced by github-slugger 2.0.0 (the slugger of Astro's rehypeHeadingIds).
    expect(uniqueSlugs(['Introdução', 'Introdução', 'O que é? (1)', 'Seção 2.1: a–b'], [])).toEqual([
      'introdução',
      'introdução-1',
      'o-que-é-1',
      'seção-21-ab',
    ]);
  });
  it('avoids reserved ids and never returns an empty slug', () => {
    expect(uniqueSlugs(['Content', 'Content'], ['content'])).toEqual(['content-1', 'content-2']);
    expect(slugify('?!')).toBe('section');
  });
});
