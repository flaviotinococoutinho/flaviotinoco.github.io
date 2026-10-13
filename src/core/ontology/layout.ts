/**
 * Deterministic force-directed layout, computed at BUILD time.
 *
 * Method: Fruchterman & Reingold (1991), "Graph drawing by force-directed
 * placement", Software: Practice and Experience 21(11):
 *
 *   k   = C·√(area / |V|)                ideal edge length
 *   f_r = k² / d                         repulsion between every pair
 *   f_a = d² / k                         attraction along edges (× edge weight)
 *   t   = t₀·(1 − i/iterations)          linear cooling; a node moves ≤ t per step
 *
 * Extensions, all optional and deterministic:
 *   - bands: a spring towards a target coordinate per node (used to lay the
 *     strata out as columns in reading order: philosophy → value);
 *   - gravity: a weak spring to the centre, keeping components together;
 *   - pins: nodes with fixed positions (e.g. the focus of a local map);
 *   - label boxes: after the force simulation, a few sweeps of pairwise
 *     axis-aligned overlap removal (cf. PRISM, Gansner & Hu 2010, simplified).
 *
 * Determinism: initial positions come from a seeded PRNG threaded explicitly
 * (no Math.random), nodes are processed in a canonical order, the iteration
 * budget is fixed, and the convergence test (max displacement < tolerance·k)
 * only ever stops EARLIER, deterministically. Same input + seed ⇒ same output.
 */
import { mulberry32, seedOf, type Prng } from './prng.ts';

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface LayoutNode<Id extends string> {
  readonly id: Id;
  /** Label box (width, height) around the node and its centre offset from the node position. */
  readonly box?: { readonly width: number; readonly height: number; readonly dx: number; readonly dy: number };
  /** Target position along the band axis, as a fraction in [0, 1] of the frame. */
  readonly band?: number;
  /** Half-width of this node's band window (overrides `bandSpread` of the options). */
  readonly spread?: number;
  /** Fixed position (the node never moves). */
  readonly pin?: Point;
}

export interface LayoutEdge<Id extends string> {
  readonly source: Id;
  readonly target: Id;
  /** Attraction multiplier (default 1). */
  readonly weight?: number;
}

export interface LayoutOptions {
  readonly width: number;
  readonly height: number;
  readonly seed: number;
  readonly prng?: Prng;
  /** Ideal edge length k; defaults to √(area / |V|) as in the original method (C = 1). */
  readonly idealLength?: number;
  /** Fixed iteration budget of the force simulation. */
  readonly iterations: number;
  /** Converged when every step is shorter than tolerance·k. */
  readonly tolerance: number;
  readonly bandAxis?: 'x' | 'y';
  /** Strength of the band spring, as a fraction of the distance to the band per step. */
  readonly bandStrength?: number;
  /**
   * Hard band constraint: a banded node never leaves the window
   * [band − spread, band + spread] (fractions of the frame) along the band axis.
   * Turns the strata into columns, as in a layered drawing, while the forces
   * still arrange each column.
   */
  readonly bandSpread?: number;
  /** Strength of the centre spring, idem. */
  readonly gravity?: number;
  /** Margin kept around the drawing in the final frame. */
  readonly padding: number;
  /**
   * Keep nodes inside the frame during the simulation (the original method).
   * When false, nodes float freely (gravity keeps them together) and the final
   * frame is the bounding box, which avoids nodes piling up against the walls.
   */
  readonly confine?: boolean;
  /** Overlap-removal sweeps over label boxes (0 disables). */
  readonly overlapSweeps?: number;
  /** Minimum gap between label boxes. */
  readonly gap?: number;
}

export interface Layout<Id extends string> {
  readonly positions: ReadonlyMap<Id, Point>;
  /** Size of the final frame (positions are in [0, width] × [0, height]). */
  readonly width: number;
  readonly height: number;
  readonly iterations: number;
  readonly converged: boolean;
}

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

interface Box {
  readonly width: number;
  readonly height: number;
  readonly dx: number;
  readonly dy: number;
}
const NO_BOX: Box = { width: 0, height: 0, dx: 0, dy: 0 };

