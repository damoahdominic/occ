# PRD: Ticket 006 - Sign Out

## 1. Problem Statement

Users need a way to sign out of their OCC session (authenticated mode) to switch accounts, revoke access, or return to BYOK/unauthenticated state. The sign-out flow must securely clear the JWT token and any cached balance, reset the session state to `unauthenticated`, and return the user to the onboarding start (step 0) in the Home panel. The session state change should also hide the status bar balance item.

## 2. Proposed Solution

Implement `signOut()` in the `auth.ts` module and wire it to UI elements:

- `auth.signOut()`:
  - `await context.secrets.delete('occ.sessionToken')`
  - `globalState.update('balance', null)` (clear cached balance)
  - `setSessionState(SessionState.UNAUTHENTICATED)`
  - Optionally `vscode.commands.executeCommand('occ.home.focus')` to return to onboarding

- UI triggers:
  - "Sign Out" button in Settings panel (ticket-005)
  - "Sign Out" button in Home panel (when authenticated)
  - Possibly a command pallet command "OCC: Sign Out"

- Ensure all components react to the state change:
  - Status bar hides (already covered in ticket-003)
  - Home panel switches to onboarding step 0
  - Settings panel OCC Credits card now shows "Sign in to MBA.sh" instead of account info

## 3. Acceptance Criteria

- User can trigger sign-out from Settings panel or Home panel
- After sign-out:
  - JWT token is removed from `context.secrets`
  - Cached balance is cleared from `globalState`
  - Session state becomes `UNAUTHENTICATED`
  - Home panel automatically opens and shows onboarding step 0
  - Status bar balance item disappears
  - Settings OCC Credits card shows "Sign in to MBA.sh" button
- Attempting to use MoltPilot inference after sign-out should fail with clear "not authenticated" error and guide to sign in
- Sign-out is idempotent: calling it when already unauthenticated does nothing (no error)

## 4. Technical Considerations

- **Security:** Use `context.secrets.delete()` for JWT; ensure no residual copies in `globalState` or other storage
- **State propagation:** The `setSessionState()` method from ticket-003 should broadcast an event so all UI components update instantly
- **Race conditions:** If sign-out occurs during an in-flight API call, the call should be aborted or ignored when it returns
- **User experience:** Provide a confirmation dialog? Probably not for now; keep it simple but allow undo within 5 seconds via toast (optional, nice-to-have)
- **Cleanup:** Any open webviews (Home) should receive the state change via `postMessage` to re-render

## 5. Dependencies

- **ticket-003-session-state-modes:** `auth.signOut()` and state change propagation
- **ticket-005-settings-panel-occ-credits:** Settings UI button wiring
- Home panel updates (part of ticket-003 maybe)

## 6. Subtask Checklist

- [ ] Task 1: Implement `auth.signOut()` function
  - **Problem:** Centralized sign-out logic
  - **Test:** Calling `signOut()` clears token, balance, and sets state to UNAUTHENTICATED
  - **Subtasks:**
    - [ ] Subtask 1.1: `context.secrets.delete('occ.sessionToken')`
    - [ ] Subtask 1.2: `globalState.update('balance', null)`
    - [ ] Subtask 1.3: `setSessionState(SessionState.UNAUTHENTICATED)`
    - [ ] Subtask 1.4: Emit custom event `'sessionStateChanged'` with new state

- [ ] Task 2: Add UI buttons in Settings and Home
  - **Problem:** Need entry points for user to trigger sign-out
  - **Test:** Buttons visible when authenticated; clicking triggers sign-out
  - **Subtasks:**
    - [ ] Subtask 2.1: In Settings OCC Credits card (ticket-005), add "Sign Out" button that calls `auth.signOut()`
    - [ ] Subtask 2.2: In Home panel authenticated view, add "Sign Out" button wired to extension command `occ.signOut`
    - [ ] Subtask 2.3: In `extension.ts`, register command `'occ.signOut'` that calls `auth.signOut()`

- [ ] Task 3: Ensure UI reacts to state change
  - **Problem:** Components must update immediately after sign-out
  - **Test:** After sign-out, Settings card shows "Sign in", Home shows onboarding, status bar hides
  - **Subtasks:**
    - [ ] Subtask 3.1: Settings panel listens to session state changes (via `globalState` or extension messages) and re-renders card conditions accordingly
    - [ ] Subtask 3.2: Home panel listens for `'sessionStateChanged'` and navigates to step 0 if state is UNAUTHENTICATED
    - [ ] Subtask 3.3: Status bar already listens to state (ticket-003); verify it hides on sign-out

- [ ] Task 4: Guard inference requests after sign-out
  - **Problem:** If a chat request is in flight during sign-out, or after, it should not use deleted token
  - **Test:** Sending a message after sign-out yields "not authenticated" error; UI shows helpful message
  - **Subtasks:**
    - [ ] Subtask 4.1: In inference handler, check `sessionState === AUTHENTICATED` before attaching token
    - [ ] Subtask 4.2: If not authenticated, return immediate error: "You are signed out. Please sign in to use chat."
    - [ ] Subtask 4.3: Chat UI should display error and possibly offer "Sign In" button

- [ ] Task 5: Optional: Undo toast
  - **Problem:** Accidental sign-out should be recoverable
  - **Test:** After sign-out, a toast appears: "Signed out. Undo?" with 5s timeout; clicking Undo re-signs in with previous token (if still valid)
  - **Subtasks:**
    - [ ] Subtask 5.1: In `signOut()`, show `vscode.window.showInformationMessage('Signed out. Undo?', 'Undo')`
    - [ ] Subtask 5.2: If user clicks Undo within 5s, re-store the token from backup (copy token before delete) and restore state to AUTHENTICATED
    - [ ] Subtask 5.3: Set a 5-second timeout to clear backup after sign-out

- [ ] Task 6: Testing and polish
  - **Problem:** Ensure flow works end-to-end
  - **Test:** Manual test: sign in → verify UI → sign out → verify unauth UI; try to chat → blocked
  - **Subtasks:**
    - [ ] Subtask 6.1: Test sign-out from Settings
    - [ ] Subtask 6.2: Test sign-out from Home
    - [ ] Subtask 6.3: Test sign-out during chat request (should cancel)
    - [ ] Subtask 6.4: Verify no console errors in developer console
