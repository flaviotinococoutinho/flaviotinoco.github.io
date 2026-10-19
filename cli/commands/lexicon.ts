/**
 * ft lexicon build|check|add|stats
 *
 *   build [--from <file|url>] [--aff <file|url>] [--fp 0.001] [--locale pt-BR] [--license <text>]
 *       Builds the Bloom filter of a general lexicon (default: the pinned
 *       LibreOffice VERO pt-BR Hunspell dictionary, see VERO below) into
 *       .cache/lexicon/<locale>.bloom + <locale>.json (provenance). A .dic
 *       expands its affixes when the .aff is given or found next to it
 *       (same name, .aff); a .gz input is decompressed.
 *   check <word…> [--locale pt-BR]
 *       "definitely not in the lexicon" (certain) vs "probably in the lexicon (fp ≈ p)".
 *   add <term> --kind foreign|latin|proper|acronym --lang <tag> [--case …] [--variants a|b]
 *       [--vernacular-in en] [--note …] [--category …] [--expansion-pt … --expansion-en …]
 *       [--expansion-lang <tag>] [--dry-run]
 *       Appends a row to the right lexicon/*.tsv after re-parsing every dictionary
 *       with it (the build's parser) and refusing a term already in any dictionary.
 *   stats [--locale …]
 *       Entries per kind and file, matcher engine and pattern sizes, and the filter.
 */
import { createHash } from 'node:crypto';
import { basename, join, resolve } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { isLocale, LOCALES, type Locale } from '../../src/core/domain/locale.ts';
import {
  bloomHas,
  buildBloom,
  encodeBloom,
  expectedFalsePositiveRate,
  BLOOM_VERSION,
} from '../../src/core/lexicon/bloom.ts';
import { compileLexicon } from '../../src/core/lexicon/compile.ts';
import { parseLanguageTag } from '../../src/core/lexicon/language-tag.ts';
import { formatIssue, LEXICON_FILES, parseLexicon } from '../../src/core/lexicon/parse.ts';
import { fold } from '../../src/core/lexicon/text.ts';
import { CASE_POLICIES, PROPER_CATEGORIES, type LexiconEntry } from '../../src/core/lexicon/types.ts';
import { bool, openSession, parseCommand, parseUiLocale, str, type Session } from '../args.ts';
import { EXIT_FAILURE, EXIT_OK, type ExitCode, type Io } from '../io.ts';
import { ADDABLE_KINDS, appendRow, breaksTsv, fileOfKind, rowFields, type AddableKind } from '../lexicon/append.ts';
import { parseAff, type Affixes } from '../lexicon/hunspell.ts';
import { bloomPaths, describeBloomError, readStoredBloom, type Provenance, type SourceRecord } from '../lexicon/store.ts';
import { collectKeys, formatOf } from '../lexicon/wordlist.ts';
import { display } from '../project.ts';
import { LEXICON_DIR, readLexiconSources } from '../sources.ts';
import { table } from '../term.ts';
import { numberOption, usageError } from './shared.ts';

/**
 * Default source: LibreOffice's pt-BR dictionary (VERO 3.x, Raimundo Moura et al.),
 * pinned to commit 32b006a2 of github.com/LibreOffice/dictionaries
 * (docs/research/lexicon.md §3). SHA-256 of both files verified on 2026-10-19;
 * a different download is refused (reproducible builds).
 */
export const VERO = {
  dic: 'https://raw.githubusercontent.com/LibreOffice/dictionaries/32b006a2c22a4ac7e8ed3f03346f7b3d85a970a4/pt_BR/pt_BR.dic',
  aff: 'https://raw.githubusercontent.com/LibreOffice/dictionaries/32b006a2c22a4ac7e8ed3f03346f7b3d85a970a4/pt_BR/pt_BR.aff',
  sha256: {
    dic: 'a38bfb26b68ece2834e79fe83e48d5792652970ace12db89d1b9674bf9933183',
    aff: '21d8ad2a769a60e17e2b5ea4ef11d4d593a58b9e2a82d642ef82d6a4c5523865',
  },
  license: 'LGPL-3.0 / MPL (dual licence; pt_BR/README_pt_BR.txt of the pinned commit)',
  notice:
    'Derived from VERO, the pt-BR Hunspell dictionary of LibreOffice (© 2006–2013 Raimundo Santos Moura and contributors), licensed under the LGPLv3 and the Mozilla Public License.',
} as const;

