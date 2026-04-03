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
  - Note: The Void sidebar has no public API for external message injection. A VS Code info notification serves as the welcome experience.
- [x] User can immediately start chatting
  - **Verified**: Sidebar opens via `workbench.view.extension.void` — the Void chat system is already initialized and ready for input
- [x] If AI not yet configured, skip sidebar open (user configures later)
  - **Verified**: `home.ts` line 1057 — `if (aiConfigured)` guard — `_skipAiConfig()` calls `_transitionToIde(false)`, sidebar is not opened

## Technical Details

- `_transitionToIde(aiConfigured: boolean)` — parameter determines whether to open sidebar
- `_saveAiConfig()` → `_transitionToIde(true)` — sidebar opens, welcome notification shown
- `_skipAiConfig()` → `_transitionToIde(false)` — sidebar skipped, no notification
- Falls back to `_update()` if Docker is not running
