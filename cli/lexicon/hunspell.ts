/**
 * Hunspell dictionaries → word forms (pure).
 *
 * A Hunspell dictionary is a pair: `.dic` lists stems with affix flags
 * ("abafar/ajkLMYÂ") and `.aff` defines what each flag adds. The pt-BR VERO
 * dictionary (LibreOffice) has 312,368 stems; its inflected forms (plurals,
 * conjugations, enclitics) exist only through the affix rules. A lexicon built
 * from the stems alone would declare "casas" or "informações" unknown, and the
 * unknown-word lint would flag ordinary Portuguese — so the forms are generated.
 *
 * Supported subset of hunspell(5) — what word-form generation needs:
 *   FLAG (default single 8-bit/UTF-8 character, `long`, `num`, `UTF-8`), AF
 *   (flag aliases), PFX/SFX tables (strip, add, condition, cross product),
 *   continuation classes on suffixes (twofold suffixes, one extra level),
 *   NEEDAFFIX, FORBIDDENWORD, ONLYINCOMPOUND. Compounding (COMPOUND*), REP,
 *   MAP, BREAK, ICONV/OCONV and morphological fields are irrelevant to the list
 *   of forms and are ignored.
 * Conditions are hunspell's simplified patterns (literal characters, `.`,
 * `[…]`, `[^…]`), tested on the stem before stripping: at its end for a suffix,
 * at its start for a prefix. A cross product applies a prefix to a suffixed
 * form when both classes allow it (`Y`).
 */
import { err, ok, type Result } from '../../src/core/algebra/result.ts';

export type FlagType = 'char' | 'long' | 'num';

export interface AffixRule {
  readonly strip: string;
  readonly add: string;
  /** Continuation flags of the affix (twofold affixes). */
  readonly next: readonly string[];
  readonly condition: RegExp;
}

export interface AffixClass {
  readonly kind: 'PFX' | 'SFX';
  readonly flag: string;
  readonly cross: boolean;
  readonly rules: readonly AffixRule[];
}

export interface Affixes {
  readonly flagType: FlagType;
  readonly classes: ReadonlyMap<string, AffixClass>;
  readonly aliases: readonly (readonly string[])[];
  readonly forbidden: string | undefined;
  readonly needAffix: string | undefined;
  readonly onlyInCompound: string | undefined;
}

/** Splits a flag field according to the FLAG type. */
export const splitFlags = (field: string, type: FlagType): readonly string[] => {
  switch (type) {
    case 'char':
      return [...field];
    case 'long': {
      const out: string[] = [];
      const cps = [...field];
      for (let i = 0; i < cps.length; i += 2) out.push(cps.slice(i, i + 2).join(''));
      return out;
    }
    case 'num':
      return field
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s !== '');
  }
};

const REGEX_SPECIAL = /[\\^$.*+?()[\]{}|/-]/u;

/** Translates a hunspell condition to a regular-expression body (or undefined when malformed). */
export const conditionBody = (condition: string): string | undefined => {
  if (condition === '.' || condition === '') return '';
  let out = '';
  const cps = [...condition];
  for (let i = 0; i < cps.length; i += 1) {
    const c = cps[i] ?? '';
    if (c === '[') {
      const close = cps.indexOf(']', i + 1);
      if (close < 0) return undefined;
      const inner = cps.slice(i + 1, close);
      const negated = inner[0] === '^';
      const chars = (negated ? inner.slice(1) : inner).map((x) => (/[\\\]^-]/u.test(x) ? `\\${x}` : x)).join('');
      out += `[${negated ? '^' : ''}${chars}]`;
      i = close;
    } else if (c === '.') out += '.';
    else out += REGEX_SPECIAL.test(c) ? `\\${c}` : c;
  }
  return out;
};

interface MutableClass {
  kind: 'PFX' | 'SFX';
  flag: string;
  cross: boolean;
  rules: AffixRule[];
}

