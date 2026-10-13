/**
 * Concept-map scene: layout + SVG markup of a set of concepts, built at BUILD
 * time and shared by the remark stage (`::concept-map`) and the views.
 *
 * Visual encoding (never colour alone, WCAG 1.4.1):
 *   node shape   = simplex glyph of the stratum (point, segment, triangle, tetrahedron)
 *   node colour  = --stratum-* token (redundant with shape and with the legend labels)
 *   broader edge = solid line with an arrowhead pointing to the more general concept
 *   related edge = dashed line, no arrowhead
 *   full map     = strata laid out as columns in reading order (philosophy → value),
 *                  the bridge of the site read left to right
 *
 * The markup works without JavaScript: every node is an SVG <a> to the concept
 * page with its label as accessible name, and a <details> lists every relation
 * as text. <ft-concept-map> adds pan/zoom, selection and filtering on top.
 */
import type { ConceptId } from '../domain/identifiers.ts';
import type { Locale } from '../domain/locale.ts';
import { STRATA, STRATUM_SPECS, type Stratum } from '../domain/strata.ts';
import { distancesFrom, edgesOf, neighbourhood, type ConceptGraph, type Edge } from './graph.ts';
import { forceLayout, type Layout, type LayoutNode, type Point } from './layout.ts';
import { el, type Markup, type MarkupElement } from './markup.ts';

/** Geometry of the drawing, in SVG user units. */
export const MAP_STYLE = {
  fontSize: 15,
  /** Average advance of a character as a fraction of the font size (Atkinson Hyperlegible Next ≈ 0.55). */
  charWidth: 0.56,
  glyph: 22,
  halo: 15,
  labelGap: 6,
  boxGap: 10,
  arrowGap: 4,
} as const;

/** Seed of the full map: Shannon's annus mirabilis. Any constant works; it only has to be fixed. */
export const FULL_MAP_SEED = 1948;

/** FNV-1a 32-bit hash (Fowler–Noll–Vo), used to derive a per-focus seed from an id. */
export const fnv1a = (s: string): number => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
};

export type MapKind = 'full' | 'local';

const labelBox = (graph: ConceptGraph, id: ConceptId) => {
  const e = graph.concepts.get(id);
  // The widest label over all locales: the layout is identical in every language.
  const chars = e === undefined ? 4 : Math.max(e.prefLabel['pt-BR'].length, e.prefLabel.en.length);
  const width = Math.max(MAP_STYLE.glyph, chars * MAP_STYLE.fontSize * MAP_STYLE.charWidth);
  const height = MAP_STYLE.glyph + MAP_STYLE.labelGap + MAP_STYLE.fontSize;
  return { width, height, dx: 0, dy: height / 2 - MAP_STYLE.glyph / 2 };
};

/**
 * Columns of the full map: one per stratum, in bridge order, each as wide as
 * its share of the concepts (a stratum with more concepts gets more room), with
 * a small gutter. Returns centre and half-width as fractions of the frame.
 */
export const strataColumns = (
  graph: ConceptGraph,
  ids: readonly ConceptId[],
): Readonly<Record<Stratum, { readonly center: number; readonly spread: number }>> => {
  const counts = STRATA.map((s) => ids.filter((id) => graph.concepts.get(id)?.stratum === s).length);
  const total = Math.max(1, counts.reduce((a, b) => a + b, 0));
  const gutter = 0.015;
  let start = 0;
  const out = {} as Record<Stratum, { readonly center: number; readonly spread: number }>;
  STRATA.forEach((s, i) => {
    const share = (counts[i] ?? 0) / total;
    out[s] = { center: start + share / 2, spread: Math.max(0, share / 2 - gutter) };
    start += share;
  });
  return out;
};

/** Lays out `ids` (and the edges among them). Full maps band strata as columns; local maps pin the focus. */
export const layoutConcepts = (
  graph: ConceptGraph,
  ids: readonly ConceptId[],
  kind: MapKind,
  focus: ConceptId | null = null,
): Layout<ConceptId> => {
  const within = new Set(ids);
  const edges = edgesOf(graph, within);
  const n = Math.max(1, ids.length);
  const width = kind === 'full' ? 1280 : Math.min(880, 260 + 90 * n);
  const height = kind === 'full' ? 820 : Math.min(560, 200 + 60 * n);
  const bands = kind === 'full' ? strataColumns(graph, ids) : null;
  const nodes: LayoutNode<ConceptId>[] = ids.map((id) => {
    const e = graph.concepts.get(id);
    const column = bands !== null && e !== undefined ? bands[e.stratum] : undefined;
    const pin: Point | undefined = kind === 'local' && id === focus ? { x: width / 2, y: height / 2 } : undefined;
    return {
      id,
      box: labelBox(graph, id),
      ...(column === undefined ? {} : { band: column.center, spread: column.spread }),
      ...(pin === undefined ? {} : { pin }),
    };
  });
  return forceLayout(
    nodes,
    edges.map((e) => ({ source: e.source, target: e.target, weight: e.kind === 'broader' ? 1 : 0.5 })),
    {
      width,
      height,
      seed: kind === 'full' ? FULL_MAP_SEED : fnv1a(focus ?? ids.join(',')),
      iterations: 600,
      tolerance: 0.002,
      bandAxis: 'x',
      bandStrength: kind === 'full' ? 0.5 : 0,
      idealLength: kind === 'full' ? 72 : 88,
      gravity: kind === 'full' ? 0.06 : 0.08,
      padding: 24,
      confine: false,
      overlapSweeps: 60,
      gap: MAP_STYLE.boxGap,
    },
  );
};

