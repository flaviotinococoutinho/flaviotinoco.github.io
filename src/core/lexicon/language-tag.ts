/**
 * BCP 47 language tags (RFC 5646) — parser and canonicaliser.
 *
 * Two checks, both required before a tag may reach a `lang` attribute:
 *
 *  1. Well-formedness: the `langtag` production of RFC 5646 §2.1 (language,
 *     extlang, script, region, variants, extensions, private use), plus the
 *     §2.2.5/§2.2.6 rules that a variant or an extension singleton must not
 *     repeat. Grandfathered irregular tags are rejected on purpose: none is
 *     needed by this site and each would need a special case.
 *  2. Validity of the primary language subtag against a CURATED SUBSET of the
 *     IANA Language Subtag Registry. A well-formed but unregistered subtag
 *     ("eng" instead of "en", "gr" instead of "el") is exactly the kind of
 *     silent misinterpretation the lexicon must not let through: browsers would
 *     pick no hyphenation dictionary and screen readers no voice. Extending the
 *     list is a deliberate act (check the registry, then add the subtag).
 *
 * Canonical case follows RFC 5646 §2.1.1: language lower case, script title
 * case, region upper case, everything else lower case.
 */
import { type Brand, unsafeBrand } from '../algebra/brand.ts';
import { err, ok, type Result } from '../algebra/result.ts';

export type LanguageTag = Brand<string, 'LanguageTag'>;

/**
 * Primary language subtags accepted by the lexicon (subset of the IANA registry,
 * https://www.iana.org/assignments/language-subtag-registry). Two-letter ISO 639-1
 * codes are used wherever they exist, as BCP 47 requires; three-letter codes only
 * when no two-letter code exists (grc = Ancient Greek). `mul` (multiple
 * languages), `und` (undetermined) and `zxx` (no linguistic content) are
 * registry special codes.
 */
// prettier-ignore
export const KNOWN_LANGUAGES: ReadonlySet<string> = new Set([
  'ar', 'ca', 'cs', 'da', 'de', 'el', 'en', 'es', 'eu', 'fa', 'fi', 'fr', 'ga', 'gl', 'grc', 'he', 'hi',
  'hu', 'id', 'is', 'it', 'ja', 'ko', 'la', 'nb', 'nl', 'nn', 'no', 'pl', 'pt', 'ro', 'ru', 'sa', 'sk',
  'sl', 'sv', 'ta', 'tr', 'uk', 'yi', 'zh', 'mul', 'und', 'zxx',
]);

/** Script subtags accepted (ISO 15924 subset). */
// prettier-ignore
export const KNOWN_SCRIPTS: ReadonlySet<string> = new Set([
  'Arab', 'Cyrl', 'Deva', 'Grek', 'Hans', 'Hant', 'Hebr', 'Jpan', 'Kore', 'Latn',
]);

const ALPHA = /^[A-Za-z]+$/;
const DIGIT = /^[0-9]+$/;
const ALNUM = /^[A-Za-z0-9]+$/;

const isAlpha = (s: string, min: number, max: number): boolean => s.length >= min && s.length <= max && ALPHA.test(s);
const isAlnum = (s: string, min: number, max: number): boolean => s.length >= min && s.length <= max && ALNUM.test(s);

const isVariant = (s: string): boolean =>
  isAlnum(s, 5, 8) || (s.length === 4 && DIGIT.test(s.charAt(0)) && ALNUM.test(s));

