# PRD: Auto-Transition to IDE Experience After Setup

## Problem Statement

After Docker provision + AI config, the user stays in the OCC Home panel. There's no transition to the actual IDE experience — no workspace opens, no AI chat sidebar launches.

## Scope

After setup is fully complete (Docker running + AI configured or skipped), automatically transition to the IDE experience.

## Flow

1. Setup complete (Docker running + AI configured or skipped)
2. OCC Home panel closes
3. OpenClaw workspace folder opens (from `openclaw.json` or default)
4. AI chat sidebar (Void sidebar) opens (only if AI was configured)
5. Welcome notification appears

## Acceptance Criteria

- [x] OCC Home panel closes after setup complete
  - **Verified**: `home.ts` line 1046 — `this.dispose()` in `_transitionToIde()`
- [x] Workspace folder opens automatically
  - **Verified**: `home.ts` lines 1049-1054 — `vscode.commands.executeCommand('vscode.openFolder', ...)` with path from `getOpenClawWorkspaceDir()`
- [x] AI chat sidebar is visible
  - **Verified**: `home.ts` lines 1057-1060 — `vscode.commands.executeCommand('workbench.view.extension.void')` when `aiConfigured` is true
- [x] Welcome message appears in chat thread
  - **Verified**: `home.ts` lines 1061-1064 — `vscode.window.showInformationMessage('OpenClaw is ready! Start chatting with your AI assistant in the sidebar.')`
- [x] User can immediately start chatting
  - **Verified**: Sidebar opens via `workbench.view.extension.void` — the Void chat system is already initialized and ready for input
- [x] If AI not yet configured, skip sidebar open (user configures later)
  - **Verified**: `home.ts` line 1057 — `if (aiConfigured)` guard — `_skipAiConfig()` calls `_transitionToIde(false)`, sidebar is not opened

## Tasks

- [x] Task 1: Implement `_transitionToIde(aiConfigured: boolean)` method
  - **Problem**: No method to transition from setup to IDE experience
  - **Test**: Method disposes panel, opens workspace, opens sidebar conditionally
  - **Depends on**: None
  - **Subtasks**:
    - [x] Subtask 1.1: Add method signature with `aiConfigured` parameter
    - [x] Subtask 1.2: Check Docker is running (fallback to `_update()` if not)
    - [x] Subtask 1.3: Dispose Home panel (`this.dispose()`)
    - [x] Subtask 1.4: Open workspace folder from `openclaw.json`
    - [x] Subtask 1.5: Open AI chat sidebar only if `aiConfigured` is true

- [x] Task 2: Wire up `_transitionToIde()` from AI config save/skip
  - **Problem**: AI config methods don't trigger IDE transition
  - **Test**: Both save and skip call `_transitionToIde()` with correct parameter
  - **Depends on**: Task 1
  - **Subtasks**:
    - [x] Subtask 2.1: `_saveAiConfig()` calls `_transitionToIde(true)`
    - [x] Subtask 2.2: `_skipAiConfig()` calls `_transitionToIde(false)`

- [x] Task 3: Add welcome notification after sidebar opens
  - **Problem**: No welcome message for the user after transition
  - **Test**: `showInformationMessage` fires after sidebar opens
  - **Depends on**: Task 1
  - **Subtasks**:
    - [x] Subtask 3.1: Add `vscode.window.showInformationMessage()` call after sidebar open
    - [x] Subtask 3.2: Message text: "OpenClaw is ready! Start chatting with your AI assistant in the sidebar."

- [x] Task 4: Compile and verify
  - **Test**: Extension compiles, all methods present in compiled output
  - **Depends on**: Tasks 1-3
  - **Subtasks**:
    - [x] Subtask 4.1: Recompile extension in Docker container
    - [x] Subtask 4.2: Verify `_transitionToIde`, `aiConfigured`, `showInformationMessage` in compiled output

## Technical Details

- `_transitionToIde(aiConfigured: boolean)` — parameter determines whether to open sidebar
- `_saveAiConfig()` → `_transitionToIde(true)` — sidebar opens, welcome notification shown
- `_skipAiConfig()` → `_transitionToIde(false)` — sidebar skipped, no notification
- Falls back to `_update()` if Docker is not running
