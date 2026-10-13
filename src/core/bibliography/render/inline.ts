/**
 * Inline document — the output language of the formatters.
 *
 * Formatters do not produce HTML strings: they produce this small algebraic
 * tree, which has three interpretations (catamorphisms) — plain text (sorting,
 * tests, search), an HTML string (golden tests) and hast (the Markdown pipeline).
 * Keeping semantics in the tree means the typographic convention is chosen in one
 * place and the meaning (a title, a Latin locution, a date) is never lost.
 *
 * Markup decisions (NBR 6023:2025 §6.4 and HTML Living Standard §4.5):
 *   - title  → <cite>: "the title of a work" (HTML §4.5.6). It is the ABNT
 *     "destaque" and is styled bold by CSS for ABNT (italic is the browser default,
 *     itself an admissible uniform destaque, so the markup degrades gracefully in
 *     feeds and reader modes). <strong> was rejected: it means importance, which
 *     the destaque does not convey; <b> was rejected: it carries no meaning at all.
 *   - italic → <i lang>: Latin locutions (et al., In, [S. l.]) and foreign words,
 *     with their language for assistive technology (WCAG 2.2 SC 3.1.2).
 *   - lang   → <span lang>: text in another language that is not italicised.
 *   - time   → <time datetime>: machine-readable dates (ISO 8601).
 */
import type { ElementContent, Properties } from 'hast';

export type Inline =
  | { readonly kind: 'text'; readonly value: string }
  | { readonly kind: 'title'; readonly lang?: string; readonly children: readonly Inline[] }
  | { readonly kind: 'italic'; readonly lang?: string; readonly children: readonly Inline[] }
  | { readonly kind: 'lang'; readonly lang: string; readonly children: readonly Inline[] }
  | { readonly kind: 'link'; readonly href: string; readonly children: readonly Inline[] }
  | { readonly kind: 'time'; readonly datetime: string; readonly children: readonly Inline[] };

export const text = (value: string): Inline => ({ kind: 'text', value });
export const title = (children: readonly Inline[], lang?: string): Inline =>
  lang === undefined ? { kind: 'title', children } : { kind: 'title', lang, children };
export const italic = (children: readonly Inline[], lang?: string): Inline =>
  lang === undefined ? { kind: 'italic', children } : { kind: 'italic', lang, children };
export const latin = (value: string): Inline => ({ kind: 'italic', lang: 'la', children: [text(value)] });
export const inLang = (lang: string | undefined, children: readonly Inline[]): readonly Inline[] =>
  lang === undefined ? children : [{ kind: 'lang', lang, children }];
export const link = (href: string, children: readonly Inline[]): Inline => ({ kind: 'link', href, children });
export const time = (datetime: string, children: readonly Inline[]): Inline => ({ kind: 'time', datetime, children });

/** Plain-text interpretation (what a reader would copy). */
export const toPlainText = (nodes: readonly Inline[]): string =>
  nodes.map((n) => (n.kind === 'text' ? n.value : toPlainText(n.children))).join('');

const escapeText = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escapeAttr = (s: string): string => escapeText(s).replace(/"/g, '&quot;');

/** HTML-string interpretation (deterministic; used by golden tests and non-unified consumers). */
export const toHtml = (nodes: readonly Inline[]): string =>
  nodes
    .map((n): string => {
      switch (n.kind) {
        case 'text':
          return escapeText(n.value);
        case 'title':
          return `<cite${n.lang === undefined ? '' : ` lang="${escapeAttr(n.lang)}"`}>${toHtml(n.children)}</cite>`;
        case 'italic':
          return `<i${n.lang === undefined ? '' : ` lang="${escapeAttr(n.lang)}"`}>${toHtml(n.children)}</i>`;
        case 'lang':
          return `<span lang="${escapeAttr(n.lang)}">${toHtml(n.children)}</span>`;
        case 'link':
          return `<a href="${escapeAttr(n.href)}">${toHtml(n.children)}</a>`;
        case 'time':
          return `<time datetime="${escapeAttr(n.datetime)}">${toHtml(n.children)}</time>`;
      }
    })
    .join('');

const element = (tagName: string, properties: Properties, children: readonly Inline[]): ElementContent => ({
  type: 'element',
  tagName,
  properties,
  children: toHast(children),
});

/** hast interpretation (https://github.com/syntax-tree/hast), for remark-rehype's hChildren. */
export const toHast = (nodes: readonly Inline[]): ElementContent[] =>
  nodes.map((n): ElementContent => {
    switch (n.kind) {
      case 'text':
        return { type: 'text', value: n.value };
      case 'title':
        return element('cite', n.lang === undefined ? {} : { lang: n.lang }, n.children);
      case 'italic':
        return element('i', n.lang === undefined ? {} : { lang: n.lang }, n.children);
      case 'lang':
        return element('span', { lang: n.lang }, n.children);
      case 'link':
        return element('a', { href: n.href }, n.children);
      case 'time':
        return element('time', { dateTime: n.datetime }, n.children);
    }
  });

/** Merges adjacent text nodes (normal form: makes structural equality meaningful). */
export const normalize = (nodes: readonly Inline[]): readonly Inline[] => {
  const out: Inline[] = [];
  for (const n of nodes) {
    if (n.kind === 'text') {
      if (n.value === '') continue;
      const last = out.at(-1);
      if (last?.kind === 'text') out[out.length - 1] = text(last.value + n.value);
      else out.push(n);
    } else {
      out.push({ ...n, children: normalize(n.children) });
    }
  }
  return out;
};

/** Last character of the plain text, for the punctuation engine. */
export const lastChar = (nodes: readonly Inline[]): string => toPlainText(nodes).trimEnd().slice(-1);