/** Parses and canonicalises a BCP 47 tag. Total: every input yields a tag or a reason. */
export const parseLanguageTag = (input: string): Result<LanguageTag, string> => {
  if (input.length === 0) return err('empty language tag');
  if (input.trim() !== input) return err(`language tag "${input}" has surrounding whitespace`);
  const parts = input.split('-');
  if (parts.some((p) => p.length === 0)) return err(`language tag "${input}" has an empty subtag`);
  const out: string[] = [];
  let i = 0;

  // language = 2*3ALPHA ["-" extlang] / 4ALPHA / 5*8ALPHA
  const language = parts[i] ?? '';
  if (!isAlpha(language, 2, 8)) return err(`"${input}": "${language}" is not a language subtag`);
  const primary = language.toLowerCase();
  if (!KNOWN_LANGUAGES.has(primary)) {
    return err(
      `"${input}": primary language subtag "${primary}" is not in the accepted subset of the IANA registry ` +
        '(use the two-letter ISO 639-1 code when one exists, e.g. "en" not "eng"; extend KNOWN_LANGUAGES deliberately)',
    );
  }
  out.push(primary);
  i++;
  // extlang = 3ALPHA *2("-" 3ALPHA), only after a 2–3 letter language
  let extlangs = 0;
  while (language.length <= 3 && i < parts.length && extlangs < 3 && isAlpha(parts[i] ?? '', 3, 3)) {
    out.push((parts[i] ?? '').toLowerCase());
    i++;
    extlangs++;
  }
  // script = 4ALPHA
  const maybeScript = parts[i] ?? '';
  if (i < parts.length && isAlpha(maybeScript, 4, 4)) {
    const script = maybeScript.charAt(0).toUpperCase() + maybeScript.slice(1).toLowerCase();
    if (!KNOWN_SCRIPTS.has(script)) return err(`"${input}": unknown script subtag "${script}"`);
    out.push(script);
    i++;
  }
  // region = 2ALPHA / 3DIGIT
  const maybeRegion = parts[i] ?? '';
  if (i < parts.length && (isAlpha(maybeRegion, 2, 2) || (maybeRegion.length === 3 && DIGIT.test(maybeRegion)))) {
    out.push(maybeRegion.toUpperCase());
    i++;
  }
  // *("-" variant)
  const variants = new Set<string>();
  while (i < parts.length && isVariant(parts[i] ?? '')) {
    const v = (parts[i] ?? '').toLowerCase();
    if (variants.has(v)) return err(`"${input}": repeated variant "${v}" (RFC 5646 §2.2.5)`);
    variants.add(v);
    out.push(v);
    i++;
  }
  // *("-" extension): singleton 1*("-" 2*8alphanum)
  const singletons = new Set<string>();
  while (i < parts.length && (parts[i] ?? '').length === 1 && (parts[i] ?? '').toLowerCase() !== 'x') {
    const singleton = (parts[i] ?? '').toLowerCase();
    if (!ALNUM.test(singleton)) return err(`"${input}": invalid extension singleton "${singleton}"`);
    if (singletons.has(singleton)) return err(`"${input}": repeated extension "${singleton}" (RFC 5646 §2.2.6)`);
    singletons.add(singleton);
    out.push(singleton);
    i++;
    let n = 0;
    while (i < parts.length && isAlnum(parts[i] ?? '', 2, 8)) {
      out.push((parts[i] ?? '').toLowerCase());
      i++;
      n++;
    }
    if (n === 0) return err(`"${input}": extension "${singleton}" has no subtags`);
  }
  // ["-" privateuse]: "x" 1*("-" 1*8alphanum)
  if (i < parts.length && (parts[i] ?? '').toLowerCase() === 'x') {
    out.push('x');
    i++;
    let n = 0;
    while (i < parts.length && isAlnum(parts[i] ?? '', 1, 8)) {
      out.push((parts[i] ?? '').toLowerCase());
      i++;
      n++;
    }
    if (n === 0) return err(`"${input}": private-use sequence has no subtags`);
  }
  if (i < parts.length) return err(`"${input}": unexpected subtag "${parts[i] ?? ''}"`);
  return ok(unsafeBrand<string, 'LanguageTag'>(out.join('-')));
};

/** The primary language subtag ("pt" for "pt-BR", "grc" for "grc-Latn"). */
export const primaryLanguage = (tag: string): string => (tag.split('-')[0] ?? '').toLowerCase();

/** Two tags denote the same language for the purpose of "is this foreign here?". */
export const sameLanguage = (a: string, b: string): boolean => primaryLanguage(a) === primaryLanguage(b);
