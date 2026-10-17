/**
 * Information preservation (docs/arquitetura.md §2.4) as properties.
 *
 *   1. A document without LaTeX-layer constructs is left exactly as it was
 *      (the transform returns the very same tree: plain text trivially kept).
 *   2. For random documents WITH environments, equations, figures and
 *      references, the transform is injective: generated structure is
 *      always delimited (latexInline/latexBlock nodes, .xref links, the
 *      env head and figure source paragraphs), every author text node comes
 *      out unchanged and in order, every rewritten formula is recoverable from
 *      data-tex and every reference from data-label.
 */
import { describe, expect } from 'vitest';
import { fc, test } from '@fast-check/vitest';
import type { Nodes, Root } from 'mdast';
import { toString } from 'mdast-util-to-string';
import { directiveLabelSource, plainText } from '../../../src/core/latex/nodes.ts';
import { transformLatex } from '../../../src/core/latex/transform.ts';
import { parse } from './helpers.ts';

const OURS =
  /:(?:definition|theorem|lemma|proposition|corollary|conjecture|axiom|example|remark|proof|figure|ref|eqref)\b/;
const LATEX_IN_MATH = /\\(?:label|ref|eqref|begin)/;
const FENCE_LINE = /^\s*:{2,}/m;

describe('documents without LaTeX-layer constructs', () => {
  const unchanged = (s: string): void => {
    fc.pre(!OURS.test(s) && !LATEX_IN_MATH.test(s) && !FENCE_LINE.test(s));
    const tree = parse(s);
    const result = transformLatex(tree, { locale: 'pt-BR', source: s });
    expect(result.tree).toBe(tree);
    expect(toString(result.tree)).toBe(toString(tree));
    expect(result.diagnostics).toEqual([]);
  };

  test.prop([fc.string({ maxLength: 200 })], { numRuns: 500 })('keep their tree (and plain text) unchanged', unchanged);

  test.prop(
    [
      fc
        .array(
          fc.constantFrom(
            '$$',
            'x',
            ' ',
            '\n',
            '\n\n',
            ':',
            '10:30',
            'nota:',
            '[',
            ']',
            '{',
            '}',
            '*',
            '\\',
            'tag',
            'é',
            '#',
            '|',
            '`',
            '-',
          ),
          { maxLength: 40 },
        )
        .map((parts) => parts.join('')),
    ],
    { numRuns: 500 },
  )('keep their tree unchanged, even when dense with math and directive syntax', unchanged);
});

// ── generated documents with every construct of the layer ─────────────────────

type Ref = { readonly kind: 'ref' | 'eqref' | 'math'; readonly pick: number };
type Block =
  | { readonly t: 'p'; readonly text: string; readonly refs: readonly Ref[]; readonly math: string | undefined }
  | {
      readonly t: 'env';
      readonly kind: string;
      readonly labelled: boolean;
      readonly title: string | undefined;
      readonly body: readonly string[];
    }
  | { readonly t: 'eq'; readonly tex: string; readonly labelled: boolean }
  | { readonly t: 'fig'; readonly kind: string; readonly title: string; readonly source: string };

const word = fc.stringMatching(/^[a-zà-úç]{1,8}$/);
const sentence = fc.array(word, { minLength: 1, maxLength: 6 }).map((ws) => `${ws.join(' ')}.`);
const tex = fc.stringMatching(/^[a-z0-9+=^ ]{1,12}$/).map((s) => s.trim() || 'x');
const ref: fc.Arbitrary<Ref> = fc.record({ kind: fc.constantFrom('ref', 'eqref', 'math'), pick: fc.nat() });

const block: fc.Arbitrary<Block> = fc.oneof(
  fc.record({
    t: fc.constant('p' as const),
    text: sentence,
    refs: fc.array(ref, { maxLength: 3 }),
    math: fc.option(tex, { nil: undefined }),
  }),
  fc.record({
    t: fc.constant('env' as const),
    kind: fc.constantFrom(
      'definition',
      'theorem',
      'lemma',
      'proposition',
      'corollary',
      'conjecture',
      'axiom',
      'example',
      'remark',
      'proof',
    ),
    labelled: fc.boolean(),
    title: fc.option(sentence, { nil: undefined }),
    body: fc.array(sentence, { minLength: 1, maxLength: 2 }),
  }),
  fc.record({ t: fc.constant('eq' as const), tex, labelled: fc.boolean() }),
  fc.record({
    t: fc.constant('fig' as const),
    kind: fc.constantFrom('figure', 'chart', 'frame', 'table'),
    title: sentence,
    source: sentence,
  }),
);

interface Doc {
  readonly markdown: string;
  readonly titles: readonly string[];
  readonly sources: readonly string[];
}

const NUMBERED = new Set([
  'definition',
  'theorem',
  'lemma',
  'proposition',
  'corollary',
  'conjecture',
  'axiom',
  'example',
]);

