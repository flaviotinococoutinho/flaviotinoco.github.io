/**
 * Localises the GFM footnote section produced by remark-rehype, whose labels are
 * hard-coded in English ("Footnotes", "Back to reference 1"), using the document
 * language from the frontmatter. Only attributes and the heading text change; the
 * footnote content is untouched.
 */
import type { Element, Root } from 'hast';
import type { VFile } from 'vfile';
import { visit } from 'unist-util-visit';
import { isLocale, type Locale } from '../../core/domain/locale.ts';

const LABELS: Readonly<Record<Locale, { readonly heading: string; readonly back: (n: string) => string }>> = {
  'pt-BR': { heading: 'Notas', back: (n) => `Voltar à chamada ${n}` },
  en: { heading: 'Notes', back: (n) => `Back to reference ${n}` },
};

export function rehypeFootnotesI18n() {
  return (tree: Root, file: VFile): void => {
    const lang = (file.data as { astro?: { frontmatter?: Record<string, unknown> } }).astro?.frontmatter?.['lang'];
    if (!isLocale(lang)) return;
    const labels = LABELS[lang];
    visit(tree, 'element', (node: Element) => {
      if (node.properties['id'] === 'footnote-label') {
        node.children = [{ type: 'text', value: labels.heading }];
      }
      const className = node.properties['className'];
      if (Array.isArray(className) && className.includes('data-footnote-backref')) {
        const label = String(node.properties['ariaLabel'] ?? '');
        const n = /(\d+(?:-\d+)?)\s*$/.exec(label)?.[1] ?? '';
        node.properties['ariaLabel'] = labels.back(n);
      }
    });
  };
}
