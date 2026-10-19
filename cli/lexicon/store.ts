/**
 * The lexicon Bloom filter on disk (shell): `.cache/lexicon/<locale>.bloom`
 * (binary, the core's LXBF format: src/core/lexicon/bloom.ts) and a JSON
 * sidecar `<locale>.json` with its provenance — source, SHA-256 of the input,
 * licence, parameters — because a filter generated from LGPL/MPL or CC-BY-SA
 * data is a derived work whose origin must travel with it
 * (docs/research/lexicon.md §3). `.cache/` is not versioned.
 */
import { join } from 'node:path';
import { err, ok, type Result } from '../../src/core/algebra/result.ts';
import { show } from '../../src/core/algebra/show.ts';
import type { Locale } from '../../src/core/domain/locale.ts';
import { decodeBloom, type BloomDecodeError, type BloomFilter } from '../../src/core/lexicon/bloom.ts';
import type { Fs } from '../io.ts';
import { LEXICON_CACHE } from '../project.ts';

export interface SourceRecord {
  /** URL or project-relative path. */
  readonly location: string;
  readonly sha256: string;
  readonly bytes: number;
}

export interface Provenance {
  readonly tool: 'ft lexicon build';
  readonly format: 'LXBF';
  readonly formatVersion: number;
  readonly locale: Locale;
  readonly source: SourceRecord;
  readonly affixes?: SourceRecord;
  readonly sourceFormat: 'hunspell' | 'plain';
  readonly license: string;
  readonly notice: string;
  /** Entries read (stems of a .dic, lines of a list) and distinct keys inserted. */
  readonly entries: number;
  readonly n: number;
  readonly m: number;
  readonly k: number;
  readonly targetFalsePositiveRate: number;
  readonly expectedFalsePositiveRate: number;
  readonly normalisation: 'NFC + case fold';
  /** ISO 8601 instant of the build. */
  readonly builtAt: string;
}

export const bloomPaths = (root: string, locale: Locale): { readonly filter: string; readonly sidecar: string } => ({
  filter: join(root, LEXICON_CACHE, `${locale}.bloom`),
  sidecar: join(root, LEXICON_CACHE, `${locale}.json`),
});

export type StoredBloom = {
  readonly filter: BloomFilter;
  readonly provenance: Provenance | undefined;
  readonly path: string;
};

export type ReadBloomError =
  | { readonly kind: 'decode'; readonly path: string; readonly error: BloomDecodeError }
  | { readonly kind: 'sidecar'; readonly path: string; readonly detail: string };

const isProvenance = (v: unknown): v is Provenance =>
  typeof v === 'object' &&
  v !== null &&
  (v as { tool?: unknown }).tool === 'ft lexicon build' &&
  typeof (v as { n?: unknown }).n === 'number';

/** The filter of a locale: undefined when it was never built; an error when the file is damaged. */
export const readStoredBloom = async (
  root: string,
  locale: Locale,
  fs: Fs,
): Promise<Result<StoredBloom, ReadBloomError> | undefined> => {
  const paths = bloomPaths(root, locale);
  if (!(await fs.exists(paths.filter))) return undefined;
  const decoded = decodeBloom(await fs.readBytes(paths.filter));
  if (!decoded.ok) return err({ kind: 'decode', path: paths.filter, error: decoded.error });
  let provenance: Provenance | undefined;
  if (await fs.exists(paths.sidecar)) {
    try {
      const parsed: unknown = JSON.parse(await fs.readText(paths.sidecar));
      if (!isProvenance(parsed)) return err({ kind: 'sidecar', path: paths.sidecar, detail: show(parsed) });
      provenance = parsed;
    } catch (e: unknown) {
      return err({ kind: 'sidecar', path: paths.sidecar, detail: e instanceof Error ? e.message : show(e) });
    }
  }
  return ok({ filter: decoded.value, provenance, path: paths.filter });
};

/** A one-line description of a decode error (the core's typed error, rendered). */
export const describeBloomError = (e: ReadBloomError): string =>
  e.kind === 'sidecar'
    ? `${e.path}: ${e.detail}`
    : `${e.path}: ${e.error.kind}${'detail' in e.error ? ` (${e.error.detail})` : ''}${
        'expected' in e.error ? ` (expected ${String(e.error.expected)}, got ${String(e.error.actual)})` : ''
      }`;
