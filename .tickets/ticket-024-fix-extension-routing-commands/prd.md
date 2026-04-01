# PRD: Fix Extension Panel Routing — Ghost Commands

## 2.1 Problem Statement

Three commands are called throughout the extension but were never registered, causing silent failures in all panel routing:

- `openclaw.host.setup.local` — called by `routeHome()` and the host picker in `HomePanel`
- `openclaw.host.setup.docker` — called by `routeHome()` and the host picker in `HomePanel`
- `openclaw.host.setup.ssh` — called by the host picker in `HomePanel`

**Impact:**
- `routeHome()` (the `openclaw.home` command) silently fails whenever a local install or Docker container is detected — the home panel never opens
- The `openclaw.install` command (visible in the command palette) delegates to `openclaw.host.setup.local` and therefore does nothing
- Picking a host type in the host picker closes the picker but opens no follow-up panel
- All auto-routing on startup is broken for any configured machine

## 2.2 Root Cause

The extension was refactored to a multi-host adapter system (`HostRegistry`/`HostManager`) but the three host setup command registrations were deleted and never replaced. The call sites remained.

## 2.3 Solution

Register the three missing commands in `extension.ts` `activate()` alongside the existing `openclaw.home` and `openclaw.home.picker` commands:

- `openclaw.host.setup.local` — sets `WindowHostBinding` to `{ type: 'local', hostId: 'local:main', port: configuredPort, label: 'Local' }` if not already set, then calls `HomePanel.createOrShow()`
- `openclaw.host.setup.docker` — sets `WindowHostBinding` to `{ type: 'docker', hostId: 'docker:occ-openclaw', port: 18789, label: 'Docker' }` if not already set, then calls `HomePanel.createOrShow()`
- `openclaw.host.setup.ssh` — opens `HomePanel.createOrShow()` directly (SSH config is entered via the panel UI)

Binding is only written if the type doesn't already match, preserving any existing port/hostId configured for that host.

## 2.4 Acceptance Criteria

- [x] `openclaw.home` command opens the home panel when local OpenClaw is installed
- [x] `openclaw.home` command opens the home panel when Docker container is running
- [x] `openclaw.install` from the command palette opens the local setup panel
- [x] Picking "local" in the host picker opens the local dashboard
- [x] Picking "docker" in the host picker opens the docker dashboard
- [x] Picking "ssh" in the host picker opens the home panel for SSH setup
- [x] Auto-routing on startup works correctly for all configured machines

## 2.5 Files Changed

- `apps/editor/extensions/openclaw/src/extension.ts` — register 3 missing commands after `openclaw.home.picker` (~line 763)
