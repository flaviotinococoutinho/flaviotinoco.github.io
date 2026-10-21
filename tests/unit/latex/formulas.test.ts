/**
 * Numbered equations bound to the formula registry (ADR 0011): the words block
 * under every bound display, the error for an unregistered label, the stage's
 * rule (only site content is bound), the words left out of the reading time,
 * and preservation of the author's text and TeX with the binding on.
 */
import type { Nodes, Root } from 'mdast';
import rehypeStringify from 'rehype-stringify';
import remarkDirective from 'remark-directive';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkParse from 'remark-parse';
import remarkRehype from 'remark-rehype';
import { unified } from 'unified';
import { VFile } from 'vfile';
import { describe, expect, it } from 'vitest';
import { fc, test } from '@fast-check/vitest';
import type { PipelineContext } from '../../../src/adapters/unified/context.ts';
import { remarkLatex } from '../../../src/adapters/unified/remark-latex.ts';
import { foldDocument } from '../../../src/core/fold/meta.ts';
import type { MdNode } from '../../../src/core/fold/tree.ts';
import {
  buildFormulaRegistry,
  type Formula,
  type FormulaRegistry,
  type RegistryContext,
} from '../../../src/core/formulas/index.ts';
import { transformLatex, type FormulaBinding } from '../../../src/core/latex/transform.ts';
import { parse } from './helpers.ts';

const L = <T>(pt: T, en: T) => ({ 'pt-BR': pt, en });
const context: RegistryContext = { concepts: new Map(), sources: new Set() };

const registryOf = (labels: readonly string[]): FormulaRegistry => {
  const built = buildFormulaRegistry(
    labels.map((label, i) => ({
      id: `f${String(i)}`,
      data: {
        slug: L(`f${String(i)}`, `f${String(i)}`),
        name: L(`Fórmula ${label}`, `Formula ${label}`),
        tex: 'x',
        labels: L([label], [label]),
        stratum: 'formal',
        domains: ['mathematics'],
        meaning: L(`Significado de ${label}.`, `Meaning of ${label}.`),
        spoken: L(`Leitura de ${label}.`, `Reading of ${label}.`),
      },
    })),
    context,
  );
  if (!built.ok) throw new Error(built.error.join('\n'));
  return built.value;
};

const bindingOf = (labels: readonly string[]): FormulaBinding => ({
  registry: registryOf(labels),
  href: (f: Formula) => `/pt/formulas/${f.slug['pt-BR']}/`,
});

const PYTHAGORAS = '$$\na^2 + b^2 = c^2 \\label{eq:pitagoras}\n$$';

const kinds = (node: Nodes): string[] => {
  const own = node.type === 'latexBlock' || node.type === 'latexInline' ? [node.role] : [];
  return 'children' in node ? [...own, ...(node.children as readonly Nodes[]).flatMap(kinds)] : own;
};

describe('a bound equation', () => {
  it('is wrapped with its version in words: summary with the name, meaning, reading, link; the equation is described by the meaning', () => {
    const result = transformLatex(parse(PYTHAGORAS), {
      locale: 'pt-BR',
      source: PYTHAGORAS,
      formulas: bindingOf(['eq:pitagoras']),
    });
    expect(result.diagnostics).toEqual([]);
    const [block] = result.tree.children;
    expect(block?.type).toBe('latexBlock');
    if (block?.type !== 'latexBlock') return;
    expect(block.role).toBe('formula');
    expect(block.data.hProperties).toEqual({ className: ['formula'], dataFormula: 'f0' });
    const [equation, words] = block.children;
    expect(equation?.type === 'latexBlock' && equation.role).toBe('equation');
    expect(equation?.type === 'latexBlock' && equation.data.hProperties['ariaDescribedBy']).toEqual([
      'eq-pitagoras__meaning',
    ]);
    expect(words?.type === 'latexBlock' && words.role).toBe('formula-words');
    if (words?.type !== 'latexBlock') return;
    expect(words.data.hName).toBe('details');
    expect(words.data.hProperties).toEqual({ className: ['formula__words'], id: 'eq-pitagoras__words' });
    expect(words.data.readingGenerated).toBe(true);
    expect(kinds(words)).toEqual([
      'formula-words',
      'formula-summary',
      'formula-summary-label',
      'formula-name',
      'formula-label',
    ]);
    expect(JSON.stringify(words)).toContain('Significado de eq:pitagoras.');
    expect(JSON.stringify(words)).toContain('Leitura de eq:pitagoras.');
    expect(JSON.stringify(words)).toContain('"url":"/pt/formulas/f0/"');
    expect(result.localized).toBe(true);
  });

  it('is an error when its label is registered for no formula; unlabelled displays are not bound', () => {
    const md = `${PYTHAGORAS}\n\n$$\nx\n$$`;
    const result = transformLatex(parse(md), { locale: 'pt-BR', source: md, formulas: bindingOf(['eq:outra']) });
    expect(result.diagnostics.map((d) => [d.severity, d.rule])).toEqual([['error', 'missing-formula']]);
    expect(result.diagnostics[0]?.message).toContain('src/content/formulas/<id>.json');
    expect(result.diagnostics[0]?.message).toContain('labels["pt-BR"]');
    expect(kinds(result.tree)).toEqual(['equation', 'equation']);
  });

  it('is left alone without a binding (documents outside the site content)', () => {
    const result = transformLatex(parse(PYTHAGORAS), { locale: 'pt-BR', source: PYTHAGORAS });
    expect(result.diagnostics).toEqual([]);
    expect(kinds(result.tree)).toEqual(['equation']);
  });

  it('does not add its words to the reading time', () => {
    const md = `Um dois três.\n\n${PYTHAGORAS}`;
    const plain = transformLatex(parse(md), { locale: 'pt-BR', source: md }).tree;
    const bound = transformLatex(parse(md), {
      locale: 'pt-BR',
      source: md,
      formulas: bindingOf(['eq:pitagoras']),
    }).tree;
    const count = (tree: Root): number =>
      foldDocument(tree as unknown as MdNode, { locale: 'pt-BR', source: md }).wordCount;
    expect(count(bound)).toBe(count(plain));
    expect(count(plain)).toBe(3);
  });
});

