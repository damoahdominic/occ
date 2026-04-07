# ticket-041: Playwright Unified Test Modes (Standard / VNC / CDP)

## Problem Statement

The Playwright E2E test suite for ticket-040 (Docker config flow) had two structural problems that made test execution fragile:

1. **Broken imports**: `docker-setup.spec.ts` called `withCDP(page)` but imported from `@playwright/test`, which doesn't export it. `test-docker-config.spec.ts` used `FrameLocator` as a return type without importing it. Both would crash at runtime.

2. **Fixture coupling**: Test files imported from either `./cdp-fixtures` or `@playwright/test` depending on which execution mode was intended. Switching between standard headless, CDP, and VNC-connected browser modes required editing the import line in every test file — violating the principle that test logic should be decoupled from execution strategy.

## Proposed Solution

Implement a **strategy selector pattern** in a single canonical `fixtures.ts` that all test files import from. The execution mode is selected entirely by environment variables at run time — no test file changes needed.

Three modes via one env-var priority chain:

```
REMOTE_ENDPOINT = CDP_ENDPOINT (explicit) > USE_VNC=1 (→ localhost:9222) > null (local launch)
```

`cdp-fixtures.ts` becomes a thin re-export alias for backward compatibility.

## Acceptance Criteria

- [x] All spec files import exclusively from `./fixtures` — no imports from `./cdp-fixtures` or `@playwright/test` directly
- [x] `withCDP()` is exported from `./fixtures` and resolves in all test files that use it
- [x] `FrameLocator` type is exported from `./fixtures` and resolves in `test-docker-config.spec.ts`
- [x] Standard mode (`no env vars`): launches local headless Chromium, no external dependency
- [x] VNC mode (`USE_VNC=1`): connects to noVNC container's Chrome on `localhost:9222` via CDP
- [x] CDP mode (`CDP_ENDPOINT=<url>`): connects to arbitrary Chrome DevTools endpoint; takes precedence over `USE_VNC`
- [x] All three modes fall back gracefully to local Chromium if remote endpoint is unreachable
- [x] `withCDP()` helper works in all three modes (uses `newCDPSession` which works on any Chromium page)
- [x] `cdp-fixtures.ts` is a thin alias — importing from it still works (backward compat)
- [x] AGENTS.md documents all three modes with exact shell commands

## Technical Considerations

### Strategy Pattern in `fixtures.ts`

Mode detection is evaluated once at module load time per worker:

```ts
const VNC_DEFAULT_ENDPOINT = 'http://localhost:9222';
const REMOTE_ENDPOINT: string | null =
  process.env.CDP_ENDPOINT ??
  (process.env.USE_VNC ? VNC_DEFAULT_ENDPOINT : null);
```

The `browser` fixture is **worker-scoped** in all modes:
- CDP/VNC mode requires worker scope — reconnecting per-test to an external browser is slow and semantically wrong
- Standard mode with `workers: 1` makes worker scope cost-equivalent to test scope
- Per-test isolation is achieved at the `context` level (fresh context per test)

### VNC Mode Requirements

The noVNC container must be started with `--network=host` to expose Chrome's remote debugging port on `localhost:9222`:

```bash
docker run -d --name playwright-novnc --network host \
  -e MCP_BROWSER=chromium \
  ghcr.io/xtr-dev/mcp-playwright-novnc:latest
```

This is already how `.opencode.json` and `.mcp.json` start the container, so VNC mode works out of the box when those configs are in use.

### `withCDP()` in All Modes

`page.context().newCDPSession(page)` is available for any Playwright Chromium page regardless of launch method. The helper works in standard, VNC, and CDP modes identically.

### Config Files

Both `playwright.config.ts` (standard) and `playwright.remote-debugging.config.ts` (remote/VNC/CDP) work with the unified fixtures. Mode is controlled by env vars, not by config file choice.

## Tasks

- [x] Task 1: Fix broken imports in docker test files
  - **Problem**: `docker-setup.spec.ts` and `test-docker-config.spec.ts` imported from wrong modules
  - **Test**: TypeScript compiles without errors; `withCDP` and `FrameLocator` resolve
  - **Subtasks**:
    - [x] Subtask 1.1: Fix `docker-setup.spec.ts` import to include `withCDP`
      - **Objective**: Change import source so `withCDP` resolves
      - **Test**: `grep "withCDP" docker-setup.spec.ts` shows import; no TS error
    - [x] Subtask 1.2: Fix `test-docker-config.spec.ts` import to include `FrameLocator`
      - **Objective**: Add missing `FrameLocator` type to import
      - **Test**: `grep "FrameLocator" test-docker-config.spec.ts` shows import; no TS error

