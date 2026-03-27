# PRD: Ticket 004 - Status Bar — Stub Mode

## 1. Problem Statement

The status bar balance display needs to reflect the new OCC Credits model during the stub phase (before backend B2 is available). It should show a $5.00 free credit cap, animate smoothly when the balance changes, provide a tooltip with current value and "Get More Credits" link, and change colors based on remaining balance thresholds. The status bar item should be visible only when the session state is `authenticated` (not in BYOK or unauthenticated states).

## 2. Proposed Solution

Update the status bar implementation in `extensions/openclaw/src/extension.ts`:

- Change `BALANCE_CAP` constant from `1.00` to `5.00`
- Update all `$1` user-facing copy to `$5`
- Add a `fetchBalance()` stub that returns the value from `globalState` (simulating backend response)
- Add smooth animation when balance decreases (use incremental steps or transition effect)
- Implement color thresholds: yellow/warning when balance < $0.20, red/error when near $0.00 (e.g., ≤ $0.05)
- Create a tooltip on hover that shows: "OCC Credits: $X.XX — Get More Credits" (link opens `https://mba.sh/credits`)
- Auto-refresh balance every ~60 seconds while editor is open (calls `fetchBalance()`)
- Ensure visibility tied to `sessionState === AUTHENTICATED`

The stub should be easily swappable for real API calls when backend is ready.

## 3. Acceptance Criteria

- Status bar item appears in bottom-right when authenticated, with text `$5.00` initially (or actual balance)
- When user sends a chat message, balance decreases smoothly (animation duration ~500ms) to reflect inferred cost
- Balance turns yellow when below $0.20, red when ≤ $0.05
- Hovering over balance shows tooltip: "OCC Credits: $X.XX — Get More Credits" where "Get More Credits" is a clickable link to `https://mba.sh/credits`
- Clicking the balance opens the credits page in browser (or executes command to open URL)
- Balance auto-updates every 60 seconds (network call simulated by stub)
- When user signs out or switches to BYOK state, status bar item hides
- If offline, status bar continues to show last-known balance without animation errors

## 4. Technical Considerations

- **Animation:** Use VS Code's `window.withProgress` or custom timer to step the displayed value from old→new
- **Colors:** Use `statusBarItem.backgroundColor` or icon theme colors; ensure they adapt to light/dark themes
- **Tooltips:** `statusBarItem.tooltip` can contain HTML-like text but not full links; consider `vscode.env.openExternal` on click instead
- **Click action:** Register `statusBarItem.command` to open credits URL
- **Polling:** Use `setInterval` in extension activation; clear on deactivation
- **Swap to real API:** Abstract `fetchBalance()` behind an interface; stub returns `globalState.get('balance')` while real version calls `GET /api/v1/balance`

## 5. Dependencies

- **ticket-003-session-state-modes:** Session state manager must exist and update status bar visibility
- Backend B2 (Balance API): Will replace stub later

## 6. Subtask Checklist

- [ ] Task 1: Update constants and UI defaults
  - **Problem:** Stub needs correct cap and copy
  - **Test:** Code contains `BALANCE_CAP = 5.00` and "$5" strings
  - **Subtasks:**
    - [ ] Subtask 1.1: Change hardcoded `1.00` to `5.00` in balance logic
    - [ ] Subtask 1.2: Search/replace "$1" → "$5" in user-facing strings

- [ ] Task 2: Implement `fetchBalance()` stub
  - **Problem:** Simulate backend until B2 is ready
  - **Test:** Function returns Promise<number> from `globalState.get('balance')`
  - **Subtasks:**
    - [ ] Subtask 2.1: Add `fetchBalance(): Promise<number>` that reads `globalState.get('balance')` (default 5.00)
    - [ ] Subtable 2.2: Ensure it returns a Promise to match async real API shape

- [ ] Task 3: Create/update status bar item with color thresholds
  - **Problem:** Visual feedback for low balance
  - **Test:** Status bar color changes as balance crosses <0.20 and ≤0.05
  - **Subtasks:**
    - [ ] Subtask 3.1: Create `StatusBar` class or update existing with `updateBalance(amount: number)` method
    - [ ] Subtask 3.2: Compute color: if amount ≤ 0.05 → red theme; else if amount < 0.20 → yellow; else default
    - [ ] Subtask 3.3: Set `statusBarItem.backgroundColor` accordingly (or use `statusBarItem.name` with theme color identifiers)

- [ ] Task 4: Add smooth balance decrease animation
  - **Problem:** Balance jumps are jarring; need gradual update
  - **Test:** When cost is deducted, display counts down from old→new over ~500ms
  - **Subtasks:**
    - [ ] Subtask 4.1: Implement `animateBalance(from: number, to: number, durationMs: number)`
    - [ ] Subtask 4.2: Use `setInterval` or `requestAnimationFrame` style stepping
    - [ ] Subtask 4.3: Cancel any running animation if a new update arrives mid-flight

- [ ] Task 5: Implement tooltip and click-to-top-up
  - **Problem:** Users need easy path to add credits
  - **Test:** Hover shows formatted tooltip; click opens browser to `https://mba.sh/credits`
  - **Subtasks:**
    - [ ] Subtask 5.1: Set `statusBarItem.tooltip` to `OCC Credits: $${balance.toFixed(2)} — Get More Credits`
    - [ ] Subtask 5.2: Register `statusBarItem.command = 'occ.openCreditsPage'`
    - [ ] Subtask 5.3: In `extension.ts`, register command that calls `vscode.env.openExternal(vscode.Uri.parse('https://mba.sh/credits'))`

- [ ] Task 6: Balance polling and state-based visibility
  - **Problem:** Keep balance fresh; hide when not authenticated
  - **Test:** Polls every 60s, updates if changed; hides on sign-out/BYOK
  - **Subtasks:**
    - [ ] Subtask 6.1: In session state manager, when state is `authenticated`, start polling: `setInterval(fetchAndUpdateBalance, 60000)`
    - [ ] Subtask 6.2: On state change to non-authenticated, clear interval and `statusBarItem.hide()`
    - [ ] Subtask 6.3: On state change to authenticated, `statusBarItem.show()` and trigger immediate fetch

- [ ] Task 7: Integrate with chat inference cost deduction
  - **Problem:** Balance must decrement when user sends a chat message
  - **Test:** After chat completion, balance decreases by the cost reported in `x-litellm-response-cost` header (or simulated stub)
  - **Subtasks:**
    - [ ] Subtask 7.1: In the MoltPilot inference handler, read response header `x-litellm-response-cost`
    - [ ] Subtask 7.2: `currentBalance -= cost`; save to `globalState.set('balance', currentBalance)`
    - [ ] Subtask 7.3: Call `animateBalance(old, new)` to reflect change

- [ ] Task 8: Offline/cached fallback
  - **Problem:** Stub should never crash if network fails (future real API)
  - **Test:** If fetchBalance() throws, continue showing last-known value without animation hiccup
  - [ ] Subtask 8.1: Wrap fetch in try/catch; on error, keep previous balance and optionally show warning notification
