import { describe, expect, it } from 'vitest';
import { parseBibtex } from '../../../src/core/bibliography/bibtex/database.ts';
import { toReference } from '../../../src/core/bibliography/model/from-entry.ts';
import type { Reference } from '../../../src/core/bibliography/model/reference.ts';

const convert = (source: string) => {
  const db = parseBibtex(source);
  if (!db.ok) throw new Error(db.error.map((d) => d.message).join('; '));
  const entry = db.value.entries[0];
  if (entry === undefined) throw new Error('no entry');
  return toReference(entry);
};

const ok = (source: string): Reference => {
  const r = convert(source);
  if (!r.ok) throw new Error(r.error.map((d) => d.message).join('; '));
  return r.value.reference;
};

const errors = (source: string): readonly string[] => {
  const r = convert(source);
  return r.ok ? [] : r.error.filter((d) => d.severity === 'error').map((d) => d.code);
};

describe('entry types', () => {
  it('maps BibTeX and biblatex types onto the algebraic model', () => {
    const cases: readonly [string, Reference['type']][] = [
      ['@book{k, title={T}, year=2000}', 'book'],
      ['@mvbook{k, title={T}, year=2000}', 'book'],
      ['@incollection{k, title={T}, booktitle={B}, year=2000}', 'chapter'],
      ['@inbook{k, title={T}, booktitle={B}, year=2000}', 'chapter'],
      ['@article{k, title={T}, journal={J}, year=2000}', 'article'],
      ['@conference{k, title={T}, booktitle={B}, year=2000}', 'inproceedings'],
      ['@phdthesis{k, title={T}, school={S}, year=2000}', 'thesis'],
      ['@mastersthesis{k, title={T}, school={S}, year=2000}', 'thesis'],
      ['@techreport{k, title={T}, institution={I}, year=2000}', 'report'],
      ['@online{k, title={T}, url={https://a.b}, urldate={2020-01-01}, year=2000}', 'online'],
      ['@misc{k, title={T}, url={https://a.b}, urldate={2020-01-01}, year=2000}', 'online'],
      ['@software{k, title={T}, year=2000}', 'software'],
    ];
    for (const [src, type] of cases) expect(ok(src).type, src).toBe(type);
  });

  it('rejects unsupported types, including @misc without a URL', () => {
    expect(errors('@unpublished{k, title={T}, year=2000}')).toEqual(['model:unsupported-type']);
    expect(errors('@misc{k, title={T}, year=2000}')).toEqual(['model:unsupported-type']);
  });

  it('distinguishes the degree of @thesis by its type field', () => {
    const t = ok('@thesis{k, title={T}, school={S}, type={phdthesis}, year=2000}');
    expect(t.type === 'thesis' && t.degree).toBe('phd');
    expect(errors('@thesis{k, title={T}, school={S}, type={other}, year=2000}')).toEqual(['model:invalid-value']);
  });
});

describe('explicit errors instead of guesses', () => {
  it.each([
    ['unsupported (typo) field', '@book{k, title={T}, year=2000, pubisher={P}}', 'model:unsupported-field'],
    [
      '"pages" and "eid"',
      '@article{k, title={T}, journal={J}, year=2000, pages={1--2}, eid={e1}}',
      'model:conflicting-fields',
    ],
    ['"year" and "date"', '@book{k, title={T}, year=2000, date={2000}}', 'model:conflicting-fields'],
    ['"month" and "date"', '@book{k, title={T}, date={2000-01}, month=jan}', 'model:conflicting-fields'],
    [
      '"address" and "location"',
      '@book{k, title={T}, year=2000, address={A}, location={B}}',
      'model:conflicting-fields',
    ],
    [
      '"journal" and "journaltitle"',
      '@article{k, title={T}, journal={J}, journaltitle={J}, year=2000}',
      'model:conflicting-fields',
    ],
    [
      '"school" and "institution"',
      '@phdthesis{k, title={T}, school={S}, institution={I}, year=2000}',
      'model:conflicting-fields',
    ],
    ['"url" without "urldate"', '@book{k, title={T}, year=2000, url={https://a.b}}', 'model:missing-field'],
    ['"urldate" without "url"', '@book{k, title={T}, year=2000, urldate={2020-01-01}}', 'model:conflicting-fields'],
    ['a DOI written as a URL', '@book{k, title={T}, year=2000, doi={https://doi.org/10.1/x}}', 'model:invalid-value'],
    ['a relative URL', '@online{k, title={T}, year=2000, url={www.a.b}, urldate={2020-01-01}}', 'model:invalid-value'],
    [
      'an impossible access date',
      '@online{k, title={T}, year=2000, url={https://a.b}, urldate={2023-02-30}}',
      'model:invalid-value',
    ],
    ['a non-ISO date', '@book{k, title={T}, date={13/10/2026}}', 'model:invalid-value'],
    ['a decreasing interval', '@book{k, title={T}, date={1958/1931}}', 'model:invalid-value'],
    ['a year that is not a year', '@book{k, title={T}, year={ca. 1900}}', 'model:invalid-value'],
    ['an unknown month', '@book{k, title={T}, year=2000, month={smarch}}', 'model:invalid-value'],
    ['a missing title', '@book{k, year=2000}', 'model:missing-field'],
    ['a missing year', '@book{k, title={T}}', 'model:missing-field'],
    ['a number without series', '@book{k, title={T}, year=2000, number=3}', 'model:unsupported-field'],
    [
      'an unknown editortype',
      '@book{k, title={T}, year=2000, editor={A, B}, editortype={boss}}',
      'model:invalid-value',
    ],
    [
      'an editortype without editors',
      '@book{k, title={T}, year=2000, editortype={organizer}}',
      'model:conflicting-fields',
    ],
    ['an unknown language', '@book{k, title={T}, year=2000, langid={klingon}}', 'model:invalid-value'],
    [
      'a site name and a publisher',
      '@online{k, title={T}, year=2000, url={https://a.b}, urldate={2020-01-01}, organization={O}, publisher={P}}',
      'model:conflicting-fields',
    ],
    ['an invalid key', '@book{9lives, title={T}, year=2000}', 'model:invalid-value'],
    ['an empty field', '@book{k, title={T}, year=2000, publisher={ }}', 'model:invalid-value'],
    [
      'event details without event title',
      '@inproceedings{k, title={T}, booktitle={B}, year=2000, venue={V}}',
      'model:missing-field',
    ],
  ])('%s', (_name, src, code) => {
    expect(errors(src)).toContain(code);
  });

  it('accumulates every problem of an entry, sorted by position', () => {
    // missing journal (at the key), the two unknown fields, then the bad year.
    expect(errors('@article{k, title={T}, foo={x}, bar={y}, year={x}}')).toEqual([
      'model:missing-field',
      'model:unsupported-field',
      'model:unsupported-field',
      'model:invalid-value',
    ]);
  });

  it('passes LaTeX warnings through on success', () => {
    const r = convert('@book{k, title={A \\weird{x} title}, year=2000}');
    expect(r.ok && r.value.warnings.map((w) => w.code)).toEqual(['latex:unknown-command']);
  });
});

