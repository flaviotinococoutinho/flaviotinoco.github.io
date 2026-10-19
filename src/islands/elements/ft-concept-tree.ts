/**
 * <ft-concept-tree> — upgrades the taxonomy outline (ConceptTree.astro, nested
 * lists of links that work without JavaScript) to a WAI-ARIA tree following the
 * APG "Navigation Treeview" example: each label is the treeitem (links stay
 * links), list items are presentational, sub-lists are role="group" owned by
 * their treeitem (aria-owns), and level, set size and position are explicit.
 *
 * Keyboard (pure model in src/core/ontology/treenav.ts): ↑ ↓ → ← Home End *,
 * type-ahead; Enter follows a link (or toggles a category). One tab stop
 * (roving tabindex).
 *
 * Sync with the map: focusing a concept selects it in <ft-concept-map> through
 * the document event "ft-concept-select"; a selection made in the map marks the
 * matching items (aria-current="true"), expands their ancestors and makes the
 * first one the tab stop — without moving focus.
 */
import { stripDiacritics } from '../../core/ontology/text.ts';
import { ancestorsOf, isParent, treeKey, typeahead, type TreeItem, type TreeKey } from '../../core/ontology/treenav.ts';

const SELECT_EVENT = 'ft-concept-select';
const TREE_KEYS: ReadonlySet<string> = new Set(['ArrowDown', 'ArrowUp', 'ArrowRight', 'ArrowLeft', 'Home', 'End', '*']);
/** Type-ahead buffer lifetime (ms), as in the APG examples. */
const TYPEAHEAD_RESET = 500;

interface Node {
  readonly el: HTMLElement;
  readonly li: HTMLElement;
  readonly group: HTMLElement | null;
  readonly level: number;
  readonly id: string;
  readonly key: string;
}

let counter = 0;

class FtConceptTree extends HTMLElement {
  #nodes: Node[] = [];
  #current = 0;
  #buffer = '';
  #bufferTimer = 0;
  readonly #abort = new AbortController();

