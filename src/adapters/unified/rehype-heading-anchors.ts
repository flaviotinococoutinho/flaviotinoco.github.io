/**
 * Rehype stage "heading-anchors" (imperative shell around
 * src/core/addons/heading-anchors.ts): a permalink at the end of every h2–h4
 * with an id, labelled in the document's language ("Link para a seção “…”").
 *
 * Runs after footnotes-i18n, so the localised footnote heading is final; it is
 * still BEFORE Astro's own rehypeHeadingIds, which is why only headings that
 * already have an id are linked — the reading stage assigns every heading id at
 * remark time (src/core/reading/slug.ts), so in practice that is all of them.
 * The behaviour on click (copy the URL) is <ft-heading-anchor>'s, loaded by the
 * islands registry; without JavaScript the anchor is a plain same-page link.
 */
import type { Root } from 'hast';
import type { VFile } from 'vfile';
import { headingAnchors } from '../../core/addons/heading-anchors.ts';
import { DEFAULT_LOCALE, parseLocale } from '../../core/domain/locale.ts';
import catalog from '../../core/i18n/catalogs/addons.ts';
import { translator } from '../../core/i18n/messages.ts';

export function rehypeHeadingAnchors() {
  return (tree: Root, file: VFile): Root => {
    const lang = (file.data as { astro?: { frontmatter?: Record<string, unknown> } }).astro?.frontmatter?.['lang'];
    const parsed = parseLocale(lang);
    const t = translator(catalog, parsed.ok ? parsed.value : DEFAULT_LOCALE);
    return headingAnchors(tree, (title) => t('anchor.label', { title }));
  };
}
