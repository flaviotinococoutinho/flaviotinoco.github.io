/**
 * Reader preferences — model and codec (pure).
 *
 * Each preference is a finite domain whose first-listed "system" value means
 * "defer to the operating system / browser" (prefers-color-scheme,
 * prefers-contrast, prefers-reduced-motion) or the site default. The model is
 * persisted as JSON under PREFS_STORAGE_KEY and mirrored as data-* attributes
 * on <html>, where CSS reads it.
 *
 * Patterns (docs/arquitetura.md §3):
 *   parser  parsePreferences : unknown → Result<Preferences, string[]>   (strict, accumulates errors)
 *   codec   encodePreferences : Preferences → string
 *           decodePreferences : string | null → Preferences              (lenient, total)
 *   law     decodePreferences(encodePreferences(p)) = p
 *           parsePreferences(JSON.parse(encodePreferences(p))) = ok(p)
 *
 * The canonical encoding omits values equal to the default, so storage stays
 * minimal and "reset" is simply the empty object.
 */
import { err, ok, type Result } from '../algebra/result.ts';
import { CVD_TYPES } from '../design/cvd.ts';

/** localStorage key holding the serialised preferences. */
export const PREFS_STORAGE_KEY = 'ft:prefs';

/** DOM event (on document, detail: Preferences) dispatched by <ft-preferences> after applying a change. */
export const PREFS_CHANGE_EVENT = 'ft:prefs-change';

/**
 * Domain of every preference, in the order controls are presented.
 * The default of each key is given separately (DEFAULT_PREFERENCES).
 */
export const PREFERENCE_DOMAINS = {
  theme: ['auto', 'light', 'dark'],
  contrast: ['auto', 'normal', 'more'],
  motion: ['auto', 'reduce', 'full'],
  text: ['s', 'm', 'l', 'xl'],
  face: ['serif', 'sans'],
  /**
   * Text spacing as a reader choice: "wide" applies the values of WCAG 2.2 SC 1.4.12
   * (line height 1.5 or more, letter spacing 0.12 em, word spacing 0.16 em, paragraphs
   * 2 em apart), which the British Dyslexia Association's style guide (2023) recommends.
   */
  spacing: ['normal', 'wide'],
  hyphens: ['on', 'off'],
  /** Reading ruler: a band of two lines that follows the pointer and the keyboard focus (BDA style guide). */
  ruler: ['off', 'on'],
  /** Focus mode: no paper texture or ambient field; side notes and the argument map discreet until pointed at. */
  focus: ['off', 'on'],
  texture: ['on', 'off'],
  /**
   * The single-character shortcut "/" that opens the command palette. WCAG 2.2
   * SC 2.1.4 (Character Key Shortcuts, level A) requires a way to turn such a
   * shortcut off: speech-input users can trigger it by dictation. The chorded
   * Ctrl/⌘ K shortcut is unaffected (it is not a character key shortcut).
   */
  shortcut: ['on', 'off'],
  cvd: ['none', ...CVD_TYPES],
} as const satisfies Readonly<Record<string, readonly [string, ...string[]]>>;

export type PreferenceKey = keyof typeof PREFERENCE_DOMAINS;
export type PreferenceValue<K extends PreferenceKey> = (typeof PREFERENCE_DOMAINS)[K][number];
export type Preferences = { readonly [K in PreferenceKey]: PreferenceValue<K> };

/** Keys in canonical order (serialisation order, pre-paint script order, UI order). */
export const PREFERENCE_KEYS = [
  'theme',
  'contrast',
  'motion',
  'text',
  'face',
  'spacing',
  'hyphens',
  'ruler',
  'focus',
  'texture',
  'shortcut',
  'cvd',
] as const satisfies readonly PreferenceKey[];

/** Proof obligation: PREFERENCE_KEYS lists every key of the domain table (checked by the compiler). */
type MissingKeys = Exclude<PreferenceKey, (typeof PREFERENCE_KEYS)[number]>;
const _exhaustive: [MissingKeys] extends [never] ? true : never = true;
void _exhaustive;

export const DEFAULT_PREFERENCES: Preferences = {
  theme: 'auto',
  contrast: 'auto',
  motion: 'auto',
  text: 'm',
  face: 'serif',
  spacing: 'normal',
  hyphens: 'on',
  ruler: 'off',
  focus: 'off',
  texture: 'on',
  shortcut: 'on',
  cvd: 'none',
};

export const isPreferenceKey = (v: unknown): v is PreferenceKey =>
  typeof v === 'string' && (PREFERENCE_KEYS as readonly string[]).includes(v);

export const isPreferenceValue = <K extends PreferenceKey>(key: K, v: unknown): v is PreferenceValue<K> =>
  typeof v === 'string' && (PREFERENCE_DOMAINS[key] as readonly string[]).includes(v);

