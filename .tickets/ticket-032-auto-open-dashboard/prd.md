# PRD: Auto-Open Dashboard After Successful Provision

## Problem Statement

After Docker provision completes, the user must manually click "Open Dashboard →". The panel just sits there with a success message.

## Scope

After `runDockerProvision()` completes successfully, automatically fire `openclaw.configure` after a short delay (2s) to open the web control panel in the system browser.

## Flow

1. Docker provision succeeds → "Docker environment is ready!"
2. After 2 seconds, `openclaw.configure` fires automatically → browser opens with web control
3. "Open Web Control →" button still visible for manual re-open

## Acceptance Criteria

- [ ] Dashboard opens automatically in browser 2s after provision succeeds
- [ ] "Open Web Control →" button still visible for manual re-open
- [ ] No double-open if user already clicked the button
- [ ] Button renamed from "Open Dashboard" to "Open Web Control" for clarity

## Technical Details

- In `dockerProvision` message handler (home.ts:293-301), after `runDockerProvision` resolves:
  - `setTimeout(() => vscode.commands.executeCommand('openclaw.configure'), 2000)`
- Guard with a flag to prevent double-open
- Rename button text in provisionStatus handler (home.ts:2462)
