# Subtasks: ticket-045-app-logging-error-reporting

## Execution Plan

### Phase 1: Error Collection Foundation
- [x] **T1.1**: Create `errorReporting.ts` with `ErrorReporter` class
  - Implements `collectRecentLogs()` - reads last 50 lines from ~/.openclaw/occ-home.log
  - Implements `getSystemInfo()` - gathers OS, Node version, Docker status
  - Error codes enum: ERR_DOCKER_TIMEOUT, ERR_GATEWAY_START, ERR_NETWORK, ERR_UNKNOWN

- [x] **T1.2**: Create `errorModal.tsx` React component
  - Display: error code, message, timestamp
  - Buttons: "View Logs" (collapsible), "Retry", "Report to Developer"
  - Auto-dismiss on non-critical errors after 10s

### Phase 2: Integration & Error Handling
- [x] **T2.1**: Modify `home.ts` to catch initialization errors
  - Wrap constructor and `_update()` in try-catch
  - Emit error events on failure
  - Show error modal instead of blank screen

- [x] **T2.2**: Add error codes to failure scenarios
  - Docker timeout → ERR_DOCKER_TIMEOUT
  - Gateway health check failure → ERR_GATEWAY_START
  - Network error → ERR_NETWORK
  - Unknown errors → ERR_UNKNOWN

### Phase 3: Reporting & Shipping
- [x] **T3.1**: Implement `sendErrorReport(error, logs, systemInfo)`
  - POST to `POST /api/v1/developer/error-report`
  - Fire-and-forget (async, don't wait)
  - Store failed submissions locally for manual retry

- [x] **T3.2**: Backend API endpoint (if not already available)
  - Route: `POST /api/v1/developer/error-report`
  - Schema: timestamp, errorCode, message, logs[], systemInfo{}
  - Store in database table: `error_reports`

### Phase 4: Testing & Validation
- [x] **T4.1**: E2E test - Docker setup failure flow
  - Trigger Docker timeout
  - Verify error modal appears
  - Verify logs can be viewed
  - Verify retry works

- [x] **T4.2**: Manual testing
  - Test on Windows, macOS, Linux
  - Network failure during report (verify graceful handling)
  - Multiple errors in sequence

## Priority & Dependencies
1. **T1.1** → T1.2 (component needs error data)
2. **T1.2** → T2.1 (integration needs UI)
3. **T2.1** → T2.2 (error codes before integration)
4. **T2.2** → T3.1 (shipping depends on codes)
5. **T3.1** → T3.2 (backend can come after frontend works with mock)

## Notes
- Can defer T3.2 (backend) if mock endpoint available
- Log collection reuses existing ~/.openclaw/occ-home.log infrastructure
- Error modal should not block main UI (show as toast/modal, then return control)
