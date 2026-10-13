/**
 * Internal link checking over a built site (pure: the shell reads dist/).
 *
 * Every URL-bearing attribute of every page is resolved with the WHATWG URL
 * algorithm against the page's public URL; URLs on the site's origin are
 * mapped to dist files (respecting the base path and the trailing-slash
 * convention) and must exist; a fragment must name an element id (or <a name>)
 * of the target page. External URLs are never fetched (no network in CI).
 * Stylesheets (url(), @import) and XML feeds/sitemaps (<loc>, <link>, href) are
 * checked the same way, because a broken font URL or hreflang alternate is as
 * real a dead link as an <a>.
 */
import { scanHtml, type ScannedHtml, type Tag } from './html.ts';
import { byCodeUnit } from './order.ts';
import { distTargetOf, pageUrlOf, type SiteCoordinates } from './site.ts';

export interface Reference {
  readonly url: string;
  /** Where it came from, e.g. "a[href]", "img[srcset]", "css url()". */
  readonly via: string;
}

export interface LinkIssue {
  /** dist-relative path of the document containing the reference. */
  readonly source: string;
  readonly url: string;
  readonly via: string;
  readonly reason: string;
}

/** Attributes that carry a single URL, by element. */
const URL_ATTRIBUTES: Readonly<Record<string, readonly string[]>> = {
  a: ['href'],
  area: ['href'],
  link: ['href'],
  use: ['href', 'xlink:href'],
  image: ['href', 'xlink:href'],
  img: ['src'],
  script: ['src'],
  iframe: ['src'],
  embed: ['src'],
  source: ['src'],
  track: ['src'],
  audio: ['src'],
  video: ['src', 'poster'],
  input: ['src'],
  object: ['data'],
  form: ['action'],
  blockquote: ['cite'],
  q: ['cite'],
  ins: ['cite'],
  del: ['cite'],
};

/** <meta> whose content is a URL (Open Graph / Twitter cards). */
const URL_META = new Set(['og:url', 'og:image', 'og:image:url', 'og:image:secure_url', 'twitter:image', 'og:audio', 'og:video']);

const isSpace = (c: string): boolean => c === ' ' || c === '\t' || c === '\n' || c === '\r' || c === '\f';

/**
 * URLs of a srcset attribute, following the parsing algorithm of HTML
 * §4.8.4.3.10 ("parse a srcset attribute"): a URL is a run of non-whitespace;
 * trailing commas end the candidate; otherwise descriptors run up to the next
 * comma outside parentheses. URLs may themselves contain commas.
 */
export const srcsetUrls = (srcset: string): readonly string[] => {
  const urls: string[] = [];
  let i = 0;
  while (i < srcset.length) {
    while (i < srcset.length && (isSpace(srcset.charAt(i)) || srcset.charAt(i) === ',')) i += 1;
    if (i >= srcset.length) break;
    let j = i;
    while (j < srcset.length && !isSpace(srcset.charAt(j))) j += 1;
    const token = srcset.slice(i, j);
    i = j;
    if (token.endsWith(',')) {
      urls.push(token.replace(/,+$/, ''));
      continue;
    }
    let depth = 0;
    while (i < srcset.length) {
      const c = srcset.charAt(i);
      i += 1;
      if (c === '(') depth += 1;
      else if (c === ')') depth = Math.max(0, depth - 1);
      else if (c === ',' && depth === 0) break;
    }
    urls.push(token);
  }
  return urls.filter((url) => url.length > 0);
};

