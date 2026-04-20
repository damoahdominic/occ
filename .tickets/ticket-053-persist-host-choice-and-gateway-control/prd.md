# Ticket 053 — Persist Host Choice and Surface Gateway Control

## 2.1 Problem Statement

Once ticket-052 landed, `HomePanel._update()` no longer flickers back to the host-picker when the gateway *is* reachable. But the picker gate at `apps/editor/extensions/openclaw/src/panels/home.ts:454` still routes entirely off a fresh probe of gateway reachability and `isConfigured` (derived from `this._host.exists(configFile)` at `panels/home.ts:367-368`). That means:

- **User is stuck on the picker whenever the gateway happens to be down.** After a user finishes the Docker setup wizard and picks Docker as their host, if they later kill the `occ-openclaw` container (or the machine reboots and docker desktop isn't running yet), `_update()` sees `!isConfigured || !isGatewayReachable` and renders the host-picker **as if the user never chose a host**. The user's explicit choice is lost every time the gateway dies.
- **"Default local" is indistinguishable from "chose local".** `HostRegistry.getActiveHostId()` at `registry.ts:202-204` returns `this._hostsFile?.activeHostId ?? 'local'`. The seed at `registry.ts:42-48` also initialises `activeHostId: 'local'` before any user interaction. Nothing in the schema records whether the user ever completed a setup, so we cannot safely say "user picked local" from `activeHostId === 'local'` alone.
- **No Start/Stop/Restart affordances in the Status panel when the gateway is down.** `HostConnection` already declares `gatewayStart/Stop/Restart` at `hosts/types.ts:256-258`, and `statusHtml.ts:1214-1219` has the button state table (`Running → Stop`, `Stopped → Start`, `Errored → Restart`) with `gw-start/gw-stop/gw-restart` CSS classes and a `gatewayAction` postMessage handler at `statusHtml.ts:1256`. But the extension side never receives those messages as commands — there is no `openclaw.gateway.start/stop/restart` registration, and the Docker adapter's `gatewayStart/Stop/Restart` implementation needs to be verified to shell out to the canonical compose command.
- **No escape hatch when an adapter breaks.** If Docker is uninstalled / the compose file is deleted / `hosts.json` is corrupted, a persisted host choice would keep the user pinned to a broken Status view forever. We need an explicit "Reconfigure / Pick Different Host" action that clears the persisted choice.

## 2.2 Proposed Solution

Make the Home panel route on **"did the user complete a setup?"** — not on "can I reach the gateway right now?". Reachability only decides between `Status (online)` and `Status (offline, with Start/Stop/Restart controls)`.

See the revised startup flow diagram in [`docs/plans/multihost/08-ui-design.md`](../../docs/plans/multihost/08-ui-design.md) §0 and the new section §0a "Status Panel — Offline & Control" for the canonical flow this ticket must honour. The key invariant this ticket adds is the new flow rule:

> **Persisted host choice beats gateway reachability for view routing.** The picker only appears when the user has never completed a setup, or has explicitly invoked `openclaw.host.reconfigure`.

High-level:

1. Record an **explicit-choice marker** at the end of each setup wizard's success path, before dispatching `openclaw.home.refresh`.
2. Replace the `isConfigured` derivation in `HomePanel._update()` with a read of that marker plus the HostRegistry.
3. Wire per-adapter gateway control (`gatewayStart/Stop/Restart`) through to Status-panel buttons that already exist in the HTML template.
4. Add a Reconfigure escape hatch that clears the marker and loops back into the picker via `_forcePicker + openclaw.home.refresh`.
5. Extend the Playwright coverage added in ticket-052 to lock in the four new invariants.

## 2.3 Acceptance Criteria

```gherkin
Feature: Persisted host choice survives gateway outages and gives the user control over the gateway

Scenario: Setup completion persists the user's host choice
  Given the user has just finished the Docker setup wizard
  And the gateway /health probe returned 200 OK
  When _handleLaunchGateway reaches its success path
  Then the active host id in hosts.json is set to the chosen docker host
  And an explicit-choice marker is written before openclaw.home.refresh is dispatched
  And HomePanel._update() reads the marker and renders the Status page

Scenario: Persisted choice beats gateway-down on reload
  Given a user has previously completed Docker setup
  And the explicit-choice marker is true
  And the occ-openclaw container is not running
  When the editor is reloaded and HomePanel._update() runs
  Then the Status page is rendered (in its "offline" variant)
  And the host-picker is NOT rendered
  And the Start Gateway button is visible

Scenario: Status panel Start button starts the gateway via the active adapter
  Given the Status page is rendered in offline state
  And the active host is Docker
  When the user clicks Start
  Then the extension executes openclaw.gateway.start
  And the command calls activeHost.gatewayStart(onLog)
  And on the Docker adapter that shells to `docker compose -f docker/docker-compose.openclaw.yml up -d`
  And after success the Status page transitions to the running state

Scenario: Status panel Stop and Restart buttons mirror Start wiring
  Given the Status page is rendered in running state
  When the user clicks Stop
  Then openclaw.gateway.stop is dispatched
  And activeHost.gatewayStop runs the adapter's stop command
  And the Status page transitions to the stopped state
  When the user then clicks Restart on the Errored state
  Then openclaw.gateway.restart is dispatched
  And the adapter's restart command runs

Scenario: Reconfigure escape hatch returns the user to the picker
  Given the Status page is rendered
  And the active adapter is broken (e.g. Docker binary missing)
  When the user clicks "Pick Different Host" / "Reconfigure"
  Then openclaw.host.reconfigure is dispatched
  And the explicit-choice marker is cleared
  And HomePanel._forcePicker is set to true
  And openclaw.home.refresh is dispatched
  And the host-picker is rendered on the next _update()

Scenario: Default local is NOT treated as an explicit choice
  Given a fresh install with no hosts.json
  And HostRegistry seeds activeHostId = "local" as default
  And no setup wizard has been completed
  When HomePanel._update() runs
  Then the explicit-choice marker is absent / false
  And the host-picker is rendered
  And the Status page is NOT rendered

Scenario: Playwright regression covers all four invariants
  Given tests/e2e/docker-to-ide-flow.spec.ts runs
  Then it asserts the explicit-choice marker is written after gateway-connect
  And it asserts a simulated editor reload with gateway down lands on the Status page (offline)
  And it asserts Start / Stop / Restart buttons dispatch the new commands
  And it asserts Reconfigure returns to the picker
  And the ticket-052 "no flicker" assertion still passes
```

## 2.4 Technical Considerations

### Schema: how to record "user explicitly chose a host"

`HostRegistry.getActiveHostId()` falling back to `'local'` (`registry.ts:45, 108-109, 202-203, 233`) collapses two distinct states — "we seeded a default for you" vs. "you finished setup and picked local" — into one id. We need to disambiguate them without silently breaking existing `hosts.json` files on disk.

**Pinned approach.** The setup choices are mutually exclusive (a user picks exactly one of Local / Docker / SSH), so the right encoding is a TypeScript literal-union const type on the `HostsFile` root — not a separate boolean, not a timestamp on each `HostEntry`. Presence of the field means "user has explicitly completed setup for this type"; absence means "default fallback, show picker".

```ts
// apps/editor/extensions/openclaw/src/hosts/types.ts
export const HOST_CHOICE_TYPES = ['local', 'docker', 'ssh'] as const;
export type HostChoiceType = typeof HOST_CHOICE_TYPES[number];

export interface HostsFile {
  activeHostId: string;
  chosenHostType?: HostChoiceType;  // absent → no explicit choice yet
  hosts: HostEntry[];
  // ...existing fields
}
```

- **Writing.** Setup wizards call a new `HostRegistry.markActiveHostChosen(type: HostChoiceType)` on success, which sets `hostsFile.chosenHostType = type` and persists.
- **Reading.** `HomePanel._update()` reads `chosenHostType`. Absent → picker. Present → Status (online or offline per gateway reachability).
- **Clearing.** `openclaw.host.reconfigure` (Task 4) deletes `chosenHostType` and re-runs `openclaw.home.refresh`.
- **Migration.** None. Existing `hosts.json` files have no `chosenHostType` field; absent reads as `undefined`, which correctly means "show picker". First successful setup writes the field.

**Alternatives considered and rejected:**

- **Rename the default id from `'local'` to `'local-default'`.** Breaking schema change against every existing `hosts.json` and every hardcoded `'local'` literal at `registry.ts:109, 203, 233`. Too invasive.
- **Single boolean (`explicitChoice: boolean`).** Doesn't capture *which* type was chosen — needs a parallel field for that and couples two pieces of state. Weaker than a literal-union type.
- **Per-host `setupCompletedAt: string` on each `HostEntry`.** Richer but over-specified: in the current single-active-host model we only care "did the user ever complete a setup, and which type". Revisit if/when multi-host ships and multiple hosts can be independently configured.
- **VS Code `globalState` boolean.** Loses host-type fidelity; regresses as soon as there's more than one host type.

### Other considerations

- **Awaiting the persistence write.** `HostRegistry.setActiveHostId()` at `registry.ts:240-246` is currently synchronous (it calls `this._persist()` which writes with `fs.writeFileSync`). But `HostManager.setActiveHost()` at `manager.ts:136` is async and may do additional I/O. `_handleLaunchGateway()` in `apps/editor/extensions/openclaw-docker/src/setup-panel.ts` must `await` both the `setActiveHost` call and the new `markActiveHostChosen`-equivalent before dispatching `openclaw.home.refresh`, otherwise `HomePanel._update()` races and reads the stale value.
- **Corrupted `hosts.json` or deleted compose file.** If a user's `hosts.json` is corrupted, `_readFromDisk()` at `registry.ts:116-123` falls back to the seed and the explicit-choice marker is lost. That is the correct behaviour (treat as fresh install → picker). Task 4's Reconfigure button is the escape hatch when the adapter itself is broken but the marker is still set.
- **`gatewayStart/Stop/Restart` must not race with the setup wizard's own compose commands.** The Docker adapter's start/stop/restart will shell to the same `docker compose -f docker/docker-compose.openclaw.yml ...` invocations the setup wizard uses. During the setup flow the buttons should either be absent (the Status panel isn't rendered yet) or disabled; this ticket's scope is the Status panel's own use, not the wizard's.
- **Do not regress ticket-052's no-flicker assertion.** The new `isConfigured`-replacement logic must still return the same view decision for the "setup just completed + gateway reachable" case. The ticket-052 Playwright spec must pass unchanged when this ticket is merged.
- **Scope.** Primary surface:
  - `apps/editor/extensions/openclaw/src/hosts/registry.ts` (new marker field + methods)
  - `apps/editor/extensions/openclaw/src/hosts/types.ts` (schema additions)
  - `apps/editor/extensions/openclaw/src/panels/home.ts:365-459` (rewrite `isConfigured` derivation and picker gate)
  - `apps/editor/extensions/openclaw/src/panels/statusHtml.ts` (Reconfigure button, already has Start/Stop/Restart template at `:1214-1219`, `:1256`)
  - `apps/editor/extensions/openclaw-docker/src/setup-panel.ts` (`_handleLaunchGateway` success path — add `setActiveHost` + `markActiveHostChosen` awaits before `openclaw.home.refresh` at ~`:1047`)
  - `apps/editor/extensions/openclaw-local/src/setup-panel.ts` (same pattern for local setup completion)
  - New command registrations: `openclaw.gateway.start`, `openclaw.gateway.stop`, `openclaw.gateway.restart`, `openclaw.host.reconfigure`
- **Hot reload.** Per `CLAUDE.md` project memory: compile with `tsc` and reload the extension host. Do NOT restart the dev container.

## 2.5 Dependencies

- **Depends on ticket-052 (merged).** ticket-052 rewired `DockerSetupPanel._handleLaunchGateway()` to dispatch `openclaw.home.refresh` as its final step (`apps/editor/extensions/openclaw-docker/src/setup-panel.ts:~1047`) and owns the `openclaw.home.refresh` command on the `HomePanel` side (`panels/home.ts` constructor). Task 1 hooks into that same success path. Task 2 reworks the same `_update()` gate that ticket-052 already narrowed at `home.ts:454`.
- **Related — auth gate landed in parallel** (`apps/editor/extensions/openclaw/src/authGate.ts`). The new `openclaw.home.refresh` path must remain the single entrypoint downstream of the auth gate — this ticket does not change that.

---

## Tasks

- [x] Task 1: Persist the host choice at setup completion
  - **Problem**: When a setup wizard finishes successfully today, nothing records that the user explicitly chose this host. `HostRegistry.getActiveHostId()` at `registry.ts:202-204` always falls back to `'local'`, so "default" and "chosen" are the same state. We need the `chosenHostType: HostChoiceType` marker on `HostsFile` (see §2.4) written before the existing `openclaw.home.refresh` dispatch at `setup-panel.ts:~1047` so `HomePanel._update()` can route off persisted intent rather than live reachability.
  - **Test**:
    ```gherkin
    Given the user has just completed the final step of the Docker setup wizard
    And the gateway /health probe returned 200 OK
    When _handleLaunchGateway's success path runs
    Then HostManager.setActiveHost(<docker-host-id>) is awaited
    And HostRegistry.markActiveHostChosen('docker') is awaited
    And both writes complete before vscode.commands.executeCommand('openclaw.home.refresh') is dispatched
    And the subsequent HomePanel._update() reads chosenHostType as 'docker'
    ```
  - **Depends on**: None
  - **Subtasks**:
    - [x] Subtask 1.1: Extend `hosts/types.ts` with the `HostChoiceType` const-union and add `chosenHostType` to `HostsFile`
      - **Objective**: Add `export const HOST_CHOICE_TYPES = ['local', 'docker', 'ssh'] as const` and `export type HostChoiceType = typeof HOST_CHOICE_TYPES[number]` to `apps/editor/extensions/openclaw/src/hosts/types.ts`. Add the optional `chosenHostType?: HostChoiceType` field to `HostsFile`. Teach `HostRegistry._readFromDisk()` / `_persist()` / `makeEmptyHostsFile()` to round-trip it, and add `markActiveHostChosen(type: HostChoiceType)` and `clearActiveHostChoice()` methods on `HostRegistry` (with pass-throughs on `HostManager`).
      - **Test**:
        ```gherkin
        Given a fresh hosts.json written by the old registry code (no chosenHostType field)
        When the new registry reads it
        Then HostRegistry.getChosenHostType() returns undefined
        And calling markActiveHostChosen('docker') persists chosenHostType = 'docker'
        And reading hosts.json from disk shows the new field with value 'docker'
        And calling clearActiveHostChoice() removes the field and persists
        ```
      - **Depends on**: None
    - [x] Subtask 1.2: Wire `setActiveHost` + `markActiveHostChosen` into `DockerSetupPanel._handleLaunchGateway` success path
      - **Objective**: In `apps/editor/extensions/openclaw-docker/src/setup-panel.ts` (around `:1047`), after the `/health` probe succeeds and before the `openclaw.home.refresh` dispatch, await `coreApi.setActiveHost(<docker-host-id>)` and `registry.markActiveHostChosen('docker')`. Do NOT dispatch `openclaw.home.refresh` until both awaits resolve.
      - **Test**:
        ```gherkin
        Given _handleLaunchGateway has just confirmed /health returns 200
        When the success branch runs
        Then setActiveHost is awaited
        And markActiveHostChosen is awaited
        And only then does vscode.commands.executeCommand('openclaw.home.refresh') run
        And on the next HomePanel._update() the Status page is rendered
        ```
      - **Depends on**: Subtask 1.1
    - [x] Subtask 1.3: Mirror the same wiring for `LocalSetupPanel`
      - **Objective**: Apply the same "await setActiveHost + markActiveHostChosen before openclaw.home.refresh" pattern in `apps/editor/extensions/openclaw-local/src/setup-panel.ts` at its gateway-completion equivalent.
      - **Test**:
        ```gherkin
        Given a user completes the local setup flow end-to-end
        When the local success path runs
        Then markActiveHostChosen('local') is awaited and chosenHostType is persisted as 'local'
        And openclaw.home.refresh is dispatched only after the marker write
        And the subsequent _update() renders the local Status page (not the picker)
        ```
      - **Depends on**: Subtask 1.1

- [-] Task 2: Redefine `HomePanel._update()` routing — persisted choice beats gateway reachability
  - **Problem**: `panels/home.ts:367-368` derives `isConfigured` from `this._host.exists(configFile)` and `:440-442, :454` routes to the picker whenever `!isConfigured && !isGatewayReachable`. That means a completed-setup user lands back on the picker every time the gateway happens to be down. The picker gate should only fire when the user has NEVER completed a setup.
  - **Test**:
    ```gherkin
    Given the explicit-choice marker is true (user completed setup previously)
    And isGatewayReachable is false (gateway down right now)
    When _update() runs with _forcePicker=false
    Then the host-picker branch at home.ts:454 does NOT fire
    And the Status page is rendered in its offline variant
    And the Start Gateway button is visible
    ```
  - **Depends on**: Task 1
  - **Subtasks**:
    - [x] Subtask 2.1: Replace `isConfigured` with a persisted-choice read
      - **Objective**: In `HomePanel._update()` at `panels/home.ts:365-459`, stop deriving the routing signal from `this._host.exists(configFile)`. Instead read `registry.getActiveHostId()` + the explicit-choice marker and compute an `isExplicitlyChosen` boolean. Keep the existing `cfg`/port reading but gate it on `isExplicitlyChosen` rather than `isConfigured`.
      - **Test**:
        ```gherkin
        Given the explicit-choice marker is false and no openclaw.json exists
        When _update() runs
        Then isExplicitlyChosen is false
        And the picker is rendered
        Given the explicit-choice marker is true
        When _update() runs (regardless of isGatewayReachable)
        Then isExplicitlyChosen is true
        And the picker is NOT rendered
        ```
      - **Depends on**: Subtask 1.1
    - [x] Subtask 2.2: Rewrite the picker gate at `home.ts:454`
      - **Objective**: Change `if (this._forcePicker || (!isConfigured && !isGatewayReachable))` to `if (this._forcePicker || !isExplicitlyChosen)`. Drop the `!isGatewayReachable` clause — reachability no longer decides picker-vs-Status, only online-vs-offline within Status.
      - **Test**:
        ```gherkin
        Given _forcePicker is false and isExplicitlyChosen is true
        And isGatewayReachable is false
        When _update() runs
        Then the picker HTML is NOT assigned to the webview
        And the Status-panel offline variant is rendered instead
        Given _forcePicker is true
        When _update() runs
        Then the picker is rendered (escape hatch still works)
        ```
      - **Depends on**: Subtask 2.1
    - [-] Subtask 2.3: Verify ticket-052's no-flicker Playwright assertion still passes
      - **Objective**: Run `tests/e2e/docker-to-ide-flow.spec.ts` end-to-end locally and confirm the ticket-052 post-completion / visibility-toggle assertions are still green. The new gate must not weaken them.
      - **Test**:
        ```gherkin
        Given ticket-052's Playwright spec runs against this branch
        When the full spec completes
        Then the no-flicker assertion passes
        And the visibility-toggle assertion passes
        ```
      - **Depends on**: Subtask 2.2

- [x] Task 3: Wire per-adapter gateway control and Status panel Start/Stop/Restart
  - **Problem**: `HostConnection` declares `gatewayStart/Stop/Restart` at `hosts/types.ts:256-258`. `statusHtml.ts:1214-1219, :1256` already contains the Start/Stop/Restart button template and a `gatewayAction` postMessage, but the extension-side never receives it as a registered command, and we have not confirmed that `DockerHostConnection.gatewayStart/Stop/Restart` actually shells to the canonical compose commands per root `AGENTS.md` § "OpenClaw Docker Gateway".
  - **Test**:
    ```gherkin
    Given the Status page is rendered
    When the user clicks Start / Stop / Restart
    Then the webview posts { command: 'gatewayAction', action: 'start' | 'stop' | 'restart' }
    And HomePanel's message handler dispatches openclaw.gateway.{start|stop|restart}
    And that command resolves activeHost.gateway{Start|Stop|Restart}(onLog)
    And on a Docker active host the adapter runs `docker compose -f docker/docker-compose.openclaw.yml up -d / down / restart`
    And the Status page transitions through starting → running (or stopping → stopped) via the existing state machine at statusHtml.ts:1214-1219
    ```
  - **Depends on**: Task 2
  - **Subtasks**:
    - [x] Subtask 3.1: Audit `DockerHostConnection` and `LocalHostConnection` gateway-control implementations
      - **Objective**: Verify the three methods exist and exercise the canonical commands. Docker must shell to `docker compose -f docker/docker-compose.openclaw.yml up -d / down / restart` (see root `AGENTS.md` § "OpenClaw Docker Gateway"). Local adapter should shell to `openclaw gateway start/stop/restart` per [`docs/plans/multihost/04-local-adapter.md`](../../docs/plans/multihost/04-local-adapter.md). Fill in any missing implementation.
      - **Test**:
        ```gherkin
        Given a unit-level harness calls activeHost.gatewayStart(onLog) on a Docker adapter
        Then the adapter invokes `docker compose -f docker/docker-compose.openclaw.yml up -d`
        Given the same call on a local adapter
        Then the adapter invokes `openclaw gateway start`
        ```
      - **Depends on**: None
    - [x] Subtask 3.2: Register `openclaw.gateway.start/stop/restart` commands
      - **Objective**: In the core extension (`apps/editor/extensions/openclaw/src/extension.ts` or `panels/home.ts`, wherever `openclaw.home.refresh` is registered per ticket-052), register three new commands that each resolve the active `HostConnection` via the `OpenClawCoreAPI` and call the matching `gatewayStart/Stop/Restart(onLog)` method. Stream the log to the existing output channel.
      - **Test**:
        ```gherkin
        Given the extension is activated
        When vscode.commands.executeCommand('openclaw.gateway.start') runs
        Then the active host's gatewayStart is called
        And the returned promise resolves after the shell command completes
        ```
      - **Depends on**: Subtask 3.1
    - [x] Subtask 3.3: Hook the `gatewayAction` postMessage to the new commands
      - **Objective**: In `HomePanel`'s webview message handler (the block around `panels/home.ts:300+` that already routes `chooseHostType` etc.), add a case for `msg.command === 'gatewayAction'` that switches on `msg.action` and dispatches `openclaw.gateway.start/stop/restart`. After the command resolves, call `HomePanel.refresh()` so the state machine transitions.
      - **Test**:
        ```gherkin
        Given the Status page posts { command: 'gatewayAction', action: 'start' }
        When HomePanel's message handler runs
        Then openclaw.gateway.start is dispatched
        And after it resolves, _update() runs and the Status page re-renders in the running state
        ```
      - **Depends on**: Subtask 3.2

- [x] Task 4: Reconfigure / Pick Different Host escape hatch
  - **Problem**: Once the explicit-choice marker is set, a user with a broken adapter (Docker uninstalled, compose file deleted, etc.) has no way to return to the picker. Without an explicit escape, Task 2's new gate would trap them on a Status page that cannot recover.
  - **Test**:
    ```gherkin
    Given the Status page is rendered with a broken adapter (gatewayStart returns an error)
    When the user clicks "Pick Different Host"
    Then openclaw.host.reconfigure is dispatched
    And the explicit-choice marker is cleared
    And HomePanel._forcePicker is set to true
    And openclaw.home.refresh is dispatched
    And the next _update() renders the host-picker
    ```
  - **Depends on**: Task 2
  - **Subtasks**:
    - [x] Subtask 4.1: Add a "Reconfigure / Pick Different Host" button to `statusHtml.ts`
      - **Objective**: Add a small secondary button in the Status panel (near the gateway-control row) that posts `{ command: 'reconfigure' }` to the extension.
      - **Test**:
        ```gherkin
        Given the Status page is rendered
        Then a "Pick Different Host" button is visible
        When the user clicks it
        Then vscode.postMessage({ command: 'reconfigure' }) is posted
        ```
      - **Depends on**: None
    - [x] Subtask 4.2: Register and implement `openclaw.host.reconfigure`
      - **Objective**: New command. Clears the explicit-choice marker via the registry, sets `HomePanel.currentPanel._forcePicker = true`, and calls `vscode.commands.executeCommand('openclaw.home.refresh')`. Exposed as a palette command as well so users can recover even if the Status page is somehow unresponsive.
      - **Test**:
        ```gherkin
        Given the explicit-choice marker is true
        When openclaw.host.reconfigure runs
        Then the marker is false afterwards
        And _forcePicker is true on HomePanel
        And the next _update() renders the picker
        ```
      - **Depends on**: Subtask 4.1, Subtask 1.1
    - [x] Subtask 4.3: Route the Status page's `reconfigure` postMessage into the command
      - **Objective**: Extend HomePanel's message handler to dispatch `openclaw.host.reconfigure` on receipt of the new postMessage.
      - **Test**:
        ```gherkin
        Given the Status page posts { command: 'reconfigure' }
        When HomePanel's message handler runs
        Then openclaw.host.reconfigure is dispatched
        ```
      - **Depends on**: Subtask 4.2

- [ ] Task 5: Playwright regression coverage
  - **Problem**: ticket-052's spec stops at "post-completion Status page stable across visibility toggle". It does not cover: persistence across editor reload, routing when the gateway is down but the choice is persisted, Start/Stop/Restart button wiring, or the Reconfigure escape hatch. Without coverage, any of the four new invariants could regress silently.
  - **Test**:
    ```gherkin
    Given tests/e2e/docker-to-ide-flow.spec.ts runs end-to-end
    When the spec completes
    Then it includes assertions for: persisted-choice survives reload; gateway-down + persisted-choice lands on Status (not picker); Start/Stop/Restart buttons dispatch and transition state; Reconfigure returns to the picker
    And the existing ticket-052 no-flicker and visibility-toggle assertions still pass
    ```
  - **Depends on**: Task 4
  - **Subtasks**:
    - [ ] Subtask 5.1: Persisted-choice-across-reload assertion
      - **Objective**: After the existing gateway-connect step succeeds, simulate an editor reload (or re-open the Home panel), and assert the Status page is rendered and the picker DOM is absent. Tag `@slow` consistent with existing Docker flow specs.
      - **Test**:
        ```gherkin
        Given the spec has just completed the gateway-connect step
        When the Home panel is closed and re-opened (or the test reloads the editor window)
        Then the Status page selector is present in the webview iframe
        And the host-picker selector is absent
        ```
      - **Depends on**: Task 4
    - [ ] Subtask 5.2: Gateway-down-with-persisted-choice assertion
      - **Objective**: With the explicit-choice marker set, stop the `occ-openclaw` container (or mock the health probe to fail), trigger `_update()`, and assert the Status page's offline variant is rendered — not the picker. Start button must be visible.
      - **Test**:
        ```gherkin
        Given the explicit-choice marker is true
        And the gateway container is stopped
        When the Home panel re-runs _update()
        Then the Status-offline variant selector is present
        And the Start Gateway button is present
        And the host-picker selector is absent
        ```
      - **Depends on**: Subtask 5.1
    - [ ] Subtask 5.3: Start/Stop/Restart button assertions
      - **Objective**: Click Start, wait for the state machine to transition to `starting → running`, assert the gateway is reachable. Click Stop, assert `stopping → stopped`. Click Restart from the errored state, assert `restarting → running`.
      - **Test**:
        ```gherkin
        Given the Status page is in the stopped state
        When the user clicks Start
        Then the Status page transitions through starting to running within the configured timeout
        And the gateway /health endpoint returns 200
        When the user clicks Stop
        Then the Status page transitions through stopping to stopped
        ```
      - **Depends on**: Subtask 5.2
    - [ ] Subtask 5.4: Reconfigure escape-hatch assertion
      - **Objective**: Click "Pick Different Host", assert the picker is re-rendered and the explicit-choice marker on disk is cleared.
      - **Test**:
        ```gherkin
        Given the Status page is rendered with the explicit-choice marker set
        When the user clicks "Pick Different Host"
        Then the host-picker selector appears in the webview iframe
        And the Status page selector is gone
        And the explicit-choice marker in hosts.json is false / absent
        ```
      - **Depends on**: Subtask 5.3
    - [ ] Subtask 5.5: Run the extended spec under the standard harness
      - **Objective**: `npm run test:e2e -- --workers=1 tests/e2e/docker-to-ide-flow.spec.ts` passes green including all four new assertions and ticket-052's existing assertions.
      - **Test**:
        ```gherkin
        Given the extended spec runs under the standard harness
        When it completes
        Then every assertion is green
        And the report lists the five new test scenarios alongside ticket-052's
        ```
      - **Depends on**: Subtask 5.4
