/**
 * <ft-reading-room sheet=".essay"> — the room around the article (docs/adr/0014-sala-de-leitura.md).
 *
 * The rule: the room makes the atmosphere, the reading keeps the priority. So this element never touches
 * the article. It is a fixed layer behind the page (z-index −1) holding a canvas, where the three.js scene
 * of src/islands/scenes/reading-room.ts is drawn. The sheet of paper is the page's own (the ::before of the
 * element named by `sheet`, src/styles/components/room.css), in flow and opaque: every line of the article
 * sits on the same paper as without the room, and the scene shows where the paper is not — the band above
 * the sheet (its headroom, on every screen) and, on wide screens, the gutters beside it. The page has the
 * same layout with and without the scene, so lighting the room shifts nothing.
 *
 * Decorative: aria-hidden, no pointer events, nothing in it is needed to read the page. Without
 * JavaScript or without WebGL 2 the layer stays hidden and the page keeps its desk drawn in CSS.
 *
 * Economy: only the parts of the viewport the page leaves uncovered are drawn (roomRegions, a scissor per
 * part), and when none is on screen — on a phone, once the band has scrolled away — no frame is drawn
 * until the reader scrolls back.
 *
 * Restraint (the decisions are pure, in src/core/chrome/room.ts):
 *   - whether the room exists is decided before anything is downloaded: three.js is imported only when the
 *     mode is not "off", and then at idle time, after the page has painted;
 *   - reduced motion gives one still frame; so does a device with two cores or 2 GiB;
 *   - Save-Data, increased contrast, forced colours, focus mode and a software renderer give no room;
 *   - the frame rate is capped at 30 per second and the pixel ratio at 1.5; a governor steps both down
 *     when frames arrive late and stops the animation if that is not enough;
 *   - the loop stops while the tab is hidden; the room quietens as the reader scrolls into the text.
 *
 * The room follows the reading: the candle burns down with the progress through the article (a reading
 * clock), the rain eases towards the end, and the flame leans in the draught of a scrolled page. With
 * reduced motion these are states, not animations: the still frame is redrawn when scrolling stops.
 * The attributes `shelf` (the corpus, encodeShelf) and `stratum` say what the room holds.
 *
 * The reader's preference `room` (auto | on | off; auto by default) arrives as data-room on <html> and is
 * changed in the preferences panel. The state of the layer is published as data-scene="live" | "still" on
 * <html>, where src/styles/components/room.css reads it, and where the furniture is (roomStage) as
 * data-stage="gutters" | "band" on this element.
 */
import {
  EYE_TAU,
  approach,
  breath,
  burn,
  calm,
  candleStrength,
  decodeShelf,
  decodeShelfLabels,
  eyeFor,
  flicker,
  govern,
  governorAt,
  gust,
  gutters,
  KINDLE_SECONDS,
  kindle,
  pace,
  paceInterval,
  pixelRatioOf,
  rainfall,
  roomMode,
  roomRegions,
  roomStage,
  scrollDrift,
  simplexOf,
  startTier,
  type Governor,
  type Pace,
  type PageFrame,
  type Rect,
  type RoomMode,
  type RoomStage,
  type ShelfLabel,
} from '../../core/chrome/room.ts';
import { DAYPARTS, type Daypart } from '../../core/chrome/daypart.ts';
import { STRATA, isStratum } from '../../core/domain/strata.ts';
import { MEMORY_STORAGE_KEY, decodeMemory } from '../../core/reading/memory.ts';
import { pinnedProgress } from '../../core/reading/scroll.ts';
import type { ReadingRoom, Rgb, RoomColors } from '../scenes/reading-room.ts';

const TAG = 'ft-reading-room';
/** Seconds for a book to come off the shelf (or go back) to 63 %. */
const PULL_TAU = 0.12;
/** A pointer that has not moved for this long (ms) is still: its draught is over. */
const STILL_POINTER_MS = 80;
/** Time shown by the single frame of the still mode: the rain a little way down the glass. */
const STILL_TIME = 2;
/**
 * CSS px by which the drawn regions overreach the opaque parts of the page (the paper, the header, the
 * footer cover the excess): the page scrolls on the compositor before the next frame is drawn, and a fast
 * flick must not uncover bare canvas at the edge of the band.
 */
