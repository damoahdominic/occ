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
  - Note: In the provision wizard flow, the panel transitions to AI config instead of showing a manual button. The auto-open handles the dashboard opening.
- [x] No double-open if user already clicked the button
  - **Verified**: `home.ts` line 118 — `private _dashboardAutoOpened = false;` guard at lines 303-304
- [x] Button renamed from "Open Dashboard" to "Open Web Control" for clarity
  - **Verified**: `statusHtml.ts` line 75 — `const buttonLabel = isInstalled ? 'Open Web Control' : 'Install OpenClaw'`
  - Note: User popover retains "Open Dashboard" (external occ.mba.sh) per ticket-033 — this is intentional.

## Technical Details

- Guard flag `_dashboardAutoOpened` prevents duplicate browser opens
- Auto-open fires in the `dockerProvision` message handler's `.then()` callback
- The provision wizard transitions to AI config panel instead of showing a manual button
