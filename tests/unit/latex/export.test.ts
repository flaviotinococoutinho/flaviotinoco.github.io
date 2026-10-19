/**
 * The .tex exporter (src/core/latex/export.ts): snapshots of two fixture
 * essays, targeted assertions on every construct of the authoring language,
 * a static "would compile" check (tex-lint.ts) and properties.
 *
 * pdflatex is not available here; tex-lint checks what a compile would trip
 * on first: unbalanced environments/braces/math and unescaped specials.
 */
import { describe, expect, it } from 'vitest';
import { fc, test } from '@fast-check/vitest';
import katex from 'katex';
import type { Nodes, Root } from 'mdast';
import { exportLatex, parseExportMeta, toLatex, type ExportMeta } from '../../../src/core/latex/export.ts';
import { MACROS } from '../../../src/core/latex/macros.ts';
import { escapeTex, unescapeTex } from '../../../src/core/latex/tex-escape.ts';
import { fixture, parse, site, siteTree } from './helpers.ts';
import { lintDocument, lintTex, split } from './tex-lint.ts';

const pt: ExportMeta = {
  lang: 'pt-BR',
  title: 'Amostragem & informação: 100% "sinal"',
  subtitle: 'Um ensaio de teste',
  date: '2026-03-14',
  abstract: 'Resumo com $ e #.',
  keywords: ['amostragem', 'entropia'],
};
const en: ExportMeta = { lang: 'en', title: 'Sampling and aliasing', date: '2026-10-01' };

/** A fixture exported from the tree the site's latex stage receives (GFM + SmartyPants + math + directives). */
const exportFixture = async (name: string, meta: ExportMeta) => {
  const markdown = fixture(name);
  return exportLatex(await siteTree(markdown), meta, { source: markdown });
};
const fixtures = {
  pt: await exportFixture('ensaio.md', pt),
  en: await exportFixture('essay.md', en),
};
const exported = (name: 'ensaio.md' | 'essay.md', _meta: ExportMeta) =>
  name === 'ensaio.md' ? fixtures.pt : fixtures.en;

const paragraph = (text: string): Root => ({
  type: 'root',
  children: [{ type: 'paragraph', children: [{ type: 'text', value: text }] }],
});

describe('fixture essays', () => {
  it('pt-BR: matches the snapshot and passes the static compile check', async () => {
    const { tex } = exported('ensaio.md', pt);
    expect(lintDocument(tex)).toEqual([]);
    await expect(tex).toMatchFileSnapshot('./__snapshots__/ensaio.pt-BR.tex');
  });

  it('en: matches the snapshot and passes the static compile check', async () => {
    const { tex } = exported('essay.md', en);
    expect(lintDocument(tex)).toEqual([]);
    await expect(tex).toMatchFileSnapshot('./__snapshots__/essay.en.tex');
  });

  it('reports what print cannot represent, with positions', () => {
    const { warnings } = exported('essay.md', en);
    expect(warnings.map((w) => w.message)).toEqual(['image ./alias.svg: .svg needs conversion to PDF or PNG']);
    expect(warnings[0]?.position?.start.line).toBe(38);
  });
});

