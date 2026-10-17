/**
 * Transform: ASCII punctuation → typographic punctuation, by the rules the site applies to body text.
 *
 * Astro's `smartypants: true` runs remark-smartypants 3 (retext-smartypants 6, default options) on
 * every text node BEFORE the custom stages: straight quotes become curly, `--` an em dash, a run of
 * three or more dots an ellipsis, ``` `` ``` and `''` double quotes. Text that reaches the page from a
 * directive ATTRIBUTE (`title="…"`, `source="…"`) never meets it, so the latex stage and the .tex
 * exporter pass such text through this function: a title then reads like the body around it, on the
 * site and on paper.
 *
 * Model. retext-smartypants decides each quote from its neighbours in a natural-language syntax tree,
 * so this module rebuilds that tree as parse-latin 7 does for one paragraph (T. Wormer, NLCST):
 * tokens (runs of white space, of word characters, of ONE repeated other character, so `--` is one
 * token), the sentence plugins that merge symbols into words (`d'água`, `e.g.`, `a/b`, a final `-`),
 * sentences split after terminal marks (`.` `?` `!` `…` `‽`) and the paragraph plugins that merge them
 * back (non-word sentences, affix symbols, lower-case or digit starts, abbreviations, stray full
 * stops) and move edge white space out. Then, as remark-smartypants does, two passes over the leaves:
 * quotes (J. Gruber's SmartyPants rules as in `quotesDefault`) on the text preceded by a space, its
 * block separator; then ellipses, double backticks/apostrophes and `--` on the result. A property test
 * compares the output with the site's own SmartyPants.
 *
 * Not injective (`"` and `“` both give `“`): callers keep the original in a `data-*` attribute.
 */

/** White space, punctuation or symbol ("other"), or — inside a word — a run of word characters. */
interface Leaf {
  readonly kind: 'space' | 'other' | 'text';
  value: string;
}

interface Word {
  readonly kind: 'word';
  readonly children: Leaf[];
}

type Token = Leaf | Word;

interface Sentence {
  readonly kind: 'sentence';
  children: Token[];
}

type ParagraphChild = Sentence | Leaf;

const valueOf = (node: Token | Sentence): string =>
  node.kind === 'word' || node.kind === 'sentence' ? node.children.map(valueOf).join('') : node.value;

const isOther = (node: Token | ParagraphChild | undefined): node is Leaf => node?.kind === 'other';
const isWord = (node: Token | undefined): node is Word => node?.kind === 'word';
const isSentence = (node: ParagraphChild | undefined): node is Sentence => node?.kind === 'sentence';

