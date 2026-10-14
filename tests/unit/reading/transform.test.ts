import { describe, expect, it } from 'vitest';
import { fixture, parse, render } from './helpers.ts';
import { transformReading, type ReadingContext } from '../../../src/core/reading/transform.ts';
import { childrenOf, type MdNode } from '../../../src/core/fold/tree.ts';
import { EPIGRAPH_SOURCE, HEADING_RECORD, PAGE_IDS } from '../../../src/core/reading/records.ts';

const ctx = (source: string, locale: ReadingContext['locale'] = 'pt-BR'): ReadingContext => ({
  locale,
  source,
  reservedIds: PAGE_IDS,
});
const transform = (md: string, locale: ReadingContext['locale'] = 'pt-BR') =>
  transformReading(parse(md), ctx(md, locale));
const errors = (md: string): readonly string[] =>
  transform(md)
    .diagnostics.filter((d) => d.severity === 'error')
    .map((d) => `${d.rule} ${d.message}`);
const find = (node: MdNode, pred: (n: MdNode) => boolean): MdNode | undefined => {
  if (pred(node)) return node;
  for (const c of childrenOf(node)) {
    const hit = find(c, pred);
    if (hit !== undefined) return hit;
  }
  return undefined;
};

describe('stretchtext (:::stretch)', () => {
  it('becomes <details class="stretch"> whose summary is the label', async () => {
    const { html } = await render(':::stretch{label="Por que logaritmo?"}\nPorque somas.\n:::');
    expect(html).toBe(
      '<details class="stretch" data-label="Por que logaritmo?"><summary class="stretch__label">Por que logaritmo?</summary>' +
        '<div class="stretch__body"><p>Porque somas.</p></div></details>',
    );
  });
  it('accepts the label as directive [label] (with inline markup)', async () => {
    const { html } = await render(':::stretch[Por que *log*?]\nPorque somas.\n:::');
    expect(html).toContain('<summary class="stretch__label">Por que <em>log</em>?</summary>');
  });
  it('requires exactly one label', () => {
    expect(errors(':::stretch\nTexto.\n:::')).toEqual([expect.stringMatching(/^reading:missing-label/)]);
    expect(errors(':::stretch[A]{label="B"}\nTexto.\n:::')).toEqual([
      expect.stringMatching(/^reading:ambiguous-label/),
    ]);
  });
});

describe('side and margin notes', () => {
  it('numbers sidenotes in order, linking the mark to the note', async () => {
    const { html } = await render('Um:sidenote[primeira] e dois:sidenote[segunda *nota*].');
    expect(html).toContain(
      '<span class="sidenote" data-sidenote="1" style="--anchor:--sn-1"><sup class="sidenote__ref" id="sn-ref-1">' +
        '<a href="#sn-1" class="sidenote__link" aria-label="Nota lateral 1">1</a></sup>' +
        '<span class="sidenote__note" id="sn-1" role="note"><span class="sidenote__num" aria-hidden="true">1</span>primeira</span></span>',
    );
    expect(html).toContain('id="sn-2"');
    expect(html).toContain('segunda <em>nota</em>');
  });
  it('localises the accessible name of the mark', async () => {
    expect((await render('A:sidenote[b].', 'en')).html).toContain('aria-label="Side note 1"');
  });
  it('renders unnumbered margin notes with an anchor for the margin column', async () => {
    const { html } = await render('Texto :marginnote[à margem].');
    expect(html).toContain(
      '<span class="marginnote" data-marginnote="1" data-label="Nota de margem" style="--anchor:--mn-1">' +
        '<span class="marginnote__anchor" aria-hidden="true"></span><span class="marginnote__note" id="mn-1" role="note">à margem</span></span>',
    );
  });
  it('rejects notes in headings, links, other notes, and empty notes', () => {
    expect(errors('## Título:sidenote[x]')).toEqual([expect.stringMatching(/note-placement.*heading/)]);
    expect(errors('[link :sidenote[x]](https://a.b)')).toEqual([expect.stringMatching(/note-placement.*link/)]);
    expect(errors('a:sidenote[b:marginnote[c]]')).toEqual([expect.stringMatching(/note-placement.*another note/)]);
    expect(errors('a:sidenote[]')).toEqual([expect.stringMatching(/empty-note/)]);
    expect(errors('a:sidenote[b]{.x}')).toEqual([expect.stringMatching(/unknown-attribute/)]);
  });
});