export const parsePreferenceValue = <K extends PreferenceKey>(
  key: K,
  v: unknown,
): Result<PreferenceValue<K>, string> =>
  isPreferenceValue(key, v)
    ? ok(v)
    : err(
        `preference "${key}": unknown value ${JSON.stringify(v) ?? String(v)} (expected ${PREFERENCE_DOMAINS[key].join(' | ')})`,
      );

const isRecord = (v: unknown): v is Readonly<Record<string, unknown>> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Immutable single-key update. */
export const withPreference = <K extends PreferenceKey>(
  prefs: Preferences,
  key: K,
  value: PreferenceValue<K>,
): Preferences => ({ ...prefs, [key]: value });

/**
 * Strict parser: the input must be an object whose keys are known preferences
 * and whose values belong to their domains. Missing keys take the default.
 * Every problem is reported (applicative validation).
 */
export const parsePreferences = (input: unknown): Result<Preferences, readonly string[]> => {
  if (!isRecord(input)) return err(['preferences: expected a JSON object']);
  const errors: string[] = [];
  const out: Record<string, string> = { ...DEFAULT_PREFERENCES };
  for (const [key, value] of Object.entries(input)) {
    if (!isPreferenceKey(key)) {
      errors.push(`preferences: unknown key "${key}"`);
      continue;
    }
    const parsed = parsePreferenceValue(key, value);
    if (parsed.ok) out[key] = parsed.value;
    else errors.push(parsed.error);
  }
  return errors.length > 0 ? err(errors) : ok(out as unknown as Preferences);
};

/** Canonical serialisation: keys in PREFERENCE_KEYS order, defaults omitted. */
export const encodePreferences = (prefs: Preferences): string => {
  const out: Record<string, string> = {};
  for (const key of PREFERENCE_KEYS) {
    if (prefs[key] !== DEFAULT_PREFERENCES[key]) out[key] = prefs[key];
  }
  return JSON.stringify(out);
};

/** JSON.parse lifted into Result (the core never lets an exception escape). */
export const parseJson = (text: string): Result<unknown, string> => {
  try {
    return ok(JSON.parse(text) as unknown);
  } catch (e: unknown) {
    return err(e instanceof Error ? e.message : 'invalid JSON');
  }
};

/**
 * Lenient, total decoder used at runtime (storage may hold anything: older
 * versions, manual edits, another site's data). Each key is decoded on its own:
 * a valid value is kept, anything else falls back to the default — the same
 * per-key behaviour as the pre-paint script, so both always agree.
 */
export const decodePreferences = (raw: string | null): Preferences => {
  if (raw === null) return DEFAULT_PREFERENCES;
  const json = parseJson(raw);
  if (!json.ok || !isRecord(json.value)) return DEFAULT_PREFERENCES;
  const source = json.value;
  const out: Record<string, string> = { ...DEFAULT_PREFERENCES };
  for (const key of PREFERENCE_KEYS) {
    const v = Object.hasOwn(source, key) ? source[key] : undefined;
    if (isPreferenceValue(key, v)) out[key] = v;
  }
  return out as unknown as Preferences;
};

/**
 * Values that are written as data-<key> attributes on <html>: every value
 * except the default (whose absence lets CSS media queries decide).
 * This table is the allow-list compiled into the pre-paint script.
 */
export const ATTRIBUTE_VALUES: { readonly [K in PreferenceKey]: readonly PreferenceValue<K>[] } =
  /* @__PURE__ */ Object.fromEntries(
    PREFERENCE_KEYS.map((key) => [
      key,
      (PREFERENCE_DOMAINS[key] as readonly string[]).filter((v) => v !== DEFAULT_PREFERENCES[key]),
    ]),
  ) as unknown as { readonly [K in PreferenceKey]: readonly PreferenceValue<K>[] };

export type AttributeName = `data-${PreferenceKey}`;

/**
 * The attribute assignment realising a preference set: [name, value] where
 * value null means "remove the attribute" (default → defer to CSS/system).
 */
export const preferenceAttributes = (prefs: Preferences): readonly (readonly [AttributeName, string | null])[] =>
  PREFERENCE_KEYS.map((key) => [`data-${key}`, prefs[key] === DEFAULT_PREFERENCES[key] ? null : prefs[key]] as const);

/** Catalog key naming one option's label: `prefs.<key>.<value>` (see src/core/i18n/catalogs/chrome.ts). */
export type PreferenceOptionMessage = { [K in PreferenceKey]: `prefs.${K}.${PreferenceValue<K>}` }[PreferenceKey];

export const preferenceOptionMessage = <K extends PreferenceKey>(
  key: K,
  value: PreferenceValue<K>,
): PreferenceOptionMessage => `prefs.${key}.${value}` as PreferenceOptionMessage;

/** True when the set equals the defaults (nothing stored, nothing applied). */
export const isDefault = (prefs: Preferences): boolean =>
  PREFERENCE_KEYS.every((key) => prefs[key] === DEFAULT_PREFERENCES[key]);