/** URL of a <meta http-equiv="refresh" content="0; url=…">, if any. */
export const refreshUrl = (content: string): string | undefined => {
  const m = /^\s*\d+(?:\.\d*)?\s*[;,]?\s*(?:url\s*=\s*)?(['"]?)(.+?)\1\s*$/i.exec(content);
  return m?.[2];
};

export const referencesOfTags = (tags: readonly Tag[]): readonly Reference[] => {
  const refs: Reference[] = [];
  for (const tag of tags) {
    for (const attr of URL_ATTRIBUTES[tag.name] ?? []) {
      const url = tag.attrs.get(attr);
      // <link rel="preconnect|dns-prefetch"> name origins, not documents.
      const rel = tag.attrs.get('rel') ?? '';
      if (url !== undefined && !(tag.name === 'link' && /\b(preconnect|dns-prefetch)\b/i.test(rel))) {
        refs.push({ url, via: `${tag.name}[${attr}]` });
      }
    }
    const srcset = tag.attrs.get('srcset') ?? tag.attrs.get('imagesrcset');
    if (srcset !== undefined) for (const url of srcsetUrls(srcset)) refs.push({ url, via: `${tag.name}[srcset]` });
    if (tag.name === 'meta') {
      const content = tag.attrs.get('content');
      if (content === undefined) continue;
      if ((tag.attrs.get('http-equiv') ?? '').toLowerCase() === 'refresh') {
        const url = refreshUrl(content);
        if (url !== undefined) refs.push({ url, via: 'meta[http-equiv=refresh]' });
      }
      const property = (tag.attrs.get('property') ?? tag.attrs.get('name') ?? '').toLowerCase();
      if (URL_META.has(property)) refs.push({ url: content, via: `meta[${property}]` });
    }
  }
  return refs;
};

/** url(…) and @import references of a stylesheet (data: URIs and fragment-only URLs excluded). */
export const cssReferences = (css: string): readonly Reference[] => {
  const refs: Reference[] = [];
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
  for (const m of withoutComments.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)\s]*))\s*\)/gi)) {
    const url = (m[1] ?? m[2] ?? m[3] ?? '').trim();
    if (url !== '' && !url.startsWith('data:') && !url.startsWith('#')) refs.push({ url, via: 'css url()' });
  }
  for (const m of withoutComments.matchAll(/@import\s+(?:"([^"]*)"|'([^']*)')/gi)) {
    refs.push({ url: m[1] ?? m[2] ?? '', via: 'css @import' });
  }
  return refs;
};

/** URLs in sitemaps and feeds: <loc>, <link>, <url>, <id> element text and href attributes. */
export const xmlReferences = (xml: string): readonly Reference[] => {
  const refs: Reference[] = [];
  for (const m of xml.matchAll(/<(loc|link|url|id)>\s*(?:<!\[CDATA\[)?\s*([^<\]\s]+)\s*(?:\]\]>)?\s*<\/\1>/g)) {
    refs.push({ url: m[2] ?? '', via: `xml <${m[1] ?? ''}>` });
  }
  for (const m of xml.matchAll(/\shref\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) refs.push({ url: m[1] ?? m[2] ?? '', via: 'xml [href]' });
  return refs;
};

/** Ids a fragment can target: every id attribute, plus <a name>. */
export const fragmentTargets = (scan: ScannedHtml): ReadonlySet<string> => {
  const ids = new Set<string>();
  for (const tag of scan.tags) {
    const id = tag.attrs.get('id');
    if (id !== undefined && id !== '') ids.add(id);
    const name = tag.name === 'a' ? tag.attrs.get('name') : undefined;
    if (name !== undefined && name !== '') ids.add(name);
  }
  return ids;
};

export type Resolution =
  | { readonly kind: 'ignored' }
  | { readonly kind: 'external' }
  | { readonly kind: 'invalid' }
  | { readonly kind: 'internal'; readonly pathname: string; readonly fragment: string | null };

const IGNORED_SCHEMES = new Set(['data:', 'blob:', 'javascript:', 'mailto:', 'tel:', 'sms:', 'about:', 'urn:']);

/** Resolves a reference against the URL of the document containing it. */
export const resolveReference = (raw: string, documentUrl: URL, coords: SiteCoordinates): Resolution => {
  const url = raw.trim();
  let resolved: URL;
  try {
    resolved = new URL(url, documentUrl);
  } catch {
    return { kind: 'invalid' };
  }
  if (IGNORED_SCHEMES.has(resolved.protocol)) return { kind: 'ignored' };
  if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') return { kind: 'external' };
  if (resolved.origin !== coords.origin) return { kind: 'external' };
  const fragment = resolved.hash.length > 1 ? resolved.hash.slice(1) : null;
  return { kind: 'internal', pathname: resolved.pathname, fragment };
};

const decodeFragment = (fragment: string): string => {
  try {
    return decodeURIComponent(fragment);
  } catch {
    return fragment;
  }
};

/** Fragments that need no target element (HTML §7.4.6.3 "top"; text fragments). */
const isSpecialFragment = (fragment: string): boolean => fragment.toLowerCase() === 'top' || fragment.startsWith(':~:');

