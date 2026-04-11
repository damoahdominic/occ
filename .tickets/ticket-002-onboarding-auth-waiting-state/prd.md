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

- [x] Task 1: Implement URI handler registration
   - **Problem:** Need to capture the deep-link callback
   - **Test:** After sign-up, editor receives the `token` and `balance` query params
   - **Subtasks:**
     - [x] Subtask 1.1: Add `vscode.env.registerUriHandler` in extension activation
     - [x] Subtask 1.2: Define `handleUri(uri: Uri)` method to parse JWT and balance
     - [x] Subtask 1.3: Validate token format and balance range before storing

- [x] Task 2: Store JWT securely and update global state
    - **Problem:** Avoid plaintext storage; notify system of auth
    - **Test:** 
      Given the extension has received a valid JWT and balance from the URI callback
      When the secure storage functions are called
      Then the JWT is stored in `context.secrets` and retrievable
      And the balance is stored in `globalState` 
      And the session state is updated to 'authenticated' in `globalState`
    - **Subtasks:**
      - [x] Subtask 2.1: `context.secrets.store('occ.sessionToken', token)`
        - **Objective:** Securely store the JWT token in VS Code's encrypted secret storage
        - **Test:** 
          Given a valid JWT token
          When `context.secrets.store('occ.sessionToken', token)` is called
          Then the token is stored securely
          And `context.secrets.get('occ.sessionToken')` returns the same token
        - **Depends on:** Task 1.3 (token validation)
      - [x] Subtask 2.2: `globalState.update('balance', parsedBalance)`
        - **Objective:** Store the balance value in global state for UI access
        - **Test:** 
          Given a valid balance amount
          When `globalState.update('balance', parsedBalance)` is called
          Then the balance is stored in global state
          And `globalState.get('balance')` returns the same value
        - **Depends on:** Task 1.3 (balance validation)
      - [x] Subtask 2.3: `globalState.update('sessionState', 'authenticated')`
        - **Objective:** Update the session state to reflect authenticated status
        - **Test:** 
          Given the extension is processing a successful authentication
          When `globalState.update('sessionState', 'authenticated')` is called
          Then the session state is set to 'authenticated'
          And `globalState.get('sessionState')` returns 'authenticated'
        - **Depends on:** Subtask 2.2
      - [x] Subtask 2.4: Dispatch custom event to update UI panels
        - **Objective:** Notify the UI that authentication state has changed
        - **Test:** 
          Given the session state has been updated to authenticated
          When the custom event is dispatched
          Then UI panels receive the update and refresh accordingly
          And the waiting state is dismissed
          And the onboarding flow proceeds to the next step
        - **Depends on:** Subtask 2.3

- [x] Task 3: Create "Waiting for sign-in…" onboarding step
   - **Problem:** Provide visible feedback while user is in browser
   - **Test:** 
     Given the user clicks "Create Account" in the onboarding flow
     When the onboarding flow transitions to the waiting state
     Then the panel shows a spinner animation
     And displays the text "Waiting for sign-in…"
     And shows a prominent Cancel button
   - **Subtasks:**
     - [x] Subtask 3.1: Add new step to onboarding flow state machine
       - **Objective:** Add a waiting state to the onboarding flow state machine
       - **Test:** 
         Given the onboarding flow state machine exists
         When a new waiting state is added
         Then the state machine includes the waiting state as a valid step
         And transitions to/from the waiting state are defined
       - **Depends on:** None
     - [x] Subtask 3.2: Design and render spinner UI (reuse existing loading indicator if available)
       - **Objective:** Implement the visual components for the waiting step
       - **Test:** 
         Given the waiting state is active
         When the waiting step UI is rendered
         Then a spinner animation is visible
         And the text "Waiting for sign-in…" is displayed
         And a Cancel button is present and interactive
       - **Depends on:** Subtask 3.1
     - [x] Subtask 3.3: Wire Cancel button to reset state to step 0
       - **Objective:** Make the Cancel button functional to return to start
       - **Test:** 
         Given the user is on the waiting step
         When the Cancel button is clicked
         Then the onboarding flow returns to step 0
         And any temporary UI state from the waiting step is cleaned up
       - **Depends on:** Subtask 3.2

- [x] Task 4: Modify `chooseFree()` to open browser and set waiting state
   - **Problem:** Current flow likely just opens browser and stays on same step
   - **Test:** 
     Given the user is on the onboarding flow step 0
     When the user clicks the "Create Account" button
     Then the system browser opens to https://mba.sh/signup?ref=occ-editor
     And the onboarding flow transitions to the waiting state
     And the waiting step UI is displayed
   - **Subtasks:**
     - [x] Subtask 4.1: `vscode.env.openExternal(vscode.Uri.parse('https://mba.sh/signup?ref=occ-editor'))`
       - **Objective:** Open the system browser to the MBA.sh sign-up page
       - **Test:** 
         Given the user is on the onboarding flow step 0
         When the user clicks the "Create Account" button
         Then the system browser opens to https://mba.sh/signup?ref=occ-editor
       - **Depends on:** None
     - [x] Subtask 4.2: Set onboarding step index to "waiting" state
       - **Objective:** Transition the onboarding flow to the waiting state
       - **Test:** 
         Given the waiting state has been added to the onboarding flow
         When the user clicks the "Create Account" button
         Then the onboarding step index is set to the waiting state
         And the waiting state UI is displayed
       - **Depends on:** Subtask 4.1
     - [x] Subtask 4.3: Ensure Cancel button is prominent
       - **Objective:** Make sure the Cancel button is clearly visible and accessible
       - **Test:** 
         Given the waiting state UI is rendered
         When the user views the waiting step
         Then the Cancel button is prominent and easily clickable
         And the Cancel button functions correctly to return to step 0
       - **Depends on:** Subtask 4.2

- [x] Task 5: Edge case handling
   - **Problem:** What if backend fails, or redirect never happens?
   - **Test:** 
     Given the user is in the waiting state for authentication
     When an error occurs or the user cancels
     Then the user is returned to a clean starting state
     And no invalid data persists in storage
   - **Subtasks:**
     - [x] Subtask 5.1: On URI handler error, show error toast and reset
       - **Objective:** Handle errors during URI processing gracefully
       - **Test:** 
         Given the extension is waiting for authentication callback
         When the URI handler encounters an error processing the token
         Then an error toast is shown with details
         And the waiting state is reset
         And the user remains in the waiting step to try again
         And no invalid data is stored in secrets or globalState
       - **Depends on:** Task 1.3 (validation logic)
     - [x] Subtask 5.2: Consider a 5-minute timeout that auto-cancels (optional)
       - **Objective:** Implement automatic timeout for the waiting state
       - **Test:** 
         Given the user is in the waiting state
         When 5 minutes elapse without authentication callback
         Then the waiting state automatically resets
         And the user is returned to step 0 of onboarding
         And a timeout notification is shown
       - **Depends on:** Subtask 3.1 (waiting state exists)
     - [x] Subtask 5.3: If token invalid (e.g., tampered), clear storage and show error
       - **Objective:** Detect and handle invalid or tampered tokens
       - **Test:** 
         Given the browser redirects to occ-editor://auth?token=<invalid_token>&balance=<usd>
         When the extension receives the URI callback
         Then an error toast is shown indicating authentication failed
         And the waiting state is reset
         And the user remains in the waiting step to try again
         And no invalid data is stored in secrets or globalState
       - **Depends on:** Task 1.3 (validation logic)
