# PRD: Ticket 047 - E2E User Flow BDD Specifications

## 1. Problem Statement

This ticket extracts the user flow test specifications from ticket-016 (Automated E2E Tests) and converts them into Gherkin BDD format with proper task structure. Tasks 4-9 from ticket-016 cover the core user-facing flows that need automated E2E test coverage. Writing these as BDD specs enables better test maintainability, stakeholder readability, and serves as documentation for the expected behavior.

## 2. Proposed Solution

Create BDD specifications and task breakdown for the following user flows from ticket-016:
- Task 4: Install OpenClaw flow test
- Task 5: Gateway start test
- Task 6: Onboarding and auth flow test
- Task 7: Settings panel OCC Credits card test
- Task 8: Balance polling and deduction test
- Task 9: CI integration test

Each specification follows Gherkin format with Feature, Background, and Scenario sections, mapped to tasks with proper Problem/Test/Subtask breakdown.

## 3. Dependencies

- **Depends on ticket-016**: All tasks in ticket-016 must be in progress or completed before these BDD specs can be fully implemented
- Task 1 (Playwright setup), Task 2 (Electron launch fixture), and Task 3 (Mock backend server) are prerequisites for these user flow tests

## 4. Acceptance Criteria

- [x] All 6 user flows have complete Gherkin BDD specifications
- [x] Each scenario includes clear Given-When-Then steps
- [x] Background sections define common prerequisites for related scenarios
- [x] All acceptance criteria reference original ticket-016 tasks
- [x] Test data requirements are specified where needed
- [x] Edge cases and error paths are covered
- [x] Task structure follows Problem/Test/Subtask format

---

## 5. Task Breakdown

- [x] Task 1: OpenClaw Installation BDD Specification
  - **Problem**: Convert task 4 from ticket-016 into BDD format for the OpenClaw installation flow
  - **Test**: BDD spec with scenarios for fresh installation and already-installed states
  - **Depends on**: ticket-016 Tasks 1-3
  - **Subtasks**:
    - [x] Subtask 1.1: Write Feature: OpenClaw Installation BDD spec
      - **Objective**: Create Gherkin Feature with Background and Scenarios
      - **Test**: Verify all Given-When-Then steps are clear and executable
    - [x] Subtask 1.2: Add edge case scenarios
      - **Objective**: Cover installation failure and retry scenarios
      - **Test**: Scenarios cover error paths
  - **Implementation**: `tests/e2e/openclaw-installation.spec.ts`

- [x] Task 2: Gateway Management BDD Specification
  - **Problem**: Convert task 5 from ticket-016 into BDD format for gateway start/stop
  - **Test**: BDD spec with scenarios for start, stop, and auto-start
  - **Depends on**: Task 1
  - **Subtasks**:
    - [x] Subtask 2.1: Write Feature: Gateway Management BDD spec
      - **Objective**: Create Gherkin Feature with Background and Scenarios
      - **Test**: Verify all Given-When-Then steps are clear and executable
    - [x] Subtask 2.2: Add gateway status verification
      - **Objective**: Ensure status transitions are documented
      - **Test**: Scenarios cover Starting, Running, Stopping, Stopped states
  - **Implementation**: `tests/e2e/gateway-management.spec.ts`

- [x] Task 3: Onboarding and Authentication BDD Specification
  - **Problem**: Convert task 6 from ticket-016 into BDD format for auth flow
  - **Test**: BDD spec with scenarios for view steps, initiate auth, callback, persistence
  - **Depends on**: Task 2
  - **Subtasks**:
    - [x] Subtask 3.1: Write Feature: Onboarding and Authentication BDD spec
      - **Objective**: Create Gherkin Feature with Background and Scenarios
      - **Test**: Verify all Given-When-Then steps are clear and executable
    - [x] Subtask 3.2: Add authentication persistence scenarios
      - **Objective**: Cover session persistence across restarts
      - **Test**: Scenarios cover JWT storage and retrieval
  - **Implementation**: `tests/e2e/onboarding-auth.spec.ts`

- [x] Task 4: Settings Panel OCC Credits Card BDD Specification
  - **Problem**: Convert task 7 from ticket-016 into BDD format for settings panel
  - **Test**: BDD spec with scenarios for unauthenticated, authenticated, sign out
  - **Depends on**: Task 3
  - **Subtasks**:
    - [x] Subtask 4.1: Write Feature: Settings Panel - OCC Credits Card BDD spec
      - **Objective**: Create Gherkin Feature with Background and Scenarios
      - **Test**: Verify all Given-When-Then steps are clear and executable
    - [x] Subtask 4.2: Add balance display and actions
      - **Objective**: Cover "Buy More Credits" link presence
      - **Test**: Scenarios cover UI elements in authenticated state
  - **Implementation**: `tests/e2e/settings-occ-credits.spec.ts`

