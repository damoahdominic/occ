# PRD: AI Model Configuration After Docker Provision

## Problem Statement

After Docker compose succeeds, `openclaw.json` only has gateway config — no AI provider or model configured. The user must manually open the web control panel to configure AI, breaking the setup flow.

## Scope

Add an AI model configuration step after Docker provision completes. The provision panel transitions to an AI config panel where the user selects a provider and enters their API key.

## Flow

1. Docker provision succeeds → "Docker environment is ready!"
2. AI config panel slides in (no user action needed)
3. User selects provider (Anthropic, OpenAI, Google, etc.)
4. User enters API key
5. "Finish Setup" → writes full config to `openclaw.json` → transitions to IDE experience

## Acceptance Criteria

- [x] AI config panel appears automatically after Docker provision succeeds
  - **Verified**: `home.ts` line 2653-2654 — provision panel hidden, AI config panel shown on `provisionStatus done:ok`
- [x] Provider dropdown with: Anthropic, OpenAI, Google, Groq, OpenRouter
  - **Verified**: `home.ts` lines 2042-2048 — `<select id="ai-provider-select">` with all 5 options
- [x] API key input field with show/hide toggle
  - **Verified**: `home.ts` lines 2053-2056 — password input with `ai-key-toggle` button, `toggleAiKeyVisibility()` function
- [x] "Finish Setup" button writes config and transitions
  - **Verified**: `home.ts` line 2061 — button calls `saveAiConfig()`, handler at line 308-311 calls `_saveAiConfig()` → `_transitionToIde(true)`
- [x] Config written to `openclaw.json` with `agents.defaults.model.primary` and `models.providers`
  - **Verified**: `home.ts` lines 953-994 — writes both `models.providers[provider]` and `agents.defaults.model.primary`
- [x] "Skip for now" button for users who want to configure later
  - **Verified**: `home.ts` line 2060 — button calls `skipAiConfig()`, handler at line 312-313 calls `_skipAiConfig()` → `_transitionToIde(false)`

## Tasks

- [x] Task 1: Add AI config panel HTML to `_getSetupHtml()`
  - **Problem**: No UI for AI configuration after Docker provision
  - **Test**: `#panel-ai-config` renders with provider dropdown, API key input, Finish/Skip buttons
  - **Depends on**: None
  - **Subtasks**:
    - [x] Subtask 1.1: Add `#panel-ai-config` HTML with provider dropdown (5 options)
    - [x] Subtask 1.2: Add API key input with show/hide toggle button
    - [x] Subtask 1.3: Add "Finish Setup" and "Skip for now" buttons
    - [x] Subtask 1.4: Panel hidden by default (`display:none`)

- [x] Task 2: Wire up AI config panel display after Docker provision succeeds
  - **Problem**: Panel doesn't appear automatically after provision
  - **Test**: After `provisionStatus done:ok`, AI config panel is visible
  - **Depends on**: Task 1
  - **Subtasks**:
    - [x] Subtask 2.1: Modify `provisionStatus` handler to hide provision panel and show AI config panel
    - [x] Subtask 2.2: Advance step timeline (step-configure → done, step-ready → active)

- [x] Task 3: Implement saveAiConfig message handler and `_saveAiConfig()` method
  - **Problem**: No backend handler to write AI config to `openclaw.json`
  - **Test**: Config file contains `models.providers` and `agents.defaults.model.primary` after save
  - **Depends on**: Task 1
  - **Subtasks**:
    - [x] Subtask 3.1: Add `saveAiConfig` message handler in webview message listener
    - [x] Subtask 3.2: Implement `_saveAiConfig()` — read existing config, write provider + API key, set primary model
    - [x] Subtask 3.3: Call `_transitionToIde(true)` after save

- [x] Task 4: Implement skipAiConfig handler
  - **Problem**: No way to skip AI configuration
  - **Test**: "Skip for now" button proceeds without writing AI config
  - **Depends on**: Task 1
  - **Subtasks**:
    - [x] Subtask 4.1: Add `skipAiConfig` message handler
    - [x] Subtask 4.2: Implement `_skipAiConfig()` — log skip, call `_transitionToIde(false)`

- [x] Task 5: Compile and verify
  - **Test**: Extension compiles without errors, all selectors present in compiled output
  - **Depends on**: Tasks 1-4
  - **Subtasks**:
    - [x] Subtask 5.1: Recompile extension in Docker container
    - [x] Subtask 5.2: Verify all AI config selectors in compiled `home.js`

## Technical Details

- New panel: `#panel-ai-config` in `_getSetupHtml()`
- Message: `{ command: 'saveAiConfig', provider, apiKey }`
- Handler extends the existing `openclaw.json` with AI config
- After save or skip, calls `_transitionToIde()` to close panel and open IDE
