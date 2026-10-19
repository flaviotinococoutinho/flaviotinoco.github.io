/**
 * "Como citar / How to cite" for the site's own works (src/core/bibliography/self.ts):
 * golden tests of the ABNT (NBR 6023:2025 §7.20 + NBR 10520:2023) and APA 7 forms,
 * the biblatex @online export, and the round-trip law through the site's own parser.
 */
import { describe, expect, it } from 'vitest';
import { fc, test } from '@fast-check/vitest';
import { buildBibliography } from '../../../src/core/bibliography/index.ts';
import { toHtml, toPlainText } from '../../../src/core/bibliography/render/inline.ts';
import {
  SITE_AUTHOR,
  citeSelf,
  type SelfCitation,
  type SelfCitationOptions,
  type SiteWork,
} from '../../../src/core/bibliography/self.ts';
import { abnt } from '../../../src/core/bibliography/style/abnt.ts';
import { apa } from '../../../src/core/bibliography/style/apa.ts';
import type { CitationStyle } from '../../../src/core/bibliography/style/style.ts';
import { spaces } from './helpers.ts';

const URL_PT = 'https://flaviotinococoutinho.github.io/flaviotinoco.github.io/pt/ensaios/amostrar-e-decidir/';
const URL_EN = 'https://flaviotinococoutinho.github.io/flaviotinoco.github.io/en/essays/to-sample-is-to-decide/';

const essayPt: SiteWork = {
  title: 'Amostrar é decidir',
  subtitle: 'o teorema de Nyquist–Shannon',
  lang: 'pt-BR',
  published: { year: 2026, month: 5, day: 3 },
  id: 'amostrar-e-decidir',
};
const essayEn: SiteWork = {
  title: 'To sample is to decide',
  subtitle: 'the Nyquist–Shannon theorem',
  lang: 'en',
  published: { year: 2026, month: 5, day: 3 },
  id: 'to-sample-is-to-decide',
};
const options = (url: string, extra: Partial<SelfCitationOptions> = {}): SelfCitationOptions => ({
  siteName: 'Flávio Tinoco',
  url,
  accessed: { year: 2026, month: 10, day: 17 },
  ...extra,
});

const cite = (work: SiteWork, style: CitationStyle, opts: SelfCitationOptions): SelfCitation => {
  const r = citeSelf(work, style, opts);
  if (!r.ok) throw new Error(r.error.join('; '));
  return r.value;
};
const plain = (c: SelfCitation): string => spaces(toPlainText(c.entry));

describe('ABNT (NBR 6023:2025 §7.20; NBR 10520:2023)', () => {
  const c = cite(essayPt, abnt, options(URL_PT));

  it('follows the template SOBRENOME, Prenome. Título: subtítulo. Nome do site, ano. Disponível em… Acesso em…', () => {
    expect(plain(c)).toBe(
      `TINOCO, Flávio. Amostrar é decidir: o teorema de Nyquist–Shannon. Flávio Tinoco, 2026. Disponível em: ${URL_PT}. Acesso em: 17 out. 2026.`,
    );
  });

  it('puts the destaque on the site name and marks the access date up', () => {
    expect(toHtml(c.entry)).toBe(
      `TINOCO, Flávio. Amostrar é decidir: o teorema de Nyquist–Shannon. <cite>Flávio Tinoco</cite>, 2026. Disponível em: <a href="${URL_PT}">${URL_PT}</a>. Acesso em: <time datetime="2026-10-17">17\u00A0out.\u00A02026</time>.`,
    );
  });

  it('prints day and month when asked (NBR 6023 §7.20, Ex. 10)', () => {
    expect(plain(cite(essayPt, abnt, options(URL_PT, { date: 'full' })))).toContain('Flávio Tinoco, 3 maio 2026.');
  });

  it('gives the in-text calls of NBR 10520 without links', () => {
    expect(toHtml(c.parenthetical)).toBe('(Tinoco, 2026)');
    expect(toHtml(c.narrative)).toBe('Tinoco (2026)');
  });

  it('lists co-authors with "; " in the reference and in the call; compound surnames stay one unit', () => {
    const two = cite(
      { ...essayPt, authors: [SITE_AUTHOR, { given: 'Gabriel', family: 'García Márquez' }] },
      abnt,
      options(URL_PT),
    );
    expect(plain(two)).toMatch(/^TINOCO, Flávio; GARCÍA MÁRQUEZ, Gabriel\. /u);
    expect(toPlainText(two.parenthetical)).toBe('(Tinoco; García Márquez, 2026)');
    expect(two.bibtex).toContain('author       = {Tinoco, Flávio and García Márquez, Gabriel},');
  });
});

describe('APA 7 (§10.16 webpages on a website)', () => {
  it('Author, A. (year, Month day). Title: Subtitle. URL — the site name is dropped when it repeats the author', () => {
    const c = cite(essayEn, apa, options(URL_EN));
    expect(plain(c)).toBe(`Tinoco, F. (2026, May 3). To sample is to decide: The Nyquist–Shannon theorem. ${URL_EN}`);
    expect(toHtml(c.entry)).toBe(
      `Tinoco, F. (2026, May 3). <cite>To sample is to decide: The Nyquist–Shannon theorem</cite>. <a href="${URL_EN}">${URL_EN}</a>`,
    );
    expect(toHtml(c.parenthetical)).toBe('(Tinoco, 2026)');
    expect(toHtml(c.narrative)).toBe('Tinoco (2026)');
  });

  it('keeps a site name that differs from the author', () => {
    expect(plain(cite(essayEn, apa, options(URL_EN, { siteName: 'Ponte' })))).toBe(
      `Tinoco, F. (2026, May 3). To sample is to decide: The Nyquist–Shannon theorem. Ponte. ${URL_EN}`,
    );
  });
});