describe('typed fields', () => {
  it('parses years, spans, inferred years, months and EDTF intervals', () => {
    expect(ok('@book{k, title={T}, year=1948}').issued).toEqual({ year: 1948 });
    expect(ok('@book{k, title={T}, year={1931--1958}}').issued).toEqual({ year: 1931, endYear: 1958 });
    expect(ok('@book{k, title={T}, year={[1933]}}').issued).toEqual({ year: 1933, inferred: true });
    expect(ok('@book{k, title={T}, year=1948, month=jul}').issued).toEqual({ year: 1948, month: 7 });
    expect(ok('@book{k, title={T}, year=1948, month={7}}').issued).toEqual({ year: 1948, month: 7 });
    expect(ok('@book{k, title={T}, date={1976-06-10}}').issued).toEqual({ year: 1976, month: 6, day: 10 });
    expect(ok('@book{k, title={T}, date={1948-07/1948-10}}').issued).toEqual({ year: 1948, month: 7, endMonth: 10 });
    expect(ok('@book{k, title={T}, date={1936-11/1937-01}}').issued).toEqual({
      year: 1936,
      month: 11,
      endYear: 1937,
      endMonth: 1,
    });
    expect(ok('@book{k, title={T}, date={1931/1958}}').issued).toEqual({ year: 1931, endYear: 1958 });
  });

  it('splits "Title: subtitle" at the first ": " outside braces, unless a subtitle field exists', () => {
    const split = ok('@book{k, title={Globaliza{\\c c}{\\~a}o: as consequ{\\^e}ncias humanas}, year=1999}').title;
    expect([split.main.text, split.sub?.text]).toEqual(['Globalização', 'as consequências humanas']);
    const braced = ok('@book{k, title={{Ratio: A study}}, year=1999}').title;
    expect([braced.main.text, braced.sub]).toEqual(['Ratio: A study', undefined]);
    const explicit = ok('@book{k, title={A: B}, subtitle={c}, year=1999}').title;
    expect([explicit.main.text, explicit.sub?.text]).toEqual(['A: B', 'c']);
  });

  it('parses editions, page lists, e-locators, languages and editor roles', () => {
    const editions = ['2', '2nd', 'Second', '2.'].map((e) => ok(`@book{k, title={T}, year=2000, edition={${e}}}`));
    for (const b of editions) expect(b.type === 'book' && b.edition).toEqual({ kind: 'ordinal', n: 2 });
    const text = ok('@book{k, title={T}, year=2000, edition={Rev. and expanded}}');
    expect(text.type === 'book' && text.edition?.kind).toBe('text');
    const a = ok('@article{k, title={T}, journal={J}, year=2000, pages={379--423, 623--656, xi}, langid={brazilian}}');
    expect(a.type === 'article' && a.pages).toEqual([
      { first: '379', last: '423' },
      { first: '623', last: '656' },
      { first: 'xi' },
    ]);
    expect(a.language).toBe('pt-BR');
    expect(ok('@book{k, title={T}, year=2000, language={de-AT}}').language).toBe('de-AT');
    const e = ok('@article{k, title={T}, journal={J}, year=2000, eid={e03304}, issue={3}}');
    expect(e.type === 'article' && [e.eid, e.number]).toEqual(['e03304', '3']);
    const c = ok('@incollection{k, title={T}, booktitle={B}, year=2000, editor={Levi, G.}, editortype={organizer}}');
    expect(c.type === 'chapter' && c.editorRole).toBe('organizer');
  });

  it('keeps URLs and DOIs verbatim (never decoded as LaTeX)', () => {
    const r = ok(
      '@online{k, title={T}, year=2000, url={https://a.b/~x_y%20z}, urldate={2020-01-01}, doi={10.1175/1520-0469(1963)020<0130:DNF>2.0.CO;2}}',
    );
    expect([r.url, r.doi]).toEqual(['https://a.b/~x_y%20z', '10.1175/1520-0469(1963)020<0130:DNF>2.0.CO;2']);
    expect(r.accessed).toEqual({ year: 2020, month: 1, day: 1 });
  });
});
