## CI + GitHub Pages actions for Astro (pnpm) + Rust→wasm32: verified pins as of 2026-10-11

I got every SHA from `git ls-remote` and took the `^{}` peeled commit wherever the tag is annotated. Each pinned SHA was then fetched with `git fetch --depth 1` to confirm it is a real commit and get its date. I read each `action.yml` with curl from raw.githubusercontent.com at the pinned SHA, not through WebFetch. The GitHub REST API was blocked in this session, so I could not check the release pages, including prerelease flags.

| Action | Tag | Pin SHA (commit; peeled if annotated) | Commit date | Runtime | Key inputs / outputs |
|---|---|---|---|---|---|
| actions/checkout | v7.0.1 (lightweight; `v7` = same) | `3d3c42e5aac5ba805825da76410c181273ba90b1` | 2026-07-17 | node24 | in: `fetch-depth`, `persist-credentials` (default true; set false), `allow-unsafe-pr-checkout` (new in v7, default false), `lfs`, `submodules`, `sparse-checkout`. out: `ref`, `commit` |
| actions/setup-node | v7.1.0 (lightweight; `v7` = same) | `949feb2413d6458794dcd2491c4babbbce0c15c1` | 2026-10-07 | node24 | in: `node-version`, `node-version-file`, `cache` (npm/yarn/pnpm), `cache-dependency-path`, `package-manager-cache` (default true), `check-latest`, `registry-url`. out: `cache-hit`, `cache-primary-key`, `cache-matched-key`, `node-version` |
| pnpm/action-setup | v6.1.0 (annotated; tag object `d9184bf108216479bc5a137cc391f4d7b14c870b`) | `ea17c68df8912ef543352723c149a84f56e3d413` | 2026-09-05 | node24 (main + post) | in: `version`, `dest`, `run_install` (default null), `cache` (default false), `cache_dependency_path` (default `pnpm-lock.yaml`), `package_json_file` (default `package.json`), `standalone`. out: `dest`, `bin_dest` |
| actions/configure-pages | v6.0.0 (lightweight; `v6` = same) | `45bfe0192ca1faeb007ade9deae92b16b8254a0d` | 2026-03-24 | node24 | in: `static_site_generator` (only nuxt/next/gatsby/sveltekit, no astro), `generator_config_file`, `token`, `enablement` (default false). out: `base_url`, `origin`, `host`, `base_path` (all four confirmed in action.yml) |
| actions/upload-pages-artifact | v5.0.0 (lightweight; `v5` = same) | `fc324d3547104276b827a68afc52ff2a11cc49c9` | 2026-04-08 | composite | in: `name` (default `github-pages`), `path` (required, default `_site/`), `retention-days` (default `1`), `include-hidden-files` (default false; `.git` and `.github` are always excluded). out: `artifact_id` |
| actions/deploy-pages | v5.0.1 (lightweight; `v5` = same) | `368f82528645a54fb793d4d04e342629a3f51346` | 2026-09-01 | node24 | in: `token`, `timeout` (600000), `error_count` (10), `reporting_interval` (5000), `artifact_name` (`github-pages`), `preview` (alpha). out: `page_url` |
| actions/cache | v6.1.0 (lightweight; `v6` = same) | `55cc8345863c7cc4c66a329aec7e433d2d1c52a9` | 2026-06-23 | node24 | in: `path`, `key`, `restore-keys`, `lookup-only`, `fail-on-cache-miss`, `enableCrossOsArchive`; `save-always` is deprecated. out: `cache-hit`. Needs runner 2.327.1 or newer |
| actions/upload-artifact | v7.0.2 (lightweight; `v7` = same) | `cf430e030ddbb5b0abf93d22962f4752f3646cd9` | 2026-10-07 | node24 | in: `name`, `path`, `if-no-files-found` (default warn), `retention-days`, `compression-level` (6), `overwrite`, `include-hidden-files`, `archive` (new, default true). out: `artifact-id`, `artifact-url`, `artifact-digest` |
| dtolnay/rust-toolchain | branch `master` (the `v1` tag points to the same commit) | `e2a55d2ffb04f378e9626c28d38b36d230d1e12f` | 2026-10-08 | composite | in: `toolchain` (required at master), `targets`/`target`, `components`. out: `cachekey`, `name` |
| Swatinem/rust-cache | v2.9.2 (annotated; tag object `63fed3e2fecf6f7b51dc6f043341b79ef82a9ae7`; `v2^{}` = same) | `6323deb102c322ba6fcbdcafc7e3dddab59af2b6` | 2026-08-06 | node24 | in: `prefix-key`, `shared-key`, `key`, `workspaces`, `cache-directories`, `cache-targets`, `cache-on-failure`, `cache-all-crates`, `save-if`, `cache-bin`, `lookup-only`, `cache-provider`. out: `cache-hit` |
| step-security/harden-runner (optional) | v2.22.1 (lightweight; `v2` = same) | `ccd8616d44fd3846e67624a50d5aad6d37bf2d25` | 2026-10-07 | node24 (pre, main, post) | in: `egress-policy` (**default `block`** in action.yml), `allowed-endpoints`, `denied-endpoints`, `disable-sudo-and-containers`, `disable-telemetry`, `disable-file-monitoring`, `policy`, `use-policy-store` |
| github/codeql-action init/analyze | v4.38.3 (annotated; tag object `cee97f86b972a3ded3c58d04148362b193ddc518`; `v4^{}` = same) | `24c54180a607b1449ed407dd24f251e4e9147c8d` | 2026-10-08 | node24 (init, analyze and upload-sarif) | Use `github/codeql-action/init@<sha>` and `.../analyze@<sha>`. init in: `languages`, `build-mode` (none/autobuild/manual), `queries`, `config-file`, `config`, `packs`. init out: `codeql-path`, `codeql-version` |
| github/codeql-action v3 (legacy) | v3.38.3 (annotated; tag object `66e692051da0915b214c5158091a226015d453f4`; `v3^{}` = same) | `9f759ee644a3e7c15c1390abf49868036c00067b` | 2026-10-08 | — | v3 is deprecated in December 2026, together with GHES 3.19. Use v4. |

