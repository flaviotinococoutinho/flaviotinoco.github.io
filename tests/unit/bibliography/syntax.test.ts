import { describe, expect, it } from 'vitest';
import { fc, test } from '@fast-check/vitest';
import { escapedMarkers } from '../../../src/core/bibliography/cite/escapes.ts';
import { parseSuffix } from '../../../src/core/bibliography/cite/locator.ts';
import { scanCitations, type Citation } from '../../../src/core/bibliography/cite/syntax.ts';

const KNOWN = new Set(['shannon1948', 'clarac1985', 'a', 'b', 'k', 'doe:99', 'x.y']);
const scan = (value: string, escaped: ReadonlySet<number> = new Set()) =>
  scanCitations(value, { isKnown: (k) => KNOWN.has(k), isEscaped: (i) => escaped.has(i) });
const shapes = (value: string): readonly string[] =>
  scan(value).citations.map(
    (c: Citation) =>
      `${c.mode}:${c.items.map((i) => `${i.prefix}${i.suppressAuthor ? '-' : ''}@${i.key}${i.locator ? `<${i.locator.label} ${i.locator.values.map((v) => v.first + (v.last ? `-${v.last}` : '')).join(',')}>` : ''}${i.suffix}`).join(';')}`,
  );

describe('scanCitations', () => {
  it.each([
    ['[@shannon1948]', ['parenthetical:@shannon1948']],
    ['[@shannon1948, p. 12]', ['parenthetical:@shannon1948<page 12>']],
    ['[see @a, p. 3; @b]', ['parenthetical:see @a<page 3>;@b']],
    ['[-@shannon1948]', ['parenthetical:-@shannon1948']],
    ['[@k, pp. 33--35, 38]', ['parenthetical:@k<page 33-35,38>']],
    ['[@k, cap. V]', ['parenthetical:@k<chapter V>']],
    ['[@k, § 4]', ['parenthetical:@k<section 4>']],
    ['[@k, 12]', ['parenthetical:@k<page 12>']],
    ['[@k p. 12]', ['parenthetical:@k<page 12>']],
    ['[@k, p. 33, grifo nosso]', ['parenthetical:@k<page 33>, grifo nosso']],
    ['[@k, grifo nosso]', ['parenthetical:@k, grifo nosso']],
    ['@shannon1948 says', ['narrative:@shannon1948']],
    ['@shannon1948 [p. 379] says', ['narrative:@shannon1948<page 379>']],
    ['@shannon1948 [33] says', ['narrative:@shannon1948<page 33>']],
    ['(@shannon1948)', ['narrative:@shannon1948']],
    ['@shannon1948.', ['narrative:@shannon1948']],
    ['[@doe:99] and [@x.y]', ['parenthetical:@doe:99', 'parenthetical:@x.y']],
    ['[@{shannon1948}]', ['parenthetical:@shannon1948']],
    ['@k [@a]', ['narrative:@k', 'parenthetical:@a']],
  ])('%s', (value, expected) => {
    expect(shapes(value)).toEqual(expected);
  });

  it.each([
    'fulano@exemplo.com',
    '[contato: fulano@exemplo.com]',
    '[see@k]',
    '@flavio is not a key',
    '[no citation here]',
    '[@]',
    'R$ 5,00 e @ 10',
  ])('leaves %s alone', (value) => {
    expect(scan(value).citations).toEqual([]);
    expect(scan(value).problems).toEqual([]);
  });

  it('reports unknown keys inside brackets (and only there)', () => {
    const r = scan('[@nope, p. 1] and @nope2');
    expect(r.problems).toEqual([{ kind: 'unknown-key', key: 'nope', start: 0, end: 13 }]);
  });

  it('keeps the exact source of each citation (data-cite)', () => {
    const value = 'x [see @a, p. 3; -@b] y @k [p. 2] z';
    for (const c of scan(value).citations) expect(value.slice(c.start, c.end)).toBe(c.source);
    expect(scan(value).citations.map((c) => c.source)).toEqual(['[see @a, p. 3; -@b]', '@k [p. 2]']);
  });

  it('honours escaped markers', () => {
    expect(scan('[@a]', new Set([0])).citations).toEqual([]);
    expect(scan('[@a]', new Set([1])).citations).toEqual([]);
    expect(scan('[@a]', new Set([3])).citations).toEqual([]);
    expect(scan('@k', new Set([0])).citations).toEqual([]);
    expect(scan('@k [p. 2]', new Set([3])).citations.map((c) => c.source)).toEqual(['@k']);
    expect(scan('\\[@a] [@b]', new Set([1])).citations.map((c) => c.source)).toEqual(['[@b]']);
  });
});