/** Parses an .aff file; every malformed affix line is reported with its line number. */
export const parseAff = (text: string): Result<Affixes, readonly string[]> => {
  const problems: string[] = [];
  let flagType: FlagType = 'char';
  const aliases: (readonly string[])[] = [];
  const pendingAliases: string[] = [];
  let aliasHeader = false;
  const classes = new Map<string, MutableClass>();
  let forbidden: string | undefined;
  let needAffix: string | undefined;
  let onlyInCompound: string | undefined;
  const lines = text.replace(/^﻿/u, '').split(/\r?\n/u);
  lines.forEach((raw, index) => {
    const line = raw.replace(/\s+#.*$/u, '').trim();
    if (line === '' || line.startsWith('#')) return;
    const f = line.split(/\s+/u);
    const [key, a, b, c, d] = f;
    switch (key) {
      case 'FLAG':
        flagType = a === 'long' ? 'long' : a === 'num' ? 'num' : 'char';
        break;
      case 'AF':
        // The first AF line is the count ("AF 3"); the following ones are the aliases 1, 2, 3…
        if (aliasHeader) pendingAliases.push(a ?? '');
        aliasHeader = true;
        break;
      case 'FORBIDDENWORD':
        forbidden = a;
        break;
      case 'NEEDAFFIX':
      case 'PSEUDOROOT':
        needAffix = a;
        break;
      case 'ONLYINCOMPOUND':
        onlyInCompound = a;
        break;
      case 'PFX':
      case 'SFX': {
        if (a === undefined || b === undefined) {
          problems.push(`line ${index + 1}: incomplete ${key} line`);
          return;
        }
        const existing = classes.get(a);
        // Header: "SFX flag Y|N count"; rule: "SFX flag strip add[/flags] condition [morph…]".
        if (existing === undefined && (b === 'Y' || b === 'N') && f.length === 4 && /^\d+$/u.test(c ?? '')) {
          classes.set(a, { kind: key, flag: a, cross: b === 'Y', rules: [] });
          return;
        }
        if (existing === undefined || existing.kind !== key || c === undefined) {
          problems.push(`line ${index + 1}: ${key} rule for undeclared flag "${a}"`);
          return;
        }
        const [addRaw = '0', nextRaw] = c.split('/');
        const body = conditionBody(d ?? '.');
        if (body === undefined) {
          problems.push(`line ${index + 1}: malformed condition "${d ?? ''}"`);
          return;
        }
        existing.rules.push({
          strip: b === '0' ? '' : b,
          add: addRaw === '0' ? '' : addRaw,
          next: nextRaw === undefined ? [] : splitFlags(nextRaw, flagType),
          condition: new RegExp(key === 'SFX' ? `(?:${body})$` : `^(?:${body})`, 'u'),
        });
        break;
      }
      default:
        break;
    }
  });
  for (const field of pendingAliases) aliases.push(splitFlags(field, flagType));
  if (problems.length > 0) return err(problems);
  return ok({ flagType, classes, aliases, forbidden, needAffix, onlyInCompound });
};

/** One .dic line: stem and flags (escaped "\/" is a slash of the word; morphological fields are dropped). */
export const parseDicLine = (line: string, affixes: Affixes): { readonly stem: string; readonly flags: readonly string[] } | undefined => {
  const field = line.split(/[\t ]/u)[0] ?? '';
  if (field === '') return undefined;
  let slash = -1;
  for (let i = 0; i < field.length; i += 1) {
    if (field[i] === '\\') i += 1;
    else if (field[i] === '/') {
      slash = i;
      break;
    }
  }
  const stem = (slash < 0 ? field : field.slice(0, slash)).replace(/\\\//gu, '/');
  const rawFlags = slash < 0 ? '' : field.slice(slash + 1);
  if (stem === '') return undefined;
  if (affixes.aliases.length > 0 && /^\d+$/u.test(rawFlags)) {
    return { stem, flags: affixes.aliases[Number(rawFlags) - 1] ?? [] };
  }
  return { stem, flags: splitFlags(rawFlags, affixes.flagType) };
};

const applySuffix = (word: string, r: AffixRule): string | undefined =>
  word.endsWith(r.strip) && r.condition.test(word) ? word.slice(0, word.length - r.strip.length) + r.add : undefined;

const applyPrefix = (word: string, r: AffixRule): string | undefined =>
  word.startsWith(r.strip) && r.condition.test(word) ? r.add + word.slice(r.strip.length) : undefined;

/** Every form of one stem (the stem itself unless it needs an affix), each emitted through `emit`. */
export const expandStem = (
  stem: string,
  flags: readonly string[],
  affixes: Affixes,
  emit: (form: string) => void,
): void => {
  const has = (f: string | undefined): boolean => f !== undefined && flags.includes(f);
  if (has(affixes.forbidden) || has(affixes.onlyInCompound)) return;
  if (!has(affixes.needAffix)) emit(stem);
  const classesOf = (fs: readonly string[], kind: 'PFX' | 'SFX'): readonly AffixClass[] =>
    fs.flatMap((f) => {
      const c = affixes.classes.get(f);
      return c !== undefined && c.kind === kind ? [c] : [];
    });
  const prefixes = classesOf(flags, 'PFX');
  const suffixed: { readonly form: string; readonly cross: boolean }[] = [];
  for (const cls of classesOf(flags, 'SFX')) {
    for (const r of cls.rules) {
      const form = applySuffix(stem, r);
      if (form === undefined) continue;
      emit(form);
      suffixed.push({ form, cross: cls.cross });
      // Twofold suffix: the continuation classes apply to the suffixed form.
      for (const second of classesOf(r.next, 'SFX')) {
        for (const r2 of second.rules) {
          const form2 = applySuffix(form, r2);
          if (form2 !== undefined) emit(form2);
        }
      }
    }
  }
  for (const cls of prefixes) {
    for (const r of cls.rules) {
      const form = applyPrefix(stem, r);
      if (form !== undefined) emit(form);
      if (!cls.cross) continue;
      for (const s of suffixed) {
        if (!s.cross || !r.condition.test(stem) || !stem.startsWith(r.strip)) continue;
        if (s.form.startsWith(r.strip)) emit(r.add + s.form.slice(r.strip.length));
      }
    }
  }
};

/** Every form of a dictionary (the first line, the approximate stem count, is skipped when numeric). */
export const expandDictionary = (dic: string, affixes: Affixes, emit: (form: string) => void): number => {
  const lines = dic.replace(/^﻿/u, '').split(/\r?\n/u);
  let stems = 0;
  lines.forEach((line, i) => {
    if (i === 0 && /^\s*\d+\s*$/u.test(line)) return;
    const entry = parseDicLine(line, affixes);
    if (entry === undefined) return;
    stems += 1;
    expandStem(entry.stem, entry.flags, affixes, emit);
  });
  return stems;
};

/** The empty affix file: stems only (what "strip the affix markers" yields without an .aff). */
export const NO_AFFIXES: Affixes = {
  flagType: 'char',
  classes: new Map(),
  aliases: [],
  forbidden: undefined,
  needAffix: undefined,
  onlyInCompound: undefined,
};
