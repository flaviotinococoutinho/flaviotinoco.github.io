/**
 * Regression tests for the architecture rules in eslint.config.js: if a rule is
 * removed or weakened, these fail. Code is linted as if it lived at an existing
 * path, so the type-aware rules see a real project file.
 */
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { ESLint } from 'eslint';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
let eslint: ESLint;

// Warm-up: the first type-aware lint starts the TypeScript project service (seconds on a cold CI runner).
beforeAll(async () => {
  eslint = new ESLint({ cwd: ROOT });
  await eslint.lintText('export {};\n', { filePath: `${ROOT}src/core/algebra/pipe.ts` });
}, 120_000);

const rulesHit = async (code: string, filePath: string): Promise<readonly string[]> => {
  const [result] = await eslint.lintText(code, { filePath: `${ROOT}${filePath}` });
  return [...new Set((result?.messages ?? []).map((m) => m.ruleId ?? 'fatal'))].sort();
};

describe('functional core purity (src/core/**)', () => {
  const core = 'src/core/algebra/pipe.ts';

  it.each([
    ['I/O modules', `import { readFile } from 'node:fs/promises';\nexport const r = readFile;`, 'no-restricted-imports'],
    ['Astro modules', `import { getCollection } from 'astro:content';\nexport const g = getCollection;`, 'no-restricted-imports'],
    [
      'the shell, at any depth',
      `import { href } from '../../adapters/astro/i18n.ts';\nexport const h = href;`,
      'local/import-boundaries',
    ],
    ['the DOM', `export const t = (): string => document.title;`, 'no-restricted-globals'],
    ['the environment', `export const e = (): string | undefined => process.env['X'];`, 'no-restricted-globals'],
    ['randomness', `export const r = (): number => Math.random();`, 'no-restricted-properties'],
    ['the clock', `export const n = (): number => Date.now();`, 'no-restricted-properties'],
    ['the clock (new Date())', `export const d = (): Date => new Date();`, 'no-restricted-syntax'],
    ['import.meta', `export const u = (): string => import.meta.url;`, 'no-restricted-syntax'],
    ['throw', `export const f = (): never => {\n  throw new Error('x');\n};`, 'functional/no-throw-statements'],
    ['mutating inputs', `export const f = (o: { x: number }): void => {\n  o.x = 1;\n};`, 'no-param-reassign'],
    [
      'non-exhaustive switches',
      `export const f = (k: 'a' | 'b'): number => {\n  switch (k) {\n    case 'a':\n      return 1;\n    default:\n      return 2;\n  }\n};`,
      '@typescript-eslint/switch-exhaustiveness-check',
    ],
  ])('rejects %s', async (_label, code, rule) => {
    expect(await rulesHit(code, core)).toContain(rule);
  });

  it('accepts pure code: deterministic values, Result, local mutation, absurd()', async () => {
    const code = [
      `import { absurd } from './match.ts';`,
      `import { ok, type Result } from './result.ts';`,
      `export const sum = (xs: readonly number[]): Result<number, string> => {`,
      `  let total = 0;`,
      `  for (const x of xs) total += x;`,
      `  return ok(total);`,
      `};`,
      `export const at = (ms: number): Date => new Date(ms);`,
      `export const name = (k: 'a' | 'b'): string => {`,
      `  switch (k) {`,
      `    case 'a':`,
      `      return 'A';`,
      `    case 'b':`,
      `      return 'B';`,
      `    default:`,
      `      return absurd(k);`,
      `  }`,
      `};`,
      ``,
    ].join('\n');
    expect(await rulesHit(code, core)).toEqual([]);
  });
});

describe('layering of the browser shell (src/islands/**)', () => {
  it('rejects imports of the build-time Markdown pipeline', async () => {
    const code = `import { remarkAbnt } from '../adapters/unified/remark-abnt.ts';\nexport const x = remarkAbnt;\n`;
    expect(await rulesHit(code, 'src/islands/registry.ts')).toEqual(['local/import-boundaries', 'no-restricted-imports']);
  });

  it('allows the same import in the shell', async () => {
    const code = `import { remarkAbnt } from './remark-abnt.ts';\nexport const x = remarkAbnt;\n`;
    expect(await rulesHit(code, 'src/adapters/unified/pipeline.ts')).toEqual([]);
  });
});
