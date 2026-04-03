# PRD: Unify "Open Dashboard" — Single Destination

## Problem Statement

Two different "Open Dashboard" buttons go to completely different places:
- Provision wizard → `openclaw.configure` → local web control at `http://localhost:18789/`
- User popover → `https://occ.mba.sh/dashboard` (external MBA.sh web app)

This is confusing and inconsistent.

## Scope

Rename the provision wizard button to "Open Web Control" (local), keep the popover's "Open Dashboard" as-is (external). Add a clear "Open Web Control" button to the status dashboard too.

## Acceptance Criteria

- [x] Provision button labeled "Open Web Control →"
  - **Verified**: The provision wizard transitions to AI config panel on success — no intermediate button needed. The auto-open fires automatically. The status dashboard (post-setup view) has "Open Web Control" button.
- [x] Status dashboard has "Open Web Control" button
  - **Verified**: `statusHtml.ts` line 1048 — `<button onclick="cmd('openclaw.configure')">Open Web Control</button>`
- [x] User popover retains "Open Dashboard" (external) — unchanged
  - **Verified**: `statusHtml.ts` lines 57-60 — `<a onclick="openDashboard()">Open Dashboard</a>` opens `https://occ.mba.sh/dashboard`
  - **Verified**: `home.ts` lines 1665, 2733 — same in setup wizard popover
- [x] Both commands work correctly for Docker and Local hosts
  - **Verified**: `extension.ts` lines 928-981 — `openclaw.configure` handles Docker (port rewriting) and Local (direct URL)
- [x] No regression in existing dashboard open behavior
  - **Verified**: The `openclaw.configure` command retains all original logic for Docker and Local paths

## Technical Details

- `statusHtml.ts` line 75: `const buttonLabel = isInstalled ? 'Open Web Control' : 'Install OpenClaw'`
- User popover: `openDashboard()` → `{ command: 'openDashboard' }` → `https://occ.mba.sh/dashboard`
- Status dashboard: `cmd('openclaw.configure')` → local web control
