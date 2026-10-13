/**
 * Transforms on TeX formula source: `\label`, `\tag`, `\ref`, `\eqref`.
 *
 * KaTeX (0.16–0.19) implements none of amsmath's cross-referencing
 * (`\label`, `\ref`, `\eqref` are "Undefined control sequence"), but it does
 * render `\tag{…}` in display mode, right-aligned in parentheses — exactly
 * ABNT NBR 14724 §5.7 ("algarismos arábicos, entre parênteses, alinhados à
 * direita"). The site therefore resolves references itself, the way LaTeX's
 * two-pass `.aux` mechanism does: number first, substitute afterwards.
 *
 * All functions are token-level rewrites over the lossless lexer of
 * tex-parser.ts: whatever is not a matched command call is printed back
 * byte-for-byte.
 */
import { commandName, isStarred, print, readArgument, tokenize, type TexToken } from './tex-parser.ts';

export interface LabelScan {
  /** The formula with every well-formed `\label{…}` call removed. */
  readonly tex: string;
  /** Raw arguments of the removed calls, in order (not yet parsed as Label). */
  readonly labels: readonly string[];
  /** Number of `\label` commands without a braced argument (left in place). */
  readonly malformed: number;
}

export const extractLabels = (tex: string): LabelScan => {
  const tokens = tokenize(tex);
  const kept: TexToken[] = [];
  const labels: string[] = [];
  let malformed = 0;
  let i = 0;
  while (i < tokens.length) {
    const token = tokens[i];
    if (token === undefined) break;
    if (token.kind === 'command' && commandName(token) === 'label') {
      const arg = readArgument(tokens, i);
      if (arg === undefined) {
        malformed += 1;
        kept.push(token);
        i += 1;
      } else {
        labels.push(arg.content.trim());
        i = arg.end;
      }
    } else {
      kept.push(token);
      i += 1;
    }
  }
  return { tex: print(kept), labels, malformed };
};

/** True when the formula mentions `\label` at all (well-formed or not). */
export const hasLabel = (tex: string): boolean => {
  const scan = extractLabels(tex);
  return scan.labels.length > 0 || scan.malformed > 0;
};

export interface TagScan {
  /** Raw argument of the first `\tag` / `\tag*`. */
  readonly text: string;
  readonly starred: boolean;
}

/** The author's own `\tag{…}` (amsmath), if any. */
export const findTag = (tex: string): TagScan | undefined => {
  const tokens = tokenize(tex);
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (token?.kind !== 'command' || commandName(token) !== 'tag') continue;
    const starred = isStarred(tokens, i);
    const arg = readArgument(tokens, starred ? i + 1 : i);
    if (arg !== undefined) return { text: arg.content.trim(), starred };
  }
  return undefined;
};

/**
 * Appends `\tag{n}`. The tag goes on its own line so that a trailing `%`
 * comment in the author's formula cannot swallow it.
 */
export const appendTag = (tex: string, tag: string): string => `${tex}\n\\tag{${tag}}`;

export type MathRefCommand = 'ref' | 'eqref';

export interface MathRef {
  readonly command: MathRefCommand;
  /** Raw argument (trimmed), not yet parsed as Label. */
  readonly label: string;
}

const refCommand = (token: TexToken): MathRefCommand | undefined => {
  if (token.kind !== 'command') return undefined;
  const name = commandName(token);
  return name === 'ref' || name === 'eqref' ? name : undefined;
};

/** Every `\ref{…}` / `\eqref{…}` call in the formula (comments excluded). */
export const findRefs = (tex: string): readonly MathRef[] => {
  const tokens = tokenize(tex);
  const refs: MathRef[] = [];
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i];
    const command = token === undefined ? undefined : refCommand(token);
    if (command === undefined) continue;
    const arg = readArgument(tokens, i);
    if (arg !== undefined) refs.push({ command, label: arg.content.trim() });
  }
  return refs;
};

/**
 * Replaces each reference call by `resolve(ref)`; calls for which `resolve`
 * returns undefined are kept verbatim (the caller reports them).
 */
export const replaceRefs = (tex: string, resolve: (ref: MathRef) => string | undefined): string => {
  const tokens = tokenize(tex);
  const out: string[] = [];
  let i = 0;
  while (i < tokens.length) {
    const token = tokens[i];
    if (token === undefined) break;
    const command = refCommand(token);
    const arg = command === undefined ? undefined : readArgument(tokens, i);
    const replacement =
      command === undefined || arg === undefined ? undefined : resolve({ command, label: arg.content.trim() });
    if (replacement === undefined || arg === undefined) {
      out.push(token.text);
      i += 1;
    } else {
      out.push(replacement);
      i = arg.end;
    }
  }
  return out.join('');
};

/**
 * Text of a resolved reference inside math: `\text{(3)}` for \eqref, `\text{3}`
 * for \ref. `\text` keeps the number upright and in the text font, as amsmath does.
 */
export const mathRefText = (command: MathRefCommand, number: string): string =>
  command === 'eqref' ? `\\text{(${number})}` : `\\text{${number}}`;

/**
 * Display environments that already establish their own equation context in
 * LaTeX and therefore cannot be nested inside `equation` (amsmath, §3).
 */
const OUTER_ENVIRONMENT = /^\s*\\begin\{(?:equation|align|gather|multline|flalign|alignat)\*?\}/;
export const isOuterEnvironment = (tex: string): boolean => OUTER_ENVIRONMENT.test(tex);

/**
 * Environments that KaTeX (≥ 0.13, verified on 0.19) numbers on its own with
 * a CSS counter (`.eqn-num`), exactly like unstarred amsmath environments.
 * That counter knows nothing about the document's labels, so the site would
 * show numbers that no reference can reach and that collide with ours.
 */
const AUTO_NUMBERED = new Set(['equation', 'align', 'gather', 'alignat']);

/**
 * Renames every unstarred auto-numbered environment to its starred form
 * (`\begin{align}` → `\begin{align*}`, and the matching `\end`), so that only
 * the numbers this layer assigns are shown (ABNT NBR 14724: only labelled
 * equations are numbered). Token-level and otherwise byte-preserving; the
 * caller keeps the author's original TeX in `data-tex`.
 */
export const starAutoNumbered = (tex: string): string => {
  const tokens = tokenize(tex);
  const out: string[] = [];
  let i = 0;
  while (i < tokens.length) {
    const token = tokens[i];
    if (token === undefined) break;
    const name = token.kind === 'command' ? commandName(token) : '';
    const arg = name === 'begin' || name === 'end' ? readArgument(tokens, i) : undefined;
    if (arg !== undefined && AUTO_NUMBERED.has(arg.content.trim())) {
      out.push(`${token.text}{${arg.content.trim()}*}`);
      i = arg.end;
    } else {
      out.push(token.text);
      i += 1;
    }
  }
  return out.join('');
};
