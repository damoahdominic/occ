# PRD: Ticket 003 - Session State (Three Modes)

## 1. Problem Statement

The extension must correctly represent three mutually exclusive authentication/session states on every activation:

| State | Condition | Behaviour |
|-------|-----------|-----------|
| `unauthenticated` | No JWT token, no BYOK config | Show onboarding flow |
| `authenticated` | Valid JWT present in `context.secrets` | Show balance bar, block inference if balance $0 |
| `byok` | BYOK provider configured (user supplies own API key) | Hide balance bar, allow unlimited inference |

Currently the state handling is likely ad-hoc, leading to inconsistent UI and possible security issues (e.g., showing balance when not authenticated, or allowing inference without proper auth).

## 2. Feature Description

Feature: Session State Management
  As a user of the OCcode editor
  I want the extension to properly manage authentication and session states
  So that I experience consistent UI behavior and secure access to AI inference

  Background:
    Given the OCcode extension is installed in the editor
    And the extension supports three session states: unauthenticated, authenticated, and BYOK

  Scenario: Unauthenticated user sees onboarding flow
    Given no JWT token exists in context.secrets
    And no BYOK configuration exists in globalState
    When the extension activates
    Then the session state should be unauthenticated
    And the Home panel should automatically show onboarding step 0

  Scenario: Authenticated user sees balance bar
    Given a valid JWT token exists in context.secrets
    And no BYOK configuration exists in globalState
    When the extension activates
    Then the session state should be authenticated
    And the status bar balance item should be visible
    And the current balance should be fetched from the API

  Scenario: BYOK user sees no balance bar
    Given no JWT token exists in context.secrets
    And a valid BYOK configuration exists in globalState
    When the extension activates
    Then the session state should be byok
    And the status bar balance item should be hidden
    And inference requests should use the user's BYOK key

  Scenario: JWT takes precedence over BYOK
    Given a valid JWT token exists in context.secrets
    And a valid BYOK configuration exists in globalState
    When the extension activates
    Then the session state should be authenticated (JWT takes precedence)
    And the status bar balance item should be visible
    And inference requests should use the JWT token

  Scenario: Balance zero blocks inference
    Given a valid JWT token exists in context.secrets
    And the current balance is $0
    When an inference request is made
    Then the request should be blocked
    And the UI should suggest adding funds to the account

  Scenario: Network error shows cached balance
    Given a valid JWT token exists in context.secrets
    And the balance API is unreachable
    And a cached balance exists in globalState
    When the extension activates
    Then the session state should be authenticated
    And the status bar should show the cached balance labeled as "[cached]"
    And a non-blocking warning should be displayed

## 3. Proposed Solution

Implement a centralized session state manager (new `auth.ts` module) that:

- On extension activation:
  - Read JWT from `context.secrets.get('occ.sessionToken')`
  - Read BYOK configuration from `globalState` (user settings)
  - Determine current state: if JWT exists → `authenticated`; else if BYOK configured → `byok`; else → `unauthenticated`
  - If `authenticated`, call `GET /api/v1/balance` (or stub) to fetch current balance and update UI
  - If `byok`, hide balance-related UI elements
  - If `unauthenticated`, auto-open Home panel to onboarding step 0

- Stub behavior during development:
  - If token present but MBA.sh unreachable, use last-known balance from `globalState` as display fallback (clearly labelled "cached")
  - If network error occurs, keep current state but show non-blocking warning

- UI reactions:
  - Status bar balance item visible only in `authenticated` state
  - Home panel content differs by state (onboarding vs logged-in vs BYOK)
  - Inference requests automatically attach `Authorization: Bearer <jwt>` when `authenticated`, or use BYOK key when `byok`

## 3. Acceptance Criteria

