import { describe, expect, it } from 'vitest';
import { fc, test } from '@fast-check/vitest';
import { escapedPositions, scanCitations } from '../../../src/core/latex/citation-parser.ts';

const kinds = (s: string): string[] => scanCitations(s).map((t) => `${t.type}:${t.raw}`);

describe('scanCitations (export-only Pandoc syntax)', () => {
  it('recognises parenthetical, multiple, suppressed and narrative citations', () => {
    expect(kinds('A [@shannon1948, p. 379] b.')).toEqual(['text:A ', 'parenthetical:[@shannon1948, p. 379]', 'text: b.']);
    const [, group] = scanCitations('x [ver @a; @b, cap. 2] y');
    expect(group).toEqual({
      type: 'parenthetical',
      raw: '[ver @a; @b, cap. 2]',
      items: [
        { key: 'a', prefix: 'ver', suffix: '', suppressAuthor: false },
        { key: 'b', prefix: '', suffix: 'cap. 2', suppressAuthor: false },
      ],
    });
    expect(scanCitations('[-@k]')[0]).toMatchObject({ items: [{ key: 'k', suppressAuthor: true }] });
    expect(scanCitations('@k [p. 3] diz')[0]).toEqual({
      type: 'narrative',
      raw: '@k [p. 3]',
      item: { key: 'k', prefix: '', suffix: 'p. 3', suppressAuthor: false },
    });
  });

  it('keeps e-mails, plain brackets and unknown narrative keys as text', () => {
    expect(kinds('fulano@exemplo.com')).toEqual(['text:fulano@exemplo.com']);
    expect(kinds('[nota] e [a; b]')).toEqual(['text:[nota] e [a; b]']);
    expect(scanCitations('@twitter', { isKey: (k) => k === 'shannon1948' })).toEqual([
      { type: 'text', raw: '@twitter' },
    ]);
  });

  it('honours Markdown escapes recovered from the source', () => {
    const value = '[@k] e @j';
    const escaped = escapedPositions(value, '\\[@k] e \\@j');
    expect(escaped).toBeDefined();
    expect(scanCitations(value, escaped === undefined ? {} : { escaped }).map((t) => t.type)).toEqual(['text']);
  });

  it('refuses to guess when character references change the bracket count', () => {
    expect(escapedPositions('[@k]', '&#91;@k]')).toBeUndefined();
  });

  test.prop([fc.string({ maxLength: 160 })], { numRuns: 1000 })('is lossless', (s) => {
    expect(
      scanCitations(s)
        .map((t) => t.raw)
        .join(''),
    ).toBe(s);
  });

  test.prop(
    [fc.array(fc.constantFrom('[', ']', '@', '-', ';', ',', ' ', 'k', 'p.', '1', 'é', '\n'), { maxLength: 40 })],
    { numRuns: 1000 },
  )('is lossless on citation-dense strings', (parts) => {
    const s = parts.join('');
    expect(
      scanCitations(s)
        .map((t) => t.raw)
        .join(''),
    ).toBe(s);
  });
});