  connectedCallback(): void {
    const root = this.querySelector<HTMLElement>('ul.ctree__root');
    if (root === null) return;
    counter += 1;
    const prefix = `ctree-${String(counter)}`;
    root.setAttribute('role', 'tree');
    const locale = document.documentElement.lang;
    this.#nodes = [...root.querySelectorAll<HTMLElement>('li.ctree__item')].flatMap((li): Node[] => {
      const el = li.querySelector<HTMLElement>(':scope > .ctree__label');
      if (el === null) return [];
      const group = li.querySelector<HTMLElement>(':scope > ul.ctree__group');
      const label = el.textContent.trim();
      return [
        {
          el,
          li,
          group,
          level: Number(li.dataset['level'] ?? '1'),
          id: li.dataset['id'] ?? '',
          key: stripDiacritics(label.toLocaleLowerCase(locale)),
        },
      ];
    });
    for (const [i, n] of this.#nodes.entries()) {
      n.li.setAttribute('role', 'none');
      n.el.setAttribute('role', 'treeitem');
      n.el.setAttribute('aria-level', String(n.level));
      n.el.setAttribute('tabindex', i === 0 ? '0' : '-1');
      const siblings = [...(n.li.parentElement?.children ?? [])];
      n.el.setAttribute('aria-setsize', String(siblings.length));
      n.el.setAttribute('aria-posinset', String(siblings.indexOf(n.li) + 1));
      if (n.group !== null) {
        n.group.id = `${prefix}-group-${String(i)}`;
        n.group.setAttribute('role', 'group');
        n.el.setAttribute('aria-owns', n.group.id);
        // Categories start open (the top level is the overview); deeper parents start closed.
        this.#setExpanded(i, n.level === 1);
        const twisty = document.createElement('span');
        twisty.className = 'ctree__twisty';
        twisty.setAttribute('aria-hidden', 'true');
        twisty.dataset['toggle'] = String(i);
        n.el.before(twisty);
      }
    }
    this.classList.add('is-enhanced');
    const signal = this.#abort.signal;
    root.addEventListener('keydown', this.#onKeyDown, { signal });
    root.addEventListener('click', this.#onClick, { signal });
    root.addEventListener('focusin', this.#onFocusIn, { signal });
    document.addEventListener(SELECT_EVENT, this.#onSelect, { signal });
  }

  disconnectedCallback(): void {
    this.#abort.abort();
    window.clearTimeout(this.#bufferTimer);
  }

  #items(): readonly TreeItem[] {
    return this.#nodes.map((n) => ({
      level: n.level,
      expanded: n.el.getAttribute('aria-expanded') === 'true',
      label: n.key,
    }));
  }

  #setExpanded(i: number, expanded: boolean): void {
    const n = this.#nodes[i];
    if (n?.group === null || n === undefined) return;
    n.el.setAttribute('aria-expanded', String(expanded));
    n.group.hidden = !expanded;
  }

  #focus(i: number, move = true): void {
    const n = this.#nodes[i];
    if (n === undefined) return;
    this.#nodes[this.#current]?.el.setAttribute('tabindex', '-1');
    this.#current = i;
    n.el.setAttribute('tabindex', '0');
    if (move) n.el.focus();
  }

  readonly #onKeyDown = (e: KeyboardEvent): void => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const i = this.#nodes.findIndex((n) => n.el === e.target);
    if (i < 0) return;
    const items = this.#items();
    if (TREE_KEYS.has(e.key)) {
      e.preventDefault();
      const action = treeKey(items, i, e.key as TreeKey);
      switch (action.kind) {
        case 'focus':
          this.#focus(action.index);
          break;
        case 'expand':
          this.#setExpanded(action.index, true);
          break;
        case 'collapse':
          this.#setExpanded(action.index, false);
          break;
        case 'expand-all':
          for (const j of action.indices) this.#setExpanded(j, true);
          break;
        case 'none':
          break;
      }
      return;
    }
    if (e.key === 'Enter' && !(e.target instanceof HTMLAnchorElement) && isParent(items, i)) {
      e.preventDefault();
      this.#setExpanded(i, items[i]?.expanded !== true);
      return;
    }
    if (e.key.length === 1 && e.key.trim() !== '') {
      window.clearTimeout(this.#bufferTimer);
      this.#buffer += stripDiacritics(e.key.toLocaleLowerCase(document.documentElement.lang));
      this.#bufferTimer = window.setTimeout(() => {
        this.#buffer = '';
      }, TYPEAHEAD_RESET);
      const j = typeahead(items, i, this.#buffer);
      if (j !== null) this.#focus(j);
    }
  };

  readonly #onClick = (e: MouseEvent): void => {
    const target = e.target as HTMLElement | null;
    const toggle = target?.closest<HTMLElement>('[data-toggle]');
    if (toggle !== null && toggle !== undefined) {
      const i = Number(toggle.dataset['toggle']);
      this.#setExpanded(i, this.#nodes[i]?.el.getAttribute('aria-expanded') !== 'true');
      this.#focus(i);
      return;
    }
    const item = target?.closest<HTMLElement>('[role="treeitem"]');
    const i = this.#nodes.findIndex((n) => n.el === item);
    if (i < 0 || item instanceof HTMLAnchorElement) return;
    // A category label (not a link): click toggles it.
    this.#setExpanded(i, item?.getAttribute('aria-expanded') !== 'true');
    this.#focus(i);
  };

  readonly #onFocusIn = (e: FocusEvent): void => {
    const i = this.#nodes.findIndex((n) => n.el === e.target);
    if (i < 0) return;
    this.#focus(i, false);
    const n = this.#nodes[i];
    if (n !== undefined && !n.id.startsWith('@')) {
      document.dispatchEvent(new CustomEvent(SELECT_EVENT, { detail: { id: n.id, origin: this } }));
      this.#mark(n.id);
    }
  };

  /** Marks every occurrence of a concept (polyhierarchy repeats it) as the current selection. */
  #mark(id: string | null): void {
    for (const n of this.#nodes) {
      if (id !== null && n.id === id) n.el.setAttribute('aria-current', 'true');
      else n.el.removeAttribute('aria-current');
    }
  }

  readonly #onSelect = (e: Event): void => {
    const detail = (e as CustomEvent<{ id: string | null; origin: Element }>).detail;
    if (detail.origin === this) return;
    this.#mark(detail.id);
    if (detail.id === null) return;
    const i = this.#nodes.findIndex((n) => n.id === detail.id);
    if (i < 0) return;
    for (const a of ancestorsOf(this.#items(), i)) this.#setExpanded(a, true);
    this.#focus(i, false);
  };
}

if (!customElements.get('ft-concept-tree')) customElements.define('ft-concept-tree', FtConceptTree);
