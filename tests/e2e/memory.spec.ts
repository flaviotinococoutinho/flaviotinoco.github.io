/**
 * Reading memory (ft-reading-memory, src/core/reading/memory.ts): a reader who stops half-way through an
 * essay is offered, on the next visit, to continue from there; "continue" takes them back to the place and
 * moves focus to the section; "forget" erases the record; a visit that only peeks at the top does not
 * erase it. Pages of one browser context share localStorage, so a new page is a new visit.
 */
import AxeBuilder from '@axe-core/playwright';
import type { BrowserContext, Page } from '@playwright/test';
import { AXE_TAGS } from './support/contract.ts';
import { expect, settle, test } from './support/fixtures.ts';
import { loadSitePages } from './support/site.ts';

const essay = loadSitePages().find((p) => /^pt\/ensaios\/[^/]+\/$/.test(p.path))?.path ?? 'pt/ensaios/';
const OFFER = 'ft-reading-memory';

/** Reads to the middle of the article and lets the record be saved (once a second, and on pagehide). */
const readHalf = async (page: Page): Promise<void> => {
  await page.goto(essay);
  await settle(page);
  await page.evaluate(() => {
    const article = document.getElementById('essay-article');
    if (article === null) return;
    const box = article.getBoundingClientRect();
    window.scrollTo({ top: box.top + window.scrollY + (box.height - window.innerHeight) / 2, behavior: 'instant' });
  });
  await page.waitForTimeout(1500);
};

const visit = async (context: BrowserContext): Promise<Page> => {
  const page = await context.newPage();
  await page.goto(essay);
  await settle(page);
  return page;
};

test.describe('reading memory', () => {
  test('offers to continue, takes the reader back and moves focus to the section', async ({ page, context }) => {
    await readHalf(page);
    const stored = await page.evaluate(() => localStorage.getItem('ft:reading'));
    expect(stored).toContain('"p":0.5');

    const again = await visit(context);
    const offer = again.locator(OFFER);
    await expect(offer).toBeVisible();
    await expect(offer).toHaveAttribute('role', 'region');
    await expect(offer).toContainText('Você parou em');
    await expect(offer).toContainText('50');
    const results = await new AxeBuilder({ page: again })
      .include(OFFER)
      .withTags([...AXE_TAGS])
      .analyze();
    expect(results.violations.map((v) => v.id)).toEqual([]);

    await offer.getByRole('button', { name: 'Continuar de onde parei' }).click();
    await expect(offer).toBeHidden();
    await expect
      .poll(() => again.evaluate(() => window.scrollY / document.documentElement.scrollHeight))
      .toBeGreaterThan(0.25);
    const focused = await again.evaluate(() => document.activeElement?.localName ?? '');
    expect(['h2', 'h3', 'article']).toContain(focused);
  });

  test('a peek at the top does not erase the place; "forget" does', async ({ page, context }) => {
    await readHalf(page);

    const peek = await visit(context);
    await peek.mouse.wheel(0, 40);
    await peek.waitForTimeout(1500);
    await peek.close();

    const again = await visit(context);
    const offer = again.locator(OFFER);
    await expect(offer).toBeVisible();
    await offer.getByRole('button', { name: 'Esquecer' }).click();
    await expect(offer.getByRole('status')).toContainText('Esquecido');
    await again.close();

    const last = await visit(context);
    await expect(last.locator(OFFER)).toBeHidden();
  });

  test('without a record nothing is shown', async ({ page }) => {
    await page.goto(essay);
    await settle(page);
    await expect(page.locator(OFFER)).toBeHidden();
  });
});