- [x] Task 5: Balance Polling and Deduction BDD Specification
  - **Problem**: Convert task 8 from ticket-016 into BDD format for balance flow
  - **Test**: BDD spec with scenarios for initial display, deduction, warning, refresh
  - **Depends on**: Task 4
  - **Subtasks**:
    - [x] Subtask 5.1: Write Feature: Balance Polling and Deduction BDD spec
      - **Objective**: Create Gherkin Feature with Background and Scenarios
      - **Test**: Verify all Given-When-Then steps are clear and executable
    - [x] Subtask 5.2: Add insufficient balance scenario
      - **Objective**: Cover zero balance warning
      - **Test**: Scenario covers warning display and prompt to purchase
  - **Implementation**: `tests/e2e/balance-polling.spec.ts`

- [x] Task 6: CI Integration BDD Specification
  - **Problem**: Convert task 9 from ticket-016 into BDD format for CI pipeline
  - **Test**: BDD spec with scenarios for PR, release, failure report, release gate
  - **Depends on**: Task 5
  - **Subtasks**:
    - [x] Subtask 6.1: Write Feature: CI Integration BDD spec
      - **Objective**: Create Gherkin Feature with Background and Scenarios
      - **Test**: Verify all Given-When-Then steps are clear and executable
    - [x] Subtask 6.2: Add artifact upload scenario
      - **Objective**: Cover HTML report generation on failure
      - **Test**: Scenario covers artifact creation and accessibility
  - **Implementation**: `tests/e2e/ci-integration.spec.ts`
      - **Objective**: Create Gherkin Feature with Background and Scenarios
      - **Test**: Verify all Given-When-Then steps are clear and executable
    - [ ] Subtask 4.2: Add balance display and actions
      - **Objective**: Cover "Buy More Credits" link presence
      - **Test**: Scenarios cover UI elements in authenticated state

- [ ] Task 5: Balance Polling and Deduction BDD Specification
  - **Problem**: Convert task 8 from ticket-016 into BDD format for balance flow
  - **Test**: BDD spec with scenarios for initial display, deduction, warning, refresh
  - **Depends on**: Task 4
  - **Subtasks**:
    - [ ] Subtask 5.1: Write Feature: Balance Polling and Deduction BDD spec
      - **Objective**: Create Gherkin Feature with Background and Scenarios
      - **Test**: Verify all Given-When-Then steps are clear and executable
    - [ ] Subtask 5.2: Add insufficient balance scenario
      - **Objective**: Cover zero balance warning
      - **Test**: Scenario covers warning display and prompt to purchase

- [ ] Task 6: CI Integration BDD Specification
  - **Problem**: Convert task 9 from ticket-016 into BDD format for CI pipeline
  - **Test**: BDD spec with scenarios for PR, release, failure report, release gate
  - **Depends on**: Task 5
  - **Subtasks**:
    - [ ] Subtask 6.1: Write Feature: CI Integration BDD spec
      - **Objective**: Create Gherkin Feature with Background and Scenarios
      - **Test**: Verify all Given-When-Then steps are clear and executable
    - [ ] Subtask 6.2: Add artifact upload scenario
      - **Objective**: Cover HTML report generation on failure
      - **Test**: Scenario covers artifact creation and accessibility

---

## 6. BDD Specifications

### Feature: OpenClaw Installation

**Background:**
Given the editor is launched with a fresh user data directory
And the mock backend server is running on localhost:3001
And no OpenClaw installation exists in the test profile

**Related to:** ticket-016 Task 4 - Write first test: Install OpenClaw flow

#### Scenario: Fresh OpenClaw Installation
When the user navigates to the Home panel
And the user clicks the "Install OpenClaw" button
Then the installation progress log should appear
And the installation should complete successfully
And the file "~/.openclaw/openclaw.json" should exist in the test profile directory
And the status panel should show "Gateway: Stopped"

#### Scenario: OpenClaw Already Installed
Given OpenClaw is already installed in the test profile
When the user navigates to the Home panel
Then the "Install OpenClaw" button should not be visible
And the status panel should show the installed version number

