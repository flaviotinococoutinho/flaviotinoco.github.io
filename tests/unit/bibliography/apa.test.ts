/**
 * Golden tests of the APA 7 style (Publication Manual, 7th ed., ch. 8–10 and the
 * reference examples of ch. 10).
 */
import { describe, expect, it } from 'vitest';
import { apa } from '../../../src/core/bibliography/style/apa.ts';
import { toHtml, toPlainText } from '../../../src/core/bibliography/render/inline.ts';
import { ref, spaces } from './helpers.ts';

const entry = (key: string): string => spaces(toPlainText(apa.reference(ref(key), '')));
const label = (key: string, mode: 'parenthetical' | 'narrative'): string => toPlainText(apa.label(ref(key), mode));

describe('APA 7 reference list', () => {
  it.each([
    [
      'shannon1948',
      'Shannon, C. E. (1948). A mathematical theory of communication. Bell System Technical Journal, 27(3–4), 379–423, 623–656. https://doi.org/10.1002/j.1538-7305.1948.tb01338.x',
    ],
    ['bauman1999', 'Bauman, Z. (1999). Globalização: As conseqüências humanas (M. Penchel, Trans.). Jorge Zahar.'],
    [
      'romano1996',
      'Romano, G. (1996). Imagens da juventude na era moderna. In G. Levi & J. Schmidt (Eds.), História dos jovens 2: A época contemporânea (pp. 7–16). Companhia das Letras.',
    ],
    [
      'weaver1949',
      'Weaver, W. (1949). Recent contributions to the mathematical theory of communication. In C. E. Shannon & W. Weaver, The mathematical theory of communication (pp. 95–117). University of Illinois Press.',
    ],
    [
      'moura2018',
      'Moura, L. R., Torres, L. M., Cadete, M. M. M., & Cunha, C. F. (2018). Fatores associados aos comportamentos de risco à saúde entre adolescentes brasileiros: Uma revisão integrativa. Revista da Escola de Enfermagem da USP, 52, Article e03304. https://doi.org/10.1590/S1980-220X2017020403304',
    ],
    [
      'liang1983',
      'Liang, F. M. (1983). Word hy-phen-a-tion by com-put-er [Doctoral dissertation, Stanford University].',
    ],
    ['knuth1977', 'Knuth, D. E. (1977). A test report (Technical Report No. STAN-CS-77-000). Stanford University.'],
    [
      'king2019',
      'King, A. (2019, November 5). Parse, don’t validate. https://lexi-lambda.github.io/blog/2019/11/05/parse-don-t-validate/',
    ],
    ['tool2020', 'Doe, J. (2020). Example tool (Version 1.2) [Computer software]. Example Org.'],
    ['edited2001', 'Levi, G., & Schmidt, J. (Eds.). (2001). Coletânea de ensaios. Ática.'],
    ['pequena2012', 'Pequena biblioteca do vinho. (2012). Lafonte.'],
    ['anteprojeto1987', 'Anteprojeto de lei. (1987). Estudos e Debates, (13), 51–60.'],
    ['noevent2010', 'Lee, A. (2010). A paper. In R. Roe (Ed.), Proceedings of something (Article 12). Springer.'],
    [
      'peirce1931',
      'Peirce, C. S. (1931–1958). Collected papers of Charles Sanders Peirce (C. Hartshorne, P. Weiss, & A. W. Burks, Eds., Vols. 1–8). Harvard University Press.',
    ],
    ['saussure1916', 'de Saussure, F. (1916). Cours de linguistique générale (C. Bally & A. Sechehaye, Eds.). Payot.'],
  ])('%s', (key, expected) => {
    expect(entry(key)).toBe(expected);
  });

  it('italicises stand-alone titles and journal volume, not the issue, and leaves no period after a DOI', () => {
    expect(toHtml(apa.reference(ref('shannon1949'), ''))).toBe(
      'Shannon, C. E. (1949). Communication in the presence of noise. <cite>Proceedings of the IRE</cite>, <i>37</i>(1), 10–21. <a href="https://doi.org/10.1109/JRPROC.1949.232969">https://doi.org/10.1109/JRPROC.1949.232969</a>',
    );
    expect(toHtml(apa.reference(ref('bauman1999'), ''))).toContain(
      '<cite lang="pt-BR">Globalização: As conseqüências humanas</cite>',
    );
  });

  it('omits a publisher or site name that repeats the author (§9.24, §10.16)', () => {
    const corporate = { kind: 'corporate' as const, name: { text: 'Example Org', protected: [], italic: [] } };
    const byPublisher = { ...ref('tool2020'), authors: { others: false, names: [corporate] } };
    expect(spaces(toPlainText(apa.reference(byPublisher, '')))).toBe(
      'Example Org. (2020). Example tool (Version 1.2) [Computer software].',
    );
    const report = {
      ...ref('knuth1977'),
      authors: { others: false, names: [{ ...corporate, name: { ...corporate.name, text: 'Stanford University' } }] },
    };
    expect(spaces(toPlainText(apa.reference(report, '')))).toBe(
      'Stanford University. (1977). A test report (Technical Report No. STAN-CS-77-000).',
    );
  });

  it('lists 21+ authors as 19, an ellipsis and the last (§9.8)', () => {
    const many = {
      ...ref('cruz1998'),
      authors: {
        others: false,
        names: Array.from({ length: 22 }, (_, i) => ({
          kind: 'person' as const,
          family: { text: `A${i + 1}`, protected: [], italic: [] },
          given: { text: 'Bea', protected: [], italic: [] },
        })),
      },
    };
    const text = spaces(toPlainText(apa.reference(many, '')));
    expect(text).toMatch(/^A1, B\., A2, B\., .* A19, B\., \. \. \. A22, B\. \(1998\)/u);
  });
});

