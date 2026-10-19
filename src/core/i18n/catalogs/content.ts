import { defineMessages } from '../messages.ts';

/**
 * Standing pages (about, colophon): the revision metadata rendered by
 * src/views/PageView.astro. `{date}` is replaced by a <time> element, so it
 * must appear exactly once in each message.
 */
export default defineMessages({
  'pt-BR': {
    'page.lastRevised': 'Última revisão: {date}',
    'page.revisions': 'Histórico de revisões',
    'page.revisions.hint': 'Datas e notas de cada mudança relevante nesta página.',
  },
  en: {
    'page.lastRevised': 'Last revised: {date}',
    'page.revisions': 'Revision history',
    'page.revisions.hint': 'Dates and notes for each significant change to this page.',
  },
});
