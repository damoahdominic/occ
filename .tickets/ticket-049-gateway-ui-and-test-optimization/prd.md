# Ticket 049 — Gateway Container Info UI + E2E Test Optimization

## 2.1 Problem Statement

The OCC Home panel does not currently display the status of the OpenClaw gateway service (Docker container running on `localhost:8001`). Users cannot quickly verify whether the gateway is healthy without manual Docker commands or browser inspection.

Additionally, E2E test execution order is not optimized for CDP (Chrome DevTools Protocol) reliability:

1. **Gateway service visibility**: The OCC Home panel shows Docker setup progress, but once containers are running, there is no UI feedback on gateway health/readiness.
2. **Test ordering problem**: Playwright tests run in arbitrary order; some rely on gateway availability, others do not. This creates flaky tests when fast-executing tests don't wait for gateway startup.
3. **CDP retry gaps**: SidebarChat.tsx (line 134–152) makes a single 30-second attempt to connect via CDP, but no retry loop exists for transient network errors during test startup.

### Root Cause Analysis

**Phase 1 Audit Findings:**

1. **SidebarChat.tsx CDP Logic** (`apps/editor/src/vs/workbench/contrib/void/browser/react/src/sidebar-tsx/SidebarChat.tsx`, lines 134–152):
   - Single attempt to fetch gateway info via HTTP request to `http://localhost:8001/info`
   - 30-second timeout with fallback to stub state
   - NO retry loop for transient errors (network startup race condition)
   - Blocks E2E tests from reliably detecting gateway availability

2. **Test Execution Order** (`scripts/playwright.fixtures.ts`):
   - Tests execute in worker-based parallelization with no guaranteed sequencing
   - Gateway-dependent tests may run before container startup completes
   - No pre-test hook to verify gateway availability

3. **Missing Gateway Component**:
   - OCC Home panel renders `StubSidebar` (fallback) when no data available
   - No dedicated gateway info display component
   - User cannot see gateway status without looking at browser console

## 2.2 Proposed Solution

### Architecture

```
OCC Home Panel
├── Existing components (setup wizard, settings, etc.)
└── NEW: GatewayInfo component
    ├── Fetches gateway status via HTTP (localhost:8001/info)
    ├── Displays status: "Connected", "Waiting...", "Unavailable"
    └── Integrates with SidebarChat state management

SidebarChat.tsx (UPDATE)
├── Lines 134–152: CDP attempt (existing)
├── NEW: Retry loop (5s × 5 attempts = 25s total)
│   ├── Exponential backoff for transient failures
│   └── Fallback to stub after all retries exhausted
└── Pass gateway state to Home panel via context

Playwright Test Suite (UPDATE)
├── NEW test ordering constraint:
│   ├── Gateway-dependent tests scheduled AFTER container startup
│   └── Test execution waits for gateway health check
└── NEW pre-test hook: verify localhost:8001 is reachable
```

## 2.3 Acceptance Criteria

- [ ] **Gateway Component Created**:
  - New React component `GatewayInfo` displays gateway status ("Connected", "Connecting", "Unavailable")
  - Component integrates with SidebarChat state (pulls gateway readiness from CDPState)
  - Renders in OCC Home panel below existing controls

- [ ] **CDP Retry Logic Implemented**:
  - SidebarChat.tsx lines 134–152 now include a retry loop BEFORE the 30-second timeout attempt
  - Retry loop: 5 attempts, 1-second delay between attempts (total 5 seconds)
  - Exponential backoff on transient errors (409, 502, 503)
  - Logs retry attempts to browser console (no production overhead)
  - Falls back to stub state only after all retries exhausted

- [ ] **Test Ordering Optimized**:
  - Playwright test suite adds a new `gateway-health-check` fixture/hook
  - Hook runs BEFORE any test that needs gateway access
  - Tests are reordered so gateway-dependent tests run AFTER setup tests
  - E2E test README updated to document test execution order and ordering rationale

