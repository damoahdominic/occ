# E2E Test Execution Order (Optimized)

**Document**: Phase 3 Task 1 — E2E Test Listing & Optimization  
**Total Tests Found**: 14 spec files  
**Optimization Goal**: Minimize flakiness by running setup tests first, maximize parallelism for independent tests

---

## Test Inventory

### Phase 1: Sequential Setup (Foundational)
These tests establish the baseline environment. **All other tests depend on these passing first.**

| File | Type | Description | Dependencies | Parallel-Safe |
|------|------|-------------|--------------|--------------|
| `onboarding-auth.spec.ts` | Auth/Setup | User login, session creation, auth state handling | None (first) | ❌ No |
| `home-panel.spec.ts` | UI/Setup | Home panel rendering, iframe structure, command palette | onboarding-auth | ❌ No |

**Rationale**: Auth must complete before any tests can access authenticated features. Home panel tests validate the webview infrastructure that all other tests depend on.

---

### Phase 2: Gateway & Docker Setup (Dependencies on Phase 1)
Gateway and Docker provisioning tests. **These can run in parallel with each other** but must follow Phase 1.

| File | Type | Description | Dependencies | Parallel-Safe |
|------|------|-------------|--------------|--------------|
| `openclaw-installation.spec.ts` | Setup | OpenClaw binary installation verification | Phase 1 | ✅ Yes (Phase 2) |
| `gateway-management.spec.ts` | Gateway | Start/stop gateway, status updates | Phase 1 + openclaw-installation | ✅ Yes (Phase 2) |
| `gateway-proxy-paths.spec.ts` | Gateway | Custom proxy URL configuration | Phase 1 + gateway-management | ✅ Yes (Phase 2) |
| `docker-setup.spec.ts` | Docker | Docker card clicks, config flow (3 steps) | Phase 1 | ✅ Yes (Phase 2) |
| `docker-to-ide-flow.spec.ts` | Docker | Full Docker→Config→Provision→IDE flow | Phase 1 + docker-setup | ✅ Yes (Phase 2) |

**Rationale**: OpenClaw must be installed before gateway can start. Docker tests can run independently in parallel. All depend on auth/home panel being ready.

---

### Phase 3: Editor & Balance Features (Dependencies on Phase 1)
Feature tests for editor functionality, balance polling, and settings.

| File | Type | Description | Dependencies | Parallel-Safe |
|------|------|-------------|--------------|--------------|
| `navigation.spec.ts` | Editor | Activity bar, sidebar navigation | Phase 1 | ✅ Yes (Phase 3) |
| `balance-polling.spec.ts` | Balance | Balance display, polling, updates | Phase 1 (auth) | ✅ Yes (Phase 3) |
| `settings-occ-credits.spec.ts` | Settings | OCC Credits card, settings panel | Phase 1 (auth) | ✅ Yes (Phase 3) |

**Rationale**: These are isolated feature tests that don't depend on gateway/docker completion. They only need auth/home panel infrastructure.

---

### Phase 4: Integration & Smoke (No Hard Dependencies)
Final validation tests that can run last without blocking others.

| File | Type | Description | Dependencies | Parallel-Safe |
|------|------|-------------|--------------|--------------|
| `smoke.spec.ts` | Smoke | Server 200 response, workbench bootstrap, no JS errors | None (but runs last) | ✅ Yes (Phase 4) |
| `ci-integration.spec.ts` | CI | Test runner functionality | None (but runs last) | ✅ Yes (Phase 4) |
| `snapshots.spec.ts` | Visual | Visual regression baselines | Phase 1 (home panel ready) | ✅ Yes (Phase 4) |
| `test-docker-config.spec.ts` | Manual/Config | Docker config manual test, CDP remote debugging | Phase 1 | ✅ Yes (Phase 4) |

**Rationale**: Smoke tests are basic checks that don't test features — run last. Snapshots depend on home panel being ready but can run in parallel. CI integration is runner validation.

---

## Execution Plan

### Recommended Command Structure

#### Phase 1: Sequential (required for all other phases)
```bash
npx playwright test \
  tests/e2e/onboarding-auth.spec.ts \
  tests/e2e/home-panel.spec.ts \
  --workers=1 \
  --timeout=120000
```

**Expected time**: ~3-5 minutes (depends on auth/home panel rendering)

#### Phase 2: Gateway & Docker (parallel, depends on Phase 1)
```bash
npx playwright test \
  tests/e2e/openclaw-installation.spec.ts \
  tests/e2e/gateway-management.spec.ts \
  tests/e2e/gateway-proxy-paths.spec.ts \
  tests/e2e/docker-setup.spec.ts \
  tests/e2e/docker-to-ide-flow.spec.ts \
  --workers=4 \
  --timeout=120000
```

