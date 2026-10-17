/**
 * Geometry and drawing: layout determinism, scene markup, grid, tree,
 * spatial navigation, PRNG, markup serialisation.
 */
import { describe, expect, it } from 'vitest';
import { fc, test } from '@fast-check/vitest';
import { forceLayout } from '../../../src/core/ontology/layout.ts';
import { el, escapeAttribute, escapeText, formatCoordinate, renderMarkup, text, textContent } from '../../../src/core/ontology/markup.ts';
import { draw, mulberry32, seedOf } from '../../../src/core/ontology/prng.ts';
import {
  conceptMapMarkup,
  edgeEnds,
  fnv1a,
  gridLayout,
  layoutConcepts,
  localMapIds,
  strataColumns,
  trimSegment,
  typesOf,
  type MapText,
} from '../../../src/core/ontology/scene.ts';
import { nearestInDirection } from '../../../src/core/ontology/spatial.ts';
import { flattenTree, taxonomyTree } from '../../../src/core/ontology/tree.ts';
import { RELATION_TYPES } from '../../../src/core/ontology/vocabulary.ts';
import { cid, siteOntology } from './helpers.ts';

const o = siteOntology();

const TEXT: MapText = {
  title: 'Map',
  instructions: 'Use arrows',
  toolbar: 'Controls',
  zoomIn: '+',
  zoomOut: '−',
  reset: '0',
  legend: 'Legend',
  relationLegend: Object.fromEntries(RELATION_TYPES.map((t) => [t, `legend ${t}`])) as never,
  relations: 'Relations',
  relationSentence: (type, a, b) => `${a} ${type} ${b}`,
  strata: { philosophy: 'P', theory: 'T', formal: 'F', value: 'V' },
  categories: Object.fromEntries(['entity', 'quality', 'measure', 'relation', 'process', 'operation', 'proposition', 'method', 'artifact'].map((c) => [c, c.toUpperCase()])) as never,
  explorer: { filterLabel: 'Strata', searchLabel: 'Find', layoutLabel: 'Layout', layoutForce: 'Force', layoutGrid: 'Grid' },
};

describe('force-directed layout (Fruchterman & Reingold 1991)', () => {
  it('is deterministic for a seed and changes with the seed', () => {
    const nodes = ['a', 'b', 'c', 'd'].map((id) => ({ id }));
    const edges = [{ source: 'a', target: 'b' }, { source: 'b', target: 'c' }];
    const opts = { width: 400, height: 300, seed: 7, iterations: 200, tolerance: 0.001, padding: 10 };
    const one = forceLayout(nodes, edges, opts);
    const two = forceLayout([...nodes].reverse(), edges, opts);
    expect([...one.positions]).toEqual([...two.positions]);
    const other = forceLayout(nodes, edges, { ...opts, seed: 8 });
    expect([...other.positions]).not.toEqual([...one.positions]);
    for (const p of one.positions.values()) {
      expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(one.width);
    }
  });

  it('keeps pinned nodes and handles degenerate inputs', () => {
    const l = forceLayout([{ id: 'a', pin: { x: 5, y: 5 } }, { id: 'b' }], [], {
      width: 100,
      height: 100,
      seed: 1,
      iterations: 50,
      tolerance: 0,
      padding: 0,
      confine: true,
    });
    expect(l.positions.size).toBe(2);
    const empty = forceLayout([], [], { width: 10, height: 10, seed: 1, iterations: 5, tolerance: 0.1, padding: 2 });
    expect(empty.positions.size).toBe(0);
    expect(empty.converged).toBe(true);
  });

  it('lays the full map out with strata as ordered columns', () => {
    const layout = layoutConcepts(o.graph, o.graph.ids, 'full');
    const again = layoutConcepts(o.graph, o.graph.ids, 'full');
    expect([...layout.positions]).toEqual([...again.positions]);
    const meanX = (s: string) => {
      const xs = o.graph.ids.filter((id) => o.graph.concepts.get(id)?.stratum === s).map((id) => layout.positions.get(id)!.x);
      return xs.reduce((a, b) => a + b, 0) / xs.length;
    };
    expect(meanX('philosophy')).toBeLessThan(meanX('theory'));
    expect(meanX('theory')).toBeLessThan(meanX('formal'));
    expect(meanX('formal')).toBeLessThan(meanX('value'));
    const cols = strataColumns(o.graph, o.graph.ids);
    expect(cols.philosophy.center).toBeLessThan(cols.value.center);
  });
});

