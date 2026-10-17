/**
 * <ft-command-palette> — quick navigation + full-text search inside the palette
 * <dialog> (WAI-ARIA APG: editable combobox with list autocomplete, listbox
 * popup always displayed; focus stays in the input, the active option is
 * conveyed with aria-activedescendant).
 *
 * Loading: this element lives inside the closed dialog, so the islands
 * registry imports this module only when the dialog opens; Pagefind
 * (`${BASE_URL}pagefind/pagefind.js`, built by `pagefind --site dist`) is
 * imported at the same moment, never on page load.
 *
 * No-JS / not-yet-upgraded fallback: the server renders the quick-navigation
 * entries as an ordinary list of links (role="list"); upgrading turns it into
 * a listbox. When the index is missing (dev server), quick navigation still
 * works and a polite status explains why there are no text results.
 *
 * Pure logic lives in the core: keyboard state machine and ranking
 * (src/core/chrome/palette.ts) and excerpt sanitising (excerpt.ts — only <mark>
 * survives, rendered with DOM APIs, never innerHTML).
 *
 * Messages arrive from the server catalog as JSON in data-messages
 * ({ zero, one, other, indexMissing, text }), so no UI text is hard-coded here.
 */
import {
  INITIAL_PALETTE,
  inLocale,
  rankQuickNav,
  stepPalette,
  toPaletteKey,
  type PaletteState,
} from '../../core/chrome/palette.ts';
import { sanitiseExcerpt, type ExcerptSegment } from '../../core/chrome/excerpt.ts';
import { format } from '../../core/i18n/messages.ts';

const TAG = 'ft-command-palette';
const SVG_NS = 'http://www.w3.org/2000/svg';
const BASE = import.meta.env.BASE_URL.endsWith('/') ? import.meta.env.BASE_URL : `${import.meta.env.BASE_URL}/`;
/** Debounce of the full-text query: 144 ms, the --duration-2 Fibonacci step of the design tokens. */
const DEBOUNCE_MS = 144;
const MIN_QUERY_LENGTH = 2;
const MAX_TEXT_RESULTS = 8;

interface Item {
  readonly label: string;
  readonly href: string;
  readonly kind: string;
  readonly keywords: string;
  readonly lang: string | null;
  readonly glyph: string | null;
  readonly stratum: string | null;
  readonly excerpt: readonly ExcerptSegment[] | null;
}

type MessageKey = 'zero' | 'one' | 'other' | 'indexMissing' | 'text';
type Messages = Readonly<Record<MessageKey, string>>;

const MESSAGE_KEYS: readonly MessageKey[] = ['zero', 'one', 'other', 'indexMissing', 'text'];

const parseJson = (raw: string | undefined): unknown => {
  try {
    return JSON.parse(raw ?? 'null') as unknown;
  } catch {
    return null;
  }
};

/** Total: missing or malformed entries fall back to the key itself (visible, never silent). */
const parseMessages = (raw: string | undefined): Messages => {
  const source = parseJson(raw);
  const record = typeof source === 'object' && source !== null ? (source as Record<string, unknown>) : {};
  return Object.fromEntries(
    MESSAGE_KEYS.map((k) => [k, typeof record[k] === 'string' ? record[k] : k]),
  ) as unknown as Messages;
};

/** Minimal structural type of the Pagefind 1.x client API that we use. */
interface PagefindData {
  readonly url: string;
  readonly excerpt: string;
  readonly meta?: { readonly title?: string };
}
interface Pagefind {
  options(options: Readonly<Record<string, unknown>>): Promise<void>;
  debouncedSearch(
    term: string,
    options?: Readonly<Record<string, unknown>>,
    debounceMs?: number,
  ): Promise<{ readonly results: readonly { data(): Promise<PagefindData> }[] } | null>;
}

let pagefind: Promise<Pagefind | null> | null = null;

/** Imports Pagefind once per page; null when the index is absent (dev mode) or fails to load. */
const loadPagefind = (): Promise<Pagefind | null> => {
  pagefind ??= (async () => {
    try {
      const mod = (await import(/* @vite-ignore */ `${BASE}pagefind/pagefind.js`)) as Pagefind;
      // Result URLs must carry the site's base path (project site on GitHub Pages).
      await mod.options({ baseUrl: BASE });
      return mod;
    } catch {
      return null;
    }
  })();
  return pagefind;
};

const pathOf = (href: string): string => new URL(href, document.baseURI).pathname;

