/**
 * The strata texts (src/content/strata/{pt,en}/*.md) against their contract:
 * the content schema (src/content.config.ts), the editorial brief (150–300
 * words, one file per stratum and locale, file name = localised route slug)
 * and the closed authoring language (no directive at all — prose such as
 * "10:30" must not be parsed as one — and math only as $$…$$).
 */
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkMath from 'remark-math';
import remarkDirective from 'remark-directive';
import { visit } from 'unist-util-visit';
import { LOCALES, localeCodec, type Locale } from '../../../src/core/domain/locale.ts';
import { STRATA, isStratum } from '../../../src/core/domain/strata.ts';
import { STRATUM_SLUGS } from '../../../src/core/i18n/routes.ts';

const ROOT = fileURLToPath(new URL('../../../src/content/strata/', import.meta.url));

interface Doc {
  readonly file: string;
  readonly folder: string;
  readonly data: Readonly<Record<string, string>>;
  readonly body: string;
}

/** The frontmatter of these files is flat `key: value` YAML (no quoting, no nesting). */
const read = (folder: string, file: string): Doc => {
  const source = readFileSync(`${ROOT}${folder}/${file}`, 'utf8');
  const match = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(source);
  if (match === null) throw new Error(`${folder}/${file}: no frontmatter`);
  const data = Object.fromEntries(
    (match[1] ?? '').split('\n').map((line) => {
      const i = line.indexOf(':');
      return [line.slice(0, i).trim(), line.slice(i + 1).trim()];
    }),
  );
  return { file, folder, data, body: match[2] ?? '' };
};

const docs: readonly Doc[] = LOCALES.flatMap((locale) => {
  const folder = localeCodec.encode(locale);
  return readdirSync(`${ROOT}${folder}`)
    .filter((f) => f.endsWith('.md'))
    .map((f) => read(folder, f));
});

/** Words of the prose, display math excluded (a formula is not 20 words). */
const words = (body: string): number =>
  body
    .replace(/\$\$[\s\S]*?\$\$/g, ' ')
    .split(/\s+/)
    .filter((w) => /[\p{L}\p{N}]/u.test(w)).length;

describe('strata content', () => {
  it('has exactly one text per stratum and locale', () => {
    for (const locale of LOCALES) {
      const here = docs.filter((d) => d.data['lang'] === locale).map((d) => d.data['stratum']);
      expect([...here].sort()).toEqual([...STRATA].sort());
    }
    expect(docs).toHaveLength(STRATA.length * LOCALES.length);
  });

  it.each(docs.map((d) => [`${d.folder}/${d.file}`, d] as const))('%s follows the schema and brief', (_name, d) => {
    const stratum = d.data['stratum'];
    const lang = d.data['lang'] as Locale;
    expect(isStratum(stratum)).toBe(true);
    if (!isStratum(stratum)) return;
    expect(localeCodec.encode(lang)).toBe(d.folder);
    expect(d.file).toBe(`${STRATUM_SLUGS[stratum][lang]}.md`);
    expect(Object.keys(d.data).sort()).toEqual(['description', 'lang', 'method', 'question', 'stratum', 'title']);
    for (const value of Object.values(d.data)) expect(value.length).toBeGreaterThan(0);
    const description = d.data['description'] ?? '';
    expect(description.length).toBeGreaterThanOrEqual(40);
    expect(description.length).toBeLessThanOrEqual(180);
    const n = words(d.body);
    expect(n).toBeGreaterThanOrEqual(150);
    expect(n).toBeLessThanOrEqual(300);
  });

  it.each(docs.map((d) => [`${d.folder}/${d.file}`, d] as const))(
    '%s uses no directive and only $$ math',
    (_name, d) => {
      // Both extensions are syntax extensions (micromark): parsing alone yields their nodes.
      const tree = unified()
        .use(remarkParse)
        .use(remarkMath, { singleDollarTextMath: false })
        .use(remarkDirective)
        .parse(d.body);
      const kinds = new Set<string>();
      visit(tree, (node) => {
        kinds.add(node.type);
      });
      expect([...kinds].filter((k) => k.endsWith('Directive'))).toEqual([]);
      // Every "$" of the prose belongs to a $$…$$ formula.
      expect(d.body.replace(/\$\$[\s\S]*?\$\$/g, '')).not.toContain('$');
    },
  );
});