describe('preamble', () => {
  const ptTex = exported('ensaio.md', pt).tex;
  const enTex = exported('essay.md', en).tex;

  it('loads babel, csquotes, amsthm, hyperref, graphicx, booktabs and biblatex per language', () => {
    expect(ptTex).toContain('\\usepackage[english,main=brazilian]{babel}');
    expect(enTex).toContain('\\usepackage[brazilian,main=english]{babel}');
    for (const tex of [ptTex, enTex]) {
      for (const pkg of ['csquotes', 'amssymb', 'amsthm', 'graphicx', 'booktabs', 'hyperref', 'mathtools']) {
        expect(tex).toContain(`\\usepackage{${pkg}}`);
      }
      expect(tex).toContain('\\addbibresource{bibliography.bib}');
    }
    expect(ptTex).toContain('\\usepackage[backend=biber,style=abnt]{biblatex}');
    expect(enTex).toContain('\\usepackage[backend=biber,style=apa]{biblatex}');
  });

  it('defines the theorem-like environments with ONE shared counter, catalog names and amsthm styles', () => {
    expect(ptTex).toContain(
      [
        '\\theoremstyle{plain}',
        '\\newtheorem{theorem}{Teorema}',
        '\\newtheorem{lemma}[theorem]{Lema}',
        '\\newtheorem{proposition}[theorem]{Proposição}',
        '\\newtheorem{corollary}[theorem]{Corolário}',
        '\\newtheorem{conjecture}[theorem]{Conjectura}',
        '\\newtheorem{axiom}[theorem]{Axioma}',
        '\\theoremstyle{definition}',
        '\\newtheorem{definition}[theorem]{Definição}',
        '\\newtheorem{example}[theorem]{Exemplo}',
        '\\theoremstyle{remark}',
        '\\newtheorem*{remark}{Observação}',
      ].join('\n'),
    );
    expect(enTex).toContain('\\newtheorem{lemma}[theorem]{Lemma}');
    expect(enTex).toContain('\\newtheorem*{remark}{Remark}');
  });

  it('sets ABNT captions (en dash, above) and the extra float kinds', () => {
    expect(ptTex).toContain('\\DeclareCaptionLabelSeparator{ft}{ – }\n\\captionsetup{labelsep=ft,position=top}');
    expect(ptTex).toContain('name={Gráfico}');
    expect(ptTex).toContain('name={Quadro}');
    expect(enTex).toContain('name={Box}');
  });

  it('takes title, author and date from the metadata, escaped', () => {
    expect(ptTex).toContain(
      '\\title{Amostragem \\& informação: 100\\% \\textquotedbl{}sinal\\textquotedbl{}\\\\[0.5ex]\\large Um ensaio de teste}',
    );
    expect(ptTex).toContain('\\author{Flávio Tinoco}');
    expect(ptTex).toContain('\\date{14 de março de 2026}');
    expect(enTex).toContain('\\date{October 1, 2026}');
    expect(ptTex).toContain(
      '\\begin{abstract}\nResumo com \\$ e \\#.\n\n\\noindent\\textbf{Palavras-chave:} amostragem; entropia.\n\\end{abstract}',
    );
  });

  it('defines the site macros without breaking LaTeX text commands (\\H, \\i, \\d)', () => {
    expect(ptTex).toContain('\\ftmacro{\\H}{0}{\\operatorname{H}}');
    expect(ptTex).toContain('\\ftmacro{\\abs}{1}{\\left\\lvert #1 \\right\\rvert}');
    expect(ptTex).toContain('\\ftmacro{\\KL}{0}{D_{\\mathrm{KL}}\\infdivx}');
  });
});

