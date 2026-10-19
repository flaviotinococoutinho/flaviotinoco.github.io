/**
 * Concept-map scene: layout + SVG markup of a set of concepts, built at BUILD
 * time and shared by the remark stage (`::concept-map`) and the views.
 *
 * Visual encoding (never colour alone, WCAG 1.4.1):
 *   node shape     = simplex glyph of the stratum (point, segment, triangle, tetrahedron)
 *   node colour    = --stratum-* token (redundant with shape and with the legend labels)
 *   edge type      = line pattern + end marker, named in the legend and listed as text:
 *                    broader solid with an arrow to the more general concept; partOf
 *                    solid with a diamond at the whole (UML aggregation); dependsOn,
 *                    formalizes, appliesTo, measures dashed/dotted with arrows;
 *                    contrastsWith and related (symmetric) without markers
 *   full map       = strata as columns in reading order (philosophy → value), the
 *                    bridge read left to right; an alternative category × stratum grid
 *                    (data-gx / data-gy) the island can switch to
 *
 * The markup works without JavaScript: every node is an SVG <a> to the concept
 * page with its label as accessible name, and a <details> lists every relation
 * as text. <ft-concept-map> adds pan/zoom, selection, filtering and search.
 */
import type { ConceptId } from '../domain/identifiers.ts';
import type { Locale } from '../domain/locale.ts';
import { STRATA, STRATUM_SPECS, type Stratum } from '../domain/strata.ts';
import { distancesFrom, edgesOf, neighbourhood, type ConceptGraph, type Link } from './graph.ts';
import { forceLayout, type Layout, type LayoutNode, type Point } from './layout.ts';
import { el, formatCoordinate, type Markup, type MarkupElement } from './markup.ts';
import { CATEGORY_DISPLAY_ORDER, RELATION_TYPES, RELATIONS, type Category, type RelationType } from './vocabulary.ts';

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

/** Attraction of each relation type in the force layout: hierarchy binds tighter than association. */
export const LAYOUT_WEIGHT: Readonly<Record<RelationType, number>> = {
  broader: 1,
  partOf: 0.8,
  dependsOn: 0.6,
  formalizes: 0.6,
  appliesTo: 0.5,
  measures: 0.6,
  contrastsWith: 0.4,
  related: 0.3,
};

/** End marker of each relation type ('arrow' at the target, 'diamond' at the whole, none for symmetric types). */
export const MARKER: Readonly<Record<RelationType, 'arrow' | 'diamond' | null>> = {
  broader: 'arrow',
  partOf: 'diamond',
  dependsOn: 'arrow',
  formalizes: 'arrow',
  appliesTo: 'arrow',
  measures: 'arrow',
  contrastsWith: null,
  related: null,
};

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

/** Width of the label of a concept: the widest label over all locales, so the layout is the same in every language. */
const labelWidth = (graph: ConceptGraph, id: ConceptId): number => {
  const e = graph.concepts.get(id);
  const chars = e === undefined ? 4 : Math.max(e.prefLabel['pt-BR'].length, e.prefLabel.en.length);
  return Math.max(MAP_STYLE.glyph, chars * MAP_STYLE.fontSize * MAP_STYLE.charWidth);
};

const labelBox = (graph: ConceptGraph, id: ConceptId) => {
  const height = MAP_STYLE.glyph + MAP_STYLE.labelGap + MAP_STYLE.fontSize;
  return { width: labelWidth(graph, id), height, dx: 0, dy: height / 2 - MAP_STYLE.glyph / 2 };
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
  const width = kind === 'full' ? 1440 : Math.min(880, 260 + 90 * n);
  const height = kind === 'full' ? 900 : Math.min(560, 200 + 60 * n);
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
    edges.map((e) => ({ source: e.source, target: e.target, weight: LAYOUT_WEIGHT[e.type] })),
    {
      width,
      height,
      seed: kind === 'full' ? FULL_MAP_SEED : fnv1a(focus ?? ids.join(',')),
      iterations: 600,
      tolerance: 0.002,
      bandAxis: 'x',
      bandStrength: kind === 'full' ? 0.5 : 0,
      idealLength: kind === 'full' ? 74 : 92,
      gravity: kind === 'full' ? 0.06 : 0.08,
      padding: 24,
      confine: false,
      overlapSweeps: 80,
      gap: MAP_STYLE.boxGap,
    },
  );
};

// ─── Category × stratum grid ────────────────────────────────────────────────

export interface GridLayout {
  readonly positions: ReadonlyMap<ConceptId, Point>;
  readonly width: number;
  readonly height: number;
  /** Centre of each column header (strata) and of each row header (categories present). */
  readonly columns: readonly { readonly stratum: Stratum; readonly x: number }[];
  readonly rows: readonly { readonly category: Category; readonly y: number }[];
  /** Left edge of the first column (the row headers sit to its left). */
  readonly gridLeft: number;
  readonly gridTop: number;
}