// parse-latin expressions (lib/expressions.js), restricted to what these rules test.
const WHITE_SPACE = /[\t-\r \u0085\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]/u;
const WORD = /[\p{L}\p{M}\p{N}]/u;
const SURROGATE = /[\uD800-\uDFFF]/;
const TERMINAL_MARKER = /^[!.?\u2026\u203D]+$/u;
const AFFIX_SYMBOL = /^([!"').?\u2019\u201D\u2026\u203A\u203D\u00BB\]}])\1*$/u;
const INNER_SYMBOL = /^(?:[&'\-.:=?@\u00AD\u00B7\u2010\u2011\u2019\u2027]|_+)$/u;
const LOWER_INITIAL = /^\p{Ll}/u;
const DIGIT_START = /^\d/u;
const NUMERICAL = /^\p{N}$/u;
const ABBREVIATION_PREFIX =
  /^(?:[0-9]{1,3}|[a-z]|al|ca|cap|cca|cent|cf|cit|con|cp|cwt|ead|etc|ff|fl|ibid|id|nem|op|pro|seq|sic|stat|tem|viz)$/u;

/** parse-latin `tokenize`: classifies UTF-16 units, as it does (an astral letter is a symbol there). */
const tokenize = (text: string): Token[] => {
  const tokens: Token[] = [];
  let from = 0;
  let previousKind: 'space' | 'word' | 'other' | undefined;
  const push = (to: number): void => {
    const value = text.slice(from, to);
    if (previousKind === 'word') tokens.push({ kind: 'word', children: [{ kind: 'text', value }] });
    else if (previousKind !== undefined) tokens.push({ kind: previousKind, value });
  };
  for (let index = 0; index < text.length; index += 1) {
    const current = text.charAt(index);
    const kind = WHITE_SPACE.test(current) ? 'space' : WORD.test(current) ? 'word' : 'other';
    const merges =
      kind === previousKind && (kind !== 'other' || current === text.charAt(index - 1) || SURROGATE.test(current));
    if (index > from && previousKind !== undefined && !merges) {
      push(index);
      from = index;
    }
    previousKind = kind;
  }
  push(text.length);
  return tokens;
};

/** unist-util-modify-children / array-iterate: a returned index is where the iteration continues. */
const modify = <T>(nodes: T[], step: (node: T, index: number) => number | undefined): void => {
  for (let index = 0; index < nodes.length;) {
    const node = nodes[index] as T;
    index = step(node, index) ?? index + 1;
  }
};

/** parse-latin's sentence plugins (they move symbols into words). */
const mergeWords = (nodes: Token[]): void => {
  // mergeInitialWordSymbol: "&" before a word and not after one.
  modify(nodes, (node, index) => {
    const next = nodes[index + 1];
    if (!isOther(node) || node.value !== '&' || !isWord(next) || isWord(nodes[index - 1])) return undefined;
    nodes.splice(index, 1);
    next.children.unshift(node);
    return index - 1;
  });
  // mergeFinalWordSymbol: "-" after a word and not before one.
  modify(nodes, (node, index) => {
    const previous = nodes[index - 1];
    if (!isOther(node) || node.value !== '-' || !isWord(previous) || isWord(nodes[index + 1])) return undefined;
    nodes.splice(index, 1);
    previous.children.push(node);
    return index;
  });
  // mergeInnerWordSymbol: word (inner-symbol* word)+ is one word.
  modify(nodes, (node, index) => {
    const previous = nodes[index - 1];
    if (!isOther(node) || !isWord(previous)) return undefined;
    const absorbed: Leaf[] = [];
    let queue: Leaf[] = [];
    let position = index;
    for (; position < nodes.length; position += 1) {
      const sibling = nodes[position];
      if (isWord(sibling)) {
        absorbed.push(...queue, ...sibling.children);
        queue = [];
      } else if (isOther(sibling) && INNER_SYMBOL.test(sibling.value)) queue.push(sibling);
      else break;
    }
    if (absorbed.length === 0) return undefined;
    nodes.splice(index, position - queue.length - index);
    previous.children.push(...absorbed);
    return index;
  });
  // mergeInnerWordSlash: "a/b" when both sides are shorter than three characters.
  modify(nodes, (node, index) => {
    const previous = nodes[index - 1];
    if (!isWord(previous) || !isOther(node) || node.value !== '/') return undefined;
    const next = nodes[index + 1];
    const nextValue = isWord(next) ? valueOf(next) : '';
    if (valueOf(previous).length >= 3 || nextValue.length >= 3) return undefined;
    nodes.splice(index, isWord(next) ? 2 : 1);
    previous.children.push(node, ...(isWord(next) ? next.children : []));
    return index;
  });
  // mergeInitialisms: "e.g." — single characters alternating with dots, not all digits.
  modify(nodes, (node, index) => {
    const previous = nodes[index - 1];
    if (!isOther(node) || node.value !== '.' || !isWord(previous)) return undefined;
    const children = previous.children;
    if (children.length === 1 || children.length % 2 === 0) return undefined;
    let allDigits = true;
    for (let position = children.length - 1; position >= 0; position -= 1) {
      const value = children[position]?.value ?? '';
      if (position % 2 === 0) {
        if (value.length > 1) return undefined;
        if (!NUMERICAL.test(value)) allDigits = false;
      } else if (value !== '.') {
        if (position < children.length - 2) break;
        return undefined;
      }
    }
    if (allDigits) return undefined;
    nodes.splice(index, 1);
    children.push(node);
    return index;
  });
};

/** parse-latin `splitNode` for sentences: a sentence ends after each terminal mark. */
const splitSentences = (tokens: readonly Token[]): ParagraphChild[] => {
  const sentences: ParagraphChild[] = [];
  let start = 0;
  tokens.forEach((token, index) => {
    if (index === tokens.length - 1 || (isOther(token) && TERMINAL_MARKER.test(token.value))) {
      sentences.push({ kind: 'sentence', children: tokens.slice(start, index + 1) });
      start = index + 1;
    }
  });
  return sentences;
};

/** parse-latin's paragraph plugins, in order. */
const mergeSentences = (children: ParagraphChild[]): void => {
  // mergeNonWordSentences: a sentence without words joins the previous one (or else the next).
  modify(children, (child, index) => {
    if (!isSentence(child) || child.children.some(isWord)) return undefined;
    const previous = children[index - 1];
    if (isSentence(previous)) {
      previous.children.push(...child.children);
      children.splice(index, 1);
      return index;
    }
    const next = children[index + 1];
    if (isSentence(next)) {
      next.children.unshift(...child.children);
      children.splice(index, 1);
    }
    return undefined;
  });
  // mergeAffixSymbol: a closing quote/bracket that starts a sentence ends the previous one.
  modify(children, (child, index) => {
    const previous = children[index - 1];
    const first = isSentence(child) ? child.children[0] : undefined;
    if (index === 0 || !isSentence(child) || !isSentence(previous) || !isOther(first)) return undefined;
    if (!AFFIX_SYMBOL.test(first.value)) return undefined;
    child.children.shift();
    previous.children.push(first);
    return index - 1;
  });
  // mergeInitialLowerCaseLetterSentences: a sentence whose first word starts in lower case continues the previous.
  modify(children, (child, index) => {
    const previous = children[index - 1];
    if (index === 0 || !isSentence(child) || !isSentence(previous)) return undefined;
    for (const node of child.children) {
      if (isWord(node)) {
        if (!LOWER_INITIAL.test(valueOf(node))) return undefined;
        previous.children.push(...child.children);
        children.splice(index, 1);
        return index;
      }
      if (isOther(node)) return undefined;
    }
    return undefined;
  });
  // mergeInitialDigitSentences: so does one that starts with a number.
  modify(children, (child, index) => {
    const previous = children[index - 1];
    if (!isSentence(previous) || !isSentence(child)) return undefined;
    const head = child.children[0];
    if (!isWord(head) || !DIGIT_START.test(valueOf(head))) return undefined;
    previous.children.push(...child.children);
    children.splice(index, 1);
    return index;
  });
  // mergePrefixExceptions: "cf." and the like do not end a sentence.
  modify(children, (child, index) => {
    if (!isSentence(child) || child.children.length <= 1) return undefined;
    const period = child.children[child.children.length - 1];
    const node = child.children[child.children.length - 2];
    if (!isOther(period) || period.value !== '.' || !isWord(node)) return undefined;
    if (!ABBREVIATION_PREFIX.test(valueOf(node).toLowerCase())) return undefined;
    node.children.push(period);
    child.children.pop();
    const next = children[index + 1];
    if (isSentence(next)) {
      child.children.push(...next.children);
      children.splice(index + 1, 1);
      return index - 1;
    }
    return undefined;
  });
  // mergeAffixExceptions: a sentence that starts with "," or ";" continues the previous.
  modify(children, (child, index) => {
    const previous = children[index - 1];
    if (!isSentence(previous) || !isSentence(child) || child.children.length === 0) return undefined;
    for (const node of child.children) {
      if (isWord(node)) return undefined;
      if (isOther(node)) {
        if (node.value !== ',' && node.value !== ';') return undefined;
        previous.children.push(...child.children);
        children.splice(index, 1);
        return index;
      }
    }
    return undefined;
  });
  // mergeRemainingFullStops: a "." that does not end the sentence joins the word beside it.
  for (const child of children) {
    if (!isSentence(child)) continue;
    const nodes = child.children;
    let found = false;
    for (let position = nodes.length - 1; position >= 0; position -= 1) {
      const node = nodes[position];
      if (!isOther(node)) {
        if (isWord(node)) found = true;
        continue;
      }
      if (!TERMINAL_MARKER.test(node.value)) continue;
      if (!found) {
        found = true;
        continue;
      }
      if (node.value !== '.') continue;
      const previous = nodes[position - 1];
      const next = nodes[position + 1];
      if (isWord(previous)) {
        if (
          next?.kind === 'space' &&
          nodes[position + 2] !== undefined &&
          valueOf(nodes[position + 2] as Token) === '.'
        )
          continue;
        nodes.splice(position, 1);
        previous.children.push(node);
        position -= 1;
      } else if (isWord(next)) {
        nodes.splice(position, 1);
        next.children.unshift(node);
      }
    }
  }
  // makeInitialWhiteSpaceSiblings, makeFinalWhiteSpaceSiblings: edge white space leaves the sentence.
  for (let index = 0; index < children.length; index += 1) {
    const child = children[index];
    const head = isSentence(child) ? child.children[0] : undefined;
    if (isSentence(child) && head?.kind === 'space') {
      child.children.shift();
      children.splice(index, 0, head);
    }
  }
  modify(children, (child, index) => {
    const tail = isSentence(child) ? child.children[child.children.length - 1] : undefined;
    if (!isSentence(child) || tail?.kind !== 'space') return undefined;
    child.children.pop();
    children.splice(index + 1, 0, tail);
    return index;
  });
  // removeEmptyNodes.
  modify(children, (child, index) => {
    if (!isSentence(child) || child.children.length > 0) return undefined;
    children.splice(index, 1);
    return index;
  });
};

const parseParagraph = (text: string): ParagraphChild[] => {
  const tokens = tokenize(text);
  mergeWords(tokens);
  const children = splitSentences(tokens);
  mergeSentences(children);
  return children;
};

/** Every punctuation/symbol leaf in document order, with its sibling list and index (unist-util-visit). */
const eachOther = (paragraph: readonly ParagraphChild[], visit: (siblings: Token[], index: number) => void): void => {
  for (const child of paragraph) {
    if (!isSentence(child)) continue;
    // The sentence's list may shrink while visiting (spaced ellipses), so it is re-read each step.
    for (let index = 0; index < child.children.length; index += 1) {
      const node = child.children[index];
      if (isOther(node)) visit(child.children, index);
      else if (isWord(node)) node.children.forEach((leaf, i) => leaf.kind === 'other' && visit(node.children, i));
    }
  }
};

const OPEN = { '"': '“', "'": '‘' } as const;
const CLOSE = { '"': '”', "'": '’' } as const;

/** retext-smartypants `quotesDefault`, case by case (inside a word, its text runs are not WordNodes). */
const educateQuote = (siblings: readonly Token[], index: number, quote: '"' | "'"): string => {
  const previous = siblings[index - 1];
  const next = siblings[index + 1];
  const nextNext = siblings[index + 2];
  const nextValue = next === undefined ? '' : valueOf(next);
  if (isOther(next) && !isWord(nextNext)) return CLOSE[quote];
  if (isOther(next) && (nextValue === '"' || nextValue === "'") && isWord(nextNext)) {
    // Nested opening quotes, `"'Quoted' words"`: the inner one opens too.
    next.value = OPEN[nextValue];
    return OPEN[quote];
  }
  if (next !== undefined && /^\d\ds$/u.test(nextValue)) return CLOSE[quote]; // decades: '80s
  if ((previous?.kind === 'space' || isOther(previous)) && isWord(next)) return OPEN[quote];
  if (previous !== undefined && previous.kind !== 'space' && !isOther(previous)) return CLOSE[quote];
  if (next === undefined || next.kind === 'space' || (quote === "'" && nextValue === 's')) return CLOSE[quote];
  return OPEN[quote];
};

const DOTS = /^\.+$/u;

/**
 * retext-smartypants `ellipsesSpaced` at the dot leaf `index`: how many siblings before it belong to
 * a run of three or more dot leaves separated by white space (". . ."), else 0. As in the original,
 * a white-space sibling at index 0 is not looked at.
 */
const spacedEllipsis = (siblings: readonly Token[], index: number): number => {
  let position = index;
  let count = 1;
  while (position - 1 > 0 && siblings[position - 1]?.kind === 'space') {
    const dot = siblings[position - 2];
    if (!isOther(dot) || !DOTS.test(dot.value)) break;
    position -= 2;
    count += 1;
  }
  return count >= 3 ? index - position : 0;
};

const paragraphText = (paragraph: readonly ParagraphChild[]): string => paragraph.map(valueOf).join('');

export const smartPunctuation = (text: string): string => {
  // Pass 1: quotes, on " " + text (remark-smartypants' block separator: a leading quote opens).
  const quoted = parseParagraph(` ${text}`);
  eachOther(quoted, (siblings, index) => {
    const leaf = siblings[index] as Leaf;
    if (leaf.value === '"' || leaf.value === "'") leaf.value = educateQuote(siblings, index, leaf.value);
  });
  // Pass 2: ellipses, backticks and dashes, on the text node as pass 1 left it.
  const paragraph = parseParagraph(paragraphText(quoted).slice(1));
  eachOther(paragraph, (siblings, index) => {
    const leaf = siblings[index] as Leaf;
    if (DOTS.test(leaf.value)) {
      const run = spacedEllipsis(siblings, index);
      if (run > 0) {
        // The visitor then goes on at index + 1 of the shortened list: the `run` siblings after the
        // ellipsis are skipped, as with unist-util-visit.
        siblings.splice(index - run, run);
        leaf.value = '…';
      }
    }
    if (/^\.{3,}$/u.test(leaf.value)) leaf.value = '…';
    else if (leaf.value === '``') leaf.value = '“';
    else if (leaf.value === "''") leaf.value = '”';
    else if (leaf.value === '--') leaf.value = '—';
  });
  return paragraphText(paragraph);
};