## Older fallbacks for the very recent releases
Several pins are less than 14 days old. If you only use releases older than that, these are the previous versions:
- **setup-node:** v7.0.0 → `820762786026740c76f36085b0efc47a31fe5020` (2026-07-13).
- **upload-artifact:** v7.0.1 → `043fb46d1a93c77aae656e7c1c64a875d1fc6a0a` (2026-04-10).
- **codeql-action:** v4.38.2 peels to `2892aa5e19bbd11bc0cff5427e3b750a04d9e3c2` (2026-09-24).
- **harden-runner:** v2.22.0 → `351661ca32ac09a36dc5ee2d536e3128f2a3c8ed` (2026-10-05) is also new. Its last older tag is v2.21.1 → `e14015d583714f6e62063499dc959a02595150a1`, but I did not fetch that one's date.
- **rust-toolchain:** master was last changed on 2026-10-08 by PR #187, "Safely handle action inputs", which is a security fix. Use the newest master.

## Notes on each item

**(a) configure-pages outputs.** Confirmed at `45bfe01`: `base_url` (for example `https://octocat.github.io/my-repo`), `origin`, `host` and `base_path` (`/my-repo` or empty).
- There is no Astro option in `static_site_generator`, so pass the values in yourself, for example `ASTRO_SITE: ${{ steps.pages.outputs.origin }}` and `ASTRO_BASE: ${{ steps.pages.outputs.base_path }}`.
- For a user site like flaviotinoco.github.io, `base_path` is empty.

**(b) upload-pages-artifact inputs.** The default `path` is `_site/`, but Astro builds to `dist/`, so set `path: dist` (or `./dist`).
- Hidden files (dotfiles) are left out unless you set `include-hidden-files: true`. That matters if the site has a `.well-known/` folder.
- The action tars the folder with `--dereference --hard-dereference`. It then calls `actions/upload-artifact@bbbca2ddaa5d8feaa63e36b76fdaad77386f024f` (v7.0.0) and fails if no files are found.

**(c) deploy-pages permissions and environment.**
- The deploy job needs at least `permissions: { pages: write, id-token: write }`.
- It should run in `environment: { name: github-pages, url: ${{ steps.deployment.outputs.page_url }} }`. The README recommends that environment and says GitHub protects it by default.
- The default `artifact_name` is `github-pages`.
- The action sets the env var `GITHUB_PAGES=true`.

**(d) Runtimes and the Node 20 deprecation.** Every JavaScript action in the table uses `node24`. The rest are composite actions. None use node20, so you should see no deprecation warnings.
- Runners switched to Node 24 by default on 2026-06-16.
- GitHub removed Node 20 on 2026-09-23, and the `ACTIONS_ALLOW_USE_UNSECURE_NODE_VERSION` opt-out no longer works.
- Node 24 actions need runner v2.327.1 or newer.
- CodeQL v3 still runs (it is deprecated, not removed) but logs warnings, so use v4.

