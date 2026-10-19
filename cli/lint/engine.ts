/**
 * `ft lint` engine (shell): the analysis of the Markdown pipeline over content
 * files, without building the site.
 *
 * Per file, in order:
 *   1. frontmatter read as Astro reads it (YAML error → frontmatter:yaml);
 *   2. the collection's zod schema from src/content.config.ts (frontmatter:schema),
 *      and the locale directory against `lang` (frontmatter:locale-dir);
 *   3. scaffold placeholders left by `ft new` (ft:placeholder);
 *   4. concept ids listed in the frontmatter against the ontology (ft:unknown-concept),
 *      when the project has a concept scheme — directive references are the
 *      concepts stage's own check;
 *   5. every stage of the pipeline (render): its fatal messages are build errors,
 *      its other messages are the build's `[content-lint]` lines, same rule ids,
 *      same text, same file coordinates (closed directive language, :ref/:eqref,
 *      citation keys, ABNT lints, acronyms, homographs, hand italics…);
 *   6. unknown-word discovery over the prose the stages produced (lexicon:unknown-word),
 *      when a Bloom filter exists for the document's locale.
 */
import { lineIndex, pointAt } from '../../src/core/bibliography/bibtex/source.ts';
import { isLocale, LOCALES, type Locale } from '../../src/core/domain/locale.ts';
import { fold } from '../../src/core/lexicon/text.ts';
import type { BloomFilter } from '../../src/core/lexicon/bloom.ts';
import type { Session } from '../args.ts';
import { readContentDocument, type ContentDocument } from '../content/document.ts';
import { createSiteRenderer, type SiteRenderer } from '../content/markdown.ts';
import { PLACEHOLDER } from '../content/scaffold.ts';
import { loadContentSchemas, type ContentSchema } from '../content/schema.ts';
import { readStoredBloom, describeBloomError } from '../lexicon/store.ts';
import { loadOntology, type OntologyView } from '../ontology-port.ts';
import { CODE_ROOT, DIR_LOCALE, display, locate, type MarkdownCollection } from '../project.ts';
import type { Diagnostic } from './diagnostic.ts';
import { bloomMembership, dictionaryWords, proseTokens, unknownWords, type Candidate } from './discovery.ts';

export interface LintEnvironment {
  readonly schemas: Readonly<Record<MarkdownCollection, ContentSchema>>;
  readonly renderer: SiteRenderer;
  readonly ontology: OntologyView | undefined;
  readonly filters: Partial<Record<Locale, BloomFilter>>;
  /** Things the author should know once per run (missing filter, missing ontology…). */
  readonly notes: readonly string[];
}

export interface LintOptions {
  /** Run the unknown-word discovery (default true). */
  readonly discovery: boolean;
}

/** Loads everything the per-file checks need; throws when the build context itself is broken. */
export const prepareLint = async (session: Session): Promise<LintEnvironment> => {
  const { io, root, t } = session;
  const notes: string[] = [];
  const schemas = await loadContentSchemas(CODE_ROOT);
  const renderer = await createSiteRenderer(root, session.warn);
  const loaded = await loadOntology(root, io.fs);
  let ontology: OntologyView | undefined;
  if (loaded === undefined) notes.push(t('lint.note.noOntology'));
  else if (loaded.ok) ontology = loaded.value;
  else notes.push(t('lint.note.brokenOntology', { count: loaded.error.length }));
  const filters: Partial<Record<Locale, BloomFilter>> = {};
  for (const locale of LOCALES) {
    const stored = await readStoredBloom(root, locale, io.fs);
    if (stored === undefined) {
      if (locale === 'pt-BR') notes.push(t('lint.note.noBloom', { locale }));
    } else if (stored.ok) filters[locale] = stored.value.filter;
    else notes.push(t('lint.note.brokenBloom', { detail: describeBloomError(stored.error) }));
  }
  return { schemas, renderer, ontology, filters, notes };
};

const isRecord = (v: unknown): v is Readonly<Record<string, unknown>> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Every string of the frontmatter with its path (for placeholder markers). */
const strings = (v: unknown, path: readonly PropertyKey[] = []): readonly { path: readonly PropertyKey[]; value: string }[] => {
  if (typeof v === 'string') return [{ path, value: v }];
  if (Array.isArray(v)) return (v as readonly unknown[]).flatMap((x, i) => strings(x, [...path, i]));
  if (isRecord(v)) return Object.entries(v).flatMap(([k, x]) => strings(x, [...path, k]));
  return [];
};

const lexiconIgnore = (frontmatter: Readonly<Record<string, unknown>>): readonly string[] => {
  const lexicon = frontmatter['lexicon'];
  const ignore = isRecord(lexicon) ? lexicon['ignore'] : undefined;
  return Array.isArray(ignore) ? ignore.filter((x): x is string => typeof x === 'string') : [];
};

const hintFor = (c: Candidate): string => {
  switch (c.shape) {
    case 'upper':
      return `ft lexicon add ${c.word} --kind acronym --lang mul --expansion-pt "…" --expansion-en "…" --expansion-lang <xx>`;
    case 'capitalised':
      return `ft lexicon add ${c.word} --kind proper --lang <xx> --category person|place|institution|work`;
    case 'lower':
      return `ft lexicon add ${c.word} --kind foreign --lang <xx>`;
  }
};

