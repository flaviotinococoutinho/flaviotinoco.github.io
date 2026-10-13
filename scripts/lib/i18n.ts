/**
 * Bilingual parity rules (pure). The shell (scripts/check-i18n.ts) loads the
 * catalogs and reads the content files; everything decided here is data in,
 * issues out.
 *
 * Catalogs  — `defineMessages` already proves key parity at compile time; at
 *             run time we also reject empty strings and placeholder drift
 *             ("{year}" in pt-BR but "{ano}" in en would print a raw brace).
 * Content   — every translatable entry (essays, labs, pages) exists in both
 *             locales under the same translationKey; the folder agrees with
 *             `lang`; no two entries collide on (collection, locale, slug).
 * Strata    — the four strata exist exactly once in each locale.
 */
import { LOCALES, type Locale } from '../../src/core/domain/locale.ts';
import { STRATA } from '../../src/core/domain/strata.ts';
import { byCodeUnit } from './order.ts';

export type Severity = 'error' | 'warning';

export interface Issue {
  readonly severity: Severity;
  readonly where: string;
  readonly message: string;
}

const error = (where: string, message: string): Issue => ({ severity: 'error', where, message });
const warning = (where: string, message: string): Issue => ({ severity: 'warning', where, message });

/** Placeholder names of a message template, sorted and de-duplicated (same grammar as core/i18n/messages.ts). */
export const placeholders = (template: string): readonly string[] =>
  [...new Set([...template.matchAll(/\{([a-zA-Z0-9_]+)\}/g)].map((m) => m[1] ?? ''))].sort();

const isRecord = (v: unknown): v is Readonly<Record<string, unknown>> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const sameList = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((x, i) => x === b[i]);

/** Runtime parity of one message catalog ({ 'pt-BR': {...}, en: {...} }). */
export const checkCatalog = (name: string, catalog: unknown): readonly Issue[] => {
  if (!isRecord(catalog)) return [error(name, 'default export is not a catalog object (use defineMessages)')];
  const issues: Issue[] = [];
  const extra = Object.keys(catalog).filter((k) => !(LOCALES as readonly string[]).includes(k));
  for (const k of extra) issues.push(error(name, `unknown locale "${k}" (expected ${LOCALES.join(', ')})`));
  const tables = new Map<Locale, Readonly<Record<string, unknown>>>();
  for (const locale of LOCALES) {
    const table = catalog[locale];
    if (!isRecord(table)) issues.push(error(name, `missing messages for ${locale}`));
    else tables.set(locale, table);
  }
  if (tables.size !== LOCALES.length) return issues;

  const keys = [...new Set(LOCALES.flatMap((l) => Object.keys(tables.get(l) ?? {})))].sort();
  for (const key of keys) {
    const where = `${name} › ${key}`;
    const values = new Map<Locale, string>();
    for (const locale of LOCALES) {
      const value = tables.get(locale)?.[key];
      if (value === undefined) issues.push(error(where, `missing in ${locale}`));
      else if (typeof value !== 'string') issues.push(error(where, `${locale} value is not a string`));
      else if (value.trim() === '') issues.push(error(where, `${locale} message is empty`));
      else values.set(locale, value);
    }
    const [first, ...rest] = [...values.entries()];
    if (first === undefined) continue;
    const reference = placeholders(first[1]);
    const show = (names: readonly string[]): string => `[${names.map((n) => `{${n}}`).join(', ')}]`;
    for (const [locale, value] of rest) {
      const p = placeholders(value);
      if (!sameList(p, reference)) {
        issues.push(error(where, `placeholders differ: ${first[0]} ${show(reference)} vs ${locale} ${show(p)}`));
      }
    }
  }
  return issues;
};

export const TRANSLATABLE = ['essays', 'labs', 'pages'] as const;
export type Translatable = (typeof TRANSLATABLE)[number];

/** Folder name of a locale in src/content/<collection>/<folder>/. */
export const LOCALE_FOLDERS: Readonly<Record<string, Locale>> = { pt: 'pt-BR', en: 'en' };

export interface ContentEntry {
  readonly collection: string;
  /** Path for messages, e.g. "src/content/essays/pt/entropia.md". */
  readonly file: string;
  /** Locale implied by the folder (pt/ or en/), undefined if the folder is neither. */
  readonly folderLocale: Locale | undefined;
  readonly lang: string | undefined;
  readonly translationKey: string | undefined;
  readonly slug: string | undefined;
  readonly stratum: string | undefined;
  readonly draft: boolean;
}

