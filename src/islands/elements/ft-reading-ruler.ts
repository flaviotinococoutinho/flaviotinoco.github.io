/**
 * <ft-reading-ruler> — a reading ruler: a clear band two lines tall that follows
 * the pointer and the keyboard focus while the rest of the page is washed
 * towards the paper colour (chrome.css draws the wash as the band's shadow).
 *
 * The element sits once in the document shell (BaseLayout) and loads eagerly
 * (it is tiny); it does nothing until the reader turns the ruler on
 * (html[data-ruler="on"], set by the preferences panel or before paint by the
 * stored preference), and stops as soon as it is turned off — the attribute is
 * observed, so a change applies at once. The geometry is pure
 * (src/core/chrome/ruler.ts). Pointer events never reach it (CSS), so the page
 * stays fully usable; it is aria-hidden: a visual aid only.
 */
import { bandAround, bandForRect, lineHeightOf, type RulerBand } from '../../core/chrome/ruler.ts';

const TAG = 'ft-reading-ruler';
const LINES = 2;

const enabled = (): boolean => document.documentElement.getAttribute('data-ruler') === 'on';

/** Line height of the text under a point (the band follows the local leading). */
const lineHeightAt = (x: number, y: number): number => {
  const el = document.elementFromPoint(x, y) ?? document.body;
  const style = getComputedStyle(el);
  return lineHeightOf(style.lineHeight, Number.parseFloat(style.fontSize));
};

class FtReadingRuler extends HTMLElement {
  #abort: AbortController | null = null;
  #observer: MutationObserver | null = null;
  #frame = 0;
  #pointer: { readonly x: number; readonly y: number } | null = null;

  connectedCallback(): void {
    this.setAttribute('aria-hidden', 'true');
    this.#observer = new MutationObserver(() => this.#sync());
    this.#observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-ruler'] });
    this.#sync();
  }

  disconnectedCallback(): void {
    this.#observer?.disconnect();
    this.#observer = null;
    this.#stop();
  }

  #sync(): void {
    if (enabled()) this.#start();
    else this.#stop();
  }

  #start(): void {
    if (this.#abort !== null) return;
    this.#abort = new AbortController();
    const { signal } = this.#abort;
    document.addEventListener(
      'pointermove',
      (event) => {
        this.#pointer = { x: event.clientX, y: event.clientY };
        this.#schedule();
      },
      { passive: true, signal },
    );
    document.documentElement.addEventListener('pointerleave', () => this.#hide(), { signal });
    // Keyboard readers: the band covers the element that received focus.
    document.addEventListener(
      'focusin',
      (event) => {
        const target = event.target;
        if (!(target instanceof Element)) return;
        const rect = target.getBoundingClientRect();
        const style = getComputedStyle(target);
        this.#place(bandForRect(rect, lineHeightOf(style.lineHeight, Number.parseFloat(style.fontSize)), innerHeight));
      },
      { signal },
    );
  }

  #stop(): void {
    this.#abort?.abort();
    this.#abort = null;
    if (this.#frame !== 0) cancelAnimationFrame(this.#frame);
    this.#frame = 0;
    this.#hide();
  }

  /** One layout read per frame, however many pointer events arrive. */
  #schedule(): void {
    if (this.#frame !== 0) return;
    this.#frame = requestAnimationFrame(() => {
      this.#frame = 0;
      const p = this.#pointer;
      if (p === null) return;
      this.#place(bandAround(p.y, lineHeightAt(p.x, p.y), innerHeight, LINES));
    });
  }

  #place(band: RulerBand): void {
    this.style.setProperty('--ruler-top', `${String(band.top)}px`);
    this.style.setProperty('--ruler-height', `${String(band.height)}px`);
    this.hidden = false;
  }

  #hide(): void {
    this.hidden = true;
    this.#pointer = null;
  }
}

if (!customElements.get(TAG)) customElements.define(TAG, FtReadingRuler);
