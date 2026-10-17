import { defineMessages } from '../messages.ts';

/**
 * Citations and reference list (remark stage "citations").
 *
 * Only interface text lives here. The vocabulary INSIDE references and calls
 * ("Disponível em", "Acesso em", "In", "et al.", "p.", "ed.", month
 * abbreviations…) is prescribed by the norm each style implements (NBR 6023 /
 * NBR 10520 for pt-BR, APA 7 for en) and therefore belongs to the style data in
 * src/core/bibliography/style/*.ts.
 */
export default defineMessages({
  'pt-BR': {
    'references.heading': 'Referências',
    'references.backlink': 'Voltar à primeira citação de {label} no texto',
    'references.backlink.symbol': '\u21A9\uFE0E',
    'references.download': 'Baixar as referências (BibTeX)',
    // "Como citar" box of essays and labs (core: citeSelf in src/core/bibliography/self.ts).
    'howToCite.heading': 'Como citar',
    'howToCite.reference': 'Referência ({style})',
    'howToCite.inText': 'Citação no texto',
    'howToCite.bibtex': 'BibTeX',
    'howToCite.copy': 'Copiar',
    'howToCite.copied': 'Copiado para a área de transferência',
    'style.abnt': 'ABNT NBR 6023:2025',
    'style.apa': 'APA 7',
  },
  en: {
    'references.heading': 'References',
    'references.backlink': 'Back to the first citation of {label} in the text',
    'references.backlink.symbol': '\u21A9\uFE0E',
    'references.download': 'Download the references (BibTeX)',
    'howToCite.heading': 'How to cite',
    'howToCite.reference': 'Reference ({style})',
    'howToCite.inText': 'In-text citation',
    'howToCite.bibtex': 'BibTeX',
    'howToCite.copy': 'Copy',
    'howToCite.copied': 'Copied to the clipboard',
    'style.abnt': 'ABNT NBR 6023:2025',
    'style.apa': 'APA 7',
  },
});
