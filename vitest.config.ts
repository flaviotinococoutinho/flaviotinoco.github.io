/**
 * Vitest — unit and property tests (tests/unit/**), Node environment.
 *
 * Reproducibility of property tests (fast-check):
 *   one seed per run, printed once below and passed to every worker through
 *   FC_SEED (read by tests/unit/guardrails/fast-check.setup.ts). @fast-check/vitest
 *   also appends "(with seed=N)" to each property's name. To replay a failure:
 *     FC_SEED=<seed> pnpm test [-t "<property name>"]
 *   FC_NUM_RUNS=<n> raises the number of generated cases (default 100).
 *
 * Coverage (CI: `pnpm test --coverage`): v8, measured on the functional core and
 * on the pure helpers of the guardrail scripts. Thresholds — see ADR 0001:
 *   - src/core aggregate 85 % lines/statements/functions: the core is pure, so
 *     everything in it is reachable from a test without mocks; 85 % leaves room
 *     for defensive `absurd` branches and error messages, not for untested modules.
 *   - branches 75 %: parsers carry one error branch per malformed shape; property
 *     tests hit most, but enumerating every malformed shape has low value.
 *   - per-file floor of 60 % lines: a new core module without tests fails CI even
 *     when the aggregate is high (prevents "coverage by dilution").
 *   - scripts/lib 90/80: small, pure helpers whose bugs would silently weaken a gate.
 */
import { defineConfig } from 'vitest/config';

const parseSeed = (raw: string | undefined): number | undefined => {
  if (raw === undefined || raw.trim() === '') return undefined;
  const n = Number(raw);
  return Number.isSafeInteger(n) ? n : undefined;
};

const seed = parseSeed(process.env['FC_SEED']) ?? Math.floor(Math.random() * 0x7fffffff);
if (process.env['VITEST_WORKER_ID'] === undefined) {
  console.info(`[fast-check] seed=${seed} — replay with FC_SEED=${seed}`);
}

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
    setupFiles: ['tests/unit/guardrails/fast-check.setup.ts'],
    env: { FC_SEED: String(seed) },
    coverage: {
      provider: 'v8',
      include: ['src/core/**/*.ts', 'scripts/lib/**/*.ts'],
      exclude: ['**/*.d.ts'],
      reporter: ['text-summary', 'text', 'html', 'lcov', 'json-summary'],
      reportsDirectory: 'coverage',
      reportOnFailure: true,
      thresholds: {
        'src/core/**/*.ts': {
          lines: 85,
          statements: 85,
          functions: 85,
          branches: 75,
          perFile: { lines: 60 },
        },
        'scripts/lib/**/*.ts': { lines: 90, statements: 90, functions: 90, branches: 80 },
      },
    },
  },
});