/**
 * Deterministic 2-D grid of the two top-level axes: columns = strata in bridge
 * order, rows = categories (only those with members) in display order; inside a
 * cell, concepts are stacked by id. Column widths fit the widest label of the
 * column; row heights fit the fullest cell of the row.
 */
export const gridLayout = (graph: ConceptGraph, ids: readonly ConceptId[], rowHeader = 140): GridLayout => {
  const slot = MAP_STYLE.glyph + MAP_STYLE.labelGap + MAP_STYLE.fontSize + MAP_STYLE.boxGap + 8;
  const pad = 24;
  const head = 40;
  const sorted = [...ids].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const cell = (s: Stratum, c: Category): readonly ConceptId[] =>
    sorted.filter((id) => {
      const e = graph.concepts.get(id);
      return e !== undefined && e.stratum === s && e.category === c;
    });
  const categories = CATEGORY_DISPLAY_ORDER.filter((c) => STRATA.some((s) => cell(s, c).length > 0));
  const colWidth = STRATA.map(
    (s) => Math.max(120, ...sorted.filter((id) => graph.concepts.get(id)?.stratum === s).map((id) => labelWidth(graph, id))) + 24,
  );
  const rowHeight = categories.map((c) => Math.max(1, ...STRATA.map((s) => cell(s, c).length)) * slot);
  const gridLeft = pad + rowHeader;
  const gridTop = pad + head;
  const colX: number[] = [];
  let x = gridLeft;
  for (const w of colWidth) {
    colX.push(x + w / 2);
    x += w;
  }
  const rowY: number[] = [];
  let y = gridTop;
  for (const h of rowHeight) {
    rowY.push(y);
    y += h;
  }
  const positions = new Map<ConceptId, Point>();
  categories.forEach((c, r) => {
    STRATA.forEach((s, k) => {
      cell(s, c).forEach((id, i) => {
        positions.set(id, { x: colX[k] ?? 0, y: (rowY[r] ?? 0) + slot * i + MAP_STYLE.halo + 4 });
      });
    });
  });
  return {
    positions,
    width: Math.round(x + pad),
    height: Math.round(y + pad),
    columns: STRATA.map((stratum, k) => ({ stratum, x: colX[k] ?? 0 })),
    rows: categories.map((category, r) => ({ category, y: (rowY[r] ?? 0) + (rowHeight[r] ?? 0) / 2 })),
    gridLeft,
    gridTop,
  };
};

// ─── Markup ────────────────────────────────────────────────────────────────

export interface MapText {
  readonly title: string;
  readonly instructions: string;
  readonly toolbar: string;
  readonly zoomIn: string;
  readonly zoomOut: string;
  readonly reset: string;
  readonly legend: string;
  /** Legend entry of each relation type. */
  readonly relationLegend: Readonly<Record<RelationType, string>>;
  readonly relations: string;
  /** "a — formalizes → b" sentences for the text list of relations. */
  readonly relationSentence: (type: RelationType, a: string, b: string) => string;
  readonly strata: Readonly<Record<Stratum, string>>;
  readonly categories: Readonly<Record<Category, string>>;
  /** Optional visible caption (the label of a ::concept-map directive, or a generated one). */
  readonly caption?: string;
  /** Controls of the full explorer (filters, search, layout switch); omitted on local maps. */
  readonly explorer?: {
    readonly filterLabel: string;
    readonly searchLabel: string;
    readonly layoutLabel: string;
    readonly layoutForce: string;
    readonly layoutGrid: string;
  };
}

