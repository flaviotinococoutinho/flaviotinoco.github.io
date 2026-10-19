/**
 * Aho–Corasick automaton (A. V. Aho & M. J. Corasick, "Efficient string
 * matching: an aid to bibliographic search", CACM 18(6):333–340, 1975).
 *
 * Finds every occurrence of every key in one left-to-right pass, in time
 * O(text + matches) independent of the number of keys — which is why it is the
 * engine of choice for large dictionaries: the trie-factored regex stays fast
 * only while its source is small enough for V8 to optimise it
 * (RegExp::kRegExpTooLargeToOptimize = 20 KB; docs/research/lexicon.md §1).
 *
 * It runs over UTF-16 code units of the FOLDED text with whitespace runs
 * collapsed to one space (so "big  data" and "big\ndata" both match "big data"),
 * and reports candidates with offsets mapped back to the original text. Word
 * boundaries are checked afterwards with the same Unicode predicate as the
 * regex look-arounds, and exact-case forms are verified against the original
 * surface. The shared resolver then picks leftmost-longest.
 *
 * Layout (typed arrays; no per-state objects):
 *   symbols  Uint16Array(65536)  code unit → alphabet symbol (0 = in no key)
 *   rootRow  Int32Array(A)       dense transitions out of the root (the hot row)
 *   rowStart/edgeSymbol/edgeTarget   sparse transitions of the other states (CSR,
 *                                    each row sorted by symbol → binary search)
 *   fail, outLink, outKey, depth     Int32Array(states)
 */
import type { SurfaceForm } from './forms.ts';
import { type Candidate, cursorOver, type Match, resolveLeftmostLongest } from './resolve.ts';
import { fold, hasWordBoundaries, normalizeSpaces } from './text.ts';

export interface Automaton {
  readonly states: number;
  readonly keys: readonly string[];
  readonly symbols: Uint16Array;
  readonly rootRow: Int32Array;
  readonly rowStart: Int32Array;
  readonly edgeSymbol: Uint16Array;
  readonly edgeTarget: Int32Array;
  readonly fail: Int32Array;
  /** Nearest proper suffix state that ends a key (-1 if none). */
  readonly outLink: Int32Array;
  /** Index into `keys` of the key ending at this state (-1 if none). */
  readonly outKey: Int32Array;
  readonly depth: Int32Array;
}

const step = (a: Automaton, state: number, symbol: number): number => {
  if (state === 0) return a.rootRow[symbol] ?? 0;
  let lo = a.rowStart[state] ?? 0;
  let hi = (a.rowStart[state + 1] ?? 0) - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const s = a.edgeSymbol[mid] ?? 0;
    if (s === symbol) return a.edgeTarget[mid] ?? -1;
    if (s < symbol) lo = mid + 1;
    else hi = mid - 1;
  }
  return -1;
};

/**
 * Compiles keys (already folded, single-spaced) into an automaton. Pure: the
 * construction scaffolding (maps, queues) is local and becomes garbage on return.
 */
export const compileAutomaton = (keys: readonly string[]): Automaton => {
  const symbols = new Uint16Array(0x10000);
  let alphabet = 1;
  for (const k of keys) {
    for (let i = 0; i < k.length; i++) {
      const u = k.charCodeAt(i);
      if (symbols[u] === 0) symbols[u] = alphabet++;
    }
  }
  // Trie (goto function) as a hash map keyed by state * alphabet + symbol.
  const goto = new Map<number, number>();
  const outKeyList: number[] = [-1];
  const depthList: number[] = [0];
  keys.forEach((k, keyIndex) => {
    let s = 0;
    for (let i = 0; i < k.length; i++) {
      const edge = s * alphabet + (symbols[k.charCodeAt(i)] ?? 0);
      let t = goto.get(edge);
      if (t === undefined) {
        t = outKeyList.length;
        goto.set(edge, t);
        outKeyList.push(-1);
        depthList.push((depthList[s] ?? 0) + 1);
      }
      s = t;
    }
    if (k.length > 0) outKeyList[s] = keyIndex;
  });
  const states = outKeyList.length;
  // Compressed sparse rows, sorted by (state, symbol).
  const edges = [...goto.entries()].sort((x, y) => x[0] - y[0]);
  const rowStart = new Int32Array(states + 1);
  for (const [edge] of edges) {
    const row = Math.floor(edge / alphabet) + 1;
    rowStart[row] = (rowStart[row] ?? 0) + 1;
  }
  for (let s = 0; s < states; s++) rowStart[s + 1] = (rowStart[s + 1] ?? 0) + (rowStart[s] ?? 0);
  const edgeSymbol = new Uint16Array(edges.length);
  const edgeTarget = new Int32Array(edges.length);
  const rootRow = new Int32Array(alphabet);
  edges.forEach(([edge, target], j) => {
    const s = Math.floor(edge / alphabet);
    const sym = edge - s * alphabet;
    edgeSymbol[j] = sym;
    edgeTarget[j] = target;
    if (s === 0) rootRow[sym] = target;
  });
  const outKey = Int32Array.from(outKeyList);
  const depth = Int32Array.from(depthList);
  const fail = new Int32Array(states);
  const outLink = new Int32Array(states).fill(-1);
  const partial: Automaton = {
    states,
    keys,
    symbols,
    rootRow,
    rowStart,
    edgeSymbol,
    edgeTarget,
    fail,
    outLink,
    outKey,
    depth,
  };
  // Breadth-first failure links (Aho & Corasick 1975, Algorithm 3).
  const queue = new Int32Array(states);
  let head = 0;
  let tail = 0;
  for (let j = rowStart[0] ?? 0; j < (rowStart[1] ?? 0); j++) queue[tail++] = edgeTarget[j] ?? 0;
  while (head < tail) {
    const s = queue[head++] ?? 0;
    for (let j = rowStart[s] ?? 0; j < (rowStart[s + 1] ?? 0); j++) {
      const child = edgeTarget[j] ?? 0;
      const sym = edgeSymbol[j] ?? 0;
      let f = fail[s] ?? 0;
      let t = step(partial, f, sym);
      while (t < 0 && f !== 0) {
        f = fail[f] ?? 0;
        t = step(partial, f, sym);
      }
      const target = t > 0 && t !== child ? t : 0;
      fail[child] = target;
      outLink[child] = (outKey[target] ?? -1) >= 0 ? target : (outLink[target] ?? -1);
      queue[tail++] = child;
    }
  }
  return partial;
};

