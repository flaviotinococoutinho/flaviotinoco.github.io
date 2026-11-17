/**
 * The reader's preferences in storage and on <html> — one place for every island that changes them
 * (today <ft-preferences>, the panel).
 *
 * Storage is the single source of truth (PREFS_STORAGE_KEY, canonical JSON from the pure codec in
 * src/core/chrome/preferences.ts). A change reads storage first and changes one key, so two controls never
 * overwrite each other's keys with a stale copy. Applying sets the data-* attributes on <html> (what the
 * pre-paint script sets at load) and dispatches `ft:prefs-change` on document, so every open control can
 * mirror the new values.
 */
import {
  DEFAULT_PREFERENCES,
  PREFS_CHANGE_EVENT,
  PREFS_STORAGE_KEY,
  decodePreferences,
  encodePreferences,
  isDefault,
  preferenceAttributes,
  withPreference,
  type PreferenceKey,
  type PreferenceValue,
  type Preferences,
} from '../core/chrome/preferences.ts';

export const readPreferences = (): Preferences => {
  try {
    return decodePreferences(window.localStorage.getItem(PREFS_STORAGE_KEY));
  } catch {
    return DEFAULT_PREFERENCES; // storage blocked (privacy mode, sandboxed frame)
  }
};

export const writePreferences = (prefs: Preferences): void => {
  try {
    if (isDefault(prefs)) window.localStorage.removeItem(PREFS_STORAGE_KEY);
    else window.localStorage.setItem(PREFS_STORAGE_KEY, encodePreferences(prefs));
  } catch {
    // Not persisted, but still applied for this page view.
  }
};

export const applyPreferences = (prefs: Preferences): void => {
  const root = document.documentElement;
  for (const [name, value] of preferenceAttributes(prefs)) {
    if (value === null) root.removeAttribute(name);
    else root.setAttribute(name, value);
  }
  document.dispatchEvent(new CustomEvent<Preferences>(PREFS_CHANGE_EVENT, { detail: prefs }));
};

/** Changes one preference: read, update, persist, apply. Returns the new set. */
export const setPreference = <K extends PreferenceKey>(key: K, value: PreferenceValue<K>): Preferences => {
  const next = withPreference(readPreferences(), key, value);
  writePreferences(next);
  applyPreferences(next);
  return next;
};
