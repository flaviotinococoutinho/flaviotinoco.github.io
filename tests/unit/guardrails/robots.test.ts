import { describe, expect, it } from 'vitest';
import {
  ALWAYS_HIDDEN,
  INDEXING_ENV,
  checkRobots,
  forbidsIndexing,
  indexingEnabled,
  robotsDirectives,
} from '../../../scripts/lib/robots.ts';

const page = (head: string): string =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8">${head}</head><body><p>x</p></body></html>`;
const NOINDEX = page('<meta name="robots" content="noindex, nofollow">');
const PLAIN = page('<meta name="description" content="noindex in a description is not a rule">');

describe('indexingEnabled', () => {
  it('is on only for the exact string "true"', () => {
    expect(indexingEnabled({ [INDEXING_ENV]: 'true' })).toBe(true);
    for (const value of [undefined, '', 'false', 'TRUE', '1', 'yes'])
      expect(indexingEnabled({ [INDEXING_ENV]: value })).toBe(false);
    expect(indexingEnabled({})).toBe(false);
  });
});

describe('robotsDirectives', () => {
  it('reads robots and googlebot rules, case-insensitively, in document order', () => {
    const html = page(
      '<META NAME="Robots" CONTENT=" NoIndex , nofollow ">' +
        '<meta name="googlebot" content="nosnippet">' +
        '<meta name="viewport" content="width=device-width">',
    );
    expect(robotsDirectives(html)).toEqual(['noindex', 'nofollow', 'nosnippet']);
  });

  it('ignores other metas, empty rules and rules inside scripts', () => {
    expect(robotsDirectives(PLAIN)).toEqual([]);
    expect(robotsDirectives(page('<meta name="robots" content=" , ,">'))).toEqual([]);
    expect(robotsDirectives(page('<meta name="robots">'))).toEqual([]);
    expect(
      robotsDirectives(page('<script>document.write(\'<meta name="robots" content="noindex">\')</script>')),
    ).toEqual([]);
  });

  it('decodes character references in attribute values', () => {
    expect(robotsDirectives(page('<meta name="robots" content="noindex&#44;nofollow">'))).toEqual([
      'noindex',
      'nofollow',
    ]);
  });
});

describe('forbidsIndexing', () => {
  it('is true for noindex and for its shorthand none', () => {
    expect(forbidsIndexing(['noindex'])).toBe(true);
    expect(forbidsIndexing(['none'])).toBe(true);
    expect(forbidsIndexing(['nofollow', 'noarchive'])).toBe(false);
    expect(forbidsIndexing([])).toBe(false);
  });
});

describe('checkRobots', () => {
  const pages = new Map([
    ['index.html', NOINDEX],
    ['404.html', NOINDEX],
    ['en/essays/a/index.html', NOINDEX],
    ['pt/ensaios/a/index.html', PLAIN],
    ['en/lab/b/index.html', page('<meta name="robots" content="nofollow">')],
  ]);

  it('with indexing off, reports every page that does not say noindex', () => {
    expect(checkRobots(pages, false).map((v) => v.page)).toEqual(['pt/ensaios/a/index.html', 'en/lab/b/index.html']);
  });

  it('with indexing off, accepts a site where every page says noindex or none', () => {
    const hidden = new Map([
      ['a.html', NOINDEX],
      ['b.html', page('<meta name="robots" content="none">')],
    ]);
    expect(checkRobots(hidden, false)).toEqual([]);
  });

  it('with indexing on, reports leftovers but not the pages that are always hidden', () => {
    const violations = checkRobots(pages, true);
    expect(violations.map((v) => v.page)).toEqual(['en/essays/a/index.html']);
    expect(violations[0]?.reason).toContain(`${INDEXING_ENV}=true`);
  });

  it('keeps the 404 page and the language chooser out of the indexes after launch', () => {
    expect([...ALWAYS_HIDDEN].sort()).toEqual(['404.html', 'index.html']);
    expect(checkRobots(new Map([['x/index.html', NOINDEX]]), true, new Set(['x/index.html']))).toEqual([]);
  });
});
