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

## Technical Details

- New panel: `#panel-ai-config` in `_getSetupHtml()`
- Message: `{ command: 'saveAiConfig', provider, apiKey }`
- Handler extends the existing `openclaw.json` with AI config
- After save or skip, calls `_transitionToIde()` to close panel and open IDE
