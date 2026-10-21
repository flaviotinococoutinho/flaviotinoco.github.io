/**
 * The reader preferences form as data — /<lang>/preferences.json (ADR 0009:
 * chrome on demand).
 *
 *   build  : preferencesForm(locale) : PreferencesForm                 (pure: catalog + model)
 *   encode : PreferencesForm → string                                  (build time, one file per locale)
 *   decode : unknown → Result<PreferencesForm, string>                 (browser, when the panel opens)
 *   law    : decode(JSON.parse(encode(f))) = ok(f)                     (tests/unit/chrome/chrome-data.test.ts)
 *
 * One group per preference key, one option per value of its domain
 * (PREFERENCE_KEYS × PREFERENCE_DOMAINS), labels and announcements from the
 * chrome catalog, so the island ships no UI text and no formatter. The form
 * used to be ≈ 7.6 KiB of static HTML in every page; <ft-preferences> now
 * builds it from this document the first time the panel opens.
 */
import { err, ok, type Result } from '../algebra/result.ts';
import { show } from '../algebra/show.ts';
import type { Locale } from '../domain/locale.ts';
import chrome from '../i18n/catalogs/chrome.ts';
import { translator } from '../i18n/messages.ts';
import {
  DEFAULT_PREFERENCES,
  PREFERENCE_DOMAINS,
  PREFERENCE_KEYS,
  isPreferenceKey,
  isPreferenceValue,
  preferenceOptionMessage,
  type PreferenceKey,
} from './preferences.ts';

export const PREFERENCES_FORM_VERSION = 1;

export interface PreferenceOption {
  readonly value: string;
  readonly label: string;
  /** Sentence announced after choosing this option ("Tema: Escuro."). */
  readonly announce: string;
  /** The site default (what the form shows before the stored choice is mirrored). */
  readonly checked: boolean;
}

export interface PreferenceGroup {
  readonly key: PreferenceKey;
  readonly legend: string;
  readonly hint: string | null;
  readonly options: readonly PreferenceOption[];
}

export interface PreferencesForm {
  readonly version: number;
  readonly groups: readonly PreferenceGroup[];
}

/** Keys with an explanatory hint below the group (`prefs.<key>.hint` in the chrome catalog). */
const HINTS: Partial<Record<PreferenceKey, 'prefs.face.hint' | 'prefs.shortcut.hint' | 'prefs.cvd.hint'>> = {
  face: 'prefs.face.hint',
  shortcut: 'prefs.shortcut.hint',
  cvd: 'prefs.cvd.hint',
};

/** The form of one locale, generated from the model and the catalog. */
export const preferencesForm = (locale: Locale): PreferencesForm => {
  const c = translator(chrome, locale);
  return {
    version: PREFERENCES_FORM_VERSION,
    groups: PREFERENCE_KEYS.map((key) => {
      const legend = c(`prefs.${key}`);
      const hintKey = HINTS[key];
      const values = PREFERENCE_DOMAINS[key] as readonly (typeof PREFERENCE_DOMAINS)[typeof key][number][];
      return {
        key,
        legend,
        hint: hintKey === undefined ? null : c(hintKey),
        options: values.map((value) => {
          const label = c(preferenceOptionMessage(key, value));
          return {
            value,
            label,
            announce: c('prefs.applied', { setting: legend, value: label }),
            checked: value === DEFAULT_PREFERENCES[key],
          };
        }),
      };
    }),
  };
};

export const encodePreferencesForm = (form: PreferencesForm): string => JSON.stringify(form);

const isRecord = (v: unknown): v is Readonly<Record<string, unknown>> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const nonEmpty = (v: unknown): v is string => typeof v === 'string' && v.length > 0;

const parseOption = (key: PreferenceKey, v: unknown, index: number): Result<PreferenceOption, string> => {
  if (!isRecord(v)) return err(`group "${key}", option ${index}: not an object (${show(v)})`);
  const { value, label, announce, checked } = v;
  if (!isPreferenceValue(key, value)) return err(`group "${key}", option ${index}: unknown value ${show(value)}`);
  if (!nonEmpty(label)) return err(`group "${key}", option ${index}: label must be a non-empty string`);
  if (typeof announce !== 'string') return err(`group "${key}", option ${index}: announce must be a string`);
  if (typeof checked !== 'boolean') return err(`group "${key}", option ${index}: checked must be a boolean`);
  return ok({ value, label, announce, checked });
};

const parseGroup = (v: unknown, index: number): Result<PreferenceGroup, string> => {
  if (!isRecord(v)) return err(`group ${index}: not an object (${show(v)})`);
  const { key, legend, hint, options } = v;
  if (!isPreferenceKey(key)) return err(`group ${index}: unknown preference key ${show(key)}`);
  if (!nonEmpty(legend)) return err(`group "${key}": legend must be a non-empty string`);
  if (hint !== null && !nonEmpty(hint)) return err(`group "${key}": hint must be null or a non-empty string`);
  if (!Array.isArray(options) || options.length === 0) return err(`group "${key}": options must be a non-empty list`);
  const parsed: PreferenceOption[] = [];
  for (const [i, o] of (options as readonly unknown[]).entries()) {
    const r = parseOption(key, o, i);
    if (!r.ok) return r;
    parsed.push(r.value);
  }
  const checked = parsed.filter((o) => o.checked).length;
  if (checked !== 1) return err(`group "${key}": exactly one option must be checked (found ${checked})`);
  return ok({ key, legend, hint, options: parsed });
};

/** Decodes a preferences.json payload; any malformed group fails the whole document. */
export const decodePreferencesForm = (raw: unknown): Result<PreferencesForm, string> => {
  if (!isRecord(raw) || raw['version'] !== PREFERENCES_FORM_VERSION || !Array.isArray(raw['groups'])) {
    return err('malformed preferences form payload');
  }
  const groups: PreferenceGroup[] = [];
  const seen = new Set<PreferenceKey>();
  for (const [index, g] of (raw['groups'] as readonly unknown[]).entries()) {
    const parsed = parseGroup(g, index);
    if (!parsed.ok) return parsed;
    if (seen.has(parsed.value.key)) return err(`group "${parsed.value.key}" appears twice`);
    seen.add(parsed.value.key);
    groups.push(parsed.value);
  }
  return ok({ version: PREFERENCES_FORM_VERSION, groups });
};
