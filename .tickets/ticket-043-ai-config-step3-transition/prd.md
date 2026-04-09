# PRD: AI Config + IDE Transition After Step 3 Provision

## Problem Statement

Tickets 031 and 034 implemented the AI config panel and IDE auto-transition for the old `_getSetupHtml()` flow. The ticket-040 refactor replaced that flow with a new 3-step `_getDockerConfigHtml()` view, which was not updated to include the AI config transition. As a result:

- After Docker provision succeeds in the Step 3 view, the panel shows "Connect to Gateway →" instead of the AI config panel.
- `#panel-ai-config` is not rendered in `_getDockerConfigHtml()`.
- The backend auto-opens the gateway dashboard 2 s after provision, bypassing the AI config step entirely.

## Scope

Wire the AI config panel and IDE auto-transition into the `_getDockerConfigHtml()` / Step 3 view so the end-to-end flow (Docker provision → AI config → IDE) works as designed.

## Flow

1. Docker provision succeeds → `provisionStatus done:ok`
2. Step 3 content fades out; `#panel-ai-config` slides in automatically (no user action)
3. Stepper pills 1–3 all turn green
4. User selects provider + enters API key → "Finish Setup" enables
5. "Finish Setup" → `saveAiConfig` message → `_saveAiConfig()` → writes `openclaw.json` → `_transitionToIde(true)` → OCC Home closes, workspace opens, Void sidebar opens
6. "Skip for now" → `skipAiConfig` message → `_skipAiConfig()` → `_transitionToIde(false)` → OCC Home closes, workspace opens (no sidebar)

## Related Tickets

- ticket-040 — Docker 3-step config flow (introduced `_getDockerConfigHtml()`)
- ticket-031 — AI config panel (implemented for old `_getSetupHtml()`, not ported to step-3 view)
- ticket-034 — IDE auto-transition (implemented for old flow, already wired via `_saveAiConfig` / `_skipAiConfig`)
- ticket-042 — E2E spec (`tests/e2e/docker-to-ide-flow.spec.ts`) — `test.todo` items cover this ticket

## BDD Spec

See `tests/e2e/docker-to-ide-flow.spec.ts` — `test.describe('Post-provision …')` block.
The `test.todo` items in that block are the acceptance criteria for this ticket. Promote them to real tests once implementation is validated.

```gherkin
Feature: AI Config after Docker Provision (Step 3 view)

  Scenario: AI config panel appears after provision succeeds
    Given the user has completed Step 3 Docker provision
    When provision status is "done:ok"
    Then docker-config-step-3 is hidden
    And panel-ai-config is visible
    And all 3 stepper pills are green

  Scenario: Provider dropdown has all 5 options
    Given panel-ai-config is visible
    Then ai-provider-select has options: Anthropic Claude, OpenAI, Google Gemini, Groq, OpenRouter

  Scenario: Finish Setup is disabled until provider + key are filled
    Given panel-ai-config is visible
    When provider is empty or API key is empty
    Then btn-finish-setup is disabled

  Scenario: Finish Setup writes config and transitions to IDE
    Given provider is "anthropic" and API key is "sk-test"
    When the user clicks "Finish Setup"
    Then saveAiConfig message is sent
    And OCC Home panel closes
    And Void sidebar opens

  Scenario: Skip for now transitions to IDE without sidebar
    Given panel-ai-config is visible
    When the user clicks "Skip for now"
    Then skipAiConfig message is sent
    And OCC Home panel closes
    And Void sidebar does NOT open
```

## Acceptance Criteria

- [ ] `#panel-ai-config` rendered (hidden) in `_getDockerConfigHtml()` step-3 HTML
- [ ] On `provisionStatus done:ok`: step-3 content hidden, `#panel-ai-config` shown, all stepper pills green
- [ ] On `provisionStatus done:!ok`: error back-button shown, AI config NOT shown
- [ ] Provider dropdown with 5 options; API key input with show/hide toggle
- [ ] `btn-finish-setup` disabled until both provider and key filled
- [ ] `saveAiConfig` message wired to `_saveAiConfig()` → `_transitionToIde(true)`
- [ ] `skipAiConfig` message wired to `_skipAiConfig()` → `_transitionToIde(false)`
- [ ] Auto-open of gateway dashboard removed from `dockerProvision` `.then()` handlers

## Tasks

- [ ] Task 1: Add `#panel-ai-config` HTML to `_getDockerConfigHtml()` step-3 content
  - Add provider select, API key input with toggle, Finish/Skip buttons
  - Panel hidden by default (`display:none`)

- [ ] Task 2: Update step-3 JS handler for `provisionStatus done:ok`
  - Hide `#docker-config-step-3`, show `#panel-ai-config`
  - Turn all stepper pills green
  - Add `onAiConfigChange`, `toggleAiKeyVisibility`, `saveAiConfig`, `skipAiConfig` functions

- [ ] Task 3: Remove auto-open of gateway dashboard from both `dockerProvision` `.then()` handlers

- [ ] Task 4: Compile and validate via novnc MCP
  - Verify AI config panel appears after provision
  - Verify "Skip for now" closes panel (IDE transition)
  - Verify todo tests in ticket-042 spec can be promoted to real tests
