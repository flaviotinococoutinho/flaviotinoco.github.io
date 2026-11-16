/**
 * <ft-reading-memory article="essay-article"> — where the reader stopped, and the way back there.
 *
 * While the reader reads, it records how far through the article they are and the section they are in
 * (src/core/reading/memory.ts), in localStorage only: nothing leaves the browser. On the next visit to the
 * same page it offers, above the article, to continue from there, or to forget. The reading room's candle
 * (ft-reading-room) reads the same record, so it starts as burnt down as the reader left it.
 *
 * Recording is careful not to erase a place by accident: a visit that only peeks at the top (less than
 * RESUME_MIN of the article) does not overwrite it, and the furthest point never shrinks. Saving happens at
 * most once a second while scrolling, and when the page is hidden or left.
 *
 * Without JavaScript or storage the element stays hidden: there is nothing to remember.
 */
import {
  MEMORY_STORAGE_KEY,
  RESUME_MIN,
  dayOf,
  decodeMemory,
  encodeMemory,
  forget,
  remember,
  sectionAt,
  shouldOffer,
  type ReadingMemory,
} from '../../core/reading/memory.ts';
import { pinnedProgress } from '../../core/reading/scroll.ts';
import { isLocale, type Locale } from '../../core/domain/locale.ts';
import reading from '../../core/i18n/catalogs/reading.ts';
import { translator } from '../../core/i18n/messages.ts';

const TAG = 'ft-reading-memory';
const SAVE_MS = 1000;

const read = (): ReadingMemory => {
  try {
    return decodeMemory(localStorage.getItem(MEMORY_STORAGE_KEY));
  } catch {
    return {};
  }
};

const write = (memory: ReadingMemory): void => {
  try {
    localStorage.setItem(MEMORY_STORAGE_KEY, encodeMemory(memory));
  } catch {
    // Storage full or blocked: the reading simply is not remembered.
  }
};

class FtReadingMemory extends HTMLElement {
  #article: HTMLElement | null = null;
  #abort: AbortController | null = null;
  #timer = 0;
  #moved = false;

  connectedCallback(): void {
    this.#article = document.getElementById(this.getAttribute('article') ?? '');
    if (this.#article === null) return;
    const lang = document.documentElement.lang;
    const locale: Locale = isLocale(lang) ? lang : 'pt-BR';
    const t = translator(reading, locale);
    const page = location.pathname;
    const entry = read()[page];

    // Offer only to a reader who arrives at the top: one who followed a link to a section is already somewhere.
    if (shouldOffer(entry, dayOf(Date.now())) && window.scrollY < window.innerHeight / 2 && location.hash === '') {
      const heading = entry.section === null ? null : document.getElementById(entry.section);
      const percent = new Intl.NumberFormat(locale, { style: 'percent' }).format(entry.progress);
      const text = document.createElement('p');
      text.className = 'memory__text';
      text.textContent =
        heading === null
          ? t('memory.resume.start', { percent })
          : t('memory.resume', { section: (heading.textContent ?? '').trim(), percent });
      const actions = document.createElement('p');
      actions.className = 'memory__actions';
      const go = document.createElement('button');
      go.type = 'button';
      go.className = 'memory__button memory__button--primary';
      go.textContent = t('memory.continue');
      const drop = document.createElement('button');
      drop.type = 'button';
      drop.className = 'memory__button';
      drop.textContent = t('memory.forget');
      const note = document.createElement('span');
      note.className = 'memory__note';
      note.textContent = t('memory.note');
      actions.append(go, drop, note);
      const status = document.createElement('p');
      status.className = 'memory__status';
      status.setAttribute('role', 'status');
      this.setAttribute('role', 'region');
      this.setAttribute('aria-label', t('memory.label'));
      this.replaceChildren(text, actions, status);
      this.hidden = false;

      go.addEventListener('click', () => {
        const article = this.#article;
        if (article === null) return;
        const box = article.getBoundingClientRect();
        const top = box.top + window.scrollY + entry.progress * Math.max(0, box.height - window.innerHeight);
        const motion = getComputedStyle(document.documentElement).getPropertyValue('--motion').trim() !== '0';
        window.scrollTo({ top, behavior: motion ? 'smooth' : 'auto' });
        this.hidden = true;
        // Keyboard and screen reader users continue from the section, not from the button that vanished.
        const target = heading ?? article;
        if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
        target.focus({ preventScroll: true });
      });
      drop.addEventListener('click', () => {
        write(forget(read(), page));
        text.hidden = true;
        actions.hidden = true;
        status.textContent = t('memory.forgotten');
      });
    }

    this.#abort = new AbortController();
    const { signal } = this.#abort;
    window.addEventListener(
      'scroll',
      () => {
        this.#moved = true;
        if (this.#timer === 0) this.#timer = window.setTimeout(() => this.#save(), SAVE_MS);
      },
      { passive: true, signal },
    );
    document.addEventListener('visibilitychange', () => document.hidden && this.#save(), { signal });
    window.addEventListener('pagehide', () => this.#save(), { signal });
  }

  disconnectedCallback(): void {
    this.#save();
    this.#abort?.abort();
    this.#abort = null;
  }

  #save(): void {
    window.clearTimeout(this.#timer);
    this.#timer = 0;
    const article = this.#article;
    if (article === null || !this.#moved) return;
    const box = article.getBoundingClientRect();
    const progress = pinnedProgress(box.top, box.height, window.innerHeight);
    const memory = read();
    const page = location.pathname;
    const before = memory[page];
    // Peeking at the top does not erase a place; only reading does.
    if (progress < RESUME_MIN && before !== undefined) return;
    const line = window.innerHeight * 0.3;
    const headings = [...article.querySelectorAll<HTMLElement>('h2[id], h3[id]')].map((h) => ({
      id: h.id,
      top: h.getBoundingClientRect().top,
    }));
    write(remember(memory, page, progress, sectionAt(headings, line), dayOf(Date.now())));
  }
}

if (!customElements.get(TAG)) customElements.define(TAG, FtReadingMemory);