export const DEFAULT_FALSE_POSITIVE_RATE = 0.001;

export const OPTIONS = {
  lang: { type: 'string' },
  from: { type: 'string' },
  aff: { type: 'string' },
  fp: { type: 'string' },
  locale: { type: 'string' },
  license: { type: 'string' },
  kind: { type: 'string' },
  case: { type: 'string' },
  variants: { type: 'string' },
  'vernacular-in': { type: 'string' },
  note: { type: 'string' },
  category: { type: 'string' },
  'expansion-pt': { type: 'string' },
  'expansion-en': { type: 'string' },
  'expansion-lang': { type: 'string' },
  'dry-run': { type: 'boolean' },
} as const;

const isUrl = (s: string): boolean => /^https?:\/\//iu.test(s);

const sha256 = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex');

/** UTF-8 text of an input (gzip is detected by its magic bytes, RFC 1952). */
const textOf = (bytes: Uint8Array): string => {
  const plain = bytes[0] === 0x1f && bytes[1] === 0x8b ? new Uint8Array(gunzipSync(bytes)) : bytes;
  return new TextDecoder('utf-8', { fatal: false }).decode(plain);
};

const fetchOrRead = async (session: Session, location: string): Promise<{ readonly bytes: Uint8Array; readonly record: SourceRecord }> => {
  const bytes = isUrl(location)
    ? await session.io.fetch(location)
    : await session.io.fs.readBytes(resolve(session.io.cwd, location));
  const shown = isUrl(location) ? location : display(session.root, resolve(session.io.cwd, location));
  return { bytes, record: { location: shown, sha256: sha256(bytes), bytes: bytes.length } };
};

const localeOption = (session: Session, raw: string | undefined): Locale | undefined =>
  raw === undefined ? 'pt-BR' : isLocale(raw) ? raw : parseUiLocale(raw);

/* ------------------------------------------------------------------ build */

const build = async (session: Session, values: Parameters<typeof str>[0]): Promise<ExitCode> => {
  const { t, io } = session;
  const locale = localeOption(session, str(values, 'locale'));
  if (locale === undefined) return usageError(io, 'lexicon', t('lexicon.locale', { value: str(values, 'locale') ?? '' }), session);
  const p = numberOption(str(values, 'fp')) ?? DEFAULT_FALSE_POSITIVE_RATE;
  if (!(p > 0 && p < 1)) return usageError(io, 'lexicon', t('lexicon.fp', { value: str(values, 'fp') ?? '' }), session);
  const from = str(values, 'from') ?? VERO.dic;
  const pinned = from === VERO.dic;
  const format = formatOf(from);
  session.print(t('lexicon.reading', { source: from }));
  let source: Awaited<ReturnType<typeof fetchOrRead>>;
  try {
    source = await fetchOrRead(session, from);
  } catch (e: unknown) {
    session.warn(session.errStyle.red(t('lexicon.unreadable', { source: from, detail: e instanceof Error ? e.message : String(e) })));
    return EXIT_FAILURE;
  }
  if (pinned && source.record.sha256 !== VERO.sha256.dic) {
    session.warn(session.errStyle.red(t('lexicon.checksum', { source: from, expected: VERO.sha256.dic, actual: source.record.sha256 })));
    return EXIT_FAILURE;
  }
  // The .aff: explicit, the pinned one, or a sibling of a local .dic.
  let affixes: Affixes | undefined;
  let affRecord: SourceRecord | undefined;
  if (format === 'hunspell') {
    const sibling = isUrl(from) ? undefined : resolve(io.cwd, from.replace(/\.dic(\.gz)?$/iu, '.aff'));
    const affLocation =
      str(values, 'aff') ?? (pinned ? VERO.aff : sibling !== undefined && (await io.fs.exists(sibling)) ? sibling : undefined);
    if (affLocation === undefined) session.warn(session.errStyle.yellow(t('lexicon.noAff')));
    else {
      try {
        const aff = await fetchOrRead(session, affLocation);
        if (pinned && aff.record.sha256 !== VERO.sha256.aff) {
          session.warn(session.errStyle.red(t('lexicon.checksum', { source: affLocation, expected: VERO.sha256.aff, actual: aff.record.sha256 })));
          return EXIT_FAILURE;
        }
        const parsed = parseAff(textOf(aff.bytes));
        if (!parsed.ok) {
          for (const problem of parsed.error) session.warn(session.errStyle.red(`${affLocation}: ${problem}`));
          return EXIT_FAILURE;
        }
        affixes = parsed.value;
        affRecord = aff.record;
      } catch (e: unknown) {
        session.warn(session.errStyle.red(t('lexicon.unreadable', { source: affLocation, detail: e instanceof Error ? e.message : String(e) })));
        return EXIT_FAILURE;
      }
    }
  }
  const collected = collectKeys(format, textOf(source.bytes), affixes);
  if (collected.keys.length === 0) {
    session.warn(session.errStyle.red(t('lexicon.empty', { source: from })));
    return EXIT_FAILURE;
  }
  const built = buildBloom(collected.keys, { falsePositiveRate: p });
  if (!built.ok) {
    session.warn(session.errStyle.red(built.error));
    return EXIT_FAILURE;
  }
  const { header } = built.value;
  const license = str(values, 'license') ?? (pinned ? VERO.license : 'unknown');
  if (license === 'unknown') session.warn(session.errStyle.yellow(t('lexicon.noLicense')));
  const provenance: Provenance = {
    tool: 'ft lexicon build',
    format: 'LXBF',
    formatVersion: BLOOM_VERSION,
    locale,
    source: source.record,
    ...(affRecord === undefined ? {} : { affixes: affRecord }),
    sourceFormat: format,
    license,
    notice: pinned ? VERO.notice : `Derived from ${source.record.location} (licence: ${license}).`,
    entries: collected.entries,
    n: header.n,
    m: header.m,
    k: header.k,
    targetFalsePositiveRate: p,
    expectedFalsePositiveRate: expectedFalsePositiveRate(header.m, header.k, header.n),
    normalisation: 'NFC + case fold',
    builtAt: io.now().toISOString(),
  };
  const paths = bloomPaths(session.root, locale);
  await io.fs.writeBytes(paths.filter, encodeBloom(built.value));
  await io.fs.writeText(paths.sidecar, `${JSON.stringify(provenance, null, 2)}\n`);
  session.print(
    session.out.green(
      t('lexicon.built', {
        path: display(session.root, paths.filter),
        n: header.n,
        m: header.m,
        k: header.k,
        bytes: header.m / 8,
        fp: provenance.expectedFalsePositiveRate.toExponential(2),
      }),
    ),
  );
  return EXIT_OK;
};

