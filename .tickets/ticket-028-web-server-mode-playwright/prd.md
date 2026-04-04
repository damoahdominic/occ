# PRD: Editor Web Server Mode + Playwright Test Automation

## 2.1 Problem Statement

The editor currently only runs as a desktop Electron app via `launch-editor.sh`. This means:

1. **No browser access** — the editor cannot be loaded in a regular browser tab, blocking remote dev workflows and device-agnostic access.
2. **Playwright testing is hard** — ticket-016 proposed Electron/CDP automation, which is brittle. Testing via a real browser pointed at `http://localhost` is far simpler, faster, and more stable.
3. **No tunnel support** — there is no path to expose the editor over an HTTP tunnel (ngrok, Cloudflare, VS Code tunnel) for demos, remote pair programming, or CI environments without a display.

The VS Code base already ships two web-capable entry points (`scripts/code-server.sh` and `scripts/code-web.sh`) that need to be validated and wired up for OCC's extension.

## 2.2 Background — Two Existing Modes

| Script | Mechanism | Port | Use case |
|---|---|---|---|
| `scripts/code-server.sh` | VS Code Server (REH) — full server with remote extension host | 9888 | Production-grade web access, persistent sessions |
| `scripts/code-web.sh` | `@vscode/test-web` — in-browser workbench, extensions run in web worker | random | Extension testing in browser context |

For **Playwright test automation**, `code-server.sh` is the better target: it runs the full extension host (Node.js), meaning all openclaw extension code runs identically to the desktop app. `code-web.sh` / `@vscode/test-web` only runs extensions that have a web-compatible bundle, which openclaw does not currently have.

For **tunnel access**, `code-server.sh` serves a real HTTP endpoint that any reverse proxy can front.

## 2.3 Proposed Solution

### Phase 1 — Validate `code-server.sh` with OCC extension (Investigation)

1. Run `./scripts/code-server.sh --launch` and verify the workbench loads at `http://localhost:9888`.
2. Check whether the openclaw extension activates in server mode:
   - Extension host starts in a Node.js remote process — should be compatible.
   - Confirm `vscode.env.uriScheme`, `vscode.env.appHost`, `vscode.env.openExternal` behave correctly.
3. Identify any server-mode-specific failures in the openclaw extension:
   - `occode://` deep links — not applicable in browser; `vscode.env.asExternalUri` must be used instead.
   - Protocol handler registration (`ensureDevProtocolHandler`) — should be skipped in server mode (no desktop OS).
   - `cp.spawn('update-desktop-database', ...)` and `lsregister` — must not run in server mode.
4. Document any required guards (`vscode.env.remoteName`, `vscode.env.appHost !== 'desktop'`) needed to skip desktop-only code paths.

### Phase 2 — `launch-server.sh` script

Add a `launch-server.sh` alongside `launch-editor.sh` that starts the web server with OCC-specific defaults:

```bash
#!/usr/bin/env bash
# Starts the OCC editor as an HTTP web server (no Electron required)
# Usage: ./launch-server.sh [--port PORT] [--launch]
cd "$(dirname "$0")/apps/editor"
VSCODE_DEV=1 VSCODE_SKIP_PRELAUNCH= ./scripts/code-server.sh \
  --port "${OCC_SERVER_PORT:-9888}" \
  --without-connection-token \
  "$@"
```

`--without-connection-token` disables the one-time token for local dev; for tunnel/CI use a proper token or auth proxy.

### Phase 3 — Playwright targeting the web server

Replace ticket-016's Electron/CDP approach with browser-based Playwright:

**`playwright.config.ts`** (new file at repo root):
```ts
import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e',
  use: {
    baseURL: 'http://localhost:9888',
    browserName: 'chromium',
  },
  webServer: {
    command: './launch-server.sh',
    url: 'http://localhost:9888',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
```

`playwright.config.ts` `webServer` block starts the server before tests and tears it down after — no manual process management needed.

**Test structure** (`tests/e2e/`):
- `home-panel.spec.ts` — home panel renders, shows correct setup state
- `auth-signin.spec.ts` — Sign In button opens correct URL, post-auth token storage
- `docker-setup.spec.ts` — docker setup wizard steps render and respond correctly
- `settings.spec.ts` — settings panel toggle between Credits and BYOK

### Phase 4 — Tunnel access (optional, for CI / remote demos)

With the HTTP server running, any tunnel tool works:

```bash
# Cloudflare Quick Tunnel (no account needed)
cloudflared tunnel --url http://localhost:9888

# VS Code tunnel (requires `code` CLI on PATH)
code tunnel --accept-server-license-terms
```

For CI (GitHub Actions), the server runs headlessly — no Xvfb needed (pure HTTP, no Electron).

## 2.4 Acceptance Criteria

- [ ] `./scripts/code-server.sh --launch` opens the OCC workbench in a browser with the openclaw extension active
- [ ] Desktop-only code paths (protocol handler registration, `lsregister`, `update-desktop-database`, `reg add`) are skipped in server mode
- [ ] `launch-server.sh` starts the server cleanly and exits on Ctrl+C
- [ ] `npx playwright test` runs against the live server and at least one test passes (smoke test)
- [ ] `playwright.config.ts` `webServer` block starts/stops the server automatically
- [ ] Server starts in GitHub Actions CI without a display (no Xvfb)
- [ ] Sign-in flow works in browser mode: `redirect_uri` loopback callback (ticket-026) delivers token to server-mode extension host

## 2.5 Key Risks

| Risk | Mitigation |
|---|---|
| openclaw extension uses Node.js APIs not available in web worker | Server mode runs a real Node.js extension host — same as desktop. Not an issue unless we later target `code-web.sh`. |
| `vscode.env.openExternal` in server mode opens URL on the server, not the client browser | Must use `vscode.env.asExternalUri` to produce a client-side redirect; the loopback auth server (ticket-026) handles token receipt. |
| `ensureDevProtocolHandler` tries to write `.desktop` / registry on server | Guard with `vscode.env.appHost !== 'desktop'` or check `process.env['VSCODE_SERVER']`. |
| Session persistence across server restarts | VS Code Server uses a connection token + workspace state. Acceptable for dev; for CI use `--user-data-dir` temp dir. |

## 2.6 Files to Add / Change

| File | Change |
|---|---|
| `launch-server.sh` | New — thin wrapper around `scripts/code-server.sh` with OCC defaults |
| `playwright.config.ts` | New — Playwright config pointing at `localhost:9888` with `webServer` |
| `tests/e2e/` | New — initial test directory with at least a smoke test |
| `apps/editor/extensions/openclaw/src/extension.ts` | Guard desktop-only activation paths (`ensureDevProtocolHandler`, signal handlers) behind `vscode.env.appHost === 'desktop'` or equivalent |
| `package.json` (root) | Add `"test:e2e": "playwright test"` script |

## 2.7 Relationship to Other Tickets

- **Ticket-016** (Automated E2E Tests) — this ticket supersedes the Electron/CDP approach proposed there. Web server mode is simpler and more maintainable.
- **Ticket-026** (Deep-link redirect URI) — the loopback auth server must work in web mode; `occode://` fallback is not available in browser context.
