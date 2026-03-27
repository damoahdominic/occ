# PRD: Ticket 016 - Automated E2E Tests

## 1. Problem Statement

Currently the OCCode test suite (`test.md`) is a manual checklist that requires human interaction to verify every release. This is time-consuming, error-prone, and does not scale. We need an automated end-to-end (E2E) test suite that exercises core user flows: onboarding, authentication, OpenClaw installation, gateway start, and chat inference. The tests should run in CI on every push/PR and gate releases.

## 2. Proposed Solution

Implement Playwright-based E2E tests that drive the editor UI (Electron/Void) via the Playwright Electron driver or by launching the editor as a subprocess and connecting via CDP. Because the editor is a desktop app, we have two options:

- **Option A:** Use `playwright-electron` to launch the editor directly and interact with its windows
- **Option B:** Launch the editor with `--remote-debugging-port` and use `@playwright/test` with `chromium` to connect to the existing Electron instance

Given the complexity, start with **Option B** (connect to Electron via CDP) as it's more stable. The test suite should:

- Launch the editor in a clean profile (`--user-data-dir` temp)
- Wait for the Home panel to load
- Interact with buttons: "Install OpenClaw", "Start Gateway", "Sign in"
- Fill settings, verify status bar updates
- Simulate chat messages (by injecting into MoltPilot or mocking the backend)

Because the editor talks to real backend services (MBA.sh, Stripe), tests should use a dedicated test environment with mock servers or recorded HTTP interactions using `nock` on the backend side. For simplicity, run tests against a local test double of the backend that returns canned responses.

Test cases (subset of `test.md`):

1. Onboarding flow shows initial steps; "Create Account" opens browser (mock)
2. OpenClaw installation: when `openclaw` not present, installer runs and creates `~/.openclaw` structure
3. Gateway status: "Start" button triggers `openclaw gateway start`; status changes to "Running"
4. Authenticated state: after sign-in (mocked), status bar shows balance, Home shows account info
5. Sign out flow: clears credentials and returns to onboarding
6. Settings panel: switching between OCC Credits and BYOK updates UI correctly
7. Chat inference (simulated): send a message and verify mock backend receives request

## 3. Acceptance Criteria

- `npm test` (or `npm run test:e2e`) runs the full Playwright suite and exits with code 0 if all pass
- CI pipeline (GitHub Actions) runs the suite on every PR to `main` and on release branches
- The suite executes within 5 minutes on CI
- Tests are deterministic (no flaky waits) and isolated (clean user-data-dir each run)
- At least 80% of critical manual checklist items are covered by automated tests
- Test reports are uploaded as artifacts on CI failure (Playwright HTML report)

## 4. Technical Considerations

- **Playwright setup:** Install `@playwright/test`, `playwright`, and `playwright-electron` if needed. Configure `playwright.config.ts`.
- **Electron automation:** Use `electron` package to launch the editor binary, or launch `apps/editor` built output. Need to start with `--remote-debugging-port=9222` to let Playwright attach via CDP.
- **Test environment:** Use mocks rather than real network. Run a local mock server (e.g., Express) that implements the same endpoints as production backend (`/api/v1/auth/signup`, `/api/v1/balance`, `/api/v1/chat/completions`) with predictable responses.
- **File system isolation:** Use a temporary directory for editor's `~/.occode-editor` and `~/.openclaw` to avoid polluting developer machine. Clean up after tests.
- **Timing and waits:** Use Playwright's auto-waiting (`elementHandle.waitForElementState('visible')`, `expect(locator).toBeVisible()`). Avoid arbitrary sleeps.
- **CI resources:** Electron in headless mode may require Xvfb on Linux. GitHub Actions `ubuntu-latest` supports running Electron in headless with `xvfb-run`.
- **Mocking extension internals:** Possibly need to set environment variables to point extension to mock backend instead of production (`OCC_BACKEND_URL=http://localhost:3001`).
- **Test data:** Use fixed test user with known balance; mock JWT that extension accepts for auth.

## 5. Dependencies

- None; this is a new test suite added to repo

## 6. Subtask Checklist

