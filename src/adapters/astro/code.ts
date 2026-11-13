/**
 * Code blocks (Shiki): one theme per colour scheme, chosen by measurement.
 *
 * Shiki writes the colour of every token as CSS variables (`defaultColor: false`),
 * and src/styles/components/reading.css picks the theme by [data-theme] and
 * prefers-color-scheme. A code block keeps the theme's own background, against
 * which its token colours were designed, so the colours are third-party values
 * that the palette verification (scripts/verify-palette.ts) does not see.
 *
 * Primer's current palettes ("-default") are used because every text token of
 * both meets WCAG 2.2 SC 1.4.3 (4.5:1) against the theme background. The older
 * `github-light` / `github-dark` do not: variables are 3.49:1 on white and
 * comments 3.05:1 on the dark background (measured on the theme files of
 * @shikijs/themes 4.5.0). tests/unit/guardrails/code-contrast.test.ts renders
 * samples in several languages with this very configuration and checks every
 * colour that comes out.
 */
import type { ShikiConfig } from '@astrojs/markdown-remark';

export const SHIKI_CONFIG = {
  themes: { light: 'github-light-default', dark: 'github-dark-default' },
  defaultColor: false,
} as const satisfies ShikiConfig;
