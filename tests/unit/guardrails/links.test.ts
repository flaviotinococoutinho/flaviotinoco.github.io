import { describe, expect, it } from 'vitest';
import { fc, test } from '@fast-check/vitest';
import { scanHtml } from '../../../scripts/lib/html.ts';
import {
  checkLinks,
  cssReferences,
  fragmentTargets,
  referencesOfTags,
  refreshUrl,
  resolveReference,
  srcsetUrls,
  xmlReferences,
  type SiteSnapshot,
} from '../../../scripts/lib/links.ts';

const coords = { origin: 'https://example.test', base: '/b/' } as const;

const snapshot = (pages: Record<string, string>, extra: readonly string[] = [], more: Partial<SiteSnapshot> = {}) => ({
  pages: new Map(Object.entries(pages)),
  stylesheets: new Map<string, string>(),
  xml: new Map<string, string>(),
  files: new Set([...Object.keys(pages), ...extra]),
  ...more,
});

describe('reference extraction', () => {
  it('collects URL-bearing attributes, srcset candidates, refresh and Open Graph URLs', () => {
    const { tags } = scanHtml(`
      <a href="/b/x/">a</a><img src="i.png" srcset="i-1.png 1x, i-2.png 2x"><use href="#g"></use>
      <link rel="preconnect" href="https://cdn.example"><link rel="stylesheet" href="s.css">
      <meta http-equiv="refresh" content="0; url=/b/pt/"><meta property="og:image" content="https://example.test/b/og.png">
      <form action="/b/search/"></form><video poster="p.jpg" src="v.mp4"></video>`);
    expect(referencesOfTags(tags).map((r) => `${r.via} ${r.url}`)).toEqual([
      'a[href] /b/x/',
      'img[src] i.png',
      'img[srcset] i-1.png',
      'img[srcset] i-2.png',
      'use[href] #g',
      'link[href] s.css',
      'meta[http-equiv=refresh] /b/pt/',
      'meta[og:image] https://example.test/b/og.png',
      'form[action] /b/search/',
      'video[src] v.mp4',
      'video[poster] p.jpg',
    ]);
  });

  it('parses srcset per the HTML algorithm (commas inside URLs, descriptors with parentheses)', () => {
    expect(srcsetUrls('a.png 1x,b.png 2x')).toEqual(['a.png', 'b.png']);
    expect(srcsetUrls('img,1.png 480w, img,2.png 800w')).toEqual(['img,1.png', 'img,2.png']);
    expect(srcsetUrls('a.png, b.png')).toEqual(['a.png', 'b.png']);
    expect(srcsetUrls(' a.png (x, y) 1x , b.png')).toEqual(['a.png', 'b.png']);
    expect(srcsetUrls('')).toEqual([]);
  });

  it('reads meta refresh targets', () => {
    expect(refreshUrl('0; url=/b/pt/')).toBe('/b/pt/');
    expect(refreshUrl("2;URL='/b/en/'")).toBe('/b/en/');
    expect(refreshUrl('5')).toBeUndefined();
  });

  it('reads stylesheet url() and @import, ignoring comments, data: and fragment-only URLs', () => {
    const css = `@import "a.css"; /* url(/no.png) */ .x{background:url( "/b/i.png" ) url(data:image/png;base64,AA) url(#f) url(y.svg)}`;
    expect(cssReferences(css).map((r) => r.url)).toEqual(['/b/i.png', 'y.svg', 'a.css']);
  });

  it('reads sitemap and feed URLs', () => {
    const xml = `<urlset><url><loc>https://example.test/b/pt/</loc><xhtml:link rel="alternate" href="https://example.test/b/en/"/></url></urlset>
      <rss><channel><link>https://example.test/b/</link><image><url><![CDATA[https://example.test/b/i.png]]></url></image></channel></rss>`;
    expect(xmlReferences(xml).map((r) => r.url)).toEqual([
      'https://example.test/b/pt/',
      'https://example.test/b/',
      'https://example.test/b/i.png',
      'https://example.test/b/en/',
    ]);
  });

  it('collects fragment targets from id and <a name>', () => {
    expect([...fragmentTargets(scanHtml('<h2 id="a">x</h2><a name="b"></a><p name="c" id="">')).values()]).toEqual([
      'a',
      'b',
    ]);
  });
});

