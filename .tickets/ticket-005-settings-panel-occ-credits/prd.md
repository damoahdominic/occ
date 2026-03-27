# PRD: Ticket 005 - Settings Panel — OCC Credits Card

## 1. Problem Statement

The Settings UI (VS Code settings panel) currently has an "OCC Free Tier" card that needs updating to match the new OCC Credits model with MBA.sh integration. The card should now reflect sign-up, authentication, live balance, and top-up capabilities. When not authenticated, the card should offer a "Sign in to MBA.sh" button. When authenticated, it should show account email, current balance (with cached fallback), "Buy More Credits" link, and a "Sign Out" button. The BYOK card should clearly state "Always free. No account needed." The card titles and subtitles must be updated to new branding.

## 2. Proposed Solution

Modify the settings panel component (likely `src/vs/workbench/contrib/void/browser/react/src/void-settings-tsx/Settings.tsx` or a similar path within the editor source) to implement the new OCC Credits card:

- Rename card 1 from "OCC Free Tier" to "OCC Credits"
- Update subtitle text: change "Use the built-in model. No API key needed — $1 of free inference included." → "Powered by MBA.sh. $5 free on sign-up. Buy more at standard rates."
- Card 2 "Bring Your Own Key": add "Always free. No account." as subtext under the title
- When OCC Credits is selected but user is **not authenticated**:
  - Do not show endpoint/key fields (use MBA.sh account)
  - Instead show a prominent "Sign in to MBA.sh" button that opens `https://mba.sh/login?ref=occ-editor` in browser
- When OCC Credits is selected **and authenticated**:
  - Show account email (from `GET /api/v1/me` or JWT decode)
  - Show live balance (from cached/real) with color based on threshold
  - Show "Buy More Credits" button linking to `https://mba.sh/billing`
  - Show "Sign Out" button that clears credentials
- Ensure the card respects the session state from `ticket-003`

## 3. Acceptance Criteria

- Settings panel loads without crashing after changes
- The OCC Credits card displays correct title and subtitle
- BYOK card displays "Always free. No account needed."
- If user is not authenticated with OCC Credits mode, the card shows "Sign in to MBA.sh" button instead of API endpoint/key inputs
- Clicking "Sign in to MBA.sh" opens the browser to MBA.sh login with proper `ref=occ-editor`
- If user is authenticated with OCC Credits:
  - Account email is displayed (truncated if long)
  - Balance is shown with correct formatting ($X.XX) and color
  - "Buy More Credits" opens `https://mba.sh/billing`
  - "Sign Out" button logs user out (clears token, resets state)
- Switching between OCC Credits and BYOK correctly shows/hides relevant sections
- Settings changes are persisted to `globalState` appropriately

## 4. Technical Considerations

- **File location:** The settings panel lives within the `apps/editor` fork; exact path may be `src/vs/workbench/contrib/void/browser/react/src/void-settings-tsx/Settings.tsx` or similar. Will need to locate the exact component responsible for the "OCC Free Tier" card.
- **State access:** The settings renderer likely does not have direct access to extension `context`. Must communicate via `postMessage` to the extension host, or read from `globalState` if it's a VS Code settings UI (which uses `ConfigurationTarget`).
- **Authentication state:** Use the `SessionState` from `ticket-003`; either expose via an event or query extension via `vscode.commands.executeCommand('occ.getSessionState')`.
- **Balance display:** Reuse the same balance formatting and color logic as the status bar (ticket-004) to stay consistent.
- **Sign out:** Should call the same `auth.signOut()` function used elsewhere.
- **Build:** The editor must be rebuilt after UI changes: `npm --prefix apps/editor run compile` or similar.

## 5. Dependencies

- **ticket-003-session-state-modes:** Need session state to drive UI variations
- **ticket-004-status-bar-stub-mode:** Balance formatting and color logic should be consistent
- Backend B1/B2: For real email and balance (stubbed for now)

