/**
 * Open Graph card rasteriser (imperative shell): the pure layout tree of
 * src/core/addons/og.ts → SVG (satori, text converted to outlines with the
 * site's own typefaces) → pixels (resvg) → PNG (src/core/addons/png.ts: lossless
 * indexed colour, zlib level 9 from node:zlib). Build time only; nothing reaches
 * the client.
 *
 * Fonts: static TrueType instances in src/assets/fonts/og/ (satori reads neither
 * WOFF2 nor variation axes), cut from the same pinned upstream sources as the
 * web fonts by `python3 -I scripts/fonts/build_fonts.py --og`; provenance in
 * src/assets/fonts/og/fonts.lock.json. They are read from the project root
 * (process.cwd(), where `astro build` runs) because the prerender bundle lives
 * elsewhere and import.meta.url would not point into src/.
 *
 * Determinism: same tree and same fonts → same SVG → same PNG bytes (resvg has
 * no time- or environment-dependent output; tested in tests/unit/addons/og.test.ts).
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { deflateSync } from 'node:zlib';
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import { OG_HEIGHT, OG_MAX_BYTES, OG_WIDTH, type OgElement } from '../../core/addons/og.ts';
import { encodePng } from '../../core/addons/png.ts';

type FontSpec = { readonly file: string; readonly name: string; readonly weight: 400 | 600 | 700 };

const FONTS: readonly FontSpec[] = [
  { file: 'literata-display-600.ttf', name: 'Literata', weight: 600 },
  { file: 'literata-text-400.ttf', name: 'Literata', weight: 400 },
  { file: 'atkinson-next-400.ttf', name: 'Atkinson Hyperlegible Next', weight: 400 },
  { file: 'atkinson-next-700.ttf', name: 'Atkinson Hyperlegible Next', weight: 700 },
];

export const OG_FONT_DIR = path.join('src', 'assets', 'fonts', 'og');

let loaded: Promise<{ name: string; data: Buffer; weight: 400 | 600 | 700; style: 'normal' }[]> | undefined;

const fonts = (root: string) =>
  (loaded ??= Promise.all(
    FONTS.map(async (f) => ({
      name: f.name,
      data: await readFile(path.join(root, OG_FONT_DIR, f.file)),
      weight: f.weight,
      style: 'normal' as const,
    })),
  ));

/** The SVG of a card (text as outlines). */
export const renderOgSvg = async (tree: OgElement, root: string = process.cwd()): Promise<string> =>
  // satori types its input as a React node; the core builds the same { type, props } shape without React.
  satori(tree, {
    width: OG_WIDTH,
    height: OG_HEIGHT,
    fonts: await fonts(root),
  });

/** The PNG of a card; fails loudly when it exceeds the size budget (OG_MAX_BYTES). */
export const renderOgPng = async (tree: OgElement, root: string = process.cwd()): Promise<Uint8Array> => {
  const svg = await renderOgSvg(tree, root);
  const image = new Resvg(svg, { fitTo: { mode: 'original' } }).render();
  const png = encodePng(new Uint8Array(image.pixels), image.width, image.height, (data) =>
    deflateSync(data, { level: 9 }),
  );
  if (png.byteLength > OG_MAX_BYTES) {
    throw new Error(`[og] card is ${png.byteLength} bytes, above the ${OG_MAX_BYTES}-byte budget`);
  }
  return png;
};
