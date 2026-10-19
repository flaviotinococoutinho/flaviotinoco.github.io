/**
 * ft new essay|lab|page --lang pt|en --slug <slug> --title <title> [--stratum <s>]
 *        [--translation-of <key>] [options…]
 *
 * Scaffolds src/content/<collection>/<pt|en>/<slug>.md with a complete
 * frontmatter that the current schema accepts — checked, before anything is
 * written, with the zod schema of src/content.config.ts — and never
 * overwrites a file (exclusive create). `published` (and the first revision)
 * is the injected clock's date in the TZ time zone (system zone when unset).
 * With --translation-of <key>, the entry of the other locale with that
 * translationKey supplies the key and the language-neutral fields (stratum,
 * bridgesTo, domains, concepts, epistemic status, lab widget and kernel).
 */
import { join } from 'node:path';
import { parseConfidence, parseEvidence, type Confidence, type Evidence } from '../../src/core/domain/epistemic.ts';
import { parseDomain, type Domain } from '../../src/core/domain/facets.ts';
import { parseConceptId, parseSlug, parseTranslationKey } from '../../src/core/domain/identifiers.ts';
import type { Locale } from '../../src/core/domain/locale.ts';
import { parseStratum, type Stratum } from '../../src/core/domain/strata.ts';
import { bool, list, openSession, parseCommand, parseUiLocale, str, type Session } from '../args.ts';
import { readContentDocument } from '../content/document.ts';
import {
  COLLECTION_OF,
  KINDS,
  placeholderTheorem,
  scaffold,
  WIDGET_KERNEL,
  type Kind,
  type ScaffoldSpec,
  type Widget,
} from '../content/scaffold.ts';
import { loadContentSchemas } from '../content/schema.ts';
import { EXIT_FAILURE, EXIT_OK, type ExitCode, type Io } from '../io.ts';
import { CODE_ROOT, display, LOCALE_DIR } from '../project.ts';
import { usageError } from './shared.ts';

export const OPTIONS = {
  lang: { type: 'string' },
  slug: { type: 'string' },
  title: { type: 'string' },
  stratum: { type: 'string' },
  'translation-of': { type: 'string' },
  key: { type: 'string' },
  description: { type: 'string' },
  domains: { type: 'string' },
  concepts: { type: 'string' },
  'bridges-to': { type: 'string' },
  confidence: { type: 'string' },
  evidence: { type: 'string' },
  widget: { type: 'string' },
  kernel: { type: 'string' },
  theorem: { type: 'string' },
  assistance: { type: 'string' },
  reviewed: { type: 'string' },
  draft: { type: 'boolean' },
  'dry-run': { type: 'boolean' },
} as const;

/** Default domain of a stratum when none is given (the author is told to review it). */
const DEFAULT_DOMAIN: Readonly<Record<Stratum, Domain>> = {
  philosophy: 'epistemology',
  theory: 'information-theory',
  formal: 'mathematics',
  value: 'product',
};

const ASSISTANCE = ['none', 'assisted', 'generated'] as const;

/** YYYY-MM-DD of an instant in a time zone (undefined zone = the system's). */
export const calendarDate = (instant: Date, timeZone: string | undefined): string => {
  const make = (zone: string | undefined): Intl.DateTimeFormat =>
    new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' });
  let fmt: Intl.DateTimeFormat;
  try {
    fmt = make(timeZone === '' ? undefined : timeZone);
  } catch {
    fmt = make(undefined);
  }
  const parts = Object.fromEntries(fmt.formatToParts(instant).map((p) => [p.type, p.value]));
  return `${parts['year'] ?? '0000'}-${parts['month'] ?? '01'}-${parts['day'] ?? '01'}`;
};

interface Counterpart {
  readonly path: string;
  readonly frontmatter: Readonly<Record<string, unknown>>;
}

/** The entry of `locale` in `collection` whose translationKey is `key`. */
const findByKey = async (
  session: Session,
  collection: string,
  locale: Locale,
  key: string,
): Promise<Counterpart | undefined> => {
  const dir = join(session.root, 'src', 'content', collection, LOCALE_DIR[locale]);
  for (const name of await session.io.fs.list(dir)) {
    if (!name.endsWith('.md')) continue;
    const path = join(dir, name);
    const doc = readContentDocument(path, await session.io.fs.readText(path));
    if (doc.ok && doc.value.frontmatter['translationKey'] === key) return { path, frontmatter: doc.value.frontmatter };
  }
  return undefined;
};

