/**
 * The remark stage "latex" through the production stage order (see helpers.ts):
 * numbering, nesting, cross-references, localisation, equations, figures,
 * diagnostics, frontmatter export and information preservation.
 */
import { describe, expect, it } from 'vitest';
import { fc, test } from '@fast-check/vitest';
import { toString } from 'mdast-util-to-string';
import type { Root } from 'mdast';
import { frontmatter, html, mdast, parse } from './helpers.ts';

const NBSP = '\u00a0';
const failure = (run: () => unknown): string => {
  try {
    run();
  } catch (error) {
    return String(error);
  }
  return '';
};

describe('theorem-like environments (amsthm)', () => {
  it('numbers every environment kind with ONE shared counter, in document order', () => {
    const { html: out } = html(
      [':::definition', 'D.', ':::', '', ':::theorem', 'T.', ':::', '', ':::remark', 'R.', ':::', '', ':::lemma', 'L.', ':::'].join('\n'),
    );
    expect(out).toContain('<span class="env__name">Definição</span> <span class="env__number">1</span>.');
    expect(out).toContain('<span class="env__name">Teorema</span> <span class="env__number">2</span>.');
    expect(out).toContain('<span class="env__name">Observação</span>.');
    expect(out).toContain('<span class="env__name">Lema</span> <span class="env__number">3</span>.');
  });

  it('renders the specified section/head structure with id, data-label and aria-labelledby', () => {
    const { html: out } = html(':::theorem{#thm:amostragem title="Nyquist–Shannon"}\nEnunciado.\n:::');
    expect(out).toBe(
      '<section class="env env--theorem env--plain" id="thm-amostragem" data-label="thm:amostragem" aria-labelledby="thm-amostragem__head">' +
        '<p class="env__head" id="thm-amostragem__head"><span class="env__name">Teorema</span> <span class="env__number">1</span> ' +
        '<span class="env__title">(Nyquist–Shannon)</span>.</p>\n<p>Enunciado.</p></section>',
    );
  });

  it('accepts a rich title as the directive label', () => {
    const { html: out } = html(':::definition[Entropia de *Shannon*]{#def:h}\nTexto.\n:::', 'pt-BR', { katex: false });
    expect(out).toContain('<span class="env__title">(Entropia de <em>Shannon</em>)</span>');
    expect(out).not.toContain('<p>Entropia de');
  });

  it('localises names (en) and the style classes follow amsthm', () => {
    const { html: out } = html(
      ':::corollary\nC.\n:::\n\n:::example\nE.\n:::\n\n:::remark\nR.\n:::\n\n:::proof\nP.\n:::',
      'en',
    );
    expect(out).toContain('class="env env--corollary env--plain"');
    expect(out).toContain('<span class="env__name">Corollary</span> <span class="env__number">1</span>');
    expect(out).toContain('class="env env--example env--definition"');
    expect(out).toContain('<span class="env__name">Example</span> <span class="env__number">2</span>');
    expect(out).toContain('class="env env--remark"');
    expect(out).toContain('<span class="env__name">Remark</span>');
    expect(out).toContain('<span class="env__name">Proof</span>.');
    expect(out).toContain('<span class="visually-hidden">End of proof.</span>');
  });

  it('nests with more colons on the outer fence; proof of= names its theorem; QED is aria-hidden', () => {
    const md = [
      '::::theorem{#thm:a}',
      'Enunciado.',
      '',
      ':::proof{of="thm:a"}',
      'Prova.',
      ':::',
      '::::',
    ].join('\n');
    const { html: out } = html(md);
    expect(out).toContain(
      `<span class="env__name">Demonstração do <a href="#thm-a" class="xref xref--theorem" data-label="thm:a">Teorema${NBSP}1</a></span>.`,
    );
    expect(out).toContain(
      '<p>Prova.<span class="qed"><span aria-hidden="true">∎</span><span class="visually-hidden">Fim da demonstração.</span></span></p></section></section>',
    );
    expect(out).not.toContain(':::');
  });

  it('uses the right pt-BR contraction for feminine statements', () => {
    const { html: out } = html(':::proposition{#prop:a}\nP.\n:::\n\n:::proof{of="prop:a"}\nQ.\n:::');
    expect(out).toContain('Demonstração da <a href="#prop-a"');
    expect(out).toContain(`Proposição${NBSP}1</a>`);
  });

  it('puts the tombstone on its own line when the proof ends with a display', () => {
    const { html: out } = html(':::proof\nTexto.\n\n$$\nx\n$$\n:::', 'pt-BR', { katex: false });
    expect(out).toMatch(/<p class="qed-line"><span class="qed">/);
  });

  it('fails on unknown attributes (closed grammar) and on of= pointing to a non-theorem', () => {
    expect(failure(() => html(':::theorem{titel="x"}\nT.\n:::'))).toMatch(/unknown attribute "titel"/);
    expect(failure(() => html(':::remark{#rem:a}\nR.\n:::\n\n:::proof{of="rem:a"}\nP.\n:::'))).toMatch(
      /must name a numbered theorem-like environment/,
    );
  });
});

