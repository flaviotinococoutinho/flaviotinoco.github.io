import { describe, expect, it } from 'vitest';
import { fc, test } from '@fast-check/vitest';
import { parseScalar, readFrontmatter, scalar } from '../../../scripts/lib/frontmatter.ts';

const read = (source: string) => {
  const r = readFrontmatter(source);
  if (!r.ok) throw new Error(r.error);
  return r.value;
};

describe('readFrontmatter', () => {
  it('reads top-level scalars in every quoting style and ignores nested values', () => {
    const fm = read(
      [
        '---',
        'title: "Entropia: uma medida"',
        "lang: 'pt-BR'",
        'translationKey: entropy # inline comment',
        'draft: true',
        'tags:',
        '  - a',
        '  nested: no',
        'list: [a, b]',
        'block: |',
        '  text',
        'quote: \'it\'\'s\'',
        '---',
        '',
        'slug: body-is-not-frontmatter',
      ].join('\n'),
    );
    expect(scalar(fm, 'title')).toBe('Entropia: uma medida');
    expect(scalar(fm, 'lang')).toBe('pt-BR');
    expect(scalar(fm, 'translationKey')).toBe('entropy');
    expect(scalar(fm, 'draft')).toBe('true');
    expect(scalar(fm, 'quote')).toBe("it's");
    expect(fm.get('tags')).toEqual({ kind: 'complex' });
    expect(fm.get('list')).toEqual({ kind: 'complex' });
    expect(fm.get('block')).toEqual({ kind: 'complex' });
    expect(fm.has('nested')).toBe(false);
    expect(fm.has('slug')).toBe(false);
  });

  it('accepts CRLF, a BOM and the YAML document end marker', () => {
    expect(scalar(read('\uFEFF---\r\nlang: en\r\n...\r\nbody'), 'lang')).toBe('en');
  });

  it('rejects files without (closed) frontmatter instead of guessing', () => {
    expect(readFrontmatter('# Title\n')).toEqual({
      ok: false,
      error: 'missing frontmatter (the file must start with "---")',
    });
    expect(readFrontmatter('---\nlang: en\n')).toEqual({ ok: false, error: 'unterminated frontmatter (no closing "---")' });
  });

  it('keeps the first occurrence of a duplicated key', () => {
    expect(scalar(read('---\nlang: en\nlang: pt-BR\n---\n'), 'lang')).toBe('en');
  });

  it('treats malformed quoted scalars as non-scalar', () => {
    expect(parseScalar('"open')).toBeUndefined();
    expect(parseScalar("'open")).toBeUndefined();
    expect(parseScalar('"bad \\q escape"')).toBeUndefined();
    expect(parseScalar('&anchor value')).toBeUndefined();
  });
});

describe('scalar round trips (no value is misread)', () => {
  const text = fc.string({ unit: 'grapheme', maxLength: 30 }).filter((s) => !/[\n\r\u2028\u2029]/.test(s));

  test.prop([text])('double-quoted (JSON-compatible) scalars', (s) => {
    expect(parseScalar(JSON.stringify(s))).toBe(s);
  });

  test.prop([text])('single-quoted scalars', (s) => {
    expect(parseScalar(`'${s.replace(/'/g, "''")}'`)).toBe(s);
  });

  test.prop([fc.stringMatching(/^[a-z0-9][a-z0-9-]{0,20}$/)])('plain slugs, also through a whole document', (slug) => {
    expect(parseScalar(slug)).toBe(slug);
    expect(scalar(read(`---\nslug: ${slug}\n---\n`), 'slug')).toBe(slug);
  });
});
