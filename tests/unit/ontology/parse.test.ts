import { describe, expect, it } from 'vitest';
import { fc, test } from '@fast-check/vitest';
import { buildLabelIndex, lookupLabel } from '../../../src/core/ontology/labels.ts';
import { parseConceptEntry } from '../../../src/core/ontology/parse.ts';
import { labelKey, searchKey, slugify, stripDiacritics } from '../../../src/core/ontology/text.ts';
import {
  CATEGORIES,
  LINK_TYPES,
  PREREQUISITE_TYPES,
  RELATIONS,
  RELATION_TYPES,
  categoryOfTaxon,
  categoryTaxon,
  parseCategory,
  parseLinkType,
  satisfiesStratum,
} from '../../../src/core/ontology/vocabulary.ts';
import { raw, siteOntology } from './helpers.ts';

describe('relation vocabulary (data table)', () => {
  it('declares coherent algebraic properties', () => {
    for (const t of RELATION_TYPES) {
      const s = RELATIONS[t];
      expect(s.id).toBe(t);
      if (s.symmetric) {
        expect(s.inverse).toBeNull();
        expect(s.acyclic).toBe(false);
        expect(s.stratum).toBe('none');
      } else {
        expect(s.inverse).not.toBeNull();
        expect(s.acyclic).toBe(true);
      }
      expect(s.weight).toBeGreaterThan(0);
    }
    const inverses = RELATION_TYPES.map((t) => RELATIONS[t].inverse).filter((x) => x !== null);
    expect(new Set(inverses).size).toBe(inverses.length);
    expect(LINK_TYPES).not.toContain('broader');
    expect(PREREQUISITE_TYPES).toEqual(['broader', 'dependsOn']);
    // formal relations are cheaper than the weak one
    expect(Math.max(...RELATION_TYPES.filter((t) => t !== 'related').map((t) => RELATIONS[t].weight))).toBeLessThan(RELATIONS.related.weight);
  });

  it('orients the bridge constraints', () => {
    expect(satisfiesStratum('descending', 'formal', 'theory')).toBe(true);
    expect(satisfiesStratum('descending', 'theory', 'theory')).toBe(false);
    expect(satisfiesStratum('ascending', 'theory', 'value')).toBe(true);
    expect(satisfiesStratum('ascending', 'value', 'philosophy')).toBe(false);
    expect(satisfiesStratum('none', 'value', 'philosophy')).toBe(true);
  });

  it('parses categories and link types with helpful errors', () => {
    for (const c of CATEGORIES) {
      expect(parseCategory(c)).toEqual({ ok: true, value: c });
      expect(categoryOfTaxon(categoryTaxon(c))).toBe(c);
    }
    expect(categoryOfTaxon('entropy')).toBeNull();
    expect(categoryOfTaxon('@nothing')).toBeNull();
    expect(parseCategory('thing').ok).toBe(false);
    const broader = parseLinkType('broader');
    expect(!broader.ok && broader.error).toContain('"broader" field');
    const inverse = parseLinkType('hasPart');
    expect(!inverse.ok && inverse.error).toContain('derived inverse');
    expect(parseLinkType('nope').ok).toBe(false);
  });
});

describe('concept parser', () => {
  it('accepts every concept of the site', () => {
    expect(siteOntology().graph.ids.length).toBeGreaterThan(0);
  });

  it('accumulates every problem of an entry', () => {
    const bad = parseConceptEntry('x', {
      slug: { 'pt-BR': 'Not A Slug', en: 'ok' },
      prefLabel: { 'pt-BR': ' padded', en: 'ok', fr: 'non' },
      definition: { 'pt-BR': 'd' },
      stratum: 'metaphysics',
      category: 'thing',
      domains: [],
      broader: ['Bad Id'],
      relations: [{ type: 'broader', target: 'y' }, { type: 'related' }, { type: 'related', target: 'y', extra: 1 }, 'nope'],
      related: ['y'],
      exactMatch: ['ftp://example.org'],
      sources: ['1bad'],
    });
    expect(bad.ok).toBe(false);
    if (bad.ok) return;
    const paths = bad.error.map((e) => (e.kind === 'malformed' ? e.path : e.kind));
    for (const p of [
      'slug.pt-BR',
      'prefLabel.pt-BR',
      'prefLabel',
      'definition.en',
      'stratum',
      'category',
      'domains',
      'broader[0]',
      'relations[0].type',
      'relations[1].target',
      'relations[2].extra',
      'relations[3]',
      'related',
      'exactMatch[0]',
      'sources[0]',
    ]) {
      expect(paths, p).toContain(p);
    }
    expect(parseConceptEntry('Bad Id', {}).ok).toBe(false);
    expect(parseConceptEntry('x', []).ok).toBe(false);
  });

  it('normalises text to NFC at the boundary', () => {
    const decomposed = 'Informação';
    const r = parseConceptEntry('x', { ...(raw('x').data as object), prefLabel: { 'pt-BR': decomposed, en: 'Information' } });
    expect(r.ok && r.value.prefLabel['pt-BR']).toBe('Informação');
  });
});

describe('labels and text keys', () => {
  const o = siteOntology();
  const index = buildLabelIndex(o.graph);
  it('finds concepts by prefLabel or altLabel, case-insensitively, per locale', () => {
    expect(lookupLabel(index, 'ENTROPIA', 'pt-BR')).toEqual({ kind: 'found', id: 'entropy' });
    expect(lookupLabel(index, 'Shannon entropy', 'en')).toEqual({ kind: 'found', id: 'entropy' });
    expect(lookupLabel(index, 'entropia', 'en').kind).toBe('unknown');
    const unknown = lookupLabel(index, 'entrop', 'pt-BR');
    expect(unknown.kind === 'unknown' && unknown.suggestions).toContain('entropy');
  });
  it('reports ambiguous labels', () => {
    // "DFT" names the discrete Fourier transform only; make an artificial homonym.
    const map = new Map(index['en']);
    map.set('dft', ['discrete-fourier-transform', 'fast-fourier-transform'] as never);
    expect(lookupLabel({ ...index, en: map }, 'DFT', 'en').kind).toBe('ambiguous');
  });
  test.prop([fc.string()])('keys are idempotent and NFC', (s) => {
    expect(labelKey(labelKey(s, 'pt-BR'), 'pt-BR')).toBe(labelKey(s, 'pt-BR'));
    expect(labelKey(s, 'en').normalize('NFC')).toBe(labelKey(s, 'en'));
    expect(searchKey(searchKey(s, 'en'), 'en')).toBe(searchKey(s, 'en'));
  });
  it('folds typography, diacritics and builds slugs', () => {
    expect(labelKey('Kraft’s  inequality', 'en')).toBe("kraft's inequality");
    expect(stripDiacritics('ação')).toBe('acao');
    expect(slugify('Sentido e referência')).toBe('sentido-e-referencia');
    expect(slugify('Lei de Hick–Hyman')).toBe('lei-de-hick-hyman');
  });
});
