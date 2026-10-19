/**
 * Pre-paint preference application (imperative shell, runs in <head>).
 *
 * Reads the reader's stored preferences and sets data-* attributes on <html>
 * BEFORE first paint, so there is no flash of the wrong theme. It must be an
 * inline classic script; its SHA-256 is registered with the CSP by BaseLayout.
 * Keep it tiny, dependency-free and total (every failure path is a no-op).
 *
 * The script is COMPILED from the pure preference model
 * (src/core/chrome/preferences.ts): for every key it embeds the allow-list of
 * attribute values (all values except the default), and a stored value is
 * applied only on exact membership — anything else (unknown keys, unknown or
 * non-string values, corrupt JSON, storage access errors) is ignored. This is
 * the same per-key rule as decodePreferences(), so the attributes set here and
 * the state <ft-preferences> later shows always agree.
 *
 * Also sets data-daypart (dawn | day | dusk | night) from the local clock with
 * the expression compiled from src/core/chrome/daypart.ts: only decorative
 * layers (ambient hero) react to it, never text colours; and data-js, which CSS
 * uses to reveal controls that need JavaScript.
 */
import { createHash } from 'node:crypto';
import { ATTRIBUTE_VALUES, PREFERENCE_KEYS, PREFS_STORAGE_KEY } from '../../core/chrome/preferences.ts';
import { daypartExpression } from '../../core/chrome/daypart.ts';

export { PREFS_STORAGE_KEY };

/**
 * Preference keys mirrored as data-<key> on <html>: theme, contrast, motion, text,
 * face, hyphens, texture, shortcut, cvd — derived from the pure model, so a key
 * added there is applied before paint without touching this file.
 */
export const PREFS_KEYS = PREFERENCE_KEYS;

/** key → space-separated allow-list, e.g. { theme: "light dark", … }. Values are [a-z]+ so the separator is unambiguous. */
const ALLOW: Readonly<Record<string, string>> = Object.fromEntries(
  PREFERENCE_KEYS.map((key) => [key, (ATTRIBUTE_VALUES[key] as readonly string[]).join(' ')]),
);

export const PREFS_INIT_SCRIPT = `(()=>{var d=document.documentElement,a=${JSON.stringify(ALLOW)};try{var p=JSON.parse(localStorage.getItem(${JSON.stringify(PREFS_STORAGE_KEY)})||"{}");if(p&&typeof p==="object")for(var k in a){var v=p[k];if(typeof v==="string"&&a[k].split(" ").indexOf(v)>=0)d.setAttribute("data-"+k,v)}}catch(e){}var h=new Date().getHours();d.setAttribute("data-daypart",${daypartExpression('h')});d.setAttribute("data-js","")})();`;

export const PREFS_INIT_HASH = `sha256-${createHash('sha256').update(PREFS_INIT_SCRIPT).digest('base64')}` as const;
