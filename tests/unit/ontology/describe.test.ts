/**
 * Build-log descriptions of the ontology's errors and warnings.
 *
 * Every kind of the two closed sum types has a message that names the
 * concepts involved and the rule broken, so an author can act on it without
 * reading the code. The tables are checked for exhaustiveness at compile time
 * (a Record over the `kind` union), so a new kind cannot ship undescribed.
 */
import { describe, expect, test } from 'vitest';
import type { Slug } from '../../../src/core/domain/identifiers.ts';
import {
  describeError,
  describeWarning,
  type OntologyError,
  type OntologyWarning,
} from '../../../src/core/ontology/model.ts';
import { cid } from './helpers.ts';

const slug = (s: string): Slug => s as Slug;

interface Case<T> {
  readonly value: T;
  /** Fragments the description must contain. */
  readonly mentions: readonly string[];
}

const ERRORS: readonly Case<OntologyError>[] = [
  {
    value: { kind: 'malformed', id: 'entropy', path: 'definition.en', message: 'expected a string' },
    mentions: ['entropy: definition.en: expected a string'],
  },
  {
    value: { kind: 'malformed', id: 'entropy', path: '', message: 'not an object' },
    mentions: ['entropy: not an object'],
  },
  { value: { kind: 'duplicate-id', id: cid('entropy') }, mentions: ['entropy', 'duplicate concept id'] },
  {
    value: { kind: 'unknown-reference', id: cid('entropy'), relation: 'dependsOn', target: cid('nothing') },
    mentions: ['entropy', 'dependsOn', 'unknown concept "nothing"'],
  },
  {
    value: { kind: 'self-relation', id: cid('entropy'), relation: 'related' },
    mentions: ['entropy', 'cannot be related itself'],
  },
  {
    value: { kind: 'repeated-relation', id: cid('entropy'), relation: 'broader', target: cid('information') },
    mentions: ['"information"', 'more than once in broader'],
  },
  {
    value: { kind: 'cycle', scope: 'partOf', cycle: [cid('a'), cid('b'), cid('a')] },
    mentions: ['partOf cycle: a → b → a'],
  },
  {
    value: {
      kind: 'stratum-constraint',
      id: cid('fourier-transform'),
      relation: 'formalizes',
      target: cid('value'),
      source: 'formal',
      targetStratum: 'value',
    },
    mentions: ['fourier-transform', 'formalizes "value"', 'from formal to value'],
  },
  {
    value: {
      kind: 'category-constraint',
      id: cid('signal'),
      relation: 'measures',
      target: cid('channel'),
      source: 'entity',
      targetCategory: 'entity',
    },
    mentions: ['signal', 'measures "channel"', 'not allowed from a entity to a entity'],
  },
  {
    value: { kind: 'symmetric-stored-twice', relation: 'contrastsWith', a: cid('signal'), b: cid('noise') },
    mentions: ['signal ↔ noise', 'contrastsWith is symmetric', 'keep it in one'],
  },
  {
    value: { kind: 'pair-under-two-types', a: cid('signal'), b: cid('noise'), relations: ['related', 'contrastsWith'] },
    mentions: ['signal — noise', '(related, contrastsWith)', 'most specific'],
  },
  {
    value: { kind: 'associative-hierarchical', id: cid('entropy'), relation: 'related', target: cid('information') },
    mentions: ['entropy', 'related "information"', 'SKOS S27'],
  },
  { value: { kind: 'isolated', id: cid('being') }, mentions: ['being', 'no relation to any other concept'] },
  { value: { kind: 'disconnected', component: [cid('x'), cid('y')] }, mentions: ['disconnected', 'x, y'] },
  {
    value: { kind: 'proposition-without-source', id: cid('kraft-inequality') },
    mentions: ['kraft-inequality', 'at least one source'],
  },
  {
    value: { kind: 'duplicate-slug', locale: 'pt-BR', slug: slug('entropia'), ids: [cid('entropy'), cid('entropy-2')] },
    mentions: ['pt-BR', 'slug "entropia"', 'entropy, entropy-2'],
  },
  {
    value: { kind: 'duplicate-pref-label', locale: 'en', label: 'Entropy', ids: [cid('entropy'), cid('entropy-2')] },
    mentions: ['en', 'prefLabel "Entropy"', 'entropy, entropy-2'],
  },
  {
    value: { kind: 'pref-alt-overlap', id: cid('entropy'), locale: 'en', label: 'Entropy' },
    mentions: ['entropy', '"Entropy" is both prefLabel and altLabel in en', 'SKOS S13'],
  },
  {
    value: {
      kind: 'slug-locale-mismatch',
      id: cid('entropy'),
      locale: 'pt-BR',
      slug: slug('entropy'),
      expected: ['entropia', 'entropia-de-shannon'],
    },
    mentions: ['entropy', 'pt-BR slug "entropy"', 'entropia, entropia-de-shannon'],
  },
];

const WARNINGS: readonly Case<OntologyWarning>[] = [
  {
    value: { kind: 'redundant-broader', id: cid('entropy'), target: cid('sign'), via: [cid('information')] },
    mentions: ['broader "sign"', 'entropy → information → sign', 'transitive reduction'],
  },
  {
    value: { kind: 'polyhierarchy-excess', id: cid('x'), parents: [cid('a'), cid('b'), cid('c')] },
    mentions: ['x', '3 broader concepts (a, b, c)', 'classification smell'],
  },
];

/** Compile-time exhaustiveness: adding a kind to the sum types without listing it here fails the type check. */
const ERROR_KINDS: Readonly<Record<OntologyError['kind'], true>> = {
  malformed: true,
  'duplicate-id': true,
  'unknown-reference': true,
  'self-relation': true,
  'repeated-relation': true,
  cycle: true,
  'stratum-constraint': true,
  'category-constraint': true,
  'symmetric-stored-twice': true,
  'pair-under-two-types': true,
  'associative-hierarchical': true,
  isolated: true,
  disconnected: true,
  'proposition-without-source': true,
  'duplicate-slug': true,
  'duplicate-pref-label': true,
  'pref-alt-overlap': true,
  'slug-locale-mismatch': true,
};
const WARNING_KINDS: Readonly<Record<OntologyWarning['kind'], true>> = {
  'redundant-broader': true,
  'polyhierarchy-excess': true,
};

describe('describeError', () => {
  test('the table has a case for every error kind', () => {
    expect(new Set(ERRORS.map((c) => c.value.kind))).toEqual(new Set(Object.keys(ERROR_KINDS)));
  });
  test.each(ERRORS.map((c) => ({ ...c, kind: c.value.kind })))('$kind names what to fix', ({ value, mentions }) => {
    const text = describeError(value);
    for (const fragment of mentions) expect(text).toContain(fragment);
  });
});

describe('describeWarning', () => {
  test('the table has a case for every warning kind', () => {
    expect(new Set(WARNINGS.map((c) => c.value.kind))).toEqual(new Set(Object.keys(WARNING_KINDS)));
  });
  test.each(WARNINGS.map((c) => ({ ...c, kind: c.value.kind })))('$kind names what to fix', ({ value, mentions }) => {
    const text = describeWarning(value);
    for (const fragment of mentions) expect(text).toContain(fragment);
  });
});
