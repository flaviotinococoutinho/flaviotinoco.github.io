/**
 * Laws of the parsers and codecs of src/core/latex:
 *   tokenize/print (lossless), label codec (decode ∘ encode = id),
 *   escapeTex/unescapeTex (decode ∘ encode = id, no special survives).
 */
import { describe, expect, it } from 'vitest';
import { fc, test } from '@fast-check/vitest';
import { parseLabel, type Label } from '../../../src/core/domain/identifiers.ts';
import { idToLabel, labelToId } from '../../../src/core/latex/label-codec.ts';
import { escapeTex, escapeUrl, unescapeTex } from '../../../src/core/latex/tex-escape.ts';
import { print, readArgument, tokenize } from '../../../src/core/latex/tex-parser.ts';

const texAlphabet = fc.constantFrom(
  '\\',
  '{',
  '}',
  '%',
  '\n',
  ' ',
  'a',
  'b',
  'l',
  'label',
  'ref',
  '\\label',
  '#',
  '$',
  '*',
);
const texString = fc.array(texAlphabet, { maxLength: 40 }).map((parts) => parts.join(''));

const labelArbitrary: fc.Arbitrary<Label> = fc
  .tuple(fc.stringMatching(/^[a-z]{1,6}$/), fc.stringMatching(/^[a-z0-9][a-z0-9-]{0,12}$/))
  .map(([prefix, name]) => {
    const r = parseLabel(`${prefix}:${name}`);
    if (!r.ok) throw new Error(r.error);
    return r.value;
  });

describe('tex-parser', () => {
  test.prop([fc.string({ maxLength: 200 })], { numRuns: 500 })('is lossless on arbitrary strings', (s) => {
    expect(print(tokenize(s))).toBe(s);
  });

  test.prop([texString], { numRuns: 500 })('is lossless on TeX-dense strings', (s) => {
    expect(print(tokenize(s))).toBe(s);
  });

  it('separates control words, control symbols, comments and groups', () => {
    const kinds = tokenize('\\label{eq:a} % \\label{x}\n\\\\label').map((t) => `${t.kind}:${t.text}`);
    expect(kinds).toEqual([
      'command:\\label',
      'open:{',
      'text:eq:a',
      'close:}',
      'space: ',
      'comment:% \\label{x}',
      'space:\n',
      'command:\\\\',
      'text:label',
    ]);
  });

  it('reads braced arguments across spaces and comments, not across a blank line', () => {
    const tokens = tokenize('\\label %c\n {a{b}c}');
    expect(readArgument(tokens, 0)?.content).toBe('a{b}c');
    expect(readArgument(tokenize('\\label\n\n{a}'), 0)).toBeUndefined();
    expect(readArgument(tokenize('\\label{a'), 0)).toBeUndefined();
    expect(readArgument(tokenize('\\label x'), 0)).toBeUndefined();
  });
});

describe('label codec', () => {
  test.prop([labelArbitrary], { numRuns: 500 })('decode ∘ encode = id', (label) => {
    const decoded = idToLabel(labelToId(label));
    expect(decoded.ok && decoded.value).toBe(label);
  });

  it('maps colon to hyphen and back', () => {
    const label = parseLabel('thm:amostragem-de-sinais');
    expect(label.ok).toBe(true);
    if (!label.ok) return;
    expect(labelToId(label.value)).toBe('thm-amostragem-de-sinais');
    expect(idToLabel('thm-amostragem-de-sinais')).toEqual({ ok: true, value: 'thm:amostragem-de-sinais' });
    expect(idToLabel('env_3').ok).toBe(false);
  });
});

describe('tex escape codec', () => {
  test.prop([fc.string({ maxLength: 200 })], { numRuns: 1000 })('unescape ∘ escape = id', (s) => {
    expect(unescapeTex(escapeTex(s))).toBe(s);
  });

  test.prop([fc.string({ maxLength: 200 })], { numRuns: 1000 })(
    'leaves no bare special character, quote or input ligature',
    (s) => {
      // After removing the escape sequences themselves, no TeX special, no character that TeX's fonts
      // print as something else (' ` "), and no ligature (-- ,,) may remain.
      // (An escape is a glyph of its own: it stands as "X", so it separates what it sits between.)
      const residue = escapeTex(s)
        .replace(/\\text[a-z]+\{\}/g, 'X')
        .replace(/\\[{}#$%&_]/g, 'X')
        .replaceAll('\\/', ' ');
      expect(residue).not.toMatch(/[\\{}#$%&_~^'`"]|--|,,/);
      expect(escapeTex(s)).not.toMatch(/\\textless\{\}\\textless|\\textgreater\{\}\\textgreater/);
    },
  );

  test.prop(
    [fc.array(fc.constantFrom('-', ',', '<', '>', "'", '`', '"', 'a', ' ', '/', '{', '}', '\\'), { maxLength: 30 })],
    {
      numRuns: 1000,
    },
  )('unescape ∘ escape = id on ligature-dense text', (parts) => {
    const s = parts.join('');
    expect(unescapeTex(escapeTex(s))).toBe(s);
  });

  it('breaks TeX input ligatures and keeps straight quotes straight (the PDF prints what the site shows)', () => {
    expect(escapeTex("a -- b --- c ,, d ' e ` f << g")).toBe(
      'a -\\/- b -\\/-\\/- c ,\\/, d \\textquotesingle{} e \\textasciigrave{} f \\textless{}\\/\\textless{} g',
    );
    expect(escapeTex('“aspas” — e–traço, d’água…')).toBe('“aspas” — e–traço, d’água…');
  });

  it('escapes the ten LaTeX specials and the babel-active quote', () => {
    expect(escapeTex('# $ % & ~ _ ^ \\ { } "')).toBe(
      '\\# \\$ \\% \\& \\textasciitilde{} \\_ \\textasciicircum{} \\textbackslash{} \\{ \\} \\textquotedbl{}',
    );
    expect(escapeUrl('https://x.org/a%20b#c~d')).toBe('https://x.org/a\\%20b\\#c\\~d');
  });
});
