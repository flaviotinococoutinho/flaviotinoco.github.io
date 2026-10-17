/**
 * <ft-palette-trigger> — opens the command palette (a modal <dialog>) from its
 * button or from the global shortcut "/" · Ctrl+K · ⌘K.
 *
 * Performance split (docs/arquitetura.md §7, spec item 10): this element sits
 * in the header, so the registry loads it with the page; it is deliberately
 * tiny (shortcut + open + focus return). The search behaviour lives in
 * <ft-command-palette>, which is placed INSIDE the dialog: a closed dialog is
 * not rendered, so the registry's IntersectionObserver only sees it — and only
 * then downloads its module and Pagefind — when the reader opens the palette.
 *
 * The single-key "/" shortcut honours the reader's preference (data-shortcut="off"
 * on <html>, WCAG 2.1.4); it is read at keystroke time, so a change made in the
 * preferences panel applies immediately.
 *
 * Focus: on close, focus returns to whatever had it when the palette opened,
 * or to the trigger when the shortcut was pressed with nothing focused
 * (WAI-ARIA APG dialog pattern). preventScroll keeps the reading position.
 *
 * Expected structure:
 *   <ft-palette-trigger><button aria-controls="DIALOG-ID">…</button></ft-palette-trigger>
 *   …
 *   <dialog id="DIALOG-ID">…</dialog>
 */
import { isPaletteShortcut, paletteKeyShortcuts } from '../../core/chrome/shortcut.ts';

const TAG = 'ft-palette-trigger';

const singleKeyEnabled = (): boolean => document.documentElement.getAttribute('data-shortcut') !== 'off';

const isEditable = (target: EventTarget | null): boolean =>
  target instanceof HTMLElement &&
  (target.isContentEditable ||
    target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])') !== null);

class FtPaletteTrigger extends HTMLElement {
  #abort: AbortController | null = null;
  #opener: HTMLElement | null = null;

  connectedCallback(): void {
    const button = this.querySelector<HTMLButtonElement>('button[aria-controls]');
    const id = button?.getAttribute('aria-controls');
    const dialog = id ? document.getElementById(id) : null;
    if (button === null || !(dialog instanceof HTMLDialogElement)) return;
    this.#abort = new AbortController();
    const { signal } = this.#abort;

    const open = (): void => {
      if (dialog.open) return;
      const active = document.activeElement;
      this.#opener = active instanceof HTMLElement && active !== document.body ? active : button;
      dialog.showModal();
    };

    // Advertise only the chords that currently work (the visible "/" key cap is hidden by CSS).
    // Observing the attribute (rather than importing the preferences module for its change
    // event) keeps this always-loaded element free of the preference model.
    const syncKeys = (): void => button.setAttribute('aria-keyshortcuts', paletteKeyShortcuts(singleKeyEnabled()));
    syncKeys();
    const observer = new MutationObserver(syncKeys);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-shortcut'] });
    signal.addEventListener('abort', () => observer.disconnect());

    button.addEventListener('click', open, { signal });
    document.addEventListener(
      'keydown',
      (event) => {
        const chord = {
          key: event.key,
          ctrlKey: event.ctrlKey,
          metaKey: event.metaKey,
          altKey: event.altKey,
          isComposing: event.isComposing,
          editableTarget: isEditable(event.target),
          defaultPrevented: event.defaultPrevented,
          singleKey: singleKeyEnabled(),
        };
        if (dialog.open || !isPaletteShortcut(chord)) return;
        event.preventDefault();
        open();
      },
      { signal },
    );
    dialog.addEventListener(
      'close',
      () => {
        const target = this.#opener?.isConnected ? this.#opener : button;
        this.#opener = null;
        target.focus({ preventScroll: true });
      },
      { signal },
    );
    // Light dismiss where <dialog closedby="any"> is not implemented yet: a click on the backdrop
    // targets the dialog element itself (its content box is covered by the palette body).
    if (!('closedBy' in HTMLDialogElement.prototype)) {
      dialog.addEventListener(
        'click',
        (event) => {
          if (event.target === dialog) dialog.close();
        },
        { signal },
      );
    }
  }

  disconnectedCallback(): void {
    this.#abort?.abort();
    this.#abort = null;
  }
}

if (!customElements.get(TAG)) customElements.define(TAG, FtPaletteTrigger);