describe('body', () => {
  const ptTex = exported('ensaio.md', pt).tex;
  const enTex = exported('essay.md', en).tex;

  it('environments: optional title, label, proof of a statement (moved after it, as LaTeX expects)', () => {
    expect(ptTex).toContain('\\begin{definition}[{Entropia}]\\label{def:entropia}');
    expect(ptTex).toContain('\\begin{theorem}[{Nyquist–Shannon}]\\label{thm:amostragem}');
    expect(ptTex).toContain(
      '(compare \\eqref{eq:entropia} e Definição~\\ref{def:entropia}).\n\\end{theorem}\n\n' +
        '\\begin{proof}[{Demonstração do Teorema~\\ref{thm:amostragem}}]\nPela Equação~\\eqref{eq:sinc}, segue o resultado.\n\\end{proof}',
    );
    expect(ptTex).toContain('\\begin{remark}\nUma \\emph{observação}');
    expect(enTex).toContain('\\begin{proof}[{Proof of Theorem~\\ref{thm:sampling}}]');
  });

  it('cross-references: \\ref with the localised name and a tie, \\eqref for equations', () => {
    expect(ptTex).toContain('(compare \\eqref{eq:entropia} e Definição~\\ref{def:entropia})');
    expect(ptTex).toContain('Pela Equação~\\eqref{eq:sinc}, segue o resultado.');
    expect(enTex).toContain('see\n\\eqref{eq:rate} and Figure~\\ref{fig:alias}');
  });

  it('math: inline $…$, labelled displays as equation (\\label kept), unlabelled ones starred', () => {
    expect(ptTex).toContain('A \\textbf{entropia} de uma variável $X$ é');
    expect(ptTex).toContain(
      '\\begin{equation}\n\\H(X) = -\\sum_{x} p(x) \\log_2 p(x) \\label{eq:entropia}\n\\end{equation}',
    );
    expect(enTex).toContain('\\begin{align}\nx(t) &= \\sum_{n} x(nT)');
    expect(enTex).toContain('\\begin{gather*}\n\\text{an unnumbered display}\n\\end{gather*}');
  });

  it('citations: \\parencite / \\textcite / \\parencites with ties in locators', () => {
    expect(ptTex).toContain('A teoria de Shannon \\parencite[{p.~379}]{shannon1948} mede');
    expect(ptTex).toContain('\\parencites[{ver}][{}]{nyquist1928}[{cap.~2}]{kotelnikov1933}');
    expect(ptTex).toContain('a releitura de \\textcite[{p.~12}]{gallager2008}.');
    expect(ptTex).toContain('Já \\parencite*{shannon1949} tratou do ruído.');
    expect(ptTex).toContain('o e-mail \\href{mailto:fulano@exemplo.com}{fulano@exemplo.com} também');
    expect(ptTex).toContain('[@escapado] não é citação');
    expect(enTex).toContain('\\parencites[{p.~11}]{shannon1949}[{see}][{}]{nyquist1928}');
    expect(enTex).toContain('As \\textcite[{ch.~2}]{kotelnikov1933} showed');
  });

  it('figures and tables: float, caption above with label, source as a note', () => {
    expect(ptTex).toContain(
      '\\begin{ftchart}[htbp]\n\\centering\n\\caption{Dobramento espectral}\\label{fig:dobramento}\n' +
        '\\includegraphics[width=\\linewidth,alt={Espectro dobrado em torno de f\\_s/2}]{./dobramento}\n' +
        '\\ftsource{Elaborado pelo autor (2026).}\n\\end{ftchart}',
    );
    expect(ptTex).toContain(
      '\\begin{table}[htbp]\n\\centering\n\\caption{Taxas de amostragem usuais}\\label{tab:taxas}',
    );
    expect(ptTex).toContain('\\begin{tabular}{@{}lcr@{}}\n\\toprule\nSinal & Banda (kHz) & Taxa (kHz) \\\\\n\\midrule');
    expect(ptTex).toContain('\\ftsource{\\parencite{iso80000}}');
    expect(enTex).toContain('\\begin{ftframe}[htbp]');
    expect(enTex).toContain('Oversample 2.5× & margin \\& safety \\\\');
    expect(enTex).toContain('\\ftsource{Adapted from \\parencite{shannon1949}.}');
  });

  it('reading directives: sidenote → \\footnote, stretch → plain paragraph, prose colons kept', () => {
    expect(ptTex).toContain('Uma \\emph{observação} com\\footnote{nota lateral} e');
    expect(ptTex).toContain('Às 10:30 a proporção é 1:2');
    expect(enTex).toContain('% stretch: Why a factor of two?\nBecause a real sinusoid');
    expect(enTex).toContain('unnumbered\\footnote{like in amsthm.} and so are proofs; ratios like 3:2 stay.');
  });

  it('other Markdown: headings, lists, tasks, quotes, footnotes, code, links', () => {
    expect(ptTex).toContain('\\section{Amostragem e informação}\\label{amostragem}\n% attributes: .claim');
    expect(ptTex).toContain('\\item {}[segundo] item com colchete');
    expect(ptTex).toContain('\\item[$\\boxtimes$] tarefa feita');
    expect(ptTex).toContain(
      '\\begin{quote}\nCitação em bloco.\\footnote{Nota de rodapé com \\texttt{código}.}\n\\end{quote}',
    );
    expect(ptTex).toContain('\\begin{ftverbatim}\nconst x = 1; // \\end{verbatim}\n\\end{ftverbatim}');
    expect(ptTex).toContain('\\texttt{R\\$ 5,00 \\& 10\\%}');
    expect(ptTex).toContain('\\tableofcontents');
    expect(ptTex).toContain('\\printbibliography');
    expect(enTex).toContain('\\href{https://example.org/a_b?x=1\\&y=2\\#frag}{link}');
    expect(enTex).toContain('\\url{https://example.org/\\~user}');
    expect(enTex.match(/\\printbibliography/g)).toHaveLength(1);
  });

  it('escapes every LaTeX special character outside math', () => {
    expect(enTex).toContain(
      'Prices such as \\$5 \\& 10\\% off, the path C:\\textbackslash{}temp\\textbackslash{}new and\n50\\_000 samples \\textasciitilde{} 1 s must survive; so must x\\textasciicircum{}2 written as text and a \\#hashtag.',
    );
  });
});

