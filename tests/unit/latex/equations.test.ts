/**
 * Equations: \label removed, \tag{n} appended, original TeX kept in data-tex,
 * the id surviving rehype-katex, KaTeX's own counter switched off, and the
 * KaTeX limitation on inline \tag turned into a build error.
 */
import { describe, expect, it } from 'vitest';
import { failure, frontmatter, html, mdast } from './helpers.ts';

describe('labelled display equations', () => {
  it('removes \\label, appends \\tag{n}, keeps the original TeX in data-tex and the id through KaTeX', () => {
    const md = '$$\na^2 + b^2 = c^2 \\label{eq:pitagoras}\n$$';
    const raw = html(md, 'pt-BR', { katex: false }).html;
    expect(raw).toContain('data-tex="a^2 + b^2 = c^2 \\label{eq:pitagoras}"');
    // remark-math keeps a second copy of the TeX in data.hChildren: it was updated too.
    expect(raw).toContain('a^2 + b^2 = c^2 \n\\tag{1}</code>');
    const rendered = html(md).html;
    expect(rendered).toMatch(
      /^<div class="equation" id="eq-pitagoras" data-label="eq:pitagoras" data-tex="[^"]*"><span class="katex-display">/,
    );
    expect(rendered).toContain('<annotation encoding="application/x-tex">a^2 + b^2 = c^2 \n\\tag{1}</annotation>');
    expect(rendered).toContain('<span class="katex-tag">');
  });

  it('numbers only labelled equations, in order, and respects the author \\tag', () => {
    const md = [
      '$$\nx\n$$',
      '$$\ny \\label{eq:y}\n$$',
      '$$\nz \\tag{A} \\label{eq:z}\n$$',
      '$$\nw \\label{eq:w}\n$$',
      ':eqref[eq:z] :eqref[eq:w]',
    ].join('\n\n');
    const out = html(md, 'pt-BR', { katex: false }).html;
    expect(out).toContain('<pre><code class="language-math math-display">x</code></pre>');
    expect(out).toContain('y \n\\tag{1}');
    expect(out).toContain('z \\tag{A} </code>');
    expect(out).toContain('w \n\\tag{2}');
    expect(out).toContain('>(A)</a>');
    expect(out).toContain('>(2)</a>');
  });

  it('ignores \\label in TeX comments and after an escaped backslash', () => {
    const out = html('$$\nx % \\label{eq:no}\n$$\n\n$$\na \\\\label{eq:no}\n$$', 'pt-BR', { katex: false }).html;
    expect(out).not.toContain('\\tag');
    expect(out).not.toContain('class="equation"');
  });

  it('warns when a \\tag contains markup that references would show verbatim', () => {
    const { file } = mdast('$$\nx \\tag{\\ast} \\label{eq:x}\n$$');
    expect(file.messages.map((m) => m.ruleId)).toEqual(['complex-tag']);
  });
});

describe("KaTeX's own equation counter", () => {
  it('is switched off for unlabelled equation/align/gather/alignat (only labelled equations are numbered)', () => {
    const md = '$$\n\\begin{align}a &= b \\\\ c &= d\\end{align}\n$$';
    const out = html(md).html;
    expect(out).not.toContain('eqn-num');
    expect(out).toContain('<div class="equation" data-tex="\\begin{align}a &#x26;= b \\\\ c &#x26;= d\\end{align}">');
    expect(out).toContain('\\begin{align*}a &#x26;= b \\\\ c &#x26;= d\\end{align*}</annotation>');
  });

  it('numbers a labelled align as one block, with the layer number', () => {
    const md = '$$\n\\begin{align}a &= b \\label{eq:ab}\\\\ c &= d\\end{align}\n$$';
    const out = html(md).html;
    expect(out).not.toContain('eqn-num');
    expect(out).toContain('id="eq-ab"');
    expect(out).toContain('\\begin{align*}a &#x26;= b \\\\ c &#x26;= d\\end{align*}\n\\tag{1}</annotation>');
  });

  it('leaves environments KaTeX does not number untouched', () => {
    const md = '$$\n\\begin{aligned}a &= b\\end{aligned}\n$$';
    expect(html(md, 'pt-BR', { katex: false }).html).toBe(
      '<pre><code class="language-math math-display">\\begin{aligned}a &#x26;= b\\end{aligned}</code></pre>',
    );
  });
});

describe('inline math', () => {
  it('fails on \\label (KaTeX cannot \\tag inline formulas)', () => {
    expect(failure(() => html('Texto $$x \\label{eq:x}$$ inline.'))).toMatch(/not allowed in inline math/);
  });

  it('fails on two labels in one display', () => {
    expect(failure(() => html('$$\nx \\label{eq:a} \\label{eq:b}\n$$'))).toMatch(/2 \\label commands/);
  });

  it('fails on a \\label without a braced argument', () => {
    expect(failure(() => html('$$\nx \\label eq\n$$'))).toMatch(/needs a braced argument/);
  });
});

describe('frontmatter.hasMath', () => {
  it('is true exactly when KaTeX will render something', () => {
    expect(frontmatter(mdast('Sem fórmulas, R$ 5,00 e R$ 10,00.').file)['hasMath']).toBe(false);
    expect(frontmatter(mdast('Com $$x$$.').file)['hasMath']).toBe(true);
    expect(frontmatter(mdast('$$\nx\n$$').file)['hasMath']).toBe(true);
    // rehype-katex 7 also renders ```math fences (class language-math).
    expect(frontmatter(mdast('```math\nx\n```').file)['hasMath']).toBe(true);
    expect(frontmatter(mdast('```ts\nconst x = "$$y$$";\n```').file)['hasMath']).toBe(false);
  });
});