describe('resolveReference', () => {
  const page = new URL('https://example.test/b/pt/ensaios/');
  it('classifies by scheme and origin', () => {
    expect(resolveReference('mailto:x@y.z', page, coords)).toEqual({ kind: 'ignored' });
    expect(resolveReference('data:image/png;base64,AA', page, coords)).toEqual({ kind: 'ignored' });
    expect(resolveReference('https://other.test/b/', page, coords)).toEqual({ kind: 'external' });
    expect(resolveReference('//other.test/x', page, coords)).toEqual({ kind: 'external' });
    expect(resolveReference('ftp://example.test/x', page, coords)).toEqual({ kind: 'external' });
    expect(resolveReference('http://[::1', page, coords)).toEqual({ kind: 'invalid' });
  });
  it('resolves relative paths, queries and fragments like a browser', () => {
    expect(resolveReference('../../en/#x', page, coords)).toEqual({ kind: 'internal', pathname: '/b/en/', fragment: 'x' });
    expect(resolveReference('?q=1', page, coords)).toEqual({ kind: 'internal', pathname: '/b/pt/ensaios/', fragment: null });
    expect(resolveReference('https://example.test/b/#', page, coords)).toEqual({
      kind: 'internal',
      pathname: '/b/',
      fragment: null,
    });
  });
});

describe('checkLinks', () => {
  it('accepts a consistent site', () => {
    const site = snapshot(
      {
        'index.html': '<a href="pt/">pt</a><a href="/b/pt/#s%C3%A9rie">série</a><a href="#top">top</a>',
        'pt/index.html': '<h2 id="série">x</h2><a href="../">up</a><img src="/b/i.png">',
      },
      ['i.png'],
    );
    expect(checkLinks(site, coords)).toEqual({ issues: [], checked: 5, external: 0 });
  });

  it('reports every kind of broken internal reference once, in a stable order', () => {
    const site = snapshot(
      {
        'pt/index.html': `<a href="/b/x/">1</a><a href="/b/x/">dup</a><a href="/b/pt">2</a><a href="/pt/">3</a>
          <a href="#nope">4</a><a href="/b/en/#nope">5</a><a href="http://[::1">6</a><a href="https://elsewhere.test/">ext</a>`,
        'en/index.html': '<h1 id="t">t</h1>',
      },
      [],
      {
        stylesheets: new Map([['_astro/a.css', '.x{background:url(../gone.png)}']]),
        xml: new Map([['sitemap-0.xml', '<loc>https://example.test/b/fr/</loc>']]),
      },
    );
    const report = checkLinks(site, coords);
    expect(report.external).toBe(1);
    expect(report.issues.map((i) => `${i.source} ${i.url} → ${i.reason}`)).toEqual([
      '_astro/a.css ../gone.png → no such file: gone.png',
      'pt/index.html #nope → no element with id="nope" in pt/index.html',
      'pt/index.html /b/en/#nope → no element with id="nope" in en/index.html',
      'pt/index.html /b/pt → missing trailing slash (trailingSlash: "always")',
      'pt/index.html /b/x/ → no such file: x/index.html',
      'pt/index.html /pt/ → outside the base path /b/ (prefix links with import.meta.env.BASE_URL)',
      'pt/index.html http://[::1 → unparseable URL',
      'sitemap-0.xml https://example.test/b/fr/ → no such file: fr/index.html',
    ]);
  });

  it('distinguishes a missing page from a missing slash', () => {
    const site = snapshot({ 'index.html': '<a href="/b/zz">x</a>' });
    expect(checkLinks(site, coords).issues[0]?.reason).toBe('no such page (and missing trailing slash)');
  });

  it('skips fragment checks on non-HTML targets and on text fragments', () => {
    const site = snapshot({ 'index.html': '<a href="/b/s.svg#icon">i</a><a href="#:~:text=foo">t</a>' }, ['s.svg']);
    expect(checkLinks(site, coords).issues).toEqual([]);
  });

  const slug = fc.stringMatching(/^[a-z][a-z0-9-]{0,8}$/);
  test.prop([fc.uniqueArray(slug, { minLength: 1, maxLength: 6 }), fc.nat()])(
    'a site whose links all target existing pages and ids has no issues; removing one target yields exactly one issue',
    (slugs, pick) => {
      const pages = Object.fromEntries(
        slugs.map((s, i) => {
          const next = slugs[(i + 1) % slugs.length] ?? s;
          return [`${s}/index.html`, `<h2 id="h-${s}">${s}</h2><a href="/b/${next}/#h-${next}">${next}</a>`];
        }),
      );
      expect(checkLinks(snapshot(pages), coords).issues).toEqual([]);

      const victim = slugs[pick % slugs.length] ?? '';
      const broken = { ...pages, [`${victim}/index.html`]: `<h2>${victim}</h2>${pages[`${victim}/index.html`]?.replace(/<h2[^>]*>[^<]*<\/h2>/, '') ?? ''}` };
      const issues = checkLinks(snapshot(broken), coords).issues;
      expect(issues).toHaveLength(1);
      expect(issues[0]?.reason).toBe(`no element with id="h-${victim}" in ${victim}/index.html`);
    },
  );
});
