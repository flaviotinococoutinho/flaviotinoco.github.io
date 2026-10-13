/**
 * Guardrail: size budgets of the built site.
 *
 *   node scripts/check-budgets.ts [dist]        (pnpm check:budgets)
 *
 * Per page: raw HTML, render-blocking CSS (gzip), initial JS (gzip, static
 * import graph included) and preloaded fonts; every .wasm module (raw).
 * Budgets and their rationale: scripts/lib/budgets.ts. Prints a table sorted by
 * weight and fails on any budget error (font preloads only warn).
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { gzipSync } from 'node:zlib';
import { scanHtml } from './lib/html.ts';
import { resolveReference } from './lib/links.ts';
import { listFiles, positional } from './lib/fs.ts';
import { distTargetOf, pageUrlOf, siteCoordinates } from './lib/site.ts';
import {
  BUDGETS,
  evaluatePage,
  evaluateWasm,
  formatKiB,
  formatTable,
  moduleClosure,
  pageAssets,
  staticImports,
  type PageMeasure,
  type Violation,
} from './lib/budgets.ts';

const dist = path.resolve(positional(process.argv.slice(2)) ?? 'dist');
const coords = siteCoordinates(process.env);

const files = await listFiles(dist).catch((error: unknown) => {
  console.error(`check-budgets: cannot read ${dist} (${String(error)}). Build the site first.`);
  process.exit(2);
});
const fileSet = new Set(files);

const contents = new Map<string, Buffer>();
const load = async (file: string): Promise<Buffer | undefined> => {
  if (!fileSet.has(file)) return undefined;
  const cached = contents.get(file);
  if (cached !== undefined) return cached;
  const buffer = await readFile(path.join(dist, file));
  contents.set(file, buffer);
  return buffer;
};
const gz = (data: Buffer | string): number => gzipSync(data, { level: 6 }).byteLength;
const gzCache = new Map<string, number>();
const gzFile = async (file: string): Promise<number> => {
  const cached = gzCache.get(file);
  if (cached !== undefined) return cached;
  const buffer = await load(file);
  const size = buffer === undefined ? 0 : gz(buffer);
  gzCache.set(file, size);
  return size;
};

// Preload every JS module so the (synchronous, pure) closure can read sources.
await Promise.all(files.filter((f) => f.endsWith('.js') || f.endsWith('.mjs')).map(load));
const readModule = (file: string): string | undefined => contents.get(file)?.toString('utf8');
const resolveFrom = (base: URL) => (specifier: string): string | undefined => {
  const r = resolveReference(specifier, base, coords);
  if (r.kind !== 'internal') return undefined;
  const t = distTargetOf(r.pathname, coords.base);
  return t.kind === 'file' ? t.path : undefined;
};

const pages = files.filter((f) => f.endsWith('.html'));
if (pages.length === 0) {
  console.error(`check-budgets: no HTML pages in ${dist}.`);
  process.exit(2);
}

const rows: PageMeasure[] = [];
const missing: string[] = [];
for (const page of pages) {
  const html = (await load(page)) ?? Buffer.alloc(0);
  const pageUrl = pageUrlOf(page, coords);
  const assets = pageAssets(scanHtml(html.toString('utf8')), pageUrl, coords);
  const inlineEntries = assets.inlineScripts.flatMap((s) => staticImports(s).map(resolveFrom(pageUrl)));
  const modules = moduleClosure(
    [...assets.scripts, ...assets.modulePreloads, ...inlineEntries.filter((m): m is string => m !== undefined)],
    readModule,
    (specifier, from) => resolveFrom(pageUrlOf(from, coords))(specifier),
  );
  for (const ref of [...assets.stylesheets, ...modules, ...assets.fontPreloads]) {
    if (!fileSet.has(ref)) missing.push(`${page} → ${ref}`);
  }
  const cssFiles = await Promise.all(assets.stylesheets.map(gzFile));
  const jsFiles = await Promise.all(modules.map(gzFile));
  const fonts = await Promise.all(assets.fontPreloads.map(async (f) => (await load(f))?.byteLength ?? 0));
  const sum = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0);
  const inline = (xs: readonly string[]): number => (xs.length === 0 ? 0 : gz(xs.join('\n')));
  rows.push({
    page,
    htmlRaw: html.byteLength,
    cssGzip: sum(cssFiles) + inline(assets.inlineStyles),
    jsGzip: sum(jsFiles) + inline(assets.inlineScripts),
    fontPreloadRaw: sum(fonts),
  });
}

const wasm = await Promise.all(
  files.filter((f) => f.endsWith('.wasm')).map(async (f) => ({ file: f, raw: (await load(f))?.byteLength ?? 0 })),
);

const violations: Violation[] = [
  ...rows.flatMap((r) => evaluatePage(r, BUDGETS)),
  ...wasm.flatMap((w) => evaluateWasm(w.file, w.raw, BUDGETS)),
];

console.log(`check-budgets: ${rows.length} pages, ${wasm.length} WebAssembly modules in ${dist}\n`);
console.log(formatTable(rows, BUDGETS));
if (wasm.length > 0) {
  console.log(`\nWebAssembly (raw, ≤ ${formatKiB(BUDGETS.wasmRaw)} each)`);
  for (const w of [...wasm].sort((a, b) => b.raw - a.raw)) console.log(`  ${formatKiB(w.raw).padStart(10)}  ${w.file}`);
}
for (const m of missing) console.warn(`warning: referenced asset not found (see check:links): ${m}`);

const describe = (v: Violation): string =>
  `${v.subject}: ${v.metric} ${formatKiB(v.actual)} > ${formatKiB(v.limit)} (over by ${formatKiB(v.actual - v.limit)})`;
const warnings = violations.filter((v) => v.severity === 'warning');
const errors = violations.filter((v) => v.severity === 'error');
for (const w of warnings) console.warn(`warning: ${describe(w)}`);
if (errors.length > 0) {
  console.error(`\n${errors.length} budget violation(s):`);
  for (const e of errors) console.error(`  ✗ ${describe(e)}`);
  process.exit(1);
}
console.log('\ncheck-budgets: all budgets met.');