describe('every construct of the authoring language', () => {
  const markdown = [
    '# Título {#topo .claim depends="a,b"}',
    '',
    'Grupo [@a; @b], suprimido [-@a; @b], @naochave e @a.',
    '',
    'Referência de caractere: [@ana &#91;x].',
    '',
    'HTML <kbd>x</kbd>, :marginnote[margem], :concept[entropia]{ref=entropy}, :raw[data], :sc[Versalete],',
    ':foreign[deadline]{lang=en}, :foreign[Zeitgeist]{lang=de}, [ref][def], ![fig][img], nota[^falta],',
    '![remota](https://x.org/a.png) e [rel](docs/a.md).',
    '',
    '[def]: https://x.org/def',
    '[img]: ./img.png',
    '',
    '<div>bloco html</div>',
    '',
    '***',
    '',
    ':::aside',
    'Digressão.',
    ':::',
    '',
    ':::epigraph{source="[@a]"}',
    'Epígrafe.',
    ':::',
    '',
    ':::desconhecido',
    'X.',
    ':::',
    '',
    '::lab{widget=sampling}',
    '',
    '```math',
    '\\begin{align}a &= b\\end{align}',
    '```',
    '',
    '```',
    '\\end{verbatim} \\end{ftverbatim}',
    '```',
    '',
    ':::proof{of="thm:nada"}',
    'P.',
    ':::',
    '',
    ':::figure{kind="foto" title="F"}',
    '![x](x.png)',
    ':::',
    '',
    'Ver :ref[thm:nada].',
  ].join('\n');
  const meta: ExportMeta = { lang: 'pt-BR', title: 'T', macros: { '\\local': 'x^{#1}', bad: 'y' } };
  const { tex, warnings } = exportLatex(parse(markdown), meta, {
    source: markdown,
    citationKeys: new Set(['a', 'b']),
    baseUrl: 'https://site.org/base/',
    bibliography: ['refs.bib'],
  });

  it('exports each construct and stays structurally valid', () => {
    expect(lintDocument(tex)).toEqual([]);
    expect(tex).toContain('\\section{Título}\\label{topo}\n% attributes: .claim depends="a,b"');
    expect(tex).toContain('Grupo \\parencite{a,b}');
    expect(tex).toContain('suprimido \\parencites{a}{b}');
    expect(tex).toContain('Referência de caractere: [@ana [x].');
    expect(tex).toContain('@naochave e \\textcite{a}.');
    expect(tex).toContain('HTML %\n% html: <kbd>\nx%\n% html: </kbd>\n, ');
    expect(tex).toContain('\\marginpar{margem}');
    expect(tex).toContain(', entropia, data, \\textsc{Versalete}');
    expect(tex).toContain('\\foreignlanguage{english}{\\textit{deadline}}, \\ftforeign{de}{Zeitgeist}');
    expect(tex).toContain('\\href{https://x.org/def}{ref}');
    expect(tex).toContain('\\includegraphics[width=\\linewidth,alt={fig}]{./img.png}');
    expect(tex).toContain('nota[\\textasciicircum{}falta]');
    expect(tex).toContain('\\href{https://x.org/a.png}{\\textit{remota}}');
    expect(tex).toContain('\\href{https://site.org/base/docs/a.md}{rel}');
    expect(tex).toContain('% html: <div>bloco html</div>');
    expect(tex).toContain('\\rule{0.382\\linewidth}{0.4pt}');
    expect(tex).toContain('\\begin{quote}\nDigressão.\n\\end{quote}');
    expect(tex).toContain('\\begin{quote}\nEpígrafe.\n\\par\\hfill \\parencite{a}\n\\end{quote}');
    expect(tex).toContain(':::desconhecido\nX.\n:::');
    expect(tex).toContain('% interactive: ::lab{widget=sampling} (web version only)');
    expect(tex).toContain('\\begin{align*}a &= b\\end{align*}');
    expect(tex).toContain('\\begin{ftverbatim2}\n\\end{verbatim} \\end{ftverbatim}\n\\end{ftverbatim2}');
    expect(tex).toContain('\\DefineVerbatimEnvironment{ftverbatim2}{Verbatim}{}');
    expect(tex).not.toContain('\\DefineVerbatimEnvironment{ftverbatim}{');
    expect(tex).toContain('\\begin{proof}\nP.\n\\end{proof}');
    expect(tex).toContain('\\begin{figure}[htbp]\n\\centering\n\\caption{F}');
    expect(tex).toContain('Ver \\ref{thm:nada}.');
    expect(tex).toContain('\\addbibresource{refs.bib}');
    expect(tex).toContain('\\ftmacro{\\local}{1}{x^{#1}}');
    expect(tex).not.toContain('{bad}');
  });

  it('warns about everything print cannot represent faithfully', () => {
    expect(warnings.map((w) => w.message)).toEqual([
      '"[-@a; @b]": author suppression (-@) is not supported inside a multi-citation; author kept',
      'text with character references around "[" or "@": citations in it were left as literal text',
      'remote image https://x.org/a.png is linked, not embedded',
      'unknown container directive ":::desconhecido" exported as literal text',
      ':proof of="thm:nada" names no theorem-like environment; plain proof exported',
      'figure kind "foto" is not one of figure, chart, frame, table; exported as figure',
      ':ref[thm:nada] points to no label of this document; exported as a bare \\ref',
      'macro bad is not a letters-only control word; skipped',
    ]);
  });
});

