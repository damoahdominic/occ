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
5. "Finish Setup" → writes full config to `openclaw.json` → transitions to Hosts Overview

## Acceptance Criteria

- [ ] AI config panel appears automatically after Docker provision succeeds
- [ ] Provider dropdown with: Anthropic, OpenAI, Google, Groq, OpenRouter
- [ ] API key input field with show/hide toggle
- [ ] "Finish Setup" button writes config and transitions
- [ ] Config written to `openclaw.json` with `agents.defaults.model.primary` and `models.providers`
- [ ] "Skip for now" button for users who want to configure later

## Technical Details

- New panel: `#panel-ai-config` in `_getSetupHtml()`
- Message: `{ command: 'saveAiConfig', provider, apiKey }`
- Handler extends the existing `openclaw.json` with AI config
- After save, calls `_update()` to show Hosts Overview
