/**
 * Site chrome behaviour on the built site: command palette, preferences panel,
 * global shortcut, narrow-screen navigation and the bilingual 404 page.
 *
 * Each test pins a defect found in review, reproduced on the built site:
 * - the reader's choice in the palette survives the arrival of full-text results;
 * - the preferences panel never shows a stored value that the page does not apply;
 * - the palette hint (the field's accessible description) follows the "/" preference;
 * - "/" typed into a field inside a shadow root stays in that field;
 * - the palette field shows focus in forced-colours mode (WCAG 2.4.7);
 * - the narrow-screen navigation does not shift when its island upgrades;
 * - the two titles of the 404 heading stay separate words without CSS;
 * - the root page sends the reader to the home of the negotiated language.
 * The `guard` fixture adds: no console errors, uncaught exceptions or CSP violations.
 */
import type { Page } from '@playwright/test';
import chrome from '../../src/core/i18n/catalogs/chrome.ts';
import { PREFS_STORAGE_KEY } from '../../src/core/chrome/preferences.ts';
import {
  NAV_MENU,
  PALETTE_DIALOG,
  PALETTE_INPUT,
  PALETTE_STATUS,
  PREFERENCES_TRIGGER,
  preferenceRadio,
} from './support/contract.ts';
import { expect, settle, test } from './support/fixtures.ts';
import { ROOT_PAGE, hasNotFoundPage, hasRootPage } from './support/site.ts';

/** Opens the palette with Ctrl+K and waits until <ft-command-palette> has upgraded the field. */
const openPalette = async (page: Page): Promise<void> => {
  await page.keyboard.press('Control+k');
  await expect(page.locator(PALETTE_DIALOG)).toHaveAttribute('open', '');
  await expect(page.locator(PALETTE_INPUT)).toBeFocused();
  await expect(page.locator(PALETTE_INPUT)).toHaveAttribute('role', 'combobox');
};

/** The option the field currently points at (aria-activedescendant): its label and href. */
const activeOption = (page: Page): Promise<{ readonly label: string; readonly href: string } | null> =>
  page.locator(PALETTE_INPUT).evaluate((input) => {
    const id = input.getAttribute('aria-activedescendant');
    const option = id === null ? null : document.getElementById(id);
    if (!(option instanceof HTMLAnchorElement)) return null;
    return { label: option.querySelector('.palette__label')?.textContent ?? '', href: option.href };
  });

test.describe('command palette', () => {
  test('keeps the option the reader chose when full-text results arrive', async ({ page }) => {
    await page.goto('pt/');
    await settle(page);
    await openPalette(page);
    // "estr" ranks the four strata in quick navigation (keyword "Estrato") and also starts a
    // full-text search, whose results arrive at least one debounce (144 ms) later.
    await page.locator(PALETTE_INPUT).pressSequentially('estr');
    await expect(page.locator(`${PALETTE_INPUT}[aria-activedescendant]`)).toHaveCount(1);
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    const chosen = await activeOption(page);
    expect(chosen, 'an option is active after two ArrowDown presses').not.toBeNull();

    // The search has answered once the polite status counts the results for this query.
    await expect(page.locator(PALETTE_STATUS)).toContainText('“estr”');
    expect(await activeOption(page), 'the active option after the text results arrived').toEqual(chosen);
  });

  test('describes the field with the shortcuts that currently work', async ({ page }) => {
    const c = chrome.en;
    await page.goto('en/');
    await settle(page);
    await openPalette(page);
    await expect(page.locator(PALETTE_INPUT)).toHaveAccessibleDescription(`${c['palette.hint']} · ${c['search.keys']}`);

    await page.evaluate((key) => localStorage.setItem(key, JSON.stringify({ shortcut: 'off' })), PREFS_STORAGE_KEY);
    await page.reload();
    await settle(page);
    await page.keyboard.press('/');
    await expect(page.locator(PALETTE_DIALOG), '"/" is off').not.toHaveAttribute('open', '');
    await openPalette(page);
    await expect(page.locator(PALETTE_INPUT)).toHaveAccessibleDescription(
      `${c['palette.hint']} · ${c['search.keysChord']}`,
    );
  });

  test('"/" opens the palette, except while typing — also inside a shadow root', async ({ page }) => {
    await page.goto('pt/');
    await settle(page);
    await page.evaluate(() => {
      const host = document.createElement('div');
      host.id = 'ft-e2e-shadow';
      host.attachShadow({ mode: 'open' }).innerHTML = '<label>f(x) = <input></label>';
      document.querySelector('main')?.prepend(host);
    });
    const field = page.locator('#ft-e2e-shadow input');
    await field.focus();
    await page.keyboard.type('a/b');
    await expect(field).toHaveValue('a/b');
    await expect(page.locator(PALETTE_DIALOG)).not.toHaveAttribute('open', '');

    await field.blur();
    await page.keyboard.press('/');
    await expect(page.locator(PALETTE_DIALOG)).toHaveAttribute('open', '');
  });

  test.describe('in forced-colours mode', () => {
    test.use({ forcedColors: 'active' });

    test('shows where the focus is in the search field', async ({ page }) => {
      await page.goto('pt/');
      await settle(page);
      await openPalette(page);
      const outline = await page.locator(PALETTE_INPUT).evaluate((input) => {
        const style = getComputedStyle(input);
        return {
          focusVisible: input.matches(':focus-visible'),
          style: style.outlineStyle,
          width: parseFloat(style.outlineWidth),
        };
      });
      expect(outline.focusVisible).toBe(true);
      expect(outline.style, 'outline style of the focused field').not.toBe('none');
      expect(outline.width, 'outline width of the focused field (px)').toBeGreaterThanOrEqual(2);
    });
  });
});

