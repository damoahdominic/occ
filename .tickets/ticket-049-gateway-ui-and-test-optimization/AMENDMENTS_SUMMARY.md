# Ticket-049: Amendments Summary

**Original Scope**: Gateway UI + E2E Test Optimization (5 Phase 3 tasks)  
**Amendments Made**: 2026-04-14 (2 new tasks added)  
**Total Tasks**: 7 (original 5 + 2 new)

---

## Amendment 1: Task 6 — Input Validation Framework

**Added**: 2026-04-14 10:00 UTC  
**Reason**: Prevent runtime errors (permissions, ports, disk) by validating upfront

### What It Does
Validates all docker setup inputs BEFORE proceeding to next step:
1. Path +rw accessibility (no sudo required)
2. Port availability (18789, 5432, 6379)
3. Docker/compose availability
4. Volume mount permissions (container can write)
5. Disk space (5GB minimum)
6. Gateway health check (post-startup)

### Key Feature
**No sudo required** — If path fails, suggest alternative or prompt for new path instead

### Error Message Pattern
```
ERROR: Path Writable
Reason: /root/.openclaw not writable by user
Suggestion: Use /home/user/.openclaw or chmod 777 /root/.openclaw
```

### Acceptance Criteria
- 10 validation checks implemented
- All fail gracefully with actionable suggestions
- "Next" button disabled until all validations pass
- Inline error messages (not modal dialogs)

---

## Amendment 2: Task 7 — Error Reporting & Log Persistence UI

**Added**: 2026-04-14 10:15 UTC  
**Reason**: Users can't debug setup failures; error details disappear after completion

### What It Does
1. **Log UI Persistence**: Logs stay visible on failure (don't auto-close)
2. **Error Reporting**: "Report Error" button creates GitHub issue with full context
3. **Log Management**: "Copy Logs" button for manual sharing
4. **Real-time Feedback**: Show progress + highlight errors

### Key Features
- **On Success**: Logs auto-close after 3 seconds
- **On Failure**: Logs stay until user dismisses
- **One-click Reporting**: Pre-fills GitHub issue with:
  - Full error logs
  - System info (OS, Docker version, disk space)
  - User config (ports, paths)
  - Timestamp + optional email
- **GitHub Integration**: Auto-labels issues (area:docker-setup, type:user-reported, error type)
- **Fallback**: Email option if GitHub unavailable

### Error Display
```
[Scrollable Log Output]

Error: Cannot mount volume
  /root/.openclaw: permission denied
  
  Possible causes: [listed]
  Suggested fixes: [listed]

[Report Error] [Copy Logs] [Close]
```

### Acceptance Criteria
- Logs visible on failure (don't auto-close)
- "Report Error" creates GitHub issue with pre-filled content
- System info captured (OS, Docker version, disk space)
- Setup config included (ports, paths, user)
- Full startup logs included
- Optional user email for follow-up
- "Copy Logs" button works
- All error types tested

---

## Updated Ticket Structure

```
Ticket-049: Gateway Container Info UI + E2E Test Optimization

Phase 1: Audit & Plan ✅
Phase 2: Ticket Creation ✅
Phase 3:
  ├─ Task 1: E2E Test Optimization ✅
  ├─ Task 2: CDP Retry Logic ✅
  ├─ Task 3: GatewayInfo Component ✅
  ├─ Task 4: Test Execution & Validation 🔄
  ├─ Task 5: Documentation ✅
  ├─ Task 6: Input Validation Framework ⏳ [NEW]
  └─ Task 7: Error Reporting & Log UI ⏳ [NEW]
```

---

## Implementation Timeline

| Task | Status | Est. Effort |
|------|--------|------------|
| Task 1-5 | Complete | Done |
| Task 6 (Validation) | New | 4-6 hours |
| Task 7 (Error UI) | New | 6-8 hours |
| **Total Remaining** | | **10-14 hours** |

---

## Why These Amendments Matter

### Task 6: Validation Framework
**Prevents**:
- "permission denied" errors at runtime
- Port conflict failures mid-setup
- Disk space issues during container creation

**Enables**:
- Users without sudo to set up gateway
- Clear, actionable error messages upfront
- Smooth onboarding experience

### Task 7: Error Reporting
**Solves**:
- Users can't debug why setup failed
- Developers can't see error context
- No feedback loop for improvements

**Enables**:
- One-click error reporting to GitHub
- Full context captured automatically
- Faster issue resolution
- Continuous UX improvements

---

## Files Affected

### New Documents
```
DOCKER_SETUP_VALIDATION_CHECKLIST.md    Comprehensive validation specs
AMENDMENTS_SUMMARY.md                   This file
```

### Modified
```
prd.md                                  Added Task 6 & 7 specifications
```

### Will Modify (Implementation Phase)
```
apps/editor/.../Docker.tsx              Add validation hooks
apps/editor/.../SetupSteps.tsx          Keep logs visible on error
apps/editor/...ErrorReporter.tsx        New: GitHub issue creation
tests/e2e/docker-setup.spec.ts          Test validation + error flows
```

---

## Success Criteria (Post-Implementation)

- [ ] All Task 6 validations work (path, ports, docker, disk, health)
- [ ] Users get actionable error messages (no "permission denied")
- [ ] Task 7: Error logs stay visible on failure
- [ ] Task 7: "Report Error" creates GitHub issue with full context
- [ ] Task 7: Users can copy logs for manual sharing
- [ ] All error scenarios tested (permission, port, disk, network, compose)
- [ ] GitHub issues auto-labeled and assigned to triage team

---

**Next Step**: Implement Tasks 6-7 in order (validation first, then error UI)

*Amendments finalized: 2026-04-14 10:20 UTC*
