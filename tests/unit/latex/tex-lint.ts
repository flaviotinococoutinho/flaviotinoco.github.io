/**
 * A conservative static check of generated LaTeX, standing in for pdflatex
 * (not available in CI). It models just enough of TeX's input processor
 * (The TeXbook, ch. 7–8) to prove the properties the exporter promises:
 *
 *   - every \begin{x} has its \end{x}, properly nested;
 *   - braces are balanced (escaped \{ \} excluded), never closing below zero;
 *   - in text mode there is no bare # _ ^ (they would be macro parameters,
 *     sub/superscripts) and no & outside tabular/alignment environments;
 *   - `%` only starts whole-line comments in text mode (a mid-line `%` would
 *     silently swallow the rest of the line);
 *   - math delimiters ($ … $, \[ \], math environments) are balanced, and no
 *     display environment sits inside another (amsmath "Erroneous nesting");
 *   - text prints as written: no `'` `` ` `` `"` (TeX's fonts print quotes for
 *     them) and no input ligature `--` `,,` `<<` `>>` outside math;
 *   - nothing is put where LaTeX loses or rejects it: no verbatim environment
 *     in a command's argument (TeX FAQ "verbwithin"), no \footnote in a tabular
 *     or float (its text is lost, FAQ "footintab") or in another footnote, no
 *     \marginpar in a footnote, tabular or float ("Not in outer par mode"), no
 *     link (\ref, \href, \url, citations) inside the text of an \href.
 *
 * Verbatim environments and the URL/file arguments of \href, \url and
 * \includegraphics are opaque, as they are to TeX.
 */
export interface LintProblem {
  readonly line: number;
  readonly message: string;
}

const MATH_ENVS = /^(?:equation|align|gather|alignat|multline|flalign)\*?$/;
const ALIGN_ENVS =
  /^(?:tabular|align|alignat|flalign)\*?$|^(?:aligned|alignedat|split|matrix|pmatrix|bmatrix|vmatrix|Vmatrix|cases|array)$/;
/** LaTeX's verbatim, fancyvrb's Verbatim and the exporter's \DefineVerbatimEnvironment copies. */
const VERBATIM_ENV = /^(?:verbatim|Verbatim|SaveVerbatim|ftverbatim\d*)$/;
/** Where a footnote's text is lost and a \marginpar is rejected. */
const TRAP_ENVS = /^(?:tabular|figure|table|ftchart|ftframe)\*?$/;
/** Commands that make a PDF link. */
const LINKS = new Set(['ref', 'eqref', 'href', 'url', 'autoref', 'pageref', 'parencite', 'parencites', 'textcite']);
/** Commands whose arguments are not typeset text: URLs, files, labels and citation keys. */
const OPAQUE_ARGUMENTS = new Set([
  'href',
  'url',
  'includegraphics',
  'label',
  'ref',
  'eqref',
  'parencite',
  'parencites',
  'textcite',
]);

const isLetter = (c: string): boolean => /[A-Za-z]/.test(c);

export interface LintOptions {
  /**
   * Preamble mode: macro definitions legitimately contain # parameters, math
   * bodies (_ ^) and end-of-line % — only structure (braces, environments) is checked.
   */
  readonly preamble?: boolean;
}

