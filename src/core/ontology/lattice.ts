/**
 * Drawing of a concept lattice (Formal Concept Analysis, ./fca.ts) as a
 * static SVG, built at BUILD time.
 *
 * Layout: a layered drawing of the Hasse diagram (Sugiyama, Tagawa & Toda,
 * "Methods for visual understanding of hierarchical system structures", IEEE
 * SMC 11(2), 1981, simplified): the layer of a formal concept is the rank of
 * its intent size among the distinct sizes (the top concept, with the smallest
 * intent, on top), so every cover edge points downwards; inside a layer the
 * order minimises crossings heuristically by the barycentre of the neighbours
 * in the layer above, then below (two sweeps), ties broken by index. Labels
 * follow the reduced labelling of Ganter & Wille: attribute (concept) names
 * above the attribute concept μ(m), object (work) names below the object
 * concept γ(g); every concept below a label inherits it.
 *
 * The SVG is a picture (role="img"); its accessible, complete equivalent is the
 * list of formal concepts that follows it (extent and intent of each).
 */
import type { ConceptLattice } from './fca.ts';
import type { Point } from './layout.ts';
import { el, type MarkupElement } from './markup.ts';

export interface LatticeLayout {
  readonly positions: readonly Point[];
  readonly layers: readonly (readonly number[])[];
  readonly width: number;
  readonly height: number;
}

const GAP_X = 168;
const GAP_Y = 96;
const PAD = 72;

export const latticeLayout = <G extends string, M extends string>(lattice: ConceptLattice<G, M>): LatticeLayout => {
  const n = lattice.concepts.length;
  const sizes = [...new Set(lattice.concepts.map((c) => c.intent.length))].sort((a, b) => a - b);
  const layerOf = lattice.concepts.map((c) => sizes.indexOf(c.intent.length));
  const layers: number[][] = sizes.map(() => []);
  for (let i = 0; i < n; i += 1) layers[layerOf[i] as number]?.push(i);
  const up = new Map<number, number[]>();
  const down = new Map<number, number[]>();
  for (const [lower, upper] of lattice.covers) {
    up.set(lower, [...(up.get(lower) ?? []), upper]);
    down.set(upper, [...(down.get(upper) ?? []), lower]);
  }
  const rank = new Map<number, number>();
  const assign = () => {
    for (const layer of layers) layer.forEach((i, k) => rank.set(i, k));
  };
  assign();
  const barycentre = (i: number, neighbours: ReadonlyMap<number, readonly number[]>): number => {
    const ns = neighbours.get(i) ?? [];
    return ns.length === 0 ? (rank.get(i) ?? 0) : ns.reduce((s, j) => s + (rank.get(j) ?? 0), 0) / ns.length;
  };
  const sweep = (order: readonly number[], neighbours: ReadonlyMap<number, readonly number[]>) => {
    for (const l of order) {
      const layer = layers[l] ?? [];
      const keyed = layer.map((i) => ({ i, b: barycentre(i, neighbours) }));
      keyed.sort((a, b) => a.b - b.b || a.i - b.i);
      layers[l] = keyed.map((k) => k.i);
      assign();
    }
  };
  const topDown = layers.map((_, l) => l).slice(1);
  const bottomUp = layers.map((_, l) => l).reverse().slice(1);
  sweep(topDown, up);
  sweep(bottomUp, down);
  sweep(topDown, up);
  const widest = Math.max(1, ...layers.map((l) => l.length));
  const width = PAD * 2 + (widest - 1) * GAP_X;
  const height = PAD * 2 + Math.max(0, layers.length - 1) * GAP_Y;
  const positions: Point[] = Array.from({ length: n }, () => ({ x: 0, y: 0 }));
  layers.forEach((layer, l) => {
    const span = (layer.length - 1) * GAP_X;
    layer.forEach((i, k) => {
      positions[i] = { x: width / 2 - span / 2 + k * GAP_X, y: PAD + l * GAP_Y };
    });
  });
  return { positions, layers, width, height };
};

export interface LatticeText {
  readonly title: string;
  readonly description: string;
  readonly listSummary: string;
  readonly extentLabel: string;
  readonly intentLabel: string;
  readonly emptyExtent: string;
  readonly emptyIntent: string;
  /** "+3" style suffix when a label line is cut. */
  readonly more: (n: number) => string;
}

export interface LatticeInput<G extends string, M extends string> {
  readonly lattice: ConceptLattice<G, M>;
  readonly layout: LatticeLayout;
  readonly objectLabel: (g: G) => string;
  readonly attributeLabel: (m: M) => string;
  readonly objectHref: (g: G) => string;
  readonly attributeHref: (m: M) => string;
  readonly idPrefix: string;
  readonly text: LatticeText;
}

