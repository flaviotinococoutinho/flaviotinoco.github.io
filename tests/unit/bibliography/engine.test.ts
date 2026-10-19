import { describe, expect, it } from 'vitest';
import { fc, test } from '@fast-check/vitest';
import {
  buildReferenceList,
  renderCitation,
  type CiteRef,
  type RenderContext,
} from '../../../src/core/bibliography/cite/engine.ts';
import type { CitationKey } from '../../../src/core/domain/identifiers.ts';
import { toHtml, toPlainText } from '../../../src/core/bibliography/render/inline.ts';
import { abnt } from '../../../src/core/bibliography/style/abnt.ts';
import { apa } from '../../../src/core/bibliography/style/apa.ts';
import type { CitationStyle } from '../../../src/core/bibliography/style/style.ts';
import { yearLetter } from '../../../src/core/bibliography/style/shared.ts';
import { ref, spaces } from './helpers.ts';

const listKeys = (keys: readonly string[], style: CitationStyle = abnt): readonly string[] =>
  buildReferenceList(
    keys.map((k) => ref(k)),
    style,
  ).entries.map((e) => e.key);

const call = (
  mode: 'parenthetical' | 'narrative',
  items: readonly (Partial<CiteRef> & { readonly key: string })[],
  style: CitationStyle = abnt,
  cited: readonly string[] = items.map((i) => i.key),
): string => {
  const list = buildReferenceList(
    cited.map((k) => ref(k)),
    style,
  );
  const ctx: RenderContext = { style, letterOf: list.letterOf, href: (k) => `#ref-${k}`, anchorId: () => undefined };
  const refs: CiteRef[] = items.map(({ key, ...rest }) => ({
    reference: ref(key),
    prefix: '',
    suppressAuthor: false,
    suffix: '',
    ...rest,
  }));
  return spaces(toPlainText(renderCitation(mode, refs, ctx)));
};

describe('reference list ordering (Intl.Collator pt-BR, by entry text)', () => {
  it('sorts accented initials with their base letter, not after Z', () => {
    expect(listKeys(['azevedo2000', 'avila2000', 'ecio2000', 'avelar2000', 'edson2000', 'eca2000'])).toEqual([
      'avelar2000',
      'avila2000',
      'azevedo2000',
      'eca2000',
      'ecio2000',
      'edson2000',
    ]);
  });

  test.prop([
    fc.shuffledSubarray(
      ['azevedo2000', 'avila2000', 'ecio2000', 'avelar2000', 'edson2000', 'eca2000', 'shannon1949', 'shannon1948'],
      { minLength: 1 },
    ),
  ])('is a function of the set of works, not of citation order', (keys) => {
    expect(listKeys(keys)).toEqual(listKeys([...keys].reverse()));
  });

  it('APA sorts by author, then year (NBR 10520 / 10520 / 6023 by year, not by number)', () => {
    expect(listKeys(['shannon1949', 'shannon1948'], apa)).toEqual(['shannon1948', 'shannon1949']);
  });
});

describe('year letters (NBR 10520 §6.1.6, APA §8.19)', () => {
  it('assigns a, b in list order (by title) and uses them in list and calls', () => {
    const list = buildReferenceList([ref('reeside1927a'), ref('reeside1927b')], abnt);
    // "A new fauna…" (reeside1927b) sorts before "The cephalopods…" (reeside1927a).
    expect(list.entries.map((e) => [e.key, e.letter])).toEqual([
      ['reeside1927b', 'a'],
      ['reeside1927a', 'b'],
    ]);
    expect(spaces(toPlainText(list.entries[0]?.content ?? []))).toMatch(/1927a\.$/u);
    expect(call('parenthetical', [{ key: 'reeside1927a' }, { key: 'reeside1927b' }])).toBe('(Reeside, 1927a, 1927b)');
  });

  it('leaves unambiguous years alone', () => {
    const list = buildReferenceList([ref('shannon1948'), ref('shannon1949')], abnt);
    expect(list.entries.map((e) => e.letter)).toEqual(['', '']);
  });

  it('continues past z with bijective base 26', () => {
    expect([0, 1, 25, 26, 27, 701, 702].map(yearLetter)).toEqual(['a', 'b', 'z', 'aa', 'ab', 'zz', 'aaa']);
  });
});

describe('calls', () => {
  it('parenthetical and narrative, with locator', () => {
    const page = { label: 'page' as const, values: [{ first: '379' }] };
    expect(call('parenthetical', [{ key: 'shannon1948', locator: page }])).toBe('(Shannon, 1948, p. 379)');
    expect(call('narrative', [{ key: 'shannon1948', locator: page }])).toBe('Shannon (1948, p. 379)');
    expect(call('parenthetical', [{ key: 'shannon1948', locator: page }], apa)).toBe('(Shannon, 1948, p. 379)');
  });

  it('several works in alphabetical order; same author merged (Dreyfuss, 1989, 1991)', () => {
    expect(call('parenthetical', [{ key: 'knox1986' }, { key: 'cross1984' }])).toBe('(Cross, 1984; Knox, 1986)');
    expect(call('parenthetical', [{ key: 'dreyfuss1991' }, { key: 'dreyfuss1989' }])).toBe('(Dreyfuss, 1989, 1991)');
    expect(call('parenthetical', [{ key: 'clarac1985' }, { key: 'knox1986' }], apa)).toBe(
      '(Clarac & Bonnin, 1985; Knox, 1986)',
    );
  });

  it('suppressed author, prefixes and verbatim suffixes', () => {
    const page = { label: 'page' as const, values: [{ first: '3' }] };
    expect(call('parenthetical', [{ key: 'shannon1948', suppressAuthor: true, locator: page }])).toBe('(1948, p. 3)');
    expect(
      call('parenthetical', [{ key: 'shannon1948', prefix: 'ver ', locator: page, suffix: ', grifo nosso' }]),
    ).toBe('(ver Shannon, 1948, p. 3, grifo nosso)');
    expect(call('parenthetical', [{ key: 'shannon1948', suffix: ' e passim' }])).toBe('(Shannon, 1948 e passim)');
  });

  it('links each responsibility or year to its entry and gives the first citation an id', () => {
    const list = buildReferenceList([ref('dreyfuss1989'), ref('dreyfuss1991')], abnt);
    const ctx: RenderContext = {
      style: abnt,
      letterOf: list.letterOf,
      href: (k: CitationKey) => `#ref-${k}`,
      anchorId: (k: CitationKey) => (k === 'dreyfuss1989' ? 'cite-dreyfuss1989' : undefined),
    };
    const items = ['dreyfuss1989', 'dreyfuss1991'].map((k): CiteRef => ({
      reference: ref(k),
      prefix: '',
      suppressAuthor: false,
      suffix: '',
    }));
    expect(toHtml(renderCitation('parenthetical', items, ctx))).toBe(
      '(<a href="#ref-dreyfuss1989" id="cite-dreyfuss1989">Dreyfuss</a>, 1989, <a href="#ref-dreyfuss1991">1991</a>)',
    );
  });
});
