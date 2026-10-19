/**
 * Link previews: the index is deterministic, parses back from its JSON text, and
 * untrusted input degrades to "no preview"; keys resolve links the way the
 * browser does (same origin, trailing slash, never the current page).
 */
import { describe, expect, it } from 'vitest';
import { fc, test } from '@fast-check/vitest';
import { parsePreviewIndex, previewIndex, previewKey, type Preview } from '../../../src/core/addons/previews.ts';

const preview = (title: string): Preview => ({
  title,
  description: 'D',
  stratum: 'formal',
  stratumLabel: 'Formal',
  form: 'essay',
  formLabel: 'Ensaio',
  time: '12 min de leitura',
  lang: 'pt-BR',
});

const index = previewIndex([
  ['/site/pt/ensaios/b/', preview('B')],
  ['/site/pt/ensaios/a/', preview('A')],
  ['/site/pt/laboratorio/x/', { ...preview('X'), form: 'lab', formLabel: 'Laboratório', time: null }],
]);

describe('the preview index', () => {
  it('orders keys, so the JSON is a function of the set of pages', () => {
    expect(Object.keys(index.items)).toEqual(['/site/pt/ensaios/a/', '/site/pt/ensaios/b/', '/site/pt/laboratorio/x/']);
  });

  it('parses back from its own JSON text', () => {
    expect(parsePreviewIndex(JSON.parse(JSON.stringify(index)))).toEqual({ ok: true, value: index });
  });

  test.prop([fc.jsonValue()])('never throws on untrusted JSON', (v) => {
    const r = parsePreviewIndex(v);
    expect(typeof r.ok).toBe('boolean');
  });

  it('drops malformed entries and rejects other versions', () => {
    const r = parsePreviewIndex({
      version: 1,
      items: { '/ok/': preview('ok'), '/bad/': { ...preview('bad'), stratum: 'nope' }, relative: preview('r') },
    });
    expect(r.ok && Object.keys(r.value.items)).toEqual(['/ok/']);
    expect(parsePreviewIndex({ version: 2, items: {} }).ok).toBe(false);
    expect(parsePreviewIndex(null).ok).toBe(false);
    expect(parsePreviewIndex({ version: 1 }).ok).toBe(false);
  });
});

describe('previewKey', () => {
  const page = 'https://example.org/site/pt/ensaios/a/';

  it('finds a same-origin link, with or without the trailing slash, ignoring query and fragment', () => {
    expect(previewKey('https://example.org/site/pt/ensaios/b/', page, index)).toBe('/site/pt/ensaios/b/');
    expect(previewKey('/site/pt/ensaios/b', page, index)).toBe('/site/pt/ensaios/b/');
    expect(previewKey('../b/?x=1#sec', page, index)).toBe('/site/pt/ensaios/b/');
  });

  it('has nothing for the page itself, other origins, unknown pages and invalid URLs', () => {
    expect(previewKey('#secao', page, index)).toBeNull();
    expect(previewKey('https://other.org/site/pt/ensaios/b/', page, index)).toBeNull();
    expect(previewKey('/site/pt/ensaios/zzz/', page, index)).toBeNull();
    expect(previewKey('http://[', page, index)).toBeNull();
    expect(previewKey('/x', 'not a url', index)).toBeNull();
  });
});
