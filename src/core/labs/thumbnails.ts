/**
 * Static previews of each lab for the labs index: small SVG drawings computed at build time from the same
 * pure functions the labs use (a square-wave partial sum, an aliased sinusoid, a code-length bar chart,
 * the capacity curve, a cobweb orbit, a histogram against the normal). The view styles each shape by its
 * role with design tokens; nothing here names a colour.
 */
import { absurd } from '../algebra/match.ts';
import { bscCapacity, binaryEntropy } from './channel.ts';
import { binEdges, irwinHallDensity, normalPdf } from './clt.ts';
import { partialSum } from './fourier.ts';
import { logisticOrbit, logisticStep } from './logistic.ts';
import { barsPath, cobwebPoints, functionPath, pointsPath, polylinePath } from './path.ts';
import { sinusoid } from './sampling.ts';
import { linearScale } from './scale.ts';
import type { Widget } from './widgets.ts';

/** What a shape stands for; the view maps it to a stroke style (solid, dashed, dotted) and a token. */
export type ShapeRole = 'axis' | 'reference' | 'curve' | 'accent' | 'bars' | 'points';

export interface Shape {
  readonly role: ShapeRole;
  readonly d: string;
}

export interface Thumbnail {
  readonly width: number;
  readonly height: number;
  readonly shapes: readonly Shape[];
}

const W = 160;
const H = 90;
const PAD = 6;
const options = { decimals: 1 } as const;

const xScale = (d0: number, d1: number) => linearScale(d0, d1, PAD, W - PAD);
const yScale = (d0: number, d1: number) => linearScale(d0, d1, H - PAD, PAD);
const axis = (y: number): Shape => ({ role: 'axis', d: `M${PAD} ${y}H${W - PAD}` });

const fourier = (): readonly Shape[] => {
  const sx = xScale(0, 2 * Math.PI);
  const sy = yScale(-1.35, 1.35);
  return [
    axis(sy.map(0)),
    {
      role: 'reference',
      d: polylinePath([0, 0, Math.PI, Math.PI, 2 * Math.PI, 2 * Math.PI], [0, 1, 1, -1, -1, 0], sx, sy, options),
    },
    { role: 'curve', d: functionPath((x) => partialSum('square', 7, false, x), 0, 2 * Math.PI, 161, sx, sy, options) },
  ];
};

const sampling = (): readonly Shape[] => {
  // A tone of frequency 1 sampled at 1.25 (below 2f): the samples lie on the alias of frequency 0.25.
  const sx = xScale(0, 4);
  const sy = yScale(-1.2, 1.2);
  const ts = Array.from({ length: 6 }, (_, k) => k / 1.25);
  return [
    axis(sy.map(0)),
    { role: 'reference', d: functionPath(sinusoid(1, 0), 0, 4, 129, sx, sy, options) },
    { role: 'curve', d: functionPath(sinusoid(-0.25, 0), 0, 4, 49, sx, sy, options) },
    { role: 'points', d: pointsPath(ts, ts.map(sinusoid(1, 0)), sx, sy, options) },
  ];
};

const entropy = (): readonly Shape[] => {
  // Code lengths of a dyadic source (1/2, 1/4, 1/8, 1/16, 1/16): bars of height ℓ = −log2 p.
  const lengths = [1, 2, 3, 4, 4];
  const edges = lengths.map((_, i) => i).concat(lengths.length);
  const sx = xScale(-0.2, lengths.length + 0.2);
  const sy = yScale(0, 4.4);
  const shrink = edges.flatMap((e, i) => (i < lengths.length ? [e + 0.15, e + 0.85] : []));
  return [
    axis(sy.map(0)),
    {
      role: 'bars',
      d: lengths.map((l, i) => barsPath([shrink[2 * i] ?? 0, shrink[2 * i + 1] ?? 0], [l], sx, sy, 0, options)).join(''),
    },
  ];
};

const channel = (): readonly Shape[] => {
  const sx = xScale(0, 1);
  const sy = yScale(0, 1.08);
  return [
    axis(sy.map(0)),
    { role: 'reference', d: functionPath(binaryEntropy, 0, 1, 61, sx, sy, options) },
    { role: 'curve', d: functionPath(bscCapacity, 0, 1, 61, sx, sy, options) },
    { role: 'points', d: pointsPath([0.11], [bscCapacity(0.11)], sx, sy, options) },
  ];
};

const logistic = (): readonly Shape[] => {
  const r = 3.7;
  const sx = linearScale(0, 1, (W - H) / 2 + PAD, (W + H) / 2 - PAD);
  const sy = yScale(0, 1);
  const web = cobwebPoints(logisticOrbit(r, 0.2, 24));
  return [
    { role: 'axis', d: polylinePath([0, 1], [0, 1], sx, sy, options) },
    { role: 'reference', d: functionPath((x) => logisticStep(r, x), 0, 1, 81, sx, sy, options) },
    { role: 'curve', d: polylinePath(web.xs, web.ys, sx, sy, options) },
  ];
};

const clt = (): readonly Shape[] => {
  const sx = xScale(-4, 4);
  const sy = yScale(0, 0.5);
  const edges = binEdges(20);
  const heights = edges.slice(0, -1).map((e, k) => irwinHallDensity(3, (e + (edges[k + 1] ?? e)) / 2));
  return [
    axis(sy.map(0)),
    { role: 'bars', d: barsPath(edges, heights, sx, sy, 0, options) },
    { role: 'curve', d: functionPath(normalPdf, -4, 4, 81, sx, sy, options) },
  ];
};

/** The preview of a widget. */
export const thumbnail = (widget: Widget): Thumbnail => {
  const shapes = (() => {
    switch (widget) {
      case 'fourier':
        return fourier();
      case 'sampling':
        return sampling();
      case 'entropy':
        return entropy();
      case 'channel':
        return channel();
      case 'logistic':
        return logistic();
      case 'clt':
        return clt();
      default:
        return absurd(widget);
    }
  })();
  return { width: W, height: H, shapes };
};
