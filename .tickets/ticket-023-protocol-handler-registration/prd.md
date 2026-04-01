# PRD: Fix `occode://` Protocol Handler Registration (All Platforms)

## 2.1 Problem Statement

When `occ.mba.sh` completes a user login, it redirects the browser to `occode://openclaw.home/auth?token=<jwt>`. The OS must have the `occode://` scheme registered to hand this URL off to the app. Chrome fails to open the redirect on Windows production builds, and Linux dev mode never registers the handler at all.

**Root cause by platform:**
- **Windows (production):** The Inno Setup installer (`code.iss`) has zero `[Registry]` entries for `Software\Classes\occode`. The protocol is only registered at runtime via `app.setAsDefaultProtocolClient()`, meaning Chrome can't open `occode://` links unless the user has already launched the app first.
- **macOS:** Already handled — `darwinBundleURLTypes` in `electron.ts` bakes the scheme into `Info.plist` at build time. No fix needed.
- **Linux production (.deb):** Already handled — `postinst.template` installs the `.desktop` file and runs `update-desktop-database`. No fix needed.
- **Linux (dev + production):** The `.desktop` file is never registered when running via `launch-editor.sh` (dev) or when the `.deb` postinst is skipped/unavailable (production). Requires manual workaround.

## 2.2 Proposed Solution

1. **Windows:** Add `[Registry]` entries for `Software\Classes\occode` in `code.iss` so the URL scheme is registered at install time, before the user ever launches the app.
2. **Linux (dev + production):** Add `ensureLinuxProtocolHandler()` to `extension.ts` `activate()` to auto-write the `.desktop` file and update `mimeapps.list` on every launch where the handler isn't already current.

## 2.3 Acceptance Criteria

- [x] Windows: `occode://` links open the app from Chrome immediately after install, even without a prior launch
- [x] Windows: Protocol registry entries are cleaned up on uninstall (`uninsdeletekey` flag)
- [x] Linux: `~/.local/share/applications/occ-url-handler.desktop` written automatically on first launch (dev and production)
- [x] Linux: `~/.config/mimeapps.list` updated with `x-scheme-handler/occode` in both sections
- [x] Linux: Dev mode uses `launch-editor.sh` as Exec path; production uses `process.execPath`
- [x] Linux: Registration is idempotent — skips if already registered for the current executable path
- [x] Linux: Silent failure — never surfaces errors to the user
- [x] Linux: Re-registers automatically if the app is moved or updated (execPath changes)
- [x] macOS: No regression (no changes needed)

## 2.4 Technical Considerations

- Windows registry entries use `{#SoftwareClassesRootKey}` to respect user vs. machine install target
- Linux exec path: `launch-editor.sh` in dev (VSCODE_DEV=1 + file exists), otherwise `process.execPath`
- Idempotency keyed on exec path so re-registration triggers on app update or repo move
- `update-desktop-database` called fire-and-forget — silently ignored if not on PATH

## 2.5 Files Changed

- `apps/editor/build/win32/code.iss` — add 4 registry entries before `[Code]` section
- `apps/editor/extensions/openclaw/src/extension.ts` — add `ensureLinuxProtocolHandler()` + call site in `activate()`