export interface SceneInput {
  readonly graph: ConceptGraph;
  readonly locale: Locale;
  readonly ids: readonly ConceptId[];
  readonly layout: Layout<ConceptId>;
  /** Category × stratum positions (full map only). */
  readonly grid?: GridLayout;
  readonly kind: MapKind;
  readonly focus: ConceptId | null;
  /** Base-aware URL of a concept page in `locale`. */
  readonly href: (id: ConceptId) => string;
  /** Unique prefix for element ids (several maps may share a page). */
  readonly idPrefix: string;
  readonly text: MapText;
  /** Base-aware URL of /ontology.graph.json, for the explorer's detail and search data. */
  readonly graphUrl?: string;
  /** Extra data-* attributes for the <ft-concept-map> element (e.g. localised island messages). */
  readonly data?: Readonly<Record<`data-${string}`, string>>;
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

/** End points of an edge between two node centres, trimmed to the halos (and the marker gap at the head). */
export const edgeEnds = (p: Point, q: Point, type: RelationType): readonly [Point, Point] | null =>
  trimSegment(p, q, MAP_STYLE.halo, MAP_STYLE.halo + (MARKER[type] === null ? 0 : MAP_STYLE.arrowGap));

const labelOf = (graph: ConceptGraph, id: ConceptId, locale: Locale): string => graph.concepts.get(id)?.prefLabel[locale] ?? id;

const markerId = (pfx: string, marker: 'arrow' | 'diamond'): string => `${pfx}-${marker}`;

const edgeMarkup = (input: SceneInput, e: Link): MarkupElement | null => {
  const p = input.layout.positions.get(e.source);
  const q = input.layout.positions.get(e.target);
  if (p === undefined || q === undefined) return null;
  const seg = edgeEnds(p, q, e.type);
  if (seg === null) return null;
  const [a, b] = seg;
  const marker = MARKER[e.type];
  return el('line', {
    class: 'cmap-edge',
    x1: a.x,
    y1: a.y,
    x2: b.x,
    y2: b.y,
    'data-source': e.source,
    'data-target': e.target,
    'data-type': e.type,
    'marker-end': marker === null ? null : `url(#${markerId(input.idPrefix, marker)})`,
  });
};

const nodeMarkup = (input: SceneInput, id: ConceptId, distance: number | undefined): MarkupElement | null => {
  const p = input.layout.positions.get(id);
  const e = input.graph.concepts.get(id);
  if (p === undefined || e === undefined) return null;
  const spec = STRATUM_SPECS[e.stratum];
  const g = MAP_STYLE.glyph;
  const gp = input.grid?.positions.get(id);
  return el(
    'a',
    {
      class: id === input.focus ? 'cmap-node is-focus' : 'cmap-node',
      href: input.href(id),
      transform: `translate(${formatCoordinate(p.x)} ${formatCoordinate(p.y)})`,
      'data-id': id,
      'data-stratum': e.stratum,
      'data-distance': distance,
      'data-gx': gp?.x,
      'data-gy': gp?.y,
    },
    el('circle', { class: 'cmap-node__halo', r: MAP_STYLE.halo }),
    el('use', { class: 'cmap-node__glyph', href: `#${spec.glyph}`, x: -g / 2, y: -g / 2, width: g, height: g }),
    el(
      'text',
      { class: 'cmap-node__label', y: MAP_STYLE.halo + MAP_STYLE.labelGap + MAP_STYLE.fontSize * 0.8, 'text-anchor': 'middle' },
      e.prefLabel[input.locale],
    ),
  );
};

const markerDefs = (pfx: string): MarkupElement =>
  el(
    'defs',
    {},
    el(
      'marker',
      {
        id: markerId(pfx, 'arrow'),
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
    el(
      'marker',
      {
        id: markerId(pfx, 'diamond'),
        viewBox: '0 0 12 8',
        refX: 11,
        refY: 4,
        markerWidth: 12,
        markerHeight: 8,
        orient: 'auto-start-reverse',
        markerUnits: 'userSpaceOnUse',
      },
      el('path', { class: 'cmap__diamond', d: 'M0 4 6 0 12 4 6 8z' }),
    ),
  );

const legendLine = (pfx: string, type: RelationType): MarkupElement => {
  const marker = MARKER[type];
  return el(
    'svg',
    { class: 'cmap__legend-line', viewBox: '0 0 36 12', 'aria-hidden': 'true', focusable: 'false' },
    markerDefs(`${pfx}-legend-${type}`),
    el('line', {
      class: 'cmap-edge',
      'data-type': type,
      x1: 2,
      y1: 6,
      x2: marker === null ? 34 : 26,
      y2: 6,
      'marker-end': marker === null ? null : `url(#${markerId(`${pfx}-legend-${type}`, marker)})`,
    }),
  );
};

const legendMarkup = (input: SceneInput, types: readonly RelationType[]): Markup =>
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
          { class: 'cmap__legend-item', 'data-stratum': s },
          el('svg', { class: 'glyph', viewBox: '0 0 24 24', 'aria-hidden': 'true', focusable: 'false' }, el('use', { href: `#${STRATUM_SPECS[s].glyph}` })),
          el('span', {}, input.text.strata[s]),
        ),
      ),
      ...types.map((t) =>
        el('li', { class: 'cmap__legend-item', 'data-type': t }, legendLine(input.idPrefix, t), el('span', {}, input.text.relationLegend[t])),
      ),
    ),
  );

/** The relations of the map as a text list (the non-visual equivalent of the edges). */
const relationsMarkup = (input: SceneInput, edges: readonly Link[]): Markup =>
  el(
    'details',
    { class: 'cmap__relations ui' },
    el('summary', {}, input.text.relations),
    el(
      'ul',
      {},
      ...edges.map((e) =>
        el(
          'li',
          { 'data-type': e.type },
          input.text.relationSentence(e.type, labelOf(input.graph, e.source, input.locale), labelOf(input.graph, e.target, input.locale)),
        ),
      ),
    ),
  );

