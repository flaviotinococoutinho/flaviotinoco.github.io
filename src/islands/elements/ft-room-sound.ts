/**
 * <ft-room-sound article="essay-article"> — the sound of the reading room (docs/adr/0014-sala-de-leitura.md,
 * decision 19): rain on the window, the fire, the wind, pages and a copyist's quill, computed in the browser.
 *
 * Silent by default. The reader's preference `sound` (off | quiet | rain | fire | scribe | custom) arrives as
 * data-sound on <html>, set by the pre-paint script and by the preferences panel. With anything but off, the
 * engine (src/islands/scenes/room-sound.ts) is fetched at idle time, and the sound starts at the reader's first
 * gesture on this page — a click, a tap, a key — never by itself. Two conditions, both required: a trusted
 * gesture seen here, and the browser's own leave to sound (HTML "user activation", which the autoplay policies
 * follow). The browser's alone is not enough: it may carry an activation over from the page the reader came from,
 * and the page would then start sounding as it loads, which the reader did not ask for here (WCAG 1.4.2).
 * Picking a sound in the panel is such a gesture, so it plays at once; no AudioContext exists before.
 *
 * It follows the reading with the room's own models (src/core/chrome/room.ts): the rain eases as the essay ends
 * (rainfall of the reading progress), the wind swells with the draught of a scrolled page (gust), and a page
 * turns when the reader enters a section (a heading of the article crossing the upper third of the viewport).
 * It fades out and suspends while the tab is hidden, and closes when the page is left.
 *
 * The reader's own mix (custom) is kept under MIX_STORAGE_KEY (src/islands/sound-store.ts), and held here too: the
 * mixer of the panel stores it and dispatches SOUND_MIX_EVENT (detail: the mix, encoded; empty once "reset" forgot
 * it), so the sound follows a fader as it moves, also where storage is blocked; another tab's change arrives
 * through the storage event. The element has no UI and stays hidden.
 */
import { PREFS_STORAGE_KEY } from '../../core/chrome/preferences.ts';
import { gust, rainfall } from '../../core/chrome/room.ts';
import { SOUND_MIX_EVENT, decodeMix, mixOf, soundChoiceOf, type Mix } from '../../core/chrome/sound.ts';
import { pinnedProgress } from '../../core/reading/scroll.ts';
import type { Reading, RoomSound, createRoomSound } from '../scenes/room-sound.ts';
import { readMix } from '../sound-store.ts';

const TAG = 'ft-room-sound';
/** Events that can carry the reader's activation (HTML: keydown, mousedown/pointerdown, pointerup, touchend). */
const GESTURES = ['pointerdown', 'pointerup', 'keydown', 'click', 'touchend'] as const;
/** The line a heading crosses to open its section: the upper third of the viewport. */
const SECTION_LINE = '0px 0px -66% 0px';

interface Engine {
  readonly createRoomSound: typeof createRoomSound;
}

/**
 * How long after a gesture the page may start sounding: the transient activation of HTML, which lasts 5 s in
 * Chromium (the reader clicks a preset; the change reaches this element a moment later).
 */
const ACTIVATION_MS = 5000;

/** JSON from storage, or null for nothing or for what does not parse. */
const parseJson = (raw: string | null): unknown => {
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
};

const idle = (run: () => void): void => {
  if ('requestIdleCallback' in window) window.requestIdleCallback(run, { timeout: 2000 });
  else setTimeout(run, 300);
};

class FtRoomSound extends HTMLElement {
  #article: HTMLElement | null = null;
  #abort: AbortController | null = null;
  #engine: Promise<Engine> | null = null;
  #context: AudioContext | null = null;
  #sound: RoomSound | null = null;
  /** What plays (null: silence), and the reader's own mix, which `custom` plays. */
  #mix: Mix | null = null;
  #own: Mix | null = null;
  #sections: IntersectionObserver | null = null;
  /** The article in document px, for the reading progress (measured on resize, not on every tick). */
  #top = 0;
  #height = 0;
  #gust = 0;
  #scrollY = 0;
  #readAt = 0;
  /** When the reader last clicked, tapped or typed (performance.now()). */
  #gestureAt = Number.NEGATIVE_INFINITY;