describe('robustness', () => {
  const meta: ExportMeta = { lang: 'pt-BR', title: 'T' };
  const run = (markdown: string) => exportLatex(parse(markdown), meta, { source: markdown });

  it('never lets an invalid label or citation key reach TeX', () => {
    const { tex, warnings } = run(':::theorem{id="bad#id"}\nT.\n:::\n\nVer :ref[x y] e [@a%b].');
    expect(tex).toContain('\\begin{theorem}\nT.');
    expect(tex).toContain('Ver :ref[x y] e [@a\\%b].');
    expect(lintDocument(tex)).toEqual([]);
    expect(warnings.map((w) => w.message)).toEqual([
      'invalid label "bad#id" on :::theorem (expected prefix:name); \\label omitted',
      ':ref[x y] is not a valid label (expected prefix:name); exported as literal text',
      '"[@a%b]": citation key(s) a%b are not BibTeX keys; kept as text',
    ]);
  });

  it('keeps unknown directives as literal text and bracket-less ones as prose', () => {
    const { tex } = run('Texto :desconhecido[x]{y=1} e nota:ref.\n\n::folha{a=1}');
    expect(tex).toContain('Texto :desconhecido[x]\\{y=1\\} e nota:ref.');
    expect(tex).toContain('::folha\\{a=1\\}');
  });

  it('uses non-linking \\ref* inside a link (a PDF link cannot contain another one)', () => {
    const { tex } = run(
      ':::theorem{#thm:a}\nT.\n:::\n\n$$\nx \\label{eq:a}\n$$\n\n' +
        '[veja :ref[thm:a], :eqref[eq:a] e $$\\eqref{eq:a}$$](https://example.org) e :ref[thm:a].',
    );
    expect(tex).toContain(
      '\\href{https://example.org}{veja Teorema~\\ref*{thm:a}, \\textup{(\\ref*{eq:a})} e $\\textup{(\\ref*{eq:a})}$} ' +
        'e Teorema~\\ref{thm:a}.',
    );
    expect(lintDocument(tex)).toEqual([]);
  });

  it('ends an inline formula with a comment on its own line', () => {
    const { tex } = run('Ver $$x % nota$$ aqui.');
    expect(tex).toContain('$x % nota\n$');
    expect(lintDocument(tex)).toEqual([]);
  });

  it('parses frontmatter into metadata, reporting every problem at once', () => {
    expect(parseExportMeta({ lang: 'en', title: 'T', published: '2026-01-02', keywords: ['a'] })).toEqual({
      ok: true,
      value: { lang: 'en', title: 'T', date: '2026-01-02', keywords: ['a'] },
    });
    const bad = parseExportMeta({ lang: 'fr', title: '', keywords: 'x', macros: { '\\a': 1 } });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error).toHaveLength(4);
  });

  it('is a pure function of its inputs (toLatex = exportLatex(…).tex)', () => {
    const md = fixture('ensaio.md');
    expect(toLatex(parse(md), pt, { source: md })).toBe(exportLatex(parse(md), pt, { source: md }).tex);
  });
});

