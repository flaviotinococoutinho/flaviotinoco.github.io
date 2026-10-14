/**
 * Geometry of the argument map: the layered layout (layout.ts) scaled to an
 * SVG drawing, with edges as smooth vertical curves, arrowheads pointing at the
 * section that rests on a dependency, and labels abbreviated to fit their
 * column. Pure data for src/components/reading/ArgumentMap.astro, so the
 * component only prints it.
 */
import { err, ok, type Result } from '../algebra/result.ts';
import { isArgumentKind, type ArgumentKind } from './argument.ts';
import { layoutDag, type Point } from './layout.ts';

export interface MapNodeInput {
  readonly id: string;
  readonly kind: string;
  readonly title: string;
}
export interface MapInput {
  readonly nodes: readonly MapNodeInput[];
  readonly edges: readonly { readonly from: string; readonly to: string }[];
}

export interface MapOptions {
  /** View-box width (SVG user units). */
  readonly width: number;
  /** Distance between layers. */
  readonly rowHeight: number;
  /** Glyph size (the 16×16 symbols are drawn at this size). */
  readonly glyph: number;
  /** Average advance of a label character, to abbreviate labels to their column. */
  readonly charWidth: number;
  readonly padding: number;
}

export const DEFAULT_MAP_OPTIONS: MapOptions = { width: 320, rowHeight: 76, glyph: 18, charWidth: 6.6, padding: 14 };

export interface MapNode {
  readonly id: string;
  readonly kind: ArgumentKind;
  readonly title: string;
  /** Label abbreviated to its column (the full title stays in the accessible name). */
  readonly label: string;
  readonly cx: number;
  readonly cy: number;
}
export interface MapEdge {
  readonly from: string;
  readonly to: string;
  /** SVG path data of the curve. */
  readonly d: string;
  /** SVG path data of the arrowhead (a closed triangle). */
  readonly head: string;
}
export interface MapDrawing {
  readonly width: number;
  readonly height: number;
  readonly nodes: readonly MapNode[];
  readonly edges: readonly MapEdge[];
}

/** Vertical room under a glyph taken by its label (baseline at glyph + 13, plus descenders). */
const LABEL_BAND = 19;

/** Rounds to 0.1 user units: stable output, compact markup. */
const r = (x: number): number => Math.round(x * 10) / 10;

/**
 * Shortens a title to at most `max` characters (code points), cutting at a word
 * boundary when one is near and marking the cut with an ellipsis.
 */
export const abbreviate = (title: string, max: number): string => {
  const chars = Array.from(title.trim());
  if (chars.length <= max) return chars.join('');
  if (max <= 1) return '…';
  const head = chars.slice(0, max - 1).join('');
  const space = head.lastIndexOf(' ');
  const cut = space >= Math.floor((max - 1) / 2) ? head.slice(0, space) : head;
  return `${cut.replace(/[\s,;:.–—-]+$/u, '')}…`;
};

/** Smooth curve through the points with vertical tangents at each of them (cubic Bézier per segment). */
const curve = (points: readonly Point[]): string => {
  const [first, ...rest] = points;
  if (first === undefined) return '';
  let d = `M${r(first.x)} ${r(first.y)}`;
  let prev = first;
  for (const p of rest) {
    const my = (prev.y + p.y) / 2;
    d += `C${r(prev.x)} ${r(my)} ${r(p.x)} ${r(my)} ${r(p.x)} ${r(p.y)}`;
    prev = p;
  }
  return d;
};

export const drawArgumentMap = (
  input: MapInput,
  options: MapOptions = DEFAULT_MAP_OPTIONS,
): Result<MapDrawing, string> => {
  const layout = layoutDag(input);
  if (!layout.ok) return layout;
  const { width, rowHeight, glyph, charWidth, padding } = options;
  const columns = Math.max(1, layout.value.width);
  const inner = width - 2 * padding;
  const columnWidth = inner / columns;
  // A label may use the width its own layer leaves it (a lone node gets the whole row).
  const labelChars = (layer: number): number =>
    Math.max(4, Math.floor(inner / Math.max(1, layout.value.layerSizes[layer] ?? columns) / charWidth));
  const half = glyph / 2;
  const toX = (x: number): number => width / 2 + x * columnWidth;
  const toY = (y: number): number => padding + half + y * rowHeight;
  const nodes: MapNode[] = [];
  for (const [i, p] of layout.value.nodes.entries()) {
    const n = input.nodes[i];
    if (n === undefined || !isArgumentKind(n.kind)) return err(`unknown argument kind "${String(n?.kind)}"`);
    nodes.push({
      id: n.id,
      kind: n.kind,
      title: n.title,
      label: abbreviate(n.title, labelChars(p.layer)),
      cx: r(toX(p.x)),
      cy: r(toY(p.y)),
    });
  }
  const edges = layout.value.edges.map((e): MapEdge => {
    const pts = e.points.map((p) => ({ x: toX(p.x), y: toY(p.y) }));
    // Leave the source below its label; stop above the target glyph, where the arrowhead ends.
    const end = pts[pts.length - 1];
    const trimmed = pts.map((p, k) => {
      if (k === 0) return { x: p.x, y: p.y + half + LABEL_BAND };
      if (k === pts.length - 1) return { x: p.x, y: p.y - half - 6 };
      return p;
    });
    const tip = end === undefined ? { x: 0, y: 0 } : { x: end.x, y: end.y - half - 1 };
    const head = `M${r(tip.x)} ${r(tip.y)}L${r(tip.x - 3.5)} ${r(tip.y - 6)}L${r(tip.x + 3.5)} ${r(tip.y - 6)}Z`;
    return { from: e.from, to: e.to, d: curve(trimmed), head };
  });
  const height = layout.value.layers === 0 ? 0 : r(2 * padding + glyph + (layout.value.layers - 1) * rowHeight + 16);
  return ok({ width, height, nodes, edges });
};
