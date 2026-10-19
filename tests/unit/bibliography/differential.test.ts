/**
 * Differential tests: our decoder and name parser against
 * @retorquere/bibtex-parser (the parser of Better BibTeX for Zotero), used here
 * ONLY as an oracle. Both outputs are normalised the same way — NFC, after
 * turning a dotless ı/ȷ followed by a combining mark into i/j — because the
 * oracle's raw output is not NFC (docs/research/unified-latex.md §7).
 *
 * Known, deliberate divergences are listed in DIVERGENT with the reason and the
 * output of each side, and are asserted too: if either side changes, the test
 * says so.
 */
import { describe, expect, it } from 'vitest';
import { fc, test } from '@fast-check/vitest';
import { parse as oracle } from '@retorquere/bibtex-parser';
import { decodeLatex } from '../../../src/core/bibliography/bibtex/latex.ts';
import { parseNames } from '../../../src/core/bibliography/bibtex/names.ts';

const normalise = (s: string): string =>
  s.replace(/[ıȷ](?=[\u0300-\u036F])/gu, (c) => (c === 'ı' ? 'i' : 'j')).normalize('NFC');

const OPTIONS = { english: false, sentenceCase: false, caseProtection: 'strict' } as const;

/** Field values: accents in every notation, special letters, ligatures, escapes, protection. */
const VALUES: readonly string[] = [
  String.raw`Jos{\'e}`,
  String.raw`Jos\'e`,
  String.raw`Jos\'{e}`,
  String.raw`{\'\i}ndice`,
  String.raw`\'{\i}ndice`,
  String.raw`Estat{\'\i}stica`,
  String.raw`Na{\"\i}ve`,
  String.raw`{\c c}{\~a}o`,
  String.raw`\c{c}\~{a}o`,
  String.raw`Concei\c{c}\~ao`,
  String.raw`\v{S}koda`,
  String.raw`{\v S}koda`,
  String.raw`Ji{\v r}{\'\i} Matou{\v s}ek`,
  String.raw`\u{a}`,
  String.raw`\H{o}`,
  String.raw`\r{a}`,
  String.raw`\k{a}`,
  String.raw`\={a}`,
  String.raw`\.{z}`,
  String.raw`\^{o}`,
  String.raw`\`{a}`,
  String.raw`\"{u}ber`,
  String.raw`{\ss}`,
  String.raw`\o{}`,
  String.raw`\O{}`,
  String.raw`\ae{}`,
  String.raw`\AE{}`,
  String.raw`\oe{}`,
  String.raw`\l{}`,
  String.raw`\L{}`,
  String.raw`\aa{}`,
  String.raw`\AA{}`,
  String.raw`a -- b`,
  String.raw`a --- b`,
  String.raw`a~b`,
  String.raw`\& \% \$ \_ \#`,
  String.raw`The {NASA} mission`,
  String.raw`{F}ourier`,
  String.raw`G{\"o}del`,
  String.raw`Montr{\'e}al`,
  String.raw`{\"U}ber {Sinn} und {Bedeutung}`,
  String.raw`Associa{\c c}{\~a}o Brasileira de Normas T{\'e}cnicas`,
  String.raw`Wroc{\l}aw`,
  String.raw`{\O}rsted`,
  String.raw`Erd{\H{o}}s`,
];

/** Name lists: the three bibtex forms, particles, Jr, corporate names, ties, special characters. */
const NAME_LISTS: readonly string[] = [
  'Shannon, Claude Elwood',
  'Claude Elwood Shannon',
  'Jo{\\~a}o da Silva',
  'Silva, Jo{\\~a}o da',
  'da Silva, Jo{\\~a}o',
  'Ludwig van Beethoven',
  'van Beethoven, Ludwig',
  'Ford, Jr., Henry',
  '{World Wide Web Consortium}',
  'Per Brinch~Hansen',
  'Brinch~Hansen, Per',
  "Charles Louis Xavier Joseph de la Vall{\\'e}e~Poussin",
  "{\\'E}mile Durkheim",
  'Ferdinand de Saussure',
  'de Saussure, Ferdinand',
  "{L{\\'o}pez de M{\\'a}ntaras}, Ram{\\'o}n",
  'Jean-Paul Sartre',
  'Plato',
  'Brayner, A. R. A. and Medeiros, C. B.',
  'Kurt G{\\"o}del',
  'De la Fontaine, Jean',
  'Jean De la Fontaine',
  'Della Robbia, Luca',
  'Luca della Robbia',
  'A and B and others',
  'Doe, J. AND Roe, R.',
  '{\\v S}koda, Jan',
  "Ji{\\v r}{\\'\\i} Matou{\\v s}ek",
  'Moura, L. R. and Torres, L. M. and Cadete, M. M. M. and Cunha, C. F.',
];