describe('scrollytelling (::::scrolly + :::step)', () => {
  const md =
    '::::scrolly{label="Canal"}\n![Canal](./c.svg)\n\n:::step{state="a"}\nUm.\n:::\n\n:::step{state="b"}\nDois.\n:::\n::::';
  it('becomes <ft-scrolly> with the first image as sticky figure and indexed steps', async () => {
    const { html } = await render(md);
    expect(html).toBe(
      '<ft-scrolly class="scrolly" data-steps="2" role="group" aria-label="Canal"><div class="scrolly__figure"><p><img src="./c.svg" alt="Canal"></p></div>' +
        '<div class="scrolly__steps"><div class="scrolly__step" data-index="0" data-state="a"><p>Um.</p></div>' +
        '<div class="scrolly__step" data-index="1" data-state="b"><p>Dois.</p></div></div></ft-scrolly>',
    );
  });
  it('takes a ::lab as figure and leaves it for the embeds stage', () => {
    const r = transform('::::scrolly\n::lab{widget=sampling}\n\n:::step\nUm.\n:::\n::::');
    expect(r.diagnostics).toEqual([]);
    const figure = find(r.tree, (n) => n.data?.hProperties?.['className']?.toString() === 'scrolly__figure');
    expect(childrenOf(figure ?? { type: 'x' })[0]).toMatchObject({ type: 'leafDirective', name: 'lab' });
    expect(childrenOf(figure ?? { type: 'x' })[0]?.data?.hName).toBeUndefined();
  });
  it('rejects steps outside a scrolly and foreign content inside one', () => {
    expect(errors(':::step\nUm.\n:::')).toEqual([expect.stringMatching(/misplaced-directive/)]);
    expect(errors('::::scrolly\n:::step\nUm.\n:::\n\nSolto.\n::::')).toEqual([
      expect.stringMatching(/scrolly-content/),
    ]);
    expect(errors('::::scrolly\n![x](y.png)\n::::')).toEqual([expect.stringMatching(/needs at least one :::step/)]);
  });
  it('warns (only) when there is no figure', () => {
    const r = transform('::::scrolly\n:::step\nUm.\n:::\n::::');
    expect(r.diagnostics.map((d) => [d.severity, d.rule])).toEqual([['warning', 'reading:scrolly-figure']]);
  });
});

describe('horizontal passages (::::horizontal + :::panel)', () => {
  it('becomes <ft-horizontal> around a labelled, focusable scroll region of panels', async () => {
    const { html } = await render(
      '::::horizontal{label="Leituras"}\n:::panel{label="A"}\nUm.\n:::\n\n:::panel\nDois.\n:::\n::::',
    );
    expect(html).toBe(
      '<ft-horizontal class="horizontal" data-panels="2" style="--panels:2"><div class="horizontal__viewport" role="region" aria-label="Leituras" tabindex="0">' +
        '<div class="horizontal__track"><div class="horizontal__panel" role="group" aria-label="A (Painel 1 de 2)" data-index="0"><p>Um.</p></div>' +
        '<div class="horizontal__panel" role="group" aria-label="Painel 2 de 2" data-index="1"><p>Dois.</p></div></div></div>' +
        '<p class="horizontal__hint" aria-hidden="true">Deslize para o lado: 2 painéis</p></ft-horizontal>',
    );
  });
  it('requires a label and panels only', () => {
    expect(errors('::::horizontal\n:::panel\nUm.\n:::\n\n:::panel\nDois.\n:::\n::::')).toEqual([
      expect.stringMatching(/missing-label/),
    ]);
    expect(errors('::::horizontal{label="x"}\nSolto.\n::::')).toEqual([
      expect.stringMatching(/only :::panel/),
      expect.stringMatching(/at least one :::panel/),
    ]);
    expect(errors(':::panel\nUm.\n:::')).toEqual([expect.stringMatching(/misplaced-directive/)]);
  });
});

