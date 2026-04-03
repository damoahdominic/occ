# PRD: MoltPilot Open Chat Button — Image Input Error Fix

## Problem Statement

Clicking the MoltPilot "Open Chat" button (or any call to `void.openChatWithMessage`) fails with:
```
ERROR: Cannot read "image.png" (this model does not support image input). Inform the user.
```

This happens when the user has staged selections that include image files. The `void.openChatWithMessage` command inherits the thread's `stagingSelections`, which may contain images. When the model doesn't support image input, the API rejects the request.

## Root Cause

In `sidebarActions.ts` line 199, `addUserMessageAndStreamResponse()` was called without `_chatSelections`:
```ts
await chatThreadService.addUserMessageAndStreamResponse({ userMessage: message, threadId })
```

The method falls back to `thread.state.stagingSelections` (chatThreadService.ts:1277), which includes any staged files — including images.

## Solution

Pass an empty `_chatSelections: []` array to explicitly prevent staged selections from being included:
```ts
await chatThreadService.addUserMessageAndStreamResponse({ userMessage: message, _chatSelections: [], threadId })
```

## Acceptance Criteria

- [x] `void.openChatWithMessage` no longer inherits staged selections
- [x] No image input errors when opening chat with message
- [x] Chat opens and streams response normally
- [x] No regression — other chat functionality unaffected

## Tasks

- [x] Task 1: Fix `void.openChatWithMessage` to pass empty `_chatSelections`
  - **Problem**: Staged selections (including images) are inherited by the new chat thread
  - **Test**: Call `void.openChatWithMessage` with staged image file — no error
  - **Depends on**: None
  - **Subtasks**:
    - [x] Subtask 1.1: Add `_chatSelections: []` to `addUserMessageAndStreamResponse` call in sidebarActions.ts
    - [x] Subtask 1.2: Verify fix — no image errors, chat opens normally

## Technical Details

- File: `apps/editor/src/vs/workbench/contrib/void/browser/sidebarActions.ts` line 199
- The `void.openChatWithMessage` command is used by:
  - MoltPilot "Open Chat" button
  - "Ask MoltPilot to fix this" button in setup wizards
  - Extension handoff messages
  - Uninstall handoff messages
- All callers pass text-only messages — no staged selections are needed