const strings = (v: unknown): readonly string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];

export const run = async (args: readonly string[], io: Io): Promise<ExitCode> => {
  const parsed = parseCommand(args, OPTIONS, true);
  if (!parsed.ok) return usageError(io, 'new', parsed.error, args);
  const { values, positionals } = parsed.value;
  const session = openSession(io, values, true);
  const { t } = session;
  const problems: string[] = [];
  const defaults: string[] = [];

  const kindRaw = positionals[0];
  if (kindRaw === undefined || !(KINDS as readonly string[]).includes(kindRaw) || positionals.length > 1) {
    return usageError(io, 'new', t('new.kind', { value: positionals.join(' ') }), session);
  }
  const kind = kindRaw as Kind;
  const collection = COLLECTION_OF[kind];
  const locale = parseUiLocale(str(values, 'lang'));
  if (locale === undefined) return usageError(io, 'new', t('new.lang', { value: str(values, 'lang') ?? '' }), session);
  const slug = parseSlug(str(values, 'slug'));
  if (!slug.ok) problems.push(t('new.slug', { value: str(values, 'slug') ?? '' }));
  const title = str(values, 'title')?.trim() ?? '';
  if (title === '') problems.push(t('new.title'));

  // The other locale's entry, when this is a translation.
  const of = str(values, 'translation-of');
  const other: Locale = locale === 'pt-BR' ? 'en' : 'pt-BR';
  const counterpart = of === undefined ? undefined : await findByKey(session, collection, other, of);
  if (of !== undefined && counterpart === undefined) {
    problems.push(t('new.noCounterpart', { key: of, collection, dir: LOCALE_DIR[other] }));
  }
  const cfm = counterpart?.frontmatter ?? {};

  const keyRaw = of ?? str(values, 'key') ?? str(values, 'slug') ?? '';
  const key = parseTranslationKey(keyRaw);
  if (!key.ok) problems.push(t('new.key', { value: keyRaw }));
  if (key.ok && (await findByKey(session, collection, locale, key.value)) !== undefined) {
    problems.push(t('new.keyTaken', { key: key.value, dir: LOCALE_DIR[locale] }));
  }

  // Stratum: copied from the counterpart; an explicit, different one is a contradiction.
  let stratum: Stratum | undefined;
  let bridgesTo: Stratum | undefined;
  if (kind !== 'page') {
    const given = str(values, 'stratum');
    const inherited = parseStratum(cfm['stratum']);
    if (given !== undefined) {
      const s = parseStratum(given);
      if (!s.ok) problems.push(s.error);
      else if (inherited.ok && inherited.value !== s.value) {
        problems.push(t('new.stratumConflict', { given: s.value, inherited: inherited.value }));
      } else stratum = s.value;
    } else if (inherited.ok) stratum = inherited.value;
    else problems.push(t('new.stratum'));
    const bridge = str(values, 'bridges-to') ?? (typeof cfm['bridgesTo'] === 'string' ? cfm['bridgesTo'] : undefined);
    if (bridge !== undefined) {
      const b = parseStratum(bridge);
      if (b.ok) bridgesTo = b.value;
      else problems.push(b.error);
    }
  }

  // Domains and concepts.
  const domainNames = list(values, 'domains') ?? strings(cfm['domains']);
  const domains: Domain[] = [];
  for (const d of domainNames) {
    const r = parseDomain(d);
    if (r.ok) domains.push(r.value);
    else problems.push(r.error);
  }
  if (kind !== 'page' && domains.length === 0 && stratum !== undefined) {
    domains.push(DEFAULT_DOMAIN[stratum]);
    defaults.push(t('new.default.domains', { value: DEFAULT_DOMAIN[stratum] }));
  }
  const concepts: string[] = [];
  for (const c of list(values, 'concepts') ?? strings(cfm['concepts'])) {
    const r = parseConceptId(c);
    if (r.ok) concepts.push(r.value);
    else problems.push(r.error);
  }

  // Epistemic status.
  const ep = typeof cfm['epistemic'] === 'object' && cfm['epistemic'] !== null ? (cfm['epistemic'] as Record<string, unknown>) : {};
  const confidenceRaw = str(values, 'confidence') ?? ep['confidence'];
  const evidenceRaw = str(values, 'evidence') ?? ep['evidence'];
  let confidence: Confidence = 'probable';
  let evidence: Evidence = 'argument';
  if (confidenceRaw === undefined) {
    if (kind !== 'page') defaults.push(t('new.default.confidence', { value: confidence }));
  } else {
    const r = parseConfidence(confidenceRaw);
    if (r.ok) confidence = r.value;
    else problems.push(r.error);
  }
  if (evidenceRaw === undefined) {
    if (kind !== 'page') defaults.push(t('new.default.evidence', { value: evidence }));
  } else {
    const r = parseEvidence(evidenceRaw);
    if (r.ok) evidence = r.value;
    else problems.push(r.error);
  }

  // Provenance: assistance none, reviewed true by default.
  const assistanceRaw = str(values, 'assistance') ?? 'none';
  const assistance = (ASSISTANCE as readonly string[]).includes(assistanceRaw)
    ? (assistanceRaw as (typeof ASSISTANCE)[number])
    : undefined;
  if (assistance === undefined) problems.push(t('new.assistance', { value: assistanceRaw }));
  const reviewedRaw = str(values, 'reviewed') ?? 'true';
  if (reviewedRaw !== 'true' && reviewedRaw !== 'false') problems.push(t('new.reviewed', { value: reviewedRaw }));

  // Lab: widget (and its kernel), theorem.
  let lab: ScaffoldSpec['lab'];
  if (kind === 'lab') {
    const widgetRaw = str(values, 'widget') ?? (typeof cfm['widget'] === 'string' ? cfm['widget'] : undefined);
    if (widgetRaw === undefined || !Object.hasOwn(WIDGET_KERNEL, widgetRaw)) {
      problems.push(t('new.widget', { value: widgetRaw ?? '', widgets: Object.keys(WIDGET_KERNEL).join(', ') }));
    } else {
      const widget = widgetRaw as Widget;
      const kernel = WIDGET_KERNEL[widget];
      const kernelRaw = str(values, 'kernel');
      if (kernelRaw !== undefined && kernelRaw !== kernel) problems.push(t('new.kernel', { widget, kernel }));
      const theorem = str(values, 'theorem')?.trim() ?? placeholderTheorem(locale);
      lab = { widget, kernel, theorem };
    }
  }

  if (problems.length > 0) {
    for (const p of problems) session.warn(session.errStyle.red(`${t('severity.error')}: ${p}`));
    return EXIT_FAILURE;
  }
  if (!slug.ok || !key.ok || assistance === undefined) return EXIT_FAILURE;

  const spec: ScaffoldSpec = {
    kind,
    locale,
    slug: slug.value,
    translationKey: key.value,
    title,
    description: str(values, 'description'),
    published: calendarDate(io.now(), io.env['TZ']),
    stratum,
    bridgesTo,
    domains,
    concepts,
    epistemic: { confidence, evidence },
    provenance: { assistance, reviewed: reviewedRaw === 'true' },
    lab,
    draft: bool(values, 'draft'),
  };
  const text = scaffold(spec);
  const path = join(session.root, 'src', 'content', collection, LOCALE_DIR[locale], `${slug.value}.md`);

  // The scaffold must be accepted by the schema of the site before it is written.
  const doc = readContentDocument(path, text);
  const schemas = await loadContentSchemas(CODE_ROOT);
  const checked = doc.ok ? schemas[collection].parse(doc.value.frontmatter) : undefined;
  if (checked === undefined || !checked.success) {
    const issues = checked === undefined || checked.success ? [] : checked.issues;
    for (const i of issues) {
      session.warn(session.errStyle.red(`${t('severity.error')}: ${i.path.map(String).join('.')}: ${i.message}`));
    }
    return EXIT_FAILURE;
  }

  if (bool(values, 'dry-run')) {
    io.stdout.write(text);
    return EXIT_OK;
  }
  const outcome = await io.fs.createText(path, text);
  if (outcome === 'exists') {
    session.warn(session.errStyle.red(t('new.exists', { path: display(session.root, path) })));
    return EXIT_FAILURE;
  }
  session.print(session.out.green(t('new.created', { path: display(session.root, path) })));
  if (counterpart !== undefined) session.print(t('new.translationOf', { path: display(session.root, counterpart.path) }));
  if (str(values, 'description') === undefined) defaults.push(t('new.default.description'));
  if (kind === 'lab' && str(values, 'theorem') === undefined) defaults.push(t('new.default.theorem'));
  if (defaults.length > 0) {
    session.print(t('new.review'));
    for (const d of defaults) session.print(`  - ${d}`);
  }
  session.print(t('new.next', { path: display(session.root, path) }));
  return EXIT_OK;
};
