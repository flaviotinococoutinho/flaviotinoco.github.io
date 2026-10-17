/**
 * Inline document — the output language of the formatters.
 *
 * Formatters do not produce HTML strings: they produce this small algebraic
 * tree, which has three interpretations (catamorphisms) — plain text (sorting,
 * tests, search), an HTML string (golden tests) and hast (the Markdown pipeline,
 * in src/adapters/unified/remark-citations.ts). Keeping semantics in the tree means
 * the typographic convention is chosen in one place and the meaning (a title, a
 * Latin locution, a date) is never lost.
 *
 * Markup decisions (NBR 6023:2025 §6.4 and HTML Living Standard §4.5):
 *   - title  → <cite>: "the title of a work" (HTML §4.5.6). It carries the ABNT
 *     destaque and is styled BOLD by CSS for ABNT lists (bold is what the norm's
 *     own examples use, and it keeps italics free for Latin and foreign words).
 *     Without CSS (feeds, reader modes) browsers render <cite> in italics — itself
 *     an admissible uniform destaque under §6.4 — so the emphasis degrades
 *     gracefully instead of disappearing. <strong> was rejected: it means
 *     importance, which the destaque does not convey; <b> was rejected: it would
 *     be accurate typography but carries no meaning for assistive technology.
 *   - italic → <i lang>: Latin locutions (et al., In, [S. l.]) and foreign words,
 *     with their language for assistive technology (WCAG 2.2 SC 3.1.2).
 *   - lang   → <span lang>: text in another language that is not italicised.
 *   - time   → <time datetime>: machine-readable dates (ISO 8601).
 */

export type Inline =
  | { readonly kind: 'text'; readonly value: string }
  | { readonly kind: 'title'; readonly lang?: string; readonly children: readonly Inline[] }
  | { readonly kind: 'italic'; readonly lang?: string; readonly children: readonly Inline[] }
  | { readonly kind: 'lang'; readonly lang: string; readonly children: readonly Inline[] }
  | { readonly kind: 'link'; readonly href: string; readonly id?: string; readonly children: readonly Inline[] }
  | { readonly kind: 'time'; readonly datetime: string; readonly children: readonly Inline[] };

export const text = (value: string): Inline => ({ kind: 'text', value });
export const title = (children: readonly Inline[], lang?: string): Inline =>
  lang === undefined ? { kind: 'title', children } : { kind: 'title', lang, children };
export const italic = (children: readonly Inline[], lang?: string): Inline =>
  lang === undefined ? { kind: 'italic', children } : { kind: 'italic', lang, children };
/** A Latin locution (et al., In, [S. l.], apud): italic, lang="la" (NBR 10520/6023 typesetting). */
export const latin = (value: string): Inline => ({ kind: 'italic', lang: 'la', children: [text(value)] });
/** Marks a fragment as being in `lang`; a lone <cite>/<i> takes the attribute itself (no extra <span>). */
export const inLang = (lang: string | undefined, children: readonly Inline[]): readonly Inline[] => {
  if (lang === undefined) return children;
  const only = children.length === 1 ? children[0] : undefined;
  if ((only?.kind === 'title' || only?.kind === 'italic') && only.lang === undefined) return [{ ...only, lang }];
  return [{ kind: 'lang', lang, children }];
};
export const link = (href: string, children: readonly Inline[], id?: string): Inline =>
  id === undefined ? { kind: 'link', href, children } : { kind: 'link', href, id, children };
export const time = (datetime: string, children: readonly Inline[]): Inline => ({ kind: 'time', datetime, children });

/** Plain-text interpretation (what a reader would copy). */
export const toPlainText = (nodes: readonly Inline[]): string =>
  nodes.map((n) => (n.kind === 'text' ? n.value : toPlainText(n.children))).join('');

const escapeText = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escapeAttr = (s: string): string => escapeText(s).replace(/"/g, '&quot;');
const langAttr = (lang: string | undefined): string => (lang === undefined ? '' : ` lang="${escapeAttr(lang)}"`);

/** HTML-string interpretation (deterministic; used by golden tests and non-unified consumers). */
export const toHtml = (nodes: readonly Inline[]): string =>
  nodes
    .map((n): string => {
      switch (n.kind) {
        case 'text':
          return escapeText(n.value);
        case 'title':
          return `<cite${langAttr(n.lang)}>${toHtml(n.children)}</cite>`;
        case 'italic':
          return `<i${langAttr(n.lang)}>${toHtml(n.children)}</i>`;
        case 'lang':
          return `<span lang="${escapeAttr(n.lang)}">${toHtml(n.children)}</span>`;
        case 'link':
          return `<a href="${escapeAttr(n.href)}"${n.id === undefined ? '' : ` id="${escapeAttr(n.id)}"`}>${toHtml(n.children)}</a>`;
        case 'time':
          return `<time datetime="${escapeAttr(n.datetime)}">${toHtml(n.children)}</time>`;
      }
    })
    .join('');

/** Last character of the plain text, for the punctuation engine. */
export const lastChar = (nodes: readonly Inline[]): string => toPlainText(nodes).trimEnd().slice(-1);
