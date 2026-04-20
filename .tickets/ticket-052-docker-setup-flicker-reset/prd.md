# Ticket 052 — Docker Setup Flicker Reset to Step 1

## 2.1 Problem Statement

After Docker setup completes and the gateway `/health` probe succeeds, the OCC Home webview flickers and the UI returns to **step 1 of the Docker setup wizard** instead of transitioning to the **Home → Status page**. The gateway is actually running, but users see a disorienting "reset" of their onboarding state.

### State source of truth

- The Docker wizard step is stored **client-side only** in the webview at `apps/editor/extensions/openclaw-docker/src/setup-panel.ts:1686` (`let currentStep = 1;`). It is never persisted.
- Extension-side provisioning phase lives in `_configStep` at `apps/editor/extensions/openclaw-docker/src/setup-panel.ts:63-64`.

### Completion signal path

- `_handleLaunchGateway()` at `apps/editor/extensions/openclaw-docker/src/setup-panel.ts:910-975` probes `/health`, posts `{ type: 'launchDone' }` at line 970, and schedules `_showStatusPanel()` after 1800ms at line 971.
- `StatusPanelController` is created at `apps/editor/extensions/openclaw-docker/src/setup-panel.ts:716-739`; its `.show()` swaps in the status HTML.

### Reset path (prime suspect root cause)

- `apps/editor/extensions/openclaw/src/panels/home.ts:139-141` wires an `onDidChangeViewState` listener that calls `_update()` on every visibility change.
- `apps/editor/extensions/openclaw/src/panels/home.ts:385-405`: `_update()` probes `isDockerRunning` and at line 405 executes:

  ```ts
  if (isDockerRunning || this._forcePicker || (!isConfigured && !isGatewayReachable)) {
    this._stopPolling();
    this._panel.webview.html = this._getHostTypeSelectionHtml(iconUri.toString());
    return;
  }
  ```

  After setup completes with Docker running, a visibility change re-runs `_update()`, sees `isDockerRunning=true`, and overwrites the status page with the host-picker. That is the observed flicker-back-to-step-1.

### Top hypotheses (ranked)

1. **HIGH** — `home.ts` `onDidChangeViewState` → `_update()` → host-picker render races with `StatusPanelController.show()`.
2. **MEDIUM** — webview `postMessage` race: messages queued before `_statusController` is fully initialized in `apps/editor/extensions/openclaw-docker/src/setup-panel.ts:154-217`.
3. **LOWER** — workspace-folder updates in `apps/editor/extensions/openclaw-docker/src/statusController.ts:256-258` triggering reload. Ticket-051 already killed one reload loop in this area, so this lane may already be mitigated.

### Test gap

`tests/e2e/docker-to-ide-flow.spec.ts` stops at "Connect to Gateway" and does not verify that the post-completion Status page persists across webview visibility changes.

## 2.2 Proposed Solution

Fix the category error in `home.ts` where "Docker container is up" is treated as "user hasn't chosen a host yet". The host-picker branch should only fire when the user has not yet configured a host — not whenever Docker happens to be running.

### Canonical flow this ticket must honour

See the updated startup flow diagram in [`docs/plans/multihost/08-ui-design.md`](../../docs/plans/multihost/08-ui-design.md) (Section 0). Two rules from that diagram are load-bearing for this fix:

- **Rule 2 — "Setup completion re-enters detection, not the Status Panel directly."** The last step of the Docker Setup Wizard must loop back to the **Detect Gateway** node. The detection node owns the decision to render Status Panel vs. Setup View. Setup panels must not swap the UI to the Status page on their own.
- **Rule 4 — "No direct setup → Status jump."** The old edge from "gateway now running" directly into Status Panel is removed. This is exactly the edge `_handleLaunchGateway()` / `_showStatusPanel()` implement today, which races with `home.ts._update()` and produces the observed flicker.

Note: the diagram also adds an **auth gate before gateway detection** (Rule 1). That is an adjacent concern and is out of scope for this ticket, but the fix here must not obstruct the later addition of the auth gate — i.e. the detection node should remain the single entrypoint that setup and disconnect loop back into.

### High-level approach

- Gate `apps/editor/extensions/openclaw/src/panels/home.ts` `_update()` so it does **not** re-render the host-picker while a `DockerSetupPanel` / `StatusPanelController` session is active, or when the gateway is already configured and reachable (regardless of `isDockerRunning`).
- Re-examine the condition at `home.ts:405`. Once configuration is complete, `isDockerRunning === true` should route to the **Status** view, not the **Host-Picker**.
- Route the Docker Setup Wizard's completion through the **Detect Gateway** node (i.e. trigger `home.ts._update()` / the detection/polling path) instead of having `_showStatusPanel()` unilaterally swap HTML from `setup-panel.ts`. This aligns the runtime behaviour with the diagram.
- Harden the race during `StatusPanelController` activation in `setup-panel.ts:154-217` so the completion signal cannot be lost if an `onDidChangeViewState` fires mid-init.
- Extend the Playwright E2E coverage past the gateway-connect step to assert the Status page is stable across tab hide/show.

