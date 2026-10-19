/**
 * Derived topological structures: taxonomy, learning paths, typed shortest
 * paths, betweenness (bridge concepts), communities + NMI.
 */
import { describe, expect, it } from 'vitest';
import { fc, test } from '@fast-check/vitest';
import { betweenness, bridgeConcepts, normalise } from '../../../src/core/ontology/centrality.ts';
import {
  louvain,
  modularity,
  mutualInformation,
  normalizedMutualInformation,
} from '../../../src/core/ontology/community.ts';
import { learningPath, prerequisiteClosure, prerequisitesOf, shortestPath } from '../../../src/core/ontology/paths.ts';
import { buildTaxonomy, taxonomyOf } from '../../../src/core/ontology/taxonomy.ts';
import { PREREQUISITE_TYPES, RELATIONS, TOP_TAXON, categoryTaxon } from '../../../src/core/ontology/vocabulary.ts';
import { cid, ontologyOf, raw, siteOntology } from './helpers.ts';

describe('extended taxonomy', () => {
  const o = siteOntology();
  it('has one root, the top, above one node per category', () => {
    expect(o.taxonomy.roots).toEqual([TOP_TAXON]);
    expect(o.taxonomy.broader.get(categoryTaxon('measure'))).toEqual([TOP_TAXON]);
    expect(o.ic.get(TOP_TAXON)).toBe(0);
  });
  it('places every domain root under its own category', () => {
    for (const id of o.graph.hierarchy.roots) {
      const e = o.graph.concepts.get(id);
      expect(o.taxonomy.broader.get(id)).toEqual([categoryTaxon(e!.category)]);
    }
    expect(taxonomyOf(o.graph).ids).toEqual(o.taxonomy.ids);
  });
  it('ignores unknown broader targets', () => {
    const t = buildTaxonomy(
      [cid('a')],
      () => [cid('zzz')],
      () => 'entity',
    );
    expect(t.broader.get(cid('a'))).toEqual([categoryTaxon('entity')]);
  });
});

describe('learning paths (Kahn 1962)', () => {
  const o = siteOntology();
  it('lists every prerequisite before what depends on it, and ends with the target', () => {
    for (const target of o.graph.ids) {
      for (const locale of ['pt-BR', 'en'] as const) {
        const path = learningPath(o.graph, target, locale);
        expect(path.at(-1)).toBe(target);
        expect(new Set(path).size).toBe(path.length);
        expect(path.length).toBe(prerequisiteClosure(o.graph, target).size + 1);
        const position = new Map(path.map((id, i) => [id, i]));
        for (const id of path) {
          for (const p of prerequisitesOf(o.graph, id))
            expect(position.get(p) ?? Infinity).toBeLessThan(position.get(id) ?? -1);
        }
      }
    }
  });
  it('is the expected path for Huffman coding', () => {
    expect(learningPath(o.graph, cid('huffman-code'), 'en')).toEqual([
      'sign',
      'symbol',
      'uncertainty',
      'code',
      'information',
      'entropy',
      'prefix-code',
      'huffman-code',
    ]);
    expect(learningPath(o.graph, cid('nothing'), 'en')).toEqual([]);
    expect(PREREQUISITE_TYPES).toEqual(['broader', 'dependsOn']);
  });
});

describe('typed shortest paths (Dijkstra)', () => {
  const o = siteOntology();
  test.prop([fc.nat(), fc.nat()])('exist between any two concepts and cost the sum of their steps', (i, j) => {
    const a = o.graph.ids[i % o.graph.ids.length]!;
    const b = o.graph.ids[j % o.graph.ids.length]!;
    const p = shortestPath(o.graph, a, b);
    expect(p).not.toBeNull();
    if (p === null) return;
    expect(p.cost).toBeCloseTo(
      p.steps.reduce((s, x) => s + RELATIONS[x.type].weight, 0),
      9,
    );
    if (a === b) expect(p.steps).toEqual([]);
    else {
      expect(p.steps[0]?.from).toBe(a);
      expect(p.steps.at(-1)?.to).toBe(b);
    }
    // Symmetric cost (the projection is undirected).
    expect(shortestPath(o.graph, b, a)?.cost).toBeCloseTo(p.cost, 9);
  });
  it('prefers cheap formal relations to the weak `related`', () => {
    const g = ontologyOf([
      raw('a', { relations: [['related', 'c']] }),
      raw('b', { relations: [['partOf', 'a']] }),
      raw('c', { relations: [['partOf', 'b']] }),
    ]).graph;
    const p = shortestPath(g, cid('a'), cid('c'));
    expect(p?.steps.map((s) => s.type)).toEqual(['partOf', 'partOf']);
    expect(p?.steps[0]).toMatchObject({ from: 'a', to: 'b', direction: 'inverse' });
    expect(shortestPath(g, cid('a'), cid('zzz'))).toBeNull();
  });
});

