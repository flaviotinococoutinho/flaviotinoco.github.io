/**
 * Guardrail: bilingual parity (pt-BR ⇄ en).
 *
 *   node scripts/check-i18n.ts [--catalogs dir] [--content dir]    (pnpm check:i18n)
 *
 * 1. Every message catalog in src/core/i18n/catalogs/*.ts: same keys in both
 *    locales, no empty message, identical {placeholders}.
 * 2. Every published translatable entry (essays, labs, pages) has a published
 *    counterpart in the other locale with the same translationKey (a work that
 *    is a draft in every locale only warns); folders agree with `lang`; no slug
 *    collides within a collection and locale.
 *    Frontmatter is parsed exactly as Astro parses it (scripts/lib/frontmatter.ts).
 * 3. The four strata exist exactly once per locale.
 * Rules: scripts/lib/i18n.ts (pure, unit-tested).
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { argument, listFiles } from './lib/fs.ts';
import { readFrontmatter } from './lib/frontmatter.ts';
import {
  LOCALE_FOLDERS,
  checkCatalog,
  checkStrata,
  checkTranslations,
  contentEntry,
  sortIssues,
  type ContentEntry,
  type Issue,
} from './lib/i18n.ts';

const argv = process.argv.slice(2);
const catalogsDir = path.resolve(argument(argv, 'catalogs') ?? 'src/core/i18n/catalogs');
const contentDir = path.resolve(argument(argv, 'content') ?? 'src/content');
const display = (file: string): string => path.relative(process.cwd(), file).split(path.sep).join('/');

const issues: Issue[] = [];

// 1. Catalogs ---------------------------------------------------------------
const catalogFiles = (await listFiles(catalogsDir).catch(() => [] as readonly string[])).filter(
  (f) => f.endsWith('.ts') && !f.includes('/'),
);
if (catalogFiles.length === 0)
  issues.push({ severity: 'error', where: display(catalogsDir), message: 'no catalogs found' });
let messageCount = 0;
for (const file of catalogFiles) {
  const absolute = path.join(catalogsDir, file);
  const where = display(absolute);
  try {
    const mod = (await import(pathToFileURL(absolute).href)) as { readonly default?: unknown };
    if (mod.default === undefined) {
      issues.push({ severity: 'error', where, message: 'catalog module has no default export' });
      continue;
    }
    issues.push(...checkCatalog(where, mod.default));
    const ptBR = (mod.default as { readonly 'pt-BR'?: object })['pt-BR'];
    messageCount += ptBR === undefined ? 0 : Object.keys(ptBR).length;
  } catch (e: unknown) {
    issues.push({ severity: 'error', where, message: `cannot load: ${String(e)}` });
  }
}

// 2–3. Content ----------------------------------------------------------------
const COLLECTIONS = ['essays', 'labs', 'pages', 'strata'] as const;
const entries: ContentEntry[] = [];
for (const collection of COLLECTIONS) {
  const dir = path.join(contentDir, collection);
  const files = (await listFiles(dir).catch(() => [] as readonly string[])).filter((f) => /\.mdx?$/.test(f));
  for (const file of files) {
    const absolute = path.join(dir, file);
    const where = display(absolute);
    const fm = readFrontmatter(await readFile(absolute, 'utf8'));
    if (!fm.ok) {
      issues.push({ severity: 'error', where, message: fm.error });
      continue;
    }
    const folder = file.split('/')[0] ?? '';
    const entry = contentEntry(collection, where, file.includes('/') ? LOCALE_FOLDERS[folder] : undefined, fm.value);
    if (entry.ok) entries.push(entry.value);
    else issues.push(...entry.error);
  }
}
issues.push(...checkTranslations(entries), ...checkStrata(entries, display(path.join(contentDir, 'strata'))));

// Report -----------------------------------------------------------------------
const counts = COLLECTIONS.map((c) => `${c} ${entries.filter((e) => e.collection === c).length}`).join(', ');
console.log(
  `check-i18n: ${catalogFiles.length} catalog(s), ${messageCount} message key(s); content entries: ${counts}.`,
);
const sorted = sortIssues(issues);
for (const issue of sorted) {
  const line = `${issue.severity === 'error' ? '✗' : '!'} ${issue.where}: ${issue.message}`;
  if (issue.severity === 'error') console.error(line);
  else console.warn(line);
}
const errors = sorted.filter((i) => i.severity === 'error').length;
if (errors > 0) {
  console.error(`\ncheck-i18n: ${errors} error(s).`);
  process.exit(1);
}
console.log('check-i18n: catalogs and content are in parity.');