describe('cross-references', () => {
  it('resolves forward and backward references, prose and math', () => {
    const md = [
      'Antes: :ref[thm:b], :eqref[eq:e], :ref[eq:e], :ref[fig:f].',
      '',
      ':::theorem{#thm:b}',
      'T.',
      ':::',
      '',
      '$$',
      'e = mc^2 \\label{eq:e}',
      '$$',
      '',
      ':::figure{#fig:f title="F" source="S."}',
      '![a](b.png)',
      ':::',
      '',
      'Depois: :ref[thm:b] e $$y = \\eqref{eq:e} + \\ref{thm:b}$$.',
    ].join('\n');
    const { html: out } = html(md, 'pt-BR', { katex: false });
    expect(out).toContain(`<a href="#thm-b" class="xref xref--theorem" data-label="thm:b">Teorema${NBSP}1</a>`);
    expect(out).toContain('<a href="#eq-e" class="xref xref--equation" data-label="eq:e">(1)</a>');
    expect(out).toContain(`>Equação${NBSP}(1)</a>`);
    expect(out).toContain(`<a href="#fig-f" class="xref xref--figure" data-label="fig:f">Figura${NBSP}1</a>`);
    expect(out).toContain(
      '<span class="math-source" data-tex="y = \\eqref{eq:e} + \\ref{thm:b}"><code class="language-math math-inline">y = \\text{(1)} + \\text{1}</code></span>',
    );
  });

  it('fails on an unknown label, with its position', () => {
    const { file } = mdast('Linha um.\n\nVer :ref[thm:nada] aqui.');
    const fatal = file.messages.filter((m) => m.fatal === true);
    expect(fatal).toHaveLength(0);
    let error: unknown;
    try {
      html('Linha um.\n\nVer :ref[thm:nada] aqui.');
    } catch (e) {
      error = e;
    }
    expect(String(error)).toMatch(/unknown label "thm:nada"/);
    expect((error as { line?: number }).line).toBe(3);
    expect((error as { column?: number }).column).toBe(5);
  });

  it('fails on unknown labels inside math', () => {
    expect(failure(() => html('$$\nx = \\eqref{eq:nada}\n$$'))).toMatch(/unknown label "eq:nada"/);
  });

  it('fails on duplicate labels across kinds and lists every error at once', () => {
    const md = ':::theorem{#thm:x}\nA.\n:::\n\n:::lemma{#thm:x}\nB.\n:::\n\n:ref[thm:y]';
    const message = failure(() => html(md));
    expect(message).toMatch(/2 LaTeX errors/);
    expect(message).toMatch(/duplicate label "thm:x" \(first defined on line 1\)/);
    expect(message).toMatch(/unknown label "thm:y"/);
  });

  it('rejects malformed labels and references to unnumbered environments', () => {
    expect(failure(() => html(':::theorem{#Thm_X}\nT.\n:::'))).toMatch(/invalid label "Thm_X"/);
    expect(failure(() => html(':::remark{#rem:r}\nR.\n:::\n\n:ref[rem:r]'))).toMatch(/unnumbered/);
  });
});

