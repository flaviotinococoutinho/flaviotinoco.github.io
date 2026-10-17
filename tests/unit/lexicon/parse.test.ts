import { describe, expect, it } from 'vitest';
import { fc, test } from '@fast-check/vitest';
import { formatIssue, parseLexicon, parseLexiconFile } from '../../../src/core/lexicon/parse.ts';
import { tokenizeTsv } from '../../../src/core/lexicon/tsv.ts';
import { loadFixtureLexicon } from './helpers.ts';

const FOREIGN_HEADER = 'term\tlang\tcase\tvariants\tvernacular_in\tnote';
const file = (name: string, text: string) => parseLexiconFile({ name, text });

describe('TSV tokenizer', () => {
  it('skips "#" comments only at column 1, blank lines and a BOM; keeps "#" inside fields', () => {
    const doc = tokenizeTsv('\ufeff# comment\r\n\r\na\tb\r\nC#\tx # not a comment\n# again\n');
    expect(doc.header?.fields.map((f) => f.value)).toEqual(['a', 'b']);
    expect(doc.records.map((r) => r.fields.map((f) => f.value))).toEqual([['C#', 'x # not a comment']]);
    expect(doc.records[0]?.line).toBe(4);
    expect(doc.records[0]?.fields[1]?.column).toBe(4);
  });
});

describe('lexicon parser', () => {
  it('parses every kind of the fixture lexicon', () => {
    const lexicon = loadFixtureLexicon();
    const kinds = new Set(lexicon.entries.map((e) => e.kind));
    expect([...kinds].sort()).toEqual(['acronym', 'foreign', 'homograph', 'latin', 'proper']);
    const fft = lexicon.entries.find((e) => e.term === 'FFT');
    expect(fft?.kind === 'acronym' && fft.expansion['pt-BR']).toBe('transformada rápida de Fourier');
  });

  it('is immune to the YAML "Norway problem": every field is a string', () => {
    const r = file(
      'estrangeirismos.tsv',
      `${FOREIGN_HEADER}\nno\tnb\tsentence\t\t\tnorueguês: não\nyes\ten\texact\t\t\t\n`,
    );
    expect(r.ok && r.value.map((e) => e.term)).toEqual(['no', 'yes']);
  });

  it('normalises terms to NFC (canonically equivalent spellings are one term)', () => {
    const r = file('estrangeirismos.tsv', `${FOREIGN_HEADER}\nfiance\u0301\tfr\tsentence\t\t\t\n`);
    expect(r.ok && r.value[0]?.term).toBe('fiancé');
  });

  it('accumulates every error with file, line and column', () => {
    const text = [
      '# header follows',
      FOREIGN_HEADER,
      'software\teng\tsentence\t\t\t',
      'design\ten\tsometimes\t\t\t',
      'token\ten\tsentence\t\t\t\textra',
      ' pixel\ten\tsentence\t\t\t',
      'big  data\ten\tsentence\t\t\t',
      'feedback\ten\tsentence\t\t\t',
      'feedback\ten\tsentence\t\t\t',
      'Zeitgeist\tde\tinsensitive\t\tde\t',
      'mul\tmul\texact\t\t\t',
    ].join('\n');
    const r = file('estrangeirismos.tsv', text);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.map((i) => [i.line, i.code])).toEqual([
      [3, 'bad-lang'],
      [4, 'bad-case'],
      [5, 'field-count'],
      [6, 'whitespace'],
      [7, 'bad-term'],
      [9, 'duplicate'],
      [10, 'bad-vernacular-in'],
      [11, 'bad-lang'],
    ]);
    expect(r.error[0]?.column).toBe(10);
    expect(formatIssue(r.error[0] ?? { file: '', line: 0, column: 0, code: 'bad-lang', message: '' })).toMatch(
      /^estrangeirismos\.tsv:3:10 \[bad-lang\]/u,
    );
  });

  it('enforces the header, the file names and the kind-specific columns', () => {
    expect(file('estrangeirismos.tsv', 'term\tlang\tcase\n').ok).toBe(false);
    expect(file('estrangeirismos.tsv', '# only comments\n').ok).toBe(false);
    expect(file('glossario.tsv', FOREIGN_HEADER).ok).toBe(false);
    expect(file('latim.tsv', `${FOREIGN_HEADER}\na priori\ten\tsentence\t\t\t\n`).ok).toBe(false);
    expect(file('nomes-proprios.tsv', 'term\tlang\tcase\tcategory\tnote\nShannon\ten\texact\tscientist\t\n').ok).toBe(
      false,
    );
    expect(
      file('siglas.tsv', 'term\tlang\tcase\texpansion_pt\texpansion_en\tlang_of_expansion\nFFT\tmul\texact\t\tx\ten\n')
        .ok,
    ).toBe(false);
    expect(file('homografos.tsv', 'term\tlang\tcase\thomograph_of\tnote\ndata\ten\tsentence\ten\t\n').ok).toBe(false);
    expect(file('homografos.tsv', 'term\tlang\tcase\thomograph_of\tnote\ndata\ten\tsentence\tpt-BR\t\n').ok).toBe(
      false,
    );
  });

  it('rejects a homograph that is also listed as an always-marked foreign term', () => {
    const r = parseLexicon([
      { name: 'estrangeirismos.tsv', text: `${FOREIGN_HEADER}\ndata\ten\tsentence\t\t\t\n` },
      { name: 'homografos.tsv', text: 'term\tlang\tcase\thomograph_of\tnote\ndata\ten\tsentence\tpt\t\n' },
    ]);
    expect(!r.ok && r.error.map((i) => i.code)).toEqual(['conflict']);
  });

  test.prop([fc.string({ maxLength: 200 })], { numRuns: 300 })('is total: any text yields entries or issues', (s) => {
    const r = file('estrangeirismos.tsv', `${FOREIGN_HEADER}\n${s}`);
    expect(typeof r.ok).toBe('boolean');
  });
});