## 2.3 Acceptance Criteria

```gherkin
Feature: Docker setup completes and stays on the Status page

Scenario: Setup completion re-enters Detect Gateway (per docs/plans/multihost/08-ui-design.md §0 Rule 2)
  Given the user has completed the final step of the Docker setup wizard
  And the gateway /health probe returns 200 OK
  When the wizard finishes
  Then control loops back to the Detect Gateway node
  And the detection node (not the setup panel) decides the next view
  And the Status Panel is rendered because the gateway is reachable
  And no direct setup-panel → Status HTML swap occurs

Scenario: Gateway health check succeeds and Home shows Status (no flicker)
  Given the user has completed the Docker setup wizard
  And the gateway /health probe returns 200 OK
  When _handleLaunchGateway posts { type: 'launchDone' }
  And StatusPanelController.show() runs after its 1800ms delay
  Then the Home panel displays the Status page
  And the Home panel does NOT re-render the host-picker
  And currentStep is not reset to 1

Scenario: Webview visibility change does not reset onboarding state
  Given the Docker setup is complete and the Status page is visible
  And isDockerRunning is true
  And the gateway is configured and reachable
  When the user switches to another tab and back (triggers onDidChangeViewState)
  Then _update() does NOT render the host-type selection HTML
  And the Status page remains visible
  And no flicker to step 1 of the Docker wizard is observed

Scenario: Concurrent StatusPanelController init survives a visibility event
  Given _handleLaunchGateway has just posted launchDone
  And StatusPanelController is mid-initialization
  When onDidChangeViewState fires before _statusController is ready
  Then the completion signal is NOT dropped
  And once initialization finishes the Status page renders
  And no host-picker render occurs

Scenario: Playwright regression covers post-completion Status page
  Given tests/e2e/docker-to-ide-flow.spec.ts runs end-to-end
  When the gateway connect step succeeds
  Then the test asserts the Status page is rendered
  And the test toggles webview visibility at least once
  And the Status page is still rendered afterward
  And the test fails if the host-picker DOM appears
```

## 2.4 Technical Considerations

- **Canonical flow reference.** `docs/plans/multihost/08-ui-design.md` §0 is the source of truth for the startup / setup-completion / disconnect loops. Any fix here must be consistent with Rules 2 and 4 (setup loops back into Detect Gateway; no direct setup → Status jump).
- **Auth gate adjacency.** The same diagram adds a sign-up / sign-in step before gateway detection (Rule 1). That work is out of scope here; this ticket must not bake in any shortcut that would make it harder to insert the auth gate in front of Detect Gateway later.
- **Scope narrow.** Primary surface is `apps/editor/extensions/openclaw/src/panels/home.ts` (condition at `:405`) plus a small race hardening in `apps/editor/extensions/openclaw-docker/src/setup-panel.ts:154-217`. Avoid broader refactors of `StatusPanelController`.
- **State persistence.** `currentStep` at `setup-panel.ts:1686` is webview-local; nothing should attempt to persist it as part of this fix — the real issue is that the wrong HTML is being swapped in.
- **Reload-loop adjacency.** Ticket-051 already removed one reload loop in this area. Be careful not to reintroduce one when hardening the `_update()` gating.
- **Hot reload.** Per project memory, compile with `tsc` and reload the extension host — do NOT restart the dev container (clears nls.js, forces ~9-min recompile).
- **Test runner.** Playwright E2E spec already has webview iframe helpers; extend `tests/e2e/docker-to-ide-flow.spec.ts` rather than creating a new spec file.

## 2.5 Dependencies

- **Related — ticket-051 (`restore-host-setup-commands`, merged).** Fixed a reload loop in the overlapping `statusController.ts:256-258` area. No hard block, but any new gating logic must not conflict with the ticket-051 change.
- **Related — ticket-049 (`gateway-ui-and-test-optimization`, merged).** Gateway UI work touched adjacent surfaces. No hard block.
- No other ticket dependencies.

---

## Tasks