describe('APA 7 calls', () => {
  it.each([
    ['shannon1948', 'Shannon', 'Shannon'],
    ['clarac1985', 'Clarac & Bonnin', 'Clarac and Bonnin'],
    ['cruz1998', 'Cruz et al.', 'Cruz et al.'],
    ['maciel2019', 'Maciel et al.', 'Maciel et al.'],
    ['saussure1916', 'de Saussure', 'de Saussure'],
    ['edited2001', 'Levi & Schmidt', 'Levi and Schmidt'],
    ['pequena2012', 'Pequena biblioteca do vinho', 'Pequena biblioteca do vinho'],
    ['anteprojeto1987', '“Anteprojeto de lei”', '“Anteprojeto de lei”'],
  ])('%s → (%s) / %s', (key, parenthetical, narrative) => {
    expect(label(key, 'parenthetical')).toBe(parenthetical);
    expect(label(key, 'narrative')).toBe(narrative);
  });

  it('does not italicise et al. (APA §8.17) and italicises a book title used as a label', () => {
    expect(toHtml(apa.label(ref('maciel2019'), 'parenthetical'))).toBe('Maciel et al.');
    expect(toHtml(apa.label(ref('pequena2012'), 'parenthetical'))).toBe(
      '<cite lang="pt-BR">Pequena biblioteca do vinho</cite>',
    );
  });

  it('uses p./pp. and other APA locator terms with an en dash', () => {
    expect(spaces(apa.locator({ label: 'page', values: [{ first: '379' }] }))).toBe('p. 379');
    expect(spaces(apa.locator({ label: 'page', values: [{ first: '379', last: '380' }] }))).toBe('pp. 379–380');
    expect(spaces(apa.locator({ label: 'chapter', values: [{ first: '3' }] }))).toBe('Chapter 3');
    expect(spaces(apa.locator({ label: 'paragraph', values: [{ first: '2' }, { first: '4' }] }))).toBe('paras. 2, 4');
    expect(apa.year(ref('peirce1931'), '')).toBe('1931–1958');
    expect(apa.year(ref('kotelnikov1933'), '')).toBe('1933');
  });
});
