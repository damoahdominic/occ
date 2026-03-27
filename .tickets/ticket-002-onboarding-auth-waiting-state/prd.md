# PRD: Ticket 002 - Onboarding Flow — Auth Waiting State

## 1. Problem Statement

The current onboarding flow does not handle the web-based authentication flow gracefully. When a user clicks "Sign in with OCC" (or "Create Account"), they are redirected to the browser to complete sign-up at MBA.sh. After successful authentication, the backend should redirect back to the editor via a deep-link (`occ-editor://auth?token=<jwt>&balance=<usd>`). The editor must register a URI handler to receive this callback and transition from a "waiting" state to the authenticated state automatically. Without this, users must manually restart the editor or proceed without proper authentication.

## 2. Proposed Solution

Implement a waiting state in the onboarding flow with URI handler registration:

1. `chooseFree()` opens `https://mba.sh/signup?ref=occ-editor` in system browser
2. Onboarding wizard transitions to a new **"Waiting for sign-in…"** step showing a spinner and a Cancel button
3. Extension registers an `occ-editor://` URI scheme handler on activation
4. When the system browser redirects to `occ-editor://auth?token=<jwt>&balance=<usd>`:
   - Store JWT in `context.secrets` (encrypted by VS Code, not in plain `globalState`)
   - Dismiss the waiting state and proceed to gateway setup
5. Cancel button returns user to step 0 (onboarding start)

## 3. Acceptance Criteria

- Clicking "Create Account" opens the default browser to `https://mba.sh/signup?ref=occ-editor`
- Onboarding UI shows a "Waiting for sign-in…" step with spinner animation and Cancel button
- The extension successfully registers the `occ-editor://` URI handler
- After completing sign-up in browser, the editor window gains focus and the onboarding flow automatically advances to the next step
- JWT token is stored securely in `context.secrets` (not in plaintext global storage)
- Balance value from the callback is displayed correctly in the status bar after login
- Cancel button works at any time during waiting state and returns to step 0

## 4. Technical Considerations

- **VS Code extension API:** Use `vscode.env.registerUriHandler` to handle deep-links
- **Security:** JWT must be stored in `context.secrets` (VS Code's encrypted secret storage)
- **State management:** The waiting state needs to be persisted across extension reactivations (in case user switches away and returns)
- **Race conditions:** The callback may arrive before the handler is registered; consider queuing or immediate state check on activation
- **Browser redirect:** Backend at MBA.sh must be configured to redirect to `occ-editor://auth` on successful signup

## 5. Dependencies

- **ticket-001-onboarding-copy-update:** Copy should already reflect MBA.sh sign-up
- Backend B1 (Auth — sign up & JWT issuance): The MBA.sh backend must exist and produce the redirect

## 6. Subtask Checklist

- [ ] Task 1: Implement URI handler registration
  - **Problem:** Need to capture the deep-link callback
  - **Test:** After sign-up, editor receives the `token` and `balance` query params
  - **Subtasks:**
    - [ ] Subtask 1.1: Add `vscode.env.registerUriHandler` in extension activation
    - [ ] Subtask 1.2: Define `handleUri(uri: Uri)` method to parse JWT and balance
    - [ ] Subtask 1.3: Validate token format and balance range before storing

- [ ] Task 2: Store JWT securely and update global state
  - **Problem:** Avoid plaintext storage; notify system of auth
  - **Test:** `context.secrets.get('occ.sessionToken')` returns JWT; `globalState` reflects `authenticated` mode
  - **Subtasks:**
    - [ ] Subtask 2.1: `context.secrets.store('occ.sessionToken', token)`
    - [ ] Subtask 2.2: `globalState.update('balance', parsedBalance)`
    - [ ] Subtask 2.3: `globalState.update('sessionState', 'authenticated')`
    - [ ] Subtask 2.4: Dispatch custom event to update UI panels

- [ ] Task 3: Create "Waiting for sign-in…" onboarding step
  - **Problem:** Provide visible feedback while user is in browser
  - **Test:** Panel shows spinner + "Waiting for sign-in…" + Cancel button
  - **Subtasks:**
    - [ ] Subtask 3.1: Add new step to onboarding flow state machine
    - [ ] Subtask 3.2: Design and render spinner UI (reuse existing loading indicator if available)
    - [ ] Subtask 3.3: Wire Cancel button to reset state to step 0

- [ ] Task 4: Modify `chooseFree()` to open browser and set waiting state
  - **Problem:** Current flow likely just opens browser and stays on same step
  - **Test:** After clicking Create Account, browser opens and onboarding transitions to waiting step
  - **Subtasks:**
    - [ ] Subtask 4.1: `vscode.env.openExternal(vscode.Uri.parse('https://mba.sh/signup?ref=occ-editor'))`
    - [ ] Subtask 4.2: Set onboarding step index to "waiting" state
    - [ ] Subtask 4.3: Ensure Cancel button is prominent

- [ ] Task 5: Edge case handling
  - **Problem:** What if backend fails, or redirect never happens?
  - **Test:** Cancellation or timeout returns user to start cleanly
  - **Subtasks:**
    - [ ] Subtask 5.1: On URI handler error, show error toast and reset
    - [ ] Subtask 5.2: Consider a 5-minute timeout that auto-cancels (optional)
    - [ ] Subtask 5.3: If token invalid (e.g., tampered), clear storage and show error