#### Scenario: Installation Failure and Retry
Given the installation process fails due to network error
When the user clicks "Retry" on the error dialog
Then the installation should restart from the beginning
And after successful retry, the status should show "Installed"

---

### Feature: Gateway Management

**Background:**
Given the editor is launched with a fresh user data directory
And the mock backend server is running on localhost:3001
And OpenClaw is installed in the test profile

**Related to:** ticket-016 Task 5 - Write test: Gateway start

#### Scenario: Start Gateway Successfully
When the user clicks the "Start Gateway" button
Then the gateway status should change to "Starting"
And after the gateway starts, the status should show "Running"
And the gateway should be accessible on the configured port

#### Scenario: Stop Gateway Successfully
Given the gateway is currently running
When the user clicks the "Stop Gateway" button
Then the gateway status should change to "Stopping"
And after the gateway stops, the status should show "Stopped"

#### Scenario: Gateway Auto-Start on Launch
Given the gateway was running when the editor was last closed
When the editor is relaunched with the same profile
Then the gateway should automatically start
And the status should show "Running"

#### Scenario: Gateway Start Timeout
Given the gateway takes longer than expected to start
When the user clicks "Start Gateway"
Then the status should show "Starting" within 2 seconds
And after 30 seconds, if still not running, show timeout error
And the user should be able to retry

---

### Feature: Onboarding and Authentication

**Background:**
Given the editor is launched with a fresh user data directory
And the mock backend server is running on localhost:3001

**Related to:** ticket-016 Task 6 - Write test: Onboarding and auth flow

#### Scenario: View Onboarding Steps
When the user navigates to the Home panel
Then the user should see the onboarding steps
And the steps should include "Install OpenClaw", "Start Gateway", "Sign in"

#### Scenario: Create Account Flow Initiated
Given the user is on the Home panel with onboarding steps visible
When the user clicks "Create Account"
Then the system should open an external browser to the signup URL
And the URL should contain "ref=occ-editor" parameter

#### Scenario: Successful Authentication via URI
Given the user initiated the create account flow
When the mock backend returns an auth callback URI "occ-editor://auth?token=test.jwt&balance=5.00"
And the extension handles the URI callback
Then the Home panel should show the logged-in state
And the status bar should display the user's balance

#### Scenario: Authentication Persists Across Sessions
Given the user is authenticated with a valid JWT
When the editor is restarted with the same profile
Then the user should remain logged in
And the balance should be displayed in the status bar

#### Scenario: Invalid Token Handling
Given the stored JWT is invalid or expired
When the editor loads
Then the user should be prompted to re-authenticate
And the previous session should be cleared

#### Scenario: Successful Onboarding Saves Logs
Given the onboarding process completes successfully
When the container finishes without errors (exit code 0)
Then the logs should be saved to ~/.openclaw/docker-setup.log
And the user should see a success message indicating "Logs saved to"
And the log file should contain a timestamp header and all onboarding output

#### Scenario: Onboarding Failure Persists Error Logs
Given the onboarding process encounters an error
When the container fails during onboarding
Then the error logs should be saved to ~/.openclaw/docker-setup-error.log
And a "View Error Log" button should appear in the error dialog
And the button should NOT be hidden (visibility should allow user interaction)

#### Scenario: View Error Log Button Opens Error Log File
Given an error occurred during onboarding and error logs were saved
When the user clicks the "View Error Log" button
Then the error log file should open in the VS Code editor
And the user should see the failure details and docker command output
And if editor open fails, the file should open in the OS file explorer

#### Scenario: Retry After Onboarding Failure
Given onboarding has failed and error logs were created
When the user clicks the "Retry" button
Then the onboarding process should restart from the beginning
And if it fails again, a new error log should be created or updated
And the previous logs should be overwritten with the new attempt

#### Scenario: Error Log File Accessibility and Content
Given the user has completed onboarding (success or failure)
When querying the log file path (~/.openclaw/docker-setup*.log)
Then the log file should be readable and accessible
And the log file should contain proper ISO format timestamps
And file permissions should allow the user to open it in the editor

---

### Feature: Settings Panel - OCC Credits Card

**Background:**
Given the editor is launched with a fresh user data directory
And the mock backend server is running on localhost:3001

**Related to:** ticket-016 Task 7 - Write test: Settings panel OCC Credits card

#### Scenario: View OCC Credits Card - Unauthenticated
When the user opens Settings via Cmd+,
And the user searches for "OCC Credits"
Then the OCC Credits card should be visible
And the card should show a "Sign in" button

