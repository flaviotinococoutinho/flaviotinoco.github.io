/**
 * The "abnt" remark stage through a real unified pipeline (remark-parse +
 * remark-math + remark-directive, as in src/adapters/unified/pipeline.ts),
 * with the fixture lexicon of tests/fixtures/lexicon.
 */
import { describe, expect, it } from 'vitest';
import { fc, test } from '@fast-check/vitest';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkMath from 'remark-math';
import remarkDirective from 'remark-directive';
import remarkRehype from 'remark-rehype';
import rehypeStringify from 'rehype-stringify';
import { toString } from 'mdast-util-to-string';
import type { Root } from 'mdast';
import { VFile } from 'vfile';
import { remarkAbnt, type LexiconStats } from '../../../src/adapters/unified/remark-abnt.ts';
import { remarkIntegrity } from '../../../src/adapters/unified/remark-integrity.ts';
import { createLexiconRuntime } from '../../../src/adapters/unified/load-lexicon.ts';
import type { PipelineContext } from '../../../src/adapters/unified/context.ts';
import { loadFixtureLexicon } from '../lexicon/helpers.ts';

const lexicon = createLexiconRuntime(loadFixtureLexicon());
const context = { base: '/', lexicon } as Partial<PipelineContext> as PipelineContext;
type Frontmatter = Record<string, unknown>;

const vfile = (md: string, frontmatter: Frontmatter = { lang: 'pt-BR' }): VFile =>
  new VFile({ value: md, data: { astro: { frontmatter } } });

const parse = (md: string): Root =>
  unified().use(remarkParse).use(remarkMath, { singleDollarTextMath: false }).use(remarkDirective).parse(md);

const transform = (tree: Root, file: VFile): Root => {
  const t = remarkAbnt({ context });
  t(tree, file);
  return tree;
};

const run = (md: string, frontmatter?: Frontmatter): { readonly tree: Root; readonly file: VFile } => {
  const file = vfile(md, frontmatter);
  const tree = unified()
    .use(remarkParse)
    .use(remarkMath, { singleDollarTextMath: false })
    .use(remarkDirective)
    .runSync(parse(md), file) as Root;
  return { tree: transform(tree, file), file };
};

const html = (md: string, frontmatter?: Frontmatter): string =>
  String(
    unified()
      .use(remarkParse)
      .use(remarkMath, { singleDollarTextMath: false })
      .use(remarkDirective)
      .use(remarkAbnt, { context })
      .use(remarkIntegrity, { context })
      .use(remarkRehype, { allowDangerousHtml: true })
      .use(rehypeStringify, { allowDangerousHtml: true })
      .processSync(vfile(md, frontmatter)),
  ).trim();

const rules = (file: VFile): readonly string[] => file.messages.map((m) => `${m.source ?? ''}:${m.ruleId ?? ''}`);