export const forceLayout = <Id extends string>(
  nodes: readonly LayoutNode<Id>[],
  edges: readonly LayoutEdge<Id>[],
  options: LayoutOptions,
): Layout<Id> => {
  const prng = options.prng ?? mulberry32;
  const order = [...nodes].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const n = order.length;
  const index = new Map<Id, number>(order.map((node, i) => [node.id, i]));
  const { width: W, height: H, padding } = options;
  const innerW = Math.max(1, W - 2 * padding);
  const innerH = Math.max(1, H - 2 * padding);
  const k = options.idealLength ?? Math.sqrt((innerW * innerH) / Math.max(1, n));
  const axis = options.bandAxis ?? 'x';
  const bandStrength = options.bandStrength ?? 0;
  const gravity = options.gravity ?? 0;
  const confine = options.confine ?? true;
  const spreadOf = (node: LayoutNode<Id>): number | undefined => node.spread ?? options.bandSpread;
  /** Clamps a coordinate of a banded node to its window along the band axis. */
  const inBand = (node: LayoutNode<Id>, along: 'x' | 'y', v: number): number => {
    const spread = spreadOf(node);
    if (spread === undefined || node.band === undefined || along !== axis) return v;
    const extent = axis === 'x' ? innerW : innerH;
    const lo = padding + (node.band - spread) * extent;
    const hi = padding + (node.band + spread) * extent;
    return Math.min(hi, Math.max(lo, v));
  };

  // Initial positions: pins, else seeded uniform (near the band when one is given).
  const xs = new Float64Array(n);
  const ys = new Float64Array(n);
  let state = seedOf(options.seed);
  order.forEach((node, i) => {
    const [u, s1] = prng(state);
    const [v, s2] = prng(s1);
    state = s2;
    if (node.pin !== undefined) {
      xs[i] = node.pin.x;
      ys[i] = node.pin.y;
      return;
    }
    const bx = node.band !== undefined && axis === 'x' ? padding + node.band * innerW + (u - 0.5) * k : padding + u * innerW;
    const by = node.band !== undefined && axis === 'y' ? padding + node.band * innerH + (v - 0.5) * k : padding + v * innerH;
    xs[i] = inBand(node, 'x', bx);
    ys[i] = inBand(node, 'y', by);
  });

  const springs = edges
    .map((e) => ({ s: index.get(e.source), t: index.get(e.target), w: e.weight ?? 1 }))
    .filter((e): e is { s: number; t: number; w: number } => e.s !== undefined && e.t !== undefined && e.s !== e.t);

  const pinned = order.map((node) => node.pin !== undefined);
  const t0 = 0.1 * Math.max(innerW, innerH);
  const cx = W / 2;
  const cy = H / 2;
  const dispX = new Float64Array(n);
  const dispY = new Float64Array(n);
  let iterations = 0;
  let converged = n <= 1;

  for (let it = 0; it < options.iterations && !converged; it += 1) {
    iterations = it + 1;
    dispX.fill(0);
    dispY.fill(0);
    // Repulsion between all pairs.
    for (let u = 0; u < n; u += 1) {
      for (let v = u + 1; v < n; v += 1) {
        let dx = (xs[u] as number) - (xs[v] as number);
        let dy = (ys[u] as number) - (ys[v] as number);
        let d = Math.hypot(dx, dy);
        if (d < 1e-6) {
          // Coincident nodes: separate along a deterministic direction (golden-angle spiral).
          const a = GOLDEN_ANGLE * (u * n + v);
          dx = Math.cos(a) * 1e-3;
          dy = Math.sin(a) * 1e-3;
          d = 1e-3;
        }
        const f = (k * k) / d;
        const fx = (dx / d) * f;
        const fy = (dy / d) * f;
        dispX[u] = (dispX[u] as number) + fx;
        dispY[u] = (dispY[u] as number) + fy;
        dispX[v] = (dispX[v] as number) - fx;
        dispY[v] = (dispY[v] as number) - fy;
      }
    }
    // Attraction along edges.
    for (const { s, t, w } of springs) {
      const dx = (xs[s] as number) - (xs[t] as number);
      const dy = (ys[s] as number) - (ys[t] as number);
      const d = Math.max(Math.hypot(dx, dy), 1e-6);
      const f = ((d * d) / k) * w;
      const fx = (dx / d) * f;
      const fy = (dy / d) * f;
      dispX[s] = (dispX[s] as number) - fx;
      dispY[s] = (dispY[s] as number) - fy;
      dispX[t] = (dispX[t] as number) + fx;
      dispY[t] = (dispY[t] as number) + fy;
    }
    // Bands and gravity (springs proportional to the displacement from their targets).
    order.forEach((node, i) => {
      if (node.band !== undefined && bandStrength > 0) {
        if (axis === 'x') dispX[i] = (dispX[i] as number) + bandStrength * (padding + node.band * innerW - (xs[i] as number));
        else dispY[i] = (dispY[i] as number) + bandStrength * (padding + node.band * innerH - (ys[i] as number));
      }
      if (gravity > 0) {
        dispX[i] = (dispX[i] as number) + gravity * (cx - (xs[i] as number));
        dispY[i] = (dispY[i] as number) + gravity * (cy - (ys[i] as number));
      }
    });
    // Limited displacement (temperature), optionally confined to the frame.
    const temperature = t0 * (1 - it / options.iterations);
    let maxStep = 0;
    for (let i = 0; i < n; i += 1) {
      if (pinned[i] === true) continue;
      const len = Math.hypot(dispX[i] as number, dispY[i] as number);
      if (len < 1e-12) continue;
      const step = Math.min(len, temperature);
      const x = (xs[i] as number) + ((dispX[i] as number) / len) * step;
      const y = (ys[i] as number) + ((dispY[i] as number) / len) * step;
      const node = order[i] as LayoutNode<Id>;
      xs[i] = inBand(node, 'x', confine ? Math.min(W - padding, Math.max(padding, x)) : x);
      ys[i] = inBand(node, 'y', confine ? Math.min(H - padding, Math.max(padding, y)) : y);
      maxStep = Math.max(maxStep, step);
    }
    converged = maxStep < options.tolerance * k;
  }

  // Overlap removal on label boxes: push apart along the axis of least overlap.
  const boxes = order.map((node) => node.box ?? NO_BOX);
  const gap = options.gap ?? 0;
  for (let sweep = 0; sweep < (options.overlapSweeps ?? 0); sweep += 1) {
    let moved = false;
    for (let u = 0; u < n; u += 1) {
      for (let v = u + 1; v < n; v += 1) {
        const bu = boxes[u] as Box;
        const bv = boxes[v] as Box;
        const ux = (xs[u] as number) + bu.dx;
        const uy = (ys[u] as number) + bu.dy;
        const vx = (xs[v] as number) + bv.dx;
        const vy = (ys[v] as number) + bv.dy;
        const ox = (bu.width + bv.width) / 2 + gap - Math.abs(ux - vx);
        const oy = (bu.height + bv.height) / 2 + gap - Math.abs(uy - vy);
        if (ox <= 0 || oy <= 0) continue;
        moved = true;
        const pu = pinned[u] === true;
        const pv = pinned[v] === true;
        if (pu && pv) continue;
        const shareU = pu ? 0 : pv ? 1 : 0.5;
        const shareV = 1 - shareU;
        const nu = order[u] as LayoutNode<Id>;
        const nv = order[v] as LayoutNode<Id>;
        // Two nodes held in band windows can only be separated across the band axis.
        const banded = nu.band !== undefined && nv.band !== undefined && spreadOf(nu) !== undefined && spreadOf(nv) !== undefined;
        const alongX = banded ? axis === 'y' : ox < oy;
        if (alongX) {
          const sign = ux < vx || (ux === vx && u < v) ? -1 : 1;
          xs[u] = inBand(nu, 'x', (xs[u] as number) + sign * ox * shareU);
          xs[v] = inBand(nv, 'x', (xs[v] as number) - sign * ox * shareV);
        } else {
          const sign = uy < vy || (uy === vy && u < v) ? -1 : 1;
          ys[u] = inBand(nu, 'y', (ys[u] as number) + sign * oy * shareU);
          ys[v] = inBand(nv, 'y', (ys[v] as number) - sign * oy * shareV);
        }
      }
    }
    if (!moved) break;
  }

  // Final frame: the bounding box of nodes and their label boxes, plus padding.
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < n; i += 1) {
    const b = boxes[i] as Box;
    const x = xs[i] as number;
    const y = ys[i] as number;
    minX = Math.min(minX, x, x + b.dx - b.width / 2);
    maxX = Math.max(maxX, x, x + b.dx + b.width / 2);
    minY = Math.min(minY, y, y + b.dy - b.height / 2);
    maxY = Math.max(maxY, y, y + b.dy + b.height / 2);
  }
  if (n === 0) {
    minX = 0;
    minY = 0;
    maxX = 0;
    maxY = 0;
  }
  const round = (v: number): number => Math.round(v * 100) / 100;
  const offsetX = padding - minX;
  const offsetY = padding - minY;
  const positions = new Map<Id, Point>(
    order.map((node, i) => [node.id, { x: round((xs[i] as number) + offsetX), y: round((ys[i] as number) + offsetY) }]),
  );
  return {
    positions,
    width: round(maxX - minX + 2 * padding),
    height: round(maxY - minY + 2 * padding),
    iterations,
    converged,
  };
};
