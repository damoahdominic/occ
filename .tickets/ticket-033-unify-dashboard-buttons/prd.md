# PRD: Unify "Open Dashboard" — Single Destination

## Problem Statement

Two different "Open Dashboard" buttons go to completely different places:
- Provision wizard → `openclaw.configure` → local web control at `http://localhost:18789/`
- User popover → `https://occ.mba.sh/dashboard` (external MBA.sh web app)

This is confusing and inconsistent.

## Scope

Rename the provision wizard button to "Open Web Control" (local), keep the popover's "Open Dashboard" as-is (external). Add a clear "Open Web Control" button to the status dashboard too.

## Acceptance Criteria

- [ ] Provision button labeled "Open Web Control →"
- [ ] Status dashboard has "Open Web Control" button
- [ ] User popover retains "Open Dashboard" (external) — unchanged
- [ ] Both commands work correctly for Docker and Local hosts
- [ ] No regression in existing dashboard open behavior

## Technical Details

- home.ts:2462 — change button text to "Open Web Control →"
- statusHtml.ts — add "Open Web Control" button that fires `openclaw.configure`
- User popover (home.ts:190-191, statusHtml.ts:57-60) — unchanged, still opens `https://occ.mba.sh/dashboard`
