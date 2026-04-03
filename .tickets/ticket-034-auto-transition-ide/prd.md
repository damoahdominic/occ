# PRD: Auto-Transition to IDE Experience After Setup

## Problem Statement

After Docker provision + AI config, the user stays in the OCC Home panel. There's no transition to the actual IDE experience — no workspace opens, no AI chat sidebar launches.

## Scope

After setup is fully complete (Docker running + AI configured), automatically transition to the IDE experience.

## Flow

1. Setup complete (Docker running + AI configured)
2. OCC Home panel closes
3. OpenClaw workspace folder opens (from `openclaw.json` or default)
4. AI chat sidebar (Void sidebar) opens
5. Welcome message appears in chat thread

## Acceptance Criteria

- [ ] OCC Home panel closes after setup complete
- [ ] Workspace folder opens automatically
- [ ] AI chat sidebar is visible
- [ ] Welcome message appears in chat thread
- [ ] User can immediately start chatting
- [ ] If AI not yet configured, skip sidebar open (user configures later)

## Technical Details

- After AI config saved (or skipped), fire transition sequence:
  1. `HomePanel.dispose()` — close the panel
  2. `vscode.workspace.openTextDocument()` or `vscode.commands.executeCommand('vscode.openFolder')`
  3. `vscode.commands.executeCommand('workbench.view.extension.void-sidebar')` — open AI chat
  4. Post message to sidebar to show welcome thread
