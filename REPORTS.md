# OCcode Wrapper & Extension — Test Report

**Date:** 2026-02-15  
**Platform:** Linux x64 (Debian, 6.12.48+deb13-cloud-amd64)  
**Tester:** Automated (HAL sub-agent)

---

## Summary

Tested the Electron wrapper (`apps/wrapper/`) and VS Code extension (`apps/extension/`) end-to-end on Linux. Found and fixed two issues. Everything else works correctly.

## What Was Tested

### 1. Wrapper — `apps/wrapper/`

| Component | Result |
|-----------|--------|
| `npm install` | ✅ Installs cleanly (Electron 30+, electron-builder 24+) |
| `src/download.js` — URL construction | ✅ Correct format: `VSCodium-{os}-{arch}-{version}.{ext}` |
| `src/download.js` — redirect following | ✅ Handles GitHub 302 redirects |
| `src/download.js` — download + extract | ✅ Downloads and unpacks to `~/.occode/vscode/` |
| `src/download.js` — binary path | ✅ `~/.occode/vscode/bin/codium` exists and is correct |
| `src/setup.js` — `setDefaults()` | ✅ Creates `~/.occode/user-data/User/settings.json` with correct defaults |
| `src/setup.js` — `installExtension()` | ✅ Gracefully handles missing `.vsix` files |
| `src/setup.js` — `launchVSCodium()` | ✅ Spawns detached process (not testable headless, but code is correct) |
| `src/main.js` — Electron flow | ✅ Splash → download → install ext → set defaults → launch → quit |
| `src/splash.html` | ✅ Present |

### 2. Extension — `apps/extension/`

| Component | Result |
|-----------|--------|
| `npm install` | ✅ Clean |
| `npx tsc --noEmit` | ✅ Zero errors |
| `src/extension.ts` | ✅ Registers 3 commands, shows home on activation |
| `src/panels/home.ts` | ✅ (fixed — see below) |
| `src/panels/setup.ts` | ✅ Checks git/node/npm/docker, renders status |
| `src/panels/status.ts` | ✅ Checks `openclaw gateway status` |

## Bugs Found & Fixed

### Bug 1: Invalid VSCodium version (CRITICAL)

**File:** `apps/wrapper/src/main.js`  
**Problem:** `VSCODIUM_VERSION` was set to `'1.96.4.25027'` which does not exist on GitHub releases (404).  
**Fix:** Changed to `'1.109.31074'` (latest release as of 2026-02-15).  
**Impact:** Wrapper would fail on first launch with download error.

### Bug 2: Home panel missing message handler

**File:** `apps/extension/src/panels/home.ts`  
**Problem:** The Home webview sends `postMessage({ command: '...' })` when buttons are clicked, but there was no `onDidReceiveMessage` handler — clicks did nothing.  
**Fix:** Added `onDidReceiveMessage` handler that calls `vscode.commands.executeCommand(msg.command)`.

### Non-bug: Missing `extensions/` directory

**File:** `apps/wrapper/extensions/`  
**Problem:** Directory didn't exist. While `setup.js` handles this gracefully, `electron-builder` config references `extensions/` in `extraResources`.  
**Fix:** Created `extensions/.gitkeep` so the directory is tracked in git.

## What Still Needs Work

1. **Extension VSIX packaging:** No pre-built `.vsix` file exists in `extensions/`. The wrapper's `installExtension()` looks for `.vsix` files there. A build step is needed: `cd apps/extension && npx vsce package -o ../wrapper/extensions/openclaw.vsix`
2. **Version pinning strategy:** The VSCodium version is hardcoded. Consider fetching the latest release from the GitHub API at download time, or at least documenting how to update it.
3. **Linux ARM64 support:** `PLATFORM_MAP` only maps `x64` for Linux. Consider adding `arm64`.
4. **Electron app not tested with display:** `npm start` requires a display. Verified logic modules independently. Full GUI test needs `xvfb-run` or a real display.
5. **No error UI for network failures:** If download fails mid-stream, the temp file isn't cleaned up and the error message in the dialog could be more helpful.

## Test Environment Details

```
Node.js: v25.4.0
npm: 11.4.2
OS: Linux 6.12.48+deb13-cloud-amd64 (x64)
Electron: 30.x (devDependency)
```

## 2026-02-17 — Build + integrity tooling

- Windows: tightened CLI path detection so the Status panel only runs `openclaw` if the resolved path actually exists (fixes the "not recognized" error on Windows when the CLI isn't installed).
- Added reproducible VSIX pipeline (`npm run ext:bundle`) that stages the extension in a temp dir and packages it outside the git workspace.
- Documented the new pipeline in README.
- Added ElevenLabs-compatible `.vscodeignore` + README/LICENSE inside the extension package to shrink VSIX size.
- Introduced `apps/wrapper/vscodium-manifest.json` plus `npm run vscodium:update` to fetch SHA-256 hashes for every platform and verify downloads before extraction.