describe('equations', () => {
  it('removes \\label, appends \\tag{n}, keeps the original TeX in data-tex and the id through KaTeX', () => {
    const md = '$$\na^2 + b^2 = c^2 \\label{eq:pitagoras}\n$$';
    const raw = html(md, 'pt-BR', { katex: false }).html;
    expect(raw).toContain('data-tex="a^2 + b^2 = c^2 \\label{eq:pitagoras}"');
    expect(raw).toContain('a^2 + b^2 = c^2 \n\\tag{1}</code>');
    const rendered = html(md).html;
    expect(rendered).toMatch(/^<div class="equation" id="eq-pitagoras" data-label="eq:pitagoras" data-tex="[^"]*"><span class="katex-display">/);
    expect(rendered).toContain('<annotation encoding="application/x-tex">a^2 + b^2 = c^2 \n\\tag{1}</annotation>');
  });

  it('numbers only labelled equations and respects the author \\tag', () => {
    const md = ['$$\nx\n$$', '$$\ny \\label{eq:y}\n$$', '$$\nz \\tag{A} \\label{eq:z}\n$$', '$$\nw \\label{eq:w}\n$$', ':eqref[eq:z] :eqref[eq:w]'].join(
      '\n\n',
    );
    const out = html(md, 'pt-BR', { katex: false }).html;
    expect(out).toContain('<pre><code class="language-math math-display">x</code></pre>');
    expect(out).toContain('y \n\\tag{1}');
    expect(out).toContain('z \\tag{A} </code>');
    expect(out).toContain('w \n\\tag{2}');
    expect(out).toContain('>(A)</a>');
    expect(out).toContain('>(2)</a>');
  });

  it('fails on \\label in inline math (KaTeX cannot tag inline formulas)', () => {
    expect(failure(() => html('Texto $$x \\label{eq:x}$$ inline.'))).toMatch(/not allowed in inline math/);
  });

  it('fails on two labels in one display', () => {
    expect(failure(() => html('$$\nx \\label{eq:a} \\label{eq:b}\n$$'))).toMatch(/2 \\label commands/);
  });

  it('exports hasMath', () => {
    expect(frontmatter(mdast('Sem fórmulas.').file)['hasMath']).toBe(false);
    expect(frontmatter(mdast('Com $$x$$.').file)['hasMath']).toBe(true);
    expect(frontmatter(mdast('```math\nx\n```').file)['hasMath']).toBe(false);
  });
});

describe('figures and tables (ABNT NBR 14724 §5.8–5.9)', () => {
  const figure = (kind: string, id: string, title = 'T'): string =>
    `:::figure{#${id} kind="${kind}" title="${title}" source="Elaborado pelo autor (2026)."}\n![x](x.png)\n:::`;

  it('keeps one counter per kind and captions above with an en dash', () => {
    const md = [figure('figure', 'fig:a'), figure('chart', 'fig:b'), figure('figure', 'fig:c'), figure('frame', 'fig:d')].join('\n\n');
    const { html: out } = html(md);
    expect(out).toContain('<span class="figure__label">Figura 1</span> – <span class="figure__title">T</span>');
    expect(out).toContain('<span class="figure__label">Gráfico 1</span>');
    expect(out).toContain('<span class="figure__label">Figura 2</span>');
    expect(out).toContain('<span class="figure__label">Quadro 1</span>');
    expect(out.indexOf('<figcaption')).toBeLessThan(out.indexOf('<img'));
    expect(out.indexOf('<img')).toBeLessThan(out.indexOf('<p class="figure__source">'));
    expect(out).toContain('<p class="figure__source"><span class="figure__source-label">Fonte:</span> Elaborado pelo autor (2026).</p>');
    expect(out.match(/<figcaption/g)).toHaveLength(4);
  });

  it('labels the GFM table with its caption for assistive technology (en)', () => {
    const md = ':::figure{#tab:t kind="table" title="Rates" source="Own work."}\n| a | b |\n|---|---|\n| 1 | 2 |\n:::';
    const { html: out } = html(md, 'en');
    expect(out).toContain('<figure class="figure figure--table" id="tab-t" data-label="tab:t">');
    expect(out).toContain('<figcaption class="figure__caption" id="tab-t__caption"><span class="figure__label">Table 1</span> – ');
    expect(out).toContain('<table aria-labelledby="tab-t__caption">');
    expect(out).toContain('<span class="figure__source-label">Source:</span> Own work.');
  });

  it('fails without a title or with a table kind without a table; warns without a source', () => {
    expect(failure(() => html(':::figure{#fig:x}\n![x](x.png)\n:::'))).toMatch(/needs a title/);
    expect(failure(() => html(':::figure{kind="table" title="T" source="S"}\nTexto.\n:::'))).toMatch(/must contain a Markdown \(GFM\) table/);
    expect(failure(() => html(':::figure{kind="photo" title="T" source="S"}\n![x](x.png)\n:::'))).toMatch(/invalid figure kind "photo"/);
    const { file } = html(':::figure{title="T"}\n![x](x.png)\n:::');
    expect(file.messages.map((m) => m.ruleId)).toEqual(['missing-source']);
    expect(file.messages[0]?.fatal).toBe(false);
  });
});

