/**
 * Global keyboard shortcut that opens the command palette: "/" (as on GitHub,
 * YouTube, MDN) or Ctrl+K / ⌘K. Kept in its own tiny module because the
 * element that listens for it is loaded on every page.
 *
 * Keystrokes typed into editable targets (input, textarea, select,
 * contenteditable) are never intercepted, nor are IME compositions, nor chords
 * with Alt (AltGr on many layouts types "/").
 *
 * WCAG 2.2 SC 2.1.4 (Character Key Shortcuts): a shortcut made of a single
 * printable character must be possible to turn off. "/" therefore fires only
 * while the reader's `shortcut` preference is on (src/core/chrome/preferences.ts,
 * mirrored as data-shortcut="off" on <html> when turned off). Ctrl/⌘ K uses a
 * modifier, so the criterion does not apply to it and it always works.
 */

export interface KeyChord {
  readonly key: string;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly altKey: boolean;
  readonly isComposing: boolean;
  readonly editableTarget: boolean;
  readonly defaultPrevented: boolean;
  /** Whether single-character shortcuts are enabled (reader preference). */
  readonly singleKey: boolean;
}

export const isPaletteShortcut = (k: KeyChord): boolean => {
  if (k.isComposing || k.editableTarget || k.altKey || k.defaultPrevented) return false;
  if (k.key === '/') return k.singleKey && !k.ctrlKey && !k.metaKey;
  if (k.key === 'k' || k.key === 'K') return k.ctrlKey !== k.metaKey; // exactly one of Ctrl / ⌘
  return false;
};

/**
 * The ARIA keyshortcuts value advertising the chords that are currently active
 * (WAI-ARIA 1.2 §aria-keyshortcuts: space-separated alternatives).
 */
export const paletteKeyShortcuts = (singleKey: boolean): string =>
  singleKey ? '/ Control+K Meta+K' : 'Control+K Meta+K';

/** Server-rendered default (the preference is on unless the reader turns it off). */
export const PALETTE_KEYSHORTCUTS = paletteKeyShortcuts(true);
