/**
 * Content model — the boundary where untyped frontmatter becomes typed data.
 *
 * "Parse, don't validate": each field is transformed by the corresponding
 * smart constructor of the functional core, so downstream code receives
 * branded values (Slug, ConceptId, Stratum…) and can never confuse them.
 * Derived facts (e.g. SKOS `narrower`) are NOT stored: they are computed from
 * their inverse relation, so the data cannot contradict itself.
 */
import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { parseLanguageTag } from './core/lexicon/language-tag.ts';
import { z } from 'astro/zod';
import type { Result } from './core/algebra/result.ts';
import { LOCALES } from './core/domain/locale.ts';
import { STRATA } from './core/domain/strata.ts';
import { DOMAINS } from './core/domain/facets.ts';
import { CONFIDENCE_LEVELS, EVIDENCE_KINDS } from './core/domain/epistemic.ts';
import { parseConceptId, parseSlug, parseTranslationKey } from './core/domain/identifiers.ts';

/**
 * Entry identity = file path relative to the collection base, without extension
 * ("pt/do-signo-a-informacao", "entropy"). Astro's default uses `data.slug`, which
 * would make a pt and an en entry with the same slug collide, and turns the
 * per-locale slug object of a concept into "[object Object]" for every concept.
 */
const pathId = ({ entry }: { readonly entry: string }): string => entry.replace(/\.(md|json)$/, '');

/** Lifts a core parser into a zod transform that reports the parser's own message. */
const parsed = <T>(parse: (v: string) => Result<T, string>) =>
  z.string().transform((value, ctx): T => {
    const r = parse(value);
    if (r.ok) return r.value;
    ctx.addIssue({ code: 'custom', message: r.error });
    return z.NEVER;
  });

const locale = z.enum(LOCALES);
const stratum = z.enum(STRATA);
const domain = z.enum(DOMAINS);
const slug = parsed(parseSlug);
const conceptId = parsed(parseConceptId);
const translationKey = parsed(parseTranslationKey);
const localized = <T extends z.ZodType>(schema: T) => z.object({ 'pt-BR': schema, en: schema }).strict();

const revision = z.object({ date: z.coerce.date(), note: z.string().min(1) }).strict();

const epistemic = z
  .object({
    confidence: z.enum(CONFIDENCE_LEVELS),
    evidence: z.enum(EVIDENCE_KINDS),
  })
  .strict();

/** Fields shared by every authored, translatable work. */
const work = z.object({
  title: z.string().min(1),
  subtitle: z.string().optional(),
  /** Meta description: one sentence, ≤ 180 characters (search snippets). */
  description: z.string().min(40).max(180),
  lang: locale,
  translationKey,
  slug,
  stratum,
  /** The stratum this work leads to on the bridge, if it is a passage between levels. */
  bridgesTo: stratum.optional(),
  domains: z.array(domain).min(1),
  concepts: z.array(conceptId).default([]),
  published: z.coerce.date(),
  revisions: z.array(revision).default([]),
  epistemic,
  /** Resumo / abstract (ABNT NBR 6028): a single paragraph. */
  abstract: z.string().min(1).optional(),
  /** Palavras-chave / keywords (NBR 6028: separated by semicolons when rendered). */
  keywords: z.array(z.string().min(1)).default([]),
  /**
   * Provenance (editorial ethics): who/what produced the text and whether the
   * author has reviewed it. Shown to readers; unreviewed AI-generated text is labelled.
   */
  provenance: z
    .object({
      assistance: z.enum(['none', 'assisted', 'generated']),
      reviewed: z.boolean(),
      note: z.string().optional(),
    })
    .strict(),
  /** Per-document overrides of the automatic lexicon marking (precedence: directive > frontmatter > dictionary). */
  lexicon: z
    .object({
      ignore: z.array(z.string().min(1)).default([]),
      foreign: z.array(z.object({ term: z.string().min(1), lang: parsed(parseLanguageTag) }).strict()).default([]),
    })
    .strict()
    .optional(),
  /** Document-local TeX macros (\\newcommand equivalents), isolated per file. */
  macros: z.record(z.string().regex(/^\\[A-Za-z]+$/), z.string()).optional(),
  draft: z.boolean().default(false),
});

const essays = defineCollection({
  loader: glob({ pattern: '{pt,en}/**/*.md', base: './src/content/essays', generateId: pathId }),
  schema: work.extend({ form: z.literal('essay').default('essay') }).strict(),
});

const labs = defineCollection({
  loader: glob({ pattern: '{pt,en}/**/*.md', base: './src/content/labs', generateId: pathId }),
  schema: work
    .extend({
      form: z.literal('lab').default('lab'),
      kernel: z.enum(['signal', 'information', 'dynamics']),
      widget: z.enum(['fourier', 'sampling', 'entropy', 'channel', 'logistic', 'clt']),
      /** Name of the theorem or law the lab makes tangible. */
      theorem: z.string().min(1),
    })
    .strict(),
});

const strata = defineCollection({
  loader: glob({ pattern: '{pt,en}/*.md', base: './src/content/strata', generateId: pathId }),
  schema: z
    .object({
      stratum,
      lang: locale,
      title: z.string().min(1),
      /** The guiding question of the stratum. */
      question: z.string().min(1),
      /** Its characteristic method, e.g. conceptual analysis, modelling, proof, design. */
      method: z.string().min(1),
      description: z.string().min(40).max(180),
    })
    .strict(),
});

const pages = defineCollection({
  loader: glob({ pattern: '{pt,en}/*.md', base: './src/content/pages', generateId: pathId }),
  schema: z
    .object({
      title: z.string().min(1),
      description: z.string().min(40).max(180),
      lang: locale,
      translationKey,
      slug,
      revisions: z.array(revision).default([]),
    })
    .strict(),
});

/**
 * SKOS concepts (W3C Simple Knowledge Organization System, 2009).
 * The language-neutral concept id is the file name (entry.id), e.g. entropy.json → "entropy".
 */
const concepts = defineCollection({
  loader: glob({ pattern: '*.json', base: './src/content/concepts', generateId: pathId }),
  schema: z
    .object({
      slug: localized(slug),
      prefLabel: localized(z.string().min(1)),
      altLabel: localized(z.array(z.string().min(1))).optional(),
      definition: localized(z.string().min(1)),
      /** Optional TeX notation, rendered with KaTeX. */
      notation: z.string().optional(),
      stratum,
      domains: z.array(domain).min(1),
      broader: z.array(conceptId).default([]),
      related: z.array(conceptId).default([]),
      /** skos:exactMatch — IRIs in external vocabularies (Wikidata, nLab, SEP…). */
      exactMatch: z.array(z.url()).default([]),
      /** BibTeX keys of the sources supporting the definition. */
      sources: z.array(z.string()).default([]),
    })
    .strict(),
});

export const collections = { essays, labs, strata, pages, concepts };
