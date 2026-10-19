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
const OUTER_ENVIRONMENTS = new Set(['equation', 'align', 'gather', 'multline', 'flalign', 'alignat']);

/** amsmath environments that number every row (the others number the whole display once). */
const ROW_NUMBERED = new Set(['align', 'gather', 'flalign', 'alignat']);

const isBlank = (token: TexToken | undefined): boolean => token?.kind === 'space' || token?.kind === 'comment';

/** Index of the first token that is not white space, a comment or (with `labels`) a `\label{…}` call. */
const skipLead = (tokens: readonly TexToken[], labels: boolean): number => {
  let i = 0;
  while (i < tokens.length) {
    const token = tokens[i];
    if (isBlank(token)) i += 1;
    else if (labels && token !== undefined && commandName(token) === 'label') {
      const arg = readArgument(tokens, i);
      if (arg === undefined) return i;
      i = arg.end;
    } else return i;
  }
  return i;
};

/** The outer environment the formula consists of — `{ name, starred }` — or undefined. */
const outerEnvironment = (
  tokens: readonly TexToken[],
  at: number,
): { readonly name: string; readonly starred: boolean; readonly end: number } | undefined => {
  const token = tokens[at];
  if (token === undefined || commandName(token) !== 'begin') return undefined;
  const arg = readArgument(tokens, at);
  const raw = arg?.content.trim() ?? '';
  const name = raw.endsWith('*') ? raw.slice(0, -1) : raw;
  return arg !== undefined && OUTER_ENVIRONMENTS.has(name)
    ? { name, starred: raw.endsWith('*'), end: arg.end }
    : undefined;
};

/**
 * True when the formula IS an outer environment, possibly after white space, comments and
 * `\label{…}` calls (`\label{eq:a}\n\begin{align}…` is one: wrapping it in `equation` would nest
 * display structures, an amsmath error).
 */
export const isOuterEnvironment = (tex: string): boolean => {
  const tokens = tokenize(tex);
  return outerEnvironment(tokens, skipLead(tokens, true)) !== undefined;
};

/**
 * Moves `\label{…}` calls written before an outer environment to just after its `\begin{…}` (and
 * the column count of `alignat`), where amsmath expects them; the first row then carries them.
 */
export const hoistLeadingLabels = (tex: string): string => {
  const tokens = tokenize(tex);
  const start = skipLead(tokens, true);
  const env = outerEnvironment(tokens, start);
  if (env === undefined) return tex;
  const labels: string[] = [];
  const lead: TexToken[] = [];
  for (let i = 0; i < start;) {
    const token = tokens[i];
    if (token === undefined) break;
    const arg = commandName(token) === 'label' ? readArgument(tokens, i) : undefined;
    if (arg === undefined) {
      lead.push(token);
      i += 1;
    } else {
      labels.push(print(tokens.slice(i, arg.end)));
      i = arg.end;
    }
  }
  if (labels.length === 0) return tex;
  // alignat's mandatory column count follows \begin{alignat}.
  const columns = env.name === 'alignat' ? readArgument(tokens, env.end - 1) : undefined;
  const after = columns?.end ?? env.end;
  return print(lead) + print(tokens.slice(start, after)) + labels.join('') + print(tokens.slice(after));
};

const NUMBER_CONTROL = new Set(['label', 'tag', 'notag', 'nonumber']);

/**
 * Makes LaTeX number a labelled (or tagged) display the way the site does — once. The site shows
 * one number per labelled display (`\tag{n}` for the whole formula), while amsmath's `align`,
 * `gather`, `flalign` and `alignat` number EVERY row: there, each row without `\label`, `\tag`,
 * `\notag` or `\nonumber` gets `\notag`. A starred outer environment that carries a label loses
 * its star (amsmath would not number it, and `\eqref` would show another equation's number).
 * Other formulas are returned unchanged.
 */
export const numberOnce = (tex: string): string => {
  const tokens = tokenize(tex);
  const start = skipLead(tokens, true);
  const env = outerEnvironment(tokens, start);
  if (env === undefined) return tex;
  const out: string[] = [print(tokens.slice(0, start)), `\\begin{${env.name}}`];
  let braces = 0;
  let nesting = 0;
  let row = false;
  let i = env.end;
  for (; i < tokens.length; i += 1) {
    const token = tokens[i];
    if (token === undefined) break;
    const name = commandName(token);
    if (token.kind === 'open') braces += 1;
    else if (token.kind === 'close') braces -= 1;
    else if (name === 'begin') nesting += 1;
    else if (name === 'end' && nesting > 0) nesting -= 1;
    else if (name === 'end') {
      const arg = readArgument(tokens, i);
      if (arg === undefined) break;
      if (ROW_NUMBERED.has(env.name) && !row) out.push(' \\notag');
      out.push(`\\end{${env.name}}`, print(tokens.slice(arg.end)));
      return out.join('');
    }
    if (NUMBER_CONTROL.has(name)) row = true;
    if (name === '\\' && braces === 0 && nesting === 0) {
      if (ROW_NUMBERED.has(env.name) && !row) out.push(' \\notag');
      row = false;
    }
    out.push(token.text);
  }
  return tex; // no matching \end: leave the author's formula alone
};

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
