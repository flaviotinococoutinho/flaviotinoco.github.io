/**
 * ft reviews candidates [--refresh] [--format text|json]
 *
 * Reads the dated snapshot data/review-candidates.json — produced at authoring
 * time from Wikidata (CC0) by the reviews workstream's
 * scripts/review-candidates.ts (specs/reviews.md §7) — and prints the people
 * and organisations that hold a registry distinction and have NO review yet,
 * grouped by distinction. "Reviewed" = its Q-id appears as
 * `subject.identifiers.wikidata` in a src/content/reviews/{pt,en}/*.md
 * frontmatter. Without the snapshot it says how to produce it. --refresh runs
 * the script first (network at authoring time only; never in tests or CI).
 *
 * The snapshot is read tolerantly (its producer is another workstream):
 *   { retrieved?, license?, query?, candidates: [ { name | label, wikidata | qid | id,
 *     distinctions?: [ "name" | { name | label, year?, wikidata | qid? } ], fields? } ] }
 * or a bare array of candidates. A label may be a string or { "pt-BR", en }.
 */
import { join } from 'node:path';
import { bool, openSession, parseCommand, str, type Session } from '../args.ts';
import { readContentDocument } from '../content/document.ts';
import { EXIT_FAILURE, EXIT_OK, type ExitCode, type Io } from '../io.ts';
import { usageError } from './shared.ts';

export const OPTIONS = { refresh: { type: 'boolean' }, format: { type: 'string' } } as const;

export const SNAPSHOT = join('data', 'review-candidates.json');
export const SCRIPT = join('scripts', 'review-candidates.ts');

export interface Distinction {
  readonly name: string;
  readonly year: string | undefined;
  readonly wikidata: string | undefined;
}

export interface CandidateEntry {
  readonly name: string;
  readonly wikidata: string;
  readonly distinctions: readonly Distinction[];
  readonly fields: readonly string[];
}

export interface Snapshot {
  readonly retrieved: string | undefined;
  readonly license: string | undefined;
  readonly candidates: readonly CandidateEntry[];
  /** Items that could not be read (no name or no Q-id), for the author to notice. */
  readonly skipped: number;
}

const QID = /^Q[1-9]\d*$/u;
type Raw = Readonly<Record<string, unknown>>;
const isRecord = (v: unknown): v is Raw => typeof v === 'object' && v !== null && !Array.isArray(v);

const labelOf = (v: unknown, locale: string): string | undefined => {
  if (typeof v === 'string' && v.trim() !== '') return v.trim();
  if (isRecord(v)) {
    const l = v[locale] ?? v['en'] ?? v['pt-BR'] ?? v['pt'];
    return typeof l === 'string' && l.trim() !== '' ? l.trim() : undefined;
  }
  return undefined;
};

const qidOf = (r: Raw): string | undefined => {
  for (const k of ['wikidata', 'qid', 'id', 'item']) {
    const v = r[k];
    if (typeof v === 'string') {
      const q = v.replace(/^.*\/(Q\d+)$/u, '$1');
      if (QID.test(q)) return q;
    }
  }
  return undefined;
};

/** Parses the snapshot (total: unreadable items are counted, never fatal). */
export const parseSnapshot = (data: unknown, locale: string): Snapshot | undefined => {
  const list = Array.isArray(data)
    ? data
    : isRecord(data)
      ? (data['candidates'] ?? data['items'] ?? data['results'])
      : undefined;
  if (!Array.isArray(list)) return undefined;
  const candidates: CandidateEntry[] = [];
  let skipped = 0;
  for (const item of list as readonly unknown[]) {
    if (!isRecord(item)) {
      skipped += 1;
      continue;
    }
    const name = labelOf(item['name'] ?? item['label'], locale);
    const wikidata = qidOf(item);
    if (name === undefined || wikidata === undefined) {
      skipped += 1;
      continue;
    }
    const rawDistinctions = Array.isArray(item['distinctions']) ? (item['distinctions'] as readonly unknown[]) : [];
    const distinctions: Distinction[] = rawDistinctions.flatMap((d): Distinction[] => {
      if (typeof d === 'string') return [{ name: d, year: undefined, wikidata: undefined }];
      if (!isRecord(d)) return [];
      const dn = labelOf(d['name'] ?? d['label'], locale);
      if (dn === undefined) return [];
      const year = d['year'] ?? d['date'];
      return [{ name: dn, year: typeof year === 'string' || typeof year === 'number' ? String(year) : undefined, wikidata: qidOf(d) }];
    });
    const fields = Array.isArray(item['fields'])
      ? (item['fields'] as readonly unknown[]).flatMap((f) => {
          const l = labelOf(f, locale);
          return l === undefined ? [] : [l];
        })
      : [];
    candidates.push({ name, wikidata, distinctions, fields });
  }
  const meta = isRecord(data) ? data : {};
  const text = (k: string): string | undefined => (typeof meta[k] === 'string' ? (meta[k] as string) : undefined);
  return { retrieved: text('retrieved') ?? text('date'), license: text('license') ?? text('licence'), candidates, skipped };
};

