/**
 * BibTeX name lists → structured names (pure, total).
 *
 * Implements the name grammar of bibtex(1) (O. Patashnik, "BibTeXing", 1988, §4;
 * N. Markey, "Tame the BeaST", 2009, §11; bibtex.web, procedures
 * `von_token_found` and `von_name_ends_and_last_name_starts_stuff`):
 *
 *   list   = name { "and" name } [ "and" "others" ]        ("and" at brace level 0, any case)
 *   name   = First von Last | von Last "," First | von Last "," Jr "," First
 *
 * The "von" part ends at the LAST word, before the final one, that begins with a
 * lower-case letter (the case of a word is that of its first letter at brace
 * level 0; a special character {\'E} counts by its letter; other brace groups are
 * skipped; a word without such a letter is caseless). In the comma-free form it
 * starts at the first lower-case word; in the comma forms it exists only when the
 * first word is lower-case (see splitCommas). Without a von part, words tied to
 * the last one (`Brinch~Hansen`) belong to the Last part. A name that is a single brace group, e.g.
 * {World Wide Web Consortium}, is a corporate author. "and others" sets the
 * et al. flag.
 *
 * One deliberate deviation: case is judged on Unicode letters (\p{L}), as biber
 * does, not on ASCII bytes only as bibtex(1) does — otherwise "Émile" would be a
 * lower-case word because "É" is not in A–Z.
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

export const EMPTY_NAMES: NameList = { names: [], others: false };

export type NameProblem =
  | {
      readonly severity: 'error';
      readonly code: 'name:empty' | 'name:too-many-commas' | 'name:misplaced-others';
      readonly message: string;
    }
  | { readonly severity: 'warning'; readonly code: LatexProblem['code']; readonly message: string };

export type NamesResult = { readonly value: NameList; readonly problems: readonly NameProblem[] };

/** A word of a name, and whether a tie (~) joins it to the previous word. */
type Word = { readonly kind: 'word'; readonly raw: string; readonly tied: boolean };
type Item = Word | { readonly kind: 'comma' };

/** Splits raw text into words and commas at brace level 0 (whitespace and ~ separate words). */
const items = (raw: string): Item[] => {
  const out: Item[] = [];
  let depth = 0;
  let word = '';
  let tie = false;
  let sawTie = false;
  const flush = (): void => {
    if (word !== '') {
      out.push({ kind: 'word', raw: word, tied: sawTie });
      sawTie = false;
    }
    word = '';
  };
  for (const c of raw) {
    if (c === '{') depth++;
    if (c === '}') depth = Math.max(0, depth - 1);
    if (depth === 0 && (/\s/u.test(c) || c === '~')) {
      flush();
      if (c === '~') tie = true;
      continue;
    }
    if (depth === 0 && c === ',') {
      flush();
      out.push({ kind: 'comma' });
      tie = false;
      continue;
    }
    if (word === '') {
      sawTie = tie;
      tie = false;
    }
    word += c;
  }
  flush();
  return out;
};

const isLowerLetter = (c: string): boolean => c !== c.toUpperCase() && c === c.toLowerCase();
const isLetter = (c: string): boolean => /\p{L}/u.test(c);

const caseOfLetter = (letter: string | undefined): 'lower' | 'upper' | undefined =>
  letter === undefined ? undefined : isLowerLetter(letter) ? 'lower' : 'upper';

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
        const letter = [...decodeLatex(word.slice(i, j + 1)).value.text].find(isLetter);
        if (letter !== undefined) return caseOfLetter(letter);
      }
      i = j;
      continue;
    }
    if (c === '\\') {
      // A bare control sequence at level 0 (e.g. \'e or \v{S}): decode the rest of the word.
      return caseOfLetter([...decodeLatex(word.slice(i)).value.text].find(isLetter));
    }
    if (isLetter(c)) return caseOfLetter(c);
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

/**
 * Index (exclusive) where von ends inside words[from..lastEnd): one past the last
 * lower-case word with index < lastEnd - 1, or `from` when there is none.
 */
const vonEnd = (words: readonly Word[], from: number, lastEnd: number): number => {
  for (let k = lastEnd - 1; k > from; k--) {
    if (caseOf((words[k - 1] as Word).raw) === 'lower') return k;
  }
  return from;
};

type Parts = {
  readonly first: readonly Word[];
  readonly von: readonly Word[];
  readonly last: readonly Word[];
  readonly jr: readonly Word[];
};