- [ ] Task 1: Set up Playwright project
  - **Problem:** Get basic test runner working with Electron
  - **Test:** `npx playwright test` reports "0 tests" but runs without error; can take screenshot of editor window
  - **Subtasks:**
    - [ ] Subtask 1.1: `npm install -D @playwright/test playwright`
    - [ ] Subtask 1.2: Create `playwright.config.ts` with `use: { headless: true, screenshot: 'only-on-failure', trace: 'on-first-retry' }`
    - [ ] Subtask 1.3: Write a dummy test that launches editor: `const browser = await playwright.chromium.launch({ channel: 'chrome' });` actually need electron: `const { _electron: electron } = require('playwright');` maybe simpler to spawn editor process and connect via `browserType.connectOverCDP`; document whichever works

- [ ] Task 2: Implement Electron launch fixture
  - **Problem:** Need to start the editor with proper flags and attach Playwright
  - **Test:** Fixture `editor` provides a `Page` object pointing to the main window; can take screenshot
  - **Subtasks:**
    - [ ] Subtask 2.1: Build the editor: `npm --prefix apps/editor run compile` (or use prebuilt)
    - [ ] Subtask 2.2: Determine editor binary path: `apps/editor/out/...` or use `vscode` script to launch; likely need to use `node ./apps/editor/out/main.js`
    - [ ] Subtask 2.3: Spawn child process with `--remote-debugging-port=9222 --user-data-dir=/tmp/occode-test-profile`
    - [ ] Subtask 2.4: Use `playwright.chromium.connectOverCDP('http://localhost:9222')` to get browser and first page
    - [ ] Subtask 2.5: Ensure cleanup: kill child process after tests (`afterAll` hook)

- [ ] Task 3: Create mock backend server
  - **Problem:** Editor needs endpoints to talk to
  - **Test:** Running `node test/mock-backend.js` listens on `http://localhost:3001` and responds to `/api/v1/balance`, `/api/v1/auth/signup`, `/v1/chat/completions`
  - **Subtasks:**
    - [ ] Subtask 3.1: Write small Express server (or Fastify) with routes:
      - `POST /api/v1/auth/signup` → `302` redirect to `occ-editor://auth?token=test.jwt&balance=5.00`
      - `GET /api/v1/balance` → `{ balance_usd: 5.00 }` (or decrementable)
      - `GET /api/v1/me` → `{ email: 'test@test.com' }`
      - `POST /v1/chat/completions` → if `stream: false` return fake completion; if `stream: true` stream SSE chunks; include header `x-litellm-response-cost: 0.01`
    - [ ] Subtask 3.2: Add environment variable `OCC_BACKEND_URL=http://localhost:3001` for the extension to use (instead of production)
    - [ ] Subtask 3.3: Start mock server in Playwright fixture `beforeAll` and close in `afterAll`

- [ ] Task 4: Write first test: Install OpenClaw flow
  - **Problem:** Verify installer works
  - **Test:** On fresh profile (no `~/.openclaw`), Home panel shows "Install OpenClaw"; click "Install"; progress log appears; after success, status shows installed version
  - **Subtasks:**
    - [ ] Subtask 4.1: Use `editor` fixture to get page; `await page.goto('home')` (maybe automatic)
    - [ ] Subtask 4.2: `await page.click('text=Install OpenClaw')`
    - [ ] Subtask 4.3: Wait for progress log to contain "OpenClaw installed successfully"
    - [ ] Subtask 4.4: Check file system: `~/.openclaw/openclaw.json` exists in test temp dir
    - [ ] Subtask 4.5: Verify status panel shows Gateway: Stopped (since not started yet)

- [ ] Task 5: Write test: Gateway start
  - **Problem:** Verify gateway can be started from Home
  - **Test:** Click "Start Gateway"; status changes to "Running" after a few seconds
  - **Subtasks:**
    - [ ] Subtask 5.1: Ensure OpenClaw installed from previous test; now click "Start Gateway"
    - [ ] Subtask 5.2: Wait for status to change: `await expect(page.locator('[data-testid="gateway-status"]')).toHaveText('Running')`
    - [ ] Subtask 5.3: Verify `openclaw gateway status` would return running (check process or file? maybe just trust UI)
    - [ ] Subtask 5.4: Click "Stop Gateway"; wait for "Stopped"

- [ ] Task 6: Write test: Onboarding and auth flow
  - **Problem:** Verify "Create Account" button opens browser and URI handler works
  - **Test:** In fresh profile, Home shows onboarding steps; click "Create Account"; mock browser opens (we can hijack `openExternal` to just log); after timeout or simulated callback, home shows logged-in state with balance
  - **Subtasks:**
    - [ ] Subtask 6.1: Mock `vscode.env.openExternal` to capture URL and simulate user returning via URI (this may require extension host injection; might be complex). Alternative: Skip actual browser and simulate successful auth by directly calling the URI handler from test by sending a message to extension.
    - [ ] Subtask 6.2: For feasibility, test the UI state transition: after installation, home shows "Sign in with OCC" card; clicking it triggers `openExternal`; we can assert `openExternal` was called with `https://mba.sh/signup?ref=occ-editor`
    - [ ] Subtask 6.3: To test full flow, may need to wait for real auth; could be deferred to later priority