describe('remark-abnt: automatic marking', () => {
  it('marks foreign terms, Latin locutions, names, acronyms and non-breaking groups', () => {
    expect(html('O software de C. E. Shannon usa a FFT a 10 kHz (p. 12), a priori.')).toBe(
      '<p>O <i lang="en" class="foreign">software</i> de <span class="nowrap">C. E. <span class="proper-name" translate="no">Shannon</span></span> usa a <abbr class="acronym" title="transformada rápida de Fourier">FFT</abbr> a <span class="nowrap">10 kHz</span> (<span class="nowrap">p. 12</span>), <i lang="la" class="locution">a priori</i>.</p>',
    );
  });

  it('never touches code, inline code, math, raw HTML, link URLs or image alt text; processes link text', () => {
    const out = html(
      '`software` $$software$$ [o software](https://software.example/software) ![software](x.png) <i lang="de">Zeitgeist</i>\n\n```\nsoftware\n```',
    );
    expect(out).toContain('<code>software</code>');
    expect(out).toContain('<code class="language-math math-inline">software</code>');
    expect(out).toContain(
      '<a href="https://software.example/software">o <i lang="en" class="foreign">software</i></a>',
    );
    expect(out).toContain('<img src="x.png" alt="software">');
    expect(out).toContain('<i lang="de">Zeitgeist</i>');
    expect(out).toContain('<pre><code>software\n</code></pre>');
  });

  it('is language-aware: "software" is not foreign in English, "saudade" is', () => {
    expect(html('The software and the saudade.', { lang: 'en' })).toBe(
      '<p>The software and the <i lang="pt-BR" class="foreign">saudade</i>.</p>',
    );
    expect(html('O software e a saudade.')).toBe('<p>O <i lang="en" class="foreign">software</i> e a saudade.</p>');
  });

  it('keeps phrases with whitespace runs, prefers the longest term and leaves homographs unmarked', () => {
    expect(html('big\ndata e a data')).toBe('<p><i lang="en" class="foreign">big\ndata</i> e a data</p>');
  });

  it('titles of works get <cite> and, when in another language, lang', () => {
    expect(html('O Tractatus Logico-Philosophicus e as Investigações Filosóficas.')).toBe(
      '<p>O <cite class="proper-name work" translate="no" lang="la">Tractatus Logico-Philosophicus</cite> e as <cite class="proper-name work" translate="no">Investigações Filosóficas</cite>.</p>',
    );
  });

  it('matches on an NFC copy but keeps the author’s original code points', () => {
    const md = 'the lo\u0301gos and the cafe\u0301 software';
    const { tree } = run(md, { lang: 'en' });
    expect(toString(tree)).toBe(md);
    expect(html(md, { lang: 'en' })).toContain('<i lang="grc-Latn" class="foreign">lo\u0301gos</i>');
  });
});

describe('remark-abnt: explicit directives and precedence', () => {
  it('claims :foreign, :name, :abbr, :raw, :sc and :nowrap; marks nothing inside them', () => {
    expect(
      html(
        ':foreign[Sinn]{lang=de} :name[Robert May] :abbr[CPU] :abbr[XYZ]{title="Algo"} :raw[software] :sc[abnt] :nowrap[10 x]',
      ),
    ).toBe(
      '<p><i lang="de" class="foreign">Sinn</i> <span class="proper-name" translate="no">Robert May</span> <abbr class="acronym" title="unidade central de processamento">CPU</abbr> <abbr class="acronym" title="Algo">XYZ</abbr> <span>software</span> <span class="sc">abnt</span> <span class="nowrap">10 x</span></p>',
    );
    expect(html(':foreign[ad hoc]{lang=la}')).toBe('<p><i lang="la" class="locution">ad hoc</i></p>');
  });

  it('fails the build on :foreign without a valid language tag (WCAG 3.1.2)', () => {
    expect(() => html(':foreign[Zeitgeist]')).toThrow(/lang/u);
    expect(() => html(':foreign[Zeitgeist]{lang=ger}')).toThrow(/ger/u);
  });

  it('frontmatter lexicon.ignore / lexicon.foreign override the dictionary', () => {
    const fm = { lang: 'pt-BR', lexicon: { ignore: ['software'], foreign: [{ term: 'bricolage', lang: 'fr' }] } };
    expect(html('O software e a bricolage.', fm)).toBe(
      '<p>O software e a <i lang="fr" class="foreign">bricolage</i>.</p>',
    );
  });

  it('warns instead of guessing: unknown attributes, :abbr without title, invalid frontmatter, missing lang', () => {
    expect(rules(run(':sc[x]{class=y} :abbr[XYZ]').file)).toEqual(['abnt:directive', 'abnt:directive']);
    expect(rules(run('x', { lang: 'pt-BR', lexicon: { ignore: 'software' } }).file)).toEqual(['abnt:frontmatter']);
    const noLang = run('O software.', {});
    expect(rules(noLang.file)).toEqual(['abnt:no-lang']);
    expect(toString(noLang.tree)).toBe('O software.');
  });
});

