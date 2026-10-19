/**
 * Typefaces (Astro Fonts API, local provider).
 *
 *   --font-text  Literata (TypeTogether for Google Play Books): a serif designed for
 *                sustained reading on screens; instanced at the text optical size.
 *   --font-ui    Atkinson Hyperlegible Next (Braille Institute, 2025): glyph shapes
 *                disambiguated for low-vision readers (Il1, 0O, rn/m).
 *   --font-mono  Atkinson Hyperlegible Mono (2025): the same principles for code and data.
 *
 * The files are built by scripts/fonts/build_fonts.py from the upstream OFL sources
 * (google/fonts, pinned commit) keeping every OpenType feature the typography uses
 * (onum, smcp/c2sc, tnum, frac, sups…), which the stock fontsource subsets strip. Each
 * face has a CORE and an EXT unicode-range slice; src/assets/fonts/fonts.lock.json
 * records provenance and the ranges, and is the single source of truth read here.
 * Fallback faces are metric-adjusted automatically (size-adjust / ascent-override).
 */
import { fontProviders } from 'astro/config';
import lock from '../../assets/fonts/fonts.lock.json' with { type: 'json' };

interface LockedFace {
  readonly file: string;
  readonly family: string;
  readonly style: 'normal' | 'italic';
  readonly weight: string;
  readonly unicodeRange: string;
}

const faces = lock.fonts as readonly LockedFace[];

const variantsOf = (family: string) => {
  const own = faces.filter((f) => f.family === family);
  const variants = own.map((f) => ({
    src: [`./src/assets/fonts/${f.file}`] as [string],
    weight: f.weight,
    style: f.style,
    unicodeRange: f.unicodeRange.split(', ') as [string, ...string[]],
  }));
  const [first, ...rest] = variants;
  if (first === undefined) throw new Error(`fonts.lock.json has no faces for ${family}`);
  return [first, ...rest] as [typeof first, ...(typeof first)[]];
};

const local = fontProviders.local();

export const FONT_FAMILIES = [
  {
    provider: local,
    name: 'Literata',
    cssVariable: '--font-text',
    options: { variants: variantsOf('Literata') },
    fallbacks: ['Georgia', 'serif'],
  },
  {
    provider: local,
    name: 'Atkinson Hyperlegible Next',
    cssVariable: '--font-ui',
    options: { variants: variantsOf('Atkinson Hyperlegible Next') },
    fallbacks: ['system-ui', 'sans-serif'],
  },
  {
    provider: local,
    name: 'Atkinson Hyperlegible Mono',
    cssVariable: '--font-mono',
    options: { variants: variantsOf('Atkinson Hyperlegible Mono') },
    fallbacks: ['ui-monospace', 'monospace'],
  },
];
