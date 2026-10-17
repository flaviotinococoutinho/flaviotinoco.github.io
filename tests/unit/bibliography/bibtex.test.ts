import { describe, expect, it } from 'vitest';
import { fc, test } from '@fast-check/vitest';
import { parseCst, type Cst, type CstNode, type CstValue } from '../../../src/core/bibliography/bibtex/cst.ts';
import { buildDatabase, parseBibtex, printCst } from '../../../src/core/bibliography/bibtex/database.ts';
import { tokenize } from '../../../src/core/bibliography/bibtex/lexer.ts';
import { lineIndex, pointAt } from '../../../src/core/bibliography/bibtex/source.ts';
import { buildBibliography, formatDiagnostic } from '../../../src/core/bibliography/index.ts';

const codes = (source: string): readonly string[] => {
  const r = parseBibtex(source);
  return r.ok ? [] : r.error.map((d) => d.code);
};

describe('source positions', () => {
  it('maps offsets to 1-based line/column across LF, CRLF and CR', () => {
    const src = 'ab\ncd\r\nef\rgh';
    const index = lineIndex(src);
    expect(pointAt(index, 0)).toEqual({ line: 1, column: 1, offset: 0 });
    expect(pointAt(index, 4)).toEqual({ line: 2, column: 2, offset: 4 });
    expect(pointAt(index, 7)).toEqual({ line: 3, column: 1, offset: 7 });
    expect(pointAt(index, 10)).toEqual({ line: 4, column: 1, offset: 10 });
  });
});

describe('CST', () => {
  const src = '% junk\n@Article{key1,\n  Title = {A {B} c},\n  year = 1948\n}\n';

  it('keeps the span of every node, key and field', () => {
    const { cst, diagnostics } = parseCst(src);
    expect(diagnostics).toEqual([]);
    const entry = cst.nodes.find((n) => n.kind === 'entry');
    if (entry?.kind !== 'entry') throw new Error('no entry');
    expect(entry.type).toBe('article');
    expect(entry.keySpan.start).toEqual({ line: 2, column: 10, offset: 16 });
    const title = entry.fields[0];
    expect(title?.name).toBe('Title');
    expect(title?.nameSpan.start).toMatchObject({ line: 3, column: 3 });
    expect(title?.value.pieces[0]).toMatchObject({ kind: 'braced', raw: 'A {B} c' });
    expect(entry.span.end).toMatchObject({ line: 5, column: 2 });
    expect(cst.nodes[0]).toMatchObject({ kind: 'junk', text: '% junk\n' });
  });

  it('parses parenthesised entries, @comment, @preamble and @string', () => {
    const { cst, diagnostics } = parseCst(
      '@comment{anything {nested} here}\n@preamble{"\\newcommand"}\n@STRING(ire = "Proc. IRE")\n@book(k, title = ire # " 37")',
    );
    expect(diagnostics).toEqual([]);
    expect(cst.nodes.filter((n) => n.kind !== 'junk').map((n) => n.kind)).toEqual([
      'comment',
      'preamble',
      'string',
      'entry',
    ]);
  });

  it('treats "@comment" without braces as a comment line', () => {
    expect(parseCst('@comment this line is ignored\n@book{k, title={T}, year=2000}').diagnostics).toEqual([]);
  });

  it('accumulates several errors with positions and keeps parsing after each', () => {
    const r = parseCst(
      '@book{a, title = {T}, year 2000}\n@book{b, title = }\n@book{, title={x}}\n@book{c, title={ok}}',
    );
    const messages = r.diagnostics.map((d) => `${d.span.start.line}:${d.code}`);
    expect(messages).toEqual(['1:parse:expected-equals', '2:parse:expected-value', '3:parse:expected-key']);
    expect(r.cst.nodes.filter((n) => n.kind === 'entry').map((n) => (n.kind === 'entry' ? n.key : ''))).toEqual([
      'a',
      'b',
      '',
      'c',
    ]);
  });

  it('recovers from an unterminated brace at the next line-initial entry', () => {
    const r = parseCst('@book{a, title = {Broken\n\n@book{b, title = {Fine}, year = 1}\n');
    expect(r.diagnostics.map((d) => d.code)).toContain('lex:unterminated-braces');
    expect(r.cst.nodes.some((n) => n.kind === 'entry' && n.key === 'b')).toBe(true);
  });

  it('reports an entry left open at the end of the file and a stray @', () => {
    expect(parseCst('@book{a, title = {T}').diagnostics.map((d) => d.code)).toEqual(['lex:unclosed-entry']);
    expect(parseCst('@ {x}').diagnostics.map((d) => d.code)).toEqual(['parse:expected-entry-type']);
    expect(parseCst('@book x').diagnostics.map((d) => d.code)).toEqual(['parse:expected-open']);
  });

  it('tokenizes quoted values with braces inside', () => {
    const t = tokenize('@a{k, f = "a {"} b"}').tokens.map((x) => `${x.kind}:${x.text}`);
    expect(t).toContain('quoted:a {"} b');
  });
});

