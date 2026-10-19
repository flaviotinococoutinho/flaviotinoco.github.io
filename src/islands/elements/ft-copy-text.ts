/**
 * <ft-copy-text> — copy buttons for short texts (the "how to cite" box), and the
 * clipboard + announcement helpers shared by the other add-on islands
 * (ft-heading-anchor, ft-copy-tex, ft-quote-selection, ft-share).
 *
 * Structure (server-rendered; the buttons stay hidden until this module upgrades
 * the element, so a reader without JavaScript never meets an inert control and
 * can select the visible text as usual):
 *
 *   <ft-copy-text data-copied="Copiado" data-failed="…">
 *     <p id="cite-ref">TINOCO, Flávio. …</p>
 *     <button type="button" data-copy-text="…exact plain text…" data-copy-source="cite-ref" hidden>Copiar</button>
 *   </ft-copy-text>
 *
 * Copy: the asynchronous Clipboard API (W3C Clipboard API and events,
 * navigator.clipboard.writeText — secure contexts only, user activation). When it
 * is missing or refused, the selection fallback selects the source element's
 * text (or a temporary off-screen copy) and tries document.execCommand('copy');
 * if that fails too, the text is left SELECTED and the reader is told to copy it
 * with the keyboard. The result is announced in the page's polite live region
 * (#ft-announce in BaseLayout; WCAG 2.2 SC 4.1.3 Status Messages).
 */

const TAG = 'ft-copy-text';

/** Announces a status message in the shared polite live region (created if a page lacks it). */
export const announce = (message: string): void => {
  let region = document.getElementById('ft-announce');
  if (region === null) {
    region = document.createElement('p');
    region.id = 'ft-announce';
    region.className = 'visually-hidden';
    region.setAttribute('role', 'status');
    document.body.append(region);
  }
  const live = region;
  // Clear first, then write on the next frame, so that the same message twice is announced twice.
  live.textContent = '';
  requestAnimationFrame(() => {
    live.textContent = message;
  });
};

/** Selects the text of an element (or of a temporary node when there is none) and returns the range's node. */
const selectText = (text: string, source: Element | null): (() => void) => {
  const selection = window.getSelection();
  if (selection === null) return () => undefined;
  let temporary: HTMLElement | null = null;
  let node: Element | null = source;
  if (node === null || (node.textContent ?? '').trim() !== text.trim()) {
    temporary = document.createElement('pre');
    temporary.className = 'visually-hidden';
    temporary.textContent = text;
    document.body.append(temporary);
    node = temporary;
  }
  const range = document.createRange();
  range.selectNodeContents(node);
  selection.removeAllRanges();
  selection.addRange(range);
  return () => temporary?.remove();
};

/**
 * Copies `text`. Resolves to true when it reached the clipboard; false when the
 * text was left selected for the reader to copy (`source`, if given, is what is
 * selected — it must show the same text).
 */
export const copyText = async (text: string, source: Element | null = null): Promise<boolean> => {
  try {
    if (navigator.clipboard !== undefined && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Refused (permissions, no user activation): fall through to the selection.
  }
  const cleanup = selectText(text, source);
  let copied = false;
  try {
    // Deprecated but still the only synchronous path in browsers without the async API.
    copied = document.execCommand('copy');
  } catch {
    copied = false;
  }
  if (copied) {
    window.getSelection()?.removeAllRanges();
    cleanup();
  } else {
    // Leave the text selected for Ctrl/⌘ C; drop the temporary copy once the selection changes.
    window.setTimeout(() => document.addEventListener('selectionchange', cleanup, { once: true }), 0);
  }
  return copied;
};

class FtCopyText extends HTMLElement {
  #abort: AbortController | null = null;

  connectedCallback(): void {
    this.#abort = new AbortController();
    const done = this.dataset['copied'] ?? '';
    const failed = this.dataset['failed'] ?? '';
    for (const button of this.querySelectorAll<HTMLButtonElement>('button[data-copy-text]')) {
      button.hidden = false;
      button.addEventListener(
        'click',
        () => {
          const text = button.dataset['copyText'] ?? '';
          const sourceId = button.dataset['copySource'];
          const source = sourceId === undefined ? null : document.getElementById(sourceId);
          void copyText(text, source).then((ok) => {
            announce(ok ? done : failed);
            if (ok) {
              button.dataset['state'] = 'copied';
              // 1597 ms = --duration-7, the longest Fibonacci step of the design tokens.
              window.setTimeout(() => delete button.dataset['state'], 1597);
            }
          });
        },
        { signal: this.#abort.signal },
      );
    }
  }

  disconnectedCallback(): void {
    this.#abort?.abort();
    this.#abort = null;
  }
}

if (!customElements.get(TAG)) customElements.define(TAG, FtCopyText);
