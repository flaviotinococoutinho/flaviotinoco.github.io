/**
 * /<lang>/shelf.json — the titles and links of the books on the reading room's shelf (ADR 0014; chrome on
 * demand, ADR 0009). <ft-reading-room> fetches it only once the reader has lit the room, to name the book
 * under the pointer and open it on a click. The n-th label belongs to the n-th book of the `shelf`
 * attribute: both come from siteShelf (src/adapters/astro/shelf.ts).
 */
import type { APIContext } from 'astro';
import { encodeShelfLabels } from '../../core/chrome/room.ts';
import type { Locale } from '../../core/domain/locale.ts';
import { localeStaticPaths } from '../../adapters/astro/i18n.ts';
import { shelfLabels, siteShelf } from '../../adapters/astro/shelf.ts';

export const getStaticPaths = localeStaticPaths;

export async function GET(context: APIContext): Promise<Response> {
  const { locale } = context.props as { readonly locale: Locale };
  return new Response(encodeShelfLabels(shelfLabels(await siteShelf(locale))), {
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}
