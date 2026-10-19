/**
 * The remark stage "latex" as a pipeline citizen: frontmatter exports,
 * coexistence with the integrity stage, purity of the core transform, and the
 * whole fixture essay through the production stage order.
 */
import { describe, expect, it } from 'vitest';
import { transformLatex } from '../../../src/core/latex/transform.ts';
import { fixture, frontmatter, html, mdast, NBSP, parse } from './helpers.ts';

describe('frontmatter exports', () => {
  it('exports the label table as frontmatter.crossrefs', () => {
    const { file } = mdast(
      ':::theorem{#thm:a title="Título"}\nT.\n:::\n\n$$\nx \\label{eq:x}\n$$\n\n:::remark{#rem:r}\nR.\n:::',
    );
    expect(frontmatter(file)['crossrefs']).toEqual([
      { label: 'thm:a', id: 'thm-a', type: 'environment', kind: 'theorem', number: '1', title: 'Título' },
      { label: 'eq:x', id: 'eq-x', type: 'equation', kind: 'equation', number: '1' },
      { label: 'rem:r', id: 'rem-r', type: 'unnumbered', kind: 'remark' },
    ]);
  });

  it('exports titles as the reader sees them: references resolved, math as $$TeX$$, prose directives verbatim', () => {
    const { file } = mdast(
      ':::lemma{#lem:a}\nL.\n:::\n\n' +
        ':::theorem[Usa :ref[lem:a] e $$x^2 + \\ref{lem:a}$$ às 10:30]{#thm:b}\nT.\n:::\n\n' +
        ':::figure[Curva *do* :eqref[eq:c]]{#fig:c source="S."}\n![c](c.png)\n:::\n\n$$\nc \\label{eq:c}\n$$',
    );
    const titles = (frontmatter(file)['crossrefs'] as readonly { label: string; title?: string }[]).map((c) => [
      c.label,
      c.title,
    ]);
    expect(titles).toEqual([
      ['lem:a', undefined],
      ['thm:b', `Usa Lema${NBSP}1 e $$x^2 + \\text{1}$$ às 10:30`],
      ['fig:c', 'Curva do (1)'],
      ['eq:c', undefined],
    ]);
  });

  it('warns (once) when the document has no lang but needs localised text, and falls back to pt-BR', () => {
    const { file, tree } = mdast(':::theorem\nT.\n:::', null);
    expect(file.messages.map((m) => m.ruleId)).toEqual(['missing-lang']);
    expect(JSON.stringify(tree)).toContain('Teorema');
    expect(mdast('Texto.', null).file.messages).toHaveLength(0);
  });
});

describe('integration with the rest of the pipeline', () => {
  it('leaves prose directives (10:30) to the integrity stage, inside environments too', () => {
    const { html: out } = html(':::remark\nÀs 10:30, proporção 1:2.\n:::');
    expect(out).toContain('Às 10:30, proporção 1:2.');
  });

  it('renders the fixture essay end to end (KaTeX included) without errors', () => {
    // ::toc belongs to the reading stage, absent from this harness.
    const { html: out, file } = html(fixture('ensaio.md').replace('::toc', ''));
    expect(file.messages.filter((m) => m.fatal === true)).toEqual([]);
    expect(out).toContain('<section class="env env--definition" id="def-entropia"');
    expect(out).toContain('<div class="equation" id="eq-entropia" data-label="eq:entropia"');
    expect(out).toContain(
      `Demonstração do <a href="#thm-amostragem" class="xref xref--theorem" data-label="thm:amostragem">Teorema${NBSP}2</a>`,
    );
    expect(out).toContain(`<a href="#eq-sinc" class="xref xref--equation" data-label="eq:sinc">Equação${NBSP}(2)</a>`);
    expect(out).toContain(`<span class="figure__label">Gráfico${NBSP}1</span>`);
    expect(out).toContain(`<span class="figure__label">Tabela${NBSP}1</span>`);
    expect(out).toContain('Às 10:30 a proporção é 1:2');
    expect(frontmatter(file)['hasMath']).toBe(true);
  });
});

describe('purity of the core transform', () => {
  it('does not mutate its input and shares unchanged subtrees', () => {
    const md =
      ':::theorem{#thm:a}\nVer :ref[thm:a] e $$\\ref{thm:a}$$.\n:::\n\nParágrafo intocado.\n\n$$\nx \\label{eq:x}\n$$';
    const tree = parse(md);
    const before = JSON.stringify(tree);
    const result = transformLatex(tree, { locale: 'pt-BR', source: md });
    expect(JSON.stringify(tree)).toBe(before);
    expect(result.diagnostics).toEqual([]);
    expect(result.tree).not.toBe(tree);
    expect(result.tree.children[1]).toBe(tree.children[1]);
  });

  it('is deterministic', () => {
    const md = fixture('ensaio.md');
    const a = transformLatex(parse(md), { locale: 'pt-BR', source: md });
    const b = transformLatex(parse(md), { locale: 'pt-BR', source: md });
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('works without the source text (positions only used for exact slices)', () => {
    const md = ':::theorem{#thm:a}\nT.\n:::\n\n:ref[thm:a]';
    const result = transformLatex(parse(md), { locale: 'en' });
    expect(result.diagnostics).toEqual([]);
    expect(JSON.stringify(result.tree)).toContain(`Theorem${NBSP}1`);
  });
});
