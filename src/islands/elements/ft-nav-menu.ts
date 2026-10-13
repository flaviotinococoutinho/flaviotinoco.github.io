/**
 * <ft-nav-menu> — disclosure for the primary navigation on narrow screens
 * (WAI-ARIA APG "Disclosure (Show/Hide)" pattern, navigation-menu variant).
 *
 * Server HTML: a hidden toggle button followed by a <nav> whose list is always
 * visible — the no-JS fallback is simply the visible navigation. On upgrade the
 * element reveals the button and sets [data-ready]; CSS then collapses the list
 * below the narrow breakpoint until aria-expanded="true". Escape and a click
 * outside close it; focus returns to the toggle on Escape.
 *
 * Expected structure:
 *   <ft-nav-menu>
 *     <button aria-expanded="false" aria-controls="ID" hidden>…</button>
 *     <nav><ul id="ID">…</ul></nav>
 *   </ft-nav-menu>
 */
const TAG = 'ft-nav-menu';

class FtNavMenu extends HTMLElement {
  #button: HTMLButtonElement | null = null;
  #abort: AbortController | null = null;

  connectedCallback(): void {
    const button = this.querySelector<HTMLButtonElement>(':scope > button[aria-controls]');
    if (button === null) return;
    this.#button = button;
    this.#abort = new AbortController();
    const { signal } = this.#abort;

    button.hidden = false;
    this.setAttribute('data-ready', '');
    this.#set(false);

    button.addEventListener('click', () => this.#set(!this.#expanded()), { signal });
    this.addEventListener(
      'keydown',
      (event) => {
        if (event.key !== 'Escape' || !this.#expanded()) return;
        this.#set(false);
        button.focus();
      },
      { signal },
    );
    document.addEventListener(
      'click',
      (event) => {
        if (this.#expanded() && event.target instanceof Node && !this.contains(event.target)) this.#set(false);
      },
      { signal },
    );
    // Collapse when focus leaves the menu entirely (keyboard users tabbing past it).
    this.addEventListener(
      'focusout',
      (event) => {
        if (event.relatedTarget instanceof Node && !this.contains(event.relatedTarget)) this.#set(false);
      },
      { signal },
    );
  }

  disconnectedCallback(): void {
    this.#abort?.abort();
    this.#abort = null;
  }

  #expanded(): boolean {
    return this.#button?.getAttribute('aria-expanded') === 'true';
  }

  #set(open: boolean): void {
    this.#button?.setAttribute('aria-expanded', String(open));
  }
}

if (!customElements.get(TAG)) customElements.define(TAG, FtNavMenu);
