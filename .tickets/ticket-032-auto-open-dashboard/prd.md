# PRD: Auto-Open Dashboard After Successful Provision

## Problem Statement

After Docker provision completes, the user must manually click "Open Dashboard →". The panel just sits there with a success message.

## Scope

After `runDockerProvision()` completes successfully, automatically fire `openclaw.configure` after a short delay (2s) to open the web control panel in the system browser.

## Flow

1. Docker provision succeeds → "Docker environment is ready!"
2. After 2 seconds, `openclaw.configure` fires automatically → browser opens with web control
3. Panel transitions to AI config panel (user can configure AI model)
4. "Open Web Control" button available in status dashboard for manual re-open

## Acceptance Criteria

- [x] Dashboard opens automatically in browser 2s after provision succeeds
  - **Verified**: `home.ts` lines 302-306 — `setTimeout(() => vscode.commands.executeCommand('openclaw.configure'), 2000)` after `runDockerProvision` resolves
- [x] "Open Web Control" button still visible for manual re-open
  - **Verified**: `statusHtml.ts` line 1048 — `<button onclick="cmd('openclaw.configure')">Open Web Control</button>`
- [x] No double-open if user already clicked the button
  - **Verified**: `home.ts` line 118 — `private _dashboardAutoOpened = false;` guard at lines 303-304
- [x] Button renamed from "Open Dashboard" to "Open Web Control" for clarity
  - **Verified**: `statusHtml.ts` line 75 — `const buttonLabel = isInstalled ? 'Open Web Control' : 'Install OpenClaw'`

## Tasks

- [x] Task 1: Add `_dashboardAutoOpened` guard flag
  - **Problem**: No mechanism to prevent duplicate dashboard opens
  - **Test**: Flag declared and prevents second open
  - **Depends on**: None
  - **Subtasks**:
    - [x] Subtask 1.1: Add `private _dashboardAutoOpened = false` field to HomePanel class

- [x] Task 2: Implement auto-open in dockerProvision handler
  - **Problem**: Dashboard doesn't open automatically after provision
  - **Test**: `openclaw.configure` fires 2s after provision resolves
  - **Depends on**: Task 1
  - **Subtasks**:
    - [x] Subtask 2.1: Add guarded `setTimeout` in `dockerProvision` `.then()` callback
    - [x] Subtask 2.2: Set `_dashboardAutoOpened = true` before scheduling

- [x] Task 3: Rename button text to "Open Web Control"
  - **Problem**: Button says "Open Dashboard" which is confusing with external dashboard
  - **Test**: Status dashboard button reads "Open Web Control"
  - **Depends on**: None
  - **Subtasks**:
    - [x] Subtask 3.1: Update `statusHtml.ts` button label to "Open Web Control"
    - [x] Subtask 3.2: Update provision wizard retry button text

- [x] Task 4: Compile and verify
  - **Test**: Extension compiles, all strings present in compiled output
  - **Depends on**: Tasks 1-3
  - **Subtasks**:
    - [x] Subtask 4.1: Recompile extension in Docker container
    - [x] Subtask 4.2: Verify `_dashboardAutoOpened`, `openclaw.configure`, and "Open Web Control" in compiled output

## Technical Details

- Guard flag `_dashboardAutoOpened` prevents duplicate browser opens
- Auto-open fires in the `dockerProvision` message handler's `.then()` callback
- The provision wizard transitions to AI config panel instead of showing a manual button