describe('integration with the rest of the pipeline', () => {
  it('leaves prose directives (10:30) to the integrity stage, inside environments too', () => {
    const { html: out } = html(':::remark\nÀs 10:30, proporção 1:2.\n:::');
    expect(out).toContain('Às 10:30, proporção 1:2.');
  });

  it('exports the label table as frontmatter.crossrefs', () => {
    const { file } = mdast(':::theorem{#thm:a title="Título"}\nT.\n:::\n\n$$\nx \\label{eq:x}\n$$');
    expect(frontmatter(file)['crossrefs']).toEqual([
      { label: 'thm:a', id: 'thm-a', type: 'environment', kind: 'theorem', number: '1', title: 'Título' },
      { label: 'eq:x', id: 'eq-x', type: 'equation', kind: 'equation', number: '1' },
    ]);
  });

  it('warns (once) when the document has no lang but needs localised text', () => {
    const { file } = mdast(':::theorem\nT.\n:::', undefined);
    expect(file.messages.map((m) => m.ruleId)).toEqual(['missing-lang']);
    expect(mdast('Texto.', undefined).file.messages).toHaveLength(0);
  });

  it('does not mutate the input tree', async () => {
    const { transformLatex } = await import('../../../src/core/latex/transform.ts');
    const md = ':::theorem{#thm:a}\nVer :ref[thm:a] e $$\\ref{thm:a}$$.\n:::\n\n$$\nx \\label{eq:x}\n$$';
    const tree = parse(md);
    const before = JSON.stringify(tree);
    const result = transformLatex(tree, { locale: 'pt-BR', source: md });
    expect(JSON.stringify(tree)).toBe(before);
    expect(result.diagnostics).toEqual([]);
    expect(result.tree).not.toBe(tree);
  });
});

describe('information preservation', () => {
  const plain = (md: string): string => toString(parse(md));
  const staged = (md: string): string => toString(mdast(md).tree as Root);
  const OURS = /:{1,}(?:definition|theorem|lemma|proposition|corollary|conjecture|axiom|example|remark|proof|figure|ref|eqref)\b/;

  test.prop([fc.string({ maxLength: 160 })], { numRuns: 400 })(
    'documents without latex directives keep their plain text',
    (s) => {
      fc.pre(!OURS.test(s) && !/\\(?:label|ref|eqref)/.test(s) && !/^\s*:{2,}/m.test(s));
      expect(staged(s)).toBe(plain(s));
    },
  );

  test.prop(
    [
      fc.array(
        fc.constantFrom('$$', 'x', ' ', '\n', '\n\n', ':', '10:30', '[', ']', '{', '}', '*', '\\', 'tag', 'é', '#'),
        { maxLength: 30 },
      ),
    ],
    { numRuns: 400 },
  )('math-dense prose without labels or references is untouched', (parts) => {
    const s = parts.join('');
    fc.pre(!OURS.test(s) && !/\\(?:label|ref|eqref)/.test(s) && !/^\s*:{2,}/m.test(s));
    expect(staged(s)).toBe(plain(s));
  });

  it('keeps every rewritten source in a data-* attribute', () => {
    const md = 'Ver :eqref[eq:a].\n\n$$\na \\label{eq:a}\n$$\n\n$$b = \\eqref{eq:a}$$';
    const out = html(md, 'pt-BR', { katex: false }).html;
    expect(out).toContain('data-label="eq:a">(1)</a>');
    expect(out).toContain('data-tex="a \\label{eq:a}"');
    expect(out).toContain('data-tex="b = \\eqref{eq:a}"');
  });
});
