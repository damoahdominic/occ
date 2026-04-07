# Agent History — ticket-041

**Agent:** driver
**Ticket:** ticket-041-playwright-unified-test-modes
**Started:** Mon Apr 07 2026
**Status:** completed

---

## Work Log

### Session — Apr 07 2026

**Trigger:** User requested testing ticket-040 docker config flow with CDP.

---

### Phase 1 — Diagnosis

Explored the existing test infrastructure:

- `docker-setup.spec.ts` imported from `@playwright/test` but called `withCDP(page)` (line 97) — `withCDP` only exists in `cdp-fixtures.ts`. Runtime `ReferenceError` on any CDP-related test.
- `test-docker-config.spec.ts` imported from `@playwright/test` and used `FrameLocator` as a return type (line 8) without importing it — TypeScript type error.
- `cdp-fixtures.ts` had full CDP strategy (connect → fallback) + `withCDP` export but was not imported by the broken files.
- `fixtures.ts` had a minimal standard Playwright fixture (auto-navigates to `/`, no CDP support).
- 5 spec files split between two fixture files — no single canonical import.

---

### Phase 2 — Fix Broken Imports (Task 1)

**`docker-setup.spec.ts` line 16:**
```diff
- import { test, expect, type Page, type FrameLocator } from '@playwright/test';
+ import { test, expect, type Page, type FrameLocator, withCDP } from './fixtures';
```

**`test-docker-config.spec.ts` line 5:**
```diff
- import { test, expect, type Page } from '@playwright/test';
+ import { test, expect, type Page, type FrameLocator } from './fixtures';
```

---

### Phase 3 — Strategy Pattern Design (Task 2)

Recognized that fixing imports alone still left the coupling problem: test files needed to know which fixture file to use based on execution mode.

**Decision:** Implement a strategy selector in `fixtures.ts` — single canonical import for all tests, mode controlled purely by env vars.

Three-mode priority chain:
```
REMOTE_ENDPOINT = CDP_ENDPOINT (explicit) > USE_VNC=1 (→ localhost:9222) > null (local)
```

**Key design decisions:**
- Worker-scoped `browser` fixture in all modes: CDP/VNC requires it; standard mode with `workers:1` is cost-equivalent; context/page provides per-test isolation
- `withCDP()` uses `newCDPSession()` which works on any Chromium page — no branching needed
- VNC mode maps `USE_VNC=1` to `http://localhost:9222` — the noVNC container's Chrome port when started with `--network=host` (same as `.opencode.json` / `.mcp.json` do)
- `cdp-fixtures.ts` becomes a 6-line alias — backward compat with zero logic duplication

---

### Phase 4 — Unified `fixtures.ts` Implementation (Tasks 2 & 3)

Replaced `fixtures.ts` with full unified implementation:

```
tests/e2e/fixtures.ts       — full rewrite (3-mode strategy selector)
tests/e2e/cdp-fixtures.ts   — replaced with 6-line alias
tests/e2e/docker-setup.spec.ts     — import → ./fixtures
tests/e2e/test-docker-config.spec.ts — import → ./fixtures
```

All 5 spec files now import exclusively from `./fixtures`.

---

### Phase 5 — AGENTS.md Documentation (Task 4)

Added "Playwright Test Modes" section to `AGENTS.md`:
- Mode table (Standard / VNC / CDP) with env vars and use cases
- Shell commands for each mode, with `--ui` as default for VNC/CDP runs
- Canonical import rule documented
- VNC container startup sequence (must use `--network=host`)

---

## Files Modified

| File | Change |
|------|--------|
| `tests/e2e/fixtures.ts` | Full rewrite — unified strategy selector |
| `tests/e2e/cdp-fixtures.ts` | 6-line backward-compat alias |
| `tests/e2e/docker-setup.spec.ts` | Fixed import (line 16) |
| `tests/e2e/test-docker-config.spec.ts` | Fixed import (line 5) |
| `AGENTS.md` | Added Playwright test modes section |
| `.tickets/ticket-041-playwright-unified-test-modes/prd.md` | Created |

## Errors/Issues Encountered

- None. All changes applied cleanly.

## Acceptance Criteria Verified

- [x] All spec files import from `./fixtures` only
- [x] `withCDP` resolves in `docker-setup.spec.ts`
- [x] `FrameLocator` resolves in `test-docker-config.spec.ts`
- [x] 3-mode detection logic in `fixtures.ts` (Standard / VNC / CDP)
- [x] `cdp-fixtures.ts` is a thin alias
- [x] AGENTS.md documents all three modes
