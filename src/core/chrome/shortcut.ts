/**
 * Global keyboard shortcut that opens the command palette: "/" (as on GitHub,
 * YouTube, MDN) or Ctrl+K / ⌘K. Kept in its own tiny module because the
 * element that listens for it is loaded on every page.
 *
 * Keystrokes typed into editable targets (input, textarea, select,
 * contenteditable) are never intercepted, nor are IME compositions (WCAG 2.1.4
 * Character Key Shortcuts: a single-character shortcut must not fire while the
 * reader is typing), nor chords with Alt (AltGr on many layouts types "/").
 */

export interface KeyChord {
  readonly key: string;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly altKey: boolean;
  readonly isComposing: boolean;
  readonly editableTarget: boolean;
  readonly defaultPrevented: boolean;
}

export const isPaletteShortcut = (k: KeyChord): boolean => {
  if (k.isComposing || k.editableTarget || k.altKey || k.defaultPrevented) return false;
  if (k.key === '/') return !k.ctrlKey && !k.metaKey;
  if (k.key === 'k' || k.key === 'K') return k.ctrlKey !== k.metaKey; // exactly one of Ctrl / ⌘
  return false;
};

/** The ARIA keyshortcuts value advertising the same chords (WAI-ARIA 1.2 §aria-keyshortcuts). */
export const PALETTE_KEYSHORTCUTS = '/ Control+K Meta+K';
