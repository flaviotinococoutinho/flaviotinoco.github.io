/**
 * Scope guardrail (ADR 0013): the corpus obeys the rules of src/core/domain/scope.ts.
 *
 * The content schema already rejects an out-of-scope essay at build time (R2); this test
 * states the same rule over the files, adds the corpus-wide share (R3), and requires both
 * locales of a work to declare the same domains, so the scope pages of the two languages
 * can never disagree about what the site covers.
 */
import { describe, expect, it } from 'vitest';
import { parseDomain, type Domain } from '../../../src/core/domain/facets.ts';
import {
  SCOPE_MIN_CORE_SHARE,
  checkCorpusScope,
  coreShare,
  formatScopeProblem,
  type ScopedWork,
} from '../../../src/core/domain/scope.ts';
import { loadCorpus, type Doc } from './corpus.ts';

const corpus = loadCorpus().filter((d) => d.collection === 'essays' || d.collection === 'labs');

const domainsOf = (doc: Doc): readonly Domain[] => {
  const raw = doc.frontmatter['domains'];
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((v) => {
    const d = parseDomain(v);
    return d.ok ? [d.value] : [];
  });
};

const works = (dir: Doc['dir']): readonly ScopedWork[] =>
  corpus
    .filter((d) => d.dir === dir)
    .map((d) => ({ id: d.path, form: d.collection === 'essays' ? 'essay' : 'lab', domains: domainsOf(d) }));

describe('scope of the corpus (ADR 0013)', () => {
  it.each(['pt', 'en'] as const)(
    '%s: every essay declares a core discipline and foundations stay a minority',
    (dir) => {
      const list = works(dir);
      expect(list.length).toBeGreaterThan(0);
      expect(checkCorpusScope(list).map(formatScopeProblem)).toEqual([]);
      expect(coreShare(list)).toBeGreaterThanOrEqual(SCOPE_MIN_CORE_SHARE);
    },
  );

  it('declares the same domains, in the same order, in both locales of a work', () => {
    const byKey = new Map<string, Doc[]>();
    for (const doc of corpus) {
      const key = `${doc.collection}/${String(doc.frontmatter['translationKey'])}`;
      byKey.set(key, [...(byKey.get(key) ?? []), doc]);
    }
    const problems = [...byKey].flatMap(([key, docs]) => {
      const lists = docs.map((d) => domainsOf(d).join(', '));
      return new Set(lists).size > 1
        ? [`${key}: ${docs.map((d, i) => `${d.dir} [${lists[i] ?? ''}]`).join(' ≠ ')}`]
        : [];
    });
    expect(problems).toEqual([]);
  });
});
