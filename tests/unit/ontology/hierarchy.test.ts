import { describe, expect, it } from 'vitest';
import { fc, test } from '@fast-check/vitest';
import {
  deriveHierarchy,
  findCycles,
  maxDepth,
  pathBetween,
  redundantEdges,
  subsumers,
  transitiveReduction,
} from '../../../src/core/ontology/hierarchy.ts';
import { dagArb, nodeName, parentsFn } from './helpers.ts';

const names = (n: number): string[] => Array.from({ length: n }, (_, i) => nodeName(i));

/** Reachability by brute force (Floyd–Warshall style), the naive specification. */
const reachable = (n: number, edges: readonly (readonly [number, number])[]): boolean[][] => {
  const r = Array.from({ length: n }, () => Array.from({ length: n }, () => false));
  for (const [a, b] of edges) (r[a] as boolean[])[b] = true;
  for (let k = 0; k < n; k += 1)
    for (let i = 0; i < n; i += 1) for (let j = 0; j < n; j += 1) if (r[i]?.[k] === true && r[k]?.[j] === true) (r[i] as boolean[])[j] = true;
  return r;
};

describe('hierarchy laws on random DAGs', () => {
  test.prop([dagArb()])('ancestors equal brute-force reachability (closure is transitive)', ({ n, edges }) => {
    const h = deriveHierarchy(names(n), parentsFn(edges));
    const r = reachable(n, edges);
    for (let i = 0; i < n; i += 1) {
      for (let j = 0; j < n; j += 1) {
        expect(h.ancestors.get(nodeName(i))?.has(nodeName(j))).toBe(r[i]?.[j] === true);
        // descendants is the converse of ancestors
        expect(h.descendants.get(nodeName(j))?.has(nodeName(i))).toBe(r[i]?.[j] === true);
      }
    }
  });

  test.prop([dagArb()])('narrower is the converse of broader; depth increases along broader', ({ n, edges }) => {
    const h = deriveHierarchy(names(n), parentsFn(edges));
    for (const id of h.ids) {
      for (const p of h.broader.get(id) ?? []) {
        expect(h.narrower.get(p)).toContain(id);
        expect(h.depth.get(id) ?? 0).toBeGreaterThan(h.depth.get(p) ?? 0);
      }
    }
    expect(h.roots.every((r) => (h.broader.get(r) ?? []).length === 0)).toBe(true);
    expect(h.leaves.every((l) => (h.narrower.get(l) ?? []).length === 0)).toBe(true);
    expect(findCycles(names(n), parentsFn(edges))).toEqual([]);
  });

  test.prop([dagArb()])('the transitive reduction preserves reachability and is minimal', ({ n, edges }) => {
    const reduced = transitiveReduction(names(n), parentsFn(edges));
    const reducedEdges = [...reduced].flatMap(([a, bs]) => bs.map((b) => [Number(a.slice(1)), Number(b.slice(1))] as const));
    expect(reachable(n, reducedEdges)).toEqual(reachable(n, edges));
    // Minimal: removing any edge of the reduction changes reachability.
    for (const e of reducedEdges) {
      const without = reducedEdges.filter((x) => x !== e);
      expect(reachable(n, without)).not.toEqual(reachable(n, edges));
    }
    expect(redundantEdges(names(n), (id) => reduced.get(id) ?? [])).toEqual([]);
  });

  test.prop([fc.integer({ min: 3, max: 7 })])('finds the cycle closing a chain', (n) => {
    const edges = Array.from({ length: n }, (_, i) => [i, (i + 1) % n] as const);
    const cycles = findCycles(names(n), parentsFn(edges));
    expect(cycles).toHaveLength(1);
    expect(cycles[0]?.[0]).toBe(cycles[0]?.at(-1));
    expect(new Set(cycles[0]).size).toBe(n);
  });
});

describe('helpers', () => {
  it('computes subsumers, depth and paths', () => {
    const h = deriveHierarchy<string>(['a', 'b', 'c'], (id) => (id === 'a' ? ['b'] : id === 'b' ? ['c'] : []));
    expect([...subsumers(h, 'a')].sort()).toEqual(['a', 'b', 'c']);
    expect(maxDepth(h)).toBe(2);
    expect(pathBetween<string>('a', 'c', (id) => h.broader.get(id) ?? [])).toEqual(['a', 'b', 'c']);
    expect(pathBetween<string>('c', 'a', (id) => h.broader.get(id) ?? [])).toBeNull();
    expect(redundantEdges(['a', 'b', 'c'], (id) => (id === 'a' ? ['b', 'c'] : id === 'b' ? ['c'] : []))).toEqual([
      { source: 'a', target: 'c', via: ['b'] },
    ]);
  });

  it('terminates on cyclic input and ignores unknown targets', () => {
    const h = deriveHierarchy<string>(['a', 'b'], (id) => (id === 'a' ? ['b', 'zzz'] : ['a']));
    expect(h.ancestors.get('a')?.has('b')).toBe(true);
    expect(h.broader.get('a')).toEqual(['b']);
    expect(Number.isFinite(h.depth.get('a'))).toBe(true);
  });
});