describe('remark-abnt: lint and stats', () => {
  it('reports homographs, first-use acronyms, hand italics and citation punctuation with rule ids', () => {
    const { file } = run(
      '# A FFT\n\nA data e a FFT. A *Zeitgeist* aqui.\n\n“Não se mova, faça de conta que está morta.” (Clarac; Bonnin, 1985, p. 72)',
    );
    expect([...rules(file)].sort()).toEqual(
      ['abnt:acad-06', 'abnt:cit-02', 'abnt:lex-hand-italic', 'abnt:lex-homograph'].sort(),
    );
    const homograph = file.messages.find((m) => m.ruleId === 'lex-homograph');
    expect(homograph?.line).toBe(3);
    expect(homograph?.column).toBe(3);
  });

  it('exports frontmatter.lexiconStats without overwriting the author’s lexicon field', () => {
    const fm = { lang: 'pt-BR', lexicon: { ignore: ['design'] } };
    const { file } = run('O software, Shannon, a FFT e a data, a priori, 10 kHz.', fm);
    const stats = file.data.astro?.frontmatter?.['lexiconStats'] as LexiconStats;
    expect(stats).toEqual({
      engine: 'regex',
      foreign: 1,
      locution: 1,
      properName: 1,
      acronym: 1,
      nowrap: 1,
      smallCaps: 0,
      raw: 0,
      homograph: 1,
    });
    expect(file.data.astro?.frontmatter?.['lexicon']).toEqual({ ignore: ['design'] });
  });

  it('works without a lexicon in the context (other stages’ tests): explicit directives only', () => {
    const bare = { base: '/' } as Partial<PipelineContext> as PipelineContext;
    const file = vfile('O software e :foreign[Sinn]{lang=de}.');
    const tree = parse(String(file.value));
    remarkAbnt({ context: bare })(tree, file);
    expect(toString(tree)).toBe('O software e Sinn.');
    expect(JSON.stringify(tree)).toContain('"hName":"i"');
  });
});

/* ------------------------------------------------------------------ laws */

const PIECES = [
  'software',
  'Software',
  'softwares',
  'big data',
  'big\ndata',
  'Zeitgeist',
  'Sinn',
  'a priori',
  'et al.',
  'sic',
  'Shannon',
  'C. E. Shannon',
  'FFT',
  'CPUs',
  'ABNT',
  'TCL',
  'data',
  'Data',
  'logos',
  'lógos',
  'saudade',
  'raison d’être',
  'Tractatus Logico-Philosophicus',
  '10 kHz',
  'p. 12',
  'v. 27',
  '3 de maio de 2024',
  'R$ 5,00',
  '`software`',
  '$$software$$',
  '[software](https://software.example/software)',
  '*Zeitgeist*',
  '**design**',
  ':raw[software]',
  ':foreign[Sinn]{lang=de}',
  ':abbr[FFT]',
  ':sc[abnt]',
  ':name[Robert May]',
  ':nowrap[x y]',
  '<i lang="de">Zeitgeist</i>',
  '<kbd>FFT</kbd>',
  'reação',
  'ação',
  'cafe\u0301',
  'e\u0301',
  '10:30',
  '“citação.” (Silva, 2020, p. 3)',
  ' ',
  ' ',
  ' ',
  ', ',
  '. ',
  '\n',
  '\n\n',
  '# ',
  '- ',
  '> ',
];
const markdownArb = fc.array(fc.constantFrom(...PIECES), { maxLength: 30 }).map((xs) => xs.join(''));

describe('remark-abnt: laws', () => {
  test.prop([markdownArb, fc.constantFrom('pt-BR', 'en')], { numRuns: 300 })(
    'LAW: the plain text of the document is unchanged by the stage',
    (md, lang) => {
      const before = toString(parse(md));
      const { tree } = run(md, { lang });
      expect(toString(tree)).toBe(before);
    },
    30_000,
  );

  test.prop([markdownArb, fc.constantFrom('pt-BR', 'en')], { numRuns: 300 })(
    'LAW: the stage is idempotent (a second run changes nothing)',
    (md, lang) => {
      const { tree } = run(md, { lang });
      const once = structuredClone(tree);
      transform(tree, vfile(md, { lang }));
      expect(tree).toEqual(once);
    },
    30_000,
  );
});
