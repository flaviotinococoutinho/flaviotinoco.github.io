/**
 * /<lang>/palette.json — the page-independent quick-navigation entries of the
 * command palette (ADR 0009: chrome on demand). Fetched by <ft-command-palette>
 * when the dialog opens; the pure codec is src/core/chrome/palette-entries.ts.
 */
import type { APIContext } from 'astro';
import { encodePaletteEntries } from '../../core/chrome/palette-entries.ts';
import type { Locale } from '../../core/domain/locale.ts';
import { localeStaticPaths } from '../../adapters/astro/i18n.ts';
import { paletteEntries } from '../../adapters/astro/palette.ts';

export const getStaticPaths = localeStaticPaths;

export function GET(context: APIContext): Response {
  const { locale } = context.props as { readonly locale: Locale };
  return new Response(encodePaletteEntries(paletteEntries(locale)), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}