export const createLinter = (session: Session, env: LintEnvironment, options: LintOptions) => {
  const { root, t, io } = session;
  const knownByLocale = new Map<Locale, ReadonlySet<string>>();
  const knownWords = (locale: Locale): ReadonlySet<string> => {
    let known = knownByLocale.get(locale);
    if (known === undefined) {
      known = dictionaryWords(env.renderer.context.lexicon.compiled.lexicon.entries, locale);
      knownByLocale.set(locale, known);
    }
    return known;
  };

  const checkFrontmatter = (doc: ContentDocument, file: string, push: (d: Diagnostic) => void): void => {
    const where = locate(root, doc.path);
    if (where === undefined) return;
    const result = env.schemas[where.collection].parse(doc.frontmatter);
    if (!result.success) {
      for (const issue of result.issues) {
        const path = issue.path.map(String).join('.');
        push({
          file,
          line: doc.lineOf(issue.path),
          column: 1,
          severity: 'error',
          rule: 'frontmatter:schema',
          message: path === '' ? issue.message : `${path}: ${issue.message}`,
        });
      }
    }
    const lang = doc.frontmatter['lang'];
    if (isLocale(lang) && DIR_LOCALE[where.dir] !== lang) {
      push({
        file,
        line: doc.lineOf(['lang']),
        column: 1,
        severity: 'error',
        rule: 'frontmatter:locale-dir',
        message: t('lint.localeDir', { lang, dir: where.dir }),
      });
    }
  };

  const checkPlaceholders = (doc: ContentDocument, file: string, push: (d: Diagnostic) => void): void => {
    for (const s of strings(doc.frontmatter)) {
      if (s.value.includes(PLACEHOLDER)) {
        push({
          file,
          line: doc.lineOf(s.path),
          column: 1,
          severity: 'error',
          rule: 'ft:placeholder',
          message: t('lint.placeholder.frontmatter', { field: s.path.map(String).join('.'), marker: PLACEHOLDER }),
        });
      }
    }
    const index = lineIndex(doc.body);
    for (let at = doc.body.indexOf(PLACEHOLDER); at >= 0; at = doc.body.indexOf(PLACEHOLDER, at + 1)) {
      const p = pointAt(index, at);
      push({
        file,
        line: p.line + doc.bodyLineOffset,
        column: p.column,
        severity: 'error',
        rule: 'ft:placeholder',
        message: t('lint.placeholder.body', { marker: PLACEHOLDER }),
      });
    }
  };

  const checkConcepts = (doc: ContentDocument, file: string, push: (d: Diagnostic) => void): void => {
    const ontology = env.ontology;
    const concepts = doc.frontmatter['concepts'];
    if (ontology === undefined || !Array.isArray(concepts)) return;
    (concepts as readonly unknown[]).forEach((id, i) => {
      if (typeof id === 'string' && ontology.get(id) === undefined) {
        push({
          file,
          line: doc.lineOf(['concepts', i]),
          column: 1,
          severity: 'error',
          rule: 'ft:unknown-concept',
          message: t('lint.unknownConcept', { id }),
          hint: 'ft ontology stats',
        });
      }
    });
  };

  const discover = (
    doc: ContentDocument,
    file: string,
    tree: Parameters<typeof proseTokens>[0],
    push: (d: Diagnostic) => void,
  ): void => {
    const lang = doc.frontmatter['lang'];
    if (!options.discovery || !isLocale(lang)) return;
    const filter = env.filters[lang];
    if (filter === undefined) return;
    const known = new Set(knownWords(lang));
    for (const w of lexiconIgnore(doc.frontmatter)) for (const part of w.split(/\s+/u)) known.add(fold(part.normalize('NFC')));
    const tokens = proseTokens(tree, doc.body, lang);
    const index = lineIndex(doc.body);
    for (const c of unknownWords(tokens, { known, inLexicon: bloomMembership(filter) })) {
      const p = pointAt(index, c.offset);
      push({
        file,
        line: p.line + doc.bodyLineOffset,
        column: p.column,
        severity: 'suggestion',
        rule: 'lexicon:unknown-word',
        message: t('lint.unknownWord', { word: c.word, count: c.count, locale: lang }),
        hint: hintFor(c),
      });
    }
  };

  /** Every finding of one file. */
  return async (path: string): Promise<readonly Diagnostic[]> => {
    const file = display(root, path);
    const out: Diagnostic[] = [];
    const push = (d: Diagnostic): void => void out.push(d);
    let raw: string;
    try {
      raw = await io.fs.readText(path);
    } catch (e: unknown) {
      return [
        {
          file,
          line: 0,
          column: 0,
          severity: 'error',
          rule: 'ft:read',
          message: t('lint.unreadable', { detail: e instanceof Error ? e.message : String(e) }),
        },
      ];
    }
    const read = readContentDocument(path, raw);
    if (!read.ok) {
      return [{ file, ...read.error, severity: 'error', rule: 'frontmatter:yaml', message: read.error.message }];
    }
    const doc = read.value;
    checkFrontmatter(doc, file, push);
    checkPlaceholders(doc, file, push);
    checkConcepts(doc, file, push);
    const rendered = await env.renderer.render(doc);
    for (const m of rendered.messages) {
      push({
        file,
        line: m.line,
        column: m.column,
        severity: m.fatal ? 'error' : 'warning',
        rule: m.rule,
        message: m.reason,
      });
    }
    if (rendered.tree !== undefined) discover(doc, file, rendered.tree, push);
    return out;
  };
};