export interface MapText {
  readonly title: string;
  readonly instructions: string;
  readonly toolbar: string;
  readonly zoomIn: string;
  readonly zoomOut: string;
  readonly reset: string;
  readonly legend: string;
  readonly legendBroader: string;
  readonly legendRelated: string;
  readonly relations: string;
  readonly relationBroader: (a: string, b: string) => string;
  readonly relationRelated: (a: string, b: string) => string;
  readonly strata: Readonly<Record<Stratum, string>>;
  /** Optional visible caption (the label of a ::concept-map directive, or a generated one). */
  readonly caption?: string;
}

export interface SceneInput {
  readonly graph: ConceptGraph;
  readonly locale: Locale;
  readonly ids: readonly ConceptId[];
  readonly layout: Layout<ConceptId>;
  readonly kind: MapKind;
  readonly focus: ConceptId | null;
  /** Base-aware URL of a concept page in `locale`. */
  readonly href: (id: ConceptId) => string;
  /** Unique prefix for element ids (several maps may share a page). */
  readonly idPrefix: string;
  readonly text: MapText;
}

/** Shortens segment p→q by `a` at p and `b` at q (so lines start and end at the node halos). */
export const trimSegment = (p: Point, q: Point, a: number, b: number): readonly [Point, Point] | null => {
  const dx = q.x - p.x;
  const dy = q.y - p.y;
  const d = Math.hypot(dx, dy);
  if (d <= a + b) return null;
  const ux = dx / d;
  const uy = dy / d;
  return [
    { x: p.x + ux * a, y: p.y + uy * a },
    { x: q.x - ux * b, y: q.y - uy * b },
  ];
};

const labelOf = (graph: ConceptGraph, id: ConceptId, locale: Locale): string => graph.concepts.get(id)?.prefLabel[locale] ?? id;

const edgeMarkup = (input: SceneInput, e: Edge): MarkupElement | null => {
  const p = input.layout.positions.get(e.source);
  const q = input.layout.positions.get(e.target);
  if (p === undefined || q === undefined) return null;
  const tail = MAP_STYLE.halo;
  const head = MAP_STYLE.halo + (e.kind === 'broader' ? MAP_STYLE.arrowGap : 0);
  const seg = trimSegment(p, q, tail, head);
  if (seg === null) return null;
  const [a, b] = seg;
  return el('line', {
    class: `cmap-edge cmap-edge--${e.kind}`,
    x1: a.x,
    y1: a.y,
    x2: b.x,
    y2: b.y,
    'data-source': e.source,
    'data-target': e.target,
    'marker-end': e.kind === 'broader' ? `url(#${input.idPrefix}-arrow)` : null,
  });
};

const nodeMarkup = (input: SceneInput, id: ConceptId, distance: number | undefined): MarkupElement | null => {
  const p = input.layout.positions.get(id);
  const e = input.graph.concepts.get(id);
  if (p === undefined || e === undefined) return null;
  const spec = STRATUM_SPECS[e.stratum];
  const g = MAP_STYLE.glyph;
  return el(
    'a',
    {
      class: `cmap-node cmap-node--${e.stratum}${id === input.focus ? ' is-focus' : ''}`,
      href: input.href(id),
      transform: `translate(${String(p.x)} ${String(p.y)})`,
      'data-id': id,
      'data-stratum': e.stratum,
      'data-distance': distance,
    },
    el('circle', { class: 'cmap-node__halo', r: MAP_STYLE.halo }),
    el('use', { class: 'cmap-node__glyph', href: `#${spec.glyph}`, x: -g / 2, y: -g / 2, width: g, height: g }),
    el('text', { class: 'cmap-node__label', y: MAP_STYLE.halo + MAP_STYLE.labelGap + MAP_STYLE.fontSize * 0.8, 'text-anchor': 'middle' }, e.prefLabel[input.locale]),
  );
};

