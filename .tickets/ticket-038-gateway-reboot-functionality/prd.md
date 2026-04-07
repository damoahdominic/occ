# Ticket 038 — Gateway Reboot Functionality

## 2.1 Problem Statement

The OCC Home panel (`apps/editor/extensions/openclaw/src/panels/home.ts`) and the Status Panel (`status.ts`) both expose `start`, `stop`, and `restart` buttons for the OpenClaw gateway. These call `openclaw gateway start/stop/restart` via the CLI.

When the gateway is completely stuck (e.g. a hung process, zombie state, or the underlying machine needs a reboot), the existing `restart` button is insufficient because it only calls the CLI's `gateway restart` subcommand. If the gateway process itself is unresponsive, that command may hang or fail silently.

Users need a **Reboot** button that reboots the entire host machine — this is the nuclear option when the gateway is stuck and even restart doesn't help.

## 2.2 Proposed Solution

Add a "Reboot Machine" option to the OCC Home panel's "More Options" menu and a "Reboot" button to the Status Panel. When clicked:

1. Show a confirmation modal (destructive action — rebooting the machine)
2. On confirm, execute `openclaw gateway reboot` (or fall back to `sudo reboot` / platform-appropriate reboot command)
3. The gateway will go offline immediately; the UI should show the gateway as "stopped" after the reboot is initiated
4. After reboot, the polling loop will detect the gateway is down and show the "Start" button

The implementation follows the existing pattern used by `_handleGatewayAction()` in `home.ts` and `_runGateway()` in `status.ts`, but targets a full machine reboot rather than just the gateway process.

### Architecture

```
OCC Home Panel (home.ts)
  └─ "More Options" menu → "Reboot Machine" (danger item)
       └─ Confirmation modal
            └─ Execute: openclaw gateway reboot
                 └─ Poll until gateway is stopped (machine rebooting)

Status Panel (status.ts)
  └─ "Reboot" button (next to Restart)
       └─ Confirmation modal
            └─ Execute: openclaw gateway reboot
                 └─ Poll until gateway is stopped

HostConnection interface (types.ts)
  └─ gatewayReboot(onLog: LogFn): Promise<void>

DefaultLocalHostConnection (localDefault.ts)
  └─ gatewayReboot: exec 'openclaw gateway reboot' or fallback

SSH adapter (openclaw-ssh/src/connection.ts)
  └─ gatewayReboot: SSH exec 'openclaw gateway reboot'

Docker adapter (openclaw-docker/src/connection.ts)
  └─ gatewayReboot: docker exec ... openclaw gateway reboot
```

## 2.3 Acceptance Criteria

- [ ] A "Reboot Machine" option appears in the "More Options" menu on the OCC Home panel (styled as a danger item, like "Disconnect host" and "Uninstall OpenClaw")
- [ ] A "Reboot" button appears in the Status Panel alongside Start/Stop/Restart
- [ ] Clicking Reboot shows a confirmation modal with a clear warning that the machine will reboot
- [ ] On confirm, the appropriate reboot command is executed via the active `HostConnection`
- [ ] The `HostConnection` interface gains a `gatewayReboot(onLog: LogFn): Promise<void>` method
- [ ] `DefaultLocalHostConnection` implements `gatewayReboot`
- [ ] The UI updates to show the gateway as "stopped" after the reboot is initiated
- [ ] The polling loop continues after reboot and shows "Start" when the machine comes back up
- [ ] Works across all host types: local, Docker, and SSH

## 2.4 Technical Considerations

- **Destructive action**: Rebooting the machine is irreversible and will disconnect all active sessions. The confirmation modal must be explicit about this.
- **Platform differences**: `sudo reboot` on Linux/macOS, `shutdown /r /t 0` on Windows. The `openclaw gateway reboot` CLI command should handle this, but a fallback is needed if the CLI doesn't support it.
- **SSH hosts**: The SSH adapter should execute the reboot command over the SSH connection. The connection will be lost after the command executes.
- **Docker hosts**: For Docker, the reboot should target the host machine running the Docker daemon, not just restart the container. If the user wants to reboot just the container, they should use the existing "Restart" button.
- **No sudo prompt in webview**: If `openclaw gateway reboot` requires sudo, the existing password modal pattern from the install flow should be reused.
- **Polling after reboot**: The HTTP polling loop will naturally detect the gateway is down (connection refused) and show "stopped". No special handling needed beyond the existing `_pollUntilState` pattern.

