/**
 * <ft-sidenotes> — enhances the side and margin notes of the article it wraps
 * (markup from the reading stage, src/core/reading/transform.ts).
 *
 *   wide screens   the CSS places each note in the margin column, level with its
 *                  mark (anchor positioning); this element stacks them so they
 *                  never overlap (src/core/reading/margin.ts) and re-stacks when
 *                  the article's layout changes (fonts, images, opened stretchtext).
 *   narrow screens each note folds behind a <button aria-expanded> placed where
 *                  its mark is (Tufte's toggle, without the checkbox hack); the
 *                  link to the note stays in the DOM, hidden, for the wide layout.
 *   no JS / no anchor positioning: the notes simply show inline (CSS).
 */
import { stackNotes } from '../../core/reading/margin.ts';

const WIDE = '(width >= 72rem)';
const GAP_PX = 10;

class FtSidenotes extends HTMLElement {
  #media: MediaQueryList | null = null;
  #resize: ResizeObserver | null = null;
  #frame = 0;
  readonly #toggles = new Map<HTMLElement, HTMLButtonElement>();

  connectedCallback(): void {
    this.#media = matchMedia(WIDE);
    this.#media.addEventListener('change', this.#apply);
    this.#resize = new ResizeObserver(this.#schedule);
    this.#resize.observe(this);
    this.#apply();
  }

  disconnectedCallback(): void {
    this.#media?.removeEventListener('change', this.#apply);
    this.#resize?.disconnect();
    cancelAnimationFrame(this.#frame);
  }

  #notes(): HTMLElement[] {
    return [...this.querySelectorAll<HTMLElement>('.sidenote, .marginnote')];
  }

  readonly #apply = (): void => {
    const wide = this.#media?.matches === true;
    this.toggleAttribute('data-wide', wide);
    for (const note of this.#notes()) {
      const button = this.#toggle(note);
      const link = note.querySelector<HTMLElement>('.sidenote__link');
      button.hidden = wide;
      if (link !== null) link.hidden = !wide;
      this.#setOpen(note, button, wide);
    }
    this.#schedule();
  };

  /** The toggle of a note, created on first use: the number for sidenotes, ⊕ for margin notes. */
  #toggle(note: HTMLElement): HTMLButtonElement {
    const existing = this.#toggles.get(note);
    if (existing !== undefined) return existing;
    const body = note.querySelector<HTMLElement>('.sidenote__note, .marginnote__note');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'note-toggle';
    if (body !== null) button.setAttribute('aria-controls', body.id);
    const link = note.querySelector<HTMLElement>('.sidenote__link');
    if (link !== null) {
      button.textContent = link.textContent;
      button.setAttribute('aria-label', link.getAttribute('aria-label') ?? '');
      link.after(button);
    } else {
      button.textContent = '⊕';
      button.setAttribute('aria-label', note.dataset['label'] ?? '');
      note.prepend(button);
    }
    button.addEventListener('click', () => {
      this.#setOpen(note, button, button.getAttribute('aria-expanded') !== 'true');
      this.#schedule();
    });
    this.#toggles.set(note, button);
    return button;
  }

  #setOpen(note: HTMLElement, button: HTMLButtonElement, open: boolean): void {
    button.setAttribute('aria-expanded', String(open));
    note.toggleAttribute('data-collapsed', !open);
  }

  readonly #schedule = (): void => {
    cancelAnimationFrame(this.#frame);
    this.#frame = requestAnimationFrame(this.#stack);
  };

  /** Margin layout: measure the desired positions, resolve collisions in the core, write the shifts. */
  readonly #stack = (): void => {
    const bodies = this.#notes()
      .map((n) => n.querySelector<HTMLElement>('.sidenote__note, .marginnote__note'))
      .filter((b): b is HTMLElement => b !== null);
    for (const b of bodies) b.style.removeProperty('--shift');
    if (this.#media?.matches !== true) return;
    // Only notes the CSS actually placed in the margin (not folded, not inline in tables or panels).
    const placed = bodies.filter((b) => getComputedStyle(b).position === 'absolute' && b.getClientRects().length > 0);
    const boxes = placed.map((b) => {
      const r = b.getBoundingClientRect();
      return { top: r.top, height: r.height };
    });
    const tops = stackNotes(boxes, GAP_PX);
    placed.forEach((b, i) => {
      const shift = (tops[i] ?? 0) - (boxes[i]?.top ?? 0);
      if (shift > 0.5) b.style.setProperty('--shift', `${shift.toFixed(1)}px`);
    });
  };
}

if (!customElements.get('ft-sidenotes')) customElements.define('ft-sidenotes', FtSidenotes);