describe('content LaTeX would lose or reject', () => {
  const meta: ExportMeta = { lang: 'pt-BR', title: 'T' };
  const run = (markdown: string) => exportLatex(parse(markdown), meta, { source: markdown });

  it('the static check flags each placement pdfLaTeX/LuaLaTeX reject or lose (verified with TeX Live 2023)', () => {
    const problems = (tex: string): readonly string[] => lintTex(tex).map((p) => p.message);
    expect(problems('x\\footnote{V:\n\\begin{verbatim}\na\n\\end{verbatim}}')).toEqual([
      'verbatim environment inside the argument of \\footnote',
    ]);
    expect(problems('\\begin{tabular}{ll}\nx\\footnote{n} & 2 \\\\\n\\end{tabular}')).toEqual([
      '\\footnote inside a tabular or float (its text is lost)',
    ]);
    expect(problems('a\\footnote{b \\marginpar{c}}')).toEqual([
      '\\marginpar inside a footnote, tabular or float (not in outer par mode)',
    ]);
    expect(problems('a\\footnote{b\\footnote{c}}')).toEqual(['\\footnote inside a footnote (its text is lost)']);
    expect(problems('\\begin{equation}\n\\begin{align}a&=b\\end{align}\n\\end{equation}')).toEqual([
      'display environment align nested in another display',
    ]);
    expect(problems('\\href{u}{a \\ref{x}} \\href{u}{a \\ref*{x}}')).toEqual([
      '\\ref inside the text of an \\href (nested links)',
    ]);
    expect(problems('a -- b ,, \' ` " c')).toEqual([
      '-- in text mode (a TeX input ligature)',
      ',, in text mode (a TeX input ligature)',
      "bare ' in text mode (it does not print as itself)",
      'bare ` in text mode (it does not print as itself)',
      'bare " in text mode (it does not print as itself)',
    ]);
  });

  it('code in a footnote: saved with SaveVerbatim at the start, typeset with \\UseVerbatim', () => {
    const { tex } = run(
      'Texto com nota.[^1]\n\n[^1]: Veja:\n\n    ```js\n    const x = 1; // \\end{verbatim}\n    ```\n',
    );
    expect(tex).toContain(
      '\\begin{document}\n% Code used inside footnotes (fancyvrb SaveVerbatim: verbatim cannot sit in a command argument).\n' +
        '% language: js\n\\begin{SaveVerbatim}{ftcode1}\nconst x = 1; // \\end{verbatim}\n\\end{SaveVerbatim}\n\\maketitle',
    );
    expect(tex).toContain('Texto com nota.\\footnote{Veja:\n\n\\par\\UseVerbatim{ftcode1}}');
    expect(lintDocument(tex)).toEqual([]);
  });

  it('a note in a table cell or a figure: \\footnotemark in place, \\footnotetext after the tabular/float', () => {
    const table = run('| a | b |\n|---|---|\n| x :sidenote[nota um] | y[^n] |\n\n[^n]: nota dois\n');
    expect(table.tex).toContain('x\\protect\\footnotemark & y\\protect\\footnotemark \\\\');
    expect(table.tex).toContain(
      '\\end{tabular}\n\\end{center}\n\\addtocounter{footnote}{-1}\\footnotetext{nota um}\n\\stepcounter{footnote}\\footnotetext{nota dois}',
    );
    expect(lintDocument(table.tex)).toEqual([]);
    const figure = run(':::figure{#tab:t kind="table" title="T" source="S."}\n| a |\n|---|\n| x :sidenote[n] |\n:::');
    expect(figure.tex).toContain('\\end{table}\n\\footnotetext{n}');
    expect(lintDocument(figure.tex)).toEqual([]);
  });

  it('a margin note inside a footnote, table or figure (or a note in a note) stays in the text, in parentheses', () => {
    const { tex, warnings } = run(
      'Texto :sidenote[com :marginnote[margem] e :sidenote[outra]] fim.\n\n| a |\n|---|\n| x :marginnote[m] |\n',
    );
    expect(tex).toContain('Texto\\footnote{com (margem) e (outra)} fim.');
    expect(tex).toContain('x (m) \\\\');
    expect(warnings.map((w) => w.message)).toEqual([
      ':marginnote inside a footnote cannot be a note in LaTeX; exported in parentheses',
      ':sidenote inside a footnote cannot be a note in LaTeX; exported in parentheses',
      ':marginnote inside a table or figure cannot be a note in LaTeX; exported in parentheses',
    ]);
    expect(lintDocument(tex)).toEqual([]);
  });

  it('a \\label written before an outer environment moves inside it (no equation around align)', () => {
    const { tex } = run('$$\n\\label{eq:a}\n\\begin{align}a &= b\\\\ c &= d\\end{align}\n$$\n\nVer :eqref[eq:a].');
    expect(tex).toContain('\\begin{align}\\label{eq:a}a &= b\\\\ c &= d \\notag\\end{align}');
    expect(tex).not.toContain('\\begin{equation}');
    expect(lintDocument(tex)).toEqual([]);
  });
});

