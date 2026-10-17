import { describe, expect, it } from 'vitest';
import { fc, test } from '@fast-check/vitest';
import type { Element, ElementContent, Root as HastRoot } from 'hast';
import type { Root, RootContent } from 'mdast';
import { toString } from 'mdast-util-to-string';
import remarkDirective from 'remark-directive';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import remarkParse from 'remark-parse';
import { unified } from 'unified';
import { fixture, render } from './helpers.ts';

const html = (md: string, lang: 'pt-BR' | 'en' = 'pt-BR'): string => render(md, lang).html;
/** The paragraph only (drops the reference list). */
const body = (md: string, lang: 'pt-BR' | 'en' = 'pt-BR'): string =>
  html(md, lang).replace(/\n?<section class="references"[\s\S]*<\/section>/u, '');
const nb = (s: string): string => s.replace(/\u00A0/gu, ' ');

describe('calls in pt-BR (NBR 10520:2023)', () => {
  it('parenthetical with locator — the contract of docs/arquitetura.md §5.4', () => {
    expect(nb(body('Texto [@shannon1948, p. 12].'))).toBe(
      '<p>Texto <span class="cite" data-cite="[@shannon1948, p. 12]">(<a href="#ref-shannon1948" id="cite-shannon1948">Shannon</a>, 1948, p. 12)</span>.</p>',
    );
  });

  it('narrative, suppressed author, several works, same author several years', () => {
    const out = nb(
      body('@shannon1948 [p. 379] e [-@shannon1949, p. 3]; [@knox1986; @cross1984]; [@dreyfuss1991; @dreyfuss1989].'),
    );
    expect(out).toContain('<a href="#ref-shannon1948" id="cite-shannon1948">Shannon</a> (1948, p. 379)</span>');
    expect(out).toContain('(<a href="#ref-shannon1949" id="cite-shannon1949">1949</a>, p. 3)');
    expect(out).toContain(
      '(<a href="#ref-cross1984" id="cite-cross1984">Cross</a>, 1984; <a href="#ref-knox1986" id="cite-knox1986">Knox</a>, 1986)',
    );
    expect(out).toContain(
      '(<a href="#ref-dreyfuss1989" id="cite-dreyfuss1989">Dreyfuss</a>, 1989, <a href="#ref-dreyfuss1991" id="cite-dreyfuss1991">1991</a>)',
    );
  });

  it('two and four authors, et al. in italics with lang="la"', () => {
    const out = body('[@clarac1985] e @clarac1985 e [@maciel2019, p. 163].');
    expect(out).toContain('>Clarac; Bonnin</a>, 1985)');
    expect(out).toContain('>Clarac e Bonnin</a> (1985)');
    expect(out).toContain('>Maciel <i lang="la">et al.</i></a>, 2019, p.\u00A0163)');
  });

  it('works without author and government bodies', () => {
    const out = body('[@anteprojeto1987, p. 55] [@pequena2012] [@brasil1995]');
    expect(out).toContain('>Anteprojeto [...]</a>, 1987, p.\u00A055)');
    expect(out).toContain('>Pequena [...]</a>, 2012)');
    expect(out).toContain('>Brasil</a>, 1995)');
  });

  it('disambiguates same author and year with letters, in the calls and in the list', () => {
    const out = html('[@reeside1927a] e [@reeside1927b]');
    expect(out).toContain('>Reeside</a>, 1927b)');
    expect(out).toContain('>Reeside</a>, 1927a)');
    expect(nb(out)).toMatch(
      /<li id="ref-reeside1927b"[^>]*>REESIDE, John B\. <span lang="en">A new fauna[^<]*<\/span>\. <cite lang="en">Professional Paper<\/cite>, v\. 150, 1927a\./u,
    );
  });
});