describe('database', () => {
  it('expands @string macros and # concatenation, case-insensitively, with predefined months', () => {
    const r = parseBibtex('@String{IRE = "Proc. " # "IRE"}\n@ARTICLE{k, JOURNAL = ire # { 37}, Month = Jan}');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const entry = r.value.entries[0];
    expect(entry?.type).toBe('article');
    expect(entry?.fields.get('journal')?.raw).toBe('Proc. IRE 37');
    expect(entry?.fields.get('month')?.raw).toBe('January');
    expect(r.value.strings.get('ire')).toBe('Proc. IRE');
  });

  it('lets a user @string shadow a month macro but not redefine a user macro', () => {
    expect(codes('@string{jan = "janeiro"}\n@misc{k, month = jan}')).toEqual([]);
    expect(codes('@string{a = "1"}\n@string{A = "2"}')).toEqual(['db:duplicate-macro']);
  });

  it('rejects duplicate keys (case-insensitive) and duplicate fields, and undefined macros', () => {
    expect(codes('@book{Key, title={a}}\n@book{key, title={b}}')).toEqual(['db:duplicate-key']);
    expect(codes('@book{k, title={a}, TITLE={b}}')).toEqual(['db:duplicate-field']);
    expect(codes('@book{k, title=nope}')).toEqual(['db:undefined-macro']);
  });

  it('collects @preamble and @comment contents', () => {
    const r = parseBibtex('@preamble{"\\def\\x{y}"}\n@comment{note}');
    expect(r.ok && r.value.preamble).toEqual(['\\def\\x{y}']);
    expect(r.ok && r.value.comments).toEqual(['note']);
  });

  it('accumulates errors of every file with file names (index)', () => {
    const r = buildBibliography([
      { name: 'a.bib', text: '@book{x, title={T}, year=2000}\n@book{y, titel={T}, year=2000}' },
      { name: 'b.bib', text: '@book{X, title={T}, year=2001}\n@article{z, title={T}}' },
    ]);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.map(formatDiagnostic)).toEqual([
      'a.bib:2:7: error: y: @book requires "title" [model:missing-field]',
      'a.bib:2:10: error: y: field "titel" is not supported on @book [model:unsupported-field]',
      'b.bib:1:7: error: duplicate key "X" (first defined in a.bib:1:7) [db:duplicate-key]',
      'b.bib:2:10: error: z: a "year" or "date" is required [model:missing-field]',
      'b.bib:2:10: error: z: @article requires "journal" [model:missing-field]',
    ]);
  });
});

// ---------------------------------------------------------------- properties

