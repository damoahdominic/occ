# PRD: Ticket 015 - Network Error UI Improvements

## 1. Problem Statement

When the editor encounters network errors (e.g., failed download of VSCodium, inability to reach MBA.sh for balance or auth, Stripe checkout issues), the user currently sees a generic error or a blank screen with no clear recovery path. The UI should provide meaningful error messages, retry options, and offline fallbacks where possible. This ticket improves the error handling and user feedback across the OCCode extension, especially in the Home panel and any async operations.

## 2. Proposed Solution

Implement a unified error display component and enhance error handling in key flows:

- **Home panel:** When an operation fails (install OpenClaw, fetch balance, start gateway), show a retryable error card with:
  - Clear title ("Installation Failed" / "Network Error")
  - Human-readable description (what went wrong, e.g., "Could not download VSCodium. Check your internet connection.")
  - "Retry" button that re-invokes the failed operation
  - "Skip" or "Continue Offline" where applicable (e.g., skip VSCodium install if user already has it)
  - Optional "Copy error details" button to capture logs for support
- **Status bar:** If balance fetch fails repeatedly, show warning icon with tooltip "Unable to update balance (offline)". Keep last-known value but indicate staleness.
- **Settings panel:** When OCC Credits API calls fail, show non-blocking warning banner: "Using cached data. Some features may be limited."
- **General:** All `fetch()` calls should catch errors and surface via a user-friendly error handler rather than silently failing or showing stack traces.

The goal is to make the editor feel resilient and informative even when the network is unreliable.

## 3. Acceptance Criteria

- Any network error during VSCodium download shows a retryable error in the Home panel with clear context
- Clicking "Retry" attempts the operation again
- Balance fetch failures do not crash the status bar; status bar shows a warning icon and/or `[offline]` suffix
- After multiple consecutive balance failures (e.g., 3), the UI suggests "Sign out and back in" or "Check network"
- Errors are logged to the developer console with full details for debugging
- The editor provides a "Copy error details" button that copies stack trace + error message to clipboard
- Offline mode: If the user is `byok` or has cached balance, core chat functionality still works despite network errors
- No uncaught promise rejections appear in console from OCC extension

## 4. Technical Considerations

- **Error boundary:** The Home webview should have an error boundary that catches render errors and shows a fallback UI with "Reload panel" button.
- **Standardized error format:** Define an `AppError` class with fields: `{ code: 'NETWORK'|'AUTH'|'INSTALL'|'UNKNOWN', message: string, details?: any, retryable: boolean }`. Convert all fetch rejections into `AppError`.
- **Retry logic:** Implement exponential backoff for retryable network errors (e.g., up to 3 attempts with jitter). Provide manual "Retry" button indefinitely.
- **User communication:** Avoid technical jargon. Use plain language: "Could not connect to server. Check your internet connection and try again."
- **Offline detection:** Use `navigator.onLine` in the webview to detect offline status and show distinct UI ("You appear to be offline").
- **Logging:** In extension host, use `console.error` with full error objects; in production, consider sending to an error reporting service (e.g., Sentry) optionally.
- **Consistency:** Apply error handling consistently across all async operations: install, balance, gateway start/stop, Stripe checkout, sign-in.

## 5. Dependencies

- None; this is cross-cutting UI improvement

## 6. Subtask Checklist

- [ ] Task 1: Create error handling utilities
  - **Problem:** Need a common way to wrap async calls and surface errors to UI
  - **Test:** All important async calls are wrapped by error handler that posts `onError` to webview
  - **Subtasks:**
    - [ ] Subtask 1.1: Define `src/common/errors.ts` with `AppError` enum and constructor
    - [ ] Subtask 1.2: Implement `withErrorHandling<T>(fn: () => Promise<T>): Promise<T>` that catches and normalizes errors
    - [ ] Subtask 1.3: Create `ErrorDisplay` React component (or webview component) that takes `AppError` and renders title, message, retry button