/** Renders the block list to Markdown; references pick among the labels the document defines (forward ones included). */
const render = (blocks: readonly Block[]): Doc => {
  const labels: { readonly label: string; readonly equation: boolean }[] = [];
  blocks.forEach((b, i) => {
    if (b.t === 'env' && b.labelled && NUMBERED.has(b.kind))
      labels.push({ label: `env:n${String(i)}`, equation: false });
    if (b.t === 'eq' && b.labelled) labels.push({ label: `eq:n${String(i)}`, equation: true });
    if (b.t === 'fig') labels.push({ label: `fig:n${String(i)}`, equation: false });
  });
  const titles: string[] = [];
  const sources: string[] = [];
  const parts = blocks.map((b, i): string => {
    switch (b.t) {
      case 'p': {
        const refs =
          labels.length === 0
            ? []
            : b.refs.map((r) => {
                const target = labels[r.pick % labels.length];
                if (target === undefined) return '';
                if (r.kind === 'math' && target.equation) return ` $$y = \\eqref{${target.label}}$$`;
                if (r.kind === 'eqref' && target.equation) return ` :eqref[${target.label}]`;
                return ` :ref[${target.label}]`;
              });
        return `${b.text}${refs.join('')}${b.math === undefined ? '' : ` $$${b.math}$$`} fim.`;
      }
      case 'env': {
        // A proof's title replaces its name (amsthm); other titles are a parenthesised note.
        if (b.title !== undefined) titles.push(b.kind === 'proof' ? b.title : `(${b.title})`);
        const id = b.labelled && NUMBERED.has(b.kind) ? `#env:n${String(i)}` : '';
        const title = b.title === undefined ? '' : ` title="${b.title}"`;
        return `:::${b.kind}{${id}${title}}\n${b.body.join('\n\n')}\n:::`;
      }
      case 'eq':
        return `$$\n${b.tex}${b.labelled ? ` \\label{eq:n${String(i)}}` : ''}\n$$`;
      case 'fig': {
        titles.push(b.title);
        sources.push(b.source);
        const body = b.kind === 'table' ? '| a | b |\n|---|---|\n| 1 | 2 |' : `![${b.title}](img${String(i)}.png)`;
        return `:::figure{#fig:n${String(i)} kind="${b.kind}" title="${b.title}" source="${b.source}"}\n${body}\n:::`;
      }
    }
  });
  return { markdown: parts.join('\n\n'), titles, sources };
};

// ── views of the trees ────────────────────────────────────────────────────────

const classes = (node: Nodes): readonly string[] => {
  const className = (node.data as { hProperties?: { className?: unknown } } | undefined)?.hProperties?.className;
  return Array.isArray(className) ? className.filter((c): c is string => typeof c === 'string') : [];
};
const prop = (node: Nodes, key: string): unknown =>
  (node.data as { hProperties?: Record<string, unknown> } | undefined)?.hProperties?.[key];
const isGenerated = (node: Nodes): boolean =>
  node.type === 'latexInline' ||
  node.type === 'latexBlock' ||
  (node.type === 'link' && classes(node).includes('xref')) ||
  (node.type === 'paragraph' && (classes(node).includes('env__head') || classes(node).includes('figure__source')));

interface View {
  readonly texts: string[];
  readonly math: string[];
  readonly refs: string[];
}

/** Author text, formulas and references of the INPUT (mdast before the stage). */
const inputView = (tree: Root, source: string): View => {
  const view: View = { texts: [], math: [], refs: [] };
  const walk = (node: Nodes): void => {
    if (node.type === 'textDirective' && (node.name === 'ref' || node.name === 'eqref')) {
      view.refs.push(directiveLabelSource(node, source));
      return;
    }
    if (node.type === 'text') view.texts.push(node.value);
    if (node.type === 'math' || node.type === 'inlineMath') {
      view.math.push(node.value);
      for (const m of node.value.matchAll(/\\eqref\{([^}]*)\}/g)) view.refs.push(m[1] ?? '');
    }
    if ('children' in node) for (const child of node.children as readonly Nodes[]) walk(child);
  };
  walk(tree);
  return view;
};

/** The same, RECOVERED from the OUTPUT: generated structure skipped, data-* attributes read back. */
const outputView = (tree: Root): View => {
  const view: View = { texts: [], math: [], refs: [] };
  const walk = (node: Nodes, inGenerated: boolean): void => {
    const tex = prop(node, 'dataTex');
    if (typeof tex === 'string') {
      view.math.push(tex);
      for (const m of tex.matchAll(/\\eqref\{([^}]*)\}/g)) view.refs.push(m[1] ?? '');
      return;
    }
    if (node.type === 'link' && classes(node).includes('xref') && !inGenerated)
      view.refs.push(String(prop(node, 'dataLabel')));
    if (node.type === 'text' && !inGenerated) view.texts.push(node.value);
    if (node.type === 'math' || node.type === 'inlineMath') view.math.push(node.value);
    const generated = inGenerated || isGenerated(node);
    if ('children' in node) for (const child of node.children as readonly Nodes[]) walk(child, generated);
  };
  walk(tree, false);
  return view;
};

const collectByClass = (tree: Root, className: string): string[] => {
  const out: string[] = [];
  const walk = (node: Nodes): void => {
    if (classes(node).includes(className)) out.push(plainText(node));
    if ('children' in node) for (const child of node.children as readonly Nodes[]) walk(child);
  };
  walk(tree);
  return out;
};

describe('documents with environments, equations, figures and references', () => {
  test.prop([fc.array(block, { minLength: 1, maxLength: 8 }), fc.constantFrom('pt-BR' as const, 'en' as const)], {
    numRuns: 300,
  })('are transformed injectively (author text kept, rewrites recoverable from data-*)', (blocks, locale) => {
    const doc = render(blocks);
    const tree = parse(doc.markdown);
    const before = inputView(tree, doc.markdown);
    const result = transformLatex(tree, { locale, source: doc.markdown });
    expect(result.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    const after = outputView(result.tree);
    expect(after.texts).toEqual(before.texts);
    expect(after.math).toEqual(before.math);
    expect(after.refs).toEqual(before.refs);
    // Attribute values (titles, sources) are recoverable from the generated structure.
    expect(
      [...collectByClass(result.tree, 'env__title'), ...collectByClass(result.tree, 'figure__title')].sort(),
    ).toEqual([...doc.titles].sort());
    expect(collectByClass(result.tree, 'figure__source').map((s) => s.replace(/^\S+ /, ''))).toEqual(doc.sources);
  });
});