/** Every (keyIndex, start, end) occurrence in `haystack` (offsets in the haystack). */
export const scanAll = (
  a: Automaton,
  haystack: string,
): readonly { readonly key: number; readonly start: number; readonly end: number }[] => {
  const out: { key: number; start: number; end: number }[] = [];
  let s = 0;
  for (let i = 0; i < haystack.length; i++) {
    const sym = a.symbols[haystack.charCodeAt(i)] ?? 0;
    if (sym === 0) {
      s = 0;
      continue;
    }
    let t = step(a, s, sym);
    while (t < 0 && s !== 0) {
      s = a.fail[s] ?? 0;
      t = step(a, s, sym);
    }
    s = t < 0 ? 0 : t;
    for (let o = (a.outKey[s] ?? -1) >= 0 ? s : (a.outLink[s] ?? -1); o > 0; o = a.outLink[o] ?? -1) {
      out.push({ key: a.outKey[o] ?? -1, start: i + 1 - (a.depth[o] ?? 0), end: i + 1 });
    }
  }
  return out;
};

/** Folded text with whitespace runs collapsed, plus the map collapsed index → original index. */
const collapsedFold = (text: string): { readonly haystack: string; readonly origin: Int32Array } => {
  // fold() maps every whitespace unit, and only whitespace, to U+0020.
  const folded = fold(text);
  const origin = new Int32Array(text.length);
  const parts: string[] = [];
  let n = 0;
  let runStart = 0;
  let previousSpace = false;
  for (let i = 0; i < folded.length; i++) {
    const space = folded.charCodeAt(i) === 0x20;
    if (space && previousSpace) {
      parts.push(folded.slice(runStart, i));
      runStart = i + 1;
      continue;
    }
    origin[n++] = i;
    previousSpace = space;
  }
  parts.push(folded.slice(runStart));
  return { haystack: parts.join(''), origin: origin.subarray(0, n) };
};

/** Matcher core: candidates from the automaton, resolved leftmost-longest. */
export const ahoCorasickMatch = (forms: readonly SurfaceForm[]) => {
  const byKey = new Map<string, SurfaceForm[]>();
  for (const f of forms) {
    const k = f.fold ? f.key : fold(f.key);
    const list = byKey.get(k);
    if (list === undefined) byKey.set(k, [f]);
    else list.push(f);
  }
  const keys = [...byKey.keys()];
  const formsByIndex = keys.map((k) => byKey.get(k) ?? []);
  const automaton = compileAutomaton(keys);
  return {
    automaton,
    match: (text: string): readonly Match[] => {
      const { haystack, origin } = collapsedFold(text);
      const candidates: Candidate[] = [];
      for (const hit of scanAll(automaton, haystack)) {
        const start = origin[hit.start] ?? 0;
        const end = (origin[hit.end - 1] ?? 0) + 1;
        if (!hasWordBoundaries(text, start, end)) continue;
        const surface = normalizeSpaces(text.slice(start, end));
        for (const form of formsByIndex[hit.key] ?? []) {
          if (form.fold || form.key === surface) candidates.push({ start, end, form });
        }
      }
      return resolveLeftmostLongest(cursorOver(candidates));
    },
  };
};