/**
 * amsmath's numbering of a document's displays, as LaTeX would do it, by label: `equation` and
 * `multline` take one number, `align`, `gather`, `flalign` and `alignat` one per row unless the row
 * has \notag/\nonumber; \tag{x} shows x; starred environments take none.
 */
const amsmathNumbers = (tex: string): Readonly<Record<string, string>> => {
  const numbers: Record<string, string> = {};
  let counter = 0;
  for (const m of tex.matchAll(
    /\\begin\{(equation|multline|align|gather|flalign|alignat)(\*?)\}([\s\S]*?)\\end\{\1\2\}/g,
  )) {
    const [, env = '', star = '', body = ''] = m;
    const rows = ['align', 'gather', 'flalign', 'alignat'].includes(env) ? body.split(/\\\\(?![a-zA-Z])/) : [body];
    for (const row of rows) {
      const tag = /\\tag\*?\{([^}]*)\}/.exec(row)?.[1];
      const number = star === '*' || /\\(?:notag|nonumber)\b/.test(row) ? undefined : (tag ?? String((counter += 1)));
      for (const l of row.matchAll(/\\label\{([^}]*)\}/g)) if (number !== undefined) numbers[l[1] ?? ''] = number;
    }
  }
  return numbers;
};

describe('equation numbers: the site and the .tex agree (ABNT NBR 14724 §5.7: only labelled displays)', () => {
  const documents = [
    '$$\n\\begin{align} a &= b \\label{eq:a}\\\\ c &= d \\end{align}\n$$\n\n$$\ne = f \\label{eq:b}\n$$\n\n:eqref[eq:b] :eqref[eq:a]',
    '$$\n\\label{eq:a}\n\\begin{gather} a \\\\ b \\\\ c \\end{gather}\n$$\n\n$$\n\\begin{align*} x &= y \\label{eq:b} \\end{align*}\n$$\n\n$$\n\\begin{align} p \\\\ q \\end{align}\n$$\n\n$$\nz \\tag{A} \\label{eq:c}\n$$\n\n$$\nw \\label{eq:d}\n$$',
    '$$\n\\begin{alignat}{2} a &= b &\\quad c &= d \\label{eq:a} \\\\ e &= f & g &= h \\end{alignat}\n$$\n\n$$\n\\begin{gather} a \\\\ b \\label{eq:b} \\end{gather}\n$$\n\n$$\n\\begin{equation} c \\label{eq:c} \\end{equation}\n$$',
  ];

  it.each(documents.map((d, i) => [i, d] as const))('document %i', async (_, markdown) => {
    const { frontmatter } = await site(markdown);
    const siteNumbers = Object.fromEntries(
      (frontmatter['crossrefs'] as readonly { label: string; number: string }[]).map((c) => [c.label, c.number]),
    );
    const { tex } = exportLatex(await siteTree(markdown), { lang: 'pt-BR', title: 'T' }, { source: markdown });
    expect(amsmathNumbers(tex)).toEqual(siteNumbers);
    expect(lintDocument(tex)).toEqual([]);
  });
});