const gridLabelsMarkup = (input: SceneInput, grid: GridLayout): MarkupElement =>
  el(
    'g',
    { class: 'cmap__grid-labels', 'aria-hidden': 'true' },
    ...grid.columns.map((c) =>
      el('text', { class: 'cmap__grid-head', 'data-stratum': c.stratum, x: c.x, y: grid.gridTop - 16, 'text-anchor': 'middle' }, input.text.strata[c.stratum]),
    ),
    ...grid.rows.map((r) =>
      el('text', { class: 'cmap__grid-row', x: grid.gridLeft - 12, y: r.y, 'text-anchor': 'end' }, input.text.categories[r.category]),
    ),
  );

const toolbarMarkup = (input: SceneInput): MarkupElement => {
  const ex = input.text.explorer;
  const pfx = input.idPrefix;
  return el(
    'div',
    { class: 'cmap__toolbar ui', role: 'toolbar', 'aria-label': input.text.toolbar, hidden: true },
    el(
      'div',
      { class: 'cmap__group' },
      el('button', { type: 'button', class: 'cmap__button', 'data-cmap-action': 'zoom-in' }, input.text.zoomIn),
      el('button', { type: 'button', class: 'cmap__button', 'data-cmap-action': 'zoom-out' }, input.text.zoomOut),
      el('button', { type: 'button', class: 'cmap__button', 'data-cmap-action': 'reset' }, input.text.reset),
    ),
    ex === undefined
      ? null
      : el(
          'div',
          { class: 'cmap__group', role: 'group', 'aria-label': ex.layoutLabel },
          el('button', { type: 'button', class: 'cmap__button', 'data-cmap-layout': 'force', 'aria-pressed': 'true' }, ex.layoutForce),
          el('button', { type: 'button', class: 'cmap__button', 'data-cmap-layout': 'grid', 'aria-pressed': 'false' }, ex.layoutGrid),
        ),
    ex === undefined
      ? null
      : el(
          'div',
          { class: 'cmap__group cmap__filters', role: 'group', 'aria-label': ex.filterLabel },
          ...STRATA.map((s) =>
            el(
              'button',
              { type: 'button', class: 'cmap__button cmap__filter', 'data-stratum': s, 'data-cmap-filter': s, 'aria-pressed': 'true' },
              el('svg', { class: 'glyph', viewBox: '0 0 24 24', 'aria-hidden': 'true', focusable: 'false' }, el('use', { href: `#${STRATUM_SPECS[s].glyph}` })),
              el('span', {}, input.text.strata[s]),
            ),
          ),
        ),
    ex === undefined
      ? null
      : el(
          'div',
          { class: 'cmap__group cmap__search' },
          el('label', { for: `${pfx}-search` }, ex.searchLabel),
          el('input', { type: 'search', id: `${pfx}-search`, class: 'cmap__search-input', 'data-cmap-search': true, autocomplete: 'off', spellcheck: 'false' }),
        ),
  );
};

/** Relation types present among `edges`, in table order. */
export const typesOf = (edges: readonly Link[]): readonly RelationType[] => {
  const present = new Set(edges.map((e) => e.type));
  return RELATION_TYPES.filter((t) => present.has(t));
};

/** The complete <ft-concept-map> widget for a set of concepts. */
export const conceptMapMarkup = (input: SceneInput): MarkupElement => {
  const within = new Set(input.ids);
  const edges = edgesOf(input.graph, within);
  const distances = input.focus === null ? new Map<ConceptId, number>() : distancesFrom(input.graph, input.focus, input.ids.length);
  const { width, height } = input.layout;
  const pfx = input.idPrefix;
  const ordered = [...input.ids].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const grid = input.grid;
  return el(
    'ft-concept-map',
    {
      class: `cmap cmap--${input.kind}`,
      'data-map-id': pfx,
      'data-focus': input.focus,
      'data-graph': input.graphUrl,
      'data-grid-viewbox': grid === undefined ? null : `0 0 ${String(grid.width)} ${String(grid.height)}`,
      ...input.data,
    },
    toolbarMarkup(input),
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
        markerDefs(pfx),
        grid === undefined ? null : gridLabelsMarkup(input, grid),
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
    legendMarkup(input, typesOf(edges)),
    relationsMarkup(input, edges),
  );
};

/** Ids of a local map: the neighbourhood of `focus` within `depth` steps. */
export const localMapIds = (graph: ConceptGraph, focus: ConceptId, depth: number): readonly ConceptId[] =>
  neighbourhood(graph, focus, depth);

/** Relation types whose arrow points from the narrower/dependent end (used by the island to describe edges). */
export const DIRECTED_TYPES: readonly RelationType[] = RELATION_TYPES.filter((t) => !RELATIONS[t].symmetric);