All acceptance criteria are written in Gherkin BDD format (Given-When-Then):

  Scenario: Fresh launch shows onboarding for unauthenticated user
    Given no JWT token exists in context.secrets
    And no BYOK configuration exists in globalState
    When the extension activates
    Then the Home panel should automatically show onboarding step 0

  Scenario: Valid JWT shows balance bar
    Given a valid JWT token exists in context.secrets
    And no BYOK configuration exists in globalState
    When the extension activates
    Then the status bar balance item should be visible
    And the current balance should be displayed (or cached value labeled as "[cached]" if offline)

  Scenario: BYOK configuration hides balance bar
    Given no JWT token exists in context.secrets
    And a valid BYOK configuration exists in globalState
    When the extension activates
    Then the status bar balance item should be hidden
    And MoltPilot inference should work with the user's BYOK key

  Scenario: JWT takes precedence over BYOK
    Given a valid JWT token exists in context.secrets
    And a valid BYOK configuration exists in globalState
    When the extension activates
    Then the session state should be authenticated
    And the status bar balance item should be visible
    And inference requests should use the JWT token

  Scenario: Zero balance blocks inference
    Given a valid JWT token exists in context.secrets
    And the current balance is $0
    When an inference request is made
    Then the request should be blocked
    And the UI should suggest adding funds to the account

  Scenario: Sign out transitions to unauthenticated
    Given a valid JWT token exists in context.secrets
    When the user signs out (token is deleted)
    Then the session state should transition to unauthenticated
    And the Home panel should show onboarding step 0

  Scenario: State persists across restarts
    Given a valid JWT token exists in context.secrets
    Or a valid BYOK configuration exists in globalState
    When the editor is restarted
    Then the previous session state should be restored
    And the UI should reflect the correct state

  Scenario: Network error shows cached balance
    Given a valid JWT token exists in context.secrets
    And the balance API is unreachable
    And a cached balance exists in globalState
    When the extension activates
    Then the extension should not crash
    And the status bar should show the cached balance labeled as "[cached]"
    And a non-blocking warning should be displayed

## 4. Technical Considerations

- **State machine:** Implement as a simple enum (`SessionState.UNAUTHENTICATED | AUTHENTICATED | BYOK`) with a `currentState` variable and `setState()` function that triggers UI updates
- **Storage:** `context.secrets` for JWT (encrypted), `globalState` for BYOK config and cached balance
- **Balance polling:** In `authenticated` state, poll `GET /api/v1/balance` every ~60 seconds to keep UI fresh
- **Staleness labeling:** When using cached balance due to network error, append "[cached]" and dim the value
- **Activation sequence:** Handle async initialization carefully; show loading spinner if state detection takes >~500ms
- **Extension lifecycle:** Re-run state detection on every activation (editor may stay open for days)

## 5. Dependencies

- **ticket-002-onboarding-auth-waiting-state:** JWT arrival via URI handler must integrate into state manager
- Backend B2 (Balance API): The real balance fetch endpoint (stubbed for now)

## 6. Subtask Checklist

