/**
 * Keyboard operability (WCAG 2.1.1 Keyboard, 2.4.1 Bypass Blocks, 2.4.3 Focus Order).
 *
 * - Every page: the first Tab stop is a skip link, visible when focused, whose
 *   target lies in the <main> landmark; activating it moves focus there.
 * - Each locale's home: walking the Tab order reaches the primary navigation,
 *   the search trigger and the preferences trigger (selectors: support/contract.ts).
 */
import { MAX_TAB_STOPS, PREFERENCES_TRIGGER, SEARCH_TRIGGER } from './support/contract.ts';
import { expect, settle, test } from './support/fixtures.ts';
import { loadSitePages, localeHomes } from './support/site.ts';

const pages = loadSitePages();

test.describe('skip link', () => {
  for (const { path } of pages) {
    test(`/${path}`, async ({ page }) => {
      await page.goto(path);
      await settle(page);
      await page.keyboard.press('Tab');

      const skip = page.locator(':focus');
      await expect(skip, 'the first Tab stop is a link').toHaveJSProperty('tagName', 'A');
      const href = (await skip.getAttribute('href')) ?? '';
      expect(href, 'the skip link points to a fragment of this page').toMatch(/^#./);
      await expect(skip, 'the focused skip link is visible').toBeInViewport();

      const id = decodeURIComponent(href.slice(1));
      const targetInMain = await page.evaluate(
        (targetId) => document.getElementById(targetId)?.closest('main') != null,
        id,
      );
      expect(targetInMain, `#${id} exists and lies in <main>`).toBe(true);

      await page.keyboard.press('Enter');
      await expect(page).toHaveURL((url) => decodeURIComponent(url.hash) === `#${id}`);
      const focusInMain = await page.evaluate(() => document.activeElement?.closest('main') != null);
      expect(focusInMain, 'activating the skip link moves focus into <main>').toBe(true);
    });
  }
});

test.describe('tab order', () => {
  for (const { path } of localeHomes(pages)) {
    test(`/${path} reaches the navigation, search and preferences`, async ({ page }) => {
      await page.goto(path);
      await settle(page);

      const reached = { navigation: false, search: false, preferences: false };
      const order: string[] = [];
      for (let i = 0; i < MAX_TAB_STOPS && !(reached.navigation && reached.search && reached.preferences); i += 1) {
        await page.keyboard.press('Tab');
        const stop = await page.evaluate(
          ([search, preferences]) => {
            const el = document.activeElement;
            if (el === null || el === document.body) return null;
            // Focus wrapped around to an element already visited: the whole order has been seen.
            const registry = window as unknown as { __ftTabSeen?: WeakSet<Element> };
            registry.__ftTabSeen ??= new WeakSet();
            const cycled = registry.__ftTabSeen.has(el);
            registry.__ftTabSeen.add(el);
            const name = (el.getAttribute('aria-label') ?? el.textContent ?? '').replace(/\s+/g, ' ').trim();
            return {
              cycled,
              label: `${el.localName}${el.id ? `#${el.id}` : ''} "${name.slice(0, 40)}"`,
              navigation: el.closest('nav') !== null,
              search: el.matches(search),
              preferences: el.matches(preferences),
            };
          },
          [SEARCH_TRIGGER, PREFERENCES_TRIGGER] as const,
        );
        if (stop === null) continue;
        if (stop.cycled) break;
        order.push(stop.label);
        reached.navigation ||= stop.navigation;
        reached.search ||= stop.search;
        reached.preferences ||= stop.preferences;
      }
      expect(reached, `Tab order: ${order.join(' → ')}`).toEqual({
        navigation: true,
        search: true,
        preferences: true,
      });
    });
  }
});