type Person = {
  readonly lastName?: string;
  readonly firstName?: string;
  readonly prefix?: string;
  readonly suffix?: string;
  readonly name?: string;
};

/** Values whose decoding differs on purpose. */
const DIVERGENT: readonly {
  readonly raw: string;
  readonly ours: string;
  readonly oracle: string;
  readonly why: string;
}[] = [
  {
    raw: String.raw`\TeX foo`,
    ours: 'TeXfoo',
    oracle: String.raw`\TeXfoo`,
    why: 'we know \\TeX (→ "TeX"); both swallow the space after a control word, as TeX does',
  },
];

const oracleValues = (values: readonly string[]): readonly string[] => {
  const lib = oracle(values.map((v, i) => `@misc{k${i}, title = {${v}}}`).join('\n'), OPTIONS);
  return lib.entries.map((e) => normalise(String(e.fields['title'] ?? '')));
};

const oracleNames = (lists: readonly string[]): readonly (readonly Person[])[] => {
  const lib = oracle(lists.map((v, i) => `@misc{k${i}, author = {${v}}}`).join('\n'), OPTIONS);
  return lib.entries.map((e) => (e.fields.author ?? []) as readonly Person[]);
};

const ours = (list: string): readonly Person[] => {
  const r = parseNames(list).value;
  const people = r.names.map((n): Person =>
    n.kind === 'corporate'
      ? { name: n.name.text }
      : {
          lastName: n.family.text,
          ...(n.given !== undefined ? { firstName: n.given.text } : {}),
          ...(n.particle !== undefined ? { prefix: n.particle.text } : {}),
          ...(n.suffix !== undefined ? { suffix: n.suffix.text } : {}),
        },
  );
  // The oracle keeps "others" as a pseudo-name; we keep it as a flag.
  return r.others ? [...people, { lastName: 'others' }] : people;
};

const normalisePerson = (p: Person): Person => Object.fromEntries(Object.entries(p).map(([k, v]) => [k, normalise(v)]));

describe('differential: LaTeX decoding vs @retorquere/bibtex-parser', () => {
  const expected = oracleValues(VALUES);
  it.each(VALUES.map((v, i) => [v, expected[i] ?? '']))('%s', (raw, theirs) => {
    expect(decodeLatex(raw).value.text).toBe(theirs);
  });

  it.each(DIVERGENT.map((d) => [d.raw, d]))('documented divergence: %s', (_raw, d) => {
    expect(decodeLatex(d.raw).value.text).toBe(d.ours);
    expect(oracleValues([d.raw])[0]).toBe(d.oracle);
  });
});

const accent = fc
  .tuple(
    fc.constantFrom("'", '`', '^', '"', '~', '=', '.', 'c', 'v', 'u', 'H', 'k', 'r'),
    fc.constantFrom('a', 'e', 'o', 'u', 'c', 's', 'z', 'A', 'E', 'O', 'S', '\\i'),
    fc.boolean(),
  )
  .map(([cmd, letter, braced]) => {
    const sep = /[a-zA-Z]/u.test(cmd) && !braced ? ' ' : '';
    return braced ? `{\\${cmd}{${letter}}}` : `{\\${cmd}${sep}${letter}}`;
  });
const word = fc
  .array(fc.oneof(accent, fc.constantFrom('a', 'b', 'x', 'Q')), { minLength: 1, maxLength: 5 })
  .map((p) => p.join(''));

describe('differential: generated accent sequences', () => {
  test.prop([fc.array(word, { minLength: 1, maxLength: 8 })], { numRuns: 30 })('agree after NFC', (words) => {
    const theirs = oracleValues(words);
    words.forEach((w, i) => expect(decodeLatex(w).value.text).toBe(theirs[i]));
  });
});

describe('differential: name lists vs @retorquere/bibtex-parser', () => {
  const expected = oracleNames(NAME_LISTS);
  it.each(NAME_LISTS.map((v, i) => [v, expected[i] ?? []]))('%s', (raw, theirs) => {
    expect(ours(raw)).toEqual(theirs.map(normalisePerson));
  });
});
