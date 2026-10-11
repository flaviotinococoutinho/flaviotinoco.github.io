/**
 * Shell: compiles src/core/design/tokens.json → src/styles/tokens.css.
 *   node scripts/tokens.ts           write the file
 *   node scripts/tokens.ts --check   fail if the committed file is stale (CI guardrail)
 */
import { readFile, writeFile } from 'node:fs/promises';
import { compileCss, parseTokens } from '../src/core/design/tokens.ts';

const SOURCE = new URL('../src/core/design/tokens.json', import.meta.url);
const TARGET = new URL('../src/styles/tokens.css', import.meta.url);

const parsed = parseTokens(JSON.parse(await readFile(SOURCE, 'utf8')));
if (!parsed.ok) {
  console.error(`tokens.json is invalid:\n  - ${parsed.error.join('\n  - ')}`);
  process.exit(1);
}
const css = compileCss(parsed.value);

if (process.argv.includes('--check')) {
  const current = await readFile(TARGET, 'utf8').catch(() => '');
  if (current !== css) {
    console.error('src/styles/tokens.css is out of date. Run `pnpm tokens` and commit the result.');
    process.exit(1);
  }
  console.log('tokens.css is up to date.');
} else {
  await writeFile(TARGET, css);
  console.log(`wrote ${TARGET.pathname} (${css.length} bytes)`);
}