const readItem = (a: HTMLAnchorElement): Item => ({
  label: a.dataset['label'] ?? a.textContent.trim(),
  href: a.href,
  kind: a.dataset['kind'] ?? '',
  keywords: a.dataset['keywords'] ?? '',
  lang: a.getAttribute('hreflang'),
  glyph: a.dataset['glyph'] ?? null,
  stratum: a.dataset['stratum'] ?? null,
  excerpt: null,
});

const glyph = (id: string): SVGSVGElement => {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'palette__glyph');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('viewBox', '0 0 24 24');
  const use = document.createElementNS(SVG_NS, 'use');
  use.setAttribute('href', `#${id}`);
  svg.append(use);
  return svg;
};

const excerptNode = (segments: readonly ExcerptSegment[]): HTMLElement => {
  const p = document.createElement('span');
  p.className = 'palette__excerpt';
  for (const s of segments) {
    if (s.marked) {
      const mark = document.createElement('mark');
      mark.textContent = s.text;
      p.append(mark);
    } else p.append(document.createTextNode(s.text));
  }
  return p;
};

class FtCommandPalette extends HTMLElement {
  #state: PaletteState = INITIAL_PALETTE;
  #quick: readonly Item[] = [];
  #items: readonly Item[] = [];
  #input: HTMLInputElement | null = null;
  #list: HTMLUListElement | null = null;
  #status: HTMLElement | null = null;
  #messages: Messages = parseMessages(undefined);
  #abort: AbortController | null = null;
  #searchId = 0;

