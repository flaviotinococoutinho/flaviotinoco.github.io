/**
 * Golden tests of the ABNT style against the worked examples of NBR 6023:2025
 * and NBR 10520:2023 (docs/research/abnt.md §3.10). Strings are compared with
 * no-break spaces turned into spaces; the HTML tests check the markup.
 */
import { describe, expect, it } from 'vitest';
import { abnt, abntStyle } from '../../../src/core/bibliography/style/abnt.ts';
import { toHtml, toPlainText } from '../../../src/core/bibliography/render/inline.ts';
import { ref, spaces } from './helpers.ts';

const entry = (key: string, style = abnt): string => spaces(toPlainText(style.reference(ref(key), '')));
const label = (key: string, mode: 'parenthetical' | 'narrative'): string => toPlainText(abnt.label(ref(key), mode));

describe('NBR 6023:2025 worked examples (reference list)', () => {
  it.each([
    [
      'bauman1999',
      'BAUMAN, Zygmunt. Globalização: as conseqüências humanas. Tradução: Marcus Penchel. Rio de Janeiro: Jorge Zahar, 1999.',
    ],
    [
      'romano1996',
      'ROMANO, Giovanni. Imagens da juventude na era moderna. In: LEVI, G.; SCHMIDT, J. (org.). História dos jovens 2: a época contemporânea. São Paulo: Companhia das Letras, 1996. p. 7-16.',
    ],
    [
      'silva2019',
      'SILVA, Antônio Augusto Moura da. Intervenções precoces a redução de vulnerabilidades em melhora do desenvolvimento infantil. Cadernos de Saúde Pública, Rio de Janeiro, v. 35, n. 3, p. 1-3, mar. 2019. DOI: https://doi.org/10.1590/0102-311X00030519. Disponível em: https://www.scielosp.org/article/csp/2019.v35n3/e00030519/. Acesso em: 27 jun. 2019.',
    ],
    [
      // The norm's example also has the advisor ("Orientador: …"), a complementary element not modelled.
      'rodrigues2009',
      'RODRIGUES, Ana Lúcia Aquilas. Impacto de um programa de exercícios no local de trabalho sobre o nível de atividade física e o estágio de prontidão para a mudança de comportamento. 2009. 82 f. Dissertação (Mestrado em Fisiopatologia Experimental) – Faculdade de Medicina, Universidade de São Paulo, São Paulo, 2009.',
    ],
    [
      'brayner1994',
      'BRAYNER, A. R. A.; MEDEIROS, C. B. Incorporação do tempo em SGBD orientado a objetos. In: SIMPÓSIO BRASILEIRO DE BANCO DE DADOS, 9., 1994, São Paulo. Anais [...]. São Paulo: USP, 1994. p. 16-29.',
    ],
    [
      'veloso2023',
      'VELOSO, N.; PIMENTEL, J. Brasil teve 5 ataques com mortes em escolas em 2022 e 2023. Poder 360, 6 abr. 2023. Disponível em: https://www.poder360.com.br/brasil/brasil-teve-5-ataques-com-mortes-em-escolas-em-2022-e-2023/. Acesso em: 23 abr. 2024.',
    ],
    [
      'moura2018',
      'MOURA, L. R.; TORRES, L. M.; CADETE, M. M. M.; CUNHA, C. F. Fatores associados aos comportamentos de risco à saúde entre adolescentes brasileiros: uma revisão integrativa. Revista da Escola de Enfermagem da USP, São Paulo, v. 52, e03304, 2018. DOI: https://doi.org/10.1590/S1980-220X2017020403304. Disponível em: https://www.scielo.br/j/reeusp/a/JvyjzY4B4b7f9P5TLyLpPFK/abstract/?lang=pt. Acesso em: 7 abr. 2023.',
    ],
    [
      'abnt2025',
      'ASSOCIAÇÃO BRASILEIRA DE NORMAS TÉCNICAS. ABNT NBR 6023: informação e documentação: referências: elaboração. 3. ed. Rio de Janeiro: ABNT, 2025.',
    ],
    [
      'brasil1995',
      'BRASIL. Ministério da Administração Federal e da Reforma do Estado. Plano diretor da reforma do aparelho do Estado. Brasília, DF: Ministério da Administração Federal e da Reforma do Estado, 1995.',
    ],
    ['anteprojeto1987', 'ANTEPROJETO de lei. Estudos e Debates, Brasília, DF, n. 13, p. 51-60, jan. 1987.'],
    ['pequena2012', 'PEQUENA biblioteca do vinho. São Paulo: Lafonte, 2012.'],
    ['flor1995', 'A FLOR e a náusea. Rio de Janeiro: Record, 1995.'],
  ])('%s', (key, expected) => {
    expect(entry(key)).toBe(expected);
  });

  it('prints the first author + et al. under the "first" policy (NBR 6023 §8.1.1.2)', () => {
    expect(entry('moura2018', abntStyle({ etAl: 'first' }))).toMatch(/^MOURA, L\. R\. et al\. Fatores associados/u);
    expect(toHtml(abntStyle({ etAl: 'first' }).reference(ref('moura2018'), ''))).toContain(
      'MOURA, L. R. <i lang="la">et al.</i>',
    );
  });

  it('marks the destaque with <cite> on the title proper only, Latin with <i lang="la">, dates with <time>', () => {
    expect(toHtml(abnt.reference(ref('romano1996'), ''))).toBe(
      'ROMANO, Giovanni. Imagens da juventude na era moderna. <i lang="la">In</i>: LEVI, G.; SCHMIDT, J. (org.). <cite>História dos jovens 2</cite>: a época contemporânea. São Paulo: Companhia das Letras, 1996. p.\u00A07-16.',
    );
    expect(toHtml(abnt.reference(ref('brayner1994'), ''))).toContain('<cite>Anais</cite> [...]');
    expect(toHtml(abnt.reference(ref('veloso2023'), ''))).toContain(
      '<cite>Poder 360</cite>, <time datetime="2023-04-06">6\u00A0abr.\u00A02023</time>',
    );
    expect(toHtml(abnt.reference(ref('clarac1985'), ''))).toContain('Paris: <i lang="la">[s. n.]</i>, 1985');
    expect(toHtml(abnt.reference(ref('cruz1998'), ''))).toContain('<i lang="la">[S. l.]</i>: Atlas, 1998');
  });

  it('puts foreign-language titles in their language, never the document language', () => {
    const html = toHtml(abnt.reference(ref('shannon1948'), ''));
    expect(html).toContain('<span lang="en">A mathematical theory of communication</span>');
    expect(html).toContain('<cite lang="en">Bell System Technical Journal</cite>');
    expect(toHtml(abnt.reference(ref('bauman1999'), ''))).not.toContain('lang=');
  });

  it('renders the other types: interval of months, inferred year, multi-volume, thesis, report, online, software, edited book', () => {
    expect(entry('shannon1948')).toBe(
      'SHANNON, Claude Elwood. A mathematical theory of communication. Bell System Technical Journal, v. 27, n. 3-4, p. 379-423, 623-656, jul./out. 1948. DOI: https://doi.org/10.1002/j.1538-7305.1948.tb01338.x.',
    );
    expect(entry('kotelnikov1933')).toBe(
      'KOTELNIKOV, Vladimir Aleksandrovich. О пропускной способности «эфира» и проволоки в электросвязи. [Москва]: [Ред. упр. связи РККА], [1933].',
    );
    expect(entry('peirce1931')).toBe(
      'PEIRCE, Charles Sanders. Collected papers of Charles Sanders Peirce. Edição: Charles Hartshorne, Paul Weiss e Arthur Walter Burks. Cambridge, MA: Harvard University Press, 1931-1958. 8 v.',
    );
    expect(entry('saussure1916')).toBe(
      'SAUSSURE, Ferdinand de. Cours de linguistique générale. Edição: Charles Bally e Albert Sechehaye. Lausanne: Payot, 1916.',
    );
    expect(entry('weaver1949')).toBe(
      'WEAVER, Warren. Recent contributions to the mathematical theory of communication. In: SHANNON, Claude Elwood; WEAVER, Warren. The mathematical theory of communication. Urbana: University of Illinois Press, 1949. p. 95-117.',
    );
    expect(entry('liang1983')).toBe(
      'LIANG, Franklin Mark. Word hy-phen-a-tion by com-put-er. 1983. Tese (Doutorado) – Stanford University, Stanford, 1983.',
    );
    expect(entry('knuth1977')).toBe(
      'KNUTH, Donald Ervin. A test report. Stanford: Stanford University, 1977. (Technical Report, n. STAN-CS-77-000).',
    );
    expect(entry('king2019')).toBe(
      'KING, Alexis. Parse, don’t validate. [S. l.], 5 nov. 2019. Disponível em: https://lexi-lambda.github.io/blog/2019/11/05/parse-don-t-validate/. Acesso em: 13 out. 2026.',
    );
    expect(entry('tool2020')).toBe('DOE, Jane. Example tool. Versão 1.2. [S. l.]: Example Org, 2020.');
    expect(entry('edited2001')).toBe('LEVI, G.; SCHMIDT, J. (org.). Coletânea de ensaios. São Paulo: Ática, 2001.');
    expect(entry('noevent2010')).toBe(
      'LEE, Ann. A paper. In: ROE, Rob (ed.). Proceedings of something. Berlin: Springer, 2010. art. 12.',
    );
  });

  it('prints the year letter in the list (1927a)', () => {
    expect(spaces(toPlainText(abnt.reference(ref('reeside1927a'), 'b')))).toMatch(/v\. 151, 1927b\.$/u);
  });
});