- [ ] **State Management**:
  - Gateway readiness state exposed via SidebarChat context or props
  - Home panel can render dynamic status without polling (subscribe to updates)
  - No additional polling; use existing CDPState updates

- [ ] **No Breaking Changes**:
  - Existing `package.json`, `playwright.config.ts`, global test setup unchanged
  - All existing E2E tests pass without modification
  - Fallback behavior (stub sidebar) unchanged

- [ ] **Documentation**:
  - Code comments in GatewayInfo.tsx explain component purpose and props
  - CDP retry logic documented in SidebarChat.tsx
  - Test ordering documented in `PLAYWRIGHT.md` or existing E2E guide

## 2.4 Technical Considerations

### SidebarChat.tsx CDP Retry Design

**Location**: `apps/editor/src/vs/workbench/contrib/void/browser/react/src/sidebar-tsx/SidebarChat.tsx`, lines 134–152

**Current Code** (simplified):
```typescript
// Single 30-second attempt with fallback
async function fetchGatewayInfo() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  
  try {
    const res = await fetch('http://localhost:8001/info', { signal: controller.signal });
    // ...handle response
  } catch (err) {
    // Fall back to stub state
  }
}
```

**Proposed Changes** (Phase 2 implementation):
1. Add retry loop BEFORE the 30-second attempt block (lines ~140–152)
2. Loop: `for (let i = 0; i < 5; i++)` with 1-second delay between attempts
3. Catch transient errors (409 Conflict, 502 Bad Gateway, 503 Service Unavailable)
4. Log each attempt: `console.log(`[CDP] Attempt ${i + 1}/5 to reach gateway...`)`
5. If any attempt succeeds, skip the main 30-second block
6. If all retries fail, proceed to existing 30-second timeout logic

**Why this approach**:
- Respects existing timeout fallback (30s is still the ultimate limit)
- Fast success path: gateway responds within 5 seconds
- Slow path: still gets full 30 seconds if retries don't help
- No changes to public API or component props

### GatewayInfo Component Design

**Location**: `apps/editor/src/vs/workbench/contrib/void/browser/react/src/sidebar-tsx/GatewayInfo.tsx` (NEW)

**Props**:
```typescript
interface GatewayInfoProps {
  gatewayReady: boolean;       // From SidebarChat CDPState
  gatewayError?: string;       // Optional error message
}
```

**Render**:
- Status badge with icon and text
- "Connected" (green check) if gateway is reachable
- "Connecting..." (spinner) if SidebarChat is retrying
- "Unavailable" (red X) if retries exhausted

**Integration**:
- Import into SidebarChat
- Render below existing controls (above settings, below title)
- Subscribe to SidebarChat's `cdpState.isConnected` or similar

### Playwright Test Ordering

**Current Issue**:
- Tests run in parallel by worker; no guarantee gateway is ready before test starts
- Some tests (e.g., OCC Credits card) depend on gateway API responses
- Flaky failures when tests outrun container startup

**Proposed Solution**:
1. Add new test fixture in `scripts/playwright.fixtures.ts`:
   ```typescript
   test.beforeAll(async () => {
     // Check if localhost:8001 is reachable (3 attempts, 2s each)
     await pollGatewayHealth(3, 2000);
   });
   ```

2. Reorder test files so gateway-dependent tests run AFTER setup tests:
   - Setup tests (Docker, home panel basic render) → run first
   - Integration tests (OCC Credits, settings with API) → run after gateway confirmed

3. Document in `PLAYWRIGHT.md` or test README:
   - "Tests are ordered to ensure gateway is available before dependent tests run"
   - List which tests depend on gateway (OCC Credits card, balance display, etc.)

**No Changes Required**:
- `playwright.config.ts` remains unchanged (no fullyParallel override)
- `playwright.global-setup.ts` remains unchanged
- `package.json` remains unchanged
- Individual test files don't need modification (ordering happens at fixture level)

## 2.5 Dependencies