// ── the stage: only site content is bound ──────────────────────────────────────

const stageContext = {
  base: '/site/',
  formulas: registryOf(['eq:pitagoras']),
} as unknown as PipelineContext;

const render = (markdown: string, path: string | undefined): { readonly html: string; readonly file: VFile } => {
  const processor = unified()
    .use(remarkParse)
    .use(remarkGfm)
    .use(remarkMath, { singleDollarTextMath: false })
    .use(remarkDirective)
    .use(remarkLatex, { context: stageContext })
    .use(remarkRehype)
    .use(rehypeStringify);
  const file = new VFile({
    value: markdown,
    ...(path === undefined ? {} : { path }),
    data: { astro: { frontmatter: { lang: 'pt-BR' } } },
  });
  return { html: String(processor.processSync(file)), file };
};

describe('the latex stage', () => {
  it('binds a file under src/content/ and links the words to the formula page under the base path', () => {
    const { html } = render(PYTHAGORAS, '/repo/src/content/essays/pt/x.md');
    expect(html).toContain('<div class="formula" data-formula="f0"><div class="equation" id="eq-pitagoras"');
    expect(html).toContain('aria-describedby="eq-pitagoras__meaning"');
    expect(html).toContain(
      '<details class="formula__words" id="eq-pitagoras__words"><summary class="formula__summary"><span class="formula__summary-label">Em palavras</span> <span class="formula__name">Fórmula eq:pitagoras</span></summary>',
    );
    expect(html).toContain('<p class="formula__meaning" id="eq-pitagoras__meaning">Significado de eq:pitagoras.</p>');
    expect(html).toContain(
      '<p class="formula__spoken"><span class="formula__label">Como se lê:</span> Leitura de eq:pitagoras.</p>',
    );
    expect(html).toContain(
      '<p class="formula__more"><a href="/site/pt/formulas/f0/">Ficha da fórmula no acervo</a></p>',
    );
  });

  it('leaves documents outside src/content/ (strings, tools) unbound', () => {
    expect(render(PYTHAGORAS, undefined).html).not.toContain('formula__words');
    expect(render(PYTHAGORAS, '/repo/docs/x.md').html).not.toContain('formula__words');
  });

  it('fails the build on an unregistered label of a content file', () => {
    const md = '$$\nx \\label{eq:ninguem}\n$$';
    expect(() => render(md, '/repo/src/content/labs/pt/x.md')).toThrow(/no formula registered for "eq:ninguem"/);
  });
});

// ── preservation with the binding on ───────────────────────────────────────────

const word = fc.stringMatching(/^[a-zà-úç]{1,8}$/);
const sentence = fc.array(word, { minLength: 1, maxLength: 6 }).map((ws) => `${ws.join(' ')}.`);
const label = fc.stringMatching(/^[a-z][a-z0-9]{0,5}$/).map((s) => `eq:${s}`);
const tex = fc.stringMatching(/^[a-z0-9 +=^_{}()]{1,20}$/).filter((s) => s.trim().length > 0);

const isGenerated = (node: Nodes): boolean => node.type === 'latexBlock' || node.type === 'latexInline';

/** Author text and TeX of a tree: text outside generated structure, TeX from the author's math or from data-tex. */
const view = (tree: Root): { readonly texts: string[]; readonly math: string[] } => {
  const texts: string[] = [];
  const math: string[] = [];
  const walk = (node: Nodes, inGenerated: boolean): void => {
    const dataTex = (node.data as { hProperties?: { dataTex?: unknown } } | undefined)?.hProperties?.dataTex;
    if (typeof dataTex === 'string') {
      math.push(dataTex);
      return;
    }
    if (node.type === 'math') math.push(node.value);
    if (node.type === 'text' && !inGenerated) texts.push(node.value);
    const generated = inGenerated || isGenerated(node);
    if ('children' in node) for (const child of node.children as readonly Nodes[]) walk(child, generated);
  };
  walk(tree, false);
  return { texts, math };
};

describe('preservation with the binding on', () => {
  test.prop([fc.uniqueArray(fc.tuple(label, tex, sentence), { minLength: 1, maxLength: 5, selector: ([l]) => l })], {
    numRuns: 200,
  })('keeps every author text node and every formula recoverable', (items) => {
    const md = items.map(([l, t, s]) => `${s}\n\n$$\n${t} \\label{${l}}\n$$`).join('\n\n');
    const input = parse(md);
    const result = transformLatex(input, { locale: 'pt-BR', source: md, formulas: bindingOf(items.map(([l]) => l)) });
    expect(result.diagnostics).toEqual([]);
    expect(view(result.tree)).toEqual(view(input));
    expect(kinds(result.tree).filter((k) => k === 'formula')).toHaveLength(items.length);
  });
});
