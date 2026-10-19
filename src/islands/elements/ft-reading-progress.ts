/**
 * <ft-reading-progress data-target="id"> — progress through the ARTICLE.
 *
 * Where scroll-driven animations exist, CSS alone draws the line from the
 * article's view timeline (src/styles/components/reading.css); this module
 * then only records data-mode="css". Elsewhere it computes the same pinned
 * progress (src/core/reading/scroll.ts) from a passive, frame-throttled scroll
 * listener attached while the article is on screen, and writes
 * --reading-progress. The element is aria-hidden: decorative (see
 * src/components/reading/ReadingProgress.astro for the reasoning).
 */
import { pinnedProgress } from '../../core/reading/scroll.ts';

const CSS_TIMELINE = typeof CSS !== 'undefined' && CSS.supports('animation-timeline: view()');

class FtReadingProgress extends HTMLElement {
  #target: HTMLElement | null = null;
  #visibility: IntersectionObserver | null = null;
  #frame = 0;

  connectedCallback(): void {
    if (CSS_TIMELINE) {
      this.dataset['mode'] = 'css';
      return;
    }
    this.#target = document.getElementById(this.dataset['target'] ?? '');
    if (this.#target === null) return;
    this.dataset['mode'] = 'js';
    this.#visibility = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) window.addEventListener('scroll', this.#onScroll, { passive: true });
      else window.removeEventListener('scroll', this.#onScroll);
      this.#update();
    });
    this.#visibility.observe(this.#target);
  }

  disconnectedCallback(): void {
    this.#visibility?.disconnect();
    window.removeEventListener('scroll', this.#onScroll);
    cancelAnimationFrame(this.#frame);
  }

  readonly #onScroll = (): void => {
    cancelAnimationFrame(this.#frame);
    this.#frame = requestAnimationFrame(this.#update);
  };

  readonly #update = (): void => {
    if (this.#target === null) return;
    const r = this.#target.getBoundingClientRect();
    this.style.setProperty('--reading-progress', pinnedProgress(r.top, r.height, window.innerHeight).toFixed(4));
  };
}

if (!customElements.get('ft-reading-progress')) customElements.define('ft-reading-progress', FtReadingProgress);