const legendMarkup = (input: SceneInput): Markup =>
  el(
    'div',
    { class: 'cmap__legend ui' },
    el('p', { class: 'cmap__legend-title' }, input.text.legend),
    el(
      'ul',
      { class: 'cmap__legend-list', role: 'list' },
      ...STRATA.map((s) =>
        el(
          'li',
          { class: `cmap__legend-item cmap-node--${s}` },
          el(
            'svg',
            { class: 'glyph', viewBox: '0 0 24 24', 'aria-hidden': 'true', focusable: 'false' },
            el('use', { href: `#${STRATUM_SPECS[s].glyph}` }),
          ),
          el('span', {}, input.text.strata[s]),
        ),
      ),
      el(
        'li',
        { class: 'cmap__legend-item' },
        el(
          'svg',
          { class: 'cmap__legend-line', viewBox: '0 0 32 12', 'aria-hidden': 'true', focusable: 'false' },
          el('line', { class: 'cmap-edge cmap-edge--broader', x1: 2, y1: 6, x2: 24, y2: 6, 'marker-end': `url(#${input.idPrefix}-arrow)` }),
        ),
        el('span', {}, input.text.legendBroader),
      ),
      el(
        'li',
        { class: 'cmap__legend-item' },
        el(
          'svg',
          { class: 'cmap__legend-line', viewBox: '0 0 32 12', 'aria-hidden': 'true', focusable: 'false' },
          el('line', { class: 'cmap-edge cmap-edge--related', x1: 2, y1: 6, x2: 30, y2: 6 }),
        ),
        el('span', {}, input.text.legendRelated),
      ),
    ),
  );

/** The relations of the map as a text list (the non-visual equivalent of the edges). */
const relationsMarkup = (input: SceneInput, edges: readonly Edge[]): Markup =>
  el(
    'details',
    { class: 'cmap__relations ui' },
    el('summary', {}, input.text.relations),
    el(
      'ul',
      {},
      ...edges.map((e) => {
        const a = labelOf(input.graph, e.source, input.locale);
        const b = labelOf(input.graph, e.target, input.locale);
        return el('li', {}, e.kind === 'broader' ? input.text.relationBroader(a, b) : input.text.relationRelated(a, b));
      }),
    ),
  );

/** The complete <ft-concept-map> widget for a set of concepts. */
export const conceptMapMarkup = (input: SceneInput): MarkupElement => {
  const within = new Set(input.ids);
  const edges = edgesOf(input.graph, within);
  const distances = input.focus === null ? new Map<ConceptId, number>() : distancesFrom(input.graph, input.focus, input.ids.length);
  const { width, height } = input.layout;
  const pfx = input.idPrefix;
  const ordered = [...input.ids].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return el(
    'ft-concept-map',
    { class: `cmap cmap--${input.kind}`, 'data-map-id': pfx, 'data-focus': input.focus },
    el(
      'div',
      { class: 'cmap__toolbar ui', role: 'toolbar', 'aria-label': input.text.toolbar, hidden: true },
      el('button', { type: 'button', class: 'cmap__button', 'data-cmap-action': 'zoom-in' }, input.text.zoomIn),
      el('button', { type: 'button', class: 'cmap__button', 'data-cmap-action': 'zoom-out' }, input.text.zoomOut),
      el('button', { type: 'button', class: 'cmap__button', 'data-cmap-action': 'reset' }, input.text.reset),
    ),
    el('p', { class: 'cmap__help ui', id: `${pfx}-help`, hidden: true }, input.text.instructions),
    el(
      'div',
      { class: 'cmap__viewport' },
      el(
        'svg',
        {
          class: 'cmap__svg',
          viewBox: `0 0 ${String(width)} ${String(height)}`,
          width,
          height,
          role: 'group',
          'aria-labelledby': `${pfx}-title`,
        },
        el('title', { id: `${pfx}-title` }, input.text.title),
        el(
          'defs',
          {},
          el(
            'marker',
            {
              id: `${pfx}-arrow`,
              viewBox: '0 0 10 10',
              refX: 9,
              refY: 5,
              markerWidth: 7,
              markerHeight: 7,
              orient: 'auto-start-reverse',
              markerUnits: 'userSpaceOnUse',
            },
            el('path', { class: 'cmap__arrow', d: 'M0 0 10 5 0 10z' }),
          ),
        ),
        el('g', { class: 'cmap__edges', 'aria-hidden': 'true' }, ...edges.map((e) => edgeMarkup(input, e)).filter((m): m is MarkupElement => m !== null)),
        el(
          'g',
          { class: 'cmap__nodes' },
          ...ordered.map((id) => nodeMarkup(input, id, distances.get(id))).filter((m): m is MarkupElement => m !== null),
        ),
      ),
    ),
    input.text.caption === undefined ? null : el('p', { class: 'cmap__caption ui' }, input.text.caption),
    el('p', { class: 'cmap__status visually-hidden', role: 'status', 'aria-live': 'polite' }),
    legendMarkup(input),
    relationsMarkup(input, edges),
  );
};

/** Ids of a local map: the neighbourhood of `focus` within `depth` steps. */
export const localMapIds = (graph: ConceptGraph, focus: ConceptId, depth: number): readonly ConceptId[] =>
  neighbourhood(graph, focus, depth);
