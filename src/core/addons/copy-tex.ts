/**
 * Copy as TeX (pure part of <ft-copy-tex>).
 *
 * KaTeX's contrib "copy-tex" (katex/contrib/copy-tex, MIT) replaces, in the
 * text/plain flavour of a copy, every formula of the selection by its TeX source
 * read from the MathML <annotation encoding="application/x-tex">, and leaves the
 * text/html flavour as rendered. This module does the same with two differences:
 *   - the delimiters are the site's own math syntax, $$…$$ for inline and display
 *     formulas alike (docs/arquitetura.md §5.1: single dollars are currency), so a
 *     copied passage pastes back into a Markdown source unchanged;
 *   - block boundaries become line breaks (the contrib concatenates
 *     Node.textContent, which runs paragraphs together), and a display formula
 *     stands on its own lines, as `$$` blocks are written.
 * The shell (the island) turns the selected DOM fragment into CopyNode values.
 */
import { absurd } from '../algebra/match.ts';

export type CopyNode =
  | { readonly kind: 'text'; readonly value: string }
  | { readonly kind: 'math'; readonly tex: string; readonly display: boolean }
  | { readonly kind: 'block'; readonly children: readonly CopyNode[] }
  | { readonly kind: 'inline'; readonly children: readonly CopyNode[] };

/** The site's delimiters around a TeX source (surrounding white space of the source dropped). */
export const delimitTex = (tex: string): string => `$$${tex.trim()}$$`;

/** A display formula as the site writes it: `$$` on lines of their own. */
export const displayTex = (tex: string): string => `$$\n${tex.trim()}\n$$`;

/**
 * Plain text of a copied fragment with formulas as TeX. Blocks are separated by
 * one line break (two between consecutive display formulas and paragraphs are
 * not needed: the reader's editor reflows); leading and trailing breaks dropped.
 */
export const plainTextWithTex = (nodes: readonly CopyNode[]): string => {
  const out: string[] = [];
  const breakLine = (): void => {
    if (out.length > 0 && out[out.length - 1] !== '\n') out.push('\n');
  };
  const walk = (n: CopyNode): void => {
    switch (n.kind) {
      case 'text':
        out.push(n.value);
        return;
      case 'math':
        if (n.display) {
          breakLine();
          out.push(displayTex(n.tex));
          out.push('\n');
        } else out.push(delimitTex(n.tex));
        return;
      case 'block':
        breakLine();
        n.children.forEach(walk);
        breakLine();
        return;
      case 'inline':
        n.children.forEach(walk);
        return;
      default:
        absurd(n);
        return;
    }
  };
  nodes.forEach(walk);
  return out.join('').replace(/^\n+|\n+$/gu, '');
};