- **SidebarChat.tsx**: Must exist and have CDP connection logic (confirmed at lines 134–152)
- **Playwright fixtures**: Must support test hooks (standard Playwright feature, no new deps)
- **React context/state**: SidebarChat must expose gateway readiness state (existing or minimal refactor)

## 2.6 Constraints & Non-Goals

- **Do NOT modify**:
  - `package.json` (no new dependencies)
  - `playwright.config.ts` (no test execution config changes)
  - `scripts/global-setup.ts` (no global setup changes)
  - Existing E2E test files (no per-test modifications needed)

- **Non-Goal**: Full gateway status dashboard
  - This ticket focuses on simple status indicator in Home panel
  - Advanced gateway monitoring/health metrics are out of scope

- **Non-Goal**: Test parallelization tuning
  - Reordering is at fixture/hook level
  - No changes to worker count or parallel test execution strategy

## 2.7 Estimated Effort

- **Task 1** (GatewayInfo component): 2–3 hours
- **Task 2** (CDP retry loop): 1–2 hours
- **Task 3** (Test ordering & fixture): 1–2 hours
- **Task 4** (Integration & testing): 1–2 hours
- **Task 5** (Documentation): 1 hour

**Total: 6–10 hours (~0.75–1.25 dev days)**

## 2.8 Success Metrics

1. **Gateway visibility**: Users can see gateway status in OCC Home panel without looking at console
2. **Test stability**: E2E tests pass consistently on first run; flaky gateway-timeout failures reduced by >80%
3. **Fast feedback**: Gateway connection succeeds within 5 seconds in >90% of test runs (vs. 30-second timeout)
4. **No regressions**: All existing E2E tests pass without modification; package.json and config files unchanged

---

## Tasks

### Task 1: Create GatewayInfo React Component

**Objective**: Build a React component that displays gateway connection status in the OCC Home panel.

**Status**: TODO

**Acceptance Criteria**:
- [ ] Component file created at `apps/editor/src/vs/workbench/contrib/void/browser/react/src/sidebar-tsx/GatewayInfo.tsx`
- [ ] Component accepts props: `gatewayReady: boolean`, `gatewayError?: string`
- [ ] Renders status badge with icon and text:
  - "Connected" (green check) when gatewayReady is true
  - "Connecting..." (spinner) when fetching
  - "Unavailable" (red X) when false
- [ ] Component is imported and rendered in SidebarChat.tsx
- [ ] Status updates dynamically when SidebarChat state changes
- [ ] Code comments document component purpose and prop meanings

**Subtasks**:
- [ ] Subtask 1.1: Create component file with TypeScript types
  - Create GatewayInfo.tsx with interface GatewayInfoProps
  - Define status enum or string literals
  - Add PropTypes or TypeScript validation
  
- [ ] Subtask 1.2: Implement render logic
  - Render status badge with conditional styling
  - Use icon library (VS Code icons or existing) for check/X/spinner
  - Apply OCC CSS conventions from existing Home panel components
  
- [ ] Subtask 1.3: Integrate into SidebarChat.tsx
  - Extract gateway readiness state from CDPState
  - Pass props to GatewayInfo component
  - Render component below title, above existing controls
  - Test that state updates trigger re-render
  
- [ ] Subtask 1.4: Test component rendering
  - Verify component renders in different states (connected, connecting, error)
  - Verify styling is consistent with OCC Home panel design
  - Manual test in browser: render home panel with/without gateway

**Depends on**: None

---

### Task 2: Implement CDP Retry Loop in SidebarChat.tsx

**Objective**: Add a 5-attempt retry loop with 1-second delays before the existing 30-second timeout logic.

**Status**: TODO

