/**
 * The opening of an essay (docs/planos/2026-11-26-experiencia-de-leitura.md): the text first.
 *
 *   order     the abstract is folded; the contents stand after the introduction, right before the first section;
 *   distance  the first paragraph of the text starts within 1.4 screens on a desktop and 2 on a phone (before the
 *             round of 2026-11-26 it was 2.03 and 2.81 on average: the full abstract and the contents came first);
 *   abstract  folded, it opens with a click or a key and holds the keywords.
 */
import type { Page } from '@playwright/test';
import { expect, settle, test } from './support/fixtures.ts';
import { loadSitePages } from './support/site.ts';

const ESSAY = /^(?:pt\/ensaios|en\/essays)\/[^/]+\/$/;
const essays = loadSitePages().filter((p) => ESSAY.test(p.path));

const VIEWPORTS = [
  { name: 'desktop', size: { width: 1440, height: 900 }, screens: 1.4 },
  { name: 'phone', size: { width: 390, height: 844 }, screens: 2 },
] as const;

/** Top of the first paragraph of the text (not a quotation, a note or the contents), in document px. */
const firstParagraphTop = (page: Page): Promise<number> =>
  page.locator('#essay-article').evaluate((article) => {
    const p = [...article.querySelectorAll('p')].find(
      (x) => !x.closest('nav, aside, figure, blockquote, .epigraph, .toc') && (x.textContent ?? '').trim().length > 80,
    );
    return p === undefined ? Number.POSITIVE_INFINITY : p.getBoundingClientRect().top + window.scrollY;
  });

test.describe('the opening of an essay', () => {
  for (const { name, size, screens } of VIEWPORTS) {
    for (const { path } of essays) {
      test(`${name}: /${path} — the text first`, async ({ page }) => {
        await page.setViewportSize(size);
        await page.goto(path);
        await settle(page);
        await expect(page.locator('.abstract__disclosure')).not.toHaveAttribute('open');
        const order = await page.locator('#essay-article').evaluate((article) => {
          const blocks = [...article.children];
          const toc = blocks.findIndex((b) => b.matches('.toc'));
          const section = blocks.findIndex((b) => b.matches('h2, .arg') || b.querySelector(':scope > h2') !== null);
          return { toc, section };
        });
        expect(order.toc, 'the contents follow the introduction').toBeGreaterThan(0);
        expect(order.section, 'the contents stand right before the first section').toBe(order.toc + 1);
        expect(await firstParagraphTop(page)).toBeLessThanOrEqual(screens * size.height);
      });
    }
  }

  test('the folded abstract opens from the keyboard and holds the keywords', async ({ page }) => {
    const first = essays.find((p) => p.path.startsWith('pt/'));
    if (first === undefined) throw new Error('no essay in pt');
    await page.goto(first.path);
    await settle(page);
    const summary = page.locator('.abstract__summary');
    await summary.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.abstract__disclosure')).toHaveAttribute('open', '');
    await expect(page.locator('.abstract__text')).toBeVisible();
    await expect(page.locator('.abstract__keywords')).toBeVisible();
  });
});
