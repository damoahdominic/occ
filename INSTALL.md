# OCCode Installation — Technical Reference

This document covers how OCCode's built-in OpenClaw installer works, what
prerequisites it checks, and the design decisions behind the install flow.

---

## Overview

When a user opens OCCode and OpenClaw is not installed, the Home panel offers a
one-click install. The installer runs **silently** (no terminal window) and
streams output to the Home panel in real-time.

The install flow follows this sequence:

```
1. Prerequisite checks (platform-specific)
2. Permission detection (proactive sudo)
3. Install via npm or fallback script
4. Post-install CLI verification
5. Auto-configure (if signed in)
```

---

## Prerequisites by Platform

### macOS

| Prerequisite | Check | If Missing |
|---|---|---|
| Xcode CLI Tools | `xcode-select -p` | Triggers `xcode-select --install` (system dialog), asks user to restart |
| Node.js ≥ 20 | `node --version` + nvm check (`~/.nvm/nvm.sh`) | Warns; falls through to install script |
| npm | `npm --version` | Warns; falls through to install script |
| Write access | `fs.accessSync(npmPrefix, W_OK)` | Asks for sudo password **upfront** |

### Windows

| Prerequisite | Check | If Missing |
|---|---|---|
| Node.js | `node --version` | Fails with link to nodejs.org |
| npm | `npm --version` | Fails with link to nodejs.org |

Windows does not require elevated permissions for npm global installs (they go
to `%APPDATA%\npm`).

### Linux

Same checks as macOS minus Xcode CLI Tools.

---

## Proactive Sudo (macOS / Linux)

**Problem solved:** Previously, the installer would attempt `npm install -g`,
fail with `EACCES`, then ask for a password and retry. This caused confusing
error output and a poor UX.

**New approach:** Before any install command runs:

1. If npm is available: check write access to `$(npm config get prefix)/bin`
   and `$(npm config get prefix)/lib`
2. If npm is not available: check write access to `/usr/local/bin` and
   `/usr/local/lib`
3. If either check fails → prompt for password via the in-webview modal
4. Cache credentials with `sudo -S -v`
5. All subsequent install commands use `sudo -E` from the start

After install, `~/.openclaw` ownership is fixed with
`sudo chown -R $USER:$USER ~/.openclaw && chmod 700 ~/.openclaw`.

---

## PATH Detection (`_buildExecEnv`)

After install, the extension needs to find the `openclaw` binary. The following
directories are added to PATH for all spawned processes:

### macOS / Linux

| Path | Source |
|---|---|
| `/usr/local/bin` | Standard system |
| `/opt/homebrew/bin` | Homebrew (Apple Silicon) |
| `~/.local/bin` | User-local installs |
| `~/.npm-global/bin` | Custom npm prefix |
| `~/.openclaw/bin` | OpenClaw self-install |
| `~/.nvm/versions/node/v*/bin` | nvm (top 3 versions, newest first) |
| `~/.local/share/fnm/node-versions/v*/bin` | fnm |
| `/opt/homebrew/opt/node/bin` | Homebrew Node (macOS) |
| `/usr/local/opt/node/bin` | Homebrew Node Intel (macOS) |

### Windows

| Path | Source |
|---|---|
| `%APPDATA%\npm` | npm global |
| `%ProgramFiles%\nodejs` | Official installer |
| `%LOCALAPPDATA%\Programs\nodejs` | User-scoped installer |
| `%SystemRoot%\System32` | System |

---

## Post-Install CLI Verification

After install reports success, the extension does **not** immediately run
`openclaw onboard`. Instead:

1. Waits 2 seconds for PATH changes to settle
2. Sends `verifyCliBeforeSetup` message to extension host
3. Extension host runs `_testOpenClawCli()` which:
   - Sources `~/.nvm/nvm.sh` if present
   - Enumerates `~/.nvm/versions/node/*/bin/openclaw`
   - Falls back to `_findOpenClawPath()` with expanded PATH
4. If found → proceeds to auto-configure
5. If not found → shows "Please restart OCCode" message

This prevents the `ENOENT` crash that occurred when the binary was installed
but not yet visible to the extension process.

---

## Install Methods (in order of preference)

### Method 1: npm install -g

```bash
# Without sudo (nvm, user-writable prefix)
npm install -g openclaw

# With sudo (system prefix like /usr/local)
sudo -E npm install -g openclaw
```

### Method 2: Install script

```bash
# Without sudo
curl -fsSL https://openclaw.ai/install.sh | bash

# With sudo
sudo -E bash -c 'curl -fsSL https://openclaw.ai/install.sh | bash'
```

### Method 3: PowerShell (Windows only)

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -Command `
  "Invoke-WebRequest -UseBasicParsing https://openclaw.ai/install.ps1 | Invoke-Expression"
```

---

## Failure Handling

If all install methods fail:

1. Full output log is collected
2. AI assistant (MoltPilot) is invoked with the complete log + system info
3. User can ask MoltPilot for platform-specific troubleshooting

---

## Files Modified

All install logic lives in:

```
apps/editor/extensions/openclaw/src/panels/home.ts
```

Key methods:
- `runInstall()` — main install flow with prerequisite checks
- `_buildExecEnv()` — PATH construction for spawned processes
- `_testOpenClawCli()` — post-install binary detection (nvm-aware)
- `_findOpenClawPath()` — binary path resolution

---

## Related Files

- `apps/editor/build/npm/preinstall.js` — Node.js version gate (≥ 20.18.1)
  and Visual Studio Build Tools check (Windows only, for editor development)
- `CONTRIBUTING.md` — development prerequisites (Node 20.18.2, Python 3, Git)
- `.github/workflows/build-macos.yml` — CI build for all platforms
