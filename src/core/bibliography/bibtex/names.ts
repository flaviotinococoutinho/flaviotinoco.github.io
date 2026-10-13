/**
 * BibTeX name lists → structured names (pure, total).
 *
 * Implements the name grammar of bibtex(1) (O. Patashnik, "BibTeXing", 1988, §4;
 * N. Markey, "Tame the BeaST", 2009, §11):
 *
 *   list   = name { "and" name } [ "and" "others" ]        ("and" at brace level 0)
 *   name   = First von Last | von Last "," First | von Last "," Jr "," First
 *
 * The "von" part is the run of words that begins with a lower-case letter (the
 * case of a word is that of its first letter at brace level 0; a special character
 * {\'E} counts by its letter; a word with no such letter is caseless = not
 * lower-case). A name that is a single brace group, e.g. {World Wide Web
 * Consortium}, is a corporate author. "and others" sets the et al. flag.
 *
 * For ABNT, lower-case particles (da, de, do, das, dos, e, van, von…) are DROPPING
 * particles: SILVA, João da (NBR 6023:2025 §8.1.1); the formatter decides where to
 * print them, the parser only records them.
 */
import { decodeLatex, type LatexProblem, type MarkedText } from './latex.ts';

export type PersonName = {
  readonly kind: 'person';
  readonly given?: MarkedText;
  /** The "von" part (lower-case particles), e.g. "da", "van der". */
  readonly particle?: MarkedText;
  readonly family: MarkedText;
  /** The "Jr" part, e.g. "Jr.", "Filho", "Neto". */
  readonly suffix?: MarkedText;
};

export type CorporateName = { readonly kind: 'corporate'; readonly name: MarkedText };

export type Name = PersonName | CorporateName;

export type NameList = {
  readonly names: readonly Name[];
  /** True when the list ended with "and others" (rendered as et al.). */
  readonly others: boolean;
};

export type NameProblem =
  | { readonly severity: 'error'; readonly code: 'name:empty' | 'name:too-many-commas' | 'name:misplaced-others'; readonly message: string }
  | { readonly severity: 'warning'; readonly code: LatexProblem['code']; readonly message: string };

export type NamesResult = { readonly value: NameList; readonly problems: readonly NameProblem[] };

type Item = { readonly kind: 'word'; readonly raw: string } | { readonly kind: 'comma' };

/** Splits raw text into words and commas at brace level 0 (whitespace and ~ separate words). */
const items = (raw: string): Item[] => {
  const out: Item[] = [];
  let depth = 0;
  let word = '';
  const flush = (): void => {
    if (word !== '') out.push({ kind: 'word', raw: word });
    word = '';
  };
  for (const c of raw) {
    if (c === '{') depth++;
    if (c === '}') depth = Math.max(0, depth - 1);
    if (depth === 0 && (/\s/u.test(c) || c === '~')) {
      flush();
      continue;
    }
    if (depth === 0 && c === ',') {
      flush();
      out.push({ kind: 'comma' });
      continue;
    }
    word += c;
  }
  flush();
  return out;
};

const isLowerLetter = (c: string): boolean => c !== c.toUpperCase() && c === c.toLowerCase();
const isLetter = (c: string): boolean => /\p{L}/u.test(c);

/**
 * Case of a word by bibtex's rule: first letter at brace level 0; a special
 * character {\…} counts by the first letter of its decoding; other brace groups
 * are skipped. Returns undefined for caseless words.
 */
const caseOf = (word: string): 'lower' | 'upper' | undefined => {
  for (let i = 0; i < word.length; i++) {
    const c = word[i] as string;
    if (c === '{') {
      let depth = 0;
      let j = i;
      for (; j < word.length; j++) {
        if (word[j] === '{') depth++;
        else if (word[j] === '}') {
          depth--;
          if (depth === 0) break;
        }
      }
      if (word[i + 1] === '\\') {
        const decoded = decodeLatex(word.slice(i, j + 1)).value.text;
        const letter = [...decoded].find(isLetter);
        if (letter !== undefined) return isLowerLetter(letter) ? 'lower' : 'upper';
      }
      i = j;
      continue;
    }
    if (c === '\\') {
      // A bare control sequence at level 0 (e.g. \'e or \v{S}): decode the rest.
      const letter = [...decodeLatex(word.slice(i)).value.text].find(isLetter);
      return letter === undefined ? undefined : isLowerLetter(letter) ? 'lower' : 'upper';
    }
    if (isLetter(c)) return isLowerLetter(c) ? 'lower' : 'upper';
  }
  return undefined;
};