- [x] Task 2: Implement unified `fixtures.ts` strategy selector
  - **Problem**: Two fixture files with divergent behavior forced test files to know their execution mode
  - **Test**: All 5 spec files import only from `./fixtures`; mode switches by env var alone
  - **Subtasks**:
    - [x] Subtask 2.1: Replace `fixtures.ts` with unified strategy selector
      - **Objective**: Merge cdp-fixtures logic into fixtures.ts with 3-mode detection
      - **Test**: Standard mode launches local Chromium; VNC/CDP mode connects via CDP
    - [x] Subtask 2.2: Add `USE_VNC=1` mode pointing to `localhost:9222`
      - **Objective**: `USE_VNC=1` → `REMOTE_ENDPOINT = http://localhost:9222`
      - **Test**: `USE_VNC=1` sets `REMOTE_ENDPOINT` to VNC default; `CDP_ENDPOINT` overrides it
    - [x] Subtask 2.3: Make `cdp-fixtures.ts` a backward-compat alias
      - **Objective**: Re-export all symbols from `./fixtures`
      - **Test**: Importing from `./cdp-fixtures` still resolves `test`, `expect`, `withCDP`

- [x] Task 3: Update all spec file imports to canonical `./fixtures`
  - **Problem**: docker spec files pointed at `./cdp-fixtures`; consolidate to one import
  - **Test**: `grep -r "from './cdp-fixtures'" tests/e2e/` returns no results
  - **Subtasks**:
    - [x] Subtask 3.1: Update `docker-setup.spec.ts` import
    - [x] Subtask 3.2: Update `test-docker-config.spec.ts` import

- [x] Task 4: Document all three modes in AGENTS.md
  - **Problem**: No clear documentation of how to run tests in different modes
  - **Test**: AGENTS.md contains mode table and shell commands for all 3 modes
  - **Subtasks**:
    - [x] Subtask 4.1: Add "Playwright Test Modes" section with mode table and commands
    - [x] Subtask 4.2: Document `--ui` flag as default for VNC/CDP runs

## Functionality Proof

### Verify imports are unified

```bash
grep -n "^import" tests/e2e/*.spec.ts
# Expected: every line ends with from './fixtures'
# No references to '@playwright/test' or './cdp-fixtures' in spec files
```

### Verify cdp-fixtures.ts is a thin alias

```bash
wc -l tests/e2e/cdp-fixtures.ts
# Expected: ~6 lines (comment + one export line)

grep "from './fixtures'" tests/e2e/cdp-fixtures.ts
# Expected: matches — re-exports from ./fixtures
```

### Standard mode — local headless

```bash
npx playwright test --config=playwright.config.ts tests/e2e/smoke.spec.ts
# Passes with no external dependencies
```

### VNC mode — headed browser in noVNC container

```bash
# 1. Start container (host networking required)
docker run -d --name playwright-novnc --network host \
  -e MCP_BROWSER=chromium ghcr.io/xtr-dev/mcp-playwright-novnc:latest

# 2. Run docker config flow tests with live browser view
USE_VNC=1 npx playwright test --ui \
  --config=playwright.remote-debugging.config.ts \
  tests/e2e/docker-setup.spec.ts

# Watch at http://localhost:6080/vnc.html

# 3. Cleanup
docker stop playwright-novnc && docker rm playwright-novnc
```

### CDP mode — custom endpoint

```bash
CDP_ENDPOINT=http://localhost:9222 \
  npx playwright test --config=playwright.remote-debugging.config.ts \
  tests/e2e/docker-setup.spec.ts
```

### Mode detection logic proof

```bash
node -e "
const CDP_ENDPOINT = process.env.CDP_ENDPOINT;
const USE_VNC = process.env.USE_VNC;
const VNC_DEFAULT = 'http://localhost:9222';
const REMOTE = CDP_ENDPOINT ?? (USE_VNC ? VNC_DEFAULT : null);
console.log('REMOTE_ENDPOINT:', REMOTE);
"
# No env vars     → REMOTE_ENDPOINT: null
# USE_VNC=1       → REMOTE_ENDPOINT: http://localhost:9222
# CDP_ENDPOINT=X  → REMOTE_ENDPOINT: X
# Both set        → REMOTE_ENDPOINT: CDP_ENDPOINT (takes precedence)
```

## Dependencies

- **Depends on ticket-040**: Docker config flow implementation (the tests being verified here test ticket-040's 3-step modal)

## Files Modified

| File | Change |
|------|--------|
| `tests/e2e/fixtures.ts` | Full rewrite — unified strategy selector |
| `tests/e2e/cdp-fixtures.ts` | Replaced with 6-line backward-compat alias |
| `tests/e2e/docker-setup.spec.ts` | Fixed import line (line 16) |
| `tests/e2e/test-docker-config.spec.ts` | Fixed import line (line 5) |
| `AGENTS.md` | Added "Playwright Test Modes" section with 3-mode table + commands |
