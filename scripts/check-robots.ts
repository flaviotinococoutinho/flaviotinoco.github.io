/**
 * Guardrail: search-engine indexing of the built site (ADR 0008).
 *
 *   node scripts/check-robots.ts [dist]         (pnpm check:robots)
 *
 * Reads every HTML page of dist/ and checks its robots meta rules against the
 * build-time switch SITE_INDEXING (default: off). Off: every page must say
 * noindex. On: only the 404 page and the language chooser may. The logic lives
 * in scripts/lib/robots.ts (pure, unit-tested).
 */
import path from 'node:path';
import { listFiles, positional, readMatching } from './lib/fs.ts';
import { INDEXING_ENV, checkRobots, indexingEnabled } from './lib/robots.ts';

const dist = path.resolve(positional(process.argv.slice(2)) ?? 'dist');
const indexing = indexingEnabled(process.env);

const files = await listFiles(dist).catch((error: unknown) => {
  console.error(`check-robots: cannot read ${dist} (${String(error)}). Build the site first.`);
  process.exit(2);
});
const pages = await readMatching(dist, files, (f) => f.endsWith('.html'));
if (pages.size === 0) {
  console.error(`check-robots: no HTML pages in ${dist}.`);
  process.exit(2);
}

const violations = checkRobots(pages, indexing);
console.log(
  `check-robots: ${String(pages.size)} pages; indexing ${indexing ? 'on' : 'off'} (${INDEXING_ENV}=${String(process.env[INDEXING_ENV] ?? '')}).`,
);
if (violations.length > 0) {
  console.error(`\n${String(violations.length)} page(s) break the indexing rule:`);
  for (const v of violations) console.error(`  ✗ ${v.page}: ${v.reason}`);
  process.exit(1);
}
