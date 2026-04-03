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

- [x] `occ.setup.reset` command registered in extension.ts
  - **Verified**: `extension.ts` lines 1009-1023 — `vscode.commands.registerCommand('occ.setup.reset', ...)`
- [x] Confirmation dialog before reset
  - **Verified**: `extension.ts` lines 1011-1016 — `vscode.window.showWarningMessage(...)` with "Yes, Reset" / "Cancel"
- [x] Docker compose down -v removes containers and volumes
  - **Verified**: `home.ts` lines 736-742 — `args.push('-v')` when `full` is true
  - **Verified**: `home.ts` lines 3627-3639 — `runDockerTeardown()` accepts `volumes` parameter, passes `-v` when true
- [x] `occ-openclaw` container stopped and removed
  - **Verified**: `docker compose down` stops and removes all containers defined in `docker-compose.openclaw.yml`
- [x] Panel returns to initial host picker
  - **Verified**: `extension.ts` line 1022 — `HomePanel.createOrShow(context.extensionUri, true)` with `forcePicker=true`
- [x] `openclaw.json` preserved (user data intact)
  - **Verified**: `home.ts` lines 752-766 — saves config before `rm -rf`, recreates directory, restores config
- [x] `WindowHostBinding` cleared from workspace state
  - **Verified**: `extension.ts` line 1018 — `context.workspaceState.update(WINDOW_HOST_KEY, undefined)`

## Technical Details

- `resetSetup(full: boolean)` — public method (renamed from `_handleResetSetup`)
- `runDockerTeardown(extensionPath, runtime, volumes)` — static method with optional `-v` flag
- Webview sends `{ command: 'occ.setup.reset', full: true }` → routed through registered command
