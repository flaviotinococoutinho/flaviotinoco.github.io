#!/usr/bin/env node
// Builds the WebAssembly kernels in wasm/ and publishes them to src/wasm/.
//
//   node scripts/build-wasm.mjs           build, validate, write src/wasm/*.wasm + manifest.json
//   node scripts/build-wasm.mjs --check   build and validate only (writes nothing)
//
// Steps: cargo build (release, wasm32-unknown-unknown, run inside wasm/ so that
// rust-toolchain.toml and .cargo/config.toml apply) → strip custom sections →
// optional `wasm-opt -Oz` (only when a wasm-opt binary is on PATH; kept only if smaller) →
// validation (zero imports, exactly the documented exports, abi_version() === 1, arena
// smoke test) → size budget (warn > 24 KiB, fail > 48 KiB raw) → report and manifest.
// Gzip sizes use zlib's default level 6 (as scripts/check-budgets.ts does), i.e. roughly what a static
// host serves. The manifest is a JSON array of { name, bytes, gzipBytes, sha256 } (bytes = raw size).
// Plain Node ESM, no dependencies. Exits non-zero on any failure.
// See docs/adr/0003-wasm-kernels.md.

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  accessSync,
  constants as fsConstants,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WASM_DIR = join(ROOT, 'wasm');
const OUT_DIR = join(ROOT, 'src', 'wasm');
const TARGET = 'wasm32-unknown-unknown';
const ARTIFACT_DIR = join(WASM_DIR, 'target', TARGET, 'release');
const ABI_VERSION = 1;
const KIB = 1024;
const WARN_BYTES = 24 * KIB;
const FAIL_BYTES = 48 * KIB;

const ABI_EXPORTS = ['abi_version', 'arena_alloc', 'arena_reset', 'arena_used'];

/** Exact export lists (besides `memory`) of ABI version 1. */
const MODULES = {
  signal: [
    ...ABI_EXPORTS,
    'fft',
    'ifft',
    'magnitude',
    'power_db',
    'window',
    'multiply',
    'fourier_series',
    'synth',
    'sample_sinusoid',
    'reconstruct_sinc',
    'alias_frequency',
    'spectral_entropy',
  ],
  information: [
    ...ABI_EXPORTS,
    'histogram_u8',
    'entropy_counts',
    'entropy_bytes',
    'conditional_entropy_bytes',
    'huffman_lengths',
    'kl_divergence',
    'js_divergence',
    'binary_entropy',
    'bsc_capacity',
    'bec_capacity',
    'mutual_information',
    'intrinsic_ic',
    'lin_similarity',
  ],
  dynamics: [
    ...ABI_EXPORTS,
    'logistic_orbit',
    'logistic_lyapunov',
    'logistic_bifurcation',
    'lyapunov_curve',
    'lorenz',
    'clt_histogram',
    'noise3',
    'flow_init',
    'flow_step',
    'flow_segments_ptr',
    'flow_count',
  ],
};

/** Features rustc enables by default on wasm32-unknown-unknown (rustc --print cfg). */
const WASM_OPT_FEATURES = [
  '--enable-bulk-memory',
  '--enable-multivalue',
  '--enable-mutable-globals',
  '--enable-nontrapping-float-to-int',
  '--enable-reference-types',
  '--enable-sign-ext',
];

class BuildError extends Error {}

function parseArgs(argv) {
  const opts = { check: false };
  for (const arg of argv) {
    if (arg === '--check') opts.check = true;
    else if (arg === '--help' || arg === '-h') {
      console.log(
        'Usage: node scripts/build-wasm.mjs [--check]\n  --check  build and validate only; do not write src/wasm/',
      );
      process.exit(0);
    } else throw new BuildError(`unknown argument: ${arg}`);
  }
  return opts;
}

function run(cmd, args, options = {}) {
  const result = spawnSync(cmd, args, { stdio: 'inherit', ...options });
  if (result.error) throw new BuildError(`failed to run ${cmd}: ${result.error.message}`);
  if (result.status !== 0) throw new BuildError(`${cmd} ${args.join(' ')} exited with status ${result.status}`);
}

