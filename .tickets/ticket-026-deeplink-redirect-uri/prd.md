# PRD: Per-Launch Loopback Auth Callback + Dev Scheme Ownership

## 2.1 Problem Statement

When the user clicks **Sign In** the editor opens:

```
https://occ.mba.sh/login?ref=occ-editor
```

After authentication the backend redirects to the hard-coded `occode://openclaw.home/auth?token=<jwt>`.
This has three failure modes:

1. **Protocol handler not yet registered** (first `launch-editor.sh` run, fresh machine) — the browser can't open `occode://` and the auth token is silently dropped.
2. **Multiple running instances** — the OS routes the `occode://` URI to whichever editor window it picks; the instance that initiated the sign-in has no guarantee it will receive the token.
3. **External `occode://` links while dev is running** — if a production install is registered as the scheme handler, clicking an `occode://` link (from a browser, email, CI notification) while `launch-editor.sh` is running opens the production app instead of the live dev instance.

Failures 1 and 2 are solved by a **per-launch local HTTP loopback server** as the `redirect_uri`.
Failure 3 is solved by **temporarily owning the `occode://` scheme** for the lifetime of the dev process.

## 2.2 Proposed Solution

### 2.2.1 Loopback server started on sign-in

When the user initiates sign-in the extension:

1. Creates a temporary `http.Server` bound to `127.0.0.1:0` — the OS assigns a random free port.
2. Builds `redirect_uri = http://127.0.0.1:<port>/auth`.
3. Opens the browser to `https://occ.mba.sh/login?ref=occ-editor&redirect_uri=<encoded>`.
4. The server waits for a single `GET /auth?token=<jwt>` request.
5. On receipt: stores the token (same path as the existing `registerUriHandler`), responds with a close-the-tab HTML page, then closes the server.
6. Auto-closes after 10 minutes if no auth arrives.

This guarantees the token lands in the exact instance that opened the browser tab, with no dependency on OS protocol handler registration.

```
Browser                      occ.mba.sh              Editor instance
   |                              |                        |
   |-- GET /login?redirect_uri=http://127.0.0.1:PORT/auth →|
   |                              |                        |
   |<-- auth form, user logs in --|                        |
   |                              |                        |
   |-- POST /auth (credentials) →|                        |
   |                              |                        |
   |<-- 302 → http://127.0.0.1:PORT/auth?token=JWT --------|
   |                                                       |
   |-- GET http://127.0.0.1:PORT/auth?token=JWT ---------->|
   |                                                       |- store token
   |<-- 200 "You can close this tab" --------------------- |
```

### 2.2.2 Web backend honours `redirect_uri`

`occ.mba.sh` must:

1. Read `redirect_uri` from the login URL query string.
2. After successful auth, redirect to `<redirect_uri>?token=<jwt>` instead of the hard-coded path.
3. Validate `redirect_uri` against an allowlist before using it:
   - `http://127.0.0.1:<any-port>/auth` — loopback (this ticket)
   - `occode://openclaw.home/auth` — existing production scheme
   - VS Code tunnel patterns (`https://*.vscode-cdn.net/...`) — future

### 2.2.3 Dev instance temporarily owns `occode://` scheme

While `launch-editor.sh` is running it should capture **all** `occode://` URIs — not just the loopback auth callback. Any deep link clicked in a browser, email client, or CI notification should route to the live dev instance.

**On extension activation in dev mode** (`VSCODE_DEV=1` / `!isBuilt`):

1. Read the current `x-scheme-handler/occode` entry from `~/.config/mimeapps.list` (if any) and save it to `context.globalState` under key `prevOccodeHandler`.
2. Overwrite the entry to point at `launch-editor.sh` (same logic as the existing `ensureLinuxProtocolHandler`, but unconditional — always re-register, do not skip if already set).

**On extension deactivation** (`deactivate()` export + `process.on('SIGTERM')` + `process.on('SIGINT')`):

3. Read `prevOccodeHandler` from `globalState`.
   - If a previous entry existed: restore it in both `mimeapps.list` sections.
   - If there was none: remove the `x-scheme-handler/occode` lines entirely.
4. Run `update-desktop-database` fire-and-forget.

**Stale registration guard** (handles crashes / force-kill):

The `.desktop` file written by step 2 includes a comment line with the registering PID:

```ini
X-OCC-Dev-PID=<pid>
```

On activation, before saving `prevOccodeHandler`, check: if the existing `.desktop` file has an `X-OCC-Dev-PID` comment and that PID is no longer alive (`process.kill(pid, 0)` throws), treat the existing registration as stale and skip saving it as the "previous" — i.e., don't restore a dead process's registration on our own exit.

### 2.2.4 Existing `occode://` handler kept as fallback

`registerUriHandler` in `extension.ts:739` stays unchanged. It handles:
- External deep links arriving via `--open-url` (OS dispatches via the `.desktop` file).
- Production builds where the loopback server is not running.

### 2.2.5 Token consumption path is shared

Both the loopback server and the URI handler call the same internal helper:

```ts
function applyAuthToken(token: string, context: vscode.ExtensionContext) {
  void context.secrets.store(OCC_JWT_KEY, token).then(() => {
    vscode.commands.executeCommand('occ.auth.setLegacyJwt', token);
  });
}
```

This avoids duplicating the store + sync logic.

## 2.3 Acceptance Criteria

**Loopback auth callback:**
- [ ] Clicking **Sign In** starts a loopback HTTP server and passes its URL as `redirect_uri` to the login page
- [ ] The loopback server accepts `GET /auth?token=<jwt>` and stores the token (same outcome as the existing URI handler)
- [ ] The browser tab receives an HTML response it can close itself (no lingering tab with an error)
- [ ] The server self-closes after 10 minutes if no auth arrives (no port leak)
- [ ] Works on first `launch-editor.sh` run before any protocol handler is registered
- [ ] Two `launch-editor.sh` instances open simultaneously: each routes its own auth token to the correct instance
- [ ] Backend validates `redirect_uri` — rejects anything not on the allowlist

**Dev scheme ownership:**
- [ ] On activation in dev mode, `occode://` is immediately re-registered to `launch-editor.sh` (unconditional, even if a prod handler was set)
- [ ] Any `occode://` link clicked while dev is running (browser, email, terminal) opens the dev instance
- [ ] On graceful exit (`deactivate` / SIGTERM / SIGINT), the previous handler is restored; if there was none the entry is removed
- [ ] If the dev process was killed without deactivating, the next launch (dev or prod) detects the stale PID and does not restore the dead registration
- [ ] No regression: production builds are unaffected (ownership logic is gated on `VSCODE_DEV` / `!isBuilt`)

## 2.4 Files to Change

| File | Change |
|---|---|
| `apps/editor/extensions/openclaw/src/panels/home.ts:183` | Replace one-liner `openExternal` with `startLoopbackAndSignIn(context)` call |
| `apps/editor/extensions/openclaw/src/extension.ts` | Add `startLoopbackAndSignIn()`; extend `ensureLinuxProtocolHandler` to save previous handler + PID comment; add `releaseLinuxProtocolHandler()` called from `deactivate()` and signal handlers |
| `occ.mba.sh` backend (separate repo) | Read `redirect_uri`; redirect there post-auth; validate allowlist |

## 2.5 Out of Scope

- PKCE / state parameter — adds replay protection but not required for this ticket
- Production builds — loopback works there too but `occode://` is already reliable; no forced change
- Windows / macOS — `.desktop` / `mimeapps.list` is Linux-only; Windows registry approach is separate