/* ------------------------------------------------------------------ check */

const dictionaryIndex = (entries: readonly LexiconEntry[]): ReadonlyMap<string, LexiconEntry> => {
  const out = new Map<string, LexiconEntry>();
  for (const e of entries) {
    const spellings = e.kind === 'foreign' || e.kind === 'latin' ? [e.term, ...e.variants] : [e.term];
    for (const s of spellings) if (!out.has(fold(s))) out.set(fold(s), e);
  }
  return out;
};

const check = async (session: Session, values: Parameters<typeof str>[0], words: readonly string[]): Promise<ExitCode> => {
  const { t, io } = session;
  if (words.length === 0) return usageError(io, 'lexicon', t('lexicon.noWords'), session);
  const locale = localeOption(session, str(values, 'locale'));
  if (locale === undefined) return usageError(io, 'lexicon', t('lexicon.locale', { value: str(values, 'locale') ?? '' }), session);
  const stored = await readStoredBloom(session.root, locale, io.fs);
  if (stored === undefined) {
    session.warn(session.errStyle.red(t('lexicon.missingFilter', { locale })));
    return EXIT_FAILURE;
  }
  if (!stored.ok) {
    session.warn(session.errStyle.red(describeBloomError(stored.error)));
    return EXIT_FAILURE;
  }
  const { filter } = stored.value;
  const fp = expectedFalsePositiveRate(filter.header.m, filter.header.k, filter.header.n);
  const lexicon = parseLexicon(await readLexiconSources(session.root, io.fs));
  const dictionary = lexicon.ok ? dictionaryIndex(lexicon.value.entries) : new Map<string, LexiconEntry>();
  const rows: string[][] = [];
  for (const word of words) {
    const inFilter = bloomHas(filter, word);
    const entry = dictionary.get(fold(word.normalize('NFC')));
    const verdict = inFilter
      ? session.out.green(t('lexicon.probably', { fp: fp.toExponential(2) }))
      : session.out.yellow(t('lexicon.definitelyNot'));
    rows.push([word, verdict, entry === undefined ? '' : t('lexicon.inDictionary', { kind: entry.kind, file: entry.source.file, line: entry.source.line })]);
  }
  for (const line of table(rows)) session.print(line.trimEnd());
  return EXIT_OK;
};

