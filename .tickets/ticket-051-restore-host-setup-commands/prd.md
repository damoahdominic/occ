# Ticket 051 — Restore Host Setup Commands (Fix Gateway Button Regression)

## 2.1 Problem Statement

After v3.6.1, commit `93953d5` registered `openclaw.host.setup.local`, `openclaw.host.setup.docker`, and `openclaw.host.setup.ssh` inside the main `openclaw` extension (`apps/editor/extensions/openclaw/src/extension.ts:723-744`). Those same command IDs are already registered by three adapter extensions that ship pre-bundled in the fork:

| Command | Registered by | Target |
|---|---|---|
| `openclaw.host.setup.local` | `openclaw-local/src/extension.ts:27` | `LocalSetupPanel` |
| `openclaw.host.setup.docker` | `openclaw-docker/src/extension.ts:90` | `DockerSetupPanel` |
| `openclaw.host.setup.ssh` | `openclaw-ssh/src/extension.ts:20` | `SSHSetupPanel` |

Because the main extension activates first (the adapters declare `extensionDependencies: ["openclaw.home"]`), its generic handler wins and the subsequent adapter registrations throw `A command '…' already exists`. Two user-visible regressions follow:

1. **Gateway button loop.** Clicking **Docker** (or **Local**) on the OCC Home host picker disposes the picker and runs `openclaw.host.setup.docker`. The winning (main-extension) handler just calls `HomePanel.createOrShow()`. `_update()` detects that Docker is running and re-renders the picker — the button visually "does nothing".
2. **Dedicated setup wizards are unreachable.** `LocalSetupPanel` / `DockerSetupPanel` / `SSHSetupPanel` are never opened because their adapter-registered commands are clobbered. The adapter `activate()` throws before later subscriptions run.

Tag `v3.6.1` is the last known-good commit: only adapters registered these commands and they routed to the correct setup panels.

## 2.2 Proposed Solution

Remove the three `openclaw.host.setup.{local,docker,ssh}` registrations from `apps/editor/extensions/openclaw/src/extension.ts` (the block added by commit `93953d5`). The adapter extensions are authoritative.

No other behavior change is needed. `routeHome()`, the home-panel host picker, and `openclaw.install` already `executeCommand('openclaw.host.setup.*')`, so once the adapter handlers are re-exposed they take over automatically.

### Architecture (after fix)

```
HomePanel host picker (Docker/Local cards)
  └─ vscode.commands.executeCommand('openclaw.host.setup.docker')
       └─ openclaw-docker.activate()  ← registers this command
            └─ DockerSetupPanel.createOrShow()

routeHome() binding=docker
  └─ same path → DockerSetupPanel
```

## 2.3 Acceptance Criteria

```gherkin
Feature: Host picker buttons route to the correct setup wizard

Scenario: Clicking Docker on the host picker opens the Docker setup panel
  Given the OCC Home host picker is visible
  And the Docker container "occ-openclaw" is running
  When the user clicks the "Docker" card
  Then the Home panel disposes
  And the Docker setup panel ("OpenClaw Docker Setup") opens
  And the host picker does NOT re-appear

Scenario: Clicking Local on the host picker opens the Local setup panel
  Given the OCC Home host picker is visible
  When the user clicks the "Local" card
  Then the Home panel disposes
  And the Local setup panel opens

Scenario: routeHome with an existing binding opens the correct panel
  Given the window has WindowHostBinding type="docker"
  When the extension activates and calls routeHome
  Then the Docker setup panel opens without showing the host picker

Scenario: No duplicate command registration errors
  Given all openclaw extensions have activated
  When the extension host log is inspected
  Then there are no "A command 'openclaw.host.setup.*' already exists" errors
  And openclaw-local / openclaw-docker / openclaw-ssh report successful adapter registration
```

## 2.4 Technical Considerations

- **No new code.** This is a surgical revert of the three command-registration blocks in the main extension. The adapter code already provides the correct behavior.
- **Activation order.** Main extension activates first; adapters depend on it and activate after. With the duplicates removed, adapter registrations succeed and their `activate()` completes (HostAdapter + setup command both registered).
- **No tests changed.** Existing Playwright onboarding-auth / docker-to-ide-flow tests cover this path at the UI level; verifying them passes is sufficient.
- **Commit `93953d5` message claims the commands were "never registered" — this was incorrect.** The adapters were (and still are) responsible for them. The duplicate made things worse, not better.
- **No effect on other commands.** `openclaw.install` at extension.ts:805-808 already delegates to `openclaw.host.setup.local` via `executeCommand`, which is unchanged.

## 2.5 Dependencies

- None.

---

## Tasks

- [ ] Task 1: Remove the duplicate host-setup command registrations
  - **Problem**: `apps/editor/extensions/openclaw/src/extension.ts` currently registers `openclaw.host.setup.{local,docker,ssh}`, clobbering the adapter extensions.
  - **Test**: `grep -n "openclaw.host.setup" apps/editor/extensions/openclaw/src/extension.ts` returns only the three `executeCommand` callsites (in `routeHome` and `openclaw.install`), no `registerCommand` lines.
  - **Depends on**: None
  - **Subtasks**:
    - [ ] Subtask 1.1: Delete lines 720-744 (the 25-line block introduced by commit `93953d5`) from extension.ts
      - **Objective**: Restore the pre-`93953d5` state of this file.
      - **Test**: `git diff v3.6.1 -- apps/editor/extensions/openclaw/src/extension.ts` is empty.
      - **Depends on**: None

- [ ] Task 2: Recompile the extension and verify
  - **Problem**: TypeScript output under `out/` must be regenerated so the running editor picks up the change.
  - **Test**: `docker exec occ-editor-dev bash -c "cd /workspace/apps/editor/extensions/openclaw && npx tsc -p ./"` exits 0.
  - **Depends on**: Task 1
  - **Subtasks**:
    - [ ] Subtask 2.1: Recompile the `openclaw` extension inside the dev container
      - **Objective**: Emit fresh `out/extension.js`.
      - **Test**: `out/extension.js` mtime is newer than `src/extension.ts`.
      - **Depends on**: Task 1
    - [ ] Subtask 2.2: Reload the extension host and click Docker on the host picker
      - **Objective**: Confirm `DockerSetupPanel` opens instead of a blank re-render.
      - **Test**: Visual / Playwright verification — the DockerSetupPanel tab replaces the picker.
      - **Depends on**: Subtask 2.1

- [ ] Task 3: Run the relevant Playwright E2E suite
  - **Problem**: Catch any surface regressions (home panel onboarding, docker-to-ide flow).
  - **Test**: `npm run test:e2e -- --workers=1 tests/e2e/docker-to-ide-flow.spec.ts` passes.
  - **Depends on**: Task 2
  - **Subtasks**:
    - [ ] Subtask 3.1: Run docker-to-ide-flow spec
      - **Objective**: Confirm no regressions in the Docker setup path.
      - **Test**: All tests green.
      - **Depends on**: Task 2
