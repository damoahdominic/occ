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

## Tasks

- [x] Task 1: Register `occ.setup.reset` command in extension.ts
  - **Problem**: Command not registered, falls through to generic handler
  - **Test**: Command appears in registered commands list, fires confirmation dialog
  - **Depends on**: None
  - **Subtasks**:
    - [x] Subtask 1.1: Add `vscode.commands.registerCommand('occ.setup.reset', ...)` in extension.ts
    - [x] Subtask 1.2: Add confirmation dialog with "Yes, Reset" / "Cancel"
    - [x] Subtask 1.3: Clear `WindowHostBinding` from workspace state
    - [x] Subtask 1.4: Call `HomePanel.currentPanel?.resetSetup(full)`
    - [x] Subtask 1.5: Show host picker after reset (`HomePanel.createOrShow(..., true)`)

- [x] Task 2: Rename `_handleResetSetup` to public `resetSetup` and preserve openclaw.json
  - **Problem**: Method is private, deletes openclaw.json on full reset
  - **Test**: Config file preserved after full reset
  - **Depends on**: None
  - **Subtasks**:
    - [x] Subtask 2.1: Rename `_handleResetSetup` → `resetSetup` (public)
    - [x] Subtask 2.2: Save `openclaw.json` before `rm -rf`, restore after
    - [x] Subtask 2.3: Remove old config deletion code

- [x] Task 3: Update webview message handler to route through registered command
  - **Problem**: Webview calls method directly instead of registered command
  - **Test**: `occ.setup.reset` message routes through `vscode.commands.executeCommand`
  - **Depends on**: Task 1
  - **Subtasks**:
    - [x] Subtask 3.1: Update message handler to use `vscode.commands.executeCommand('occ.setup.reset', { full })`

- [x] Task 4: Add `-v` flag support to `runDockerTeardown()`
  - **Problem**: Static method doesn't pass `-v` for volume removal
  - **Test**: `runDockerTeardown(path, 'docker', true)` passes `-v` to docker compose down
  - **Depends on**: None
  - **Subtasks**:
    - [x] Subtask 4.1: Add `volumes` parameter to `runDockerTeardown()` signature
    - [x] Subtask 4.2: Conditionally push `-v` to args array

- [x] Task 5: Compile and verify
  - **Test**: Extension compiles, all commands and methods present in compiled output
  - **Depends on**: Tasks 1-4
  - **Subtasks**:
    - [x] Subtask 5.1: Recompile extension in Docker container
    - [x] Subtask 5.2: Verify `occ.setup.reset`, `resetSetup`, `savedConfig` in compiled output

## Technical Details

- `resetSetup(full: boolean)` — public method (renamed from `_handleResetSetup`)
- `runDockerTeardown(extensionPath, runtime, volumes)` — static method with optional `-v` flag
- Webview sends `{ command: 'occ.setup.reset', full: true }` → routed through registered command
