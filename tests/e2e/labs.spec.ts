/**
 * Interactive labs: every lab page of the build, in both locales.
 *
 * Without JavaScript the element shows its fallback (what the lab shows and why
 * it needs a script) and no interactive frame. With JavaScript the element
 * upgrades, loads its WebAssembly kernel (the loading status disappears) and its
 * first slider works from the keyboard: an arrow key changes the value the
 * slider announces (aria-valuetext). With reduced motion the labs still upgrade
 * and render. The `guard` fixture adds: no console errors, no uncaught
 * exceptions, no CSP violations (the kernels need 'wasm-unsafe-eval' only).
 */
import { expect, settle, test } from './support/fixtures.ts';
import { loadSitePages } from './support/site.ts';

/** Lab pages, not the labs index: /pt/laboratorio/<slug>/ and /en/lab/<slug>/. */
const LAB_PAGE = /(?:^|\/)(?:laboratorio|lab)\/[^/]+\/$/u;
const labs = loadSitePages().filter((p) => LAB_PAGE.test(p.path));

test('every widget has a lab page in each locale', () => {
  expect(labs.length, 'six widgets in two locales').toBeGreaterThanOrEqual(12);
});

test.describe('labs without JavaScript', () => {
  test.use({ javaScriptEnabled: false });
  for (const { path } of labs) {
    test(`/${path} shows the fallback`, async ({ page }) => {
      await page.goto(path);
      const lab = page.locator('.lab--page');
      await expect(lab).toHaveCount(1);
      await expect(lab.locator('.lab__fallback')).toBeVisible();
      await expect(lab.locator('.lab__description')).not.toBeEmpty();
      await expect(lab.locator('.lab__noscript')).not.toBeEmpty();
      await expect(lab.locator('.lab__frame')).toHaveCount(0);
    });
  }
});

test.describe('labs with JavaScript', () => {
  for (const { path } of labs) {
    test(`/${path} upgrades, loads its kernel and answers the keyboard`, async ({ page }) => {
      await page.goto(path);
      await settle(page);
      const lab = page.locator('.lab--page');
      await lab.scrollIntoViewIfNeeded();
      await expect(lab).toHaveAttribute('data-upgraded', '');
      await expect(lab.locator('.lab__fallback')).toBeHidden();
      await expect(lab.locator('.lab__frame')).toHaveAttribute('role', 'group');
      await expect(lab.locator('.lab__status'), 'the kernel loads').toBeHidden({ timeout: 15_000 });

      const slider = lab.locator('input[type="range"]').first();
      if ((await slider.count()) === 0) return;
      const before = await slider.getAttribute('aria-valuetext');
      await slider.focus();
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('ArrowRight');
      await expect(slider, 'the slider announces its new value').not.toHaveAttribute('aria-valuetext', before ?? '');
    });
  }
});

test.describe('labs with reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });
  for (const { path } of labs) {
    test(`/${path} still upgrades and renders`, async ({ page }) => {
      await page.goto(path);
      await settle(page);
      const lab = page.locator('.lab--page');
      await lab.scrollIntoViewIfNeeded();
      await expect(lab).toHaveAttribute('data-upgraded', '');
      await expect(lab.locator('.lab__status')).toBeHidden({ timeout: 15_000 });
    });
  }
});