describe('calls in en (APA 7)', () => {
  it('uses "&" in parentheses, "and" in the narrative, et al. for 3+, pp. for ranges', () => {
    const out = nb(body('[@clarac1985] and @clarac1985 and [@cruz1998, pp. 3-4].', 'en'));
    expect(out).toContain('>Clarac &#x26; Bonnin</a>, 1985)');
    expect(out).toContain('>Clarac and Bonnin</a> (1985)');
    expect(out).toContain('>Cruz et al.</a>, 1998, pp. 3–4)');
  });

  it('titles the list "References" and marks the style', () => {
    const out = html('[@shannon1948]', 'en');
    expect(out).toContain(
      '<section class="references" data-style="apa" aria-labelledby="references-title"><h2 id="references-title">References</h2>',
    );
    expect(out).toContain('Shannon, C. E. (1948).');
  });
});

describe('what is NOT a citation', () => {
  it.each([
    ['escaped bracket', '\\[@shannon1948]', '<p>[@shannon1948]</p>'],
    ['escaped at sign', 'veja \\@shannon1948', '<p>veja @shannon1948</p>'],
    ['unknown narrative key', 'por @flavio', '<p>por @flavio</p>'],
    ['e-mail autolink', 'fulano@exemplo.com', '<p><a href="mailto:fulano@exemplo.com">fulano@exemplo.com</a></p>'],
    ['code', '`[@shannon1948]`', '<p><code>[@shannon1948]</code></p>'],
    ['link text', '[@shannon1948](https://x.y)', '<p><a href="https://x.y">@shannon1948</a></p>'],
    ['link reference', '[@shannon1948][r]\n\n[r]: https://x.y', '<p><a href="https://x.y">@shannon1948</a></p>'],
    ['inline math', '$$[@shannon1948]$$', '<p><code class="language-math math-inline">[@shannon1948]</code></p>'],
  ])('%s', (_name, md, expected) => {
    expect(body(md)).toBe(expected);
  });

  it('leaves raw HTML blocks alone (inline tags are separate nodes: text between them is prose)', () => {
    expect(() => render('<div>[@nope]</div>')).not.toThrow();
    expect(render('<span>[@shannon1948]</span>').html).toContain('class="cite"');
  });

  it('processes text inside footnotes and directive labels', () => {
    expect(html('Texto.[^1]\n\n[^1]: Ver [@shannon1948].')).toContain('class="cite"');
  });
});

describe('errors and messages', () => {
  it('fails on unknown keys inside brackets, listing all of them with positions', () => {
    expect(() => render('Um [@nope].\n\nDois [@shannon1948; @nada, p. 3].')).toThrow(
      /unknown citation keys: @nope \(1:4\), @nada \(3:6\)/u,
    );
  });

  it('fails on a second ::bibliography', () => {
    expect(() => render('[@shannon1948]\n\n::bibliography\n\n::bibliography')).toThrow(/only one ::bibliography/u);
  });

  it('warns and removes ::bibliography when nothing is cited', () => {
    const r = render('Nada citado.\n\n::bibliography');
    expect(r.html).toBe('<p>Nada citado.</p>');
    expect(r.file.messages.map((m) => m.ruleId)).toEqual(['empty-bibliography']);
  });
});

describe('reference list and metadata', () => {
  it('replaces ::bibliography in place, with backlinks to the first citation', () => {
    const out = html('Antes [@shannon1948].\n\n::bibliography\n\nDepois [@shannon1948].');
    expect(out.indexOf('<section')).toBeLessThan(out.indexOf('Depois'));
    expect(out.match(/id="cite-shannon1948"/gu)).toHaveLength(1);
    expect(out).toContain(
      '<a href="#cite-shannon1948" class="references__backlink" aria-label="Voltar à primeira citação de Shannon, 1948 no texto">↩\uFE0E</a></li>',
    );
    expect(out).toContain(
      '<ul role="list" class="references__list"><li id="ref-shannon1948" class="references__item">',
    );
  });

  it('appends the list at the end when there is no directive, and lists only cited works', () => {
    const r = render('Um [@shannon1949].\n\nDois.');
    expect(r.html.trimEnd().endsWith('</section>')).toBe(true);
    expect(r.html.match(/<li /gu)).toHaveLength(1);
  });

  it('exports frontmatter.citations in order of first use', () => {
    expect(render('[@knox1986] @shannon1948 [@cross1984; @knox1986]').frontmatter['citations']).toEqual([
      'knox1986',
      'shannon1948',
      'cross1984',
    ]);
    expect(render('Sem citações.').frontmatter['citations']).toEqual([]);
  });

  it('defaults to pt-BR when the document has no lang', () => {
    const r = render('[@shannon1948]', 'pt-BR');
    expect(r.html).toContain('Referências');
  });

  it('renders an epigraph source="@k" into a flagged paragraph for the reading stage', () => {
    const r = render(':::epigraph{source="[@shannon1948, p. 379]"}\nCitação.\n:::');
    const directive = r.mdast.children[0] as RootContent & { children: RootContent[] };
    const last = directive.children.at(-1) as RootContent & { data?: Record<string, unknown> };
    expect(last.type).toBe('paragraph');
    expect(last.data?.['epigraphSource']).toBe(true);
    expect(toString(last)).toBe('(Shannon, 1948, p.\u00A0379)');
    expect(r.frontmatter['citations']).toEqual(['shannon1948']);
  });
});

