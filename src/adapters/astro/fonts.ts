/**
 * Typefaces (Astro Fonts API, npm provider → resolved from the lockfile-pinned
 * packages in node_modules: reproducible, offline-capable builds).
 *
 *   --font-text  Literata (TypeTogether for Google Play Books): a serif designed
 *                for sustained reading on screens; variable optical size.
 *   --font-ui    Atkinson Hyperlegible Next (Braille Institute, 2025): glyph
 *                shapes disambiguated for low-vision readers (Il1, 0O, rn/m).
 *   --font-mono  Atkinson Hyperlegible Mono (2025): same legibility principles
 *                for code and tabular data.
 *
 * Fallback faces are metric-adjusted automatically (size-adjust / ascent-override)
 * to minimise layout shift while the web font loads.
 */
import { fontProviders } from 'astro/config';

const npm = fontProviders.npm({ remote: false });

export const FONT_FAMILIES = [
  {
    provider: npm,
    name: 'Literata Variable',
    cssVariable: '--font-text',
    options: { package: '@fontsource-variable/literata' },
    weights: ['200 900'],
    styles: ['normal', 'italic'],
    subsets: ['latin', 'latin-ext'],
    fallbacks: ['Georgia', 'serif'],
  },
  {
    provider: npm,
    name: 'Atkinson Hyperlegible Next Variable',
    cssVariable: '--font-ui',
    options: { package: '@fontsource-variable/atkinson-hyperlegible-next' },
    weights: ['200 800'],
    styles: ['normal', 'italic'],
    subsets: ['latin', 'latin-ext'],
    fallbacks: ['system-ui', 'sans-serif'],
  },
  {
    provider: npm,
    name: 'Atkinson Hyperlegible Mono Variable',
    cssVariable: '--font-mono',
    options: { package: '@fontsource-variable/atkinson-hyperlegible-mono' },
    weights: ['200 800'],
    styles: ['normal'],
    subsets: ['latin', 'latin-ext'],
    fallbacks: ['ui-monospace', 'monospace'],
  },
] as const;