describe('betweenness (Brandes 2001)', () => {
  it('matches the closed form on a path and a star', () => {
    // Path a — b — c — d: b and c each lie on 2 shortest paths.
    const path = new Map([
      ['a', ['b']],
      ['b', ['a', 'c']],
      ['c', ['b', 'd']],
      ['d', ['c']],
    ]);
    expect(Object.fromEntries(betweenness(['a', 'b', 'c', 'd'], path))).toEqual({ a: 0, b: 2, c: 2, d: 0 });
    // Star with 4 leaves: the centre lies on C(4,2) = 6 paths; normalised = 1.
    const star = new Map<string, string[]>([
      ['o', ['p', 'q', 'r', 's']],
      ['p', ['o']],
      ['q', ['o']],
      ['r', ['o']],
      ['s', ['o']],
    ]);
    const b = betweenness(['o', 'p', 'q', 'r', 's'], star);
    expect(b.get('o')).toBe(6);
    expect(normalise(b).get('o')).toBe(1);
  });
  it('splits credit between equally short paths', () => {
    // Square a — b — d, a — c — d: b and c each carry half of the a–d pair.
    const sq = new Map([
      ['a', ['b', 'c']],
      ['b', ['a', 'd']],
      ['c', ['a', 'd']],
      ['d', ['b', 'c']],
    ]);
    expect(betweenness(['a', 'b', 'c', 'd'], sq).get('b')).toBeCloseTo(0.5, 12);
  });
  it('counts only cross-strata pairs in the bridge variant', () => {
    const path = new Map([
      ['a', ['b']],
      ['b', ['a', 'c']],
      ['c', ['b']],
    ]);
    const same = betweenness(['a', 'b', 'c'], path, () => 0);
    expect(same.get('b')).toBe(0);
    const o = siteOntology();
    expect(o.bridges.length).toBe(5);
    expect(bridgeConcepts(o.centrality, 2)).toEqual(o.bridges.slice(0, 2));
  });
});

describe('communities (Louvain) and NMI (Strehl & Ghosh 2002)', () => {
  const twoCliques = (): [string[], [string, string, number][]] => {
    const ids = ['a1', 'a2', 'a3', 'a4', 'b1', 'b2', 'b3', 'b4'];
    const edges: [string, string, number][] = [];
    for (const side of ['a', 'b'])
      for (let i = 1; i <= 4; i += 1)
        for (let j = i + 1; j <= 4; j += 1) edges.push([`${side}${String(i)}`, `${side}${String(j)}`, 1]);
    edges.push(['a1', 'b1', 1]);
    return [ids, edges];
  };
  it('separates two cliques joined by one edge', () => {
    const [ids, edges] = twoCliques();
    const c = louvain(ids, edges);
    expect(c.members).toEqual([
      ['a1', 'a2', 'a3', 'a4'],
      ['b1', 'b2', 'b3', 'b4'],
    ]);
    expect(c.modularity).toBeCloseTo(modularity(ids, edges, c.of), 12);
    expect(c.modularity).toBeGreaterThan(0.3);
  });
  it('is deterministic and yields connected communities on the site graph', () => {
    const o = siteOntology();
    const again = siteOntology();
    expect(again.communities.members).toEqual(o.communities.members);
    for (const part of o.communities.members) {
      const inside = new Set(part);
      const seen = new Set([part[0]]);
      const stack = [part[0]!];
      while (stack.length > 0) {
        for (const n of o.graph.neighbours.get(stack.pop()!) ?? [])
          if (inside.has(n) && !seen.has(n)) {
            seen.add(n);
            stack.push(n);
          }
      }
      expect(seen.size).toBe(part.length);
    }
    expect(o.stats.communities.nmiDomains).toBeGreaterThan(0);
    expect(o.stats.communities.nmiDomains).toBeLessThanOrEqual(1);
  });
  test.prop([
    fc.array(fc.constantFrom('x', 'y', 'z'), { minLength: 1, maxLength: 30 }),
    fc.array(fc.constantFrom('p', 'q'), { minLength: 30, maxLength: 30 }),
  ])('NMI is symmetric, in [0, 1], and 1 for a relabelled copy', (x, ys) => {
    const y = ys.slice(0, x.length);
    const v = normalizedMutualInformation(x, y);
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThanOrEqual(1);
    expect(normalizedMutualInformation(y, x)).toBeCloseTo(v, 12);
    const relabelled = x.map((l) => `L${l}`);
    expect(normalizedMutualInformation(x, relabelled)).toBeCloseTo(new Set(x).size > 1 ? 1 : 1, 12);
    expect(mutualInformation(x, y)).toBeGreaterThanOrEqual(0);
  });
  it('is 0 for independent partitions', () => {
    expect(normalizedMutualInformation(['a', 'a', 'b', 'b'], ['x', 'y', 'x', 'y'])).toBeCloseTo(0, 12);
    expect(normalizedMutualInformation(['a', 'a'], ['x', 'y'])).toBe(0);
    expect(louvain(['a'], []).members).toEqual([['a']]);
  });
});
