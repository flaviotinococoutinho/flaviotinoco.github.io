/**
 * The pages under test: exactly those the build lists in its sitemap(s), so new
 * content is covered without editing the tests and empty collections simply
 * mean fewer pages. Pure helpers first (unit-tested in
 * tests/unit/guardrails/e2e-site.test.ts), then the file-system loader.
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { localeCodec, type Locale } from '../../../src/core/domain/locale.ts';
import { decodeEntities } from '../../../scripts/lib/html.ts';
import { distTargetOf, siteCoordinates, type SiteCoordinates } from '../../../scripts/lib/site.ts';

/** `<loc>` values of a sitemap or sitemap index (sitemaps.org 0.9), entity-decoded. */
export const sitemapLocations = (xml: string): readonly string[] =>
  [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => decodeEntities(m[1] ?? ''));

/**
 * Path of a sitemap URL relative to the base path ("pt/ensaios/"), which is what
 * Playwright's `page.goto` needs when `baseURL` already ends with the base path.
 * URLs of another origin or outside the base are not pages of this build.
 */
export const pagePath = (loc: string, coords: SiteCoordinates): string | undefined => {
  let url: URL;
  try {
    url = new URL(loc);
  } catch {
    return undefined;
  }
  if (url.origin !== coords.origin || !url.pathname.startsWith(coords.base)) return undefined;
  return url.pathname.slice(coords.base.length);
};

/** Locale a page must declare in <html lang>, from its first path segment (route codec of the core). */
export const expectedLocale = (pagePath: string): Locale | undefined => {
  const first = pagePath.split('/').find((segment) => segment.length > 0);
  if (first === undefined) return undefined;
  const decoded = localeCodec.decode(first);
  return decoded.ok ? decoded.value : undefined;
};

export interface SitePage {
  /** Path relative to the base, e.g. "pt/ensaios/". */
  readonly path: string;
  readonly locale: Locale | undefined;
}

/** Pages of the sitemaps, de-duplicated and sorted (stable test titles). */
export const sitePages = (sitemaps: readonly string[], coords: SiteCoordinates): readonly SitePage[] => {
  const paths = new Set<string>();
  for (const xml of sitemaps) {
    for (const loc of sitemapLocations(xml)) {
      const p = pagePath(loc, coords);
      if (p !== undefined) paths.add(p);
    }
  }
  return [...paths].sort().map((p) => ({ path: p, locale: expectedLocale(p) }));
};

/* ------------------------------------------------------------------------- */
/* Shell: read dist/.                                                         */
/* ------------------------------------------------------------------------- */

export const DIST = path.resolve(import.meta.dirname, '../../../dist');
export const COORDS = siteCoordinates(process.env);

const readDist = (relative: string): string | undefined => {
  const file = path.join(DIST, relative);
  return existsSync(file) ? readFileSync(file, 'utf8') : undefined;
};

/** Sitemaps referenced by dist/sitemap-index.xml (fallback: dist/sitemap-0.xml). */
const loadSitemaps = (): readonly string[] => {
  const index = readDist('sitemap-index.xml');
  const children = (index === undefined ? [] : sitemapLocations(index)).flatMap((loc) => {
    const p = pagePath(loc, COORDS);
    const target = p === undefined ? undefined : distTargetOf(`${COORDS.base}${p}`, COORDS.base);
    const xml = target?.kind === 'file' ? readDist(target.path) : undefined;
    return xml === undefined ? [] : [xml];
  });
  if (children.length > 0) return children;
  const single = readDist('sitemap-0.xml');
  if (single !== undefined) return [single];
  throw new Error(
    `No sitemap in ${DIST}. Build the site first (pnpm build, or pnpm exec astro build) with the same ` +
      `SITE/BASE_PATH as this run (site ${COORDS.origin}${COORDS.base}).`,
  );
};

let cached: readonly SitePage[] | undefined;

/** Every page of the built site; throws (fails collection) when dist has no sitemap or no page. */
export const loadSitePages = (): readonly SitePage[] => {
  if (cached !== undefined) return cached;
  const pages = sitePages(loadSitemaps(), COORDS);
  if (pages.length === 0) {
    throw new Error(
      `The sitemaps in ${DIST} list no page under ${COORDS.origin}${COORDS.base}: ` +
        'was the site built with a different SITE or BASE_PATH?',
    );
  }
  cached = pages;
  return pages;
};

/** Home page of each locale present in the build (keyboard tests run there). */
export const localeHomes = (pages: readonly SitePage[]): readonly SitePage[] =>
  pages.filter((p) => p.locale !== undefined && p.path === `${localeCodec.encode(p.locale)}/`);

/** True when the build has a custom 404 page (served by `astro preview` for unknown URLs). */
export const hasNotFoundPage = (): boolean => existsSync(path.join(DIST, '404.html'));
