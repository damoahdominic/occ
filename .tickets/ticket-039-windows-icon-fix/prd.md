# Ticket 039 — Windows App Icon Fix

## 2.1 Problem Statement

The Windows production build shows a blue box instead of the intended application icon. This affects the packaged app icon in production while the development environment may show correctly.

## 2.2 Proposed Solution

Investigate and fix the Windows icon configuration in the build/package pipeline. The issue likely relates to:
- Icon asset paths in the build configuration
- ICO file format or missing required sizes
- Electron-builder or electron-forge icon settings for Windows

### Architecture

```
Build Pipeline
  └─ product.json / electron-builder config
       └─ icon paths (Windows .ico)
            └─ Check asset existence and format
```

## 2.3 Acceptance Criteria

- [ ] Windows production build shows the intended app icon instead of a blue box
- [ ] No regression to icon behavior on macOS or Linux
- [ ] Root cause and fix are documented in the ticket or linked PR

## 2.4 Technical Considerations

- Inspect branding/build/package config for Windows icon assets and paths
- Check whether installer, executable, and app window/taskbar icons are all configured correctly
- Confirm the expected `.ico` asset exists and contains appropriate sizes
- Validate cross-platform icon configuration remains intact
- Icon formats needed: ICO for Windows (multi-resolution)

## 2.5 Dependencies

- None - this is a standalone bug fix

---

## Tasks

- [ ] Task 1: Investigate Windows icon configuration
  - **Problem**: Identify why Windows icon shows blue box in production
  - **Test**: Review build config files for icon paths
  - **Depends on**: None
  - **Subtasks**:
    - [ ] Subtask 1.1: Check product.json for Windows icon configuration
      - **Objective**: Find icon settings in apps/editor/product.json or similar
      - **Test**: Read product.json and identify icon fields
      - **Depends on**: None
    - [ ] Subtask 1.2: Check electron-builder configuration
      - **Objective**: Review electron-builder.yml or package.json for Windows icon path
      - **Test**: Find win.icon or similar config
      - **Depends on**: Subtask 1.1
    - [ ] Subtask 1.3: Verify icon asset files exist
      - **Objective**: Confirm .ico file exists at configured path
      - **Test**: Check file existence and file size
      - **Depends on**: Subtask 1.2

- [ ] Task 2: Implement fix for Windows icon
  - **Problem**: Apply fix to resolve blue box icon issue
  - **Test**: Rebuild and verify icon displays correctly
  - **Depends on**: Task 1
  - **Subtasks**:
    - [ ] Subtask 2.1: Fix icon path or add missing icon file
      - **Objective**: Correct the icon configuration or add required .ico file
      - **Test**: Verify icon file exists at correct path
      - **Depends on**: Subtask 1.3
    - [ ] Subtask 2.2: Verify cross-platform icons still work
      - **Objective**: Ensure macOS and Linux icons are not broken
      - **Test**: Check icon configs for darwin and linux
      - **Depends on**: Subtask 2.1

- [ ] Task 3: Document root cause
  - **Problem**: Document what caused the issue and how it was fixed
  - **Test**: Write explanation in this ticket
  - **Depends on**: Task 2
  - **Subtasks**:
    - [ ] Subtask 3.1: Write root cause summary
      - **Objective**: Document the issue and fix
      - **Test**: Ticket contains clear explanation
      - **Depends on**: Subtask 2.2

---

## Notes

- GitHub Issue: https://github.com/damoahdominic/occ/issues/62
- Requested from OpenClaw Code group chat
- Follow repo root `AGENTS.md` instructions while implementing

---

## Root Cause & Fix

### Root Cause
The Windows production icon was showing a blue box because:

1. **Icon file path mismatch**: The build system references `code.ico` (Void/VS Code branding) instead of a custom OCcode icon
2. **product.json missing win32AppIcon**: The product.json didn't specify a Windows app icon, defaulting to the Void branding
3. **Inno Setup script using code.ico**: The installer script (`code.iss`) pointed to the old `code.ico` instead of a branded icon

### Fix Applied

1. **Created occode.ico**: Copied `resources/win32/code.ico` to `resources/win32/occode.ico` as a placeholder (should be replaced with proper OCcode branding)

2. **Updated product.json**: Added `"win32AppIcon": "resources/win32/occode.ico"` to specify the Windows app icon

3. **Updated code.iss**: Changed `SetupIconFile` from `code.ico` to `occode.ico`

### Files Modified
- `apps/editor/product.json` - Added win32AppIcon field
- `apps/editor/build/win32/code.iss` - Changed SetupIconFile to occode.ico
- `apps/editor/resources/win32/occode.ico` - Created (copied from code.ico)

### Next Steps
- Replace `resources/win32/occode.ico` with properly designed OCcode branding icon
- Rebuild and test on Windows