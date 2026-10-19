/**
 * Reviews — the taxonomy of reviewed subjects: five groups, thirteen kinds, the ontological level of each
 * subject and its schema.org type.
 *
 * What is reviewed follows IFLA LRM (Riva, Le Bœuf & Žumer, IFLA Library Reference Model, 2017): a WORK
 * (films, music, books, sites, channels, forums, documentation, statutes), an AGENT (a person or a collective
 * agent), or a "res" that is neither — here the means: tools, methodologies, rules and the named "laws" of a
 * field. The group is DERIVED from the kind (never written), so the two cannot disagree.
 *
 * Levels come from the link-term taxonomy (src/core/domain/link-terms.ts): similarity is computed only within
 * a level, and every typed link is checked against the level signature of its term.
 */
import { err, ok, type Result } from '../algebra/result.ts';
import { absurd } from '../algebra/match.ts';
import { show } from '../algebra/show.ts';
import type { Level } from '../domain/link-terms.ts';

/** Display order of the index (the author's order of the request). */
export const REVIEW_GROUPS = ['media', 'references', 'people', 'organizations', 'means'] as const;
export type ReviewGroup = (typeof REVIEW_GROUPS)[number];

/** Kinds in display order within their group. */
export const REVIEW_KINDS = [
  'film',
  'music',
  'book',
  'website',
  'channel',
  'forum',
  'documentation',
  'person',
  'organization',
  'tool',
  'methodology',
  'rule',
  'law',
] as const;
export type ReviewKind = (typeof REVIEW_KINDS)[number];

export const KIND_GROUP: Readonly<Record<ReviewKind, ReviewGroup>> = {
  film: 'media',
  music: 'media',
  book: 'references',
  website: 'references',
  channel: 'references',
  forum: 'references',
  documentation: 'references',
  person: 'people',
  organization: 'organizations',
  tool: 'means',
  methodology: 'means',
  rule: 'means',
  law: 'means',
};

/**
 * What a "law" is: a statute (a legal norm, schema.org Legislation), an empirical regularity (Conway's law),
 * or a heuristic of practice. The Record must say which.
 */
export const LAW_KINDS = ['statute', 'empirical', 'heuristic'] as const;
export type LawKind = (typeof LAW_KINDS)[number];

export const groupOf = (kind: ReviewKind): ReviewGroup => KIND_GROUP[kind];

export const kindsOf = (group: ReviewGroup): readonly ReviewKind[] => REVIEW_KINDS.filter((k) => KIND_GROUP[k] === group);

export const isReviewKind = (v: unknown): v is ReviewKind =>
  typeof v === 'string' && (REVIEW_KINDS as readonly string[]).includes(v);

export const parseReviewKind = (v: unknown): Result<ReviewKind, string> =>
  isReviewKind(v) ? ok(v) : err(`unknown review kind "${show(v)}" (expected one of ${REVIEW_KINDS.join(', ')})`);

export const isLawKind = (v: unknown): v is LawKind => typeof v === 'string' && (LAW_KINDS as readonly string[]).includes(v);

/**
 * Ontological level of a subject (spec §5.2): media and references are works; persons and organizations are
 * agents; a tool is a tool; methodologies, rules and empirical or heuristic laws are concepts; a statute is a
 * work (a legal text). A law without a lawKind is a parse error upstream; here it defaults to concept.
 */
export const levelOf = (kind: ReviewKind, lawKind?: LawKind): Level => {
  switch (kind) {
    case 'film':
    case 'music':
    case 'book':
    case 'website':
    case 'channel':
    case 'forum':
    case 'documentation':
      return 'work';
    case 'person':
    case 'organization':
      return 'agent';
    case 'tool':
      return 'tool';
    case 'methodology':
    case 'rule':
      return 'concept';
    case 'law':
      return lawKind === 'statute' ? 'work' : 'concept';
    default:
      return absurd(kind);
  }
};

/** The schema.org type of `itemReviewed` (spec §1). `music` is refined by the subject (album by default). */
export type ItemReviewedType =
  | 'Movie'
  | 'MusicAlbum'
  | 'MusicComposition'
  | 'MusicRecording'
  | 'Book'
  | 'WebSite'
  | 'CreativeWorkSeries'
  | 'TechArticle'
  | 'Person'
  | 'Organization'
  | 'SoftwareApplication'
  | 'HowTo'
  | 'CreativeWork'
  | 'DefinedTerm'
  | 'Legislation';

/** How a musical subject is typed: an album (default), a composition (a work) or a recording. */
export const MUSIC_FORMS = ['album', 'composition', 'recording'] as const;
export type MusicForm = (typeof MUSIC_FORMS)[number];

export const itemReviewedType = (kind: ReviewKind, lawKind?: LawKind, musicForm?: MusicForm): ItemReviewedType => {
  switch (kind) {
    case 'film':
      return 'Movie';
    case 'music':
      return musicForm === 'composition'
        ? 'MusicComposition'
        : musicForm === 'recording'
          ? 'MusicRecording'
          : 'MusicAlbum';
    case 'book':
      return 'Book';
    case 'website':
    case 'forum':
      return 'WebSite';
    case 'channel':
      return 'CreativeWorkSeries';
    case 'documentation':
      return 'TechArticle';
    case 'person':
      return 'Person';
    case 'organization':
      return 'Organization';
    case 'tool':
      return 'SoftwareApplication';
    case 'methodology':
      return 'HowTo';
    case 'rule':
      return 'CreativeWork';
    case 'law':
      return lawKind === 'statute' ? 'Legislation' : 'DefinedTerm';
    default:
      return absurd(kind);
  }
};

/** Glyph ids of the groups in the reviews sprite (src/components/reviews/ReviewGlyphs.astro). */
export const GROUP_GLYPH: Readonly<Record<ReviewGroup, `review-group-${ReviewGroup}`>> = {
  media: 'review-group-media',
  references: 'review-group-references',
  people: 'review-group-people',
  organizations: 'review-group-organizations',
  means: 'review-group-means',
};
