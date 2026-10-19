/**
 * Reduced motion (WCAG 2.3.3 Animation from Interactions; docs/arquitetura.md §6
 * "toda animação tem estado final como padrão").
 *
 * With `prefers-reduced-motion: reduce` emulated, every page resolves --motion
 * to 0 and, once settled, has no element mid-animation: no time-based animation
 * or transition is running or frozen part-way. Scroll-driven animations
 * (ScrollTimeline/ViewTimeline) are excluded — they advance only when the reader
 * scrolls, and the depth effects they drive are scaled by --motion.
 */
import { expect, settle, test } from './support/fixtures.ts';
import { loadSitePages } from './support/site.ts';

test.use({ reducedMotion: 'reduce' });

test.describe('reduced motion', () => {
  for (const { path } of loadSitePages()) {
    test(`/${path}`, async ({ page }) => {
      await page.goto(path);
      await settle(page);

      const motion = await page.evaluate(() =>
        getComputedStyle(document.documentElement).getPropertyValue('--motion').trim(),
      );
      expect(motion, '--motion under prefers-reduced-motion: reduce').toBe('0');

      const midAnimation = await page.evaluate(() =>
        document
          .getAnimations()
          .filter((a) => a.timeline instanceof DocumentTimeline)
          .flatMap((a) => {
            const timing = a.effect?.getComputedTiming();
            const progress = timing?.progress ?? null;
            const active = Number(timing?.activeDuration ?? 0) > 0;
            const running = a.playState === 'running' && active;
            const frozen = a.playState === 'paused' && progress !== null && progress > 0 && progress < 1;
            if (!running && !frozen) return [];
            const target = a.effect instanceof KeyframeEffect ? a.effect.target : null;
            const where = target ? `${target.localName}${target.id ? `#${target.id}` : ''}` : '?';
            const name =
              a instanceof CSSAnimation ? a.animationName : a instanceof CSSTransition ? a.transitionProperty : a.id;
            return [`${where}: ${name || 'animation'} (${a.playState}, progress ${String(progress)})`];
          }),
      );
      expect(midAnimation, 'elements still animating under reduced motion').toEqual([]);
    });
  }
});
