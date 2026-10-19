/**
 * Keyboard-shortcut help: "?" follows the palette's rules for single-key
 * shortcuts (WCAG 2.1.4), and the table is derived from src/core/chrome/shortcut.ts.
 */
import { describe, expect, it } from 'vitest';
import { fc, test } from '@fast-check/vitest';
import {
  HELP_KEYSHORTCUTS,
  isHelpShortcut,
  keyCap,
  keyName,
  parseKeyShortcuts,
  shortcutRows,
} from '../../../src/core/addons/shortcuts.ts';
import { isPaletteShortcut, paletteKeyShortcuts, type KeyChord } from '../../../src/core/chrome/shortcut.ts';

const chord = (over: Partial<KeyChord> = {}): KeyChord => ({
  key: '?',
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  isComposing: false,
  editableTarget: false,
  defaultPrevented: false,
  singleKey: true,
  ...over,
});

describe('the "?" shortcut', () => {
  it('opens the help on a plain "?"', () => {
    expect(isHelpShortcut(chord())).toBe(true);
  });

  it.each([
    ['in a text field', { editableTarget: true }],
    ['during IME composition', { isComposing: true }],
    ['with Ctrl', { ctrlKey: true }],
    ['with ⌘', { metaKey: true }],
    ['with Alt / AltGr', { altKey: true }],
    ['when another handler took the key', { defaultPrevented: true }],
    ['when the reader turned single-key shortcuts off', { singleKey: false }],
    ['for another key', { key: '/' }],
  ] as const)('does nothing %s', (_label, over) => {
    expect(isHelpShortcut(chord(over))).toBe(false);
  });

  test.prop([
    fc.record({
      key: fc.string({ maxLength: 3 }),
      ctrlKey: fc.boolean(),
      metaKey: fc.boolean(),
      altKey: fc.boolean(),
      isComposing: fc.boolean(),
      editableTarget: fc.boolean(),
      defaultPrevented: fc.boolean(),
      singleKey: fc.boolean(),
    }),
  ])('never conflicts with the palette shortcut', (k) => {
    expect(isHelpShortcut(k) && isPaletteShortcut(k)).toBe(false);
  });
});

describe('the table', () => {
  it('lists the palette chords exactly as the palette advertises them', () => {
    const [palette, help, escape] = shortcutRows();
    expect(palette?.chords).toEqual(parseKeyShortcuts(paletteKeyShortcuts(true)));
    expect(palette?.chords).toEqual([['/'], ['Control', 'K'], ['Meta', 'K']]);
    expect(help?.chords).toEqual([[HELP_KEYSHORTCUTS]]);
    expect(help?.singleKey).toBe(true);
    expect(escape?.chords).toEqual([['Escape']]);
  });

  it('parses aria-keyshortcuts, where "+" alone is a key', () => {
    expect(parseKeyShortcuts('Shift+? +  Control+Shift+K')).toEqual([['Shift', '?'], ['+'], ['Control', 'Shift', 'K']]);
    expect(parseKeyShortcuts('')).toEqual([]);
  });

  it('prints key caps and names', () => {
    expect(keyCap('Control')).toBe('Ctrl');
    expect(keyCap('Meta')).toBe('⌘');
    expect(keyCap('K')).toBe('K');
    expect(keyName('Meta')).toBe('Command');
    expect(keyName('Control')).toBe('Control');
  });
});