// ---------------------------------------------------------------- injectivity

/** Replaces every citation node by its source (data-cite) and drops the list: R(T(x)). */
const recover = (tree: Root): string => {
  const strip = (nodes: readonly RootContent[]): RootContent[] =>
    nodes
      .filter((n) => (n.type as string) !== 'references')
      .map((n): RootContent => {
        if ((n.type as string) === 'citation') {
          const data = (n as unknown as { data: { hProperties: { dataCite: string } } }).data;
          return { type: 'text', value: data.hProperties.dataCite };
        }
        return 'children' in n ? ({ ...n, children: strip(n.children) } as RootContent) : n;
      });
  return toString({ type: 'root', children: strip(tree.children) });
};

const plain = (md: string): string =>
  toString(
    unified()
      .use(remarkParse)
      .use(remarkGfm)
      .use(remarkMath, { singleDollarTextMath: false })
      .use(remarkDirective)
      .parse(md),
  );

const piece = fc.oneof(
  fc.stringMatching(/^[a-zà-ú]{1,8}$/),
  fc.constantFrom(
    '[@shannon1948]',
    '[@shannon1948, p. 12]',
    '[ver @clarac1985; -@moura2018, cap. 3]',
    '@shannon1949',
    '@shannon1949 [p. 3]',
    '[@reeside1927a; @reeside1927b]',
    '\\[@shannon1948]',
    '\\@shannon1949',
    '`[@x]`',
    '@flavio',
    'a@b.com',
    '(@knox1986)',
    '[nota]',
    ',',
    '.',
  ),
);

describe('information preservation (docs/arquitetura.md §2.4)', () => {
  test.prop([fc.array(piece, { minLength: 1, maxLength: 12 }), fc.constantFrom<'pt-BR' | 'en'>('pt-BR', 'en')], {
    numRuns: 300,
  })('replacing every span.cite by its data-cite restores the text: R(T(x)) = x', (pieces, lang) => {
    const md = pieces.join(' ');
    expect(recover(render(md, lang, fixture).mdast)).toBe(plain(md));
  });

  test.prop([fc.array(piece, { minLength: 1, maxLength: 8 })], { numRuns: 100 })(
    'the hast spans carry the same data-cite as the mdast nodes',
    (pieces) => {
      const r = render(pieces.join(' '));
      const fromHast: string[] = [];
      const walk = (nodes: readonly (ElementContent | HastRoot['children'][number])[]): void => {
        for (const n of nodes) {
          if (n.type !== 'element') continue;
          const e: Element = n;
          const classes = e.properties['className'];
          if (Array.isArray(classes) && classes.includes('cite')) fromHast.push(String(e.properties['dataCite']));
          walk(e.children);
        }
      };
      walk(r.hast.children);
      const fromMdast: string[] = [];
      const visit = (nodes: readonly RootContent[]): void => {
        for (const n of nodes) {
          if ((n.type as string) === 'citation')
            fromMdast.push((n as unknown as { data: { hProperties: { dataCite: string } } }).data.hProperties.dataCite);
          else if ('children' in n) visit(n.children);
        }
      };
      visit(r.mdast.children);
      expect(fromHast).toEqual(fromMdast);
    },
  );
});
