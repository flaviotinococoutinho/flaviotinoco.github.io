/**
 * Corpus checks: every authored Markdown file must speak the closed authoring
 * language of docs/arquitetura.md §5 and respect the editorial contract of the
 * content workstream. The production stages (latex, citations, reading,
 * concepts, embeds, abnt) are developed in parallel; these checks validate the
 * content against the contract itself, so mistakes surface before integration.
 *
 * Frontmatter *types* are validated by `astro sync` (src/content.config.ts);
 * here we check the editorial rules the schemas cannot express.
 */
import { describe, expect, it } from 'vitest';
import { CONCEPT_IDS, countWords, proseText } from './checkers.ts';
import { type CollectionName, type Doc, LOCALE_DIRS, loadCorpus } from './corpus.ts';
import { checkDocument } from './rules.ts';

const corpus = loadCorpus();

/** Body word ranges required by the content specification. */
const WORD_RANGES: Readonly<Partial<Record<CollectionName, readonly [number, number]>>> = {
  essays: [1400, 2200],
  labs: [350, 700],
};
/** NBR 6028:2021 range adopted for abstracts (spec: 150–250 words). */
const ABSTRACT_RANGE = [150, 250] as const;
const PUBLISHED = '2026-10-11';
const PROVENANCE_NOTE: Readonly<Record<'pt-BR' | 'en', string>> = {
  'pt-BR':
    'Texto-semente redigido com assistência de IA (Claude) como demonstração do modelo; aguarda revisão do autor.',
  en: 'Seed text drafted with AI assistance (Claude) as a demonstration of the template; awaiting review by the author.',
};
const iso = (value: unknown): string =>
  value instanceof Date ? value.toISOString().slice(0, 10) : typeof value === 'string' ? value.slice(0, 10) : '';

describe('content corpus', () => {
  it('is not empty and has one file per entry in each locale folder', () => {
    expect(corpus.length).toBeGreaterThan(0);
  });

  it.each(corpus.map((d) => [d.path, d] as const))('%s speaks the closed authoring language', (_path, doc) => {
    expect(checkDocument(doc, corpus)).toEqual([]);
  });

  it('pairs every translationKey across both locales, once per locale', () => {
    const problems: string[] = [];
    const byKey = new Map<string, Doc[]>();
    for (const doc of corpus) {
      const key = `${doc.collection}/${String(doc.frontmatter['translationKey'])}`;
      byKey.set(key, [...(byKey.get(key) ?? []), doc]);
      if (doc.frontmatter['lang'] !== LOCALE_DIRS[doc.dir]) problems.push(`${doc.path}: lang does not match folder`);
    }
    for (const [key, docs] of byKey) {
      const langs = docs.map((d) => d.dir).sort();
      if (langs.join(',') !== 'en,pt')
        problems.push(`${key}: found in [${langs.join(', ')}], expected exactly en and pt`);
    }
    expect(problems).toEqual([]);
  });

  it('keeps slugs unique per collection and locale', () => {
    const seen = new Set<string>();
    const problems: string[] = [];
    for (const doc of corpus) {
      const id = `${doc.collection}/${doc.dir}/${String(doc.frontmatter['slug'])}`;
      if (seen.has(id)) problems.push(`duplicate slug ${id}`);
      seen.add(id);
    }
    expect(problems).toEqual([]);
  });

  it.each(corpus.filter((d) => WORD_RANGES[d.collection] !== undefined).map((d) => [d.path, d] as const))(
    '%s has a body length within the specified range',
    (_path, doc) => {
      const [min, max] = WORD_RANGES[doc.collection] ?? [0, Infinity];
      const words = countWords(proseText(doc.tree), LOCALE_DIRS[doc.dir]);
      expect(words, `${doc.path}: ${words} words`).toBeGreaterThanOrEqual(min);
      expect(words, `${doc.path}: ${words} words`).toBeLessThanOrEqual(max);
    },
  );

  it.each(corpus.filter((d) => d.collection !== 'pages').map((d) => [d.path, d] as const))(
    '%s follows the editorial frontmatter contract',
    (_path, doc) => {
      const fm = doc.frontmatter;
      const lang = LOCALE_DIRS[doc.dir];
      const problems: string[] = [];
      const abstract = typeof fm['abstract'] === 'string' ? fm['abstract'] : '';
      const abstractWords = countWords(abstract, lang);
      if (abstractWords < ABSTRACT_RANGE[0] || abstractWords > ABSTRACT_RANGE[1]) {
        problems.push(`abstract has ${abstractWords} words (expected ${ABSTRACT_RANGE.join('–')})`);
      }
      if (abstract.includes('\n\n')) problems.push('abstract must be a single paragraph');
      const keywords = (fm['keywords'] as unknown[] | undefined) ?? [];
      if (keywords.length < 3 || keywords.length > 5) problems.push(`${keywords.length} keywords (expected 3–5)`);
      const concepts = (fm['concepts'] as unknown[] | undefined) ?? [];
      for (const c of concepts)
        if (!CONCEPT_IDS.has(String(c))) problems.push(`frontmatter concept "${String(c)}" unknown`);
      if (iso(fm['published']) !== PUBLISHED) problems.push(`published must be ${PUBLISHED}`);
      const revisions = (fm['revisions'] as { date?: unknown; note?: unknown }[] | undefined) ?? [];
      if (revisions.length === 0 || iso(revisions[0]?.date) !== PUBLISHED)
        problems.push('first revision must be dated the publication day');
      const provenance = (fm['provenance'] ?? {}) as Record<string, unknown>;
      if (provenance['assistance'] !== 'generated' || provenance['reviewed'] !== false) {
        problems.push('provenance must declare generated, unreviewed text');
      }
      if (provenance['note'] !== PROVENANCE_NOTE[lang])
        problems.push('provenance note differs from the agreed wording');
      if (fm['draft'] !== false) problems.push('draft must be false');
      if (doc.collection === 'essays' && fm['bridgesTo'] === undefined)
        problems.push('every seed essay is a passage (bridgesTo)');
      expect(problems).toEqual([]);
    },
  );
});
