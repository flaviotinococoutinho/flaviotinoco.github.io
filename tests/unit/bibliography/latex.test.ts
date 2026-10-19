import { describe, expect, it } from 'vitest';
import { fc, test } from '@fast-check/vitest';
import {
  concatMarked,
  decodeLatex,
  marked,
  recase,
  sliceMarked,
  toNfc,
  trimMarked,
} from '../../../src/core/bibliography/bibtex/latex.ts';

const text = (raw: string): string => decodeLatex(raw).value.text;

describe('decodeLatex', () => {
  it.each([
    [String.raw`Jos\'e`, 'José'],
    [String.raw`Jos{\'e}`, 'José'],
    [String.raw`Jos\'{e}`, 'José'],
    [String.raw`{\'\i}ndice`, 'índice'],
    [String.raw`\'{\i}ndice`, 'índice'],
    [String.raw`Na{\"\i}ve`, 'Naïve'],
    [String.raw`\^{\j}`, 'ĵ'],
    [String.raw`Concei{\c c}{\~a}o`, 'Conceição'],
    [String.raw`\c{c}\~{a}o`, 'ção'],
    [String.raw`\`a \^o \"u \~n \=a \.z`, 'à ô ü ñ ā ż'],
    [String.raw`\u{a} \H{o} \r{a} \k{a} \v{s} \d{a} \b{a}`, 'ă ő å ą š ạ a\u0331'],
    [String.raw`{\v S}koda`, 'Škoda'],
    [String.raw`\ss{} \o{} \O{} \ae{} \AE{} \oe{} \OE{} \l{} \L{} \aa{} \AA{}`, 'ß ø Ø æ Æ œ Œ ł Ł å Å'],
    [String.raw`\ss x`, 'ßx'],
    ['a -- b --- c - d', 'a – b — c - d'],
    ['a~b', 'a\u00A0b'],
    [String.raw`\& \% \$ \_ \# \{ \}`, '& % $ _ # { }'],
    ["``quoted'' and `single'", '“quoted” and ‘single’'],
    ['  many   spaces\n here ', 'many spaces here'],
    [String.raw`line\\break`, 'line break'],
    [String.raw`\textendash{} \ldots{} \S 3`, '– … §3'],
    [String.raw`\url{http://a.b/~c_d}`, 'http://a.b/~c_d'],
    [String.raw`\'{}`, '´'],
  ])('%s → %s', (raw, expected) => {
    expect(text(raw)).toBe(expected);
  });

  it('records case-protected spans and removes the braces', () => {
    const d = decodeLatex('The {NASA} mission and {F}ourier').value;
    expect(d.text).toBe('The NASA mission and Fourier');
    expect(d.protected.map((r) => d.text.slice(r.start, r.end))).toEqual(['NASA', 'F']);
  });

  it("does not protect special-character groups ({\\'e}) nor nested groups twice", () => {
    const d = decodeLatex(String.raw`{\'E}mile {{NASA} x}`).value;
    expect(d.text).toBe('Émile NASA x');
    expect(d.protected.map((r) => d.text.slice(r.start, r.end))).toEqual(['NASA x']);
  });

  it('records italic spans from \\emph, \\textit and {\\em …}', () => {
    const d = decodeLatex(String.raw`a \emph{b} c {\em d e} \textit{f}`).value;
    expect(d.text).toBe('a b c d e f');
    expect(d.italic.map((r) => d.text.slice(r.start, r.end))).toEqual(['b', 'd e', 'f']);
  });

  it('keeps unknown commands and math verbatim, with warnings', () => {
    const r = decodeLatex(String.raw`\foo{bar} baz $x^2$ \qux`);
    expect(r.value.text).toBe(String.raw`\foo{bar} baz $x^2$ \qux`);
    expect(r.problems.map((p) => p.code)).toEqual([
      'latex:unknown-command',
      'latex:math-verbatim',
      'latex:unknown-command',
    ]);
  });

  it('keeps an unbalanced "}" verbatim with a warning', () => {
    const r = decodeLatex('a } b');
    expect(r.value.text).toBe('a } b');
    expect(r.problems.map((p) => p.code)).toEqual(['latex:unbalanced-brace']);
  });

  it('outputs NFC and fixes dotless i + combining accent, also in raw Unicode input', () => {
    const decomposed = 'Estatı\u0301stica'; // dotless ı + U+0301, as naive decoders produce
    expect(text(decomposed)).toBe('Estatística');
    expect(toNfc(decomposed)).toBe('Estatística');
    expect(text('e\u0301')).toBe('é');
    expect(text(String.raw`Estat{\'\i}stica`)).toBe('Estatística'.normalize('NFC'));
  });
});

describe('marked text helpers', () => {
  it('slices, trims and concatenates keeping spans aligned', () => {
    const m = decodeLatex('  a {B} c  ').value;
    const t = trimMarked(m);
    expect(t.text).toBe('a B c');
    expect(t.protected.map((r) => t.text.slice(r.start, r.end))).toEqual(['B']);
    const s = sliceMarked(t, 2);
    expect(s.text).toBe('B c');
    expect(s.protected).toEqual([{ start: 0, end: 1 }]);
    const c = concatMarked([marked('x'), s], ' ');
    expect(c.text).toBe('x B c');
    expect(c.protected).toEqual([{ start: 2, end: 3 }]);
  });

  it('recases only outside protected spans', () => {
    expect(recase(decodeLatex('the {iPhone} era').value, (s) => s.toUpperCase())).toBe('THE iPhone ERA');
  });
});

describe('properties', () => {
  test.prop([fc.string({ maxLength: 80 })], { numRuns: 500 })('never throws and always returns NFC', (raw) => {
    const r = decodeLatex(raw);
    expect(r.value.text).toBe(r.value.text.normalize('NFC'));
  });

  test.prop([fc.stringMatching(/^[\\{}'"`^~=.a-zA-Z \-$]{0,40}$/)], { numRuns: 800 })(
    'spans are sorted, disjoint and inside the text for LaTeX-shaped input',
    (raw) => {
      const v = decodeLatex(raw).value;
      for (const spans of [v.protected, v.italic]) {
        let end = -1;
        for (const r of spans) {
          expect(r.start).toBeGreaterThan(end);
          expect(r.end).toBeGreaterThan(r.start);
          expect(r.end).toBeLessThanOrEqual(v.text.length);
          end = r.end;
        }
      }
    },
  );

  test.prop([fc.stringMatching(/^[a-zA-Z0-9 ,.;:!?()]{0,60}$/)], { numRuns: 300 })(
    'plain text without TeX syntax is unchanged (up to white-space collapsing)',
    (raw) => {
      expect(text(raw)).toBe(raw.replace(/\s+/gu, ' ').trim());
    },
  );
});
