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
import { siteFormulas } from '../../components/formulas/data.ts';

export const getStaticPaths = localeStaticPaths;

export async function GET(context: APIContext): Promise<Response> {
  const { locale } = context.props as { readonly locale: Locale };
  const { registry } = await siteFormulas();
  return new Response(encodePaletteEntries(paletteEntries(locale, registry)), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}
