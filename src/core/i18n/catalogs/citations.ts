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
  },
  en: {
    'references.heading': 'References',
    'references.backlink': 'Back to the first citation of {label} in the text',
    'references.backlink.symbol': '\u21A9\uFE0E',
  },
});
