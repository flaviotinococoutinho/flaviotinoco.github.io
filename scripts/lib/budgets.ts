/**
 * Performance budgets of the built site (pure: sizes are measured by the shell).
 *
 * "Leveza como requisito" (docs/arquitetura.md §2.7): static HTML, no client
 * framework, behaviour loaded on demand. The budgets make that measurable:
 *
 *   HTML (raw)                   ≤ 160 KiB per page  — long essays with inline SVG, MathML and the words of their
 *                                                      formulas fit (ADR 0011); bloat does not.
 *   CSS  (gzip, render-blocking) ≤  30 KiB per page  — linked stylesheets + inline <style> (KaTeX ≈ 7 KiB gz included).
 *   JS   (gzip, initial)         ≤  12 KiB per page  — scripts that run at load: inline + src + their static import
 *                                                      graph + modulepreload. Dynamic import() (islands) is excluded.
 *   WASM (raw, each module)      ≤  48 KiB           — kernels without wasm-bindgen (ADR 0003).
 *   Fonts preloaded (raw)        ≤ 100 KiB per page  — warning only: woff2 is already compressed and
 *                                                      preloads compete with the HTML for bandwidth.
 *
 * Every HTML page is a content page: lab widgets are custom elements imported
 * lazily by the islands registry, so they never count as initial JS.
 * Sizes use gzip level 6 (the zlib default, what static CDNs typically serve);
 * 1 KiB = 1024 bytes.
 */
import type { ScannedHtml } from './html.ts';
import { resolveReference } from './links.ts';
import { byCodeUnit } from './order.ts';
import { distTargetOf, type SiteCoordinates } from './site.ts';

export const KiB = 1024;

export interface Budgets {
  readonly htmlRaw: number;
  readonly cssGzip: number;
  readonly jsGzip: number;
  readonly wasmRaw: number;
  /** Advisory: exceeding it prints a warning, it does not fail the build. */
  readonly fontPreloadRaw: number;
}

export const BUDGETS: Budgets = {
  htmlRaw: 160 * KiB,
  cssGzip: 30 * KiB,
  jsGzip: 12 * KiB,
  wasmRaw: 48 * KiB,
  fontPreloadRaw: 100 * KiB,
};

/** What a page loads before it is interactive, as dist-relative paths and inline sources. */
export interface PageAssets {
  readonly stylesheets: readonly string[];
  readonly scripts: readonly string[];
  readonly modulePreloads: readonly string[];
  readonly fontPreloads: readonly string[];
  readonly inlineScripts: readonly string[];
  readonly inlineStyles: readonly string[];
}

/** Script types that the browser does not execute as JavaScript (data blocks, import maps). */
const isJavaScriptType = (type: string | undefined): boolean => {
  const t = (type ?? '').trim().toLowerCase();
  return t === '' || t === 'module' || t === 'text/javascript' || t === 'application/javascript';
};

const tokens = (value: string | undefined): readonly string[] => (value ?? '').toLowerCase().split(/\s+/);

/** Extracts the render-blocking and initial assets of a page. */
export const pageAssets = (scan: ScannedHtml, pageUrl: URL, coords: SiteCoordinates): PageAssets => {
  const local = (raw: string | undefined): string | undefined => {
    if (raw === undefined) return undefined;
    const r = resolveReference(raw, pageUrl, coords);
    if (r.kind !== 'internal') return undefined;
    const t = distTargetOf(r.pathname, coords.base);
    return t.kind === 'file' ? t.path : undefined;
  };
  const stylesheets: string[] = [];
  const scripts: string[] = [];
  const modulePreloads: string[] = [];
  const fontPreloads: string[] = [];
  for (const tag of scan.tags) {
    if (tag.name === 'link') {
      const rel = tokens(tag.attrs.get('rel'));
      const href = local(tag.attrs.get('href'));
      if (href === undefined) continue;
      if (rel.includes('stylesheet') && !rel.includes('alternate')) stylesheets.push(href);
      if (rel.includes('modulepreload')) modulePreloads.push(href);
      if (rel.includes('preload') && (tag.attrs.get('as') ?? '').toLowerCase() === 'font') fontPreloads.push(href);
    }
    if (tag.name === 'script' && isJavaScriptType(tag.attrs.get('type')) && !tag.attrs.has('nomodule')) {
      const src = local(tag.attrs.get('src'));
      if (src !== undefined) scripts.push(src);
    }
  }
  const inlineScripts = scan.rawTexts
    .filter((r) => r.tag.name === 'script' && !r.tag.attrs.has('src') && isJavaScriptType(r.tag.attrs.get('type')))
    .map((r) => r.text)
    .filter((t) => t.trim().length > 0);
  const inlineStyles = scan.rawTexts.filter((r) => r.tag.name === 'style').map((r) => r.text);
  const unique = (xs: readonly string[]): readonly string[] => [...new Set(xs)];
  return {
    stylesheets: unique(stylesheets),
    scripts: unique(scripts),
    modulePreloads: unique(modulePreloads),
    fontPreloads: unique(fontPreloads),
    inlineScripts,
    inlineStyles,
  };
};