/** Q-ids of the subjects that already have a review (either locale). */
export const reviewedIds = async (session: Session): Promise<ReadonlySet<string>> => {
  const out = new Set<string>();
  for (const dir of ['pt', 'en']) {
    const base = join(session.root, 'src', 'content', 'reviews', dir);
    for (const name of await session.io.fs.list(base)) {
      if (!name.endsWith('.md')) continue;
      const path = join(base, name);
      const doc = readContentDocument(path, await session.io.fs.readText(path));
      if (!doc.ok) continue;
      const subject = doc.value.frontmatter['subject'];
      const ids = isRecord(subject) ? subject['identifiers'] : undefined;
      const q = isRecord(ids) ? ids['wikidata'] : undefined;
      if (typeof q === 'string' && QID.test(q)) out.add(q);
    }
  }
  return out;
};

/** Groups candidates by distinction (a candidate with several appears in each group), sorted by name. */
export const groupByDistinction = (
  candidates: readonly CandidateEntry[],
  locale: string,
): readonly { readonly distinction: string; readonly wikidata: string | undefined; readonly members: readonly { readonly candidate: CandidateEntry; readonly year: string | undefined }[] }[] => {
  const collator = new Intl.Collator(locale, { sensitivity: 'base', numeric: true });
  const groups = new Map<string, { wikidata: string | undefined; members: { candidate: CandidateEntry; year: string | undefined }[] }>();
  for (const c of candidates) {
    const ds = c.distinctions.length === 0 ? [{ name: '—', year: undefined, wikidata: undefined }] : c.distinctions;
    for (const d of ds) {
      const g = groups.get(d.name) ?? { wikidata: d.wikidata, members: [] };
      if (!g.members.some((m) => m.candidate.wikidata === c.wikidata)) g.members.push({ candidate: c, year: d.year });
      groups.set(d.name, g);
    }
  }
  return [...groups.entries()]
    .sort(([a], [b]) => collator.compare(a, b))
    .map(([distinction, g]) => ({
      distinction,
      wikidata: g.wikidata,
      members: [...g.members].sort((x, y) => collator.compare(x.candidate.name, y.candidate.name)),
    }));
};

export const run = async (args: readonly string[], io: Io): Promise<ExitCode> => {
  const parsed = parseCommand(args, OPTIONS);
  if (!parsed.ok) return usageError(io, 'reviews', parsed.error, args);
  const { values, positionals } = parsed.value;
  const session = openSession(io, values);
  const { t, out } = session;
  if (positionals[0] !== 'candidates' || positionals.length > 1) {
    return usageError(io, 'reviews', t('error.subcommand', { value: positionals.join(' '), expected: 'candidates' }), session);
  }
  const format = str(values, 'format') ?? 'text';
  if (format !== 'text' && format !== 'json') return usageError(io, 'reviews', t('error.format', { format }), session);

  if (bool(values, 'refresh')) {
    const script = join(session.root, SCRIPT);
    if (!(await io.fs.exists(script))) {
      session.warn(session.errStyle.red(t('reviews.noScript', { script: SCRIPT })));
      return EXIT_FAILURE;
    }
    session.print(t('reviews.refreshing', { script: SCRIPT }));
    const status = await io.exec('node', [script], session.root);
    if (status !== 0) {
      session.warn(session.errStyle.red(t('reviews.refreshFailed', { status })));
      return EXIT_FAILURE;
    }
  }

  const path = join(session.root, SNAPSHOT);
  if (!(await io.fs.exists(path))) {
    session.print(t('reviews.noSnapshot', { snapshot: SNAPSHOT, script: SCRIPT }));
    return EXIT_OK;
  }
  let data: unknown;
  try {
    data = JSON.parse(await io.fs.readText(path));
  } catch (e: unknown) {
    session.warn(session.errStyle.red(t('reviews.badSnapshot', { snapshot: SNAPSHOT, detail: e instanceof Error ? e.message : String(e) })));
    return EXIT_FAILURE;
  }
  const snapshot = parseSnapshot(data, session.locale);
  if (snapshot === undefined) {
    session.warn(session.errStyle.red(t('reviews.badSnapshot', { snapshot: SNAPSHOT, detail: 'no candidate list' })));
    return EXIT_FAILURE;
  }
  const reviewed = await reviewedIds(session);
  const pending = snapshot.candidates.filter((c) => !reviewed.has(c.wikidata));
  const groups = groupByDistinction(pending, session.locale);
  if (format === 'json') {
    io.stdout.write(`${JSON.stringify({ version: 1, retrieved: snapshot.retrieved, license: snapshot.license, reviewed: [...reviewed].sort(), groups }, null, 2)}\n`);
    return EXIT_OK;
  }
  session.print(
    out.bold(t('reviews.header', { snapshot: SNAPSHOT, retrieved: snapshot.retrieved ?? '?', license: snapshot.license ?? '?' })),
  );
  for (const g of groups) {
    session.print();
    session.print(out.bold(g.wikidata === undefined ? g.distinction : `${g.distinction} (${g.wikidata})`));
    for (const m of g.members) {
      const year = m.year === undefined ? '' : ` — ${m.year}`;
      const fields = m.candidate.fields.length === 0 ? '' : out.dim(` · ${m.candidate.fields.join(', ')}`);
      session.print(`  ${m.candidate.name} ${out.dim(`(${m.candidate.wikidata})`)}${year}${fields}`);
    }
  }
  session.print();
  session.print(t('reviews.summary', { pending: pending.length, reviewed: snapshot.candidates.length - pending.length, skipped: snapshot.skipped }));
  return EXIT_OK;
};