**Expected time**: ~5-10 minutes (with 4 workers)  
**Note**: docker-to-ide-flow is the longest (full flow test); consider running it separately if needed

#### Phase 3: Editor & Balance (parallel, depends on Phase 1)
```bash
npx playwright test \
  tests/e2e/navigation.spec.ts \
  tests/e2e/balance-polling.spec.ts \
  tests/e2e/settings-occ-credits.spec.ts \
  --workers=4 \
  --timeout=120000
```

**Expected time**: ~2-4 minutes (with 4 workers)

#### Phase 4: Integration & Smoke (parallel, runs last)
```bash
npx playwright test \
  tests/e2e/smoke.spec.ts \
  tests/e2e/ci-integration.spec.ts \
  tests/e2e/snapshots.spec.ts \
  tests/e2e/test-docker-config.spec.ts \
  --workers=4 \
  --timeout=120000
```

**Expected time**: ~2-4 minutes (with 4 workers)

---

## Full Sequential Pipeline

To run all tests in order (simplest CI/CD approach):

```bash
# Phase 1: Setup (1 worker, 3-5 min)
npx playwright test tests/e2e/onboarding-auth.spec.ts tests/e2e/home-panel.spec.ts --workers=1

# Phase 2: Gateway/Docker (4 workers, 5-10 min)
npx playwright test tests/e2e/openclaw-installation.spec.ts tests/e2e/gateway-management.spec.ts tests/e2e/gateway-proxy-paths.spec.ts tests/e2e/docker-setup.spec.ts tests/e2e/docker-to-ide-flow.spec.ts --workers=4

# Phase 3: Editor/Balance (4 workers, 2-4 min)
npx playwright test tests/e2e/navigation.spec.ts tests/e2e/balance-polling.spec.ts tests/e2e/settings-occ-credits.spec.ts --workers=4

# Phase 4: Smoke/Integration (4 workers, 2-4 min)
npx playwright test tests/e2e/smoke.spec.ts tests/e2e/ci-integration.spec.ts tests/e2e/snapshots.spec.ts tests/e2e/test-docker-config.spec.ts --workers=4
```

**Total estimated time**: ~12-23 minutes (depends on system speed and network)

---

## Continuous Integration (GitHub Actions)

For GitHub Actions, use the phase-based approach with `continue-on-error`:

```yaml
# .github/workflows/e2e-tests.yml
jobs:
  phase-1-setup:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: microsoft/playwright@v1
      - run: npm ci
      - run: |
          npx playwright test \
            tests/e2e/onboarding-auth.spec.ts \
            tests/e2e/home-panel.spec.ts \
            --workers=1

  phase-2-gateway-docker:
    needs: phase-1-setup
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: microsoft/playwright@v1
      - run: npm ci
      - run: |
          npx playwright test \
            tests/e2e/openclaw-installation.spec.ts \
            tests/e2e/gateway-management.spec.ts \
            tests/e2e/gateway-proxy-paths.spec.ts \
            tests/e2e/docker-setup.spec.ts \
            tests/e2e/docker-to-ide-flow.spec.ts \
            --workers=4

  phase-3-editor-balance:
    needs: phase-1-setup
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: microsoft/playwright@v1
      - run: npm ci
      - run: |
          npx playwright test \
            tests/e2e/navigation.spec.ts \
            tests/e2e/balance-polling.spec.ts \
            tests/e2e/settings-occ-credits.spec.ts \
            --workers=4

  phase-4-smoke-integration:
    needs: [phase-2-gateway-docker, phase-3-editor-balance]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: microsoft/playwright@v1
      - run: npm ci
      - run: |
          npx playwright test \
            tests/e2e/smoke.spec.ts \
            tests/e2e/ci-integration.spec.ts \
            tests/e2e/snapshots.spec.ts \
            tests/e2e/test-docker-config.spec.ts \
            --workers=4
```

---

## Categorization Summary

| Phase | Count | Type | Parallelism | Execution Model |
|-------|-------|------|-------------|-----------------|
| 1 | 2 | Auth/UI Setup | Sequential | Blocking (required for all) |
| 2 | 5 | Gateway/Docker | Parallel (4 workers) | Depends on Phase 1 |
| 3 | 3 | Editor/Balance | Parallel (4 workers) | Depends on Phase 1 |
| 4 | 4 | Smoke/Integration | Parallel (4 workers) | Runs after 2 & 3 complete |
| **TOTAL** | **14** | **Mixed** | **12 can run in parallel** | **4 sequential phases** |

---

## Dependency Graph