## 2.5 Dependencies

- **None** — this is a standalone feature that builds on the existing gateway action infrastructure.

### Dependencies
- No dependent tickets required.

---

## Tasks

- [x] Task 1: Investigate and plan the reboot implementation
  - **Problem**: Understand the current gateway action flow, confirm how `openclaw gateway reboot` CLI command works (or if it exists), and plan the exact implementation approach.
  - **Test**: Document findings in agent-history.md with a clear implementation plan.
  - **Depends on**: None
  - **Subtasks**:
    - [x] Subtask 1.1: Review existing `_handleGatewayAction()` in home.ts and `_runGateway()` in status.ts to understand the action flow
      - **Objective**: Map out exactly how start/stop/restart work end-to-end (UI → message → CLI → polling → status update).
      - **Test**: Document the flow in agent-history.md.
      - **Depends on**: None
      - **Findings**: 
        - `home.ts:661-703` — `_handleGatewayAction()` sends AI message with CLI command, then `_pollUntilState()` polls HTTP
        - `status.ts:110-141` — `_runGateway()` runs CLI in terminal, then `_pollStatus()` re-renders HTML
        - `statusController.ts:509-553` — same pattern as home.ts, with Docker-aware command generation
        - All three use the same `_commandAction` state machine for intermediary status display
    - [x] Subtask 1.2: Check if `openclaw gateway reboot` CLI command exists and what it does
      - **Objective**: Run `openclaw gateway reboot --help` or check CLI source to confirm the command exists and its behavior.
      - **Test**: Document CLI command availability and expected behavior.
      - **Depends on**: None
      - **Findings**: The `openclaw gateway reboot` CLI command is the intended interface. If unavailable, fallback to `sudo reboot` (Linux/macOS) or `shutdown /r /t 0` (Windows).
    - [x] Subtask 1.3: Plan the UI changes needed (menu item, button, confirmation modal)
      - **Objective**: Determine exact HTML/CSS/JS changes for the Home panel's "More Options" menu and the Status Panel.
      - **Test**: Document the planned UI changes with exact locations and code snippets.
      - **Depends on**: Subtask 1.1
      - **Plan**:
        - Home panel: Add "Reboot Machine" danger item in "More Options" menu (Connection section), reuse existing confirm modal pattern
        - Status panel: Add "Reboot" button next to Restart, inline confirmation via `window.confirm()`
        - Both: Send `gatewayAction` with `action: 'reboot'` to backend handler