/** Joins labels into at most `lines` lines of about `width` characters, with a "+k" suffix for the rest. */
export const labelLines = (labels: readonly string[], width: number, lines: number, more: (n: number) => string): readonly string[] => {
  const out: string[] = [];
  let current = '';
  let used = 0;
  for (const label of labels) {
    const candidate = current === '' ? label : `${current}, ${label}`;
    if (candidate.length <= width || current === '') {
      current = candidate;
      used += 1;
      continue;
    }
    out.push(current);
    if (out.length === lines) break;
    current = label;
    used += 1;
  }
  if (out.length < lines && current !== '') out.push(current);
  const rest = labels.length - used;
  if (rest > 0 && out.length > 0) out[out.length - 1] = `${out[out.length - 1] ?? ''} ${more(rest)}`;
  return out;
};

export const latticeMarkup = <G extends string, M extends string>(input: LatticeInput<G, M>): readonly MarkupElement[] => {
  const { lattice, layout, text } = input;
  const pfx = input.idPrefix;
  const attrsAt = new Map<number, M[]>();
  const objsAt = new Map<number, G[]>();
  for (const [m, i] of lattice.attributeConcept) attrsAt.set(i, [...(attrsAt.get(i) ?? []), m]);
  for (const [g, i] of lattice.objectConcept) objsAt.set(i, [...(objsAt.get(i) ?? []), g]);
  const edges = lattice.covers.flatMap(([lower, upper]) => {
    const p = layout.positions[lower];
    const q = layout.positions[upper];
    return p === undefined || q === undefined ? [] : [el('line', { class: 'fca__edge', x1: p.x, y1: p.y, x2: q.x, y2: q.y })];
  });
  const nodes = lattice.concepts.map((_, i) => {
    const p = layout.positions[i] ?? { x: 0, y: 0 };
    const attrs = (attrsAt.get(i) ?? []).map(input.attributeLabel);
    const objs = (objsAt.get(i) ?? []).map(input.objectLabel);
    const attrLines = labelLines(attrs, 26, 2, text.more);
    const objLines = labelLines(objs, 26, 2, text.more);
    return el(
      'g',
      {
        class: `fca__node${attrs.length > 0 ? ' has-attributes' : ''}${objs.length > 0 ? ' has-objects' : ''}`,
        transform: `translate(${String(p.x)} ${String(p.y)})`,
        'data-index': i,
      },
      el('circle', { class: 'fca__dot', r: 7 }),
      el('path', { class: 'fca__half fca__half--top', d: 'M-7 0a7 7 0 0 1 14 0z' }),
      el('path', { class: 'fca__half fca__half--bottom', d: 'M-7 0a7 7 0 0 0 14 0z' }),
      ...attrLines.map((line, k) =>
        el('text', { class: 'fca__attrs', y: -14 - (attrLines.length - 1 - k) * 15, 'text-anchor': 'middle' }, line),
      ),
      ...objLines.map((line, k) => el('text', { class: 'fca__objs', y: 24 + k * 15, 'text-anchor': 'middle' }, line)),
    );
  });
  const figure = el(
    'figure',
    { class: 'fca' },
    el(
      'div',
      { class: 'fca__viewport' },
      el(
        'svg',
        {
          class: 'fca__svg',
          viewBox: `0 0 ${String(layout.width)} ${String(layout.height)}`,
          width: layout.width,
          height: layout.height,
          role: 'img',
          'aria-labelledby': `${pfx}-title ${pfx}-desc`,
        },
        el('title', { id: `${pfx}-title` }, text.title),
        el('desc', { id: `${pfx}-desc` }, text.description),
        el('g', { class: 'fca__edges' }, ...edges),
        el('g', { class: 'fca__nodes' }, ...nodes),
      ),
    ),
  );
  const list = el(
    'details',
    { class: 'fca__list ui' },
    el('summary', {}, text.listSummary),
    el(
      'ol',
      {},
      ...lattice.concepts.map((c) =>
        el(
          'li',
          {},
          el(
            'p',
            {},
            el('strong', {}, `${text.extentLabel}: `),
            ...(c.extent.length === 0
              ? [text.emptyExtent]
              : c.extent.flatMap((g, k) => [k === 0 ? '' : ', ', el('a', { href: input.objectHref(g) }, input.objectLabel(g))])),
          ),
          el(
            'p',
            {},
            el('strong', {}, `${text.intentLabel}: `),
            ...(c.intent.length === 0
              ? [text.emptyIntent]
              : c.intent.flatMap((m, k) => [k === 0 ? '' : ', ', el('a', { href: input.attributeHref(m) }, input.attributeLabel(m))])),
          ),
        ),
      ),
    ),
  );
  return [figure, list];
};
