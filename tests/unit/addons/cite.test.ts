/**
 * The "how to cite" box: ABNT with the full date of the online document
 * (NBR 6023:2025 §7.20, Exemplo 10), APA 7 for English, the in-text forms and
 * the biblatex entry — all from citeSelf, so the box and the reference lists agree.
 */
import { describe, expect, it } from 'vitest';
import { citeBox } from '../../../src/core/addons/cite.ts';
import type { SiteWork } from '../../../src/core/bibliography/self.ts';

const URL_PT = 'https://flaviotinococoutinho.github.io/flaviotinoco.github.io/pt/ensaios/amostrar-e-decidir/';
const URL_EN = 'https://flaviotinococoutinho.github.io/flaviotinoco.github.io/en/essays/to-sample-is-to-decide/';
const accessed = { year: 2026, month: 10, day: 19 } as const;
const options = (url: string) => ({ siteName: 'Flávio Tinoco', url, accessed });

const essayPt: SiteWork = {
  title: 'Amostrar é decidir',
  subtitle: 'o teorema de Nyquist–Shannon',
  lang: 'pt-BR',
  published: { year: 2026, month: 5, day: 3 },
  id: 'amostrar-e-decidir',
};
const essayEn: SiteWork = {
  ...essayPt,
  title: 'To sample is to decide',
  subtitle: 'the Nyquist–Shannon theorem',
  lang: 'en',
  id: 'to-sample-is-to-decide',
};

const spaces = (s: string): string => s.replace(/[\u00a0\u202f]/gu, ' ');

describe('citeBox', () => {
  it('ABNT: full date of the work, site name in bold (<cite>), access date of the build', () => {
    const r = citeBox(essayPt, 'pt-BR', options(URL_PT));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.style).toBe('abnt');
    expect(spaces(r.value.reference.text)).toBe(
      `TINOCO, Flávio. Amostrar é decidir: o teorema de Nyquist–Shannon. Flávio Tinoco, 3 maio 2026. Disponível em: ${URL_PT}. Acesso em: 19 out. 2026.`,
    );
    expect(r.value.reference.html).toContain('<cite>Flávio Tinoco</cite>');
    expect(r.value.parenthetical.text).toBe('(Tinoco, 2026)');
    expect(r.value.narrative.text).toBe('Tinoco (2026)');
    expect(r.value.bibtex).toMatch(/^@online\{tinoco2026-amostrar-e-decidir,/u);
    expect(r.value.bibtex).toMatch(/urldate\s+= \{2026-10-19\}/u);
    expect(r.value.key).toBe('tinoco2026-amostrar-e-decidir');
  });

  it('APA 7: (year, Month day), the site name dropped when it repeats the author', () => {
    const r = citeBox(essayEn, 'en', options(URL_EN));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.style).toBe('apa');
    expect(spaces(r.value.reference.text)).toBe(
      `Tinoco, F. (2026, May 3). To sample is to decide: The Nyquist–Shannon theorem. ${URL_EN}`,
    );
    expect(r.value.parenthetical.text).toBe('(Tinoco, 2026)');
  });

  it('the HTML form escapes the text and the plain form equals its text content', () => {
    const r = citeBox({ ...essayPt, title: 'A < B & C' }, 'pt-BR', options(URL_PT));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.reference.html).toContain('A &lt; B &amp; C');
    const textContent = r.value.reference.html
      .replace(/<[^>]+>/gu, '')
      .replace(/&lt;/gu, '<')
      .replace(/&gt;/gu, '>')
      .replace(/&quot;/gu, '"')
      .replace(/&amp;/gu, '&');
    expect(textContent).toBe(r.value.reference.text);
  });

  it('reports every problem of an invalid work', () => {
    const r = citeBox({ ...essayPt, title: ' ', id: 'Not A Slug' }, 'pt-BR', { ...options('ftp://x'), siteName: '' });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.length).toBeGreaterThanOrEqual(4);
  });
});
