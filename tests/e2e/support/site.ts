/**
 * The pages under test: every page the build lists in its sitemap(s) and every
 * other HTML page in dist/ (a page left out of the sitemap is still audited), so
 * new content is covered without editing the tests and empty collections simply
 * mean fewer pages. Two pages are special and have tests of their own: the
 * root (dist/index.html, a language chooser that redirects at once) and the
 * 404 page. Pure helpers first (unit-tested in
 * tests/unit/guardrails/e2e-site.test.ts), then the file-system loader.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
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

/** Path of the root page (the base itself): a language chooser, audited by its own test. */
export const ROOT_PAGE = '';

/** dist file of the not-found page, audited by its own test (served with status 404). */
export const NOT_FOUND_FILE = '404.html';

/**
 * Page path of an HTML file of dist/ ("pt/index.html" → "pt/", "index.html" → "",
 * "a/b.html" → "a/b.html"), with "/" separators; undefined for other files.
 */
export const distPagePath = (file: string): string | undefined => {
  const f = file.split('\\').join('/');
  if (!f.endsWith('.html')) return undefined;
  if (f === 'index.html') return '';
  return f.endsWith('/index.html') ? f.slice(0, -'index.html'.length) : f;
};

/**
 * Pages of the sitemaps and of dist's HTML files, de-duplicated and sorted
 * (stable test titles), without the root and the 404 page.
 */
export const sitePages = (
  sitemaps: readonly string[],
  coords: SiteCoordinates,
  htmlFiles: readonly string[] = [],
): readonly SitePage[] => {
  const paths = new Set<string>();
  for (const xml of sitemaps) {
    for (const loc of sitemapLocations(xml)) {
      const p = pagePath(loc, coords);
      if (p !== undefined) paths.add(p);
    }
  }
  for (const file of htmlFiles) {
    const p = file === NOT_FOUND_FILE ? undefined : distPagePath(file);
    if (p !== undefined) paths.add(p);
  }
  paths.delete(ROOT_PAGE);
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

/** HTML files of dist/, relative and with "/" separators. */
const distHtmlFiles = (): readonly string[] =>
  readdirSync(DIST, { recursive: true, encoding: 'utf8' })
    .map((f) => f.split(path.sep).join('/'))
    .filter((f) => f.endsWith('.html'));

let cached: readonly SitePage[] | undefined;

/** Every page of the built site; throws (fails collection) when dist has no sitemap or no page. */
export const loadSitePages = (): readonly SitePage[] => {
  if (cached !== undefined) return cached;
  const pages = sitePages(loadSitemaps(), COORDS, distHtmlFiles());
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
export const hasNotFoundPage = (): boolean => existsSync(path.join(DIST, NOT_FOUND_FILE));

/** True when the build has a root page (dist/index.html, the language chooser). */
export const hasRootPage = (): boolean => existsSync(path.join(DIST, 'index.html'));
