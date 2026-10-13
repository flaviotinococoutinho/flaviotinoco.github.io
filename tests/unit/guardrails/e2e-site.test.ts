/**
 * Pure helpers of the e2e suite (tests/e2e/support/site.ts): which pages are
 * tested is decided by the sitemap, so these must neither drop nor invent pages.
 */
import { describe, expect, it } from 'vitest';
import { fc, test } from '@fast-check/vitest';
import { expectedLocale, localeHomes, pagePath, sitePages, sitemapLocations } from '../../../tests/e2e/support/site.ts';
import { normaliseBase, type SiteCoordinates } from '../../../scripts/lib/site.ts';

const coords: SiteCoordinates = { origin: 'https://example.test', base: '/base/' };

const urlset = (locs: readonly string[]): string =>
  `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${locs
    .map((l) => `<url><loc>${l}</loc><xhtml:link rel="alternate" hreflang="en" href="${l}"/></url>`)
    .join('')}</urlset>`;

describe('sitemap reading', () => {
  it('reads <loc> values (entity-decoded), not alternate links', () => {
    const xml = urlset(['https://example.test/base/pt/?a=1&amp;b=2', 'https://example.test/base/en/']);
    expect(sitemapLocations(xml)).toEqual(['https://example.test/base/pt/?a=1&b=2', 'https://example.test/base/en/']);
  });

  it('maps URLs to base-relative paths and drops foreign or out-of-base URLs', () => {
    expect(pagePath('https://example.test/base/pt/ensaios/', coords)).toBe('pt/ensaios/');
    expect(pagePath('https://example.test/base/', coords)).toBe('');
    expect(pagePath('https://other.test/base/pt/', coords)).toBeUndefined();
    expect(pagePath('https://example.test/elsewhere/', coords)).toBeUndefined();
    expect(pagePath('not a url', coords)).toBeUndefined();
  });

  it('derives the expected <html lang> from the first segment through the core locale codec', () => {
    expect(expectedLocale('pt/ensaios/')).toBe('pt-BR');
    expect(expectedLocale('en/')).toBe('en');
    expect(expectedLocale('fr/')).toBeUndefined();
    expect(expectedLocale('')).toBeUndefined();
  });

  it('finds the home page of each locale', () => {
    const pages = sitePages(
      [urlset(['pt/', 'pt/sobre/', 'en/', 'en/about/'].map((p) => `https://example.test/base/${p}`))],
      coords,
    );
    expect(localeHomes(pages).map((p) => p.path)).toEqual(['en/', 'pt/']);
  });

  const segment = fc.stringMatching(/^[a-z0-9-]{1,12}$/);
  const dirPath = fc.array(segment, { minLength: 1, maxLength: 4 }).map((s) => `${s.join('/')}/`);

  test.prop([fc.array(dirPath, { maxLength: 12 }), fc.stringMatching(/^[a-z]{0,8}$/)])(
    'lists every page of every sitemap exactly once, sorted, whatever the base path',
    (paths, rawBase) => {
      const c: SiteCoordinates = { origin: coords.origin, base: normaliseBase(rawBase) };
      const locs = paths.map((p) => `${c.origin}${c.base}${p}`);
      const half = Math.floor(locs.length / 2);
      const pages = sitePages([urlset(locs.slice(0, half)), urlset(locs.slice(half)), urlset(locs)], c);
      expect(pages.map((p) => p.path)).toEqual([...new Set(paths)].sort());
    },
  );
});
