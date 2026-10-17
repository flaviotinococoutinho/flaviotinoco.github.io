/**
 * Playwright — end-to-end tests (tests/e2e) against the BUILT site.
 *
 *   pnpm exec astro build      (or pnpm build)  then   pnpm test:e2e
 *
 * The web server is `astro preview` serving dist/ under the same base path the
 * site was built with (SITE / BASE_PATH, read exactly as astro.config.ts and
 * scripts/lib/site.ts read them), and `baseURL` includes that base path, so
 * tests navigate with relative paths ("pt/ensaios/") and base-path bugs fail here.
 *
 * Projects: `light` runs every spec; `dark` repeats the accessibility audit with
 * prefers-color-scheme: dark (contrast is a property of each palette).
 */
import { defineConfig, devices } from '@playwright/test';
import { DEFAULT_BASE_PATH, DEFAULT_SITE, siteCoordinates } from './scripts/lib/site.ts';

const CI = process.env['CI'] !== undefined && process.env['CI'] !== '' && process.env['CI'] !== 'false';
const PORT = Number(process.env['E2E_PORT'] ?? 4321);
const SITE = process.env['SITE'] ?? DEFAULT_SITE;
const BASE_PATH = process.env['BASE_PATH'] ?? DEFAULT_BASE_PATH;
const { base } = siteCoordinates({ SITE, BASE_PATH });
const origin = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: 'tests/e2e',
  outputDir: 'test-results',
  fullyParallel: true,
  forbidOnly: CI,
  // Accessibility findings are deterministic; one retry only absorbs runner hiccups and is reported as "flaky".
  retries: CI ? 1 : 0,
  ...(CI ? { workers: 2 } : {}),
  reporter: CI ? [['github'], ['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    ...devices['Desktop Chrome'],
    baseURL: `${origin}${base}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'light', use: { colorScheme: 'light' } },
    { name: 'dark', use: { colorScheme: 'dark' }, testMatch: /a11y\.spec\.ts$/ },
  ],
  webServer: {
    // --ignore-lock keeps the server in the foreground (Playwright owns its lifetime): Astro 7
    // otherwise detaches `astro preview` into a background daemon when it detects an AI agent.
    command: `pnpm exec astro preview --port ${PORT} --ignore-lock`,
    url: `${origin}${base}`,
    env: { SITE, BASE_PATH },
    reuseExistingServer: !CI,
    timeout: 120_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});