describe('NBR 10520:2023 calls (labels and years)', () => {
  it.each([
    ['shannon1948', 'Shannon', 'Shannon'],
    ['clarac1985', 'Clarac; Bonnin', 'Clarac e Bonnin'],
    ['cruz1998', 'Cruz; Correa; Costa', 'Cruz, Correa e Costa'],
    ['maciel2019', 'Maciel et al.', 'Maciel et al.'],
    ['abnt2025', 'Associação Brasileira de Normas Técnicas', 'Associação Brasileira de Normas Técnicas'],
    ['brasil1995', 'Brasil', 'Brasil'],
    ['anteprojeto1987', 'Anteprojeto [...]', 'Anteprojeto [...]'],
    ['flor1995', 'A flor [...]', 'A flor [...]'],
    ['saussure1916', 'Saussure', 'Saussure'],
    ['edited2001', 'Levi; Schmidt', 'Levi e Schmidt'],
  ])('%s → (%s) / %s', (key, parenthetical, narrative) => {
    expect(label(key, 'parenthetical')).toBe(parenthetical);
    expect(label(key, 'narrative')).toBe(narrative);
  });

  it('sets et al. in italics with lang="la" (4+ authors)', () => {
    expect(toHtml(abnt.label(ref('maciel2019'), 'parenthetical'))).toBe('Maciel <i lang="la">et al.</i>');
  });

  it('prints years with letters, spans and inferred years', () => {
    expect(abnt.year(ref('shannon1948'), 'a')).toBe('1948a');
    expect(abnt.year(ref('peirce1931'), '')).toBe('1931-1958');
    expect(abnt.year(ref('kotelnikov1933'), '')).toBe('[1933]');
  });

  it('renders locators with the norm’s abbreviations', () => {
    const l = (label: 'page' | 'chapter' | 'section' | 'volume' | 'folio', first: string, last?: string) =>
      spaces(abnt.locator({ label, values: [last === undefined ? { first } : { first, last }] }));
    expect(l('page', '379', '380')).toBe('p. 379-380');
    expect(l('chapter', 'V')).toBe('cap. V');
    expect(l('section', '3.2')).toBe('seção 3.2');
    expect(spaces(abnt.locator({ label: 'section', symbol: '§', values: [{ first: '4' }] }))).toBe('§ 4');
    expect(l('volume', '3')).toBe('v. 3');
    expect(l('folio', '12')).toBe('f. 12');
  });
});
