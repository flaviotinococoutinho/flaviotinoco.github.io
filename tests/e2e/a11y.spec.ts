/**
 * Accessibility of every page of the build, in the light and the dark theme
 * (projects `light` and `dark` emulate prefers-color-scheme).
 *
 * Per page: HTTP 200; <html lang> is a site locale and matches the URL; the
 * emulated colour scheme is the one in effect (so axe really measures the dark
 * palette); exactly one <h1>; zero axe-core violations for WCAG 2.0/2.1 A+AA and
 * WCAG 2.2 AA. The `guard` fixture adds: no console errors, no uncaught
 * exceptions, no CSP violations.
 *
 * Pages: every page of the sitemaps and every other HTML file of dist/
 * (support/site.ts), plus two with tests of their own: the 404 page (status 404)
 * and the root, a language chooser that redirects at once. The root has no <h1>
 * by design (no content of its own, only the two language links shown if the
 * redirect does not happen), so it is audited for everything else.
 */
import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { LOCALES, type Locale } from '../../src/core/domain/locale.ts';
import { AXE_TAGS } from './support/contract.ts';
import { expect, settle, test } from './support/fixtures.ts';
import { COORDS, ROOT_PAGE, hasNotFoundPage, hasRootPage, loadSitePages } from './support/site.ts';

type AxeResults = Awaited<ReturnType<AxeBuilder['analyze']>>;

/** One readable line per violating node, e.g. "color-contrast (serious) main > p: Fix any of…". */
const describeViolations = (results: AxeResults): readonly string[] =>
  results.violations.flatMap((v) =>
    v.nodes.map(
      (n) =>
        `${v.id} (${v.impact ?? 'n/a'}) ${n.target.join(' ')}: ${v.help} — ${(n.failureSummary ?? '').replace(/\s+/g, ' ')} [${v.helpUrl}]`,
    ),
  );

const audit = async (
  page: Page,
  expectedLocale: Locale | undefined,
  scheme: string | undefined,
  { headingRequired = true } = {},
): Promise<void> => {
  const lang = await page.locator('html').getAttribute('lang');
  expect(LOCALES, '<html lang> must be one of the site locales').toContain(lang);
  if (expectedLocale !== undefined) expect(lang, '<html lang> must match the locale of the URL').toBe(expectedLocale);

  if (scheme !== undefined) {
    const used = await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme);
    expect(used, 'the emulated colour scheme must be the one in effect').toContain(scheme);
  }

  if (headingRequired) await expect(page.locator('h1'), 'exactly one <h1> per page').toHaveCount(1);

  const results = await new AxeBuilder({ page }).withTags([...AXE_TAGS]).analyze();
  expect(describeViolations(results), 'axe-core violations').toEqual([]);
};

test.describe('accessibility (axe-core, WCAG 2.2 AA)', () => {
  for (const { path, locale } of loadSitePages()) {
    test(`/${path}`, async ({ page }, testInfo) => {
      const response = await page.goto(path);
      expect(response?.status(), `HTTP status of /${path}`).toBe(200);
      await settle(page);
      await audit(page, locale, testInfo.project.use.colorScheme ?? undefined);
    });
  }

  test('root page (language chooser)', async ({ page }) => {
    test.skip(!hasRootPage(), 'the build has no root page');
    // The page sends the reader on at once (script, or <noscript> refresh). To audit the
    // document itself, every other navigation is aborted (net::ERR_ABORTED commits no error
    // page, so the current document stays). Starting a navigation also stops the current
    // document's loading, so its load event never fires: wait for the attempt instead.
    const root = new URL(COORDS.base, COORDS.origin).pathname;
    let attempted = (): void => undefined;
    const redirect = new Promise<void>((resolve) => (attempted = resolve));
    await page.route('**/*', (route) => {
      if (!route.request().isNavigationRequest() || new URL(route.request().url()).pathname === root)
        return route.fallback();
      attempted();
      return route.abort('aborted');
    });
    const response = await page.goto(ROOT_PAGE, { waitUntil: 'commit' });
    expect(response?.status()).toBe(200);
    await redirect;
    await page.waitForFunction(() => document.readyState !== 'loading');
    expect(new URL(page.url()).pathname, 'still on the root page').toBe(root);
    // No stylesheet, so no colour scheme of its own: the browser's defaults apply.
    await audit(page, undefined, undefined, { headingRequired: false });
    await expect(page.getByRole('link'), 'one link per site locale').toHaveCount(LOCALES.length);
  });

  test('404 page', async ({ page, guard }, testInfo) => {
    test.skip(!hasNotFoundPage(), 'the build has no 404.html yet');
    // The browser logs the 404 status of the document itself; that one is the point of the test.
    guard.allow(/status of 404/);
    const response = await page.goto('ft-e2e-page-that-does-not-exist/');
    expect(response?.status()).toBe(404);
    await settle(page);
    await audit(page, undefined, testInfo.project.use.colorScheme ?? undefined);
  });
});
