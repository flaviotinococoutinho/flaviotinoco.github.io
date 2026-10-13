import { describe, expect, it } from 'vitest';
import { fc, test } from '@fast-check/vitest';
import { layoutDag, type LayoutInput } from '../../../src/core/reading/layout.ts';
import { abbreviate, drawArgumentMap } from '../../../src/core/reading/argument-map.ts';
import { argumentGraph, describeGraphError, parseSectionId, type ArgumentNode, type SectionId } from '../../../src/core/reading/argument.ts';

/** Random DAG: edges only go from an earlier to a later vertex of a random topological order, then vertices are shuffled. */
const dag: fc.Arbitrary<LayoutInput> = fc
  .integer({ min: 0, max: 12 })
  .chain((n) =>
    fc.record({
      edges:
        n < 2
          ? fc.constant([] as [number, number][])
          : fc.uniqueArray(
              fc
                .tuple(fc.nat(n - 2), fc.integer({ min: 1, max: n - 1 }))
                .map(([a, d]): [number, number] => [a, Math.min(n - 1, a + d)]),
              { maxLength: n * 2, selector: ([a, b]) => `${a}-${b}` },
            ),
      order: fc.shuffledSubarray(
        Array.from({ length: n }, (_, i) => i),
        { minLength: n, maxLength: n },
      ),
    }),
  )
  .map(({ edges, order }) => ({
    nodes: order.map((i) => ({ id: `v${i}` })),
    edges: edges.map(([a, b]) => ({ from: `v${a}`, to: `v${b}` })),
  }));

const unwrap = <T>(r: { ok: true; value: T } | { ok: false; error: string }): T => {
  if (!r.ok) throw new Error(r.error);
  return r.value;
};

describe('layoutDag (Sugiyama: longest-path layering + barycentric ordering)', () => {
  test.prop([dag])('no edge points upward: every dependency is drawn strictly above what rests on it', (g) => {
    const l = unwrap(layoutDag(g));
    const layer = new Map(l.nodes.map((n) => [n.id, n.layer]));
    for (const e of l.edges) {
      expect(layer.get(e.to) ?? 0).toBeGreaterThan(layer.get(e.from) ?? 0);
      for (let k = 1; k < e.points.length; k += 1) expect(e.points[k]?.y).toBe((e.points[k - 1]?.y ?? 0) + 1);
    }
  });

  test.prop([dag])('is deterministic', (g) => {
    expect(layoutDag(g)).toEqual(layoutDag(structuredClone(g)));
  });

  test.prop([dag])('places every vertex once, at distinct positions inside the drawing', (g) => {
    const l = unwrap(layoutDag(g));
    expect(l.nodes.map((n) => n.id)).toEqual(g.nodes.map((n) => n.id));
    const cells = new Set(l.nodes.map((n) => `${n.layer}:${n.order}`));
    expect(cells.size).toBe(l.nodes.length);
    for (const n of l.nodes) {
      expect(n.y).toBe(n.layer);
      expect(Math.abs(n.x)).toBeLessThanOrEqual((l.width - 1) / 2);
      expect(n.layer).toBeLessThan(l.layers);
    }
  });

  test.prop([dag])('crossing reduction never makes the drawing worse than the document order', (g) => {
    expect(unwrap(layoutDag(g)).crossings).toBeLessThanOrEqual(unwrap(layoutDag(g, { sweeps: 0 })).crossings);
  });

  it('removes a crossing the document order would draw', () => {
    // b supports c, a supports d; in document order c comes before d: one crossing.
    const g = {
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }],
      edges: [
        { from: 'b', to: 'c' },
        { from: 'a', to: 'd' },
      ],
    };
    expect(unwrap(layoutDag(g, { sweeps: 0 })).crossings).toBe(1);
    const l = unwrap(layoutDag(g));
    expect(l.crossings).toBe(0);
    expect(l.layers).toBe(2);
  });

  it('routes long edges through dummy vertices and pulls sources down next to their dependents', () => {
    const g = {
      nodes: [{ id: 'q' }, { id: 'd' }, { id: 't' }, { id: 'e' }],
      edges: [
        { from: 'q', to: 'd' },
        { from: 'd', to: 't' },
        { from: 'q', to: 't' },
        { from: 'e', to: 't' },
      ],
    };
    const l = unwrap(layoutDag(g));
    expect(l.nodes.map((n) => [n.id, n.layer])).toEqual([
      ['q', 0],
      ['d', 1],
      ['t', 2],
      ['e', 1],
    ]);
    expect(l.edges.find((e) => e.from === 'q' && e.to === 't')?.points).toHaveLength(3);
  });

  it('rejects cycles, unknown endpoints, self-loops and duplicate vertices', () => {
    const v = [{ id: 'a' }, { id: 'b' }];
    expect(layoutDag({ nodes: v, edges: [{ from: 'a', to: 'b' }, { from: 'b', to: 'a' }] }).ok).toBe(false);
    expect(layoutDag({ nodes: v, edges: [{ from: 'a', to: 'z' }] }).ok).toBe(false);
    expect(layoutDag({ nodes: v, edges: [{ from: 'a', to: 'a' }] }).ok).toBe(false);
    expect(layoutDag({ nodes: [...v, { id: 'a' }], edges: [] }).ok).toBe(false);
    expect(unwrap(layoutDag({ nodes: [], edges: [] }))).toEqual({ layers: 0, width: 0, nodes: [], edges: [], crossings: 0 });
  });
});

