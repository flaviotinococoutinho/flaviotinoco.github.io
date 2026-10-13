/**
 * Global fast-check configuration for every test file (vitest setupFiles).
 *
 * The seed is chosen once per run by vitest.config.ts and passed as FC_SEED, so
 * all properties of a run are replayable with a single environment variable.
 * FC_NUM_RUNS raises the number of cases (e.g. a deeper nightly run).
 */
import fc from 'fast-check';

const integer = (raw: string | undefined): number | undefined => {
  if (raw === undefined || raw.trim() === '') return undefined;
  const n = Number(raw);
  return Number.isSafeInteger(n) ? n : undefined;
};

const seed = integer(process.env['FC_SEED']);
const numRuns = integer(process.env['FC_NUM_RUNS']);

fc.configureGlobal({
  ...fc.readConfigureGlobal(),
  ...(seed === undefined ? {} : { seed }),
  ...(numRuns === undefined || numRuns < 1 ? {} : { numRuns }),
});