- [ ] Task 1: Create `auth.ts` module
  - **Problem:** Centralize all auth/session logic
  - **Test:** 
    Given the auth.ts module is imported
    When the module is used
    Then it should export getSessionState(), setSessionState(), signOut(), and fetchBalance() functions
    And the SessionState enum should be properly defined
  - **Subtasks:**
    - [ ] Subtask 1.1: Define enum `SessionState`
      - **Objective**: Create a TypeScript enum for the three session states: UNAUTHENTICATED, AUTHENTICATED, BYOK
      - **Test**: 
        Given the auth.ts module
        When importing the SessionState enum
        Then it should have values UNAUTHENTICATED = 0, AUTHENTICATED = 1, BYOK = 2
      - **Depends on**: None
    - [ ] Subtask 1.2: Implement `detectSessionState()` that reads secrets + globalState
      - **Objective**: Create a function that determines the current session state by checking context.secrets for JWT and globalState for BYOK configuration
      - **Test**: 
        Given context.secrets has no token and globalState has no BYOK config
        When detectSessionState() is called
        Then it should return SessionState.UNAUTHENTICATED
        Given context.secrets has a valid JWT
        When detectSessionState() is called
        Then it should return SessionState.AUTHENTICATED
        Given context.secrets has no token but globalState has BYOK config
        When detectSessionState() is called
        Then it should return SessionState.BYOK
      - **Depends on**: Subtask 1.1
    - [ ] Subtask 1.3: Implement `fetchBalance()` (calls `/api/v1/balance` or returns cached)
      - **Objective**: Create a function that fetches the balance from the API or returns cached balance with proper error handling
      - **Test**: 
        Given the extension is in authenticated state
        When fetchBalance() is called and API returns successfully
        Then it should return an object with balance and cached: false
        Given the extension is in authenticated state
        When fetchBalance() is called and API fails but cached balance exists
        Then it should return the cached balance with cached: true
        Given the extension is in authenticated state
        When fetchBalance() is called and API fails with no cached balance
        Then it should return a default balance (0) with cached: false
      - **Depends on**: Subtask 1.2
    - [ ] Subtask 1.4: Implement `signOut()` that clears token and resets state
      - **Objective**: Create a function that clears the JWT from context.secrets and resets the session state to unauthenticated
      - **Test**: 
        Given context.secrets has a valid JWT
        When signOut() is called
        Then the JWT should be removed from context.secrets
        And getSessionState() should return SessionState.UNAUTHENTICATED
      - **Depends on**: Subtask 1.2

- [ ] Task 2: Integrate state manager into extension activation
  - **Problem:** Activation should immediately determine state and update UI
  - **Test:** 
    Given the extension is activating
    When the auth module is initialized
    Then the session state should be detected and appropriate UI updates should occur
    And the correct panel/status bar should appear based on the state
  - **Subtasks:**
    - [ ] Subtask 2.1: In `extension.ts` `activate()`, call `auth.detectSessionState()`
      - **Objective**: Modify the extension activation function to initialize the auth module and detect session state on startup
      - **Test**: 
        Given the extension is activating
        When extension.ts activate() function is called
        Then auth.detectSessionState() should be called
        And the current session state should be stored for UI updates
      - **Depends on**: Task 1 (all subtasks)
    - [ ] Subtask 2.2: State `unauthenticated` → `vscode.commands.executeCommand('occ.home.focus')`
      - **Objective**: When session state is unauthenticated, automatically focus the Home panel to show onboarding
      - **Test**: 
        Given the session state is UNAUTHENTICATED
        When the state is detected during activation
        Then the command 'occ.home.focus' should be executed
        And the Home panel should be visible
      - **Depends on**: Subtask 2.1
    - [ ] Subtask 2.3: State `authenticated` → start balance polling (every 60s)
      - **Objective**: When session state is authenticated, start polling the balance API every 60 seconds to keep UI updated
      - **Test**: 
        Given the session state is AUTHENTICATED
        When the state is detected during activation
        Then a polling interval should be started that calls fetchBalance() every 60 seconds
        And the balance UI should be updated with each successful fetch
      - **Depends on**: Subtask 2.1
    - [ ] Subtask 2.4: State `byok` → ensure balance bar hidden, no polls
      - **Objective**: When session state is BYOK, ensure the balance bar is hidden and no balance polling occurs
      - **Test**: 
        Given the session state is BYOK
        When the state is detected during activation
        Then the status bar balance item should be hidden
        And no balance polling interval should be started
      - **Depends on**: Subtask 2.1