- [ ] Task 7: Write test: Settings panel OCC Credits card
  - **Problem:** Verify settings UI reflects state correctly
  - **Test:** Open Settings (Cmd+,), search "OCC Credits"; card shows "Sign in" if unauth; after triggering sign-in simulation, card shows email and balance
  - **Subtasks:**
    - [ ] Subtask 7.1: Test sign-in flow via URI handler to set token in `context.secrets`
    - [ ] Subtask 7.2: Refresh settings view; verify card title, balance text, "Buy More Credits" link present
    - [ ] Subtask 7.3: Click "Sign Out"; verify card returns to "Sign in" state

- [ ] Task 8: Write test: Balance polling and deduction
  - **Problem:** Verify balance updates
  - **Test:** Mock backend balance initially 5.00; after simulated chat deduction, backend reduces by 0.01; status bar updates accordingly
  - **Subtasks:**
    - [ ] Subtask 8.1: Initial balance fetch returns 5.00; status bar shows "$5.00"
    - [ ] Subtask 8.2: Trigger chat inference (how? maybe call extension command directly that sends a request to mock `/chat/completions`)
    - [ ] Subtask 8.3: Mock `/chat/completions` returns with header `x-litellm-response-cost: 0.01`
    - [ ] Subtask 8.4: Wait for balance to update to 4.99; status bar shows "$4.99"
    - [ ] Subtask 8.5: Also verify `usage_log` was inserted in mock backend (optional)

- [ ] Task 9: CI integration
  - **Problem:** Tests must run automatically
  - **Test:** PR to main shows Playwright job; passes when tests succeed, fails when any test fails
  - **Subtasks:**
    - [ ] Subtask 9.1: Create `.github/workflows/e2e.yml` or similar
    - [ ] Subtask 9.2: Set up job with `runs-on: ubuntu-latest`
    - [ ] Subtask 9.3: Steps: checkout, setup Node, `npm ci`, `npm run build` (editor + extension), `npm run mock-backend &`, `npx playwright test`
    - [ ] Subtask 9.4: If tests fail, upload Playwright HTML report as artifact: `actions/upload-artifact`
    - [ ] Subtask 9.5: Add badge to README: `![E2E](https://github.com/.../badge.svg)`

- [ ] Task 10: Flake mitigation and maintenance
  - **Problem:** E2E tests can be flaky due to timing or external dependencies
  - **Test:** Suite runs 10 times in a row without failure
  - **Subtasks:**
    - [ ] Subtask 10.1: Set global timeout to 30s per test, disable animations in editor (`"window.animationDisabled": true` flag)
    - [ ] Subtask 10.2: Prefer `await expect(locator).toBeVisible({ timeout: 10000 })` over `sleep`
    - [ ] Subtask 10.3: Use test isolation: each test gets a fresh user-data-dir and clean mock DB
    - [ ] Subtask 10.4: If certain tests remain flaky, add `<test title>.skip` and document reason

- [ ] Task 11: Documentation for running tests locally
  - **Problem:** Developers need to run tests on their machines
  - **Test:** `README.md` section "Running E2E tests" with steps
  - **Subtasks:**
    - [ ] Subtask 11.1: Document prerequisites: Node 20, Docker (if needed for DB), display (for Electron headless works without X)
    - [ ] Subtask 11.2: `npm run build` (editor + extension) then `npm run test:e2e`
    - [ ] Subtask 11.3: Explain how to debug a failing test: `npx playwright test --debug`, `npx playwright show-report`

- [ ] Task 12: Coverage of remaining manual checklist items
  - **Problem:** 80% coverage target
  - **Test:** Map each manual item to an automated test; track in spreadsheet or comments
  - **Subtasks:**
    - [ ] Subtask 12.1: Review `test.md` checklist; mark items as covered or not
    - [ ] Subtask 12.2: Prioritize covering critical paths: install, gateway, auth, balance, sign-out
    - [ ] Subtask 12.3: Create additional tickets for outstanding items if needed (e.g., "test OAuth Google flow", "test Stripe webhook integration")