const SCROLL_SLACK = 48;
const WATCHED = ['data-theme', 'data-contrast', 'data-motion', 'data-daypart', 'data-focus', 'data-room', 'data-cvd'];
const MEDIA = [
  '(prefers-reduced-motion: reduce)',
  '(prefers-color-scheme: dark)',
  '(prefers-contrast: more)',
  '(forced-colors: active)',
  '(prefers-reduced-data: reduce)',
];

interface Probe {
  readonly webgl: boolean;
  readonly software: boolean;
}

/** One throwaway context: is WebGL 2 there, and is it the CPU drawing it? The context is released at once. */
const probeWebgl = (): Probe => {
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (gl === null) return { webgl: false, software: false };
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    const name: unknown = gl.getParameter(info === null ? gl.RENDERER : info.UNMASKED_RENDERER_WEBGL);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return { webgl: true, software: /swiftshader|llvmpipe|softpipe|software|basic render/i.test(String(name)) };
  } catch {
    return { webgl: false, software: false };
  }
};

/** Any CSS colour as sRGB components in [0, 1], read by painting one pixel (the tokens are oklch()). */
const srgbOf = (ctx: CanvasRenderingContext2D, color: string): Rgb => {
  ctx.clearRect(0, 0, 1, 1);
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, 1, 1);
  const [r = 0, g = 0, b = 0] = ctx.getImageData(0, 0, 1, 1).data;
  return [r / 255, g / 255, b / 255];
};

const mix = (a: Rgb, b: Rgb, t: number): Rgb => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

const idle = (run: () => void): void => {
  if ('requestIdleCallback' in window) window.requestIdleCallback(run, { timeout: 1500 });
  else setTimeout(run, 200);
};

class FtReadingRoom extends HTMLElement {
  #canvas: HTMLCanvasElement | null = null;
  #target: Element | null = null;
  #abort: AbortController | null = null;
  #room: ReadingRoom | null = null;
  #probe: Probe | null = null;
  #mode: RoomMode = 'off';
  #loading = false;
  /** The context was lost or the governor ran out of rungs: no animation for the rest of this page. */
  #lost = false;
  #exhausted = false;
  #governor: Governor = governorAt(0);
  #frame = 0;
  #lastFrame = 0;
  #lastRender = 0;
  #time = 0;
  #rain = 0;
  #calm = 1;
  /** The sheet with its rim: edges in viewport px, top and bottom in document px. */
  #left = 0;
  #right = 0;
  #paperTop = 0;
  #paperBottom = 0;
  /** The opaque bands of the page around the sheet, in document px: the header's bottom, the footer's top. */
  #headerBottom = 0;
  #footerTop = Number.POSITIVE_INFINITY;
  #stage: RoomStage = 'gutters';
  /** The article's box in document coordinates, for the reading progress. */
  #top = 0;
  #height = 0;
  #progress = 0;
  /** How far the reader got on earlier visits (ft-reading-memory): the candle does not grow back. */
  #remembered = 0;
  #gust = 0;
  #scrollY = 0;
  /** Seconds since the flame was lit (the room's first live frame). */
  #lit = 0;
  #settle = 0;
  /** What the scene was last sized for, and whether something (colours, mode) asks for a new frame. */
  #sized = '';
  #stale = true;
  /** When the reader last scrolled, pointed or typed (performance.now()), and the pace that follows. */
  #input = 0;
  #pace: Pace = 'full';
  /**
   * The pointer when it is over the room (CSS px), its horizontal speed (px/s) and when it last moved; `hovers`
   * is false for a finger, which only touches: the eye does not follow a tap, or the shelf would slide under
   * the finger between the tap that names a book and the tap that opens it.
   */
  #pointer: { readonly x: number; readonly y: number; readonly hovers: boolean } | null = null;
  #pointerVx = 0;
  #pointerAt = 0;
  /** The eye's offset (motion parallax), smoothed towards eyeFor(pointer). */
  #eye: readonly [number, number] = [0, 0];
  /**
   * A touch has no hover: the book it names is the one named before this touch began (null for a mouse). A
   * click opens a work only if that book was already named, so the first tap names it and the second opens it.
   */
  #tap: number | null = null;
  /** The book under the pointer, the one drawn off the shelf, and how far out it is. */
  #hover = -1;
  #pulled = -1;
  #pull = 0;
  /** Titles and links of the books (/<lang>/shelf.json), fetched once the room is lit. */
  #labels: readonly (ShelfLabel | null)[] = [];
  #label: HTMLElement | null = null;

