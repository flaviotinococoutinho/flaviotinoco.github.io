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
import { fixture, parse } from './helpers.ts';
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

const exported = (name: string, meta: ExportMeta) => {
  const markdown = fixture(name);
  return exportLatex(parse(markdown), meta, { source: markdown });
};

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
    expect(ptTex).toContain('\\author{Flavio Tinoco}');
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
    'HTML <kbd>x</kbd>, :marginnote[margem], :concept[entropia]{id=entropy}, :raw[data], :sc[Versalete],',
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