describe('epigraph and aside', () => {
  it('renders the epigraph as a figure: blockquote (with lang) + figcaption source', async () => {
    const { html } = await render(':::epigraph{source="Plutarco" lang=la}\nNavigare necesse est.\n:::');
    expect(html).toBe(
      '<figure class="epigraph" data-source="Plutarco"><blockquote class="epigraph__quote" lang="la"><p>Navigare necesse est.</p></blockquote>' +
        '<figcaption class="epigraph__source">Plutarco</figcaption></figure>',
    );
  });
  it('takes the [label] as source, keeping its inline markup', async () => {
    const { html } = await render(':::epigraph[Pessoa, *Mensagem*]\nTudo vale a pena.\n:::');
    expect(html).toContain('<figcaption class="epigraph__source">Pessoa, <em>Mensagem</em></figcaption>');
  });
  it('preserves a source node the citations stage already produced', () => {
    const tree = parse(':::epigraph{source="@pessoa1934"}\nTudo vale a pena.\n\nCITAÇÃO\n:::');
    // Simulate the citations stage: it flagged the rendered citation paragraph.
    const container = childrenOf(tree)[0] as MdNode;
    const cited: MdNode = {
      ...container,
      children: childrenOf(container).map((c, i) => (i === 1 ? { ...c, data: { [EPIGRAPH_SOURCE]: true } } : c)),
    };
    const r = transformReading({ ...tree, children: [cited] }, ctx(''));
    expect(r.diagnostics).toEqual([]);
    const caption = find(r.tree, (n) => n.data?.hName === 'figcaption');
    // The flagged paragraph is unwrapped into the caption, its content untouched.
    expect(childrenOf(caption ?? { type: 'x' })).toMatchObject([{ type: 'text', value: 'CITAÇÃO' }]);
  });
  it('rejects unknown attributes and malformed languages', () => {
    expect(errors(':::epigraph{autor="x"}\nY.\n:::')).toEqual([
      expect.stringMatching(/does not take the attribute "autor"/),
    ]);
    expect(errors(':::epigraph{lang="não"}\nY.\n:::')).toEqual([expect.stringMatching(/BCP 47/)]);
  });
  it('renders :::aside as <aside> named by its label', async () => {
    expect((await render(':::aside{label="Digressão"}\nTexto.\n:::')).html).toBe(
      '<aside class="aside" aria-label="Digressão"><p class="aside__title">Digressão</p><p>Texto.</p></aside>',
    );
  });
});

describe('::toc', () => {
  it('builds a nested, localised table of contents from the headings in the main flow', async () => {
    const md =
      '::toc\n\n## Um\n\n### Um ponto um\n\n## Dois\n\n:::stretch{label="x"}\n## Escondido\n:::\n\n#### Fundo demais';
    const { html } = await render(md);
    expect(html).toContain(
      '<nav class="toc" id="toc" aria-labelledby="toc-title"><p class="toc__title" id="toc-title">Sumário</p><div class="toc__body"><ol class="toc__list" role="list">' +
        '<li class="toc__item"><a href="#um" class="toc__link">Um</a><ol class="toc__list" role="list"><li class="toc__item"><a href="#um-ponto-um" class="toc__link">Um ponto um</a></li></ol></li>' +
        '<li class="toc__item"><a href="#dois" class="toc__link">Dois</a></li></ol></div></nav>',
    );
    expect((await render('::toc\n\n## A', 'en')).html).toContain('>Contents</p>');
  });
  it('accepts a depth and a custom title, and only one ::toc', async () => {
    const { html } = await render('::toc[Roteiro]{depth=4}\n\n## A\n\n### B\n\n#### C');
    expect(html).toContain('>Roteiro</p>');
    expect(html).toContain('href="#c"');
    expect(errors('::toc\n\n::toc')).toEqual([expect.stringMatching(/toc-duplicate/)]);
    expect(errors('::toc{depth=9}')).toEqual([expect.stringMatching(/from 2 to 6/)]);
  });
});

