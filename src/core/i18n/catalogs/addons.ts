import { defineMessages } from '../messages.ts';

/**
 * Reading and scholarly add-ons: how to cite, copy buttons, heading permalinks,
 * copy as TeX, reading position, keyboard shortcuts, link previews, quotation
 * with citation, print, share, feeds and the Open Graph card (docs/complementos.md).
 *
 * The vocabulary INSIDE references and in-text calls belongs to the citation
 * styles (src/core/bibliography/style/*.ts) and the labels of the "how to cite"
 * box to the citations catalog (src/core/i18n/catalogs/citations.ts); only the
 * interface text of the add-ons lives here.
 */
export default defineMessages({
  'pt-BR': {
    // Copy feedback (announced in a polite live region).
    'copy.done': 'Copiado',
    'copy.failed': 'Não foi possível copiar. Selecione o texto e copie com o teclado.',

    // How to cite.
    'cite.parenthetical': 'Parentética',
    'cite.narrative': 'Narrativa',
    'cite.copyReference': 'Copiar a referência',
    'cite.copyParenthetical': 'Copiar a citação parentética',
    'cite.copyNarrative': 'Copiar a citação narrativa',
    'cite.copyBibtex': 'Copiar a entrada BibTeX',
    'cite.accessed': 'A data de acesso é a da geração desta página ({date}); use a data da sua consulta.',
    'cite.download': 'Baixar as referências citadas neste ensaio (BibTeX, {count})',

    // Heading permalinks.
    'anchor.label': 'Link para a seção “{title}”',
    'anchor.copied': 'Link da seção copiado',

    // Copy as TeX.
    'tex.copy': 'Copiar TeX',
    'tex.copyLabel': 'Copiar o código TeX: {label}',
    'tex.copied': 'Código TeX copiado',

    // Reading position.
    'position.label': 'Posição de leitura',
    'position.continue': 'Continuar em: {heading}',
    'position.forget': 'Esquecer esta posição',
    'position.forgotten': 'Posição de leitura esquecida',

    // Keyboard shortcuts.
    'shortcuts.title': 'Atalhos de teclado',
    'shortcuts.open': 'Atalhos de teclado',
    'shortcuts.close': 'Fechar',
    'shortcuts.or': 'ou',
    'shortcuts.palette': 'Abrir a busca e a navegação rápida',
    'shortcuts.help': 'Mostrar esta lista de atalhos',
    'shortcuts.escape': 'Fechar um diálogo, um menu ou uma prévia de link',
    'shortcuts.singleKeyNote':
      'Os atalhos de uma só tecla (/ e ?) não funcionam dentro de campos de texto e podem ser desligados nas preferências.',

    // Link previews.
    'preview.minutes': '{minutes} min de leitura',

    // Quotation with citation.
    'quote.copy': 'Copiar citação',
    'quote.copied': 'Citação copiada, com a referência e o link para o trecho',

    // Print and share.
    'tools.label': 'Ações do ensaio',
    'print.button': 'Imprimir ou salvar em PDF',
    'share.button': 'Compartilhar',
    'share.copied': 'Endereço da página copiado',

    // Feeds and footer.
    'feed.json': 'JSON Feed',
    'feed.jsonTitle': 'Ensaios e laboratórios (JSON Feed)',
    'footer.shortcuts': 'Atalhos de teclado',

    // Open Graph card (og:image:alt).
    'og.alt': 'Cartão com o título “{title}”, o estrato {stratum} e o nome do autor, {author}.',
    'og.altHome': 'Cartão com o nome do site, {site}, e o lema: {tagline}',

    // Structured data and llms.txt.
    'breadcrumb.home': 'Início',
    'llms.essays': 'Ensaios',
    'llms.labs': 'Laboratórios',
    'llms.strata': 'Estratos',
    'llms.ontology': 'Ontologia',
    'llms.pages': 'Sobre o site',
    'llms.feeds': 'Dados abertos',
    'llms.optional': 'Optional',
    'llms.ontologyIndex': 'Índice dos conceitos (SKOS) e mapa da ontologia',
    'llms.ontologyData': 'A ontologia completa em JSON-LD (SKOS)',
    'llms.rss': 'Feed RSS 2.0 dos ensaios e laboratórios em português',
    'llms.jsonFeed': 'JSON Feed 1.1 dos ensaios e laboratórios em português, com os resumos',
  },
  en: {
    'copy.done': 'Copied',
    'copy.failed': 'Could not copy. Select the text and copy it with the keyboard.',

    'cite.parenthetical': 'Parenthetical',
    'cite.narrative': 'Narrative',
    'cite.copyReference': 'Copy the reference',
    'cite.copyParenthetical': 'Copy the parenthetical citation',
    'cite.copyNarrative': 'Copy the narrative citation',
    'cite.copyBibtex': 'Copy the BibTeX entry',
    'cite.accessed': 'The access date is the date this page was generated ({date}); use the date you read it.',
    'cite.download': 'Download the references cited in this essay (BibTeX, {count})',

    'anchor.label': 'Link to the section “{title}”',
    'anchor.copied': 'Section link copied',

    'tex.copy': 'Copy TeX',
    'tex.copyLabel': 'Copy the TeX source: {label}',
    'tex.copied': 'TeX source copied',

    'position.label': 'Reading position',
    'position.continue': 'Continue at: {heading}',
    'position.forget': 'Forget this position',
    'position.forgotten': 'Reading position forgotten',

    'shortcuts.title': 'Keyboard shortcuts',
    'shortcuts.open': 'Keyboard shortcuts',
    'shortcuts.close': 'Close',
    'shortcuts.or': 'or',
    'shortcuts.palette': 'Open search and quick navigation',
    'shortcuts.help': 'Show this list of shortcuts',
    'shortcuts.escape': 'Close a dialog, a menu or a link preview',
    'shortcuts.singleKeyNote':
      'Single-key shortcuts (/ and ?) do not work inside text fields and can be turned off in the preferences.',

    'preview.minutes': '{minutes} min read',

    'quote.copy': 'Copy quotation',
    'quote.copied': 'Quotation copied, with the reference and a link to the passage',

    'tools.label': 'Essay actions',
    'print.button': 'Print or save as PDF',
    'share.button': 'Share',
    'share.copied': 'Page address copied',

    'feed.json': 'JSON Feed',
    'feed.jsonTitle': 'Essays and labs (JSON Feed)',
    'footer.shortcuts': 'Keyboard shortcuts',

    'og.alt': 'Card with the title “{title}”, the {stratum} stratum and the author’s name, {author}.',
    'og.altHome': 'Card with the site name, {site}, and its motto: {tagline}',

    'breadcrumb.home': 'Home',
    'llms.essays': 'Essays',
    'llms.labs': 'Labs',
    'llms.strata': 'Strata',
    'llms.ontology': 'Ontology',
    'llms.pages': 'About the site',
    'llms.feeds': 'Open data',
    'llms.optional': 'Optional',
    'llms.ontologyIndex': 'Index of the concepts (SKOS) and map of the ontology',
    'llms.ontologyData': 'The whole ontology as JSON-LD (SKOS)',
    'llms.rss': 'RSS 2.0 feed of the essays and labs in English',
    'llms.jsonFeed': 'JSON Feed 1.1 of the essays and labs in English, with their abstracts',
  },
});
