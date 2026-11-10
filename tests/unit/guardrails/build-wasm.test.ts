/** The deployment fallback must use complete, current and validated kernels without Rust. */
import { spawnSync } from 'node:child_process';
import { chmodSync, cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const ARTIFACTS = ['signal.wasm', 'information.wasm', 'dynamics.wasm', 'manifest.json', 'sources.json'];
const temporary: string[] = [];

const fixture = (): string => {
  const dir = mkdtempSync(path.join(tmpdir(), 'ft-build-wasm-'));
  temporary.push(dir);
  mkdirSync(path.join(dir, 'scripts'));
  cpSync(path.join(ROOT, 'scripts/build-wasm.mjs'), path.join(dir, 'scripts/build-wasm.mjs'));
  cpSync(path.join(ROOT, 'wasm'), path.join(dir, 'wasm'), {
    recursive: true,
    filter: (source) => source !== path.join(ROOT, 'wasm/target'),
  });
  cpSync(path.join(ROOT, 'src/wasm'), path.join(dir, 'src/wasm'), { recursive: true });
  return dir;
};

interface Run {
  readonly code: number;
  readonly out: string;
}

const run = (dir: string, args: readonly string[] = [], searchPath = ''): Run => {
  const result = spawnSync(process.execPath, [path.join(dir, 'scripts/build-wasm.mjs'), ...args], {
    cwd: dir,
    env: { ...process.env, PATH: searchPath, RUSTFLAGS: '', FORCE_COLOR: '0', NO_COLOR: '1' },
    encoding: 'utf8',
    timeout: 15_000,
  });
  return { code: result.status ?? -1, out: `${result.stdout}${result.stderr}` };
};

const artifactBytes = (dir: string): readonly Buffer[] =>
  ARTIFACTS.map((name) => readFileSync(path.join(dir, 'src/wasm', name)));

const failingCargo = (dir: string): string => {
  const bin = path.join(dir, 'bin');
  mkdirSync(bin);
  const cargo = path.join(bin, 'cargo');
  writeFileSync(cargo, '#!/bin/sh\nexit 42\n');
  chmodSync(cargo, 0o755);
  return bin;
};

afterAll(() => {
  for (const dir of temporary) rmSync(dir, { recursive: true, force: true });
});

describe('build-wasm prebuilt deployment', () => {
  it('validates and reuses the committed kernels when cargo is absent', () => {
    const dir = fixture();
    const before = artifactBytes(dir);
    const result = run(dir);
    expect(result.out).toContain('prebuilt');
    expect(result.code, result.out).toBe(0);
    expect(artifactBytes(dir)).toEqual(before);
  });

  it('keeps every artifact unchanged in --check mode without cargo', () => {
    const dir = fixture();
    const before = artifactBytes(dir);
    const result = run(dir, ['--check']);
    expect(result.code, result.out).toBe(0);
    expect(artifactBytes(dir)).toEqual(before);
  });

  it('honours --prebuilt even when cargo is on PATH', () => {
    const dir = fixture();
    const result = run(dir, ['--prebuilt'], failingCargo(dir));
    expect(result.code, result.out).toBe(0);
  });

  it('requires cargo in --rebuild mode', () => {
    const result = run(fixture(), ['--rebuild']);
    expect(result.code).toBe(1);
    expect(result.out).toContain('cargo');
  });

  it('does not hide a real cargo failure behind the prebuilt fallback', () => {
    const dir = fixture();
    const result = run(dir, [], failingCargo(dir));
    expect(result.code).toBe(1);
    expect(result.out).toContain('exited with status 42');
  });

  it.each(['signal.wasm', 'manifest.json', 'sources.json'])('rejects a missing %s', (name) => {
    const dir = fixture();
    rmSync(path.join(dir, 'src/wasm', name));
    const result = run(dir);
    expect(result.code).toBe(1);
    expect(result.out).toContain(name);
  });

  it('rejects a corrupted binary', () => {
    const dir = fixture();
    writeFileSync(path.join(dir, 'src/wasm/signal.wasm'), 'corrupted WebAssembly');
    expect(run(dir).code).toBe(1);
  });

  it('rejects a manifest that no longer describes the binaries', () => {
    const dir = fixture();
    const manifest = path.join(dir, 'src/wasm/manifest.json');
    writeFileSync(manifest, readFileSync(manifest, 'utf8').replace(/"sha256": "[a-f0-9]+"/, '"sha256": "bad"'));
    expect(run(dir).code).toBe(1);
  });

  it.each(['wasm/crates/signal/src/lib.rs', 'wasm/Cargo.toml', 'wasm/.cargo/config.toml'])(
    'rejects kernels compiled before %s changed',
    (name) => {
      const dir = fixture();
      const source = path.join(dir, name);
      writeFileSync(source, `${readFileSync(source, 'utf8')}\n`);
      expect(run(dir).code).toBe(1);
    },
  );
});
