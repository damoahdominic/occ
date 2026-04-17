# Ticket 050 — CI build caching for Windows & macOS

## 2.1 Problem Statement

GitHub Actions builds for Windows and macOS take significantly longer than necessary. Each workflow run performs identical work:
- Re-downloads all npm tarballs (even when `package-lock.json` hasn't changed)
- Re-downloads Electron gyp headers (~100 MB per architecture per run)
- Recompiles all native modules from source (Electron 34.3.2, `build_from_source=true` in `.npmrc`)

The `setup-node` action currently caches only `~/.npm` for `apps/editor/package-lock.json`, missing `apps/editor/build/package-lock.json` entirely and providing no cache for compiled `node_modules/` or Electron headers.

## 2.2 Proposed Solution

Implement per-platform caching across the CI workflow:

1. **Extend npm tarball cache** — Fix `cache-dependency-path` in both `build-macos` and `build-windows` jobs to cover both `apps/editor/package-lock.json` AND `apps/editor/build/package-lock.json`. This caches tarballs for the build toolchain, eliminating re-downloads.

2. **Cache compiled node_modules** — Add `actions/cache` step to cache `apps/editor/node_modules/` and `apps/editor/build/node_modules/` keyed on OS + architecture + combined lock file hash. Pass cache-hit status (`CI_DEPS_READY` env var) to the build target.

3. **Cache Electron gyp headers** — Add `actions/cache` step for `~/.electron-gyp` (macOS) and `~/AppData/Roaming/electron-gyp` (Windows), keyed on OS + architecture + Electron version hash.

4. **Conditional npm ci** — Modify Makefile `build-core` to check `CI_DEPS_READY=true` and skip `npm ci` when `node_modules/` are already cached, using a shell conditional:
   ```makefile
   if [ "$$CI_DEPS_READY" = "true" ]; then \
       echo "==> Skipping npm ci (node_modules cache hit)"; \
   else \
       ( npm ci --ignore-scripts & (cd build && npm ci --ignore-scripts) & wait ); \
   fi && \
   ```

### Architecture

Cache keys guarantee platform isolation:
- `node-modules-${{ runner.os }}-${{ runner.arch }}-${{ hashFiles(...) }}`
  - macOS arm64: `node-modules-macOS-arm64-<hash>`
  - macOS x64: `node-modules-macOS-x64-<hash>`
  - Windows x64: `node-modules-Windows-x64-<hash>`

- `electron-gyp-${{ runner.os }}-${{ runner.arch }}-${{ hashFiles('apps/editor/package.json') }}`
  - Ensures Electron version changes invalidate the cache

Fallback via `restore-keys` allows partial hits on `runner.os-runner.arch-` when lock files change slightly.

## 2.3 Acceptance Criteria

- [ ] Makefile `build-core` respects `CI_DEPS_READY` env var and skips `npm ci` when set to `true`
- [ ] `build-macos` job caches both `package-lock.json` files in npm tarball cache
- [ ] `build-macos` job caches `node_modules/` directories with per-arch key
- [ ] `build-macos` job caches `~/.electron-gyp` with Electron version key
- [ ] `build-windows` job has identical cache setup (different header path)
- [ ] First run on `ci-test` branch: creates cache entries
- [ ] Second run on `ci-test` branch: cache hits and `npm ci` is skipped (confirmed in logs)
- [ ] Windows build total time is measurably lower on warm cache (target: >30% reduction)
- [ ] No regression: build succeeds identically on cold cache (no cache entry)

## 2.4 Technical Considerations

- **Actions/cache v4**: Uses GitHub-provided cache storage (5 GB per repo, LRU eviction). Paths and keys must exactly match across runs for hits.
- **Shell variable escaping**: Makefile uses `$$CI_DEPS_READY` to ensure shell-level variable expansion, not Make-level.
- **node_modules deletion by npm ci**: The conditional skip is necessary because `npm ci` always deletes `node_modules/` before installing. Caching `node_modules/` only helps if `npm ci` is skipped.
- **Extension node_modules**: Not cached (too granular, installed per-extension via `xargs -P8` in `postinstall.js`). Cache focuses on critical path: main editor + build toolchain.
- **Cross-platform header paths**:
  - macOS: `~/.electron-gyp`
  - Windows (bash shell): `~/AppData/Roaming/electron-gyp`

## 2.5 Dependencies

- None. All changes are in CI/CD configuration and Makefile (non-blocking for code changes).

## 2.6 Constraints & Non-Goals

- **Constraint**: Cache storage is limited (5 GB per repo). If cache grows beyond this, GitHub Actions LRU eviction takes effect. Monitor cache size via GHA Settings > Actions > General > Caches.
- **Non-goal**: Do not cache `~/.npm` (setup-node does this already); do not cache extension-specific node_modules (too granular).
- **Non-goal**: Do not modify package.json or Makefile scripts; only add conditional logic.

## 2.7 Success Metrics

- **Cache hit rate**: On repeated runs of the same branch, >90% cache hit rate for `node_modules` (confirmed via GHA cache analytics).
- **Build time savings**:
  - Windows: baseline ~20-25 min (cold), target ~15-18 min (warm, -25% to -35%)
  - macOS: baseline ~15-20 min per arch (cold), target ~12-16 min (warm)
- **No build failures**: All platforms continue to build successfully on cold cache (first run, no entries).

---

## Tasks

### Task 1: Modify Makefile build-core

**Status**: TODO
**Depends on**: None

- [ ] Subtask 1.1: Add conditional check for `CI_DEPS_READY` in `build-core` target
  - **Objective**: Wrap the parallel `npm ci` block with a shell `if` statement that skips when `CI_DEPS_READY=true`
  - **Test**: Run `make build-core` locally with `CI_DEPS_READY=true` and confirm `npm ci` message does not appear
  - **Depends on**: None

### Task 2: Update build-macos workflow job

**Status**: TODO
**Depends on**: Task 1

- [ ] Subtask 2.1: Fix `cache-dependency-path` in Setup Node.js
  - **Objective**: Add `apps/editor/build/package-lock.json` to the multi-line path list
  - **Test**: Validate YAML syntax
  - **Depends on**: None

- [ ] Subtask 2.2: Add Cache node_modules step
  - **Objective**: Insert after Setup Node.js, before Stamp release version. Use OS+arch-specific key with hashFiles.
  - **Test**: Run on ci-test branch, confirm GHA shows cache step
  - **Depends on**: Subtask 2.1

- [ ] Subtask 2.3: Add Cache Electron gyp headers step
  - **Objective**: Insert after Cache node_modules. Cache `~/.electron-gyp` with Electron version key.
  - **Test**: First run creates cache entry; inspect GHA cache storage
  - **Depends on**: Subtask 2.2

- [ ] Subtask 2.4: Pass CI_DEPS_READY to Build macOS step
  - **Objective**: Add `CI_DEPS_READY: ${{ steps.cache-node-modules.outputs.cache-hit }}` to env
  - **Test**: On second run, confirm logs show "Skipping npm ci" message
  - **Depends on**: Subtask 2.3

### Task 3: Update build-windows workflow job

**Status**: TODO
**Depends on**: Task 2

- [ ] Subtask 3.1–3.4: Repeat identical changes to build-windows job
  - **Objective**: Mirror build-macos changes (different Electron header path for Windows)
  - **Test**: Validate YAML; run on ci-test, confirm cache behavior
  - **Depends on**: Subtask 2.4

### Task 4: Test on ci-test branch

**Status**: TODO
**Depends on**: Task 3

- [ ] Subtask 4.1: Push to ci-test and run first build
  - **Objective**: Populate cache (no hits expected)
  - **Test**: Workflow completes; GHA shows cache created entries
  - **Depends on**: Task 3

- [ ] Subtask 4.2: Re-run same branch
  - **Objective**: Trigger cache hits
  - **Test**: Logs show "Skipping npm ci" message in build-core step; cache-hit: true for both cache steps
  - **Depends on**: Subtask 4.1

- [ ] Subtask 4.3: Measure build time before/after
  - **Objective**: Document wall-clock time for Windows job (cold vs warm cache)
  - **Test**: Compare job duration from first vs second run
  - **Depends on**: Subtask 4.2

## Notes

- Cache keys use `hashFiles()` to detect lock file changes. If lock files change, cache is automatically invalidated.
- Extensions node_modules (installed via `postinstall.js`) are NOT cached to keep cache size manageable. These install quickly in parallel (xargs -P8).
- The `restore-keys` fallback allows partial cache hits when lock files change slightly (e.g., one dependency version bump).

## Root Cause & Fix

**Root Cause**: 
- npm tarball cache only covered main `package-lock.json`, not the separate `build/` subdirectory.
- `node_modules/` was never cached, requiring full recompilation of native modules (Electron headers + `build_from_source=true`).
- Electron gyp headers were re-downloaded on every run (~100 MB waste).

**Fix**: 
- Extended caching to all lock files and compiled artifacts.
- Added conditional `npm ci` skip to avoid re-deleting cached `node_modules/`.
- Ensured cache keys are platform-specific (OS + arch) to prevent cross-platform binary incompatibility.