export interface SiteSnapshot {
  /** HTML documents by dist-relative path. */
  readonly pages: ReadonlyMap<string, string>;
  /** Stylesheets by dist-relative path. */
  readonly stylesheets: ReadonlyMap<string, string>;
  /** XML documents (sitemaps, feeds) by dist-relative path. */
  readonly xml: ReadonlyMap<string, string>;
  /** Every file in dist (dist-relative, "/"-separated). */
  readonly files: ReadonlySet<string>;
}

export interface LinkReport {
  readonly issues: readonly LinkIssue[];
  /** Number of internal references checked. */
  readonly checked: number;
  readonly external: number;
}

/** Checks every internal reference of the snapshot. Deterministic: issues are sorted. */
export const checkLinks = (site: SiteSnapshot, coords: SiteCoordinates): LinkReport => {
  const scans = new Map<string, ScannedHtml>();
  const scan = (path: string): ScannedHtml | undefined => {
    const cached = scans.get(path);
    if (cached !== undefined) return cached;
    const html = site.pages.get(path);
    if (html === undefined) return undefined;
    const s = scanHtml(html);
    scans.set(path, s);
    return s;
  };
  const ids = new Map<string, ReadonlySet<string>>();
  const idsOf = (path: string): ReadonlySet<string> | undefined => {
    const cached = ids.get(path);
    if (cached !== undefined) return cached;
    const s = scan(path);
    if (s === undefined) return undefined;
    const t = fragmentTargets(s);
    ids.set(path, t);
    return t;
  };

  const issues = new Map<string, LinkIssue>();
  let checked = 0;
  let external = 0;
  const report = (source: string, ref: Reference, reason: string): void => {
    issues.set(`${source}\u0000${ref.url}\u0000${reason}`, { source, url: ref.url, via: ref.via, reason });
  };

  const verify = (source: string, documentUrl: URL, ref: Reference): void => {
    const r = resolveReference(ref.url, documentUrl, coords);
    switch (r.kind) {
      case 'ignored':
        return;
      case 'external':
        external += 1;
        return;
      case 'invalid':
        report(source, ref, 'unparseable URL');
        return;
      case 'internal':
        break;
    }
    checked += 1;
    const target = distTargetOf(r.pathname, coords.base);
    if (target.kind === 'outside-base') {
      report(source, ref, `outside the base path ${target.base} (prefix links with import.meta.env.BASE_URL)`);
      return;
    }
    if (target.kind === 'missing-trailing-slash') {
      const exists = site.files.has(target.candidate);
      report(
        source,
        ref,
        exists ? 'missing trailing slash (trailingSlash: "always")' : 'no such page (and missing trailing slash)',
      );
      return;
    }
    if (!site.files.has(target.path)) {
      report(source, ref, `no such file: ${target.path}`);
      return;
    }
    if (r.fragment === null) return;
    const fragment = decodeFragment(r.fragment);
    if (isSpecialFragment(fragment)) return;
    const targets = idsOf(target.path);
    if (targets !== undefined && !targets.has(fragment)) report(source, ref, `no element with id="${fragment}" in ${target.path}`);
  };

  for (const path of [...site.pages.keys()].sort()) {
    const s = scan(path);
    if (s === undefined) continue;
    const url = pageUrlOf(path, coords);
    for (const ref of referencesOfTags(s.tags)) verify(path, url, ref);
    for (const raw of s.rawTexts) if (raw.tag.name === 'style') for (const ref of cssReferences(raw.text)) verify(path, url, ref);
  }
  for (const [path, css] of [...site.stylesheets].sort(([a], [b]) => byCodeUnit(a, b))) {
    const url = pageUrlOf(path, coords);
    for (const ref of cssReferences(css)) verify(path, url, ref);
  }
  for (const [path, xml] of [...site.xml].sort(([a], [b]) => byCodeUnit(a, b))) {
    const url = pageUrlOf(path, coords);
    for (const ref of xmlReferences(xml)) verify(path, url, ref);
  }

  const sorted = [...issues.values()].sort(
    (a, b) => byCodeUnit(a.source, b.source) || byCodeUnit(a.url, b.url) || byCodeUnit(a.reason, b.reason),
  );
  return { issues: sorted, checked, external };
};
