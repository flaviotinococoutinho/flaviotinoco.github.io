import { defineMessages } from '../messages.ts';

/**
 * Messages of the "abnt" stage (lexicon marking and normative lint). They reach
 * the author as build warnings, in the language of the document being checked.
 */
export default defineMessages({
  'pt-BR': {
    'lint.cit02':
      'Ponto final antes das aspas e da chamada em “{excerpt}”: pela NBR 10520:2023 (5.2 e 7.1.2) o ponto encerra a frase, não a citação, e vem depois da chamada — ”(Autor, ano, p. x).',
    'lint.cit23.author':
      '“grifo do autor” em “{excerpt}”: a NBR 10520:2023 (7.1.5) dispensa a indicação quando o destaque já está no original.',
    'lint.cit23.notInNorm':
      '“destaque nosso” em “{excerpt}”: a NBR 10520:2023 (7.1.5) prevê “grifo nosso” ou “grifo próprio”.',
    'lint.cit23.last': '“{suffix}” em “{excerpt}” deve ser o último elemento da chamada (NBR 10520:2023, 7.1.5–7.1.6).',
    'lint.cit23.order':
      'Ordem em “{excerpt}”: localização (p. x), depois “tradução nossa”, depois “grifo nosso” (NBR 10520:2023, 7.1.6).',
    'lint.cit23.outside':
      '“{suffix}” em parênteses separados em “{excerpt}”: inclua-o dentro da chamada, como último elemento (NBR 10520:2023, 7.1.5–7.1.6).',
    'lint.cit11.mixed':
      'Política de autoria mista: o documento usa “et al.” e também lista quatro ou mais autores por extenso (“{excerpt}”). A NBR 10520:2023 (6.1.2) exige uma única opção em todo o documento.',
    'lint.acad06.firstUse':
      'Primeira ocorrência da sigla {term} sem a forma completa por extenso no mesmo parágrafo. NBR 14724:2024 (5.6): forma completa seguida da sigla entre parênteses — “{expansion} ({term})”.',
    'lint.acad06.firstUseForeign':
      'Primeira ocorrência da sigla {term} sem a forma completa por extenso no mesmo parágrafo. NBR 14724:2024 (5.6): “{expansion} ({term}, do {originLanguage} :foreign[{original}]{lang={originTag}})”.',
    'lint.lex01.homograph':
      '“{term}” é homógrafo ({note}) e ocorre {count} vez(es) sem marcação explícita: marque o sentido estrangeiro com :foreign[{term}]{lang={lang}}, o vernáculo com :raw[{term}], ou declare-o em lexicon.ignore.',
    'lint.lex02.handItalic':
      'Itálico manual redundante em *{term}*: o dicionário já marca “{term}” como {kindLabel} com lang="{lang}". Remova os asteriscos (o itálico manual não declara o idioma).',
    'kind.foreign': 'estrangeirismo',
    'kind.latin': 'locução latina',
    'language.en': 'inglês',
    'language.pt-BR': 'português',
    'directive.missingLang':
      ':foreign[{text}] sem atributo lang: escreva :foreign[{text}]{lang=xx} com uma etiqueta BCP 47 (WCAG 2.2, 3.1.2).',
    'directive.badLang': ':{name}[{text}]: etiqueta de idioma inválida — {detail}',
    'directive.badCategory': ':name[{text}]: categoria “{value}” inválida (use person, place, institution ou work).',
    'directive.unknownAttribute':
      ':{name}[{text}]: atributo “{attribute}” ignorado (não faz parte da linguagem fechada).',
    'directive.abbrNoTitle':
      ':abbr[{text}] sem title e ausente de lexicon/siglas.tsv: escreva :abbr[{text}]{title="forma completa"}.',
    'frontmatter.problem': 'frontmatter lexicon: {reason} — {detail} (item ignorado).',
    'stage.noLang':
      'frontmatter.lang ausente ou inválido: a marcação automática pelo dicionário foi desativada neste arquivo.',
    'stage.nfcUnavailable':
      'Texto com sequência Unicode cuja normalização NFC não pode ser mapeada de volta com segurança: trecho deixado sem marcação automática.',
  },
  en: {
    'lint.cit02':
      'Final period before the closing quotation mark and the citation in “{excerpt}”: per NBR 10520:2023 (5.2, 7.1.2) the period ends the sentence, not the quotation, and goes after the citation — ”(Author, year, p. x).',
    'lint.cit23.author':
      '“grifo do autor” in “{excerpt}”: NBR 10520:2023 (7.1.5) needs no note when the emphasis is already in the original.',
    'lint.cit23.notInNorm':
      '“destaque nosso” in “{excerpt}”: NBR 10520:2023 (7.1.5) provides “grifo nosso” or “grifo próprio”.',
    'lint.cit23.last':
      '“{suffix}” in “{excerpt}” must be the last element of the citation (NBR 10520:2023, 7.1.5–7.1.6).',
    'lint.cit23.order':
      'Order in “{excerpt}”: locator (p. x), then “tradução nossa”, then “grifo nosso” (NBR 10520:2023, 7.1.6).',
    'lint.cit23.outside':
      '“{suffix}” in separate parentheses in “{excerpt}”: put it inside the citation as its last element (NBR 10520:2023, 7.1.5–7.1.6).',
    'lint.cit11.mixed':
      'Mixed authorship policy: the document uses “et al.” and also lists four or more authors in full (“{excerpt}”). NBR 10520:2023 (6.1.2) requires one option throughout the document.',
    'lint.acad06.firstUse':
      'First occurrence of the acronym {term} without its full form in the same paragraph. Define it on first use — “{expansion} ({term})” (APA Publication Manual, 7th ed., 6.25; NBR 14724:2024, 5.6).',
    'lint.acad06.firstUseForeign':
      'First occurrence of the acronym {term} without its full form in the same paragraph. Define it on first use — “{expansion} ({term}; from the {originLanguage} :foreign[{original}]{lang={originTag}})”.',
    'lint.lex01.homograph':
      '“{term}” is a homograph ({note}) and occurs {count} time(s) without explicit marking: mark the foreign sense with :foreign[{term}]{lang={lang}}, the native one with :raw[{term}], or list it in lexicon.ignore.',
    'lint.lex02.handItalic':
      'Redundant manual italics in *{term}*: the dictionary already marks “{term}” as {kindLabel} with lang="{lang}". Remove the asterisks (manual italics do not declare the language).',
    'kind.foreign': 'a foreign term',
    'kind.latin': 'a Latin locution',
    'language.en': 'English',
    'language.pt-BR': 'Portuguese',
    'directive.missingLang':
      ':foreign[{text}] has no lang attribute: write :foreign[{text}]{lang=xx} with a BCP 47 tag (WCAG 2.2, 3.1.2).',
    'directive.badLang': ':{name}[{text}]: invalid language tag — {detail}',
    'directive.badCategory': ':name[{text}]: invalid category “{value}” (use person, place, institution or work).',
    'directive.unknownAttribute': ':{name}[{text}]: attribute “{attribute}” ignored (not part of the closed language).',
    'directive.abbrNoTitle':
      ':abbr[{text}] has no title and is not in lexicon/siglas.tsv: write :abbr[{text}]{title="full form"}.',
    'frontmatter.problem': 'frontmatter lexicon: {reason} — {detail} (item ignored).',
    'stage.noLang': 'frontmatter.lang is missing or invalid: automatic dictionary marking is disabled for this file.',
    'stage.nfcUnavailable':
      'Text contains a Unicode sequence whose NFC normalisation cannot be mapped back safely: left without automatic marking.',
  },
});