  connectedCallback(): void {
    const input = this.querySelector<HTMLInputElement>('input[type="search"]');
    const list = this.querySelector<HTMLUListElement>('ul');
    if (input === null || list === null) return;
    this.#input = input;
    this.#list = list;
    this.#status = this.querySelector<HTMLElement>('[role="status"]');
    this.#messages = parseMessages(this.dataset['messages']);
    this.#quick = Array.from(list.querySelectorAll<HTMLAnchorElement>('a[href]'), readItem);

    list.id ||= `${TAG}-list`;
    list.setAttribute('role', 'listbox');
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-expanded', 'true');
    input.setAttribute('aria-controls', list.id);

    this.#abort = new AbortController();
    const { signal } = this.#abort;
    input.addEventListener('input', () => this.#query(), { signal });
    input.addEventListener('keydown', (e) => this.#key(e), { signal });
    list.addEventListener(
      'pointermove',
      (e) => {
        const option = e.target instanceof Element ? e.target.closest<HTMLElement>('[data-index]') : null;
        if (option === null) return;
        this.#step({ type: 'point', index: Number(option.dataset['index']) }, false);
      },
      { signal },
    );
    this.closest('dialog')?.addEventListener(
      'close',
      () => {
        input.value = '';
        this.#query();
      },
      { signal },
    );

    void loadPagefind();
    this.#query();
  }

  disconnectedCallback(): void {
    this.#abort?.abort();
    this.#abort = null;
  }

  #query(): void {
    const query = this.#input?.value ?? '';
    const quick = rankQuickNav(this.#quick, query);
    const id = ++this.#searchId;
    this.#render(quick, query);
    if (query.trim().length < MIN_QUERY_LENGTH) {
      this.#announce('');
      return;
    }
    void this.#search(query, quick, id);
  }

  async #search(query: string, quick: readonly Item[], id: number): Promise<void> {
    const pf = await loadPagefind();
    if (id !== this.#searchId) return;
    if (pf === null) {
      this.#announce(this.#messages.indexMissing);
      return;
    }
    const response = await pf.debouncedSearch(query, {}, DEBOUNCE_MS).catch(() => null);
    if (response === null || id !== this.#searchId) return;
    const data = await Promise.all(
      response.results.slice(0, MAX_TEXT_RESULTS * 2).map((r) => r.data().catch(() => null)),
    );
    if (id !== this.#searchId) return;

    // Pagefind already loads the index of the page's <html lang>; the prefix check makes the
    // language filter explicit and also drops any page that is not under this locale's tree.
    const prefix = this.dataset['localePrefix'] ?? BASE;
    // Pages already listed by quick navigation are not repeated; a text hit on another
    // known page (e.g. a stratum whose name did not match) keeps that page's glyph and kind.
    const seen = new Set(quick.map((i) => pathOf(i.href)));
    const known = new Map(this.#quick.map((i) => [pathOf(i.href), i] as const));
    const text: Item[] = [];
    for (const d of data) {
      if (d === null || text.length >= MAX_TEXT_RESULTS) continue;
      const path = pathOf(d.url);
      if (!inLocale(path, prefix) || seen.has(path)) continue;
      seen.add(path);
      const page = known.get(path);
      text.push({
        label: d.meta?.title?.trim() || page?.label || path,
        href: d.url,
        kind: page?.kind ?? this.#messages.text,
        keywords: '',
        lang: null,
        glyph: page?.glyph ?? 'form-essay',
        stratum: page?.stratum ?? null,
        excerpt: sanitiseExcerpt(d.excerpt),
      });
    }
    const items = [...quick, ...text];
    this.#render(items, query);
    this.#announce(this.#countMessage(items.length, query));
  }

  #countMessage(n: number, query: string): string {
    const lang = document.documentElement.lang || undefined;
    const template =
      n === 0
        ? this.#messages.zero
        : new Intl.PluralRules(lang).select(n) === 'one'
          ? this.#messages.one
          : this.#messages.other;
    return format(template, { n: new Intl.NumberFormat(lang).format(n), query: query.trim() });
  }

  #announce(text: string): void {
    if (this.#status !== null && this.#status.textContent !== text) this.#status.textContent = text;
  }

  #render(items: readonly Item[], query: string): void {
    const list = this.#list;
    if (list === null) return;
    this.#items = items;
    const afterQuery = stepPalette(this.#state, { type: 'query', query }).state;
    this.#state = stepPalette(afterQuery, { type: 'results', count: items.length }).state;
    list.replaceChildren(
      ...items.map((item, index) => {
        // The link itself is the option (ARIA in HTML allows role=option on a[href]): an
        // interactive element nested inside an option would be hidden from assistive
        // technology (option children are presentational), while a real link keeps
        // middle-click / open-in-new-tab. The <li> is only layout.
        const id = `${list.id}-${index}`;
        const li = document.createElement('li');
        li.className = 'palette__item';
        li.setAttribute('role', 'none');
        if (item.stratum !== null) li.dataset['stratum'] = item.stratum;
        const a = document.createElement('a');
        a.id = id;
        a.className = 'palette__link';
        a.href = item.href;
        a.tabIndex = -1;
        a.setAttribute('role', 'option');
        a.setAttribute('aria-selected', 'false');
        a.dataset['index'] = String(index);
        if (item.lang !== null) a.hreflang = item.lang;
        if (item.glyph !== null) a.append(glyph(item.glyph));
        const label = document.createElement('span');
        label.id = `${id}-label`;
        label.className = 'palette__label';
        label.textContent = item.label;
        const kind = document.createElement('span');
        kind.id = `${id}-kind`;
        kind.className = 'palette__kind';
        kind.textContent = item.kind;
        a.append(label, kind);
        // Name = title + kind; the excerpt is the description (read after a pause, skippable).
        a.setAttribute('aria-labelledby', `${label.id} ${kind.id}`);
        if (item.excerpt !== null && item.excerpt.length > 0) {
          const excerpt = excerptNode(item.excerpt);
          excerpt.id = `${id}-excerpt`;
          a.append(excerpt);
          a.setAttribute('aria-describedby', excerpt.id);
        }
        li.append(a);
        return li;
      }),
    );
    this.#paint(true);
  }

  #key(event: KeyboardEvent): void {
    if (event.isComposing) return;
    const key = toPaletteKey(event.key);
    if (key === null) return;
    const step = this.#step({ type: 'key', key }, true);
    if (step.handled) event.preventDefault();
    const dialog = this.closest('dialog');
    switch (step.effect.kind) {
      case 'follow': {
        const item = this.#items[step.effect.index];
        if (item !== undefined) window.location.assign(item.href);
        break;
      }
      case 'close':
        dialog?.close();
        break;
      case 'none':
        break;
    }
  }

  #step(event: Parameters<typeof stepPalette>[1], scroll: boolean): ReturnType<typeof stepPalette> {
    const step = stepPalette(this.#state, event);
    const changed = step.state.active !== this.#state.active;
    this.#state = step.state;
    if (changed) this.#paint(scroll);
    return step;
  }

  /** Reflects the active option: aria-selected, aria-activedescendant, visibility. */
  #paint(scroll: boolean): void {
    const list = this.#list;
    const input = this.#input;
    if (list === null || input === null) return;
    let activeEl: HTMLElement | null = null;
    for (const option of list.querySelectorAll<HTMLElement>('[role="option"]')) {
      const on = Number(option.dataset['index']) === this.#state.active;
      option.setAttribute('aria-selected', String(on));
      if (on) activeEl = option;
    }
    if (activeEl === null) input.removeAttribute('aria-activedescendant');
    else {
      input.setAttribute('aria-activedescendant', activeEl.id);
      if (scroll) activeEl.scrollIntoView({ block: 'nearest' });
    }
  }
}

if (!customElements.get(TAG)) customElements.define(TAG, FtCommandPalette);