- [ ] Task 3: Update Home panel to respect session state
  - **Problem:** Home should show different content based on state
  - **Test:** 
    Given the Home panel webview is created
    When session state changes
    Then the panel should render appropriate content based on the state
    And the correct UI elements should be visible for each state
  - **Subtasks:**
    - [ ] Subtask 3.1: Pass current `SessionState` to Home webview via `postMessage`
      - **Objective**: Modify the Home panel creation to send the current session state to the webview via postMessage
      - **Test**: 
        Given the extension is activated with a known session state
        When the Home panel webview is created
        Then the session state should be sent to the webview via postMessage
        And the webview should receive the state correctly
      - **Depends on**: Task 2 (specifically Subtask 2.1)
    - [ ] Subtask 3.2: In `home.ts` (renderer), switch on state to show proper section
      - **Objective**: Update the Home panel renderer to display different content based on the received session state
      - **Test**: 
        Given the Home panel receives session state UNAUTHENTICATED
        When the renderer processes the state
        Then the onboarding section should be visible
        And the dashboard section should be hidden
        Given the Home panel receives session state AUTHENTICATED
        When the renderer processes the state
        Then the dashboard section should be visible
        And the onboarding section should be hidden
        Given the Home panel receives session state BYOK
        When the renderer processes the state
        Then an appropriate BYOK message should be visible
        And the onboarding/dashboard sections should be hidden
      - **Depends on**: Subtask 3.1
    - [ ] Subtask 3.3: Ensure "Sign out" button appears only in authenticated/BYOK states
      - **Objective**: Make sure the Sign out button in the Home panel is only visible when the user is authenticated or using BYOK
      - **Test**: 
        Given the Home panel receives session state UNAUTHENTICATED
        When the renderer processes the state
        Then the Sign out button should be hidden
        Given the Home panel receives session state AUTHENTICATED or BYOK
        When the renderer processes the state
        Then the Sign out button should be visible
      - **Depends on**: Subtask 3.2

- [ ] Task 4: Update Status bar (balance item) visibility
  - **Problem:** Balance bar should only appear when authenticated
  - **Test:** 
    Given the extension is running
    When the session state changes
    Then the status bar balance item should be visible only when state is AUTHENTICATED
    And the balance item should be hidden when state is UNAUTHENTICATED or BYOK
  - **Subtasks:**
    - [ ] Subtask 4.1: In `extension.ts` status bar creation, check `sessionState === AUTHENTICATED`
      - **Objective**: Modify status bar initialization to only create the balance item when in authenticated state
      - **Test**: 
        Given the extension is initializing
        When session state is UNAUTHENTICATED or BYOK
        Then no status bar balance item should be created
        Given the extension is initializing
        When session state is AUTHENTICATED
        Then a status bar balance item should be created
      - **Depends on**: Task 2 (specifically Subtask 2.1)
    - [ ] Subtask 4.2: When state changes to non-authenticated, `statusBarItem.hide()`
      - **Objective**: Hide the status bar balance item when transitioning away from authenticated state
      - **Test**: 
        Given a status bar balance item exists and is visible
        When session state changes from AUTHENTICATED to UNAUTHENTICATED or BYOK
        Then the status bar balance item should be hidden
        Given no status bar balance item exists
        When session state changes to UNAUTHENTICATED or BYOK
        Then no error should occur
      - **Depends on**: Subtask 4.1
    - [ ] Subtask 4.3: When state becomes authenticated, `statusBarItem.show()` and set text
      - **Objective**: Show and update the status bar balance item when transitioning to authenticated state
      - **Test**: 
        Given no status bar balance item exists
        When session state changes to AUTHENTICATED
        Then a status bar balance item should be created and shown
        And the balance text should be set to the current balance value
        Given a status bar balance item exists but is hidden
        When session state changes to AUTHENTICATED
        Then the status bar balance item should be shown
        And the balance text should be updated to the current balance value
      - **Depends on**: Subtask 4.1