  connectedCallback(): void {
    this.#target = document.querySelector(this.getAttribute('sheet') ?? '');
    if (this.#target === null) return;
    this.setAttribute('aria-hidden', 'true');
    const canvas = document.createElement('canvas');
    canvas.className = 'room__canvas';
    const label = document.createElement('p');
    label.className = 'room__label';
    label.hidden = true;
    this.append(canvas, label);
    this.#label = label;
    this.#canvas = canvas;
    this.#governor = governorAt(startTier(navigator.hardwareConcurrency || 0));
    try {
      this.#remembered = decodeMemory(localStorage.getItem(MEMORY_STORAGE_KEY))[location.pathname]?.furthest ?? 0;
    } catch {
      this.#remembered = 0;
    }
    this.#calm = calm(window.scrollY, window.innerHeight);

    this.#abort = new AbortController();
    const { signal } = this.#abort;
    const evaluate = (): void => this.#evaluate();
    const resize = new ResizeObserver(evaluate);
    resize.observe(document.documentElement);
    resize.observe(this.#target);
    const attributes = new MutationObserver(() => {
      this.#recolor();
      this.#evaluate();
    });
    attributes.observe(document.documentElement, { attributes: true, attributeFilter: WATCHED });
    signal.addEventListener('abort', () => {
      resize.disconnect();
      attributes.disconnect();
    });
    for (const query of MEDIA) {
      matchMedia(query).addEventListener(
        'change',
        () => {
          this.#recolor();
          this.#evaluate();
        },
        { signal },
      );
    }
    document.addEventListener('visibilitychange', () => this.#schedule(), { signal });
    // The reader moving wakes a resting room (pace); the listeners are passive and do nothing else.
    this.#input = performance.now();
    this.dataset['pace'] = this.#pace;
    for (const type of ['pointermove', 'pointerdown', 'wheel', 'keydown'] as const) {
      window.addEventListener(type, () => this.#wake(), { passive: true, signal });
    }
    // The hand over the room: where the eye goes, which book comes off the shelf, where the glass clears.
    document.addEventListener('pointermove', (event) => this.#point(event), { passive: true, signal });
    document.addEventListener('pointerdown', (event) => this.#point(event), { passive: true, signal });
    document.addEventListener(
      'pointerout',
      (event) => {
        // A finger leaves the screen after every tap: the book it named stays named until the next touch.
        if (event.relatedTarget === null && event.pointerType !== 'touch') this.#leave();
      },
      { passive: true, signal },
    );
    document.addEventListener('click', (event) => this.#open(event), { signal });
    window.addEventListener(
      'scroll',
      () => {
        this.#wake();
        this.#follow();
        if (this.#mode !== 'still') return;
        // Reduced motion: the candle is a state, not an animation — one new frame once scrolling stops.
        clearTimeout(this.#settle);
        this.#settle = window.setTimeout(() => this.#draw(STILL_TIME, STILL_TIME, 1, true), 250);
      },
      { passive: true, signal },
    );
    this.#evaluate();
  }

  disconnectedCallback(): void {
    this.#abort?.abort();
    this.#abort = null;
    clearTimeout(this.#settle);
    this.#stop();
    this.#canvas?.remove();
    this.#label?.remove();
    this.#canvas = null;
    this.#label = null;
  }

  /** Where the sheet and the opaque bands of the page are in the viewport now (they scroll with the page). */
  #frameNow(): PageFrame {
    const y = window.scrollY;
    return {
      width: window.innerWidth,
      height: window.innerHeight,
      paperLeft: this.#left,
      paperRight: this.#right,
      paperTop: this.#paperTop - y,
      paperBottom: this.#paperBottom - y,
      headerBottom: this.#headerBottom - y,
      footerTop: this.#footerTop - y,
    };
  }

  /**
   * What a frame draws. Live, the uncovered parts of the viewport, overreaching the opaque parts of the page by
   * SCROLL_SLACK; still, the whole viewport, since that one frame has to hold whatever a scroll uncovers.
   */
  #regionsNow(still: boolean): readonly Rect[] {
    const f = this.#frameNow();
    if (still) return [{ x: 0, y: 0, width: f.width, height: f.height }];
    return roomRegions({
      ...f,
      headerBottom: f.headerBottom - SCROLL_SLACK,
      paperTop: f.paperTop + SCROLL_SLACK,
      paperBottom: f.paperBottom - SCROLL_SLACK,
      footerTop: f.footerTop + SCROLL_SLACK,
    });
  }

  /** The part of the room under the viewport point (x, y), or null when the page covers it. */
  #regionAt(x: number, y: number): Rect | null {
    return (
      roomRegions(this.#frameNow()).find((r) => x >= r.x && x < r.x + r.width && y >= r.y && y < r.y + r.height) ?? null
    );
  }

  /** Is the event over the room, on the bare page (not on the paper, the header, a dialog or any content)? */
  #inRoom(event: MouseEvent): boolean {
    if (this.#room === null || this.#mode === 'off') return false;
    const t = event.target;
    const bare =
      t === document.documentElement ||
      t === document.body ||
      t === this.#target ||
      (t instanceof Element && t.localName === 'main');
    return bare && this.#regionAt(event.clientX, event.clientY) !== null;
  }

  #point(event: PointerEvent): void {
    if (event.type === 'pointerdown') this.#tap = event.pointerType === 'touch' ? this.#hover : null;
    const room = this.#room;
    if (room === null || !this.#inRoom(event)) {
      this.#leave();
      return;
    }
    const now = performance.now();
    const before = this.#pointer;
    this.#pointerVx =
      before !== null && now > this.#pointerAt ? ((event.clientX - before.x) / (now - this.#pointerAt)) * 1000 : 0;
    this.#pointer = { x: event.clientX, y: event.clientY, hovers: event.pointerType !== 'touch' };
    this.#pointerAt = now;
    const book = room.pointAt(event.clientX, event.clientY, this.#mode === 'live');
    this.#hoverTo(this.#labels[book] ? book : -1);
    this.#placeLabel();
  }

  #leave(): void {
    this.#pointer = null;
    this.#pointerVx = 0;
    this.#hoverTo(-1);
  }

  /** The book under the pointer changed: name it (a label that is not read aloud: it repeats a link). */
  #hoverTo(book: number): void {
    if (book === this.#hover) return;
    this.#hover = book;
    const label = this.#labels[book] ?? null;
    const root = document.documentElement;
    if (label === null) delete root.dataset['roomPoint'];
    else root.dataset['roomPoint'] = '';
    if (this.#label !== null) {
      this.#label.textContent = label?.title ?? '';
      this.#label.hidden = label === null;
    }
    if (this.#mode === 'still') {
      // Reduced motion: the book is simply out, in one new frame.
      this.#pulled = book;
      this.#pull = book >= 0 ? 1 : 0;
      this.#draw(STILL_TIME, STILL_TIME, 1, true);
    }
  }

  /** The label beside the pointer, inside the part of the room it is in (never over the sheet). */
  #placeLabel(): void {
    const label = this.#label;
    const p = this.#pointer;
    if (label === null || p === null || label.hidden) return;
    const r = this.#regionAt(p.x, p.y);
    if (r === null) return;
    const min = r.x + 8;
    const max = r.x + r.width - 8;
    label.style.maxInlineSize = `${String(Math.max(80, max - min))}px`;
    const x = Math.max(min, Math.min(max - label.offsetWidth, p.x + 14));
    const below = p.y + 18;
    const y = Math.max(
      r.y + 4,
      below + label.offsetHeight <= r.y + r.height - 4 ? below : p.y - label.offsetHeight - 10,
    );
    label.style.transform = `translate(${String(x)}px, ${String(y)}px)`;
  }

  /** A click on a book opens the work (with a modifier key, in a new tab). */
  #open(event: MouseEvent): void {
    const room = this.#room;
    if (room === null || event.button !== 0 || event.defaultPrevented || !this.#inRoom(event)) return;
    const book = room.pointAt(event.clientX, event.clientY, false);
    const label = this.#labels[book] ?? null;
    if (label === null || (this.#tap !== null && this.#tap !== book)) return;
    if (event.metaKey || event.ctrlKey || event.shiftKey) window.open(label.href, '_blank', 'noopener');
    else window.location.assign(label.href);
  }

  async #fetchLabels(): Promise<void> {
    const url = this.getAttribute('labels');
    if (url === null || url === '' || this.#labels.length > 0) return;
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${String(response.status)}`);
      this.#labels = decodeShelfLabels(await response.json());
    } catch (error: unknown) {
      // Decorative: without the labels the books are only books.
      console.warn(`[${TAG}] shelf labels unavailable (${url})`, error);
    }
  }

  /**
   * Where the sheet is: the target's ::before (the paper of room.css, centred in the target and inset from its
   * top by the headroom), with the rim of its stand; and where the header ends and the footer begins.
   */
  #measure(): void {
    const target = this.#target;
    if (target === null) return;
    const y = window.scrollY;
    const box = target.getBoundingClientRect();
    this.#top = box.top + y;
    this.#height = box.height;
    this.#follow();
    const rim = this.#rim();
    const paper = getComputedStyle(target, '::before');
    const width = Number.parseFloat(paper.width);
    const inset = Number.parseFloat(paper.top);
    const end = Number.parseFloat(paper.bottom);
    const drawn = paper.content !== 'none' && Number.isFinite(width) && Number.isFinite(inset) && Number.isFinite(end);
    const centre = box.left + box.width / 2;
    this.#left = drawn ? Math.max(0, centre - width / 2 - rim) : 0;
    this.#right = drawn ? Math.min(window.innerWidth, centre + width / 2 + rim) : window.innerWidth;
    this.#paperTop = box.top + y + (drawn ? inset - rim : 0);
    this.#paperBottom = box.bottom + y - (drawn ? end - rim : 0);
    this.#headerBottom = (document.querySelector('.site-header')?.getBoundingClientRect().bottom ?? 0) + y;
    const footer = document.querySelector('.site-footer');
    this.#footerTop = footer === null ? Number.POSITIVE_INFINITY : footer.getBoundingClientRect().top + y;
  }

  /** Where the reader is: how calm the room should be and how far through the article they are. */
  #follow(): void {
    this.#calm = calm(window.scrollY, window.innerHeight);
    this.#progress = pinnedProgress(this.#top - window.scrollY, this.#height, window.innerHeight);
  }

  /** The rim of the stand around the sheet (a token, read from this element's block padding). */
  #rim(): number {
    return Number.parseFloat(getComputedStyle(this).paddingBlockStart) || 0;
  }

  /** The mode: what the reader asked for, what the screen leaves room for, and what the device can do. */
  #decide(): RoomMode {
    const root = document.documentElement;
    const preference = root.dataset['room'];
    const g = gutters(window.innerWidth, this.#left, this.#right);
    this.#stage = roomStage(Math.min(g.left, g.right));
    const base = {
      // The default (no attribute) is auto: the room shows wherever the device allows it.
      preference: preference === 'on' || preference === 'off' ? preference : 'auto',
      focus: root.dataset['focus'] === 'on',
      gutterPx: Math.min(g.left, g.right),
      headroomPx: this.#paperTop - this.#headerBottom,
      forcedColors: matchMedia('(forced-colors: active)').matches,
      reducedMotion: getComputedStyle(this).getPropertyValue('--motion').trim() === '0',
      reducedData:
        matchMedia('(prefers-reduced-data: reduce)').matches ||
        (navigator as Navigator & { readonly connection?: { readonly saveData?: boolean } }).connection?.saveData ===
          true,
      moreContrast:
        root.dataset['contrast'] === 'more' ||
        (root.dataset['contrast'] !== 'normal' && matchMedia('(prefers-contrast: more)').matches),
      cores: navigator.hardwareConcurrency || 0,
      memoryGiB: (navigator as Navigator & { readonly deviceMemory?: number }).deviceMemory ?? null,
    } as const;
    // Ask for a context only when everything else already allows the room.
    if (roomMode({ ...base, webgl: true, software: false }) === 'off') return 'off';
    this.#probe ??= probeWebgl();
    const mode = roomMode({ ...base, ...this.#probe });
    return mode === 'live' && this.#exhausted ? 'still' : mode;
  }

  #evaluate(): void {
    if (this.#canvas === null || this.#lost) return;
    this.#measure();
    const mode = this.#decide();
    this.dataset['stage'] = this.#stage;
    this.#mode = mode;
    if (mode === 'off') {
      this.#stop();
      return;
    }
    if (this.#room === null) {
      this.#load();
      return;
    }
    // Resizing clears the drawing buffer, so a frame is drawn at once, and only then is the layer shown.
    // The document resizes whenever its content does; the scene only when the viewport or the sheet did.
    const root = document.documentElement;
    if (this.#resize() || this.#stale || root.dataset['scene'] !== mode) {
      this.#stale = false;
      if (mode === 'still') this.#draw(STILL_TIME, STILL_TIME, 1, true);
      else this.#draw(this.#time, this.#rain, this.#calm, false);
    }
    root.dataset['scene'] = mode;
    this.#schedule();
  }

  #load(): void {
    if (this.#loading) return;
    this.#loading = true;
    idle(() => {
      import('../scenes/reading-room.ts').then(
        ({ createReadingRoom }) => {
          this.#loading = false;
          const canvas = this.#canvas;
          if (canvas === null || this.#mode === 'off' || this.#room !== null) return;
          this.#room = createReadingRoom(canvas, () => {
            this.#lost = true;
            this.#stop();
            this.#evaluate();
          });
          if (this.#room === null) {
            this.#lost = true;
            this.#evaluate();
            return;
          }
          const stratum = this.getAttribute('stratum');
          this.#room.furnish({
            books: decodeShelf(this.getAttribute('shelf')),
            simplex: simplexOf(isStratum(stratum) ? stratum : 'philosophy'),
          });
          void this.#fetchLabels();
          this.#recolor();
          this.#evaluate();
        },
        (error: unknown) => {
          // Decorative: the page stays as it is without the room.
          this.#loading = false;
          this.#lost = true;
          this.#evaluate();
          console.warn(`[${TAG}] scene unavailable`, error);
        },
      );
    });
  }

  /** Tears the scene down and hides the layer (the page is then exactly what it is without the room). */
  #stop(): void {
    cancelAnimationFrame(this.#frame);
    this.#frame = 0;
    this.#room?.dispose();
    this.#room = null;
    this.#sized = '';
    this.#leave();
    this.#pulled = -1;
    this.#pull = 0;
    this.#eye = [0, 0];
    delete document.documentElement.dataset['scene'];
  }

  /** Sizes the scene for the viewport, the sheet, the stage and the current rung; false when nothing changed. */
  #resize(): boolean {
    const layout = {
      width: window.innerWidth,
      height: window.innerHeight,
      pixelRatio: pixelRatioOf(this.#governor.tier, window.devicePixelRatio || 1),
      sheetLeft: this.#left,
      sheetRight: this.#right,
      stage: this.#stage,
      // The band as it is with the page at its top: the furniture is placed once, and the scroll moves the eye.
      bandTop: this.#headerBottom,
      bandBottom: this.#paperTop,
    };
    const key = Object.values(layout).join(' ');
    if (this.#room === null || key === this.#sized) return false;
    this.#sized = key;
    this.#room.resize(layout);
    return true;
  }

  /** Reads the room's colours from the design tokens (they change with the theme) and hands them over. */
  #recolor(): void {
    const room = this.#room;
    const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
    if (room === null || ctx === null) return;
    const root = document.documentElement;
    const style = getComputedStyle(root);
    const token = (name: string): Rgb => srgbOf(ctx, style.getPropertyValue(name).trim());
    const wood = token('--room-wood');
    const colors: RoomColors = {
      wall: token('--room-wall'),
      wood,
      glass: token('--room-glass'),
      flame: token('--room-flame'),
      wax: token('--room-wax'),
      // Cloth covers: the hue of each stratum, worn halfway towards the wood.
      covers: STRATA.map((s) => mix(token(`--stratum-${s}`), wood, 0.5)),
    };
    const theme = root.dataset['theme'];
    const night = theme === 'dark' || (theme !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches);
    const stored = root.dataset['daypart'];
    const daypart: Daypart = DAYPARTS.find((d) => d === stored) ?? 'day';
    room.recolor(colors, { candle: candleStrength(night ? 'dark' : 'light', daypart), night });
    this.#stale = true;
  }

  /** The reader moved: the room returns to its full pace, and the loop restarts if it was resting. */
  #wake(): void {
    this.#input = performance.now();
    if (this.#pace === 'rest') this.#setPace('full');
    this.#schedule();
  }

  #setPace(next: Pace): void {
    if (next === this.#pace) return;
    this.#pace = next;
    this.dataset['pace'] = next;
  }

  /** Starts or stops the loop: it runs only for the live mode, in a visible tab, while the room is not at rest. */
  #schedule(): void {
    const run = this.#room !== null && this.#mode === 'live' && !document.hidden && this.#pace !== 'rest';
    if (run && this.#frame === 0) {
      this.#lastFrame = 0;
      this.#scrollY = window.scrollY;
      this.#frame = requestAnimationFrame(this.#tick);
    }
    if (!run && this.#frame !== 0) {
      cancelAnimationFrame(this.#frame);
      this.#frame = 0;
    }
  }

  readonly #tick = (now: number): void => {
    this.#frame = 0;
    if (this.#lastFrame !== 0) {
      const before = this.#governor;
      this.#governor = govern(before, now - this.#lastFrame);
      if (this.#governor.exhausted) {
        this.#exhausted = true;
        this.#evaluate();
        return;
      }
      if (this.#governor.tier !== before.tier) this.#resize();
    }
    this.#lastFrame = now;
    // The flame catching counts as movement: the room is not left half lit.
    const still = this.#lit < KINDLE_SECONDS ? 0 : (now - this.#input) / 1000;
    const current = pace(still);
    if (current === 'rest') {
      // The last frame stays on screen; the next input restarts the loop (#wake).
      this.#setPace('rest');
      return;
    }
    this.#setPace(current);
    // Nothing of the room on screen: no frame, and no loop until a scroll brings a part of it back (#wake).
    if (this.#regionsNow(false).length === 0) return;
    if (now - this.#lastRender >= paceInterval(current, this.#governor.tier) - 1) {
      const dt = this.#lastRender === 0 ? 0 : Math.min(0.1, (now - this.#lastRender) / 1000);
      this.#lastRender = now;
      this.#time += dt;
      this.#lit += dt;
      this.#rain += dt * (0.4 + 0.6 * this.#calm);
      const velocity = dt > 0 ? (window.scrollY - this.#scrollY) / dt : 0;
      this.#scrollY = window.scrollY;
      this.#gust = gust(this.#gust, this.#air(velocity, now), dt, window.innerHeight);
      this.#ease(dt);
      this.#draw(this.#time, this.#rain, this.#calm, false);
    }
    this.#schedule();
  };

  /** The stronger of the two draughts: the scrolled page, or the hand moving near the flame. */
  #air(scrollVelocity: number, now: number): number {
    const p = this.#pointer;
    if (p === null || this.#room === null || now - this.#pointerAt > STILL_POINTER_MS) return scrollVelocity;
    const [fx, fy] = this.#room.flameAt();
    const hand = breath(p.x - fx, p.y - fy, this.#pointerVx);
    return Math.abs(hand) > Math.abs(scrollVelocity) ? hand : scrollVelocity;
  }

  /**
   * The eye follows a hovering pointer over the room and comes back to its place without it; a pointed book
   * comes out.
   */
  #ease(dt: number): void {
    const p = this.#pointer;
    const [tx, ty] =
      p === null || !p.hovers ? [0, 0] : eyeFor((p.x / window.innerWidth) * 2 - 1, 1 - (p.y / window.innerHeight) * 2);
    this.#eye = [approach(this.#eye[0], tx, dt, EYE_TAU), approach(this.#eye[1], ty, dt, EYE_TAU)];
    // One book out at a time: the last one goes back before the next comes out.
    if (this.#hover !== this.#pulled && this.#pull < 0.02) this.#pulled = this.#hover;
    const out = this.#pulled >= 0 && this.#pulled === this.#hover ? 1 : 0;
    this.#pull = approach(this.#pull, out, dt, PULL_TAU);
  }

  /**
   * One frame (#regionsNow says where). Live, the room drifts behind the page as the headroom scrolls away
   * (scrollDrift); still (reduced motion) nothing drifts.
   */
  #draw(time: number, rainTime: number, liveliness: number, still: boolean): void {
    this.#room?.render({
      regions: this.#regionsNow(still),
      paperTop: this.#paperTop - window.scrollY,
      drift: still ? 0 : scrollDrift(window.scrollY, this.#paperTop),
      time,
      rainTime,
      flicker: flicker(time, liveliness) * (still ? 1 : kindle(this.#lit)),
      liveliness,
      burn: burn(Math.max(this.#progress, this.#remembered)),
      rainfall: rainfall(this.#progress),
      gust: still ? 0 : this.#gust,
      eye: still ? [0, 0] : this.#eye,
      pulled: this.#pulled,
      pull: this.#pull,
    });
  }
}

if (!customElements.get(TAG)) customElements.define(TAG, FtReadingRoom);