function findOnPath(name) {
  const exts = process.platform === 'win32' ? ['.exe', '.cmd', ''] : [''];
  for (const dir of (process.env.PATH ?? '').split(delimiter)) {
    if (!dir) continue;
    for (const ext of exts) {
      const candidate = join(dir, name + ext);
      try {
        accessSync(candidate, fsConstants.X_OK);
        return candidate;
      } catch {
        // not here
      }
    }
  }
  return null;
}

function readLeb128(bytes, offset) {
  let value = 0;
  let shift = 0;
  let pos = offset;
  for (;;) {
    if (pos >= bytes.length) throw new BuildError('truncated LEB128 in wasm binary');
    const byte = bytes[pos++];
    value += (byte & 0x7f) * 2 ** shift;
    shift += 7;
    if ((byte & 0x80) === 0) return { value, next: pos };
    if (shift > 35) throw new BuildError('LEB128 too long in wasm binary');
  }
}

/** Drops custom sections (id 0: names, producers, target_features…); returns a new buffer. */
function stripCustomSections(bytes) {
  const MAGIC = [0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00];
  if (bytes.length < 8 || MAGIC.some((b, i) => bytes[i] !== b)) {
    throw new BuildError('not a WebAssembly 1.0 binary');
  }
  const parts = [bytes.subarray(0, 8)];
  let pos = 8;
  while (pos < bytes.length) {
    const start = pos;
    const id = bytes[pos++];
    const { value: size, next } = readLeb128(bytes, pos);
    const end = next + size;
    if (end > bytes.length) throw new BuildError('truncated section in wasm binary');
    if (id !== 0) parts.push(bytes.subarray(start, end));
    pos = end;
  }
  return Buffer.concat(parts);
}