- [ ] Task 5: Balance fetch with fallback and stale labeling
  - **Problem:** Network failures should not leave user in limbo
  - **Test:** 
    Given the extension is in authenticated state
    When balance fetch operations occur
    Then network failures should be handled gracefully
    And cached balance should be used with proper labeling when available
  - **Subtasks:**
    - [ ] Subtask 5.1: In `fetchBalance()`, catch network errors and read `globalState.get('cachedBalance')`
      - **Objective**: Modify fetchBalance to handle network errors by attempting to read cached balance from globalState
      - **Test**: 
        Given fetchBalance is called
        When the API call succeeds
        Then it should return the balance from API with cached: false
        Given fetchBalance is called
        When the API call fails with network error
        And a cached balance exists in globalState
        Then it should return the cached balance with cached: true
        Given fetchBalance is called
        When the API call fails with network error
        And no cached balance exists in globalState
        Then it should return a default balance (0) with cached: false
      - **Depends on**: Task 1 Subtask 1.3
    - [ ] Subtask 5.2: Return object `{ balance, cached: true/false }`
      - **Objective**: Ensure fetchBalance consistently returns an object with balance and cached properties
      - **Test**: 
        Given fetchBalance is called
        When it returns a result
        Then the result should be an object with a balance property (number)
        And the result should be an object with a cached property (boolean)
      - **Depends on**: Subtask 5.1
    - [ ] Subtask 5.3: Status bar format: `${balance.toFixed(2)} USD` (normal) or `${balance.toFixed(2)} USD [cached]` (stale)
      - **Objective**: Format the balance display in the status bar with proper labeling for cached balances
      - **Test**: 
        Given fetchBalance returns { balance: 5.0, cached: false }
        When the status bar is updated
        Then the displayed text should be "5.00 USD"
        Given fetchBalance returns { balance: 5.0, cached: true }
        When the status bar is updated
        Then the displayed text should be "5.00 USD [cached]"
      - **Depends on**: Subtask 5.2
    - [ ] Subtask 5.4: Also postMessage to Home panel to show cached notice if needed
      - **Objective**: Notify the Home panel when a cached balance is being displayed
      - **Test**: 
        Given fetchBalance returns a result with cached: true
        When the status bar is updated
        Then a message should be sent to the Home panel webview via postMessage
        Indicating that a cached balance is being displayed
        Given fetchBalance returns a result with cached: false
        When the status bar is updated
        Then either no message should be sent to the Home panel
        Or a message should be sent indicating fresh data is being displayed
      - **Depends on**: Subtask 5.2

- [ ] Task 6: Edge cases and polish
  - **Problem:** Token expiry, malformed JWT, BYOK misconfiguration
  - **Test:** 
    Given the extension is running
    When various edge cases occur
    Then the extension should handle them gracefully without crashing
    And the user should receive appropriate feedback
  - **Subtasks:**
    - [ ] Subtask 6.1: On balance fetch 401, auto-sign-out and show "Session expired, please sign in again"
      - **Objective**: Handle 401 Unauthorized responses from balance API by automatically signing out the user and showing an appropriate message
      - **Test**: 
        Given the extension is in authenticated state
        When fetchBalance() receives a 401 response from the API
        Then the user should be automatically signed out
        And the session state should transition to UNAUTHENTICATED
        And a notification should be shown: "Session expired, please sign in again"
      - **Depends on**: Task 1 Subtask 1.4, Task 5
    - [ ] Subtask 6.2: On malformed JWT, clear secret and treat as unauthenticated
      - **Objective**: Handle malformed or invalid JWT tokens by clearing them from secrets and treating the user as unauthenticated
      - **Test**: 
        Given context.secrets contains a malformed JWT token
        When detectSessionState() is called
        Then the token should be removed from context.secrets
        And the function should return SessionState.UNAUTHENTICATED
        Given context.secrets contains an expired JWT token
        When detectSessionState() is called
        Then the token should be removed from context.secrets
        And the function should return SessionState.UNAUTHENTICATED
      - **Depends on**: Task 1 Subtask 1.2
    - [ ] Subtask 6.3: On BYOK configured but missing key, show warning in Home panel
      - **Objective**: Handle BYOK configuration that exists but is missing the actual API key by showing a warning in the Home panel
      - **Test**: 
        Given globalState contains BYOK configuration but the API key is missing or empty
        When the Home panel is rendered
        Then a warning message should be displayed indicating the BYOK configuration is incomplete
        And the user should be prompted to configure their BYOK key properly
        Given globalState contains BYOK configuration with a valid API key
        When the Home panel is rendered
        Then no warning should be displayed
        And normal BYOK functionality should be available
      - **Depends on**: Task 3 Subtask 3.2
