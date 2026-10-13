import { describe, expect, it } from 'vitest';
import { fc, test } from '@fast-check/vitest';
import { decodeEntities, scanHtml } from '../../../scripts/lib/html.ts';

/** Minimal attribute-value escaper (HTML §13.3 "escaping a string", attribute mode, plus < and >). */
const escapeAttribute = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

describe('scanHtml', () => {
  it('reads start tags with quoted, unquoted and boolean attributes', () => {
    const { tags } = scanHtml(`<A HREF="/x/" data-n=1 hidden title='a > b'><img src=/i.png alt=""/>`);
    expect(tags.map((t) => t.name)).toEqual(['a', 'img']);
    expect(Object.fromEntries(tags[0]?.attrs ?? [])).toEqual({
      href: '/x/',
      'data-n': '1',
      hidden: '',
      title: 'a > b',
    });
    expect(tags[1]?.attrs.get('src')).toBe('/i.png');
  });

  it('skips comments, doctype and end tags', () => {
    const { tags } = scanHtml('<!doctype html><!-- <a href="/no/"> --><p>x</p><?pi?>');
    expect(tags.map((t) => t.name)).toEqual(['p']);
  });

  it('treats script and style contents as raw text', () => {
    const { tags, rawTexts } = scanHtml(
      `<script type="module">if (a < b) document.write('<a href="/fake/">')</script><style>a::after{content:"<b>"}</style><i>`,
    );
    expect(tags.map((t) => t.name)).toEqual(['script', 'style', 'i']);
    expect(rawTexts.map((r) => r.tag.name)).toEqual(['script', 'style']);
    expect(rawTexts[0]?.text).toContain(`<a href="/fake/">`);
  });

  it('keeps the first of duplicated attributes, as the HTML tokenizer does', () => {
    expect(scanHtml('<a id="one" id="two">').tags[0]?.attrs.get('id')).toBe('one');
  });

  it('survives unterminated markup', () => {
    expect(scanHtml('<a href="/x/"').tags).toHaveLength(1);
    expect(scanHtml('<!-- open').tags).toHaveLength(0);
    expect(scanHtml('<script>never closed').rawTexts[0]?.text).toBe('never closed');
    expect(scanHtml('a < b and 1<2').tags).toHaveLength(0);
  });
});

describe('decodeEntities', () => {
  it('decodes numeric and common named references, leaving unknown ones verbatim', () => {
    expect(decodeEntities('a&amp;b&#233;&#xE7;&lt;&unknown;&#xFFFFFFF;')).toBe('a&béç<&unknown;&#xFFFFFFF;');
  });

  test.prop([fc.string({ unit: 'grapheme', maxLength: 40 })])(
    'is a left inverse of attribute escaping (no information lost in either direction)',
    (s) => {
      expect(decodeEntities(escapeAttribute(s))).toBe(s);
    },
  );

  test.prop([fc.string({ unit: 'grapheme', maxLength: 40 }), fc.stringMatching(/^[a-z][a-z-]{0,10}$/)])(
    'attribute values round-trip through markup',
    (value, name) => {
      fc.pre(name !== 'id');
      const { tags } = scanHtml(`<div id="x" ${name}="${escapeAttribute(value)}"></div>`);
      expect(tags[0]?.attrs.get(name)).toBe(value);
    },
  );
});