/**
 * Specifiers of the STATIC imports/re-exports of an ES module (`import x from "…"`,
 * `import "…"`, `export … from "…"`), which the browser fetches before running it.
 * Dynamic `import("…")` is lazy and deliberately not matched. A lexical
 * approximation suited to bundler output (no comments, one module per file).
 */
export const staticImports = (source: string): readonly string[] => {
  const STATIC = [
    // import x from "m" · import {a as b} from "m" · import * as n from "m" · import x, {a} from "m"
    /(?:^|[^\w$.])import\s*(?:[\w$]+\s*(?:,\s*)?)?(?:\*\s*as\s*[\w$]+|\{[^}]*\})?\s*from\s*(["'])([^"'\n]+)\1/g,
    // import "m"   (side effects only)
    /(?:^|[^\w$.])import\s*(["'])([^"'\n]+)\1/g,
    // export * from "m" · export * as n from "m" · export {a} from "m"
    /(?:^|[^\w$.])export\s*(?:\*\s*(?:as\s+[\w$]+\s*)?|\{[^}]*\}\s*)from\s*(["'])([^"'\n]+)\1/g,
  ];
  const found: { readonly at: number; readonly specifier: string }[] = [];
  for (const re of STATIC) for (const m of source.matchAll(re)) found.push({ at: m.index, specifier: m[2] ?? '' });
  return found.sort((a, b) => a.at - b.at).map((f) => f.specifier);
};

/**
 * Transitive closure of static imports from `entries` (dist paths). `read`
 * returns a module's source (undefined if missing); `resolve` maps a specifier
 * relative to the importing module to a dist path (undefined for externals).
 */
export const moduleClosure = (
  entries: readonly string[],
  read: (path: string) => string | undefined,
  resolve: (specifier: string, from: string) => string | undefined,
): readonly string[] => {
  const seen = new Set<string>();
  const stack = [...entries];
  while (stack.length > 0) {
    const next = stack.pop();
    if (next === undefined || seen.has(next)) continue;
    seen.add(next);
    const source = read(next);
    if (source === undefined) continue;
    for (const specifier of staticImports(source)) {
      const target = resolve(specifier, next);
      if (target !== undefined && !seen.has(target)) stack.push(target);
    }
  }
  return [...seen].sort();
};

export interface PageMeasure {
  readonly page: string;
  readonly htmlRaw: number;
  readonly cssGzip: number;
  readonly jsGzip: number;
  readonly fontPreloadRaw: number;
}

export interface Violation {
  readonly subject: string;
  readonly metric: 'html' | 'css' | 'js' | 'wasm' | 'fonts';
  readonly actual: number;
  readonly limit: number;
  readonly severity: 'error' | 'warning';
}

export const evaluatePage = (m: PageMeasure, b: Budgets): readonly Violation[] => {
  const out: Violation[] = [];
  const check = (metric: Violation['metric'], actual: number, limit: number, severity: Violation['severity']): void => {
    if (actual > limit) out.push({ subject: m.page, metric, actual, limit, severity });
  };
  check('html', m.htmlRaw, b.htmlRaw, 'error');
  check('css', m.cssGzip, b.cssGzip, 'error');
  check('js', m.jsGzip, b.jsGzip, 'error');
  check('fonts', m.fontPreloadRaw, b.fontPreloadRaw, 'warning');
  return out;
};

export const evaluateWasm = (file: string, raw: number, b: Budgets): readonly Violation[] =>
  raw > b.wasmRaw ? [{ subject: file, metric: 'wasm', actual: raw, limit: b.wasmRaw, severity: 'error' }] : [];

export const formatKiB = (bytes: number): string => `${(bytes / KiB).toFixed(1)} KiB`;

/**
 * Plain-text table, heaviest pages first (by gzip CSS + JS, then raw HTML), so
 * the page closest to a budget is always on the first line.
 */
export const formatTable = (rows: readonly PageMeasure[], b: Budgets): string => {
  const sorted = [...rows].sort(
    (x, y) => y.cssGzip + y.jsGzip - (x.cssGzip + x.jsGzip) || y.htmlRaw - x.htmlRaw || byCodeUnit(x.page, y.page),
  );
  const header = [
    'page',
    `html raw (≤${formatKiB(b.htmlRaw)})`,
    `css gz (≤${formatKiB(b.cssGzip)})`,
    `js gz (≤${formatKiB(b.jsGzip)})`,
    `fonts preload`,
  ];
  const body = sorted.map((r) => [
    r.page,
    formatKiB(r.htmlRaw),
    formatKiB(r.cssGzip),
    formatKiB(r.jsGzip),
    formatKiB(r.fontPreloadRaw),
  ]);
  const widths = header.map((h, i) => Math.max(h.length, ...body.map((row) => (row[i] ?? '').length)));
  const line = (cells: readonly string[]): string =>
    cells.map((c, i) => (i === 0 ? c.padEnd(widths[i] ?? 0) : c.padStart(widths[i] ?? 0))).join('  ');
  return [line(header), widths.map((w) => '─'.repeat(w)).join('  '), ...body.map(line)].join('\n');
};