**(e) pnpm/action-setup and `packageManager`.** Yes, it reads the version automatically. I checked `src/install-pnpm/run.ts` at `ea17c68`.
- If the `version` input is omitted, it reads `devEngines.packageManager` first, then `packageManager` (`pnpm@X[+hash]`, with the hash stripped). It installs a bundled pnpm 11.25.0 first, then runs `pnpm self-update` to that version.
- If `version` is set and differs from `packageManager` as a plain string, it throws "Multiple versions of pnpm specified". For example `10` against `10.28.0` fails. **Omit `version`.**
- `actions/checkout` must run before it, otherwise it fails with "No workspace is found".
- If `node` on PATH is older than 22.13, it uses `@pnpm/exe` instead.
- It does not install Node. Put it before `actions/setup-node` when using `cache: pnpm`, because setup-node needs `pnpm` on PATH. Since setup-node v6, pnpm caching only happens if you set `cache: pnpm`.
- Your repo's package.json has `"packageManager": "pnpm@10.28.0"` and `engines.node >=22.12.0`. There are no workflows yet.
- `pnpm/setup` (v3.1.1, peeled `a0881977cd8ea73b1ed212236c99ca10dcc80cf4`) requires pnpm 11 or newer, so it does not apply to pnpm 10.

**rust-toolchain pin.** Pin the master SHA `e2a55d2…` with `toolchain: stable` (or an exact version such as `1.xx.0`) and `targets: wasm32-unknown-unknown`.
- Do not pin the `stable` branch SHA (`686976e191b89faba57d3206551f0f330d8cb249`). That branch has an extra commit that changes the `toolchain` default to `stable`, and that commit is not in master's history.
- The README says a SHA outside master's history "will eventually get garbage-collected", which breaks the workflow.

**harden-runner.** Set `egress-policy: audit` explicitly to start with, because the action.yml default is `block`.

**codeql-action.**
- The job needs `security-events: write`, and also `contents: read` and `actions: read` for private repos.
- The languages are `javascript-typescript` and `rust`, both with `build-mode: none`.
- I did not check Rust's build-mode support against the CodeQL docs.

**(f) Playwright and axe.**
- Versions on npm today:
  - `@playwright/test` 1.64.0 (published 2026-10-07; same for `playwright`; engines `node >=20`).
  - `@axe-core/playwright` 4.13.0 (depends on `axe-core ~4.13.0`; peer `playwright-core >=1.0.0`).
  - `axe-core` latest is 4.14.0.
- **Install command:** `pnpm exec playwright install --with-deps chromium`. Use `pnpm exec` rather than `npx` so it uses the locked version. For headless-only CI, add `--only-shell` to download only the smaller chromium-headless-shell, which is Playwright's default headless browser.
- **Browser caching:** Playwright's CI docs say "Caching browser binaries is not recommended". If you cache `~/.cache/ms-playwright` anyway, key it on the Playwright version and still run `pnpm exec playwright install-deps chromium` when the cache hits, because the OS packages are not cached.

**Other versions you may need.**
- `pnpm` latest is 12.11.2; `latest-10` is 10.34.6, and the repo pins 10.28.0.
- `astro` is 7.3.8 (engines `node >=22.12.0`).
- `wasm-pack` is 0.15.0.
- Node: 24.21.0 is Active LTS ("Krypton"), 22.23.3 is Maintenance LTS ("Jod"), and 26.11.1 is Current, not yet LTS as of 2026-10-07. Use `node-version: 24`.

Sources:
- [Deprecation of Node 20 on GitHub Actions runners](https://github.blog/changelog/2026-09-23-deprecation-of-node-20-on-github-actions-runners/)
- [Node 20 is no longer available in GitHub Actions](https://github.blog/changelog/2026-09-23-node-20-is-no-longer-available-in-github-actions)
- [Upcoming deprecation of CodeQL Action v3](https://github.blog/changelog/2025-10-28-upcoming-deprecation-of-codeql-action-v3/)
- [Playwright CI docs](https://playwright.dev/docs/ci)
- [Playwright browsers docs](https://playwright.dev/docs/browsers)

The action.yml files and READMEs are in /tmp/claude-0/-home-user-flaviotinoco-github-io/23f805df-effb-5dc6-8ab4-4233b20112f7/scratchpad/ay/ (READMEs under docs/). The pnpm/action-setup source is in /tmp/claude-0/-home-user-flaviotinoco-github-io/23f805df-effb-5dc6-8ab4-4233b20112f7/scratchpad/src-pnpm/.
