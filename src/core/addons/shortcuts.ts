/**
 * The keyboard-shortcut help (pure): which chord opens it, and the table it shows.
 *
 * Single source of truth: the palette chords come from src/core/chrome/shortcut.ts
 * (its aria-keyshortcuts value, WAI-ARIA 1.2 §aria-keyshortcuts: space-separated
 * alternatives, "+" between the keys of one chord), so the dialog lists exactly
 * what <ft-palette-trigger> listens to. The "?" chord of the help itself follows
 * the same rules as the palette's "/" (src/core/chrome/shortcut.ts):
 *   - never in editable targets, during IME composition, or with Ctrl, ⌘ or Alt
 *     (AltGr reports Alt on many layouts);
 *   - a single printable character, so it honours the reader's preference that
 *     turns single-key shortcuts off (WCAG 2.2 SC 2.1.4 Character Key Shortcuts).
 * "?" is typed with Shift on most layouts, and on different physical keys; only the
 * key value counts (UI Events, KeyboardEvent.key), so the layout does not matter.
 */
import { paletteKeyShortcuts, type KeyChord } from '../chrome/shortcut.ts';

/** aria-keyshortcuts of the help dialog's opener (and of its footer link). */
export const HELP_KEYSHORTCUTS = '?';

export const isHelpShortcut = (k: KeyChord): boolean =>
  k.key === '?' &&
  k.singleKey &&
  !k.ctrlKey &&
  !k.metaKey &&
  !k.altKey &&
  !k.isComposing &&
  !k.editableTarget &&
  !k.defaultPrevented;

/** A chord as the keys to press, in order ("Control+K" → ["Control", "K"]). */
export type Chord = readonly string[];

export type ShortcutAction = 'palette' | 'help' | 'escape';

export type ShortcutRow = {
  readonly action: ShortcutAction;
  /** Alternative chords, any of which performs the action. */
  readonly chords: readonly Chord[];
  /** Whether the row is made of single-character chords that the reader can turn off. */
  readonly singleKey: boolean;
};

/** Parses an aria-keyshortcuts value into chords. "+" alone is a key, not a separator. */
export const parseKeyShortcuts = (value: string): readonly Chord[] =>
  value
    .split(/\s+/u)
    .filter((s) => s !== '')
    .map((chord) => (chord === '+' ? ['+'] : chord.split('+').filter((k) => k !== '')));

/** The rows of the help dialog, in the order they are shown. */
export const shortcutRows = (): readonly ShortcutRow[] => [
  { action: 'palette', chords: parseKeyShortcuts(paletteKeyShortcuts(true)), singleKey: false },
  { action: 'help', chords: parseKeyShortcuts(HELP_KEYSHORTCUTS), singleKey: true },
  { action: 'escape', chords: [['Escape']], singleKey: false },
];

/** Key names as printed on keyboards (the visible key cap); the name itself is the accessible label. */
const CAPS: Readonly<Record<string, string>> = { Control: 'Ctrl', Meta: '⌘', Escape: 'Esc', Shift: '⇧', Alt: 'Alt' };

export const keyCap = (key: string): string => CAPS[key] ?? key;

/** Spoken/accessible name of a key (the ARIA key name, e.g. "Meta" for ⌘). */
export const keyName = (key: string): string => (key === 'Meta' ? 'Command' : key);