/* -------------------------------------------------------------------- add */

const add = async (session: Session, values: Parameters<typeof str>[0], positionals: readonly string[]): Promise<ExitCode> => {
  const { t, io } = session;
  const [term, ...extra] = positionals;
  if (term === undefined || extra.length > 0) return usageError(io, 'lexicon', t('lexicon.addTerm'), session);
  const kindRaw = str(values, 'kind');
  if (kindRaw === undefined || !(ADDABLE_KINDS as readonly string[]).includes(kindRaw)) {
    return usageError(io, 'lexicon', t('lexicon.kind', { value: kindRaw ?? '', kinds: ADDABLE_KINDS.join(', ') }), session);
  }
  const kind = kindRaw as AddableKind;
  const lang = str(values, 'lang');
  if (lang === undefined) return usageError(io, 'lexicon', t('lexicon.lang'), session);
  const tag = parseLanguageTag(lang);
  const problems: string[] = [];
  if (!tag.ok) problems.push(tag.error);
  const casePolicy = str(values, 'case') ?? (kind === 'proper' || kind === 'acronym' ? 'exact' : 'sentence');
  if (!(CASE_POLICIES as readonly string[]).includes(casePolicy)) problems.push(t('lexicon.case', { value: casePolicy }));
  const category = str(values, 'category') ?? '';
  if (kind === 'proper' && !(PROPER_CATEGORIES as readonly string[]).includes(category)) {
    problems.push(t('lexicon.category', { value: category, categories: PROPER_CATEGORIES.join(', ') }));
  }
  const expansionPt = str(values, 'expansion-pt') ?? '';
  const expansionEn = str(values, 'expansion-en') ?? '';
  const expansionLang = str(values, 'expansion-lang') ?? (tag.ok && tag.value !== 'mul' ? tag.value : '');
  if (kind === 'acronym' && (expansionPt === '' || expansionEn === '' || expansionLang === '')) {
    problems.push(t('lexicon.expansions'));
  }
  const fieldsGiven = [term, lang, casePolicy, str(values, 'variants') ?? '', str(values, 'vernacular-in') ?? '', str(values, 'note') ?? '', category, expansionPt, expansionEn, expansionLang];
  if (fieldsGiven.some(breaksTsv)) problems.push(t('lexicon.tsvBreak'));
  if (problems.length > 0) {
    for (const p of problems) session.warn(session.errStyle.red(`${t('severity.error')}: ${p}`));
    return EXIT_FAILURE;
  }

  const sources = await readLexiconSources(session.root, io.fs);
  const before = parseLexicon(sources);
  if (!before.ok) {
    session.warn(session.errStyle.red(t('lexicon.brokenBefore', { count: before.error.length })));
    for (const i of before.error) session.warn(`  ${formatIssue(i)}`);
    return EXIT_FAILURE;
  }
  // A term already in ANY dictionary (any kind, any spelling, case-folded) is a duplicate.
  const existing = dictionaryIndex(before.value.entries).get(fold(term.normalize('NFC')));
  if (existing !== undefined) {
    session.warn(
      session.errStyle.red(t('lexicon.duplicate', { term, kind: existing.kind, file: existing.source.file, line: existing.source.line })),
    );
    return EXIT_FAILURE;
  }
  const file = fileOfKind(kind);
  const current = sources.find((s) => s.name === file);
  if (current === undefined) {
    session.warn(session.errStyle.red(t('lexicon.missingFile', { file })));
    return EXIT_FAILURE;
  }
  const variants = (str(values, 'variants') ?? '').split('|').filter((v) => v !== '');
  const vernacularIn = (str(values, 'vernacular-in') ?? '').split(/[\s,]+/u).filter((v) => v !== '');
  const fields = rowFields({
    kind,
    term,
    lang: tag.ok ? tag.value : lang,
    casePolicy,
    variants,
    vernacularIn,
    note: str(values, 'note') ?? '',
    category,
    expansionPt,
    expansionEn,
    expansionLang,
  });
  const next = appendRow(current.text, fields);
  const after = parseLexicon(sources.map((s) => (s.name === file ? { name: file, text: next.text } : s)));
  if (!after.ok) {
    session.warn(session.errStyle.red(t('lexicon.rejected', { file })));
    for (const i of after.error) session.warn(`  ${formatIssue(i)}`);
    return EXIT_FAILURE;
  }
  const path = join(session.root, LEXICON_DIR, file);
  if (bool(values, 'dry-run')) {
    session.print(t('lexicon.wouldAdd', { file: display(session.root, path), line: next.line }));
    session.print(fields.join('\t'));
    return EXIT_OK;
  }
  await io.fs.writeText(path, next.text);
  session.print(session.out.green(t('lexicon.added', { term, file: display(session.root, path), line: next.line })));
  return EXIT_OK;
};