function wasmOpt(binary, input, name) {
  const dir = mkdtempSync(join(tmpdir(), 'wasm-opt-'));
  try {
    const src = join(dir, `${name}.in.wasm`);
    const dst = join(dir, `${name}.out.wasm`);
    writeFileSync(src, input);
    run(binary, ['-Oz', ...WASM_OPT_FEATURES, '--strip-debug', '--strip-producers', src, '-o', dst]);
    return readFileSync(dst);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

async function validate(name, bytes) {
  const module = await WebAssembly.compile(bytes);
  const imports = WebAssembly.Module.imports(module);
  if (imports.length !== 0) {
    throw new BuildError(
      `${name}.wasm has ${imports.length} import(s): ${imports.map((i) => `${i.module}.${i.name}`).join(', ')}`,
    );
  }
  const exports = WebAssembly.Module.exports(module);
  const actual = exports.map((e) => e.name).sort();
  const expected = ['memory', ...MODULES[name]].sort();
  const missing = expected.filter((e) => !actual.includes(e));
  const extra = actual.filter((e) => !expected.includes(e));
  if (missing.length || extra.length) {
    throw new BuildError(
      `${name}.wasm exports differ from ABI v${ABI_VERSION}: missing [${missing.join(', ')}], unexpected [${extra.join(', ')}]`,
    );
  }
  for (const e of exports) {
    const kind = e.name === 'memory' ? 'memory' : 'function';
    if (e.kind !== kind) throw new BuildError(`${name}.wasm export ${e.name} is a ${e.kind}, expected ${kind}`);
  }
  const { exports: api } = await WebAssembly.instantiate(module, {});
  const version = api.abi_version() >>> 0;
  if (version !== ABI_VERSION) throw new BuildError(`${name}.wasm abi_version() = ${version}, expected ${ABI_VERSION}`);
  const ptr = api.arena_alloc(64, 8) >>> 0;
  if (ptr === 0 || ptr % 8 !== 0 || api.arena_used() >>> 0 < 64)
    throw new BuildError(`${name}.wasm arena smoke test failed`);
  if (api.arena_alloc(8, 3) >>> 0 !== 0) throw new BuildError(`${name}.wasm accepted a non-power-of-two alignment`);
  api.arena_reset();
  if (api.arena_used() >>> 0 !== 0) throw new BuildError(`${name}.wasm arena_reset() did not free the arena`);
}

const fmtKiB = (n) => `${(n / KIB).toFixed(2)} KiB`;

function printTable(rows) {
  const header = ['module', 'raw', 'gzip', 'wasm-opt', 'budget'];
  const body = rows.map((r) => [
    `${r.name}.wasm`,
    `${r.bytes} B (${fmtKiB(r.bytes)})`,
    `${r.gzipBytes} B (${fmtKiB(r.gzipBytes)})`,
    r.optimiser,
    r.status,
  ]);
  const widths = header.map((h, i) => Math.max(h.length, ...body.map((row) => row[i].length)));
  const line = (cells) => cells.map((c, i) => c.padEnd(widths[i])).join('  ');
  console.log(`\n${line(header)}\n${widths.map((w) => '-'.repeat(w)).join('  ')}`);
  for (const row of body) console.log(line(row));
  const total = rows.reduce((a, r) => [a[0] + r.bytes, a[1] + r.gzipBytes], [0, 0]);
  console.log(
    `${'total'.padEnd(widths[0])}  ${`${total[0]} B (${fmtKiB(total[0])})`.padEnd(widths[1])}  ${total[1]} B (${fmtKiB(total[1])})\n`,
  );
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (process.env.RUSTFLAGS) {
    console.warn('build-wasm: RUSTFLAGS is set and overrides wasm/.cargo/config.toml (stack size); output may differ.');
  }

  console.log(`build-wasm: cargo build --release --target ${TARGET} (in ${relative(ROOT, WASM_DIR) || '.'})`);
  run(
    'cargo',
    ['build', '--release', '--locked', '--target', TARGET, '--manifest-path', join(WASM_DIR, 'Cargo.toml')],
    {
      cwd: WASM_DIR,
    },
  );

  const optimiser = findOnPath('wasm-opt');
  const rows = [];
  let failed = false;
  for (const name of Object.keys(MODULES)) {
    let bytes = stripCustomSections(readFileSync(join(ARTIFACT_DIR, `${name}.wasm`)));
    await validate(name, bytes);
    let optimised = 'skipped';
    if (optimiser) {
      const candidate = stripCustomSections(wasmOpt(optimiser, bytes, name));
      await validate(name, candidate);
      if (candidate.length < bytes.length) {
        optimised = `-${bytes.length - candidate.length} B`;
        bytes = candidate;
      } else {
        optimised = 'no gain';
      }
    }
    const gzipBytes = gzipSync(bytes).length;
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    let status = 'ok';
    if (bytes.length > FAIL_BYTES) {
      status = `FAIL > ${fmtKiB(FAIL_BYTES)}`;
      failed = true;
    } else if (bytes.length > WARN_BYTES) {
      status = `warn > ${fmtKiB(WARN_BYTES)}`;
    }
    rows.push({ name, bytes: bytes.length, gzipBytes, sha256, optimiser: optimised, status, data: bytes });
  }

  printTable(rows);
  for (const r of rows)
    if (r.status.startsWith('warn'))
      console.warn(`build-wasm: warning: ${r.name}.wasm exceeds the ${fmtKiB(WARN_BYTES)} soft budget`);
  if (failed) throw new BuildError(`a module exceeds the hard budget of ${fmtKiB(FAIL_BYTES)}`);

  if (opts.check) {
    console.log('build-wasm: --check: all modules valid; src/wasm/ left untouched.');
    return;
  }
  mkdirSync(OUT_DIR, { recursive: true });
  for (const r of rows) writeFileSync(join(OUT_DIR, `${r.name}.wasm`), r.data);
  const manifest = rows.map(({ name, bytes, gzipBytes, sha256 }) => ({ name, bytes, gzipBytes, sha256 }));
  writeFileSync(join(OUT_DIR, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`build-wasm: wrote ${rows.length} modules and manifest.json to ${relative(ROOT, OUT_DIR)}/`);
}

main().catch((err) => {
  console.error(`build-wasm: error: ${err instanceof BuildError ? err.message : (err?.stack ?? err)}`);
  process.exit(1);
});