const isWholeGroup = (word: string): boolean => {
  if (!word.startsWith('{') || !word.endsWith('}')) return false;
  let depth = 0;
  for (let i = 0; i < word.length; i++) {
    if (word[i] === '{') depth++;
    else if (word[i] === '}') {
      depth--;
      if (depth === 0 && i < word.length - 1) return false;
    }
  }
  return true;
};

export const parseNames = (raw: string): NamesResult => {
  const problems: NameProblem[] = [];
  const decode = (words: readonly string[]): MarkedText | undefined => {
    if (words.length === 0) return undefined;
    const r = decodeLatex(words.join(' '));
    for (const p of r.problems) problems.push({ severity: 'warning', code: p.code, message: p.message });
    return r.value;
  };

  // Split the item stream into names on the word "and" (case-insensitive).
  const groups: Item[][] = [[]];
  for (const item of items(raw)) {
    if (item.kind === 'word' && item.raw.toLowerCase() === 'and') groups.push([]);
    else (groups.at(-1) as Item[]).push(item);
  }
  if (groups.length === 1 && groups[0]?.length === 0) return { value: { names: [], others: false }, problems };

  const names: Name[] = [];
  let others = false;
  groups.forEach((group, k) => {
    const words = group.flatMap((it) => (it.kind === 'word' ? [it.raw] : []));
    if (words.length === 0) {
      problems.push({ severity: 'error', code: 'name:empty', message: `empty name at position ${k + 1} of "${raw}"` });
      return;
    }
    if (words.length === 1 && words[0] === 'others' && !group.some((it) => it.kind === 'comma')) {
      if (k === groups.length - 1) others = true;
      else problems.push({ severity: 'error', code: 'name:misplaced-others', message: '"and others" must end the name list' });
      return;
    }
    // Parts separated by commas.
    const parts: string[][] = [[]];
    for (const it of group) {
      if (it.kind === 'comma') parts.push([]);
      else (parts.at(-1) as string[]).push(it.raw);
    }
    if (parts.length > 3) {
      problems.push({
        severity: 'error',
        code: 'name:too-many-commas',
        message: `name "${words.join(' ')}" has ${parts.length - 1} commas (at most 2: "von Last, Jr, First")`,
      });
      return;
    }
    if (parts.length === 1 && words.length === 1 && isWholeGroup(words[0] as string)) {
      const name = decode([(words[0] as string).slice(1, -1)]);
      if (name !== undefined) names.push({ kind: 'corporate', name });
      return;
    }
    let first: string[] = [];
    let von: string[] = [];
    let last: string[] = [];
    let jr: string[] = [];
    if (parts.length === 1) {
      const w = parts[0] as string[];
      const n = w.length;
      let vs = -1;
      let ve = -1;
      for (let j = 0; j < n - 1; j++) {
        if (caseOf(w[j] as string) === 'lower') {
          if (vs === -1) vs = j;
          ve = j;
        }
      }
      if (vs === -1) {
        first = w.slice(0, n - 1);
        last = w.slice(n - 1);
      } else {
        first = w.slice(0, vs);
        von = w.slice(vs, ve + 1);
        last = w.slice(ve + 1);
      }
    } else {
      const before = parts[0] as string[];
      if (parts.length === 2) first = parts[1] as string[];
      else {
        jr = parts[1] as string[];
        first = parts[2] as string[];
      }
      let ve = -1;
      if (before.length > 1 && caseOf(before[0] as string) === 'lower') {
        for (let j = 0; j < before.length - 1; j++) if (caseOf(before[j] as string) === 'lower') ve = j;
      }
      von = before.slice(0, ve + 1);
      last = before.slice(ve + 1);
      if (last.length === 0) {
        problems.push({ severity: 'error', code: 'name:empty', message: `name "${words.join(' ')}" has no last name` });
        return;
      }
    }
    const family = decode(last) as MarkedText;
    const given = decode(first);
    const particle = decode(von);
    const suffix = decode(jr);
    names.push({
      kind: 'person',
      family,
      ...(given !== undefined && given.text !== '' ? { given } : {}),
      ...(particle !== undefined ? { particle } : {}),
      ...(suffix !== undefined && suffix.text !== '' ? { suffix } : {}),
    });
  });
  return { value: { names, others }, problems };
};