const checkLocation = (e: ContentEntry): readonly Issue[] => {
  if (e.folderLocale === undefined) return [error(e.file, 'content must live under a pt/ or en/ folder')];
  if (e.lang === undefined) return [error(e.file, 'missing `lang` in frontmatter')];
  if (e.lang !== e.folderLocale)
    return [error(e.file, `lang "${e.lang}" does not match its folder (${e.folderLocale})`)];
  return [];
};

/** Translation parity of the translatable collections. */
export const checkTranslations = (entries: readonly ContentEntry[]): readonly Issue[] => {
  const issues: Issue[] = [];
  const groups = new Map<string, ContentEntry[]>();
  const routes = new Map<string, ContentEntry>();
  for (const e of entries) {
    if (!(TRANSLATABLE as readonly string[]).includes(e.collection)) continue;
    issues.push(...checkLocation(e));
    if (e.translationKey === undefined) {
      issues.push(error(e.file, 'missing `translationKey` in frontmatter'));
      continue;
    }
    const group = `${e.collection}\u0000${e.translationKey}`;
    groups.set(group, [...(groups.get(group) ?? []), e]);
    if (e.slug !== undefined && e.lang !== undefined) {
      const route = `${e.collection}\u0000${e.lang}\u0000${e.slug}`;
      const clash = routes.get(route);
      if (clash !== undefined)
        issues.push(error(e.file, `slug "${e.slug}" already used by ${clash.file} (same route)`));
      else routes.set(route, e);
    }
  }
  for (const members of groups.values()) {
    const sample = members[0];
    if (sample === undefined) continue;
    const key = sample.translationKey ?? '';
    for (const locale of LOCALES) {
      const inLocale = members.filter((m) => m.lang === locale);
      if (inLocale.length > 1) {
        issues.push(
          error(
            inLocale[1]?.file ?? sample.file,
            `translationKey "${key}" appears ${inLocale.length}× in ${locale} (${inLocale.map((m) => m.file).join(', ')})`,
          ),
        );
      }
      // Drafts are not built (src/adapters/astro/content.ts), so a work whose every
      // version is a draft only warns; a PUBLISHED work without a counterpart is an error.
      const published = members.filter((m) => !m.draft);
      if (inLocale.length === 0) {
        const message = `no ${locale} counterpart with translationKey "${key}" in ${sample.collection}`;
        const first = published[0];
        issues.push(first === undefined ? warning(sample.file, `${message} (draft)`) : error(first.file, message));
      } else if (inLocale.every((m) => m.draft)) {
        const first = published[0];
        if (first !== undefined) {
          issues.push(
            warning(
              first.file,
              `the ${locale} counterpart of translationKey "${key}" is still a draft: the published page has no translation yet`,
            ),
          );
        }
      }
    }
  }
  return issues;
};

/** The strata collection (located at `where`, for messages): each stratum exactly once per locale. */
export const checkStrata = (entries: readonly ContentEntry[], where = 'src/content/strata'): readonly Issue[] => {
  const issues: Issue[] = [];
  const strata = entries.filter((e) => e.collection === 'strata');
  for (const e of strata) {
    issues.push(...checkLocation(e));
    if (e.stratum === undefined || !(STRATA as readonly string[]).includes(e.stratum)) {
      issues.push(error(e.file, `stratum "${e.stratum ?? ''}" is not one of ${STRATA.join(', ')}`));
    }
  }
  for (const locale of LOCALES) {
    for (const stratum of STRATA) {
      const found = strata.filter((e) => e.lang === locale && e.stratum === stratum);
      if (found.length === 0) issues.push(error(where, `stratum "${stratum}" is missing in ${locale}`));
      const duplicate = found[1];
      if (duplicate !== undefined) {
        issues.push(error(duplicate.file, `stratum "${stratum}" is defined ${found.length}× in ${locale}`));
      }
    }
  }
  return issues;
};

/** Stable order for printing: errors first, then by location. */
export const sortIssues = (issues: readonly Issue[]): readonly Issue[] =>
  [...issues].sort(
    (a, b) =>
      (a.severity === b.severity ? 0 : a.severity === 'error' ? -1 : 1) ||
      byCodeUnit(a.where, b.where) ||
      byCodeUnit(a.message, b.message),
  );
