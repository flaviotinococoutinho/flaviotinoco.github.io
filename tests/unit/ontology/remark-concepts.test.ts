/**
 * The Markdown stage through a unified pipeline (remark-parse → remark-directive
 * → concepts → remark-rehype → rehype-stringify), with the real concept index.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { fc, test } from '@fast-check/vitest';
import rehypeStringify from 'rehype-stringify';
import remarkDirective from 'remark-directive';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import { unified } from 'unified';
import { VFile } from 'vfile';
import type { Root } from 'mdast';
import { toString } from 'mdast-util-to-string';
import { CONCEPTS_DIR, indexConcepts, loadConcepts, readRawConcepts } from '../../../src/adapters/unified/load-concepts.ts';
import { markupToHast, remarkConcepts } from '../../../src/adapters/unified/remark-concepts.ts';
import type { PipelineContext } from '../../../src/adapters/unified/context.ts';
import { el } from '../../../src/core/ontology/markup.ts';

const ROOT = new URL('../../../', import.meta.url);
const index = await loadConcepts(ROOT);
const context = { base: '/site/', concepts: index } as unknown as PipelineContext;

const run = (markdown: string, frontmatter: Record<string, unknown> = { lang: 'pt-BR' }) => {
  const file = new VFile({ value: markdown, path: 'doc.md', data: { astro: { frontmatter } } });
  const processor = unified()
    .use(remarkParse)
    .use(remarkDirective)
    .use(remarkConcepts, { context })
    .use(remarkRehype)
    .use(rehypeStringify);
  const tree = processor.runSync(processor.parse(file), file) as unknown;
  return { html: processor.stringify(tree as never, file), file };
};
const mdast = (markdown: string, frontmatter: Record<string, unknown> = { lang: 'pt-BR' }): { tree: Root; file: VFile } => {
  const file = new VFile({ value: markdown, data: { astro: { frontmatter } } });
  const processor = unified().use(remarkParse).use(remarkDirective).use(remarkConcepts, { context });
  return { tree: processor.runSync(processor.parse(file), file) as Root, file };
};

describe('loader', () => {
  it('indexes every concept with labels and slugs per locale', () => {
    expect(index.entries.size).toBe(index.ontology.graph.ids.length);
    expect(index.entries.get('entropy' as never)?.slug['pt-BR']).toBe('entropia');
    expect(index.lookup('Entropia', 'pt-BR')).toEqual({ kind: 'found', id: 'entropy' });
  });

  it('fails with every validation problem at once', async () => {
    const raws = await readRawConcepts(new URL('tests/fixtures/ontology/invalid-concepts/', ROOT));
    const error = (() => {
      try {
        indexConcepts(raws);
        return null;
      } catch (e: unknown) {
        return e instanceof Error ? e.message : String(e);
      }
    })();
    expect(error).toContain(CONCEPTS_DIR);
    expect(error).toContain('broader cycle: a → b → a');
    expect(error).toContain('formalizes');
    expect(error).toContain('a proposition');
    await expect(readRawConcepts(new URL('tests/fixtures/ontology/invalid-json/', ROOT))).rejects.toThrow(/not valid JSON/u);
  });

  it('prints topological warnings without failing', () => {
    const warnings: string[] = [];
    const mk = (id: string, broader: string[]) => ({
      id,
      data: {
        slug: { 'pt-BR': id, en: id },
        prefLabel: { 'pt-BR': id.toUpperCase(), en: id.toUpperCase() },
        definition: { 'pt-BR': 'd', en: 'd' },
        stratum: 'theory',
        category: 'entity',
        domains: ['logic'],
        broader,
      },
    });
    indexConcepts([mk('a', ['b', 'c']), mk('b', ['c']), mk('c', [])], (m) => warnings.push(m));
    expect(warnings).toEqual([expect.stringContaining('[concepts] a: broader "c" is implied by a → b → c')]);
  });
});

describe(':concept', () => {
  it('links to the concept route (base-aware) and keeps the label verbatim', () => {
    const { html, file } = run(readFileSync(new URL('tests/fixtures/ontology/docs/pt.md', ROOT), 'utf8'));
    expect(html).toContain('<a href="/site/pt/conceitos/entropia/" class="concept-link" data-concept="entropy">entropia</a>');
    expect(html).toContain('<ft-concept-preview class="concept-ref" data-concept="entropy" data-label="Entropia"');
    expect(html).toContain('data-stratum-label="Teoria"');
    expect(html).toContain('data-category-label="Medida"');
    // Without id: found by altLabel in the document locale.
    expect(html).toContain('data-concept="entropy">Entropia de Shannon</a>');
    // Inline code is never touched.
    expect(html).toContain('<code>:concept[x]{id=nada}</code>');
    expect(file.data.astro?.frontmatter?.['conceptsUsed']).toEqual(expect.arrayContaining(['entropy', 'information', 'mutual-information']));
  });

  it('uses the English route in English documents', () => {
    const { html } = run(':concept[entropy]{id=entropy}', { lang: 'en' });
    expect(html).toContain('href="/site/en/concepts/entropy/"');
    expect(html).toContain('data-open-label="Open the concept"');
  });

  test.prop([fc.stringMatching(/^[A-Za-zÀ-ú0-9 ,.;'"!?()-]{1,40}$/u).filter((s) => s.trim().length > 0 && !/[[\]\\]/u.test(s))])(
    'leaves the plain text of the document unchanged (information preservation)',
    (label) => {
      const source = `Antes :concept[${label}]{id=entropy} depois.`;
      const before = toString(unified().use(remarkParse).use(remarkDirective).parse(source));
      const { tree } = mdast(source);
      expect(toString(tree)).toBe(before);
      const node = (tree.children[0] as { children: { data?: { hName?: string } }[] }).children.find(
        (c) => c.data?.hName === 'ft-concept-preview',
      );
      expect(node).toBeDefined();
    },
  );

  it.each([
    [':concept[x]{id=nada}', /unknown concept id "nada"/u],
    [':concept[coisa inexistente]', /no concept is labelled "coisa inexistente"/u],
    [':concept[]{id=entropy}', /needs a visible label/u],
    [':concept[entropia]{id=entropy kind=x}', /does not accept the attribute "kind"/u],
    ['[ver :concept[entropia]{id=entropy}](https://example.org)', /inside a link/u],
  ])('fails the build on %s', (markdown, message) => {
    expect(() => run(markdown)).toThrow(message);
  });

  it('fails on ambiguous labels and on a missing locale', () => {
    const ambiguous = {
      ...index,
      lookup: () => ({ kind: 'ambiguous' as const, key: 'x', ids: ['a', 'b'] as never }),
    };
    const file = new VFile({ value: ':concept[x]', data: { astro: { frontmatter: { lang: 'pt-BR' } } } });
    const processor = unified().use(remarkParse).use(remarkDirective).use(remarkConcepts, { context: { ...context, concepts: ambiguous } });
    expect(() => processor.runSync(processor.parse(file), file)).toThrow(/ambiguous/u);
    expect(() => run(':concept[entropia]{id=entropy}', {})).toThrow(/no valid `lang`/u);
  });

  it('validates the frontmatter `concepts` list', () => {
    expect(() => run('Texto.', { lang: 'pt-BR', concepts: ['entropy', 'nada'] })).toThrow(/unknown concept\(s\): nada/u);
    expect(() => run('Texto.', { lang: 'pt-BR', concepts: ['entropy'] })).not.toThrow();
  });
});

describe('::concept-map', () => {
  it('renders the neighbourhood as an inline SVG inside <ft-concept-map>', () => {
    const { html, file } = run('::concept-map{focus=information depth=2}');
    expect(html).toMatch(/^<ft-concept-map class="cmap cmap--local" data-map-id="cmap-information-1" data-focus="information">/u);
    expect(html).toContain('<svg class="cmap__svg" viewBox=');
    expect(html).toContain('href="/site/pt/conceitos/informacao/"');
    expect(html).toContain('Vizinhança de “Informação”, até 2 passos de distância.');
    expect(file.data.astro?.frontmatter?.['conceptsUsed']).toContain('entropy');
  });

  it('uses the directive label as caption and numbers several maps', () => {
    const { html } = run('::concept-map[Mapa da entropia]{focus=entropy}\n\n::concept-map{focus=entropy depth=1}');
    expect(html).toContain('<p class="cmap__caption ui">Mapa da entropia</p>');
    expect(html).toContain('data-map-id="cmap-entropy-2"');
  });

  it.each([
    ['::concept-map{depth=2}', /needs a focus/u],
    ['::concept-map{focus=nada}', /unknown concept focus "nada"/u],
    ['::concept-map{focus=entropy depth=9}', /depth must be 1, 2 or 3/u],
    [':::concept-map{focus=entropy}\n:::', /leaf directive/u],
  ])('fails the build on %s', (markdown, message) => {
    expect(() => run(markdown)).toThrow(message);
  });

  it('converts markup to hast in the right namespace', () => {
    const node = markupToHast(el('div', { class: 'x', hidden: true }, el('svg', { viewBox: '0 0 1 1' }, el('use', { href: '#g' }))));
    expect(node).toMatchObject({ type: 'element', tagName: 'div', properties: { className: ['x'], hidden: true } });
    const svg = (node as { children: { tagName: string; properties: Record<string, unknown> }[] }).children[0];
    expect(svg?.properties['viewBox']).toBe('0 0 1 1');
  });
});
