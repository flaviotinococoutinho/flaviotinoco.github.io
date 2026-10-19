/**
 * Heading permalinks (rehype stage 13): information preservation — the heading
 * text is unchanged and stripping the anchors gives back the input tree —,
 * idempotence, the exclusions (nav, visually hidden headings, h1/h5), and the
 * stage inside the full site pipeline.
 */
import type { Element, ElementContent, Root } from 'hast';
import { toString } from 'hast-util-to-string';
import { describe, expect, it } from 'vitest';
import { fc, test } from '@fast-check/vitest';
import {
  ANCHOR_CLASS,
  ANCHOR_HOST,
  fragmentOf,
  headingAnchors,
  headingText,
  stripHeadingAnchors,
} from '../../../src/core/addons/heading-anchors.ts';
import { site } from '../latex/helpers.ts';

const label = (title: string): string => `Link para a seção “${title}”`;

const h = (tagName: string, properties: Element['properties'], ...children: ElementContent[]): Element => ({
  type: 'element',
  tagName,
  properties,
  children,
});
const t = (value: string): ElementContent => ({ type: 'text', value });

const headingArb = fc.record({
  level: fc.constantFrom('h1', 'h2', 'h3', 'h4', 'h5'),
  id: fc.option(fc.stringMatching(/^[a-zà-ú0-9-]{1,12}$/u), { nil: undefined }),
  text: fc.string({ maxLength: 30 }),
  emphasis: fc.boolean(),
  inNav: fc.boolean(),
});

type HeadingSpec = typeof headingArb extends fc.Arbitrary<infer T> ? T : never;

const treeOf = (hs: readonly HeadingSpec[]): Root => ({
  type: 'root',
  children: hs.map((x) => {
    const heading = h(
      x.level,
      x.id === undefined ? {} : { id: x.id },
      ...(x.emphasis ? [t('a '), h('em', {}, t(x.text))] : [t(x.text)]),
    );
    return x.inNav ? h('nav', { className: ['toc'] }, heading) : heading;
  }),
});

const headings = (tree: Root): Element[] => {
  const out: Element[] = [];
  const walk = (n: Root | Root['children'][number]): void => {
    if (n.type === 'element' && /^h[1-6]$/u.test(n.tagName)) out.push(n);
    if (n.type === 'root' || n.type === 'element') n.children.forEach(walk);
  };
  walk(tree);
  return out;
};

describe('information preservation', () => {
  test.prop([fc.array(headingArb, { maxLength: 8 })])('the text of every heading is unchanged', (hs) => {
    const tree = treeOf(hs);
    const out = headingAnchors(tree, label);
    expect(headings(out).map((x) => toString(x))).toEqual(headings(tree).map((x) => toString(x)));
    expect(toString(out)).toBe(toString(tree));
  });

  test.prop([fc.array(headingArb, { maxLength: 8 })])('stripHeadingAnchors ∘ headingAnchors = id', (hs) => {
    const tree = treeOf(hs);
    expect(stripHeadingAnchors(headingAnchors(tree, label))).toEqual(tree);
  });

  test.prop([fc.array(headingArb, { maxLength: 8 })])('is idempotent', (hs) => {
    const once = headingAnchors(treeOf(hs), label);
    expect(headingAnchors(once, label)).toEqual(once);
  });

  test.prop([fc.array(headingArb, { maxLength: 8 })])('links exactly the eligible headings, to themselves', (hs) => {
    const out = headingAnchors(treeOf(hs), label);
    const linked = headings(out).filter((x) =>
      x.children.some((c) => c.type === 'element' && c.tagName === ANCHOR_HOST),
    );
    const expected = hs.filter((x) => !x.inNav && ['h2', 'h3', 'h4'].includes(x.level) && x.id !== undefined);
    expect(linked.length).toBe(expected.length);
    for (const x of linked) {
      const host = x.children.at(-1) as Element;
      const a = host.children[0] as Element;
      expect(a.properties['href']).toBe(fragmentOf(String(x.properties['id'])));
      expect(a.properties['className']).toEqual([ANCHOR_CLASS]);
      expect(a.properties['ariaLabel']).toBe(label(headingText(x)));
      expect(a.children).toEqual([]);
    }
  });
});

describe('exclusions and labels', () => {
  it('skips visually hidden headings (GFM footnote label)', () => {
    const tree: Root = {
      type: 'root',
      children: [h('h2', { id: 'footnote-label', className: ['sr-only'] }, t('Notas'))],
    };
    expect(headingAnchors(tree, label)).toEqual(tree);
  });

  it('labels with the readable text, without KaTeX’s hidden HTML or the TeX annotation', () => {
    const heading = h(
      'h2',
      { id: 'x' },
      t('Energia '),
      h(
        'span',
        { className: ['katex'] },
        h('span', { className: ['katex-mathml'] }, h('math', {}, h('mi', {}, t('E')), h('annotation', {}, t('E')))),
        h('span', { className: ['katex-html'], ariaHidden: 'true' }, t('E')),
      ),
      t('  e massa'),
    );
    expect(headingText(heading)).toBe('Energia E e massa');
  });

  it('percent-encodes the fragment like the table of contents', () => {
    expect(fragmentOf('primeira-seção')).toBe('#primeira-se%C3%A7%C3%A3o');
  });
});

describe('in the site pipeline', () => {
  it('adds a localised permalink to the headings of a document, not to the footnote label', async () => {
    const { html } = await site('## Primeira seção\n\nTexto[^1].\n\n### Sub {#sub .claim}\n\nMais.\n\n[^1]: Nota.\n');
    expect(html).toContain(
      '<h2 id="primeira-seção">Primeira seção<ft-heading-anchor><a class="heading-anchor" href="#primeira-se%C3%A7%C3%A3o" aria-label="Link para a seção “Primeira seção”"></a></ft-heading-anchor></h2>',
    );
    expect(html).toContain('aria-label="Link para a seção “Sub”"');
    expect(html).toMatch(/<h2 class="sr-only" id="footnote-label">Notas<\/h2>/u);
  });

  it('labels in English for English documents', async () => {
    const { html } = await site('## Information\n\nText.\n', 'en');
    expect(html).toContain('aria-label="Link to the section “Information”"');
  });
});
