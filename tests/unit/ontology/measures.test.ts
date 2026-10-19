import { describe, expect, it } from 'vitest';
import { fc, test } from '@fast-check/vitest';
import { deriveHierarchy } from '../../../src/core/ontology/hierarchy.ts';
import {
  closestByLin,
  commonSubsumers,
  compare,
  degreeEntropy,
  intrinsicInformationContent,
  lin,
  lowestCommonSubsumers,
  mostInformativeSubsumer,
  resnik,
  shannonEntropy,
  tally,
} from '../../../src/core/ontology/measures.ts';
import { isConceptTaxon } from '../../../src/core/ontology/taxonomy.ts';
import { cid, dagArb, nodeName, parentsFn, siteOntology } from './helpers.ts';

const names = (n: number): string[] => Array.from({ length: n }, (_, i) => nodeName(i));

describe('intrinsic information content (Seco, Veale & Hayes, 2004)', () => {
  test.prop([dagArb()])('is in [0, 1], 1 on leaves, and non-increasing from leaves to roots', ({ n, edges }) => {
    const h = deriveHierarchy(names(n), parentsFn(edges));
    const ic = intrinsicInformationContent(h);
    for (const id of h.ids) {
      const v = ic.get(id) ?? -1;
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
      for (const p of h.ancestors.get(id) ?? []) expect(ic.get(p) ?? 2).toBeLessThanOrEqual(v);
    }
    for (const leaf of h.leaves) expect(ic.get(leaf)).toBe(1);
  });

  it('gives 0 to a root that subsumes everything', () => {
    const h = deriveHierarchy(['top', 'a', 'b'], (id) => (id === 'top' ? [] : ['top']));
    expect(intrinsicInformationContent(h).get('top')).toBe(0);
    expect(intrinsicInformationContent(deriveHierarchy(['x'], () => [])).get('x')).toBe(1);
  });
});

describe('Lin (1998) and Resnik (1995) similarity', () => {
  test.prop([dagArb(), fc.nat(), fc.nat()])('Lin ∈ [0,1], symmetric, 1 on identical concepts', ({ n, edges }, i, j) => {
    const h = deriveHierarchy(names(n), parentsFn(edges));
    const ic = intrinsicInformationContent(h);
    const a = nodeName(i % n);
    const b = nodeName(j % n);
    const x = lin(h, ic, a, b);
    expect(x).toBeGreaterThanOrEqual(0);
    expect(x).toBeLessThanOrEqual(1);
    expect(lin(h, ic, b, a)).toBeCloseTo(x, 12);
    expect(lin(h, ic, a, a)).toBe(1);
    expect(resnik(h, ic, a, b)).toBeCloseTo(resnik(h, ic, b, a), 12);
  });

  test.prop([dagArb(), fc.nat(), fc.nat()])(
    'lowest common subsumers are minimal common subsumers',
    ({ n, edges }, i, j) => {
      const h = deriveHierarchy(names(n), parentsFn(edges));
      const a = nodeName(i % n);
      const b = nodeName(j % n);
      const common = commonSubsumers(h, a, b);
      const lcs = lowestCommonSubsumers(h, a, b);
      for (const c of lcs) {
        expect(common.has(c)).toBe(true);
        for (const d of h.descendants.get(c) ?? []) expect(common.has(d)).toBe(false);
      }
    },
  );

  it('uses the most informative of several lowest common subsumers (polyhierarchy)', () => {
    // a and b share two parents p (specific) and q (general).
    const h = deriveHierarchy(['a', 'b', 'p', 'q', 'r', 's'], (id) =>
      id === 'a' || id === 'b' ? ['p', 'q'] : id === 'r' || id === 's' ? ['q'] : [],
    );
    const ic = intrinsicInformationContent(h);
    expect(lowestCommonSubsumers(h, 'a', 'b')).toEqual(['p', 'q']);
    expect(mostInformativeSubsumer(h, ic, 'a', 'b')).toBe('p');
    expect(compare(h, ic, 'a', 'b')).toMatchObject({ lcs: ['p', 'q'], mica: 'p' });
  });

  it('is 0 across disjoint trees', () => {
    const h = deriveHierarchy(['a', 'b'], () => []);
    const ic = intrinsicInformationContent(h);
    expect(lin(h, ic, 'a', 'b')).toBe(0);
    expect(resnik(h, ic, 'a', 'b')).toBe(0);
    expect(compare(h, ic, 'a', 'b').mica).toBeNull();
  });

  it('ranks the closest concepts of the site by Lin', () => {
    const o = siteOntology();
    const candidates = o.taxonomy.ids.filter(isConceptTaxon);
    const closest = closestByLin(o.taxonomy, o.ic, cid('entropy'), 5, candidates);
    expect(closest.length).toBeGreaterThanOrEqual(3);
    expect(closest.map((c) => c.id)).toContain('mutual-information');
    for (let k = 1; k < closest.length; k += 1) expect(closest[k - 1]!.lin).toBeGreaterThanOrEqual(closest[k]!.lin);
    expect(closest.every((c) => isConceptTaxon(c.id))).toBe(true);
  });
});

describe('Shannon entropy', () => {
  test.prop([fc.array(fc.integer({ min: 0, max: 50 }), { maxLength: 12 })])(
    'is between 0 and log2 of the support',
    (counts) => {
      const h = shannonEntropy(counts);
      const support = counts.filter((c) => c > 0).length;
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThanOrEqual(Math.log2(Math.max(1, support)) + 1e-12);
    },
  );
  it('matches worked values', () => {
    expect(shannonEntropy([1, 1])).toBeCloseTo(1, 12);
    expect(shannonEntropy([1, 1, 1, 1])).toBeCloseTo(2, 12);
    expect(shannonEntropy([5])).toBe(0);
    expect(shannonEntropy([])).toBe(0);
    expect(degreeEntropy([2, 2, 2])).toBe(0);
    expect(degreeEntropy([1, 2, 3, 4])).toBeCloseTo(2, 12);
    expect([...tally(['x', 'y'], ['x', 'x'])]).toEqual([
      ['x', 2],
      ['y', 0],
    ]);
  });
});