- [x] Task 1: Confirm root cause and fix the `home.ts` host-picker gating
  - **Problem**: `apps/editor/extensions/openclaw/src/panels/home.ts:405` renders the host-picker whenever `isDockerRunning` is true, even after setup has finished and the Status page is active. Every `onDidChangeViewState` (`home.ts:139-141`) triggers `_update()` and overwrites the Status page.
  - **Test**:
    ```gherkin
    Given the Docker setup has completed and StatusPanelController.show() has rendered the Status page
    And isDockerRunning is true and the gateway is configured and reachable
    When onDidChangeViewState fires on the Home panel
    Then _update() does not execute the host-picker branch at home.ts:405
    And the Status page HTML is preserved
    ```
  - **Depends on**: None
  - **Subtasks**:
    - [x] Subtask 1.1: Reproduce the flicker with instrumentation
      - **Objective**: Add temporary trace logs around `home.ts:385-405` and `setup-panel.ts:910-975` to confirm the `_update()` → host-picker render runs after `launchDone`.
      - **Test**:
        ```gherkin
        Given trace logs are enabled
        When the Docker setup finishes end-to-end
        Then the logs show _handleLaunchGateway posting launchDone
        And the logs show _update() entering the isDockerRunning branch afterwards
        And the logs show _getHostTypeSelectionHtml being assigned to the webview
        ```
      - **Depends on**: None
    - [x] Subtask 1.2: Rework the `home.ts:405` condition
      - **Objective**: Change the host-picker gate so it only fires when the user has not yet configured a host. "Docker is running AND gateway is configured AND gateway is reachable" must route to the Status view, not the host-picker.
      - **Test**:
        ```gherkin
        Given isConfigured is true and isGatewayReachable is true
        When _update() runs with isDockerRunning=true and _forcePicker=false
        Then _update() does NOT render the host-type selection HTML
        And _update() renders the Status / connected view instead
        ```
      - **Depends on**: Subtask 1.1
    - [x] Subtask 1.3: Remove the temporary trace logs
      - **Objective**: Keep production logs quiet.
      - **Test**:
        ```gherkin
        Given the fix is verified
        When the final diff is reviewed
        Then no temporary trace logs remain in home.ts or setup-panel.ts
        ```
      - **Depends on**: Subtask 1.2

- [x] Task 2: Harden the race during `StatusPanelController` activation
  - **Problem**: In `apps/editor/extensions/openclaw-docker/src/setup-panel.ts:154-217`, messages can be queued before `_statusController` is fully initialized. If an `onDidChangeViewState` fires during this window, the completion signal can be dropped and the user lands on an uninitialized state that the Home panel then overwrites with the host-picker.
  - **Test**:
    ```gherkin
    Given _handleLaunchGateway has posted launchDone
    And StatusPanelController is still initializing
    When onDidChangeViewState fires on the Home panel before init completes
    Then the completion signal is buffered or replayed once _statusController is ready
    And the Status page is rendered after init completes
    And no host-picker render occurs
    ```
  - **Depends on**: Task 1
  - **Subtasks**:
    - [x] Subtask 2.1: Buffer / defer postMessage handling until `_statusController` is ready
      - **Objective**: Ensure any message arriving during the init window (`setup-panel.ts:154-217`) is processed after initialization, not dropped.
      - **Test**:
        ```gherkin
        Given a unit-level simulation posts launchDone during controller init
        When initialization completes
        Then the buffered launchDone is processed exactly once
        And StatusPanelController.show() is invoked
        ```
      - **Depends on**: Task 1
    - [x] Subtask 2.2: Audit `statusController.ts:256-258` workspace-folder updates for reload regression
      - **Objective**: Verify the hardening does NOT reintroduce the reload loop that ticket-051 killed.
      - **Test**:
        ```gherkin
        Given the hardened controller is running
        When Docker setup completes and the Status page renders
        Then no workspace-folder update triggers a window reload
        And the existing ticket-051 regression check still passes
        ```
      - **Depends on**: Subtask 2.1

- [-] Task 3: Playwright regression test for post-completion Status page stability
  - **Problem**: `tests/e2e/docker-to-ide-flow.spec.ts` stops at "Connect to Gateway" and does not verify the Status page persists across visibility changes. Without coverage, a future regression would silently reintroduce the flicker.
  - **Test**:
    ```gherkin
    Given tests/e2e/docker-to-ide-flow.spec.ts is executed
    When the spec runs to completion
    Then it asserts the Status page is rendered after gateway connect
    And it toggles webview visibility at least once
    And it asserts the Status page is still rendered afterwards
    And it fails if the host-picker DOM appears after completion
    ```
  - **Depends on**: Task 1
  - **Subtasks**:
    - [x] Subtask 3.1: Extend `docker-to-ide-flow.spec.ts` past the gateway-connect step
      - **Objective**: Add assertions for Status-page presence immediately after `_handleLaunchGateway` completes its 1800ms `_showStatusPanel()` schedule.
      - **Test**:
        ```gherkin
        Given the spec has just completed Connect to Gateway
        When the test waits past 1800ms
        Then the Status page selector is present in the webview iframe
        And the host-picker selector is absent
        ```
      - **Depends on**: Task 1
    - [x] Subtask 3.2: Add a visibility-toggle assertion
      - **Objective**: Exercise `onDidChangeViewState` by hiding and re-showing the Home webview, then re-assert the Status page.
      - **Test**:
        ```gherkin
        Given the Status page is rendered
        When the test toggles the webview tab away and back
        Then the Status page selector is still present
        And the host-picker selector is still absent
        ```
      - **Depends on**: Subtask 3.1
    - [-] Subtask 3.3: Run the extended spec under the standard E2E harness
      - **Objective**: Confirm the new assertions pass on a clean run.
      - **Test**:
        ```gherkin
        Given npm run test:e2e -- --workers=1 tests/e2e/docker-to-ide-flow.spec.ts is executed
        When the run completes
        Then all tests are green
        And the new assertions are included in the report
        ```
      - **Depends on**: Subtask 3.2
