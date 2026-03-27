# PRD: Ticket 003 - Session State (Three Modes)

## 1. Problem Statement

The extension must correctly represent three mutually exclusive authentication/session states on every activation:

| State | Condition | Behaviour |
|-------|-----------|-----------|
| `unauthenticated` | No JWT token, no BYOK config | Show onboarding flow |
| `authenticated` | Valid JWT present in `context.secrets` | Show balance bar, block inference if balance $0 |
| `byok` | BYOK provider configured (user supplies own API key) | Hide balance bar, allow unlimited inference |

Currently the state handling is likely ad-hoc, leading to inconsistent UI and possible security issues (e.g., showing balance when not authenticated, or allowing inference without proper auth).

## 2. Proposed Solution

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

- On fresh launch with no token and no BYOK: Home panel shows onboarding step 0 automatically
- On launch with valid JWT: balance bar appears with correct balance (or cached value with label if offline)
- On launch with BYOK configured: no balance bar, MoltPilot inference works with user's key
- Launching with both JWT and BYOK: JWT takes precedence (authenticated state)
- When balance reaches $0 in `authenticated` state: inference calls are blocked and UI suggests top-up
- When user signs out (deletes token): state transitions to `unauthenticated` and onboarding appears
- State persists across editor restarts (JWT in secrets, BYOK in globalState)
- Network errors during balance fetch do not crash the extension; fallback balance is clearly labelled as stale

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
  - **Test:** Module exports `getSessionState()`, `setSessionState()`, `signOut()`, `fetchBalance()`
  - **Subtasks:**
    - [ ] Subtask 1.1: Define enum `SessionState`
    - [ ] Subtask 1.2: Implement `detectSessionState()` that reads secrets + globalState
    - [ ] Subtask 1.3: Implement `fetchBalance()` (calls `/api/v1/balance` or returns cached)
    - [ ] Subtask 1.4: Implement `signOut()` that clears token and resets state

- [ ] Task 2: Integrate state manager into extension activation
  - **Problem:** Activation should immediately determine state and update UI
  - **Test:** On every extension activation, the correct panel/status bar appears
  - **Subtasks:**
    - [ ] Subtask 2.1: In `extension.ts` `activate()`, call `auth.detectSessionState()`
    - [ ] Subtask 2.2: State `unauthenticated` → `vscode.commands.executeCommand('occ.home.focus')`
    - [ ] Subtask 2.3: State `authenticated` → start balance polling (every 60s)
    - [ ] Subtask 2.4: State `byok` → ensure balance bar hidden, no polls

- [ ] Task 3: Update Home panel to respect session state
  - **Problem:** Home should show different content based on state
  - **Test:** Panel renders onboarding when unauth, dashboard when auth, appropriate message when BYOK
  - **Subtasks:**
    - [ ] Subtask 3.1: Pass current `SessionState` to Home webview via `postMessage`
    - [ ] Subtask 3.2: In `home.ts` (renderer), switch on state to show proper section
    - [ ] Subtask 3.3: Ensure "Sign out" button appears only in authenticated/BYOK states

- [ ] Task 4: Update Status bar (balance item) visibility
  - **Problem:** Balance bar should only appear when authenticated
  - **Test:** Status bar item creates/updates only in `authenticated` state, hides otherwise
  - **Subtasks:**
    - [ ] Subtask 4.1: In `extension.ts` status bar creation, check `sessionState === AUTHENTICATED`
    - [ ] Subtask 4.2: When state changes to non-authenticated, `statusBarItem.hide()`
    - [ ] Subtask 4.3: When state becomes authenticated, `statusBarItem.show()` and set text

- [ ] Task 5: Balance fetch with fallback and stale labeling
  - **Problem:** Network failures should not leave user in limbo
  - **Test:** If `/balance` fails, last-known balance from `globalState` is used with "[cached]" suffix
  - **Subtasks:**
    - [ ] Subtask 5.1: In `fetchBalance()`, catch network errors and read `globalState.get('cachedBalance')`
    - [ ] Subtask 5.2: Return object `{ balance, cached: true/false }`
    - [ ] Subtask 5.3: Status bar format: `${balance.toFixed(2)} USD` (normal) or `${balance.toFixed(2)} USD [cached]` (stale)
    - [ ] Subtask 5.4: Also postMessage to Home panel to show cached notice if needed

- [ ] Task 6: Edge cases and polish
  - **Problem:** Token expiry, malformed JWT, BYOK misconfiguration
  - **Test:** Extension handles these gracefully without crashing
  - **Subtasks:**
    - [ ] Subtask 6.1: On balance fetch 401, auto-sign-out and show "Session expired, please sign in again"
    - [ ] Subtask 6.2: On malformed JWT, clear secret and treat as unauthenticated
    - [ ] Subtask 6.3: On BYOK configured but missing key, show warning in Home panel