/* ------------------------------------------------------------------ stats */

const stats = async (session: Session): Promise<ExitCode> => {
  const { t, io, out } = session;
  const sources = await readLexiconSources(session.root, io.fs);
  const parsed = parseLexicon(sources);
  if (!parsed.ok) {
    session.warn(session.errStyle.red(t('lexicon.brokenBefore', { count: parsed.error.length })));
    for (const i of parsed.error) session.warn(`  ${formatIssue(i)}`);
    return EXIT_FAILURE;
  }
  const compiled = compileLexicon(parsed.value);
  session.print(out.bold(t('lexicon.stats.dictionaries')));
  const rows: string[][] = [[t('lexicon.stats.file'), t('lexicon.stats.kind'), t('lexicon.stats.entries')]];
  for (const name of Object.keys(LEXICON_FILES).sort()) {
    const kind = LEXICON_FILES[name];
    rows.push([`${LEXICON_DIR}/${name}`, kind ?? '?', String(parsed.value.entries.filter((e) => e.source.file === name).length)]);
  }
  rows.push([t('lexicon.stats.total'), '', String(parsed.value.entries.length)]);
  for (const line of table(rows, ['left', 'left', 'right'])) session.print(`  ${line}`);
  session.print();
  session.print(out.bold(t('lexicon.stats.matchers')));
  const mrows: string[][] = [[t('lexicon.stats.locale'), t('lexicon.stats.engine'), t('lexicon.stats.forms'), t('lexicon.stats.pattern')]];
  for (const locale of LOCALES) {
    const m = compiled.matchers[locale];
    mrows.push([locale, m.engine, String(m.forms), m.sources.map((s) => `${(s.length / 1024).toFixed(1)} KiB`).join(' + ') || '—']);
  }
  for (const line of table(mrows, ['left', 'left', 'right', 'right'])) session.print(`  ${line}`);
  session.print();
  session.print(out.bold(t('lexicon.stats.filters')));
  for (const locale of LOCALES) {
    const stored = await readStoredBloom(session.root, locale, io.fs);
    if (stored === undefined) {
      session.print(`  ${locale}: ${t('lexicon.stats.noFilter')}`);
      continue;
    }
    if (!stored.ok) {
      session.print(`  ${locale}: ${describeBloomError(stored.error)}`);
      continue;
    }
    const { header } = stored.value.filter;
    const pv = stored.value.provenance;
    session.print(
      `  ${locale}: ${t('lexicon.stats.filter', {
        n: header.n,
        m: header.m,
        k: header.k,
        bytes: header.m / 8,
        p: header.p,
        fp: expectedFalsePositiveRate(header.m, header.k, header.n).toExponential(2),
      })}`,
    );
    if (pv !== undefined) {
      session.print(`    ${t('lexicon.stats.source', { source: pv.source.location, sha: pv.source.sha256.slice(0, 16), license: pv.license })}`);
      session.print(`    ${t('lexicon.stats.built', { at: pv.builtAt, file: basename(stored.value.path) })}`);
    }
  }
  return EXIT_OK;
};

export const run = async (args: readonly string[], io: Io): Promise<ExitCode> => {
  const parsed = parseCommand(args, OPTIONS, true);
  if (!parsed.ok) return usageError(io, 'lexicon', parsed.error, args);
  const { values, positionals } = parsed.value;
  // `add` owns --lang (the language of the term); the other subcommands use it for messages.
  const session = openSession(io, values, positionals[0] === 'add');
  const [sub, ...rest] = positionals;
  switch (sub) {
    case 'build':
      if (rest.length > 0) return usageError(io, 'lexicon', session.t('error.extra', { value: rest.join(' ') }), session);
      return build(session, values);
    case 'check':
      return check(session, values, rest);
    case 'add':
      return add(session, values, rest);
    case 'stats':
      return stats(session);
    default:
      return usageError(io, 'lexicon', session.t('error.subcommand', { value: sub ?? '', expected: 'build, check, add, stats' }), session);
  }
};