describe('parseSuffix', () => {
  it.each([
    [', p. 12', 'page', ''],
    [', pp. 12-15', 'page', ''],
    [', p. xi', 'page', ''],
    [', chap. 3', 'chapter', ''],
    [', seção 3.2', 'section', ''],
    [', v. 2, p. 3', 'volume', ', p. 3'],
    [', ¶ 4', 'paragraph', ''],
    [', local. 264', 'location', ''],
    [', e03304', 'page', ''],
  ])('%s', (suffix, label, rest) => {
    const r = parseSuffix(suffix);
    expect(r.locator?.label).toBe(label);
    expect(r.rest).toBe(rest);
  });

  it('keeps what is not a locator verbatim', () => {
    expect(parseSuffix(', grifo nosso')).toEqual({ rest: ', grifo nosso' });
    expect(parseSuffix(' 12')).toEqual({ rest: ' 12' });
    expect(parseSuffix(' 12', { bare: true }).locator?.label).toBe('page');
    expect(parseSuffix(', foo 12')).toEqual({ rest: ', foo 12' });
  });
});

describe('escapedMarkers', () => {
  it('maps each marker of the value to its source counterpart', () => {
    expect([...(escapedMarkers('[@a] [@b]', '\\[@a] [@b]') ?? [])]).toEqual([0]);
    expect([...(escapedMarkers('[@a]', '[\\@a]') ?? [])]).toEqual([1]);
    expect([...(escapedMarkers('\\[@a]', '\\\\[@a]') ?? [])]).toEqual([]);
  });

  it('refuses when a character reference produced a marker', () => {
    expect(escapedMarkers('@a', '&#64;a')).toBeUndefined();
  });
});

// ---------------------------------------------------------------- properties

const key = fc.constantFrom('shannon1948', 'clarac1985', 'a', 'b', 'k');
const locator = fc.option(
  fc.tuple(
    fc.constantFrom(['p.', 'page'], ['cap.', 'chapter'], ['v.', 'volume'], ['§', 'section']),
    fc.integer({ min: 1, max: 999 }),
  ),
  { nil: undefined },
);
const item = fc.record({ prefix: fc.constantFrom('', 'see ', 'cf. '), suppress: fc.boolean(), key, locator });

describe('properties', () => {
  test.prop([fc.array(item, { minLength: 1, maxLength: 4 })], { numRuns: 300 })(
    'a generated bracket group is recovered exactly (keys, prefixes, suppression, locators)',
    (items) => {
      const source = `[${items
        .map(
          (i) =>
            `${i.prefix}${i.suppress ? '-' : ''}@${i.key}${i.locator === undefined ? '' : `, ${i.locator[0][0]} ${i.locator[1]}`}`,
        )
        .join('; ')}]`;
      const [c, ...rest] = scan(`text ${source} text`).citations;
      expect(rest).toEqual([]);
      expect(c?.source).toBe(source);
      expect(
        c?.items.map((i) => ({
          prefix: i.prefix,
          suppress: i.suppressAuthor,
          key: i.key,
          locator: i.locator === undefined ? undefined : [i.locator.label, Number(i.locator.values[0]?.first)],
        })),
      ).toEqual(
        items.map((i) => ({
          prefix: i.prefix,
          suppress: i.suppress,
          key: i.key,
          locator: i.locator === undefined ? undefined : [i.locator[0][1], i.locator[1]],
        })),
      );
    },
  );

  test.prop([fc.string({ maxLength: 60 })], { numRuns: 500 })(
    'citations are disjoint, ordered and slice the text exactly',
    (value) => {
      let end = 0;
      for (const c of scan(value).citations) {
        expect(c.start).toBeGreaterThanOrEqual(end);
        expect(value.slice(c.start, c.end)).toBe(c.source);
        end = c.end;
      }
    },
  );

  test.prop([fc.array(item, { minLength: 1, maxLength: 3 })], { numRuns: 200 })(
    'an escaped opening bracket is never a citation',
    (items) => {
      const source = `[${items.map((i) => `${i.prefix}@${i.key}`).join('; ')}]`;
      expect(scan(source, new Set([0])).citations.filter((c) => c.mode === 'parenthetical')).toEqual([]);
    },
  );
});