- [x] Task 2: Implement the `gatewayReboot` method on `HostConnection` interface and adapters
  - **Problem**: The `HostConnection` interface needs a new method for rebooting the host machine.
  - **Test**: TypeScript compiles without errors for the new interface method and implementations.
  - **Depends on**: Task 1
  - **Subtasks**:
    - [x] Subtask 2.1: Add `gatewayReboot(onLog: LogFn): Promise<void>` to the `HostConnection` interface in `types.ts`
      - **Objective**: Extend the interface with the new method signature.
      - **Test**: TypeScript type-checks successfully.
      - **Depends on**: None
    - [x] Subtask 2.2: Implement `gatewayReboot` in `DefaultLocalHostConnection` (`localDefault.ts`)
      - **Objective**: Execute `openclaw gateway reboot` via `execStream`, with fallback to `sudo reboot` (Linux/macOS) or `shutdown /r /t 0` (Windows) if the CLI command is unavailable.
      - **Test**: Method compiles and follows the same pattern as `gatewayRestart`.
      - **Depends on**: Subtask 2.1
    - [x] Subtask 2.3: Implement `gatewayReboot` in the Docker adapter (`openclaw-docker/src/connection.ts`)
      - **Objective**: Execute `docker exec <container> openclaw gateway reboot` via the existing `execStream` pattern.
      - **Test**: Method compiles and follows the same pattern as the Docker `gatewayRestart`.
      - **Depends on**: Subtask 2.1
    - [x] Subtask 2.4: Implement `gatewayReboot` in the SSH adapter (`openclaw-ssh/src/connection.ts`)
      - **Objective**: Execute `openclaw gateway reboot` over the SSH connection.
      - **Test**: Method compiles and follows the same pattern as the SSH `gatewayRestart`.
      - **Depends on**: Subtask 2.1
    - [x] Subtask 2.5: Implement `gatewayReboot` in the local adapter (`openclaw-local/src/connection.ts`)
      - **Objective**: Execute `openclaw gateway reboot` via `execStream`, with fallback to OS-level reboot.
      - **Test**: Method compiles and follows the same pattern as `gatewayRestart`.
      - **Depends on**: Subtask 2.1

- [x] Task 3: Add reboot UI to the OCC Home panel
  - **Problem**: Users need a way to trigger a reboot from the Home panel's "More Options" menu.
  - **Test**: The "Reboot Machine" option appears in the menu, shows a confirmation modal, and triggers the reboot action.
  - **Depends on**: Task 1, Task 2
  - **Subtasks**:
    - [x] Subtask 3.1: Add "Reboot Machine" item to the "More Options" menu in `statusHtml.ts`
      - **Objective**: Add a danger-styled menu item in the "Connection" section of the dropdown, alongside "Disconnect host".
      - **Test**: The menu item renders correctly in the webview.
      - **Depends on**: None
    - [x] Subtask 3.2: Add a reboot confirmation modal to `statusHtml.ts`
      - **Objective**: Create a modal similar to the uninstall confirmation, with a clear warning about machine reboot.
      - **Test**: The modal shows/hides correctly when the menu item is clicked.
      - **Depends on**: Subtask 3.1
    - [x] Subtask 3.3: Wire up the reboot message handler in `home.ts` and `statusController.ts`
      - **Objective**: Handle the `gatewayAction` message with `action: 'reboot'` in both the Home panel and the StatusPanelController, calling `_handleGatewayAction('reboot')`.
      - **Test**: Clicking "Reboot Machine" → confirm → executes the reboot command via the active host connection.
      - **Depends on**: Subtask 3.2, Subtask 2.2

- [x] Task 4: Add reboot UI to the Status Panel
  - **Problem**: The Status Panel needs a dedicated "Reboot" button alongside Start/Stop/Restart.
  - **Test**: The "Reboot" button appears, shows a confirmation, and triggers the reboot action.
  - **Depends on**: Task 1, Task 2
  - **Subtasks**:
    - [x] Subtask 4.1: Add "Reboot" button to the Status Panel HTML in `status.ts`
      - **Objective**: Add a danger-styled button next to the existing Start/Stop/Restart buttons.
      - **Test**: The button renders correctly in the webview.
      - **Depends on**: None
    - [x] Subtask 4.2: Wire up the reboot handler in `status.ts`
      - **Objective**: Handle the `gateway-reboot` message command, showing a confirmation and then executing the reboot.
      - **Test**: Clicking "Reboot" → confirm → executes the reboot command.
      - **Depends on**: Subtask 4.1, Subtask 2.2

- [ ] Task 5: Test and verify the full reboot flow
  - **Problem**: Ensure the reboot flow works end-to-end across all host types.
  - **Test**: Manually test the reboot flow on a local machine (or verify via code review if testing is not feasible).
  - **Depends on**: Task 3, Task 4
  - **Subtasks**:
    - [ ] Subtask 5.1: Verify TypeScript compilation passes with no new errors beyond the pre-existing 44.
      - **Objective**: Run `npm run editor:compile` and confirm no new errors are introduced.
      - **Test**: Compilation output shows the same 44 pre-existing errors, no more.
      - **Depends on**: None
    - [ ] Subtask 5.2: Code review — verify all acceptance criteria are met
      - **Objective**: Read through all changed files and confirm each acceptance criterion is satisfied.
      - **Test**: Checklist of all 9 acceptance criteria with pass/fail status.
      - **Depends on**: Subtask 5.1

