/**
 * <ft-horizontal> — a horizontal passage inside the vertical reading.
 *
 * Default (no JS, narrow screens, reduced motion): the markup is a native,
 * horizontally scrollable region with scroll-snap (role=region, aria-label,
 * tabindex=0, a visible hint) — fully usable with keyboard, touch and AT.
 *
 * Pinned mode (data-mode="pinned", set here on wide screens with motion
 * allowed): the element becomes as tall as its panels and its viewport sticks
 * to the top of the screen while vertical scrolling slides the track sideways.
 * The slide is a CSS scroll-driven animation (view timeline, range "contain")
 * where supported; elsewhere this element computes the same pinned progress
 * (src/core/reading/scroll.ts) from a passive, frame-throttled scroll listener
 * that is attached only while the passage is on screen. Keyboard focus moving
 * into a panel scrolls the page to the position that shows that panel.
 */
import { pinnedProgress, scrollOffsetForPanel } from '../../core/reading/scroll.ts';

const PINNABLE = '(width >= 48rem) and (prefers-reduced-motion: no-preference)';
const CSS_TIMELINE = typeof CSS !== 'undefined' && CSS.supports('animation-timeline: view()');

class FtHorizontal extends HTMLElement {
  #panels = 1;
  #media: MediaQueryList | null = null;
  #prefs: MutationObserver | null = null;
  #visibility: IntersectionObserver | null = null;
  #listening = false;
  #frame = 0;

  connectedCallback(): void {
    this.#panels = Math.max(1, Number(this.dataset['panels'] ?? '1') || 1);
    this.#media = matchMedia(PINNABLE);
    this.#media.addEventListener('change', this.#apply);
    // The reader's motion preference (data-motion on <html>) overrides the OS setting.
    this.#prefs = new MutationObserver(this.#apply);
    this.#prefs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-motion'] });
    this.addEventListener('focusin', this.#onFocus);
    this.#apply();
  }

  disconnectedCallback(): void {
    this.#media?.removeEventListener('change', this.#apply);
    this.#prefs?.disconnect();
    this.#visibility?.disconnect();
    this.#listen(false);
    this.removeEventListener('focusin', this.#onFocus);
  }

  readonly #apply = (): void => {
    const pinned =
      this.#panels > 1 && this.#media?.matches === true && document.documentElement.dataset['motion'] !== 'reduce';
    this.dataset['mode'] = pinned ? 'pinned' : 'scroll';
    this.#visibility?.disconnect();
    this.#visibility = null;
    this.#listen(false);
    this.style.removeProperty('--h-progress');
    if (pinned && !CSS_TIMELINE) {
      this.#visibility = new IntersectionObserver((entries) => {
        const visible = entries.some((e) => e.isIntersecting);
        this.#listen(visible);
        if (visible) this.#update();
      });
      this.#visibility.observe(this);
    }
  };

  #listen(on: boolean): void {
    if (on === this.#listening) return;
    this.#listening = on;
    if (on) window.addEventListener('scroll', this.#onScroll, { passive: true });
    else {
      window.removeEventListener('scroll', this.#onScroll);
      cancelAnimationFrame(this.#frame);
    }
  }

  readonly #onScroll = (): void => {
    cancelAnimationFrame(this.#frame);
    this.#frame = requestAnimationFrame(this.#update);
  };

  readonly #update = (): void => {
    const r = this.getBoundingClientRect();
    const progress = pinnedProgress(r.top, r.height, window.innerHeight);
    this.style.setProperty('--h-progress', progress.toFixed(4));
  };

  readonly #onFocus = (event: FocusEvent): void => {
    if (this.dataset['mode'] !== 'pinned' || !(event.target instanceof Element)) return;
    const panel = event.target.closest<HTMLElement>('.horizontal__panel');
    if (panel === null) return;
    const index = Number(panel.dataset['index'] ?? '0');
    const top = this.getBoundingClientRect().top + window.scrollY;
    const y = scrollOffsetForPanel(index, this.#panels, top, this.offsetHeight, window.innerHeight);
    window.scrollTo({ top: y, behavior: 'instant' });
  };
}

if (!customElements.get('ft-horizontal')) customElements.define('ft-horizontal', FtHorizontal);