- [ ] Task 2: Enhance Home panel error UI
  - **Problem:** Current errors may be silent or show raw stack
  - **Test:** When install fails, Home shows error card with "Retry" button; "Retry" works
  - **Subtasks:**
    - [ ] Subtask 2.1: In Home webview (`home.ts` renderer), add state for `currentError: AppError | null`
    - [ ] Subtask 2.2: When an operation (install OpenClaw, start gateway, auth flow) fails, set `currentError` with appropriate code/message
    - [ ] Subtask 2.3: Render `ErrorDisplay` component; on "Retry" click, clear error and re-run the failed operation (store the retry callback)
    - [ ] Subtask 2.4: Add "Copy details" that copies `error.stack` to clipboard via `navigator.clipboard.writeText`

- [ ] Task 3: Improve status bar error handling
  - **Problem:** Balance fetch failures may leave status bar in unknown state or crash
  - **Test:** Simulate network disconnect; status bar shows dimmed balance + warning icon, no crash
  - **Subtasks:**
    - [ ] Subtask 3.1: In `fetchBalance()` (ticket-004), catch network errors and return `null` or throw `AppError('NETWORK', 'Balance fetch failed')`
    - [ ] Subtask 3.2: In status bar update logic, if balance fetch fails, set text to last-known balance + `[offline]` and set background to orange/yellow warning color
    - [ ] Subtask 3.3: After 3 consecutive failures, show tooltip "Balance updates paused. Check your network."

- [ ] Task 4: Settings panel network warnings
  - **Problem:** User may not know settings are stale when offline
  - **Test:** Disconnect network; OCC Credits card shows "Using cached data" banner
  - **Subtasks:**
    - [ ] Subtask 4.1: In settings renderer, listen for `balanceFetchFailed` events from extension host
    - [ ] Subtask 4.2: Show a non-blocking warning banner within the card: "Updates paused (offline). Balance may be outdated."
    - [ ] Subtask 4.3: When network returns, automatically hide banner and refresh balance

- [ ] Task 5: Global error boundary for webview
  - **Problem:** Unhandled exceptions in React renderer could blank the panel
  - **Test:** Introduce test error (throw in componentDidMount); error boundary shows fallback UI with "Reload"
  - **Subtasks:**
    - [ ] Subtask 5.1: Wrap the root of Home webview in an error boundary (React 16+ `componentDidCatch` or `ErrorBoundary` component)
    - [ ] Subtask 5.2: Fallback UI: "Something went wrong. [Reload] [Copy error]" buttons
    - [ ] Subtask 5.3: "Reload" calls `window.location.reload()`; "Copy error" copies error info

- [ ] Task 6: Offline detection and messaging
  - **Problem:** User may be offline without realizing; auth flows will obviously fail
  - **Test:** Turn off Wi-Fi; Home panel banner: "You are offline. Some features are unavailable."
  - **Subtasks:**
    - [ ] Subtask 6.1: In Home webview, add `window.addEventListener('online', ...)` and `'offline'` to toggle `isOnline` state
    - [ ] Subtask 6.2: If offline, show persistent banner at top: "Offline — Please check your internet connection."
    - [ ] Subtask 6.3: Hide network-dependent UI elements when offline (e.g., disable "Sign in" button, gray out "Install OpenClaw")

- [ ] Task 7: Centralize fetch wrapper in extension host
  - **Problem:** Multiple module fetch calls may not handle errors consistently
  - **Test:** All HTTP calls go through `src/common/fetchWrapper.ts` that throws normalized `AppError`
  - **Subtasks:**
    - [ ] Subtask 7.1: Create `fetchJson(url, options)` that catches `fetch` errors, non-2xx status codes, and JSON parse errors
    - [ ] Subtask 7.2: Map to `AppError`: network error → `code: 'NETWORK'`, 401 → `code: 'AUTH'`, 402 → `code: 'INSUFFICIENT_CREDITS'`, 5xx → `code: 'SERVER'`, etc.
    - [ ] Subtask 7.3: Update all uses (balance, auth, inference) to use this wrapper

- [ ] Task 8: Testing and polish
  - **Problem:** Ensure error paths are covered
  - **Test:** Simulate various failures (no network, 500 from server, invalid JSON) and verify UI response
  - **Subtasks:**
    - [ ] Subtask 8.1: Write unit tests for `withErrorHandling` wrapper
    - [ ] Subtask 8.2: Write integration test for Home panel error rendering (using test webview)
    - [ ] Subtask 8.3: Manual QA: kill network, break backend, 404 assets, verify recoverability