describe('scene markup', () => {
  const ids = localMapIds(o.graph, cid('entropy'), 1);
  const markup = conceptMapMarkup({
    graph: o.graph,
    locale: 'en',
    ids,
    layout: layoutConcepts(o.graph, ids, 'local', cid('entropy')),
    kind: 'local',
    focus: cid('entropy'),
    href: (id) => `/en/concepts/${id}/`,
    idPrefix: 'cm-test',
    text: { ...TEXT, explorer: undefined } as never,
  });
  const html = renderMarkup(markup);

  it('renders one linked node per concept and one edge per link, typed', () => {
    for (const id of ids) expect(html).toContain(`data-id="${id}"`);
    expect(html).toContain('href="/en/concepts/entropy/"');
    expect(html).toContain('class="cmap-node cmap-node--theory is-focus"');
    expect(html).toContain('data-type="broader"');
    expect(html).toContain('marker-end="url(#cm-test-arrow)"');
    expect(html).not.toContain('data-cmap-search');
  });

  it('lists every relation as text (non-visual equivalent of the edges)', () => {
    const t = textContent(markup);
    expect(t).toContain('Entropy broader Information');
    expect(t).toContain('Entropy formalizes Uncertainty');
  });

  it('offers explorer controls and grid positions on the full map', () => {
    const grid = gridLayout(o.graph, o.graph.ids);
    const full = renderMarkup(
      conceptMapMarkup({
        graph: o.graph,
        locale: 'pt-BR',
        ids: o.graph.ids,
        layout: layoutConcepts(o.graph, o.graph.ids, 'full'),
        grid,
        kind: 'full',
        focus: null,
        href: (id) => `/pt/c/${id}/`,
        idPrefix: 'cm-full',
        text: TEXT,
        graphUrl: '/base/ontology.graph.json',
      }),
    );
    expect(full).toContain('data-cmap-search');
    expect(full).toContain('data-cmap-filter="philosophy"');
    expect(full).toContain('data-graph="/base/ontology.graph.json"');
    expect(full).toContain(`data-grid-viewbox="0 0 ${String(grid.width)} ${String(grid.height)}"`);
    expect(typesOf(o.graph.links)).toEqual(RELATION_TYPES);
  });

  it('places the grid by category rows and stratum columns, without collisions', () => {
    const grid = gridLayout(o.graph, o.graph.ids);
    const keys = [...grid.positions.values()].map((p) => `${String(p.x)},${String(p.y)}`);
    expect(new Set(keys).size).toBe(o.graph.ids.length);
    const x = (s: string) => grid.columns.find((c) => c.stratum === s)!.x;
    for (const id of o.graph.ids) expect(grid.positions.get(id)!.x).toBe(x(o.graph.concepts.get(id)!.stratum));
  });

  it('trims edges to the node halos', () => {
    expect(trimSegment({ x: 0, y: 0 }, { x: 10, y: 0 }, 6, 6)).toBeNull();
    expect(trimSegment({ x: 0, y: 0 }, { x: 100, y: 0 }, 10, 20)).toEqual([
      { x: 10, y: 0 },
      { x: 80, y: 0 },
    ]);
    expect(edgeEnds({ x: 0, y: 0 }, { x: 100, y: 0 }, 'related')?.[1].x).toBeGreaterThan(edgeEnds({ x: 0, y: 0 }, { x: 100, y: 0 }, 'broader')![1].x);
    expect(fnv1a('entropy')).toBe(fnv1a('entropy'));
  });
});

describe('taxonomy tree', () => {
  for (const locale of ['pt-BR', 'en'] as const) {
    it(`has the categories on top and every concept below (${locale})`, () => {
      const forest = taxonomyTree(o.graph, locale);
      expect(forest.every((n) => n.kind === 'category' && n.level === 1)).toBe(true);
      const concepts = flattenTree(forest).flatMap((n) => (n.kind === 'concept' ? [n.id] : []));
      expect([...new Set(concepts)].sort()).toEqual([...o.graph.ids].sort());
      for (const n of flattenTree(forest)) for (const c of n.children) expect(c.level).toBe(n.level + 1);
    });
  }
});

describe('spatial navigation', () => {
  const positions = new Map([
    ['c', { x: 0, y: 0 }],
    ['r', { x: 10, y: 1 }],
    ['far', { x: 30, y: 0 }],
    ['u', { x: 0, y: -10 }],
    ['diag', { x: 5, y: 9 }],
  ]);
  it('chooses the best candidate in the pressed direction', () => {
    expect(nearestInDirection(positions, 'c', 'right')).toBe('r');
    expect(nearestInDirection(positions, 'c', 'up')).toBe('u');
    expect(nearestInDirection(positions, 'c', 'left')).toBeNull();
    expect(nearestInDirection(positions, 'c', 'right', (id) => id !== 'r')).toBe('far');
    expect(nearestInDirection(positions, 'zzz', 'right')).toBeNull();
  });
});

describe('PRNG (Mulberry32) and markup', () => {
  test.prop([fc.integer()])('is a pure state transition in [0, 1)', (seed) => {
    const [a] = draw(mulberry32, seedOf(seed), 5);
    const [b] = draw(mulberry32, seedOf(seed), 5);
    expect(a).toEqual(b);
    for (const v of a) expect(v >= 0 && v < 1).toBe(true);
    expect(seedOf(Number.NaN)).toBe(0);
  });

  test.prop([fc.string()])('escapes text injectively (decode ∘ escape = id)', (s) => {
    const decode = (x: string) => x.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
    expect(decode(escapeText(s))).toBe(s);
    expect(decode(escapeAttribute(s))).toBe(s);
  });

  it('serialises HTML and SVG differently', () => {
    expect(renderMarkup(el('p', { class: 'x', hidden: true, gone: null }, 'a < b'))).toBe('<p class="x" hidden>a &lt; b</p>');
    expect(renderMarkup(el('svg', { viewBox: '0 0 1 1' }, el('circle', { r: 1.234 })))).toBe('<svg viewBox="0 0 1 1"><circle r="1.23" /></svg>');
    expect(renderMarkup(el('input', { type: 'search' }))).toBe('<input type="search">');
    expect(formatCoordinate(-0.001)).toBe('0');
    expect(textContent(el('p', {}, text('a'), el('b', {}, 'c')))).toBe('ac');
  });
});
