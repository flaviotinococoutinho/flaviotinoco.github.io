/**
 * Share cards: the shell that turns the pure card tree (src/core/chrome/card.ts) into a PNG at build time.
 * satori lays the tree out with the card fonts (static TrueType instances, scripts/fonts/build_card_fonts.py;
 * satori does not read WOFF2) and returns SVG; resvg rasterises it. Colours are the light theme's tokens,
 * converted from OKLCH (src/core/design/oklch.ts). Fonts and palette are read once per build.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import satori from 'satori';
import { CARD, cardTree, type CardInput, type CardPalette } from '../../core/chrome/card.ts';
import { hexOf } from '../../core/design/oklch.ts';
import { parseTokens } from '../../core/design/tokens.ts';
import { STRATA, type Stratum } from '../../core/domain/strata.ts';

const ROOT = process.cwd();
const FONTS = path.join(ROOT, 'src/assets/fonts/card');

interface Assets {
  readonly palette: CardPalette;
  readonly fonts: Parameters<typeof satori>[1]['fonts'];
}

let assets: Promise<Assets> | null = null;

const load = async (): Promise<Assets> => {
  const json: unknown = JSON.parse(await readFile(path.join(ROOT, 'src/core/design/tokens.json'), 'utf8'));
  const tokens = parseTokens(json as Parameters<typeof parseTokens>[0]);
  if (!tokens.ok) throw new Error(`card: tokens.json does not parse: ${tokens.error.join('; ')}`);
  const light = tokens.value.colors.light;
  const color = (name: string): string => {
    const value = light[name];
    if (value === undefined) throw new Error(`card: no colour token "${name}" in the light scheme`);
    return hexOf(value);
  };
  const strata = Object.fromEntries(STRATA.map((s) => [s, color(`stratum-${s}`)])) as Record<Stratum, string>;
  const [literata, atkinson] = await Promise.all([
    readFile(path.join(FONTS, 'card-literata-600.ttf')),
    readFile(path.join(FONTS, 'card-atkinson-500.ttf')),
  ]);
  return {
    palette: {
      paper: color('paper'),
      ink: color('ink'),
      inkMuted: color('ink-muted'),
      inkSubtle: color('ink-subtle'),
      rule: color('rule'),
      ruleStrong: color('rule-strong'),
      strata,
    },
    fonts: [
      { name: 'Literata', data: literata, weight: 600, style: 'normal' },
      { name: 'Atkinson', data: atkinson, weight: 500, style: 'normal' },
    ],
  };
};

/** The PNG of a card (1200 × 630). */
export const renderCard = async (input: CardInput): Promise<Uint8Array<ArrayBuffer>> => {
  assets ??= load();
  const { palette, fonts } = await assets;
  // satori takes React-shaped elements; the core's tree has exactly that shape (type, props, children).
  const svg = await satori(cardTree(input, palette), {
    width: CARD.width,
    height: CARD.height,
    fonts,
  });
  return new Uint8Array(new Resvg(svg, { fitTo: { mode: 'width', value: CARD.width } }).render().asPng());
};