/** "First von Last" (no commas). */
const splitNoComma = (w: readonly Word[]): Parts => {
  const n = w.length;
  let vonStart = -1;
  for (let k = 0; k < n - 1; k++) {
    if (caseOf((w[k] as Word).raw) === 'lower') {
      vonStart = k;
      break;
    }
  }
  if (vonStart !== -1) {
    const end = vonEnd(w, vonStart, n);
    return { first: w.slice(0, vonStart), von: w.slice(vonStart, end), last: w.slice(end), jr: [] };
  }
  // No von: the Last part is the final word plus any words tied to it (Per Brinch~Hansen).
  let lastStart = n - 1;
  while (lastStart > 0 && (w[lastStart] as Word).tied) lastStart--;
  return { first: w.slice(0, lastStart), von: [], last: w.slice(lastStart), jr: [] };
};

/**
 * "von Last, First" and "von Last, Jr, First". The von part exists only when the
 * FIRST word is lower-case (biber, @retorquere/bibtex-parser): "De la Fontaine,
 * Jean" keeps "De la Fontaine" as the surname, as ABNT expects for capitalised
 * particles (NBR 6023 §8.1.1.3: DE LUCCA, Gabriella; LA TORRE, Massimo).
 */
const splitCommas = (parts: readonly (readonly Word[])[]): Parts => {
  const before = parts[0] ?? [];
  const startsLower = before.length > 1 && caseOf((before[0] as Word).raw) === 'lower';
  const end = startsLower ? vonEnd(before, 0, before.length) : 0;
  return {
    von: before.slice(0, end),
    last: before.slice(end),
    jr: parts.length === 3 ? (parts[1] ?? []) : [],
    first: (parts.length === 3 ? parts[2] : parts[1]) ?? [],
  };
};

export const parseNames = (raw: string): NamesResult => {
  const problems: NameProblem[] = [];
  const decode = (words: readonly Word[]): MarkedText | undefined => {
    if (words.length === 0) return undefined;
    // Words keep their separator: a tie (~) stays a no-break space inside the part.
    const r = decodeLatex(words.map((w, k) => (k > 0 && w.tied ? `~${w.raw}` : k > 0 ? ` ${w.raw}` : w.raw)).join(''));
    for (const p of r.problems) problems.push({ severity: 'warning', code: p.code, message: p.message });
    return r.value.text === '' ? undefined : r.value;
  };

  // Split the item stream into names on the word "and" (case-insensitive, brace level 0).
  const groups: Item[][] = [[]];
  for (const item of items(raw)) {
    if (item.kind === 'word' && item.raw.toLowerCase() === 'and') groups.push([]);
    else (groups.at(-1) as Item[]).push(item);
  }
  if (groups.length === 1 && groups[0]?.length === 0) return { value: EMPTY_NAMES, problems };

  const names: Name[] = [];
  let others = false;
  groups.forEach((group, k) => {
    const words = group.filter((it): it is Word => it.kind === 'word');
    const text = words.map((w) => w.raw).join(' ');
    if (words.length === 0) {
      problems.push({ severity: 'error', code: 'name:empty', message: `empty name at position ${k + 1} of "${raw}"` });
      return;
    }
    if (words.length === 1 && words[0]?.raw === 'others' && !group.some((it) => it.kind === 'comma')) {
      if (k === groups.length - 1 && k > 0) others = true;
      else
        problems.push({
          severity: 'error',
          code: 'name:misplaced-others',
          message: '"and others" must end the name list',
        });
      return;
    }
    // Parts separated by commas.
    const parts: Word[][] = [[]];
    for (const it of group) {
      if (it.kind === 'comma') parts.push([]);
      else (parts.at(-1) as Word[]).push(it);
    }
    if (parts.length > 3) {
      problems.push({
        severity: 'error',
        code: 'name:too-many-commas',
        message: `name "${text}" has ${parts.length - 1} commas (at most 2: "von Last, Jr, First")`,
      });
      return;
    }
    const single = words[0] as Word;
    if (parts.length === 1 && words.length === 1 && isWholeGroup(single.raw)) {
      const name = decode([{ ...single, raw: single.raw.slice(1, -1) }]);
      if (name !== undefined) names.push({ kind: 'corporate', name });
      else problems.push({ severity: 'error', code: 'name:empty', message: `empty corporate name in "${raw}"` });
      return;
    }
    const split = parts.length === 1 ? splitNoComma(parts[0] as Word[]) : splitCommas(parts);
    const family = decode(split.last);
    if (family === undefined) {
      problems.push({ severity: 'error', code: 'name:empty', message: `name "${text}" has no last name` });
      return;
    }
    const given = decode(split.first);
    const particle = decode(split.von);
    const suffix = decode(split.jr);
    names.push({
      kind: 'person',
      family,
      ...(given !== undefined ? { given } : {}),
      ...(particle !== undefined ? { particle } : {}),
      ...(suffix !== undefined ? { suffix } : {}),
    });
  });
  return { value: { names, others }, problems };
};
