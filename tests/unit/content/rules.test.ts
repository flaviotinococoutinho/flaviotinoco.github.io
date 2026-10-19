/**
 * The corpus rules must not pass vacuously: each rule is shown to fire on a
 * small fixture written to break it, and a well-formed fixture passes clean.
 */
import { describe, expect, it } from 'vitest';
import { parseDoc } from './corpus.ts';
import { checkDocument } from './rules.ts';

const frontmatter = (slug: string): string =>
  `---\ntitle: Fixture\nlang: pt-BR\ntranslationKey: ${slug}\nslug: ${slug}\n---\n`;

const essay = (slug: string, body: string) =>
  parseDoc(`fixtures/${slug}.md`, 'essays', 'pt', `${frontmatter(slug)}${body}`);

const target = essay('alvo', 'Texto.');
const corpus = [target];
const problems = (body: string): string[] => checkDocument(essay('teste', body), [...corpus, essay('teste', body)]);

describe('checkDocument', () => {
  it('accepts a well-formed document that uses the whole language', () => {
    const body = [
      ':::epigraph{source="@shannon1948 [p. 379]"}',
      '“Citação.”',
      ':::',
      '',
      '## Pergunta {#pergunta .question}',
      '',
      'Às 10:30, na razão 7:1, segundo a NBR 10520:2023, custa R$ 5,00 e \\$3. Ver :concept[entropia]{id=entropy} [@shannon1948, p. 379; @weaver1949] e @cover2006 [cap. 5].',
      '',
      ':::definition{#def:x title="X"}',
      '$$',
      'H = -\\sum p \\log_2 p',
      '\\label{eq:h}',
      '$$',
      ':::',
      '',
      '## Resposta {#resposta .claim depends="pergunta"}',
      '',
      'Pela :eqref[eq:h] e pela :ref[def:x], ver [o alvo](../alvo/).:sidenote[Nota com $$x$$.]',
      '',
      '::::scrolly',
      '::lab{widget=sampling}',
      '',
      ':::step{state="fs=6000"}',
      'Passo.',
      ':::',
      '::::',
      '',
      '::bibliography',
    ].join('\n');
    expect(problems(body)).toEqual([]);
  });

  it.each([
    ['unknown block directive', ':::teorema\nx\n:::', /unknown containerDirective "teorema"/u],
    ['bracketed unknown text directive', 'Ver :cite[x].', /unknown textDirective "cite"/u],
    ['citation key outside the bibliography', 'Como [@fulano2020, p. 3].', /unknown citation key "@fulano2020"/u],
    ['concept id outside the ontology', ':concept[x]{id=nada}', /concept id "nada"/u],
    ['undefined cross-reference', 'Ver :ref[thm:nenhum].', /ref target "thm:nenhum" is not defined/u],
    ['eqref to a non-equation', ':::theorem{#thm:a title="A"}\nx\n:::\n\n:eqref[thm:a]', /not an equation label/u],
    ['label in inline math', 'Texto $$x \\label{eq:x}$$.', /in inline math/u],
    ['single-dollar math', 'Seja $x$ real.', /single "\$"/u],
    ['math KaTeX cannot render', '$$\\frac{1}$$', /KaTeX rejects/u],
    ['unknown argument kind', '## T {#t .tese}', /unknown argument kind/u],
    ['dependency on a missing heading', '## T {#t .claim depends="u"}', /depends on unknown heading id "u"/u],
    ['duplicate heading id', '## A {#a .claim}\n\n## B {#a .claim}', /duplicate heading id "a"/u],
    ['step outside a scrolly', ':::step{state="x"}\ny\n:::', /outside ::::scrolly/u],
    ['lab widget outside the list', '::lab{widget=fft}', /unknown lab widget "fft"/u],
    ['broken relative link', '[x](../nao-existe/)', /points to no pt essay "nao-existe"/u],
    ['link to a wrongly localised section', '[x](../../essays/alvo/)', /which is no route/u],
    ['environment without a label', ':::theorem\nx\n:::', /without #label/u],
    ['text directive whose label did not parse', 'Ver :sidenote[nota [aberta.', /:sidenote needs a \[label\]/u],
  ])('reports %s', (_name, body, expected) => {
    expect(problems(body).join('\n')).toMatch(expected);
  });
});