#### Scenario: Sign In from Settings Panel
Given the OCC Credits card is showing the unauthenticated state
When the user clicks "Sign in" on the card
Then the system should initiate the auth flow
And redirect to the mock backend signup page

#### Scenario: View OCC Credits Card - Authenticated
Given the user is authenticated with a valid JWT
When the user opens Settings and navigates to OCC Credits
Then the card should display the user's email
And the card should show the current balance
And the card should have a "Buy More Credits" link

#### Scenario: Sign Out from Settings Panel
Given the user is authenticated and viewing OCC Credits
When the user clicks "Sign Out" on the card
Then the card should return to the unauthenticated state
And the balance should no longer be displayed
And the JWT should be cleared from the profile

#### Scenario: Balance Fetch Error in Settings
Given the user is authenticated
When the balance API returns an error
Then the card should show "Balance unavailable"
And the user should still be logged in

---

### Feature: Balance Polling and Deduction

**Background:**
Given the editor is launched with a fresh user data directory
And the mock backend server is running on localhost:3001
And the user is authenticated with a valid JWT
And the initial balance is set to 5.00 USD

**Related to:** ticket-016 Task 8 - Write test: Balance polling and deduction

#### Scenario: Initial Balance Display
Given the user is authenticated
When the editor loads
Then the status bar should display "$5.00"
And the balance should be fetched from the mock backend

#### Scenario: Balance Update After Chat Inference
Given the user has a balance of $5.00
When the user sends a chat message to the AI assistant
And the mock backend responds with a completion
And the response includes header "x-litellm-response-cost: 0.01"
Then the balance should update to $4.99
And the status bar should reflect the new balance

#### Scenario: Insufficient Balance Warning
Given the user's balance is $0.01
When the user attempts to send a chat message
Then the system should display an insufficient balance warning
And the user should be prompted to purchase more credits

#### Scenario: Balance Refresh on Window Focus
Given the user has made a purchase that updated their balance
When the editor window gains focus
Then the balance should be automatically refreshed
And the status bar should display the updated balance

#### Scenario: Multiple Deductions Track Correctly
Given the user has a balance of $5.00
When the user sends 3 chat messages (each costing $0.01)
Then after each message, the balance should update accordingly
And the final balance should be $4.97

---

### Feature: CI Integration

**Background:**
Given the E2E test suite is configured in the repository

**Related to:** ticket-016 Task 9 - CI integration

#### Scenario: E2E Tests Run on PR
When a pull request is created or updated
Then the CI pipeline should run the Playwright E2E test suite
And all tests should execute within 5 minutes
And the test results should be reported back to the PR

#### Scenario: E2E Tests Run on Release Branch
When changes are pushed to a release branch
Then the CI pipeline should run the full E2E test suite
And the test results should be available as artifacts

#### Scenario: Test Failure Shows HTML Report
Given the E2E tests have at least one failure
When the CI job completes
Then an HTML test report should be uploaded as an artifact
And the report should be accessible for download

#### Scenario: All Tests Pass - Release Gated
Given the E2E test suite is configured as a gate
When all tests pass
Then the release process should be allowed to proceed
When any test fails
Then the release process should be blocked

#### Scenario: Test Execution Timeout
Given the E2E tests take longer than expected
When the test execution exceeds 5 minutes
Then the CI job should be terminated
And a timeout error should be reported

---

## 7. Technical Considerations

### Test Data Requirements

| Scenario | Test Data |
|----------|-----------|
| Install OpenClaw | Empty ~/.openclaw directory |
| Gateway Start/Stop | Valid openclaw.json with config |
| Authentication | Mock JWT token: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test` |
| Balance | Initial: 5.00, Deduction: 0.01 per message |
| Settings Panel | User email: test@test.com |

### Mock Backend Endpoints

The mock server must implement:
- `POST /api/v1/auth/signup` → Returns redirect to `occ-editor://auth?token=test.jwt&balance=5.00`
- `GET /api/v1/balance` → Returns `{ balance_usd: 5.00 }`
- `GET /api/v1/me` → Returns `{ email: 'test@test.com' }`
- `POST /v1/chat/completions` → Returns completion with `x-litellm-response-cost` header

### Environment Variables for Tests

```
OCC_BACKEND_URL=http://localhost:3001
PLAYWRIGHT_USER_DATA_DIR=/tmp/occode-test-{uuid}
```

### Test Isolation Requirements

- Each test runs with a unique user data directory
- Mock backend starts fresh for each test run
- Gateway process is cleaned up after each test
- No shared state between tests