/** Structure without positions: what the printer must preserve. */
const strip = (cst: Cst): unknown =>
  cst.nodes
    .filter((n) => n.kind !== 'junk' || n.text.trim() !== '')
    .map((n: CstNode) => {
      const value = (v: CstValue) =>
        v.pieces.map((p) => (p.kind === 'macro' ? { macro: p.name } : { [p.kind]: p.raw }));
      switch (n.kind) {
        case 'junk':
          return { junk: n.text.trim() };
        case 'comment':
          return { comment: n.raw };
        case 'preamble':
          return { preamble: value(n.value) };
        case 'string':
          return { string: n.field.name, value: value(n.field.value) };
        case 'entry':
          return { type: n.type, key: n.key, fields: n.fields.map((f) => [f.name, value(f.value)]) };
      }
    });

const name = fc.stringMatching(/^[a-z][a-z0-9_:-]{0,8}$/);
/** Balanced brace content without "@" at line starts (a line-initial @ is a recovery point). */
const balanced: fc.Arbitrary<string> = fc.letrec<{ text: string }>((tie) => ({
  text: fc.oneof(
    { maxDepth: 3, withCrossShrink: true },
    fc.stringMatching(/^[a-zA-Z0-9 .,;:'\\~-]{0,12}$/),
    fc.tuple(tie('text'), tie('text')).map(([a, b]) => `${a}{${b}}`),
  ),
})).text;
const quotedSafe = balanced.filter((s) => !s.includes('"'));
const piece = fc.oneof(
  balanced.map((s) => `{${s}}`),
  quotedSafe.map((s) => `"${s}"`),
  fc.integer({ min: 0, max: 99999 }).map(String),
  fc.constantFrom('jan', 'feb', 'dec'),
);
const value = fc.array(piece, { minLength: 1, maxLength: 3 }).map((ps) => ps.join(' # '));
const entry = fc
  .tuple(
    fc.constantFrom('article', 'Book', 'MISC', 'inproceedings'),
    name,
    fc.uniqueArray(name, { maxLength: 4 }),
    fc.array(value, { minLength: 4, maxLength: 4 }),
  )
  .map(
    ([type, key, fields, values]) =>
      `@${type}{${key},\n${fields.map((f, i) => `  ${f} = ${values[i] ?? '{}'}`).join(',\n')}\n}`,
  );
const file = fc
  .array(
    fc.oneof(
      { weight: 4, arbitrary: entry },
      { weight: 1, arbitrary: balanced.map((s) => `@comment{${s}}`) },
      { weight: 1, arbitrary: value.map((v) => `@preamble{${v}}`) },
      { weight: 1, arbitrary: fc.tuple(name, value).map(([n, v]) => `@string{${n} = ${v}}`) },
      { weight: 1, arbitrary: fc.stringMatching(/^[a-zA-Z %.\n]{0,20}$/) },
    ),
    { maxLength: 6 },
  )
  .map((parts) => parts.join('\n'));

describe('properties', () => {
  test.prop([file], { numRuns: 300 })('printCst ∘ parseCst preserves the structure (round trip)', (src) => {
    const first = parseCst(src);
    expect(first.diagnostics).toEqual([]);
    const second = parseCst(printCst(first.cst));
    expect(second.diagnostics).toEqual([]);
    expect(strip(second.cst)).toEqual(strip(first.cst));
  });

  test.prop([fc.string({ maxLength: 200 })], { numRuns: 500 })('parsing never throws on arbitrary strings', (src) => {
    const { cst } = parseCst(src);
    expect(() => buildDatabase(cst)).not.toThrow();
    expect(() => buildBibliography([{ name: 'x.bib', text: src }])).not.toThrow();
  });

  test.prop([fc.stringMatching(/^[@{}(),="#a-z0-9 \n\\%]{0,120}$/)], { numRuns: 500 })(
    'parsing never throws on BibTeX-shaped noise, and every diagnostic lies inside the source',
    (src) => {
      const { diagnostics } = parseCst(src);
      for (const d of diagnostics) {
        expect(d.span.start.offset).toBeGreaterThanOrEqual(0);
        expect(d.span.end.offset).toBeLessThanOrEqual(src.length);
      }
    },
  );
});
