import { describe, expect, it } from 'vitest';
import { fc, test } from '@fast-check/vitest';
import { scanHtml } from '../../../scripts/lib/html.ts';
import {
  BUDGETS,
  KiB,
  evaluatePage,
  evaluateWasm,
  formatKiB,
  formatTable,
  moduleClosure,
  pageAssets,
  staticImports,
} from '../../../scripts/lib/budgets.ts';

const coords = { origin: 'https://example.test', base: '/b/' } as const;

describe('pageAssets', () => {
  it('separates render-blocking CSS, initial JS, preloads and inline code', () => {
    const html = `<head>
      <link rel="stylesheet" href="/b/_astro/a.css"><link rel="alternate stylesheet" href="/b/_astro/alt.css">
      <link rel="stylesheet" href="https://cdn.example/x.css">
      <link rel="modulepreload" href="/b/_astro/chunk.js">
      <link rel="preload" as="font" href="/b/_astro/fonts/f.woff2" crossorigin>
      <link rel="preload" as="image" href="/b/hero.png">
      <script>var a = 1;</script><script type="application/ld+json">{"@context":"https://schema.org"}</script>
      <script type="module" src="/b/_astro/entry.js"></script><script nomodule src="/b/legacy.js"></script>
      <script type="module" src="/b/_astro/entry.js"></script>
      <style>@font-face{}</style></head>`;
    expect(pageAssets(scanHtml(html), new URL('https://example.test/b/pt/'), coords)).toEqual({
      stylesheets: ['_astro/a.css'],
      scripts: ['_astro/entry.js'],
      modulePreloads: ['_astro/chunk.js'],
      fontPreloads: ['_astro/fonts/f.woff2'],
      inlineScripts: ['var a = 1;'],
      inlineStyles: ['@font-face{}'],
    });
  });
});

describe('staticImports', () => {
  it('finds every static import form emitted by bundlers', () => {
    const src = [
      'import"./side.js";',
      'import a from"./a.js";',
      'import{b as c,d}from"./b.js";',
      'import*as e from"./e.js";',
      'import f,{g}from"./f.js";',
      'export*from"./h.js";',
      'export{i}from"./i.js";',
      'export * as j from "./j.js";',
      "import k from './k.js'",
    ].join('');
    expect(staticImports(src)).toEqual([
      './side.js',
      './a.js',
      './b.js',
      './e.js',
      './f.js',
      './h.js',
      './i.js',
      './j.js',
      './k.js',
    ]);
  });

  it('ignores dynamic import(), import.meta and exports without a source', () => {
    const src = 'const m=()=>import("./lazy.js");const u=import.meta.url;export{u};export default"x";obj.import("./no.js")';
    expect(staticImports(src)).toEqual([]);
  });

  test.prop([fc.array(fc.stringMatching(/^\.\/[a-z]{1,8}\.js$/), { maxLength: 6 })])(
    'never reports a dynamically imported module',
    (specs) => {
      const src = specs.map((s, i) => `const m${i}=await import("${s}");`).join('');
      expect(staticImports(src)).toEqual([]);
    },
  );
});

describe('moduleClosure', () => {
  const modules: Record<string, string> = {
    'a.js': 'import"./b.js";import("./lazy.js")',
    'b.js': 'import{x}from"./c.js";import"./a.js"',
    'c.js': 'export const x=1',
    'lazy.js': 'export const y=2',
  };
  const read = (p: string): string | undefined => modules[p];
  const resolve = (s: string): string | undefined => (s.startsWith('./') ? s.slice(2) : undefined);

  it('follows static imports transitively, terminates on cycles and skips lazy chunks', () => {
    expect(moduleClosure(['a.js'], read, resolve)).toEqual(['a.js', 'b.js', 'c.js']);
    expect(moduleClosure([], read, resolve)).toEqual([]);
    expect(moduleClosure(['missing.js'], read, resolve)).toEqual(['missing.js']);
  });

  test.prop([fc.subarray(Object.keys(modules))])('is idempotent and contains its entries', (entries) => {
    const once = moduleClosure(entries, read, resolve);
    expect(moduleClosure(once, read, resolve)).toEqual(once);
    for (const e of entries) expect(once).toContain(e);
  });
});

describe('budget evaluation', () => {
  const page = { page: 'p/index.html', htmlRaw: 0, cssGzip: 0, jsGzip: 0, fontPreloadRaw: 0 };

  it('passes at the limit and fails one byte above it', () => {
    const atLimit = { ...page, htmlRaw: BUDGETS.htmlRaw, cssGzip: BUDGETS.cssGzip, jsGzip: BUDGETS.jsGzip };
    expect(evaluatePage(atLimit, BUDGETS)).toEqual([]);
    const over = { ...page, jsGzip: BUDGETS.jsGzip + 1 };
    expect(evaluatePage(over, BUDGETS)).toEqual([
      { subject: 'p/index.html', metric: 'js', actual: 12 * KiB + 1, limit: 12 * KiB, severity: 'error' },
    ]);
    expect(evaluateWasm('k.wasm', BUDGETS.wasmRaw, BUDGETS)).toEqual([]);
    expect(evaluateWasm('k.wasm', BUDGETS.wasmRaw + 1, BUDGETS)[0]?.metric).toBe('wasm');
  });

  it('only warns about preloaded fonts', () => {
    expect(evaluatePage({ ...page, fontPreloadRaw: 200 * KiB }, BUDGETS).map((v) => v.severity)).toEqual(['warning']);
  });

  it('prints the heaviest page first', () => {
    const table = formatTable(
      [
        { ...page, page: 'light/index.html', cssGzip: 1 * KiB },
        { ...page, page: 'heavy/index.html', cssGzip: 5 * KiB, jsGzip: 5 * KiB },
      ],
      BUDGETS,
    );
    const lines = table.split('\n');
    expect(lines[0]).toMatch(/^page\s+html raw/);
    expect(lines[2]).toMatch(/^heavy\/index\.html/);
    expect(lines[3]).toMatch(/^light\/index\.html/);
    expect(formatKiB(1536)).toBe('1.5 KiB');
  });
});
