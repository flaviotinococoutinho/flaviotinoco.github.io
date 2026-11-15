/**
 * Share cards: every page of the build announces an Open Graph image (and X's large-image card), the image
 * is served, is a PNG of exactly 1200 × 630, and has alternative text. Essays and labs point to their own
 * card; every other page to the site's card of its locale (src/core/chrome/card.ts).
 *
 * The pages are fetched over HTTP (no browser rendering is needed to read <head>), the cards once each.
 */
import { CARD } from '../../src/core/chrome/card.ts';
import { expect, test } from './support/fixtures.ts';
import { COORDS, loadSitePages } from './support/site.ts';

const ESSAY_OR_LAB = /^(?:pt\/(?:ensaios|laboratorio)|en\/(?:essays|lab))\/([^/]+)\/$/;

const meta = (html: string, key: string): string | undefined => {
  const pattern = new RegExp(
    `<meta[^>]+(?:property|name)="${key.replace(/[.:]/g, '\\$&')}"[^>]+content="([^"]*)"`,
    'i',
  );
  return pattern.exec(html)?.[1];
};

/** Width and height from the IHDR chunk of a PNG (bytes 16–23), or null if it is not a PNG. */
const pngSize = (bytes: Buffer): { readonly width: number; readonly height: number } | null =>
  bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    ? { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) }
    : null;

test('every page announces a share card that exists and has the right size', async ({ request }) => {
  test.setTimeout(240_000);
  const checked = new Map<string, string | null>();
  const problems: string[] = [];
  for (const { path } of loadSitePages()) {
    const response = await request.get(path);
    if (!response.ok()) continue;
    const html = await response.text();
    if (!/<html/i.test(html) || /http-equiv="refresh"/i.test(html)) continue;
    const image = meta(html, 'og:image');
    if (image === undefined) {
      problems.push(`/${path}: no og:image`);
      continue;
    }
    if (meta(html, 'twitter:card') !== 'summary_large_image') problems.push(`/${path}: no twitter:card`);
    if ((meta(html, 'og:image:alt') ?? '').trim() === '') problems.push(`/${path}: empty og:image:alt`);
    const url = new URL(image);
    if (url.origin !== COORDS.origin || !url.pathname.startsWith(COORDS.base)) {
      problems.push(`/${path}: og:image outside the site (${image})`);
      continue;
    }
    const own = ESSAY_OR_LAB.exec(path);
    if (own !== null && !url.pathname.endsWith(`/${own[1] ?? ''}.png`))
      problems.push(`/${path}: not its own card (${image})`);
    const local = url.pathname.slice(COORDS.base.length);
    if (!checked.has(local)) {
      const card = await request.get(local);
      const size = card.ok() ? pngSize(await card.body()) : null;
      checked.set(
        local,
        size === null
          ? `${local}: not served as a PNG`
          : size.width !== CARD.width || size.height !== CARD.height
            ? `${local}: ${String(size.width)} × ${String(size.height)}`
            : null,
      );
    }
    const problem = checked.get(local);
    if (problem !== null && problem !== undefined) problems.push(`/${path}: ${problem}`);
  }
  expect(checked.size, 'distinct cards').toBeGreaterThan(2);
  expect(problems).toEqual([]);
});