  connectedCallback(): void {
    this.#article = document.getElementById(this.getAttribute('article') ?? '');
    if (this.#article === null || typeof AudioContext !== 'function') return;
    this.hidden = true;
    this.#abort = new AbortController();
    const { signal } = this.#abort;
    const reread = (): void => {
      this.#own = readMix();
      this.#evaluate();
    };

    const attribute = new MutationObserver(() => this.#evaluate());
    attribute.observe(document.documentElement, { attributes: true, attributeFilter: ['data-sound'] });
    // The article moves when something above it appears (the reading memory's notice): the document resizes.
    const resize = new ResizeObserver(() => this.#measure());
    resize.observe(this.#article);
    resize.observe(document.documentElement);
    signal.addEventListener('abort', () => {
      attribute.disconnect();
      resize.disconnect();
    });

    for (const type of GESTURES)
      window.addEventListener(type, (event) => this.#gesture(event), { capture: true, signal });
    // The mixer of this page: the new mix travels with the event, so a fader moves the sound even without storage.
    document.addEventListener(
      SOUND_MIX_EVENT,
      (event) => {
        this.#own = event instanceof CustomEvent ? decodeMix(String(event.detail)) : readMix();
        this.#evaluate();
      },
      { signal },
    );
    // Another tab: its choice is copied onto <html> (the observer above then acts), its mix read from storage.
    window.addEventListener(
      'storage',
      (event) => {
        if (event.key === PREFS_STORAGE_KEY || event.key === null) this.#copyChoice(event.newValue);
        reread();
      },
      { signal },
    );
    document.addEventListener(
      'visibilitychange',
      () => {
        if (document.hidden) void this.#sound?.suspend();
        else void this.#sound?.resume();
      },
      { signal },
    );
    window.addEventListener('pagehide', () => this.#stop(false), { signal });
    // Back from the back-forward cache: the sound was closed on leaving; it waits for a gesture again.
    window.addEventListener(
      'pageshow',
      (event) => {
        if (event.persisted) reread();
      },
      { signal },
    );

    this.#measure();
    reread();
  }

  disconnectedCallback(): void {
    this.#abort?.abort();
    this.#abort = null;
    this.#stop(false);
  }

  /** What the reader asked for: silence, or a mix — which starts now, or at the next gesture. */
  #evaluate(): void {
    if (this.#abort === null) return;
    const mix = mixOf(document.documentElement.dataset['sound'], this.#own);
    this.#mix = mix;
    if (mix === null) {
      this.#stop(true);
      return;
    }
    if (this.#sound !== null) {
      this.#sound.setMix(mix);
      return;
    }
    // Fetch the engine while the reader reads, so the first gesture has nothing to wait for.
    if (this.#engine === null) {
      idle(() => {
        this.#load().catch(() => undefined);
      });
    }
    if (this.#activated()) this.#start();
  }

  /** True just after a gesture of the reader on this page, while the browser still lets the page sound. */
  #activated(): boolean {
    const api = (navigator as Navigator & { readonly userActivation?: { readonly isActive: boolean } }).userActivation;
    return performance.now() - this.#gestureAt < ACTIVATION_MS && (api?.isActive ?? true);
  }

  #load(): Promise<Engine> {
    this.#engine ??= import('../scenes/room-sound.ts').catch((error: unknown) => {
      this.#engine = null;
      throw error;
    });
    return this.#engine;
  }

  /**
   * A gesture: the first one starts the sound; a later one wakes a context the browser kept suspended. Only the
   * reader's own (trusted) events count, and not Escape, which grants no activation (HTML).
   */
  #gesture(event: Event): void {
    if (!event.isTrusted || (event instanceof KeyboardEvent && event.key === 'Escape')) return;
    this.#gestureAt = performance.now();
    if (this.#mix === null || !this.#activated()) return;
    if (this.#context === null) this.#start();
    else if (this.#context.state === 'suspended' && !document.hidden) {
      if (this.#sound === null) void this.#context.resume();
      else void this.#sound.resume();
    }
  }

  /** Creates the context inside the reader's activation (so it may run), then builds the room's sound in it. */
  #start(): void {
    if (this.#context !== null || this.#mix === null || document.hidden) return;
    let context: AudioContext;
    try {
      context = new AudioContext({ latencyHint: 'playback' });
    } catch {
      return; // no audio output: the page stays silent
    }
    this.#context = context;
    void context.resume().catch(() => undefined);
    this.#load().then(
      ({ createRoomSound }) => {
        const mix = this.#mix;
        if (this.#context !== context || mix === null) return;
        this.#readAt = performance.now();
        this.#scrollY = window.scrollY;
        this.#sound = createRoomSound(context, mix, Math.floor(Math.random() * 2 ** 32), () => this.#read());
        this.#watchSections();
      },
      (error: unknown) => {
        console.warn(`[${TAG}] sound unavailable`, error);
        this.#stop(false);
      },
    );
  }

  #stop(fade: boolean): void {
    this.#sections?.disconnect();
    this.#sections = null;
    const sound = this.#sound;
    const context = this.#context;
    this.#sound = null;
    this.#context = null;
    if (sound !== null) void sound.close(fade);
    else if (context !== null) void context.close().catch(() => undefined);
  }

  /** The reading now, for the engine's timer: progress through the article and the draught of the scroll. */
  #read(): Reading {
    const now = performance.now();
    const dt = (now - this.#readAt) / 1000;
    const y = window.scrollY;
    const velocity = dt > 0 ? (y - this.#scrollY) / dt : 0;
    this.#readAt = now;
    this.#scrollY = y;
    this.#gust = gust(this.#gust, velocity, dt, window.innerHeight);
    return {
      rainfall: rainfall(pinnedProgress(this.#top - y, this.#height, window.innerHeight)),
      gust: this.#gust,
    };
  }

  #measure(): void {
    const article = this.#article;
    if (article === null) return;
    const box = article.getBoundingClientRect();
    this.#top = box.top + window.scrollY;
    this.#height = box.height;
  }

  /** A page turns when a section heading crosses into the upper third, going down or coming back up. */
  #watchSections(): void {
    const headings = this.#article?.querySelectorAll('h2') ?? [];
    if (headings.length === 0) return;
    let primed = false;
    this.#sections = new IntersectionObserver(
      (entries) => {
        // The first call reports where the headings already are: no page turns for that.
        if (!primed) {
          primed = true;
          return;
        }
        if (entries.some((entry) => entry.isIntersecting)) this.#sound?.turnPage();
      },
      { rootMargin: SECTION_LINE },
    );
    for (const heading of headings) this.#sections.observe(heading);
  }

  /** Copies the `sound` of another tab's stored preferences onto <html>, as the pre-paint script would. */
  #copyChoice(raw: string | null): void {
    const stored = parseJson(raw);
    const choice = soundChoiceOf(typeof stored === 'object' && stored !== null ? Reflect.get(stored, 'sound') : null);
    const root = document.documentElement;
    if (choice === 'off') delete root.dataset['sound'];
    else root.dataset['sound'] = choice;
  }
}

if (!customElements.get(TAG)) customElements.define(TAG, FtRoomSound);
