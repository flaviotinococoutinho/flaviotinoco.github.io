/**
 * Guardrail: internal links of the built site.
 *
 *   node scripts/check-links.ts [dist]          (pnpm check:links)
 *
 * Crawls every HTML page, stylesheet and XML document (sitemaps, feeds) in
 * dist/, resolves each internal reference against the deployed URL (SITE and
 * BASE_PATH, same defaults as astro.config.ts) and fails if a target file or a
 * fragment id is missing. External URLs are counted but never fetched.
 * The logic lives in scripts/lib/links.ts (pure, unit-tested).
 */
import path from 'node:path';
import { checkLinks } from './lib/links.ts';
import { listFiles, positional, readMatching } from './lib/fs.ts';
import { siteCoordinates } from './lib/site.ts';

const dist = path.resolve(positional(process.argv.slice(2)) ?? 'dist');
const coords = siteCoordinates(process.env);

const files = await listFiles(dist).catch((error: unknown) => {
  console.error(`check-links: cannot read ${dist} (${String(error)}). Build the site first.`);
  process.exit(2);
});
const [pages, stylesheets, xml] = await Promise.all([
  readMatching(dist, files, (f) => f.endsWith('.html')),
  readMatching(dist, files, (f) => f.endsWith('.css')),
  readMatching(dist, files, (f) => f.endsWith('.xml')),
]);
if (pages.size === 0) {
  console.error(`check-links: no HTML pages in ${dist}.`);
  process.exit(2);
}

const report = checkLinks({ pages, stylesheets, xml, files: new Set(files) }, coords);

console.log(
  `check-links: ${pages.size} pages, ${stylesheets.size} stylesheets, ${xml.size} XML documents; ` +
    `${report.checked} internal references checked, ${report.external} external skipped ` +
    `(site ${coords.origin}${coords.base}).`,
);
if (report.issues.length > 0) {
  let source = '';
  for (const issue of report.issues) {
    if (issue.source !== source) {
      source = issue.source;
      console.error(`\n${source}`);
    }
    console.error(`  ✗ ${issue.url}  [${issue.via}]  ${issue.reason}`);
  }
  console.error(`\n${report.issues.length} broken internal reference(s).`);
  process.exit(1);
}
console.log('check-links: no broken internal references.');
