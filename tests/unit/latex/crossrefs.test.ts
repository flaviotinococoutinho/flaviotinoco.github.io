/**
 * Cross-references: two passes (forward references), prose and math forms,
 * localisation, unknown and duplicate labels, label → id mapping.
 */
import { describe, expect, it } from 'vitest';
import { failure, html, mdast, NBSP } from './helpers.ts';

describe('resolution', () => {
  it('resolves forward and backward references, in prose and in math', () => {
    const md = [
      'Antes: :ref[thm:b], :eqref[eq:e], :ref[eq:e], :ref[fig:f], :ref[tab:t].',
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
      ':::figure{#tab:t kind="table" title="T" source="S."}',
      '| a |',
      '|---|',
      '| 1 |',
      ':::',
      '',
      'Depois: :ref[thm:b] e $$y = \\eqref{eq:e} + \\ref{thm:b}$$.',
    ].join('\n');
    const { html: out } = html(md, 'pt-BR', { katex: false });
    expect(out).toContain(`<a href="#thm-b" class="xref xref--theorem" data-label="thm:b">Teorema${NBSP}1</a>`);
    expect(out).toContain('<a href="#eq-e" class="xref xref--equation" data-label="eq:e">(1)</a>');
    expect(out).toContain(`>Equação${NBSP}(1)</a>`);
    expect(out).toContain(`<a href="#fig-f" class="xref xref--figure" data-label="fig:f">Figura${NBSP}1</a>`);
    expect(out).toContain(`<a href="#tab-t" class="xref xref--table" data-label="tab:t">Tabela${NBSP}1</a>`);
    expect(out).toContain(
      '<span class="math-source" data-tex="y = \\eqref{eq:e} + \\ref{thm:b}"><code class="language-math math-inline">y = \\text{(1)} + \\text{1}</code></span>',
    );
  });

  it('localises reference texts (en)', () => {
    const md =
      ':ref[thm:a] :ref[fig:c] :ref[eq:x] :eqref[eq:x]\n\n:::theorem{#thm:a}\nT.\n:::\n\n:::figure{#fig:c kind="chart" title="C" source="S."}\n![c](c.png)\n:::\n\n$$\nx \\label{eq:x}\n$$';
    const { html: out } = html(md, 'en', { katex: false });
    expect(out).toContain(`>Theorem${NBSP}1</a>`);
    expect(out).toContain(`>Chart${NBSP}1</a>`);
    expect(out).toContain(`>Equation${NBSP}(1)</a>`);
    expect(out).toContain('>(1)</a>');
  });

  it('maps labels to ids by replacing the colon with a hyphen', () => {
    const { html: out } = html(':::lemma{#lem:limite-superior}\nL.\n:::\n\n:ref[lem:limite-superior]');
    expect(out).toContain('id="lem-limite-superior"');
    expect(out).toContain('href="#lem-limite-superior"');
  });

  it('leaves bracket-less ":ref" prose to the integrity stage (restored verbatim)', () => {
    const { html: out } = html('Ver a nota:ref e a razão 3:eqref.');
    expect(out).toBe('<p>Ver a nota:ref e a razão 3:eqref.</p>');
  });

  it('never touches inline code, code blocks or link URLs', () => {
    const md = '`:ref[thm:x]` e [link](https://x.org/:ref[thm:y])\n\n```\n:ref[thm:z] \\eqref{eq:q}\n```';
    const { html: out } = html(md);
    expect(out).toContain('<code>:ref[thm:x]</code>');
    expect(out).toContain('href="https://x.org/:ref%5Bthm:y%5D"');
    expect(out).toContain(':ref[thm:z] \\eqref{eq:q}');
  });
});

describe('errors', () => {
  it('fails on an unknown label, with its position', () => {
    let error: unknown;
    try {
      html('Linha um.\n\nVer :ref[thm:nada] aqui.');
    } catch (e) {
      error = e;
    }
    expect(String(error)).toMatch(/unknown label "thm:nada"/);
    expect((error as { line?: number }).line).toBe(3);
    expect((error as { column?: number }).column).toBe(5);
    expect((error as { ruleId?: string }).ruleId).toBe('unknown-label');
    expect((error as { source?: string }).source).toBe('latex');
  });

  it('fails on unknown labels inside math', () => {
    expect(failure(() => html('$$\nx = \\eqref{eq:nada}\n$$'))).toMatch(/unknown label "eq:nada"/);
    expect(failure(() => html('Texto $$\\ref{thm:nada}$$.'))).toMatch(/unknown label "thm:nada"/);
  });

  it('fails on duplicate labels across kinds and lists every error at once', () => {
    const md = ':::theorem{#thm:x}\nA.\n:::\n\n$$\nx \\label{thm:x}\n$$\n\n:ref[thm:y]';
    const message = failure(() => html(md));
    expect(message).toMatch(/2 LaTeX errors/);
    expect(message).toMatch(/5:1: duplicate label "thm:x" \(first defined on line 1\)/);
    expect(message).toMatch(/9:1: unknown label "thm:y"/);
  });

  it('rejects malformed labels and references to unnumbered environments', () => {
    expect(failure(() => html('Ver :ref[Thm X].'))).toMatch(/invalid label "Thm X"/);
    expect(failure(() => html(':::remark{#rem:r}\nR.\n:::\n\n:ref[rem:r]'))).toMatch(/unnumbered/);
    expect(failure(() => html(':::proof{#prf:p}\nP.\n:::\n\n:eqref[prf:p]'))).toMatch(/unnumbered/);
    expect(failure(() => html(':ref[thm:a]{x=1}\n\n:::theorem{#thm:a}\nT.\n:::'))).toMatch(/takes no attributes/);
  });

  it('warns when :eqref points to something that is not an equation', () => {
    const { file } = mdast(':::theorem{#thm:a}\nT.\n:::\n\n:eqref[thm:a]');
    expect(file.messages.map((m) => m.ruleId)).toEqual(['eqref-target']);
  });
});
