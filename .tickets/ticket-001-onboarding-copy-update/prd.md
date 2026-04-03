# PRD: Ticket 001 - Onboarding Copy Update

## 1. Problem Statement

The OCCode onboarding flow contains references to "MoltPilot" in user-facing copy that should be updated to reflect the current branding. The "$1 free tier" and "Lasts about a week" strings referenced in the original PRD no longer exist in the code — those were already updated in a previous pass.

## 2. Current State Audit

Strings found in `home.ts` that need updating:

| Line | Current Text | Context | User-facing? |
|------|-------------|---------|-------------|
| 2186 | `Start Free` | Free tier CTA button | ✅ Yes |
| 2932 | `Start Free` | Wizard step 0 CTA button | ✅ Yes |
| 2225 | `Ask MoltPilot to fix this` | Error help button | ✅ Yes |
| 2320 | `Installing Inference for MoltPilot...` | Setup log message | ✅ Yes |
| 1618 | `handing off to MoltPilot for installation...` | Wizard log message | ✅ Yes |
| 518, 1477, 1478, 1615 | MoltPilot comments | Internal code comments | ❌ No |
| 1911, 2507-2508 | MoltPilot function names/IDs | Internal JS | ❌ No (but button text is user-facing) |

## 3. Proposed Solution

Update user-facing strings only (no logic changes):

- **Free CTA button** (lines 2186, 2932): `Start Free` → `Create Account`
- **Error help button** (line 2225): `Ask MoltPilot to fix this` → `Ask AI to fix this`
- **Setup log** (line 2320): `Installing Inference for MoltPilot...\nInstalling Inference for your new OpenClaw...` → `Installing Inference for your new OpenClaw...`
- **Wizard log** (line 1618): `handing off to MoltPilot for installation...` → `handing off to AI assistant for installation...`

Internal comments and function names (`askMoltPilot`, `molt-help` class, etc.) are NOT user-facing and should NOT be changed — renaming them would require changes across multiple files and provides no user benefit.

## 4. Acceptance Criteria

- [x] Free CTA buttons say "Create Account" instead of "Start Free"
- [x] Error help button says "Ask AI to fix this" instead of "Ask MoltPilot to fix this"
- [x] Setup log no longer references "MoltPilot" in user-visible messages
- [x] Wizard log no longer references "MoltPilot" in user-visible messages
- [x] No logic changes — only string replacements
- [x] Internal function names and CSS classes unchanged (non-user-facing)

## 5. Dependencies

- None (standalone UI text update)

## 6. Subtask Checklist

- [x] Task 1: Audit current strings in home.ts
  - **Problem**: PRD references strings that don't exist; need to find what actually needs changing
  - **Test**: Grep for "MoltPilot", "Start Free" in extension source
  - **Subtasks**:
    - [x] Subtask 1.1: Search and document all occurrences
    - [x] Subtask 1.2: Classify as user-facing vs internal

- [x] Task 2: Apply string replacements
  - **Problem**: Update user-facing text correctly
  - **Test**: Recompile extension and verify strings in compiled output
  - **Subtasks**:
    - [x] Subtask 2.1: Update "Start Free" → "Create Account" (2 locations)
    - [x] Subtask 2.2: Update "Ask MoltPilot to fix this" → "Ask AI to fix this"
    - [x] Subtask 2.3: Update "Installing Inference for MoltPilot..." log message
    - [x] Subtask 2.4: Update "handing off to MoltPilot" wizard log message

- [x] Task 3: Verify in compiled output
  - **Problem**: Ensure changes are reflected in compiled JS
  - **Test**: Recompile extension inside Docker container, grep compiled output
  - **Subtasks**:
    - [x] Subtask 3.1: Recompile extension (`npx tsc -p ./` inside container)
    - [x] Subtask 3.2: Verify "Create Account" appears in compiled home.js
    - [x] Subtask 3.3: Verify no user-facing "MoltPilot" remains in compiled output
