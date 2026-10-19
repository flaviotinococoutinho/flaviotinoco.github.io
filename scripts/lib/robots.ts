/**
 * Search-engine indexing of the built site (pure: the shell reads the files).
 *
 * Until launch the site is published but kept out of search indexes (ADR 0008).
 * GitHub Pages cannot send an `X-Robots-Tag` header, and a robots.txt below the
 * root of the origin is never read (RFC 9309 §2.3: the rules live at
 * "/robots.txt" of the authority, and this is a project site under
 * /flaviotinoco.github.io/), so every page carries
 * <meta name="robots" content="noindex, nofollow">. A page blocked by
 * robots.txt could not even show that rule to a crawler, which is why the
 * meta element, not a disallow rule, is the mechanism.
 *
 * The switch is SITE_INDEXING=true at build time (astro.config.ts, env.schema):
 * with it on, only the pages that are never meant to be indexed keep noindex.
 */
import { scanHtml } from './html.ts';

/** Name of the build-time switch, as read by astro.config.ts and by this check. */
export const INDEXING_ENV = 'SITE_INDEXING';

/** dist-relative pages that stay out of the indexes even after launch: the 404 page and the language chooser. */
export const ALWAYS_HIDDEN: ReadonlySet<string> = new Set(['404.html', 'index.html']);

/** Indexing is opt-in and mirrors Astro's boolean env field: only the string "true" turns it on. */
export const indexingEnabled = (env: Readonly<Record<string, string | undefined>>): boolean =>
  env[INDEXING_ENV] === 'true';

/** Crawler names whose <meta name> carries indexing rules for us. */
const ROBOT_NAMES: ReadonlySet<string> = new Set(['robots', 'googlebot']);

/** Rules of every <meta name="robots"> (or name="googlebot") of a page, lower-cased, trimmed, in document order. */
export const robotsDirectives = (html: string): readonly string[] =>
  scanHtml(html)
    .tags.filter((t) => t.name === 'meta' && ROBOT_NAMES.has((t.attrs.get('name') ?? '').trim().toLowerCase()))
    .flatMap((t) =>
      (t.attrs.get('content') ?? '')
        .split(',')
        .map((d) => d.trim().toLowerCase())
        .filter((d) => d !== ''),
    );

/** `none` is shorthand for `noindex, nofollow` (Google Search Central, robots meta tag rules). */
export const forbidsIndexing = (directives: readonly string[]): boolean =>
  directives.includes('noindex') || directives.includes('none');

export interface RobotsViolation {
  readonly page: string;
  readonly reason: string;
}

/**
 * With indexing off, every page must forbid indexing. With it on, a page outside
 * `alwaysHidden` that still forbids it is a leftover and is reported too.
 */
export const checkRobots = (
  pages: ReadonlyMap<string, string>,
  indexing: boolean,
  alwaysHidden: ReadonlySet<string> = ALWAYS_HIDDEN,
): readonly RobotsViolation[] =>
  [...pages.entries()].flatMap(([page, html]): RobotsViolation[] => {
    const hidden = forbidsIndexing(robotsDirectives(html));
    if (!indexing && !hidden)
      return [{ page, reason: 'indexing is off (ADR 0008) but the page has no robots noindex rule' }];
    if (indexing && hidden && !alwaysHidden.has(page))
      return [{ page, reason: `indexing is on (${INDEXING_ENV}=true) but the page still forbids it` }];
    return [];
  });
