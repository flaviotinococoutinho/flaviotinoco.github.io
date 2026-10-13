/**
 * The guardrail scripts end to end (shell + pure core), on fixtures:
 * tests/fixtures/guardrails/{links,i18n}/{ok,bad} and generated budget sites.
 */
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { argument, listFiles, positional, readMatching } from '../../../scripts/lib/fs.ts';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const FIXTURES = path.join(ROOT, 'tests/fixtures/guardrails');
const ENV = { ...process.env, SITE: 'https://example.test', BASE_PATH: '/base', FORCE_COLOR: '0', NO_COLOR: '1' };

interface Run {
  readonly code: number;
  readonly out: string;
}

const run = (script: string, args: readonly string[]): Run => {
  const r = spawnSync(process.execPath, [path.join(ROOT, 'scripts', script), ...args], {
    cwd: ROOT,
    env: ENV,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return { code: r.status ?? -1, out: `${r.stdout}${r.stderr}` };
};

const temporary: string[] = [];
const tempSite = (files: Readonly<Record<string, string | Buffer>>): string => {
  const dir = mkdtempSync(path.join(tmpdir(), 'ft-budgets-'));
  temporary.push(dir);
  for (const [rel, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
    writeFileSync(path.join(dir, rel), content);
  }
  return dir;
};
afterAll(() => {
  for (const dir of temporary) rmSync(dir, { recursive: true, force: true });
});

describe('scripts/lib/fs.ts', () => {
  it('lists files recursively with "/" separators, sorted', async () => {
    const files = await listFiles(path.join(FIXTURES, 'links/ok'));
    expect(files).toContain('img/a b.svg');
    expect(files).toEqual([...files].sort());
    const html = await readMatching(path.join(FIXTURES, 'links/ok'), files, (f) => f.endsWith('.html'));
    expect([...html.keys()]).toEqual(['en/index.html', 'index.html', 'pt/index.html']);
  });

  it('parses --flag value and positional arguments', () => {
    expect(argument(['--content', 'x', 'dist'], 'content')).toBe('x');
    expect(argument(['dist'], 'content')).toBeUndefined();
    expect(positional(['--content', 'x', 'dist'])).toBe('dist');
    expect(positional(['--content', 'x'])).toBeUndefined();
  });
});

describe('check-links', () => {
  it('passes on a consistent site', () => {
    const r = run('check-links.ts', [path.join(FIXTURES, 'links/ok')]);
    expect(r.out).toContain('no broken internal references');
    expect(r.code).toBe(0);
  });

  it('fails and lists every broken reference', () => {
    const r = run('check-links.ts', [path.join(FIXTURES, 'links/bad')]);
    expect(r.code).toBe(1);
    expect(r.out).toContain('8 broken internal reference(s).');
    expect(r.out).toContain('✗ /base/img/gone.svg  [css url()]  no such file: img/gone.svg');
    expect(r.out).toContain('✗ https://example.test/base/fr/  [xml <loc>]  no such file: fr/index.html');
  });

  it('exits with 2 when there is no build', () => {
    expect(run('check-links.ts', [path.join(FIXTURES, 'does-not-exist')]).code).toBe(2);
  });
});

describe('check-i18n', () => {
  const args = (variant: string): readonly string[] => [
    '--catalogs',
    path.join(FIXTURES, `i18n/${variant}/catalogs`),
    '--content',
    path.join(FIXTURES, `i18n/${variant}/content`),
  ];

  it('passes on content in parity, warning about an untranslated draft', () => {
    const r = run('check-i18n.ts', args('ok'));
    expect(r.code).toBe(0);
    expect(r.out).toContain('content entries: essays 3, labs 2, pages 2, strata 8');
    expect(r.out).toContain('no en counterpart with translationKey "draft-only" in essays (draft)');
  });

  it('fails on every class of parity error', () => {
    const r = run('check-i18n.ts', args('bad'));
    expect(r.code).toBe(1);
    expect(r.out).toContain('check-i18n: 11 error(s).');
    for (const fragment of [
      'stratum "value" is missing in en',
      'placeholders differ: pt-BR [{ano}] vs en [{year}]',
      'nav.empty: pt-BR message is empty',
      'lang "pt-BR" does not match its folder (en)',
      'slug "mesma-rota" already used by',
      'no en counterpart with translationKey "only-pt" in essays',
      'missing frontmatter',
      'missing `translationKey` in frontmatter',
      'stratum "philosophy" is defined 2× in pt-BR',
    ]) {
      expect(r.out).toContain(fragment);
    }
  });
});

describe('check-budgets', () => {
  const page = (body: string): string =>
    `<!doctype html><html lang="en"><head><link rel="stylesheet" href="/base/_astro/a.css"><script type="module" src="/base/_astro/entry.js"></script></head><body>${body}</body></html>`;

  it('passes a light site and counts the static import graph, not lazy chunks', () => {
    const dir = tempSite({
      'en/index.html': page('<h1>ok</h1>'),
      '_astro/a.css': 'body{margin:0}',
      '_astro/entry.js': 'import"./dep.js";const l=()=>import("./lazy.js");',
      '_astro/dep.js': 'export const d=1;',
      // A lazy chunk far above the budget must not count as initial JS.
      '_astro/lazy.js': randomBytes(40 * 1024).toString('base64'),
      '_astro/k.wasm': Buffer.alloc(1024),
    });
    const r = run('check-budgets.ts', [dir]);
    expect(r.code).toBe(0);
    expect(r.out).toContain('check-budgets: 1 pages, 1 WebAssembly modules');
    expect(r.out).toContain('all budgets met');
  });

  it('fails on oversized initial JS, CSS, HTML and wasm', () => {
    const noise = (kib: number): string => randomBytes(kib * 1024).toString('base64');
    const dir = tempSite({
      'en/index.html': page(`<p>${noise(120)}</p>`),
      '_astro/a.css': `/*${noise(40)}*/`,
      '_astro/entry.js': 'import"./dep.js";',
      '_astro/dep.js': `export const d="${noise(16)}";`,
      '_astro/big.wasm': Buffer.alloc(49 * 1024, 1),
    });
    const r = run('check-budgets.ts', [dir]);
    expect(r.code).toBe(1);
    expect(r.out).toContain('4 budget violation(s)');
    expect(r.out).toMatch(/en\/index\.html: html .* > 150\.0 KiB/);
    expect(r.out).toMatch(/en\/index\.html: css .* > 30\.0 KiB/);
    expect(r.out).toMatch(/en\/index\.html: js .* > 12\.0 KiB/);
    expect(r.out).toMatch(/_astro\/big\.wasm: wasm 49\.0 KiB > 48\.0 KiB/);
  });

  it('runs on the fixture site used by check-links', () => {
    expect(run('check-budgets.ts', [path.join(FIXTURES, 'links/ok')]).code).toBe(0);
  });
});
