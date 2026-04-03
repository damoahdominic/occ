# PRD: Register `occ.setup.reset` Command + Full Docker Teardown

## Problem Statement

The `_handleResetSetup()` method is implemented but `occ.setup.reset` is never registered as a command. The webview sends `{ command: 'occ.setup.reset' }` which falls through to a generic handler — fragile and undocumented.

## Scope

Properly register `occ.setup.reset` in `extension.ts`. Add a confirmation dialog. Ensure full Docker teardown (`docker compose down -v`) works correctly. Reset the panel to the initial host picker state.

## Flow

1. User clicks "Reset Setup" in the Home panel
2. Confirmation dialog: "This will stop all Docker containers and remove volumes. Your openclaw.json will be preserved. Continue?"
3. If confirmed: `docker compose down -v` → remove `occ-openclaw` container → reset panel to host picker
4. `openclaw.json` preserved (user data intact)

## Acceptance Criteria

- [ ] `occ.setup.reset` command registered in extension.ts
- [ ] Confirmation dialog before reset
- [ ] Docker compose down -v removes containers and volumes
- [ ] `occ-openclaw` container stopped and removed
- [ ] Panel returns to initial host picker
- [ ] `openclaw.json` preserved (user data intact)
- [ ] `WindowHostBinding` cleared from workspace state

## Technical Details

- extension.ts: register `occ.setup.reset` command
- home.ts: `_handleResetSetup()` already implemented — just needs proper command registration
- Add confirmation via `vscode.window.showWarningMessage()`
- Clear `WINDOW_HOST_KEY` from workspace state after reset