```
Phase 1: Sequential Setup
├── onboarding-auth.spec.ts (no deps)
└── home-panel.spec.ts (depends on onboarding-auth)
    │
    ├─→ Phase 2: Gateway/Docker (4 workers, parallel)
    │   ├── openclaw-installation.spec.ts
    │   ├── gateway-management.spec.ts
    │   ├── gateway-proxy-paths.spec.ts
    │   ├── docker-setup.spec.ts
    │   └── docker-to-ide-flow.spec.ts
    │
    ├─→ Phase 3: Editor/Balance (4 workers, parallel)
    │   ├── navigation.spec.ts
    │   ├── balance-polling.spec.ts
    │   └── settings-occ-credits.spec.ts
    │
    └─→ Phase 4: Smoke/Integration (4 workers, parallel)
        ├── smoke.spec.ts
        ├── ci-integration.spec.ts
        ├── snapshots.spec.ts
        └── test-docker-config.spec.ts
```

---

## Flakiness Mitigation

### Phase 1 (Sequential)
- **Auth**: Increased timeout (120s) for login flow
- **Home Panel**: Uses iframe handling via CDP; timeouts tuned for vs-code-server delays

### Phase 2 (Gateway/Docker)
- **Docker setup**: Longest running (docker compose pull/build); 120s timeout
- **Gateway status**: Waits for container health checks (up to 60s)
- **Proxy paths**: Depends on gateway running; staggered via sequential setup

### Phase 3 (Editor/Balance)
- **Balance polling**: Mock backend responses; independent of gateway
- **Settings**: No external deps; purely UI validation
- **Navigation**: Basic editor chrome; least flaky tests

### Phase 4 (Smoke/Integration)
- **Smoke**: Baseline server checks; usually <1s
- **Snapshots**: Visual regression; tolerances set in playwright.config.ts
- **CI integration**: Runner validation; no live deps

---

## Test Files & Counts

### Detailed File Listing

```
tests/e2e/
├── balance-polling.spec.ts         [Phase 3] (6 tests)
├── ci-integration.spec.ts          [Phase 4] (1 test)
├── docker-setup.spec.ts            [Phase 2] (multiple tests)
├── docker-to-ide-flow.spec.ts      [Phase 2] (1 test)
├── gateway-management.spec.ts      [Phase 2] (2 tests)
├── gateway-proxy-paths.spec.ts     [Phase 2] (multiple tests)
├── home-panel.spec.ts              [Phase 1] (4 tests)
├── navigation.spec.ts              [Phase 3] (multiple tests)
├── onboarding-auth.spec.ts         [Phase 1] (7 tests)
├── openclaw-installation.spec.ts   [Phase 2] (2 tests)
├── settings-occ-credits.spec.ts    [Phase 3] (multiple tests)
├── smoke.spec.ts                   [Phase 4] (3 tests)
├── snapshots.spec.ts               [Phase 4] (multiple tests)
└── test-docker-config.spec.ts      [Phase 4] (multiple tests)
```

---

## Next Steps

### Phase 3 Task 2: Implement CDP Retry Logic
- **File**: `apps/editor/src/vs/workbench/contrib/void/browser/react/src/sidebar-tsx/SidebarChat.tsx`
- **Task**: Add exponential backoff retry logic for CDP connection failures
- **Rationale**: Tests fail intermittently when Playwright CDP loses connection; retry with backoff improves reliability

### Phase 3 Task 3: Parallel Test Batch Execution
- Implement GitHub Actions workflow with phase-based dependencies
- Add artifact collection (HTML reports, videos, logs)
- Set up flakiness detection (re-run failed tests once before marking as failure)

### Phase 3 Task 4: Test Metrics & Monitoring
- Track test duration per phase
- Monitor flakiness rate (failures due to timeout vs assertion)
- Create dashboard for test health

---

## Configuration Reference

### Playwright Config Overrides
For Phase 1 (sequential) tests:
```javascript
// playwright.config.ts
export const projects = [
  {
    name: 'phase-1-setup',
    use: {
      baseURL: 'http://localhost:9888',
      browserName: 'chromium',
      // Slower systems may need extended timeouts
      navigationTimeout: 60_000,
    },
    workers: 1,  // Sequential
  },
  // ... Phase 2-4 with workers: 4
];
```

### Environment Requirements
- **Docker**: Must be running (phase 2 tests start containers)
- **Node.js**: 18+ (for Playwright v1.40+)
- **Memory**: 4GB+ (4 workers × 2 parallel browsers)
- **Network**: Stable connection to localhost (for mock backend)

---

**Document Version**: 1.0  
**Last Updated**: 2026-04-13  
**Author**: Phase 3 Task 1 Automation  
**Status**: ✅ Complete