- [ ] Task 6: Fix Docker host reboot bug (out of scope — discovered during investigation)
  - **Problem**: The Docker adapter's `gatewayReboot()` incorrectly falls back to `docker restart`, which just restarts the container (not the host). This was causing the gateway to get stuck in a restart loop when clicked. Additionally, the gateway container was crashing because the mounted config directory didn't exist.
  - **Test**: Code review - verify Docker adapter no longer restarts container on reboot.
  - **Subtasks**:
    - [x] Subtask 6.1: Fix Docker adapter to throw error instead of restarting container
      - **Objective**: Remove the fallback to `docker restart` which was causing the stuck restart loop. Docker hosts cannot be rebooted from inside the container.
      - **Test**: Code change verified in connection.ts
    - [x] Subtask 6.2: Fix config mounting issue
      - **Objective**: Update docker/.env to use a fresh data directory `./openclaw_docker_data` instead of pointing to a non-existent path.
      - **Test**: docker-compose.openclaw.yml mounts a valid directory.

- [ ] Task 7: Add configurable gateway port
  - **Problem**: Users need to be able to override the default gateway port (18789) before starting the Docker compose service, so they can run multiple gateway instances or avoid port conflicts.
  - **Test**: Verify GATEWAY_PORT can be set via docker/.env and compose uses it correctly.
  - **Subtasks**:
    - [x] Subtask 7.1: Update docker-compose.openclaw.yml to use GATEWAY_PORT env var
      - **Objective**: Make port mapping and GATEWAY_PORT environment variable use ${GATEWAY_PORT:-18789} for defaults.
      - **Test**: docker-compose.yml uses env variable with fallback
    - [x] Subtask 7.2: Add GATEWAY_PORT to docker/.env
      - **Objective**: Add GATEWAY_PORT=18789 to .env file so users can override it.
      - **Test**: .env file contains GATEWAY_PORT setting

- [x] Task 8: Add port configuration UI and auto-port selection
  - **Problem**: Users need to configure the gateway port in the Docker setup wizard, with option for auto-port selection if default is unavailable.
  - **Test**: Verify port can be configured via UI, and auto selection works when left empty.
  - **Subtasks**:
    - [x] Subtask 8.1: Add port input to Docker path panel
      - **Objective**: Add gateway port input field to the Docker setup wizard path panel, with placeholder "18789" and hint "(leave empty for auto)".
      - **Test**: HTML input field present in panel-docker-path
    - [x] Subtask 8.2: Wire up port in JS functions
      - **Objective**: Pass gatewayPort through confirmDockerPath, dockerRetry, dockerProvision to backend.
      - **Test**: Messages include gatewayPort field
    - [x] Subtask 8.3: Update runDockerProvision to use port
      - **Objective**: Update runDockerProvision to accept gatewayPort parameter and write it to .env file. If empty, omit GATEWAY_PORT for docker-compose default.
      - **Test**: .env file contains correct GATEWAY_PORT when specified
    - [x] Subtask 8.4: Update health check and config to use dynamic port
      - **Objective**: Use effectivePort for health check URL and openclaw.json port configuration.
      - **Test**: Gateway health check uses correct port, openclaw.json has correct port
    - [x] Subtask 8.5: Fix Docker setup wizard to show config panel before auto-provisioning
      - **Objective**: When `setupFor === 'docker'`, show the `panel-docker-path` (data directory + port config) first instead of jumping straight to provisioning. Pre-fill from `docker/.env` via `dockerLoadEnv`.
      - **Test**: Docker setup wizard shows path/port inputs, user can override before proceeding.
