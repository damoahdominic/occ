# PRD: App Logging & Error Reporting System

## Problem Statement

The OCcode editor and OpenClaw Docker setup currently fail silently with blank screens. Users receive no feedback about what went wrong, and developers cannot diagnose issues without access to logs. 

Additional issues discovered:
- Docker setup stays on blank screen when provisioning fails
- Error messages not displayed to users (only logged to extension output)
- Custom data directory path not shown on confirmation step (always shows "(default)")

## Scope

Implement a centralized logging and error reporting system that:
1. **Captures** initialization errors, Docker setup failures, and runtime crashes
2. **Displays** user-friendly error messages with diagnostic info (logs, timestamps, error codes)
3. **Collects** recent app logs for developer review
4. **Sends** error context to developers (via API) without disrupting UX
5. **Gracefully degrades** if network is unavailable
6. **Shows** custom configuration values on confirmation page

## Technical Considerations

### Log Collection Points
- Extension activation errors (`home.ts` constructor)
- Docker provisioning failures (gateway start/health checks)
- Network errors (gateway connectivity, API calls)
- Webview communication errors
- System resource errors (disk space, permissions)

### Error Display UI
- Modal dialog with error summary and action buttons
- "View Logs" button to show recent entries (last 50-100 lines)
- "Retry" button for transient failures (network, timeout)
- "Report to Developer" button (optional manual escalation)
- "Dismiss" to close

### Log Shipping
- POST endpoint: `POST /api/v1/developer/error-report`
- Payload: `{ timestamp, errorCode, message, logs: [last 100 lines], systemInfo: {...} }`
- Fire-and-forget (don't block UX on network failure)
- Automatic on critical errors; manual opt-in for non-critical
- Store failed submissions locally for retry

### System Info to Include
- OS (Windows/macOS/Linux), CPU count, RAM available
- Node.js version, extension version
- Docker availability (installed/running)
- Gateway status (running/stopped/unhealthy)

## Files to Modify

1. **`apps/editor/extensions/openclaw/src/panels/home.ts`** (primary)
   - Wrap initialization in try-catch with error handling
   - Emit error events on failure
   - Show error modal if setup fails

2. **`apps/editor/extensions/openclaw/src/panels/errorReporting.ts`** (new)
   - `ErrorReporter` class: collect logs, ship to backend
   - `getSystemInfo()`, `collectRecentLogs()`, `sendErrorReport()`

3. **`apps/editor/extensions/openclaw/src/panels/errorModal.tsx`** (new React component)
   - Display error details with retry/view-logs/report buttons
   - Auto-hide after 10s on non-critical errors

## Acceptance Criteria

- [ ] When Docker setup fails, user sees error message (not blank screen)
- [ ] Error modal displays: error code, user-friendly message, "View Logs" button
- [ ] Error message shown inline on confirmation step (not just in output channel)
- [ ] "View Logs" shows last 50 lines from recent operations
- [ ] "Retry" button re-attempts the failed operation
- [ ] "Report to Developer" button sends: timestamp, error, system info, and last 100 log lines
- [ ] Report sent asynchronously (doesn't block UX)
- [ ] Error reported to: `POST /api/v1/developer/error-report` (requires backend endpoint)
- [ ] Gracefully handles network failure during report (silent failure, no UI disruption)
- [ ] Custom data directory path displays on Step 2 confirmation (not "(default)" if user selected custom path)

## Tasks

- [ ] Task 1: Create `errorReporting.ts` with `ErrorReporter` class
  - Implement `collectRecentLogs()` (read ~/.openclaw/occ-home.log tail)
  - Implement `getSystemInfo()` (OS, Node, Docker status)
  - Implement `sendErrorReport(error, logs, systemInfo)` (HTTP POST)

- [ ] Task 2: Create `errorModal.tsx` React component
  - Display error code, message, timestamp
  - Add "View Logs" (expandable details pane)
  - Add "Retry" button (callback-based)
  - Add "Report to Developer" button (async submission)

- [ ] Task 3: Modify `home.ts` constructor and `_update()` to catch errors
  - Wrap initialization in try-catch
  - On error: show modal, emit diagnostic info
  - Add error event handler to HomePanel

- [ ] Task 4: Update error messages to include error codes
  - Define error code enum (ERR_DOCKER_TIMEOUT, ERR_GATEWAY_START, etc.)
  - Map error conditions to codes and user messages

- [ ] Task 5: Backend API endpoint (defer if not blocking)
  - `POST /api/v1/developer/error-report` 
  - Accepts: timestamp, errorCode, message, logs, systemInfo
  - Stores in database for developer review (new table: `error_reports`)

## Out of Scope

- Real-time log streaming (one-off collection only)
- Log rotation/cleanup (use existing ~/.openclaw/occ-home.log rotation)
- Telemetry (only error reports, no usage tracking)
- UI polish beyond basic error display

## Success Criteria

Users experiencing Docker setup failures will see:
1. Error modal immediately (not blank screen)
2. Actionable error message + error code
3. Option to view logs or retry
4. Ability to report the issue to developers for faster fixes