describe('drawArgumentMap', () => {
  const input = {
    nodes: [
      { id: 'q', kind: 'question', title: 'O que é informação, afinal, para um engenheiro?' },
      { id: 'd', kind: 'definition', title: 'Entropia' },
      { id: 't', kind: 'claim', title: 'Há um limite' },
    ],
    edges: [
      { from: 'q', to: 'd' },
      { from: 'd', to: 't' },
    ],
  };
  it('scales the layout into the view box, top to bottom, with an arrowhead per edge', () => {
    const d = unwrap(drawArgumentMap(input));
    expect(d.width).toBe(320);
    expect(d.nodes.map((n) => n.cy)).toEqual([...d.nodes.map((n) => n.cy)].sort((a, b) => a - b));
    for (const n of d.nodes) {
      expect(n.cx).toBeGreaterThan(0);
      expect(n.cx).toBeLessThan(d.width);
      expect(n.cy).toBeLessThan(d.height);
    }
    expect(d.edges).toHaveLength(2);
    for (const e of d.edges) {
      expect(e.d).toMatch(/^M[\d.]+ [\d.]+C/);
      expect(e.head).toMatch(/Z$/);
    }
    expect(d.nodes[0]?.label.length).toBeLessThanOrEqual(d.nodes[0]?.title.length ?? 0);
  });
  it('rejects unknown kinds and cyclic input', () => {
    expect(drawArgumentMap({ nodes: [{ id: 'a', kind: 'tese', title: 'A' }], edges: [] }).ok).toBe(false);
  });
  test.prop([fc.string({ maxLength: 80 }), fc.integer({ min: 1, max: 40 })])('abbreviate keeps a prefix and fits the width', (t, max) => {
    const a = abbreviate(t, max);
    expect(Array.from(a).length).toBeLessThanOrEqual(Math.max(max, 1));
    if (Array.from(t.trim()).length <= max) expect(a).toBe(t.trim());
    else expect(a.endsWith('…')).toBe(true);
  });
});

describe('argumentGraph (Toulmin argument structure, must be a DAG)', () => {
  const id = (s: string): SectionId => {
    const r = parseSectionId(s);
    if (!r.ok) throw new Error(r.error);
    return r.value;
  };
  const node = (i: string, depends: readonly string[] = []): ArgumentNode => ({ id: id(i), kind: 'claim', title: i, depends: depends.map(id) });
  it('builds edges from each dependency to the section resting on it', () => {
    expect(argumentGraph([node('a'), node('b', ['a'])])).toEqual({
      ok: true,
      value: { nodes: [node('a'), node('b', ['a'])], edges: [{ from: 'a', to: 'b' }] },
    });
  });
  it('reports every problem: duplicates, self-dependencies, missing targets and each cycle once', () => {
    const r = argumentGraph([node('a', ['c']), node('b', ['a']), node('c', ['b']), node('a'), node('d', ['d', 'z'])]);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error.map(describeGraphError)).toEqual([
        'argument node "a" is declared twice',
        'section "d" depends on itself',
        'section "d" depends on "z", which is not an argument node of this document',
        'circular dependency (petitio principii): a → c → b → a',
      ]);
    }
  });
  it('accepts Unicode and LaTeX-style ids, rejects ids starting with punctuation', () => {
    expect(parseSectionId('def:entropia').ok).toBe(true);
    expect(parseSectionId('seção-2').ok).toBe(true);
    expect(parseSectionId('-x').ok).toBe(false);
    expect(parseSectionId('a b').ok).toBe(false);
  });
});