test.describe('preferences panel', () => {
  test('applies the stored preferences it shows (a change made in another tab)', async ({ context, page }) => {
    await page.goto('pt/');
    await settle(page);

    const other = await context.newPage();
    await other.goto('pt/');
    await other.locator(PREFERENCES_TRIGGER).first().click();
    await other.locator(preferenceRadio('theme', 'dark')).check();
    await expect(other.locator('html')).toHaveAttribute('data-theme', 'dark');
    await other.close();

    // This tab never opened its panel, so it has not heard of the change yet.
    await expect(page.locator('html')).not.toHaveAttribute('data-theme', 'dark');
    await page.locator(PREFERENCES_TRIGGER).first().click();
    await expect(page.locator(preferenceRadio('theme', 'dark'))).toBeChecked();
    await expect(page.locator('html'), 'the page applies the value the panel shows').toHaveAttribute(
      'data-theme',
      'dark',
    );
  });
});

test.describe('narrow screens (375 px)', () => {
  test.use({ viewport: { width: 375, height: 740 } });

  test('the navigation does not shift when its island upgrades', async ({ page }) => {
    // Hold the island back until the page (fonts included) has settled, so that the only
    // change measured is the upgrade of <ft-nav-menu> itself.
    let release = (): void => undefined;
    const held = new Promise<void>((resolve) => (release = resolve));
    await page.route(/\/ft-nav-menu\.[^/]*\.js$/, async (route) => {
      await held;
      await route.continue();
    });
    await page.addInitScript(() => {
      const shifts: string[] = [];
      (window as unknown as { __ftShifts: string[] }).__ftShifts = shifts;
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries() as (PerformanceEntry & {
          readonly value: number;
          readonly hadRecentInput: boolean;
          readonly sources: readonly { readonly node: Node | null }[];
        })[]) {
          if (entry.hadRecentInput) continue;
          for (const source of entry.sources) {
            const el = source.node instanceof Element ? source.node : source.node?.parentElement;
            shifts.push(`${el?.className || el?.localName || '?'} (${entry.value.toFixed(4)})`);
          }
        }
      }).observe({ type: 'layout-shift', buffered: true });
    });
    await page.goto('pt/');
    await settle(page);
    await expect(page.locator(NAV_MENU)).not.toHaveAttribute('data-ready');
    await page.evaluate(() => void ((window as unknown as { __ftShifts: string[] }).__ftShifts.length = 0));

    release();
    await expect(page.locator(NAV_MENU)).toHaveAttribute('data-ready', '');
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const shifts = await page.evaluate(() => (window as unknown as { __ftShifts: string[] }).__ftShifts);
    expect(shifts, 'layout shifts caused by the upgrade').toEqual([]);

    const toggle = page.locator(`${NAV_MENU} > button[aria-controls]`);
    const firstLink = page.locator(`${NAV_MENU} nav a`).first();
    await expect(firstLink).toBeHidden();
    await toggle.click();
    await expect(firstLink).toBeVisible();
  });

  for (const width of [360, 375]) {
    test(`the header is one row on a ${width} px phone, so a font swap cannot wrap it`, async ({ page }) => {
      await page.setViewportSize({ width, height: 740 });
      await page.goto('pt/');
      await settle(page);
      const rows = await page
        .locator('.site-header__bar > *')
        .evaluateAll((items) => new Set(items.map((item) => Math.round(item.getBoundingClientRect().top))).size);
      expect(rows, 'rows of the header bar').toBe(1);
    });
  }

  test.describe('without JavaScript', () => {
    test.use({ javaScriptEnabled: false });

    test('the navigation stays visible and no inert toggle is shown', async ({ page }) => {
      await page.goto('pt/');
      await expect(page.locator(`${NAV_MENU} nav a`).first()).toBeVisible();
      await expect(page.locator(`${NAV_MENU} > button[aria-controls]`)).toBeHidden();
    });
  });
});

test.describe('root page', () => {
  for (const [locale, home] of [
    ['pt-BR', 'pt/'],
    ['en-GB', 'en/'],
  ] as const) {
    test.describe(`browser language ${locale}`, () => {
      test.use({ locale });

      test(`sends the reader to /${home}`, async ({ page }) => {
        test.skip(!hasRootPage(), 'the build has no root page');
        await page.goto(ROOT_PAGE);
        await expect(page).toHaveURL((url) => url.pathname.endsWith(`/${home}`));
        await expect(page.locator('h1')).toHaveCount(1);
      });
    });
  }
});

test.describe('404 page', () => {
  test('the bilingual heading keeps the two titles apart in its text', async ({ page, guard }) => {
    test.skip(!hasNotFoundPage(), 'the build has no 404.html yet');
    guard.allow(/status of 404/);
    await page.goto('ft-e2e-page-that-does-not-exist/');
    const heading = page.locator('h1');
    const titles = await heading.locator('[lang]').allTextContents();
    expect(titles).toHaveLength(2);
    // Word tokens of the raw text (what text extraction, reader modes and a page without CSS
    // get): the titles' words, in order, none glued to its neighbour ("encontradaPage").
    const words = (s: string): readonly string[] => s.split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 0);
    expect(words((await heading.textContent()) ?? '')).toEqual(titles.flatMap(words));
  });
});