**Acceptance Criteria**:
- [ ] Retry loop added to SidebarChat.tsx, lines 134–152 (before existing timeout block)
- [ ] Loop makes up to 5 attempts to reach gateway (http://localhost:8001/info)
- [ ] 1-second delay between consecutive attempts (total ~5 seconds for all retries)
- [ ] Transient errors (409, 502, 503) are caught and retried
- [ ] Success on any attempt breaks the loop and populates gateway info
- [ ] After retry loop exhausted, falls back to existing 30-second timeout logic
- [ ] Each attempt logged to console: `[CDP] Attempt N/5 to reach gateway...`
- [ ] No changes to function signature or public API
- [ ] Code comments explain retry strategy and fallback behavior

**Subtasks**:
- [ ] Subtask 2.1: Review current SidebarChat.tsx CDP logic (lines 134–152)
  - Read existing code structure and error handling
  - Identify where retry loop should be inserted
  - Document current timeout/fallback behavior
  
- [ ] Subtask 2.2: Implement retry loop with exponential backoff
  - Create retry function that loops 5 times
  - Add 1-second delay (or configurable) between attempts
  - Catch transient HTTP errors (409, 502, 503)
  - Break loop on success or after all attempts
  
- [ ] Subtask 2.3: Add logging and error handling
  - Log each attempt: `console.log([CDP] Attempt ${i}/5...)`
  - Log success/failure at loop end
  - Preserve existing error fallback behavior
  
- [ ] Subtask 2.4: Test retry behavior
  - Stop gateway container and verify retry loop is attempted
  - Start gateway during retries and verify success
  - Verify fallback to 30-second timeout after retries fail
  - Check browser console for retry log messages

**Depends on**: None (independent of Task 1)

---

### Task 3: Optimize E2E Test Execution Order

**Objective**: Ensure gateway-dependent tests run after setup tests, and add a pre-test health check.

**Status**: TODO

**Acceptance Criteria**:
- [ ] New test fixture or hook added to `scripts/playwright.fixtures.ts`
- [ ] Hook includes `pollGatewayHealth()` function that checks localhost:8001 availability
- [ ] Health check runs BEFORE any test that requires gateway access
- [ ] Health check makes up to 3 HTTP GET requests to http://localhost:8001/info with 2-second delays
- [ ] All gateway-dependent tests pass without modification (no individual test file changes)
- [ ] Test execution order documented in README or PLAYWRIGHT.md
- [ ] E2E test suite runs with optimized order and demonstrates faster, more reliable execution

**Subtasks**:
- [ ] Subtask 3.1: Create gateway health check fixture
  - Add pollGatewayHealth() function to playwright.fixtures.ts
  - Function makes HTTP GET request to localhost:8001/info
  - Implements retry loop (3 attempts, 2s delay between)
  - Throws error if all attempts fail (test will skip/fail gracefully)
  
- [ ] Subtask 3.2: Add test hook to verify gateway before tests
  - Use `test.beforeAll()` or similar to run health check
  - Hook runs once per test file or globally (document which)
  - Logs health check result to console
  
- [ ] Subtask 3.3: Reorder test files for optimal execution
  - Identify which tests depend on gateway (grep for localhost:8001 or API calls)
  - Place setup/basic tests (Docker, home panel render) first
  - Place integration tests (OCC Credits, balance, settings API) after
  - Verify test execution order with `npx playwright test --list`
  
- [ ] Subtask 3.4: Document test ordering in README/PLAYWRIGHT.md
  - Explain why tests are ordered (gateway availability)
  - List which tests depend on gateway
  - Provide command to verify health check is running
  - Document expected timing improvements

**Depends on**: None (independent of Tasks 1–2)

---

### Task 4: Integration Testing & Verification

**Objective**: Test all three components together and verify no regressions.

**Status**: TODO

**Acceptance Criteria**:
- [ ] Run full E2E test suite with CDP retry loop and test ordering enabled
- [ ] All existing E2E tests pass without modification
- [ ] GatewayInfo component displays in OCC Home panel
- [ ] Gateway status updates dynamically when container starts/stops
- [ ] No console errors or warnings related to CDP/gateway logic
- [ ] Test execution time reduced by at least 10% (gateway success within 5s vs. 30s timeout)

**Subtasks**:
- [ ] Subtask 4.1: Verify GatewayInfo component in OCC Home panel
  - Start Docker containers and OCC
  - Navigate to OCC Home panel
  - Verify GatewayInfo component appears
  - Verify status shows "Connected" when gateway is running
  
- [ ] Subtask 4.2: Test CDP retry loop with container start/stop
  - Stop gateway container and refresh OCC panel
  - Verify GatewayInfo shows "Unavailable"
  - Restart gateway container
  - Verify GatewayInfo updates to "Connected" within 5 seconds
  
- [ ] Subtask 4.3: Run full E2E test suite
  - Execute `npm test:e2e` or similar command
  - Verify all tests pass
  - Check execution time vs. baseline (should be faster)
  - Check console logs for retry messages (verify retry logic executed)
  
- [ ] Subtask 4.4: Verify no regressions
  - Check that existing test files were not modified (except test order)
  - Verify package.json, playwright.config.ts, global-setup.ts unchanged
  - Run individual tests in random order to verify no dependencies on execution order
  
- [ ] Subtask 4.5: Performance validation
  - Measure gateway connection time with retry loop enabled
  - Compare vs. baseline (existing 30-second timeout)
  - Document findings in task notes

**Depends on**: Tasks 1, 2, 3

---

### Task 5: Documentation & Final Review

**Objective**: Document changes, update developer guides, and prepare PR.

**Status**: TODO

**Acceptance Criteria**:
- [ ] Code comments added to GatewayInfo.tsx explaining component purpose
- [ ] Code comments added to SidebarChat.tsx explaining CDP retry strategy
- [ ] Test fixture comments document pollGatewayHealth() function
- [ ] PLAYWRIGHT.md or E2E README updated with test ordering explanation
- [ ] Commit messages reference this ticket and summarize changes
- [ ] PR description explains Gateway Info UI and retry loop changes

**Subtasks**:
- [ ] Subtask 5.1: Add inline code documentation
  - Document GatewayInfo component purpose, props, and render logic
  - Document CDP retry loop strategy and fallback behavior
  - Document test health check fixture and polling logic
  
- [ ] Subtask 5.2: Update E2E documentation
  - Update PLAYWRIGHT.md or E2E test guide with test ordering explanation
  - Document which tests depend on gateway
  - Provide example of expected test output with retry logs
  
- [ ] Subtask 5.3: Prepare PR
  - Create PR with commits for each task (component, retry, test ordering)
  - Reference ticket-049 in PR description
  - Summarize Gateway Info UI addition and test optimization benefits
  
- [ ] Subtask 5.4: Request review
  - Link to AUDIT.md findings for context
  - Highlight no changes to package.json, playwright.config.ts, global setup
  - Outline success metrics from ticket 2.8

**Depends on**: Tasks 1, 2, 3, 4

---

## 2.9 Phase 1 Audit Reference

This ticket is based on **Phase 1 Audit** findings (conducted 2026-04-13):

**SidebarChat.tsx CDP Logic** (confirmed at lines 134–152):
- Single HTTP request to `http://localhost:8001/info`
- 30-second timeout with fallback to stub state
- NO retry mechanism for transient errors

**Test Architecture** (confirmed in `scripts/playwright.fixtures.ts`):
- Parallel test execution via workers
- No guaranteed sequencing for gateway-dependent tests
- Test flakiness when gateway startup lags behind test execution

**Missing Component**:
- OCC Home panel renders `StubSidebar` when gateway data unavailable
- No visual feedback on gateway status to end user

**Files Verified**:
- `/home/linuxdev/Desktop/workshop/studio/hustle/occ/apps/editor/src/vs/workbench/contrib/void/browser/react/src/sidebar-tsx/SidebarChat.tsx` (CDP logic, lines 134–152)
- `/home/linuxdev/Desktop/workshop/studio/hustle/occ/scripts/playwright.fixtures.ts` (test fixtures)
- `/home/linuxdev/Desktop/workshop/studio/hustle/occ/.tickets/ticket-048-docker-setup-consolidation/` (Docker/gateway context)

---

## 2.10 Related Documentation

- **Docker Architecture**: See ticket-048 for OpenClaw gateway service setup and port references
- **E2E Testing Guide**: Existing Playwright documentation in repo
- **OCC Home Panel**: Existing SidebarChat component and StubSidebar fallback
- **VS Code Extension Architecture**: Refer to ARCHITECTURE_SUMMARY.md or memory files for panel rendering patterns


---

## Amendment: Task 6 — Docker Setup Input Validation Framework

**Added**: 2026-04-14  
**Rationale**: Prevent onboarding failures by validating all inputs BEFORE proceeding to next step

### Problem
Current Docker onboarding flow fails mid-process with unhelpful errors:
- Permission denied: `/home/node/.openclaw/openclaw.json.*.tmp` (user lacks +rw access)
- Port conflicts: User selects port already in use; fails silently
- Path issues: Selected path doesn't exist or lacks permissions
- No validation before Step 1 → Step 2 progression

### Solution
Implement input validation framework that runs **before each step**:

**Validations Required**:

1. **Path Accessibility** (no sudo required)
   - [ ] Path exists: `test -d $PATH`
   - [ ] User readable: `test -r $PATH`
   - [ ] User writable: `test -w $PATH`
   - [ ] If fails: Prompt user for alternative path or create directory with correct permissions
   - [ ] Do NOT require sudo; exit with helpful error if impossible

2. **Port Availability**
   - [ ] Port not in use: `lsof -i :PORT` or `netstat -tln | grep PORT`
   - [ ] All 3 ports free: gateway (default 18789), postgres (5432), redis (6379)
   - [ ] If fails: Suggest alternative ports or wait for user to free ports

3. **Docker Availability**
   - [ ] Docker installed: `which docker`
   - [ ] Docker daemon running: `docker ps`
   - [ ] Docker compose available: `docker-compose --version` or `docker compose version`
   - [ ] If fails: Exit with instructions to start Docker

4. **Volume Mount Permissions**
   - [ ] Selected path owned by current user (not root)
   - [ ] OR path has explicit 777 permissions
   - [ ] If fails: Suggest `chmod 777 /path` OR alternative path

5. **Network Connectivity**
   - [ ] Localhost accessible: `ping -c 1 127.0.0.1`
   - [ ] Gateway endpoint reachable after startup: HTTP GET `http://127.0.0.1:GATEWAY_PORT/health`
   - [ ] If fails: Show timeout vs. connection refused (different diagnostics)

6. **Disk Space**
   - [ ] At least 5GB free in selected path: `df -h $PATH | awk '{print $4}'`
   - [ ] If fails: Warn and suggest alternative path

### Implementation Details

**When**: Validate at START of each step (onboarding Step 1, Docker setup Step 1, etc.)

**Where**: 
- Frontend: React form component (Step 1 UI in docker setup wizard)
- Add validation function that runs on input blur/change
- Show real-time feedback: ✓ (green) or ✗ (red) with reason

**Behavior**:
- Disable "Next" button until ALL validations pass
- Show inline error messages (not modal dialogs)
- Provide actionable suggestions (e.g., "Port 18789 in use. Try 18790?" or "Run `mkdir -p /home/user/.openclaw && chmod 755 /home/user/.openclaw`")
- Never prompt for sudo; offer alternatives instead

### Gateway-Specific Checks

**When starting gateway with docker-compose**:
1. Validate docker-compose.yml exists and is readable
2. Check all required environment variables set (GATEWAY_PORT, OPENCLAW_DATA_DIR, etc.)
3. Validate image availability: `docker image inspect IMAGENAME` (don't pull unless needed)
4. Test compose file syntax: `docker-compose config > /dev/null 2>&1`
5. After startup: Poll gateway health endpoint with 30-second timeout

### Acceptance Criteria for Task 6

- [ ] Path +rw validation implemented (no sudo required)
- [ ] Port availability check works for all 3 ports (gateway, postgres, redis)
- [ ] User can select alternative path if default fails
- [ ] User can select alternative ports if defaults conflict
- [ ] "Next" button disabled until validations pass
- [ ] Inline error messages show root cause + actionable fix
- [ ] Docker/compose availability verified before attempting startup
- [ ] Gateway health check polls for 30s with clear timeout message
- [ ] All validations pass on fresh system with proper permissions
- [ ] All validations fail gracefully on restricted environment (no sudo, read-only paths)

### Testing

**Happy path**:
- User selects valid path (user-owned, +rw)
- User selects available ports
- Docker running, disk space available
- All validations pass → "Next" button enabled

**Unhappy paths**:
- User selects `/root/.openclaw` → error: "Path not writable. Try `/home/user/.openclaw` or specify custom path"
- Port 18789 in use → error: "Port 18789 occupied by redis. Try 18790?"
- Docker not running → error: "Docker daemon not responding. Run: `systemctl start docker`"
- Disk full → warning: "Only 2GB free. Gateway needs 5GB min. Select different path or free disk space"

---

**Note**: This amendment ensures **zero permission errors at runtime** by validating upfront.

---

## Amendment: Task 7 — Error Reporting & Log Persistence UI

**Added**: 2026-04-14  
**Rationale**: Users cannot debug failures; error details disappear after setup completes

### Problem
1. **Log UI hides on failure** — Logs auto-dismiss even when errors occur
2. **No error reporting mechanism** — Users can't send error details to developers
3. **Silent failures** — User doesn't know what went wrong or how to fix it

### Solution
Implement persistent error UI + GitHub issue creation workflow

---

## Task 7 Specifications

### Part A: Log UI Persistence

**Current behavior**:
```
Setup completes → Log UI auto-closes (success or failure)
User sees: "Setup complete!" or blank screen
User doesn't know what went wrong
```

**New behavior**:
```
Setup SUCCEEDS → Log UI closes after 3 seconds
Setup FAILS → Log UI stays visible with:
  ├─ Full startup logs (scrollable)
  ├─ Error message highlighted
  ├─ "Report Error" button (visible)
  ├─ "Copy Logs" button
  └─ "Close" button (manual dismiss only)
```

### Part B: Error Report Button

**When clicked**, opens GitHub issue creation flow:

1. **Pre-fill GitHub issue with:**
   ```
   Title: [Auto-generated from error type]
   Example: "Docker Setup Failed: Permission Denied on /root/.openclaw"
   
   Body:
   ---
   ## Error Details
   - **Error**: [Full error message]
   - **Timestamp**: [YYYY-MM-DD HH:MM:SS UTC]
   - **User Email**: [user@example.com] (optional, for follow-up)
   
   ## System Information
   - OS: [Linux/macOS/Windows + version]
   - Docker Version: [docker --version output]
   - Docker Compose Version: [docker-compose --version output]
   - Free Disk Space: [X GB]
   - Current User: [$(whoami)]
   
   ## Setup Configuration
   - Gateway Port: [18789 or user-selected]
   - Data Path: [/root/.openclaw or user-selected]
   - Postgres Port: [5432 or user-selected]
   - Redis Port: [6379 or user-selected]
   
   ## Full Startup Logs
   ```
   [Complete docker-compose logs]
   [docker pull logs if applicable]
   [Permission/port check logs]
   ```
   
   ## Steps Taken
   1. Selected path: [path]
   2. Selected ports: [ports]
   3. Clicked "Start Gateway"
   4. [Error occurred]
   
   ---
   *Submitted via OCC Error Reporter*
   ```

2. **Button click options:**
   - Option A: Open GitHub web form with pre-filled content (copy-paste)
   - Option B: Direct API call to create issue (requires GitHub token)
   - Option C: Generate shareable link with encoded issue data

3. **Fallback**: If GitHub unavailable, show:
   ```
   "Can't reach GitHub. Email these logs to: developers@occ.dev"
   [Copy logs to clipboard button]
   ```

### Part C: Log Display Format

**During setup** (real-time streaming):
```
[docker-compose pull] Pulling images...
  ghcr.io/openclaw/openclaw:latest → ✓ (2.3GB)
  postgres:14 → ✓ (350MB)
  redis:7 → ✓ (150MB)

[docker-compose up] Starting services...
  occ-gateway-1 → ✓ Started
  occ-postgres-1 → ✓ Started
  occ-redis-1 → ✓ Started

[health-check] Verifying gateway...
  ✓ Gateway responding on 127.0.0.1:18789
  ✓ Postgres ready on port 5432
  ✓ Redis ready on port 6379

Setup complete! ✓
```

**On failure** (stays visible):
```
[docker-compose pull] Pulling images...
  ghcr.io/openclaw/openclaw:latest → ✓ (2.3GB)
  postgres:14 → ✓ (350MB)
  redis:7 → ✓ (150MB)

[docker-compose up] Starting services...
  ✓ occ-gateway-1 Started
  ✗ occ-postgres-1 FAILED

Error: Cannot mount volume
  /root/.openclaw: permission denied (Code 13)
  
  The container process cannot write to the mounted directory.
  
  Possible causes:
  - Directory owned by root (current: root)
  - Directory permissions too restrictive (current: 755)
  
  Suggested fixes:
  1. Use a user-writable path: /home/user/.openclaw
  2. Fix permissions: chmod 777 /root/.openclaw
  3. Report error to developers (see button below)

[Report Error] [Copy Logs] [Close]
```

### Part D: GitHub Issue Integration

**Repository**: anthropics/claude-code (or occ-specific repo)

**Issue Labels** (auto-applied):
```
area: docker-setup
type: user-reported
env: [linux|macos|windows]
error: [permission-denied|port-conflict|disk-full|network|other]
```

**Example GitHub issue created**:
```
Title: Docker Setup Failed: Permission Denied on /root/.openclaw
Labels: area:docker-setup, type:user-reported, env:linux, error:permission-denied

Body: [Pre-filled as shown above]

Assignee: [triage team]
Milestone: [Docs/Help needed]
```

---

## Acceptance Criteria for Task 7

- [ ] Log UI stays visible on setup failure (doesn't auto-close)
- [ ] "Report Error" button appears on error screen
- [ ] Error message includes root cause + suggested fixes
- [ ] "Copy Logs" button copies full startup logs to clipboard
- [ ] "Report Error" button pre-fills GitHub issue with:
  - [ ] Error message and timestamp
  - [ ] System info (OS, Docker version, disk space)
  - [ ] User's setup configuration (ports, paths)
  - [ ] Full startup logs
  - [ ] Optional user email for follow-up
- [ ] GitHub issue can be created with one click (no copy-paste)
- [ ] Fallback email option if GitHub unavailable
- [ ] Log output scrollable (doesn't overflow screen)
- [ ] All error types tested (permission, port, disk, network, compose syntax)

---

## Testing

**Test Case 1: Successful Setup**
- Logs show real-time progress
- "Setup complete!" message appears
- Log UI auto-closes after 3 seconds
- User sees home panel

**Test Case 2: Permission Error**
- Setup fails with permission denied
- Log UI stays visible (doesn't auto-close)
- Error message highlighted in red
- "Report Error" button visible
- Clicking "Report Error" → GitHub issue pre-filled with logs
- "Copy Logs" button works
- "Close" button manually dismisses

**Test Case 3: Port Conflict**
- Setup fails with "port 18789 in use"
- Error message suggests alternative ports
- "Report Error" creates GitHub issue with port info

**Test Case 4: GitHub Unavailable**
- Network disconnected
- "Report Error" shows email fallback
- "Copy Logs" still works for manual email

---

**Note**: This task ensures users can always debug failures and report issues to developers with full context.