export const lintTex = (tex: string, options: LintOptions = {}): readonly LintProblem[] => {
  const problems: LintProblem[] = [];
  const envs: string[] = [];
  /** Brace groups that are a command's argument: the command and the depth inside the group. */
  const frames: { readonly name: string; readonly depth: number }[] = [];
  let argumentOwner: { readonly name: string; readonly at: number } | undefined;
  let depth = 0;
  let inlineMath = false;
  let displayMath = false;
  let line = 1;
  let i = 0;
  const report = (message: string): void => {
    problems.push({ line, message });
  };
  const inMath = (): boolean => inlineMath || displayMath || envs.some((e) => MATH_ENVS.test(e));
  const inFrame = (name: string): boolean => frames.some((f) => f.name === name);
  const trapped = (): boolean => envs.some((e) => TRAP_ENVS.test(e));
  /** A balanced group from `from` (braces nested inside a [ ] group are skipped). */
  const readGroup = (
    from: number,
    open = '{',
    close = '}',
  ): { readonly content: string; readonly end: number } | undefined => {
    if (tex.charAt(from) !== open) return undefined;
    let d = 0;
    let braces = 0;
    for (let j = from; j < tex.length; j += 1) {
      const c = tex.charAt(j);
      if (c === '\\') j += 1;
      else if (open === '[' && c === '{') braces += 1;
      else if (open === '[' && c === '}') braces -= 1;
      else if (braces > 0) continue;
      else if (c === open) d += 1;
      else if (c === close) {
        d -= 1;
        if (d === 0) return { content: tex.slice(from + 1, j), end: j + 1 };
      }
    }
    return undefined;
  };
  const advance = (to: number): void => {
    for (let k = i; k < to; k += 1) if (tex.charAt(k) === '\n') line += 1;
    i = to;
  };

  while (i < tex.length) {
    const c = tex.charAt(i);
    if (c === '\\') {
      const next = tex.charAt(i + 1);
      if (!isLetter(next)) {
        if (next === '[') displayMath = true;
        if (next === ']') displayMath = false;
        advance(i + 2);
        continue;
      }
      let j = i + 1;
      while (j < tex.length && isLetter(tex.charAt(j))) j += 1;
      const name = tex.slice(i + 1, j);
      if (name === 'begin' || name === 'end') {
        const group = readGroup(j);
        if (group === undefined) {
          report(`\\${name} without {name}`);
          advance(j);
          continue;
        }
        if (name === 'begin') {
          if (VERBATIM_ENV.test(group.content) && frames.length > 0) {
            report(`${group.content} environment inside the argument of \\${frames[frames.length - 1]?.name ?? ''}`);
          }
          if (MATH_ENVS.test(group.content) && options.preamble !== true && inMath()) {
            report(`display environment ${group.content} nested in another display`);
          }
          if (VERBATIM_ENV.test(group.content)) {
            const close = `\\end{${group.content}}`;
            const end = tex.indexOf(close, group.end);
            if (end === -1) report(`unterminated ${group.content}`);
            advance(end === -1 ? tex.length : end + close.length);
            continue;
          }
          envs.push(group.content);
        } else {
          const open = envs.pop();
          if (open !== group.content) report(`\\end{${group.content}} closes \\begin{${open ?? '(nothing)'}}`);
        }
        advance(group.end);
        continue;
      }
      if (options.preamble !== true) {
        // hyperref's starred \ref* / \pageref* make no link.
        if (LINKS.has(name) && tex.charAt(j) !== '*' && inFrame('href'))
          report(`\\${name} inside the text of an \\href (nested links)`);
        if (name === 'footnote' && trapped()) report('\\footnote inside a tabular or float (its text is lost)');
        if (name === 'footnote' && inFrame('footnote')) report('\\footnote inside a footnote (its text is lost)');
        if (name === 'marginpar' && (trapped() || inFrame('footnote'))) {
          report('\\marginpar inside a footnote, tabular or float (not in outer par mode)');
        }
      }
      if (OPAQUE_ARGUMENTS.has(name)) {
        // \href takes {url}{text}: only the first group is opaque. The others take
        // any sequence of [opt] and {mandatory} arguments (\parencites[a][b]{k}[c]{l}).
        let k = j;
        if (tex.charAt(k) === '*') k += 1;
        for (;;) {
          const group = tex.charAt(k) === '[' ? readGroup(k, '[', ']') : readGroup(k);
          if (group === undefined) break;
          k = group.end;
          if (name === 'href' && tex.charAt(group.end - 1) === '}') break;
        }
        if (name === 'href' && tex.charAt(k) === '{') argumentOwner = { name, at: k };
        advance(Math.max(k, j));
        continue;
      }
      if (tex.charAt(j) === '{') argumentOwner = { name, at: j };
      advance(j);
      continue;
    }
    if (c === '%') {
      const lineStart = tex.lastIndexOf('\n', i - 1) + 1;
      // `text%` + line break swallows only the break (a TeX idiom); anything else
      // after a mid-line % would be text silently commented out.
      const end = tex.indexOf('\n', i);
      const rest = tex.slice(i + 1, end === -1 ? tex.length : end);
      if (options.preamble !== true && !inMath() && tex.slice(lineStart, i).trim() !== '' && rest.trim() !== '') {
        report('mid-line % comment in text mode');
      }
      advance(end === -1 ? tex.length : end);
      continue;
    }
    if (c === '{') {
      depth += 1;
      if (argumentOwner?.at === i) frames.push({ name: argumentOwner.name, depth });
    } else if (c === '}') {
      if (frames[frames.length - 1]?.depth === depth) frames.pop();
      depth -= 1;
      if (depth < 0) {
        report('unbalanced }');
        depth = 0;
      }
    } else if (c === '$') {
      inlineMath = !inlineMath;
    } else if (options.preamble === true) {
      // structure only
    } else if (c === '#') {
      report('bare # (macro parameter character)');
    } else if (!inMath() && (c === '_' || c === '^')) {
      report(`bare ${c} in text mode`);
    } else if (c === '&' && !envs.some((e) => ALIGN_ENVS.test(e))) {
      report('bare & outside an alignment');
    } else if (!inMath() && (c === "'" || c === '`' || c === '"' || c === '<' || c === '>')) {
      report(`bare ${c} in text mode (it does not print as itself)`);
    } else if (!inMath() && (c === '-' || c === ',') && tex.charAt(i + 1) === c) {
      report(`${c}${c} in text mode (a TeX input ligature)`);
    }
    advance(i + 1);
  }
  if (depth !== 0) problems.push({ line, message: `${String(depth)} unclosed {` });
  if (envs.length > 0) problems.push({ line, message: `unclosed environments: ${envs.join(', ')}` });
  if (inlineMath || displayMath) problems.push({ line, message: 'unclosed math' });
  return problems;
};

/** Splits a document at \begin{document}: the preamble (macro definitions) and the body. */
export const split = (tex: string): { readonly preamble: string; readonly body: string } => {
  const start = tex.indexOf('\\begin{document}');
  return start === -1 ? { preamble: tex, body: '' } : { preamble: tex.slice(0, start), body: tex.slice(start) };
};

/** Every problem of a complete document: structure only in the preamble, everything in the body. */
export const lintDocument = (tex: string): readonly LintProblem[] => {
  const { preamble, body } = split(tex);
  const offset = preamble.split('\n').length - 1;
  return [...lintTex(preamble, { preamble: true }), ...lintTex(body).map((p) => ({ ...p, line: p.line + offset }))];
};
