#!/usr/bin/env bash
# SessionStart hook for Claude Code cloud sessions (CLAUDE_CODE_REMOTE=true).
#
# Makes `pnpm check`, `pnpm test` and `pnpm build` runnable as soon as the
# session starts:
#   1. Node dependencies at the versions of pnpm-lock.yaml (never rewrites the lockfile);
#   2. the Rust toolchain pinned in wasm/rust-toolchain.toml with the wasm32 target
#      and the rustfmt/clippy components (only when rustup and wasm/ exist).
# Idempotent and quick when everything is already in place (the container state
# is cached after the hook completes). Runs synchronously so no command races it.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

ROOT="${CLAUDE_PROJECT_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)}"
cd "$ROOT"

log() { printf '[session-start] %s\n' "$*" >&2; }

# --- 1. pnpm and node_modules -------------------------------------------------
if ! command -v pnpm >/dev/null 2>&1; then
  # The exact version comes from "packageManager" in package.json.
  log 'pnpm not found: enabling it through corepack'
  corepack enable pnpm
fi

# pnpm writes node_modules/.modules.yaml after a complete install; reinstall when
# it is missing or older than the lockfile.
if [ ! -f node_modules/.modules.yaml ] || [ pnpm-lock.yaml -nt node_modules/.modules.yaml ]; then
  log 'installing Node dependencies (pnpm install --frozen-lockfile)'
  pnpm install --frozen-lockfile --prefer-offline
else
  log 'Node dependencies already installed'
fi

# --- 2. Rust toolchain for the WebAssembly kernels ---------------------------
TOOLCHAIN_FILE=wasm/rust-toolchain.toml
if [ -f "$TOOLCHAIN_FILE" ] && command -v rustup >/dev/null 2>&1; then
  channel="$(sed -n 's/^channel[[:space:]]*=[[:space:]]*"\([^"]*\)".*/\1/p' "$TOOLCHAIN_FILE")"
  # Outputs are captured first: `cmd | grep -q` can SIGPIPE `cmd`, which pipefail reports as failure.
  toolchains="$(rustup toolchain list 2>/dev/null || true)"
  targets="$(rustup target list --installed --toolchain "$channel" 2>/dev/null || true)"
  components="$(rustup component list --installed --toolchain "$channel" 2>/dev/null || true)"
  if [ -z "$channel" ]; then
    log "no channel in $TOOLCHAIN_FILE; skipping the Rust toolchain"
  elif grep -q "^${channel}-" <<<"$toolchains" &&
    grep -qx 'wasm32-unknown-unknown' <<<"$targets" &&
    grep -q '^clippy' <<<"$components" &&
    grep -q '^rustfmt' <<<"$components"; then
    log "Rust $channel with wasm32-unknown-unknown already installed"
  else
    log "installing Rust $channel with wasm32-unknown-unknown, rustfmt and clippy"
    rustup toolchain install "$channel" --profile minimal \
      --target wasm32-unknown-unknown --component rustfmt --component clippy
  fi
fi

log 'ready'
