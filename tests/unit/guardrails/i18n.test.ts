import { readdir } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { fc, test } from '@fast-check/vitest';
import {
  checkCatalog,
  checkStrata,
  checkTranslations,
  placeholders,
  sortIssues,
  type ContentEntry,
} from '../../../scripts/lib/i18n.ts';
import { STRATA } from '../../../src/core/domain/strata.ts';
import { LOCALES } from '../../../src/core/domain/locale.ts';

const entry = (over: Partial<ContentEntry>): ContentEntry => ({
  collection: 'essays',
  file: 'f.md',
  folderLocale: 'pt-BR',
  lang: 'pt-BR',
  translationKey: 'k',
  slug: 's',
  stratum: undefined,
  draft: false,
  ...over,
});

const pair = (collection: string, key: string): readonly ContentEntry[] => [
  entry({ collection, file: `${collection}/pt/${key}.md`, translationKey: key, slug: key }),
  entry({ collection, file: `${collection}/en/${key}.md`, folderLocale: 'en', lang: 'en', translationKey: key, slug: key }),
];

const allStrata: readonly ContentEntry[] = LOCALES.flatMap((lang) =>
  STRATA.map((stratum) =>
    entry({ collection: 'strata', file: `strata/${lang}/${stratum}.md`, folderLocale: lang, lang, stratum }),
  ),
);

describe('placeholders', () => {
  it('extracts the {name} placeholders of core/i18n/messages.ts, sorted and unique', () => {
    expect(placeholders('{b} de {a}, {b}! {not a placeholder} {}')).toEqual(['a', 'b']);
  });
});

describe('checkCatalog', () => {
  it('accepts catalogs in parity', () => {
    expect(checkCatalog('c', { 'pt-BR': { a: 'Olá, {nome}', b: 'x' }, en: { a: 'Hi, {nome}', b: 'y' } })).toEqual([]);
  });

  it('rejects shape errors, missing keys, empty messages and placeholder drift', () => {
    expect(checkCatalog('c', 'nope').map((i) => i.message)).toEqual([
      'default export is not a catalog object (use defineMessages)',
    ]);
    expect(checkCatalog('c', { 'pt-BR': {}, fr: {} }).map((i) => i.message)).toEqual([
      'unknown locale "fr" (expected pt-BR, en)',
      'missing messages for en',
    ]);
    const issues = checkCatalog('c', {
      'pt-BR': { a: '{ano}', b: ' ', c: 'só pt', d: 1 },
      en: { a: '{year}', b: 'B', d: 'D' },
    });
    expect(issues.map((i) => `${i.where}: ${i.message}`)).toEqual([
      'c › a: placeholders differ: pt-BR [{ano}] vs en [{year}]',
      'c › b: pt-BR message is empty',
      'c › c: missing in en',
      'c › d: pt-BR value is not a string',
    ]);
  });

  const key = fc.stringMatching(/^[a-z]{1,6}(\.[a-z]{1,6})?$/);
  const word = fc.stringMatching(/^[A-Za-zÀ-ú][A-Za-zÀ-ú ]{0,11}$/);
  const name = fc.stringMatching(/^[a-z]{1,5}$/);
  test.prop([fc.dictionary(key, fc.tuple(word, word, fc.uniqueArray(name, { maxLength: 3 })), { minKeys: 1 })])(
    'a catalog whose locales share keys and placeholders has no issues, in any placeholder order',
    (spec) => {
      const pt: Record<string, string> = {};
      const en: Record<string, string> = {};
      for (const [k, [w1, w2, names]] of Object.entries(spec)) {
        pt[k] = `${w1} ${names.map((n) => `{${n}}`).join(' ')}`;
        en[k] = `${[...names].reverse().map((n) => `{${n}}`).join(' ')} ${w2}`;
      }
      expect(checkCatalog('generated', { 'pt-BR': pt, en })).toEqual([]);
    },
  );

  it('passes on every real catalog in src/core/i18n/catalogs', async () => {
    const dir = new URL('../../../src/core/i18n/catalogs/', import.meta.url);
    const files = (await readdir(dir)).filter((f) => f.endsWith('.ts'));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const mod = (await import(new URL(file, dir).href)) as { readonly default: unknown };
      expect(checkCatalog(file, mod.default)).toEqual([]);
    }
  });
});

describe('checkTranslations', () => {
  it('accepts paired entries', () => {
    expect(checkTranslations([...pair('essays', 'a'), ...pair('labs', 'b'), ...pair('pages', 'c')])).toEqual([]);
  });

  it('ignores non-translatable collections', () => {
    expect(checkTranslations([entry({ collection: 'concepts', lang: undefined })])).toEqual([]);
  });

  it('reports missing counterparts, wrong folders, duplicates and route clashes', () => {
    const issues = checkTranslations([
      entry({ file: 'only-pt.md', translationKey: 'only', slug: 'only' }),
      entry({ file: 'draft.md', translationKey: 'draft', slug: 'draft', draft: true }),
      entry({ file: 'nofolder.md', folderLocale: undefined, translationKey: 'x', slug: 'x1' }),
      entry({ file: 'en/x.md', folderLocale: 'en', lang: 'en', translationKey: 'x', slug: 'x' }),
      entry({ file: 'nolang.md', lang: undefined, translationKey: 'y', slug: 'y' }),
      entry({ file: 'nokey.md', translationKey: undefined }),
      entry({ file: 'dup-a.md', translationKey: 'z', slug: 'z1' }),
      entry({ file: 'dup-b.md', translationKey: 'z', slug: 'z1' }),
      entry({ file: 'en/z.md', folderLocale: 'en', lang: 'en', translationKey: 'z', slug: 'z' }),
    ]);
    expect(sortIssues(issues).map((i) => `${i.severity} ${i.where}: ${i.message}`)).toEqual([
      'error dup-b.md: slug "z1" already used by dup-a.md (same route)',
      'error dup-b.md: translationKey "z" appears 2× in pt-BR (dup-a.md, dup-b.md)',
      'error nofolder.md: content must live under a pt/ or en/ folder',
      'error nokey.md: missing `translationKey` in frontmatter',
      'error nolang.md: missing `lang` in frontmatter',
      'error nolang.md: no en counterpart with translationKey "y" in essays',
      'error nolang.md: no pt-BR counterpart with translationKey "y" in essays',
      'error only-pt.md: no en counterpart with translationKey "only" in essays',
      'warning draft.md: no en counterpart with translationKey "draft" in essays (draft)',
    ]);
  });
});

describe('checkStrata', () => {
  it('accepts the four strata in both locales', () => {
    expect(checkStrata(allStrata)).toEqual([]);
  });

  it('reports missing, duplicated and unknown strata', () => {
    const [first, ...rest] = allStrata;
    const issues = checkStrata([
      ...rest,
      entry({ collection: 'strata', file: 'dup.md', lang: 'en', folderLocale: 'en', stratum: 'value' }),
      entry({ collection: 'strata', file: 'odd.md', stratum: 'poetry' }),
    ]);
    expect(first?.stratum).toBe('philosophy');
    expect(issues.map((i) => `${i.where}: ${i.message}`)).toEqual([
      'odd.md: stratum "poetry" is not one of philosophy, theory, formal, value',
      'src/content/strata: stratum "philosophy" is missing in pt-BR',
      'dup.md: stratum "value" is defined 2× in en',
    ]);
  });
});