describe('heading attributes and the argument graph', () => {
  it('sets the id and kind, removes the block from the title and keeps it in data-attrs', async () => {
    const { html } = await render('## Tese central {#tese .claim}');
    expect(html).toContain(
      '<h2 id="tese" class="arg__title" data-kind="claim" data-attrs="{#tese .claim}">Tese central</h2>',
    );
    expect(html).toContain('<hgroup class="arg arg--claim" data-kind="claim"><p class="arg__kind">');
    expect(html).toContain('</svg></span>Tese</p>');
  });
  it('links each dependency by title (non-linear navigation)', async () => {
    const { html } = await render(
      '## Def {#d .definition}\n\n## Pre {#p .premise}\n\n## Tese {#t .claim depends="d, p"}',
      'en',
    );
    expect(html).toContain(
      '<p class="arg__deps"><span class="arg__deps-label">Rests on</span> <a href="#d" class="arg__dep">Def</a> and <a href="#p" class="arg__dep">Pre</a></p>',
    );
  });
  it('supports ids with colons, which remark-directive splits into directive nodes', () => {
    const r = transform('## Entropia {#def:entropia .definition}\n\n## Tese {#tese .claim depends="def:entropia"}');
    expect(r.diagnostics).toEqual([]);
    expect(r.graph.edges).toEqual([{ from: 'def:entropia', to: 'tese' }]);
  });
  it('gives plain headings github-compatible slugs, avoiding the page ids', async () => {
    const { html } = await render('## Introdução\n\n## Introdução\n\n## Content');
    expect(html).toContain('<h2 id="introdução">');
    expect(html).toContain('<h2 id="introdução-1">');
    expect(html).toContain('<h2 id="content-1">');
  });
  it('leaves headings that end with braces that are not attributes untouched', async () => {
    const { html } = await render('## O conjunto {1, 2}\n\n## Escapado \\{.claim}\n\n## Fórmula $$\\{x\\}$$');
    expect(html).toContain('<h2 id="o-conjunto-1-2">O conjunto {1, 2}</h2>');
    expect(html).toContain('>Escapado {.claim}</h2>');
    expect(html).not.toContain('data-kind');
  });
  it('fails on unknown kinds, missing or kind-less dependencies, cycles and duplicate ids', () => {
    expect(errors('## A {.tese}')).toEqual([expect.stringMatching(/unknown-kind.*"\.tese"/)]);
    expect(errors('## A {#a .claim depends="b"}')).toEqual([expect.stringMatching(/missing-dependency.*"b"/)]);
    expect(errors('## B {#b}\n\n## A {#a .claim depends="b"}')).toEqual([
      expect.stringMatching(/without an argument kind/),
    ]);
    expect(errors('## A {#a .claim depends="b"}\n\n## B {#b .premise depends="a"}')).toEqual([
      expect.stringMatching(/circular-dependency.*a → b → a/),
    ]);
    expect(errors('## A {#x}\n\n## B {#x}')).toEqual([expect.stringMatching(/duplicate-id/)]);
    expect(errors('## A {#content}')).toEqual([expect.stringMatching(/duplicate-id/)]);
    expect(errors('## A {#a depends="b"}')).toEqual([expect.stringMatching(/needs an argument kind/)]);
    expect(errors('## A {#a .claim .premise}')).toEqual([expect.stringMatching(/one argument kind/)]);
    expect(errors('## A {#a key=v}')).toEqual([expect.stringMatching(/unknown heading attribute "key"/)]);
  });
  it('rejects documents whose stage reports errors, listing every one', async () => {
    await expect(render('## A {.tese}\n\n:::stretch\nx\n:::')).rejects.toThrow(
      /2 error\(s\) in the reading stage[\s\S]*tese[\s\S]*label/,
    );
  });
  it('fails when the document language is missing', async () => {
    await expect(render('Texto.', 'xx' as 'en')).rejects.toThrow(/lang: pt-BR \| en/);
  });
});

describe('laws of the transform', () => {
  const md = fixture('ensaio.md');
  it('is idempotent and never mutates its input', () => {
    const tree = parse(md);
    const snapshot = structuredClone(tree);
    const once = transformReading(tree, ctx(md));
    expect(tree).toEqual(snapshot);
    const twice = transformReading(once.tree, ctx(md));
    expect(twice.tree).toEqual(once.tree);
    expect(twice.diagnostics).toEqual([]);
  });
  it('records every processed heading for the later stages', () => {
    const r = transformReading(parse(md), ctx(md));
    const recorded: unknown[] = [];
    const go = (n: MdNode): void => {
      if (n.type === 'heading') recorded.push(n.data?.[HEADING_RECORD]);
      childrenOf(n).forEach(go);
    };
    go(r.tree);
    expect(recorded).toHaveLength(6);
    expect(r.graph.nodes.map((n) => n.kind)).toEqual([
      'question',
      'definition',
      'premise',
      'claim',
      'objection',
      'reply',
    ]);
  });
});