describe('BibTeX (biblatex @online)', () => {
  it('exports author, title, subtitle, organization, date, url, urldate and langid', () => {
    expect(cite(essayPt, abnt, options(URL_PT)).bibtex).toBe(
      [
        '@online{tinoco2026-amostrar-e-decidir,',
        '  author       = {Tinoco, Flávio},',
        '  title        = {Amostrar é decidir},',
        '  subtitle     = {o teorema de {Nyquist–Shannon}},',
        '  organization = {Flávio Tinoco},',
        '  date         = {2026-05-03},',
        `  url          = {${URL_PT}},`,
        '  urldate      = {2026-10-17},',
        '  langid       = {brazilian},',
        '}',
        '',
      ].join('\n'),
    );
    expect(cite(essayEn, apa, options(URL_EN)).bibtex).toContain('langid       = {english},');
  });

  it('protects the capitalised words of titles, in the model and in the export', () => {
    const work: SiteWork = { title: 'SKOS and the Web of Data', lang: 'en', published: essayEn.published, id: 'skos' };
    const c = cite(work, apa, options(URL_EN));
    expect(c.bibtex).toContain('title        = {{SKOS} and the {Web} of {Data}},');
    expect(c.reference.title.main.protected).toEqual([
      { start: 0, end: 4 },
      { start: 13, end: 16 },
      { start: 20, end: 24 },
    ]);
    expect(cite(essayPt, abnt, options(URL_PT)).bibtex).toContain('title        = {Amostrar é decidir},');
  });

  it('is read back by the site’s own parser into the same reference', () => {
    const c = cite(essayPt, abnt, options(URL_PT, { date: 'full' }));
    const parsed = buildBibliography([{ name: 'self.bib', text: c.bibtex }]);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const back = parsed.value.get(c.key);
    expect(back?.type).toBe('online');
    if (back === undefined) return;
    expect(toPlainText(abnt.reference(back, ''))).toBe(toPlainText(c.entry));
    expect(toPlainText(apa.reference(back, ''))).toBe(toPlainText(apa.reference(c.reference, '')));
  });

  // TeX turns ' and ` into typographic quotes (TeXbook ch. 2): that is their meaning in BibTeX,
  // so the law is stated on text without those two characters ("--" is escaped as "-{}-").
  const word = fc.stringMatching(/^[A-Za-zÀ-ÿ0-9%&#$_~^{}\\.,;:!?()–—«»\u00A0-]{1,10}$/u);
  // A title that is only white space is an error (tested below), not a title.
  const phrase = fc
    .array(word, { minLength: 1, maxLength: 6 })
    .map((ws) => ws.join(' '))
    .filter((p) => p.trim() !== '');

  test.prop([phrase, fc.option(phrase, { nil: undefined }), fc.constantFrom<'pt-BR' | 'en'>('pt-BR', 'en')], {
    numRuns: 200,
  })('decode(encode(work)) formats identically in both styles', (title, subtitle, lang) => {
    const work: SiteWork = { ...essayPt, title, lang, ...(subtitle === undefined ? {} : { subtitle }) };
    for (const style of [abnt, apa]) {
      const c = cite(work, style, options(URL_PT, { date: 'full', siteName: 'Ponte {de} 100%' }));
      const parsed = buildBibliography([{ name: 'self.bib', text: c.bibtex }]);
      expect(parsed.ok).toBe(true);
      const back = parsed.ok ? parsed.value.get(c.key) : undefined;
      expect(back).toBeDefined();
      if (back === undefined) return;
      expect(toPlainText(style.reference(back, ''))).toBe(toPlainText(c.entry));
      expect(back.title.main.text).toBe(c.reference.title.main.text);
      expect(back.title.sub?.text).toBe(c.reference.title.sub?.text);
    }
  });
});

describe('titles', () => {
  it('splits "Título: subtítulo" like a .bib title when no subtitle is given (NBR 6023 §8.2)', () => {
    const base: SiteWork = { title: '', lang: 'pt-BR', published: essayPt.published, id: 'x' };
    const c = cite({ ...base, title: 'Amostrar é decidir: o teorema de Nyquist–Shannon' }, abnt, options(URL_PT));
    expect(c.reference.title.main.text).toBe('Amostrar é decidir');
    expect(c.reference.title.sub?.text).toBe('o teorema de Nyquist–Shannon');
    expect(c.bibtex).toContain('subtitle     = {o teorema de {Nyquist–Shannon}},');
    // A colon inside a protected word ("SKOS:") is not a separator, as in the parser.
    const skos = cite({ ...base, title: 'Ver SKOS: Concept agora' }, abnt, options(URL_PT));
    expect(skos.reference.title.sub).toBeUndefined();
  });
});

describe('invalid input is an error value, never an exception', () => {
  it('reports every problem at once', () => {
    const r = citeSelf(
      { ...essayPt, title: '  ', id: 'Not A Slug', published: { year: 2026, month: 2, day: 30 } },
      abnt,
      options('ftp://example.org', { accessed: { year: 2026, month: 13 as 12, day: 1 } }),
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toEqual([
      'the title is empty',
      'url "ftp://example.org" must be an absolute http(s) URL',
      'id "Not A Slug" must be a slug (lowercase words joined by hyphens)',
      'the date of publication is not a calendar date',
      'the date of access is not a calendar date',
    ]);
  });

  it('rejects an author without a surname and a URL that would break BibTeX', () => {
    const r = citeSelf({ ...essayPt, authors: [{ given: 'Flávio', family: '' }] }, abnt, options('https://a.b/{x}'));
    expect(r.ok ? [] : r.error).toEqual([
      'every author needs a given name and a surname',
      'url "https://a.b/{x}" must be an absolute http(s) URL',
    ]);
  });
});
