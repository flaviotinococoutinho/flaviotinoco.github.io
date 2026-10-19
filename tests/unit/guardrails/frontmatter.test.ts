import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { fc, test } from '@fast-check/vitest';
import {
  booleanField,
  describeValue,
  readFrontmatter,
  stringField,
  type Frontmatter,
} from '../../../scripts/lib/frontmatter.ts';

/**
 * Astro's own frontmatter reader, resolved through Astro's dependency tree (it is
 * not a dependency of the site): the oracle the guardrails must agree with.
 */
const fromAstro = createRequire(createRequire(import.meta.url).resolve('astro/package.json'));
const astro = (await import(pathToFileURL(fromAstro.resolve('@astrojs/internal-helpers/frontmatter')).href)) as {
  readonly parseFrontmatter: (code: string) => { readonly frontmatter: Record<string, unknown> };
};

const read = (source: string): Frontmatter => {
  const r = readFrontmatter(source);
  if (!r.ok) throw new Error(r.error);
  return r.value;
};

describe('readFrontmatter (Astro: YAML 1.2 core schema)', () => {
  it('reads every scalar style and keeps nested values as values', () => {
    const fm = read(
      [
        '---',
        'title: "Entropia: uma medida"',
        "lang: 'pt-BR'",
        'translationKey: entropy # inline comment',
        'draft: true',
        'tags:',
        '  - a',
        'list: [a, b]',
        'block: |',
        '  text',
        "quote: 'it''s'",
        '---',
        '',
        'slug: body-is-not-frontmatter',
      ].join('\n'),
    );
    expect(fm).toEqual({
      title: 'Entropia: uma medida',
      lang: 'pt-BR',
      translationKey: 'entropy',
      draft: true,
      tags: ['a'],
      list: ['a', 'b'],
      block: 'text\n',
      quote: "it's",
    });
  });

  // Regressions (review guardrails#2): the old line reader gave `draft: True` as the string
  // "True" (so a draft counted as published) and a continued plain scalar as missing.
  it('reads booleans with the core schema: True and TRUE are true, yes stays a string', () => {
    for (const spelling of ['true', 'True', 'TRUE'])
      expect(booleanField(read(`---\ndraft: ${spelling}\n---\n`), 'draft')).toEqual({ kind: 'value', value: true });
    expect(booleanField(read('---\ndraft: False\n---\n'), 'draft')).toEqual({ kind: 'value', value: false });
    expect(read('---\ndraft: yes\n---\n')).toEqual({ draft: 'yes' });
    expect(booleanField(read('---\ndraft: "true"\n---\n'), 'draft')).toEqual({
      kind: 'unsupported',
      found: 'a string ("true")',
    });
  });

  it('reads a plain scalar continued on the next line as one string', () => {
    expect(stringField(read('---\ntranslationKey:\n  entropy\n---\n'), 'translationKey')).toEqual({
      kind: 'value',
      value: 'entropy',
    });
  });

  it('tells absent fields from values of another type', () => {
    const fm = read('---\nslug: [a]\npublished: 2026-01-05\nn: 3\nz: ~\n---\n');
    expect(stringField(fm, 'translationKey')).toEqual({ kind: 'absent' });
    expect(stringField(fm, 'slug')).toEqual({ kind: 'unsupported', found: 'a sequence' });
    expect(stringField(fm, 'published')).toEqual({ kind: 'unsupported', found: 'a timestamp' });
    expect(stringField(fm, 'n')).toEqual({ kind: 'unsupported', found: 'a number (3)' });
    expect(stringField(fm, 'z')).toEqual({ kind: 'unsupported', found: 'null' });
    expect(describeValue({ a: 1 })).toBe('a mapping');
  });

  it('accepts CRLF and a BOM; an empty block is an empty mapping', () => {
    expect(read('\uFEFF---\r\nlang: en\r\n---\r\nbody')).toEqual({ lang: 'en' });
    expect(read('---\n---\n')).toEqual({});
  });

  it('reports what Astro rejects, with the file line', () => {
    expect(readFrontmatter('# Title\n')).toEqual({
      ok: false,
      error: 'missing frontmatter (the file must start with a "---" block closed by "---")',
    });
    expect(readFrontmatter('---\nlang: en\n')).toMatchObject({ ok: false });
    // YAML's "..." ends a document, but Astro only closes the block with "---".
    expect(readFrontmatter('---\nlang: en\n...\nbody')).toMatchObject({ ok: false });
    const duplicate = readFrontmatter('---\ntitle: x\nlang: en\nlang: pt-BR\n---\n');
    expect(duplicate.ok ? '' : duplicate.error).toMatch(/^invalid YAML in frontmatter \(line 4\): /);
    expect(readFrontmatter('---\n- a\n- b\n---\n')).toEqual({
      ok: false,
      error: 'frontmatter must be a YAML mapping of keys to values',
    });
    const toml = readFrontmatter('+++\nlang = "en"\n+++\n');
    expect(toml.ok ? '' : toml.error).toContain('TOML');
  });
});

describe('agreement with Astro’s parser', () => {
  const keyArb = fc.constantFrom('lang', 'translationKey', 'slug', 'stratum', 'draft', 'title');
  const valueArb = fc.oneof(
    fc.constantFrom(
      'true',
      'True',
      'TRUE',
      'false',
      'yes',
      'no',
      'on',
      'off',
      '~',
      'null',
      '2026-01-05',
      '0x1F',
      '1e3',
    ),
    fc.constantFrom('"true"', "'pt-BR'", 'entropy # comment', '\n  entropy', '\n  two\n  lines', '[a, b]', '{a: 1}'),
    fc.stringMatching(/^[a-z][a-z0-9-]{0,12}$/),
    fc.string({ unit: 'grapheme', maxLength: 16 }).map((s) => JSON.stringify(s)),
  );
  const documentArb = fc
    .uniqueArray(fc.tuple(keyArb, valueArb), { selector: ([k]) => k, maxLength: 6 })
    .map(
      (pairs) =>
        `---\n${pairs.map(([k, v]) => `${k}:${v.startsWith('\n') ? '' : ' '}${v}`).join('\n')}\n---\n\nBody.\n`,
    );

  test.prop([documentArb])('reads every document exactly as Astro does', (source) => {
    let expected: Record<string, unknown> | undefined;
    try {
      expected = astro.parseFrontmatter(source).frontmatter;
    } catch {
      expected = undefined;
    }
    const r = readFrontmatter(source);
    if (expected === undefined) expect(r.ok).toBe(false);
    else expect(r).toEqual({ ok: true, value: expected });
  });
});