## 6. Subtask Checklist

- [ ] Task 1: Locate settings panel component for OCC mode
  - **Problem:** Need exact file path and component structure
  - **Test:** Grep for "OCC Free Tier" or "Bring Your Own Key" in `apps/editor` source
  - **Subtasks:**
    - [ ] Subtask 1.1: Search `apps/editor` for "Free Tier" and "BYOK"
    - [ ] Subtask 1.2: Identify the React component that renders the card(s)
    - [ ] Subtask 1.3: Map the props/state that control which fields are shown

- [ ] Task 2: Update copy text
  - **Problem:** Replace outdated strings with new branding
  - **Test:** Render shows "$5 free on sign-up", "Always free. No account needed."
  - **Subtasks:**
    - [ ] Subtask 2.1: Change title "OCC Free Tier" → "OCC Credits"
    - [ ] Subtask 2.2: Update subtitle to "Powered by MBA.sh. $5 free on sign-up. Buy more at standard rates."
    - [ ] Subtask 2.3: Add "Always free. No account needed." to BYOK card

- [ ] Task 3: Implement conditional UI (authenticated vs not)
  - **Problem:** Show "Sign in" button if not auth; show account/balance/action buttons if auth
  - **Test:** UI switches correctly based on session state
  - **Subtasks:**
    - [ ] Subtask 3.1: Add state variable `isAuthenticated` (derived from session state)
    - [ ] Subtask 3.2: If OCC Credits selected && !isAuthenticated → render "Sign in to MBA.sh" button
    - [ ] Subtask 3.3: If OCC Credits selected && isAuthenticated → render email, balance, "Buy More Credits", "Sign Out"
    - [ ] Subtask 3.4: Ensure BYOK section does not show these auth-specific elements

- [ ] Task 4: Wire up "Sign in to MBA.sh" button
  - **Problem:** Opens browser to correct sign-up/login flow with referral
  - **Test:** Click opens `https://mba.sh/login?ref=occ-editor` (or signup if new user)
  - **Subtasks:**
    - [ ] Subtask 4.1: Button calls `vscode.env.openExternal` with the URL
    - [ ] Subtask 4.2: Use `ref=occ-editor` query param for attribution

- [ ] Task 5: Display account email and live balance
  - **Problem:** Show user who is logged in and their credit amount
  - **Test:** Email appears truncated (max ~30 chars); balance formatted with two decimals and appropriate color
  - **Subtasks:**
    - [ ] Subtask 5.1: Fetch email from JWT decode or `GET /api/v1/me` (stub returns cached)
    - [ ] Subtable 5.2: Fetch balance using same stub as status bar, display `$${balance.toFixed(2)}`
    - [ ] Subtask 5.3: Apply color: red if very low, yellow if low, default otherwise

- [ ] Task 6: "Buy More Credits" and "Sign Out" buttons
  - **Problem:** Provide clear next actions
  - **Test:** "Buy More Credits" opens `https://mba.sh/billing`; "Sign Out" triggers sign-out flow and returns to unauth state
  - **Subtasks:**
    - [ ] Subtask 6.1: "Buy More Credits" button calls `vscode.env.openExternal(vscode.Uri.parse('https://mba.sh/billing'))`
    - [ ] Subtask 6.2: "Sign Out" button calls `auth.signOut()` then resets settings view to OCC Credits mode (still selected) but now showing "Sign in" button

- [ ] Task 7: Ensure settings persistence and rebuild
  - **Problem:** Changes must survive rebuild and not regress
  - **Test:** `npm --prefix apps/editor run compile` succeeds; editor launches; settings persist across reloads
  - **Subtasks:**
    - [ ] Subtask 7.1: Run editor build script; fix any TypeScript errors
    - [ ] Subtask 7.2: Launch editor, verify settings UI appears correctly
    - [ ] Subtask 7.3: Change OCC mode between OCC Credits and BYOK, restart editor, confirm selection persists
