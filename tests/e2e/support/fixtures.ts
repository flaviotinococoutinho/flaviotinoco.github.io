/**
 * Shared Playwright fixtures.
 *
 * `guard` (automatic, every test): records console errors, uncaught exceptions
 * and Content-Security-Policy violations of every document the test opens, and
 * fails the test at teardown if there was any. CSP violations are reported by
 * a `securitypolicyviolation` listener installed before any page script runs
 * (page.addInitScript) and sent to Node through an exposed binding, so they
 * survive navigations (CSP Level 3, §5.3 "Report a violation").
 */
import { test as base, expect, type Page } from '@playwright/test';

export interface CspViolation {
  readonly directive: string;
  readonly blocked: string;
  readonly source: string;
  readonly sample: string;
}

export interface Guard {
  /** Everything recorded so far, as human-readable lines. */
  readonly problems: () => readonly string[];
  /** Tolerates the problems matching `pattern` in this test only (e.g. the 404 of a deliberately missing page). */
  readonly allow: (pattern: RegExp) => void;
}

const REPORT = '__ftReportCspViolation';

const installCspListener = async (page: Page, sink: (v: CspViolation) => void): Promise<void> => {
  await page.exposeBinding(REPORT, (_source, violation: CspViolation) => sink(violation));
  await page.addInitScript((report: string) => {
    document.addEventListener('securitypolicyviolation', (event) => {
      const send = (window as unknown as Record<string, (v: unknown) => void>)[report];
      send?.({
        directive: event.effectiveDirective || event.violatedDirective,
        blocked: event.blockedURI || '(inline)',
        source: `${event.sourceFile}:${event.lineNumber}:${event.columnNumber}`,
        sample: event.sample,
      });
    });
  }, REPORT);
};

export const test = base.extend<{ guard: Guard }>({
  guard: [
    async ({ page }, use) => {
      const problems: string[] = [];
      page.on('console', (message) => {
        if (message.type() !== 'error') return;
        const { url, lineNumber } = message.location();
        problems.push(`console.error: ${message.text()}${url ? ` (${url}:${lineNumber})` : ''}`);
      });
      page.on('pageerror', (error) => problems.push(`uncaught exception: ${error.message}`));
      await installCspListener(page, (v) =>
        problems.push(`CSP violation: ${v.directive} blocked ${v.blocked} at ${v.source} ${v.sample}`.trim()),
      );
      const allowed: RegExp[] = [];
      const unexpected = (): readonly string[] => problems.filter((p) => !allowed.some((re) => re.test(p)));
      await use({ problems: unexpected, allow: (pattern) => void allowed.push(pattern) });
      expect(unexpected(), 'console errors, uncaught exceptions or CSP violations').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

/**
 * Waits until the page is visually settled: load event, web fonts, and two
 * animation frames (style and layout flushed after the islands registry ran).
 */
export const settle = async (page: Page): Promise<void> => {
  await page.waitForLoadState('load');
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  });
};
