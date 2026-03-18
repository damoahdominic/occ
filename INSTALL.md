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
| Node.js >= 20 | `node --version` + nvm check | Auto-installs via nvm or official .pkg |
| npm | `npm --version` | Comes with Node.js install |
| Write access | `fs.accessSync(npmPrefix, W_OK)` | Asks for sudo password **upfront** |

### Windows

| Prerequisite | Check | If Missing |
|---|---|---|
| Node.js | `node --version` | Fails with link to nodejs.org |
| npm | `npm --version` | Fails with link to nodejs.org |

### Linux

| Prerequisite | Check | If Missing |
|---|---|---|
| Node.js >= 20 | `node --version` + nvm check | Auto-installs via nvm, apt-get, dnf, or yum |
| npm | `npm --version` | Comes with Node.js install |
| Write access | `fs.accessSync(/usr/local/*, W_OK)` | Asks for sudo password **upfront** |

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
3. If either check fails -> prompt for password via the in-webview modal
4. Cache credentials with `sudo -S -v`
5. All subsequent install commands use `sudo -E`/`sudo -n` from the start

The cached sudo session is reused across Node.js install + openclaw install,
so the user only enters their password once.

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
2. Sends `verifyCliBeforeSetup` to extension host
3. Extension host runs `_testOpenClawCli()` (nvm-aware)
4. If found -> proceeds to auto-configure
5. If not found -> shows "Please restart OCCode" message

This prevents the `ENOENT` crash that occurred when the binary was installed
but not yet visible to the extension process.

---

## Install Methods (in order of preference)

### Unix with npm available

```bash
# Without sudo (nvm, user-writable prefix)
npm install -g openclaw

# With sudo (system prefix like /usr/local)
sudo -E npm install -g openclaw
```

### Unix without npm (auto Node.js install)

1. Try nvm if `~/.nvm/nvm.sh` exists
2. macOS: download official Node.js .pkg, install via `sudo installer`
3. Linux: use nodesource setup script + apt-get/dnf/yum
4. Then `npm install -g openclaw`

### Windows

```bash
npm install -g openclaw
```

Fallback:
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
- `runInstall()` — main install flow with prerequisite checks + proactive sudo
- `_buildExecEnv()` — PATH construction for spawned processes (nvm/fnm/homebrew aware)
- `_testOpenClawCli()` — post-install binary detection (nvm-aware)
- `_findOpenClawPath()` — binary path resolution
