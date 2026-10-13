import { describe, expect, it } from 'vitest';
import { fc, test } from '@fast-check/vitest';
import {
  isEscapedInSource,
  renderHeadingAttributes,
  splitHeadingAttributes,
  type HeadingAttributes,
} from '../../../src/core/reading/heading-attributes.ts';

describe('splitHeadingAttributes (Pandoc header_attributes)', () => {
  it('splits id, classes and key=value pairs off the end of the title', () => {
    const r = splitHeadingAttributes('Tese central {#tese .claim depends="a,b"}');
    expect(r).toEqual({
      text: 'Tese central',
      block: ' {#tese .claim depends="a,b"}',
      attributes: { ids: ['tese'], classes: ['claim'], pairs: [['depends', 'a,b']] },
    });
  });

  it('accepts the curly quotes SmartyPants produces before every remark stage', () => {
    expect(splitHeadingAttributes('T {.claim depends=“a, b”}')?.attributes.pairs).toEqual([['depends', 'a, b']]);
    expect(splitHeadingAttributes("T {.claim depends=‘a’}")?.attributes.pairs).toEqual([['depends', 'a']]);
  });

  it('accepts bare values, Unicode ids and trailing whitespace', () => {
    expect(splitHeadingAttributes('T {#seção-1 depends=x}  ')).toMatchObject({
      text: 'T',
      block: ' {#seção-1 depends=x}  ',
      attributes: { ids: ['seção-1'], pairs: [['depends', 'x']] },
    });
  });

  it.each([
    ['plain heading', 'Uma seção comum'],
    ['set notation', 'O conjunto {1, 2}'],
    ['a braced word', 'Variável {x}'],
    ['glued to the title', 'Título{#x}'],
    ['only a block, no title', '{#x}'],
    ['brace not at the end', 'Um {#x} no meio'],
    ['empty block', 'Vazio {}'],
    ['unterminated quote', 'T {.claim depends="a}'],
    ['a key without value', 'T {depends=}'],
    ['bad key', 'T {1x=2}'],
    ['class with a dot inside', 'T {.a.b}'],
    ['an empty id', 'T {# .claim}'],
    ['items not separated', 'T {.claim#a}'],
    ['nested braces', 'T {#a {b}}'],
  ])('leaves text that does not end with a valid block untouched: %s', (_label, text) => {
    expect(splitHeadingAttributes(text)).toBeNull();
  });

  const ident = fc.stringMatching(/^[a-z][a-z0-9-]{0,8}$/);
  const attributes: fc.Arbitrary<HeadingAttributes> = fc.record({
    ids: fc.array(ident, { maxLength: 1 }),
    classes: fc.array(ident, { maxLength: 2 }),
    pairs: fc.array(fc.tuple(ident, fc.stringMatching(/^[a-z0-9, -]{0,12}$/)), { maxLength: 2 }),
  });
  const title = fc.stringMatching(/^[A-Za-zÀ-ÿ0-9?!,. ]{0,30}[A-Za-zÀ-ÿ0-9?!]$/);

  test.prop([title, attributes])('round trip: split(title + " " + render(a)) = (title, a)', (t, a) => {
    fc.pre(a.ids.length + a.classes.length + a.pairs.length > 0);
    const r = splitHeadingAttributes(`${t} ${renderHeadingAttributes(a)}`);
    expect(r?.text).toBe(t);
    expect(r?.attributes).toEqual(a);
  });

  test.prop([fc.string({ maxLength: 60 })])('nothing is lost: text = result.text + result.block', (s) => {
    const r = splitHeadingAttributes(s);
    if (r !== null) expect(r.text + r.block).toBe(s);
  });

  test.prop([fc.string({ maxLength: 60 }).filter((s) => !s.includes('{'))])('plain headings (no brace) are never split', (s) => {
    expect(splitHeadingAttributes(s)).toBeNull();
  });
});

describe('isEscapedInSource', () => {
  it('detects a backslash-escaped opening brace (the author wants literal text)', () => {
    expect(isEscapedInSource('## Tese \\{.claim}')).toBe(true);
    expect(isEscapedInSource('## Tese \\\\{.claim}')).toBe(false);
    expect(isEscapedInSource('## Tese {.claim}')).toBe(false);
  });
  it('ignores ATX closing sequences and setext underlines', () => {
    expect(isEscapedInSource('## Tese {.claim} ##')).toBe(false);
    expect(isEscapedInSource('Tese {.claim}\n=====')).toBe(false);
    expect(isEscapedInSource('Tese \\{.claim}\n-----')).toBe(true);
  });
  it('treats a brace that is not in the source (a character reference) as literal', () => {
    expect(isEscapedInSource('## Tese {.claim&#125;')).toBe(true);
  });
});