describe('punctuation: the PDF prints what the site shows', () => {
  const meta: ExportMeta = { lang: 'pt-BR', title: 'T' };
  const body = (tex: string): string => {
    const { body: b } = split(tex);
    return b.slice(b.indexOf('\\maketitle\n\n') + '\\maketitle\n\n'.length, b.lastIndexOf('\n\n\\end{document}'));
  };
  const word = fc.constantFrom('Nyquist', 'água', 'd', 's', '80s', 'e', 'cf');
  const mark = fc.constantFrom(' ', ' ', '"', "'", '--', '---', '----', '...', ',,', ',', '.', '-', '(', ')', '?');
  const prose = fc
    .array(fc.oneof(word, mark), { minLength: 1, maxLength: 16 })
    .map((parts) => `Texto ${parts.join('')} fim.`);

  test.prop([prose], { numRuns: 150 })(
    'every character of the site text reaches the PDF unchanged (no ligature, no quote reinterpreted)',
    async (markdown) => {
      const tex = toLatex(await siteTree(markdown), meta, { source: markdown });
      // The static check proves TeX prints each escaped character as itself…
      expect(lintTex(body(tex))).toEqual([]);
      // …so the PDF text is the unescaped source, which must be the text the site shows.
      const shown = (await site(markdown)).html
        .replace(/<[^>]*>/g, '')
        .replace(/&#x22;/g, '"')
        .replace(/&#x26;/g, '&')
        .trim();
      expect(unescapeTex(body(tex))).toBe(shown);
    },
  );

  it('attributes get the same punctuation as the body, on the site and in the .tex', async () => {
    const markdown =
      ':::theorem{#thm:a title="Nyquist--Shannon\'s"}\n"Aspas" -- e d\'água.\n:::\n\n' +
      ':::figure{#fig:f title="O \'dobramento\'..." source="Autor\'s -- 2026"}\n![x](x.png)\n:::';
    const { tex } = exportLatex(await siteTree(markdown), meta, { source: markdown });
    expect(tex).toContain('\\begin{theorem}[{Nyquist—Shannon’s}]');
    expect(tex).toContain('“Aspas” — e d’água.');
    expect(tex).toContain('\\caption{O ‘dobramento’…}');
    expect(tex).toContain('\\ftsource{Autor’s — 2026}');
  });
});

/** Whether KaTeX accepts every formula of the document — i.e. whether the SITE would build it. */
const katexAccepts = (tree: Root): boolean => {
  const formulas: { readonly tex: string; readonly display: boolean }[] = [];
  const walk = (node: Nodes): void => {
    if (node.type === 'math' || (node.type === 'code' && node.lang === 'math'))
      formulas.push({ tex: node.value, display: true });
    if (node.type === 'inlineMath') formulas.push({ tex: node.value, display: false });
    if ('children' in node) for (const child of node.children as readonly Nodes[]) walk(child);
  };
  walk(tree);
  return formulas.every(({ tex, display }) => {
    try {
      katex.renderToString(tex, { displayMode: display, throwOnError: true, macros: { ...MACROS } });
      return true;
    } catch {
      return false;
    }
  });
};

describe('properties', () => {
  const meta: ExportMeta = { lang: 'en', title: 'T' };
  const textBody = (tex: string): string => {
    const { body } = split(tex);
    return body.slice(
      body.indexOf('\\maketitle\n\n') + '\\maketitle\n\n'.length,
      body.lastIndexOf('\n\n\\end{document}'),
    );
  };

  test.prop([fc.string({ minLength: 1, maxLength: 200 })], { numRuns: 500 })(
    'text is exported injectively and never leaves a special character unescaped',
    (text) => {
      fc.pre(!/[[@]/.test(text) && text.trim() !== '' && !text.startsWith('['));
      const tex = toLatex(paragraph(text), meta);
      expect(lintTex(textBody(tex))).toEqual([]);
      expect(unescapeTex(textBody(tex))).toBe(text);
    },
  );

  test.prop(
    [
      fc.array(
        fc.constantFrom(
          'a',
          ' ',
          '\n',
          '\n\n',
          '#',
          '$',
          '$$',
          '%',
          '&',
          '_',
          '^',
          '~',
          '\\',
          '{',
          '}',
          '*',
          '`',
          ':',
          '[',
          ']',
          '@k',
          '-',
          '|',
          '>',
          '1.',
        ),
        { maxLength: 40 },
      ),
    ],
    {
      numRuns: 500,
    },
  )(
    'any Markdown the site accepts, in the alphabet of the specials, exports to a structurally valid document',
    (parts) => {
      const markdown = parts.join('');
      const tree = parse(markdown);
      fc.pre(katexAccepts(tree));
      const tex = toLatex(tree, meta, { source: markdown });
      expect(lintDocument(tex)).toEqual([]);
    },
  );

  it('escapeTex is the identity on text without specials', () => {
    expect(escapeTex('Nyquist–Shannon, 2.5× — ok')).toBe('Nyquist–Shannon, 2.5× — ok');
  });
});
