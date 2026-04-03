# PRD: Docker Card Setup — Direct Docker Compose Provision

## 2.1 Problem Statement

Clicking the Docker card on the OCC Home panel should immediately navigate to the Docker initialization page and auto-start the OpenClaw gateway using `docker compose up`. The previous multi-step wizard (bootstrap choice → path input → doctor checks → provision) added unnecessary friction. Users who click Docker have already made their choice — they should see provisioning start automatically.

## 2.2 Scope

Simplify the Docker card flow to a single step: click → provision page → auto-start compose → done when healthy.

## 2.3 Flow Being Tested

The flow is now direct:

1. **Host Picker**: User sees three cards — Local, Docker (Recommended), SSH (Coming Soon)
2. **Click Docker Card**: Extension disposes current panel, opens new one via `openclaw.host.setup.docker` with `setupFor: 'docker'`
3. **Provision Page Shown**: `#panel-docker-provision` is immediately visible with streaming `#provision-log`
4. **Auto-Provision**: After 400ms, `dockerProvision` message fires automatically — no button click needed
5. **Compose Starts**: Extension runs `docker compose pull` then `docker compose up -d`
6. **Health Poll**: Gateway polled at `http://127.0.0.1:18789/health` for up to 60s
7. **Done**: "Open Dashboard →" button appears when healthy

## 2.4 Implementation

### Key selectors

| Selector | Description |
|---|---|
| `[data-card="docker"]` | Docker card in host picker |
| `#panel-docker-provision` | Provision panel root (shown immediately for docker flow) |
| `#provision-log` | Streaming provision log output |
| `#provision-status` | Status text (pulling, starting, waiting for health, done) |
| `#provision-actions` | Action buttons (appears when done) |

### Iframe chain

```ts
const inner = page
  .frameLocator('iframe.webview').first()
  .frameLocator('iframe#active-frame');
```

### How it works

When `setupFor === 'docker'`:
- `#panel-bootstrap-choice` is hidden (`display: none`)
- `#panel-docker-provision` is visible (`display: flex`)
- Step timeline shows: "Docker Selected" ✓ → "Provision Compose" (active) → "Ready" (pending)
- An IIFE fires after 400ms posting `{ command: 'dockerProvision', dataPath: ... }`
- `runDockerProvision()` in `home.ts` handles compose pull, up, health polling, and config writing

### Docker Compose services

The flow uses `docker/docker-compose.openclaw.yml` (built from `docker/Dockerfile.openclaw`):
- `occ-gateway` (built from `Dockerfile.openclaw`, tagged `openclaw/pod:latest`) — port 18789
- `occ-postgres` (image: `postgres:16-alpine`) — port 5432
- `occ-redis` (image: `redis:7-alpine`) — port 6379

## 2.5 Acceptance Criteria

- [x] Docker card visible in host picker with `data-card="docker"` attribute
- [x] Clicking Docker card navigates directly to provision panel (no intermediate steps)
- [x] `#panel-docker-provision` is visible immediately after panel loads
- [x] Docker compose auto-starts without user interaction
- [x] Streaming log shows compose output in `#provision-log`
- [x] Gateway health is polled after containers start
- [x] "Open Dashboard →" button appears when compose services are healthy
- [x] Step timeline reflects Docker flow: "Docker Selected" → "Provision Compose" → "Ready"

## 2.6 Tasks

- [x] Task 1: Hide bootstrap choice panel when `setupFor === 'docker'`
- [x] Task 2: Show provision panel immediately when `setupFor === 'docker'`
- [x] Task 3: Add auto-provision IIFE that fires on page load for docker setup
- [x] Task 4: Update step timeline labels for Docker direct flow
- [x] Task 5: Verify compose service starts and health check completes

## 2.7 Technical Details

### Panel lifecycle

After clicking the Docker card from the host picker, the extension disposes the current panel and opens a new one via the `openclaw.host.setup.docker` command. The new panel is created with `setupFor: 'docker'`, which causes `_getSetupHtml()` to render the provision panel visible and bootstrap choice hidden.

### Auto-provision IIFE

```js
(function() {
  var dataPath = '~/Desktop/occ/.openclaw';
  setTimeout(function() {
    var log = document.getElementById('provision-log');
    if (log) log.textContent = '▶ Initializing Docker environment...\n';
    var status = document.getElementById('provision-status');
    if (status) status.textContent = 'Preparing Docker compose…';
    vscode.postMessage({ command: 'dockerProvision', dataPath: dataPath });
  }, 400);
})();
```

### Provisioning engine

`runDockerProvision()` in `home.ts`:
1. Resolves `docker/docker-compose.openclaw.yml` (4 `..` segments from extension path)
2. Writes `.env` with `OPENCLAW_DATA_DIR`
3. `docker compose pull`
4. `docker compose up -d --remove-orphans`
5. Polls `http://127.0.0.1:18789/health` every 2s for 60s
6. Writes `openclaw.json` with gateway config
7. Creates desktop shortcut
8. Posts `provisionStatus` with `done: true, ok: true` → UI shows "Open Dashboard →"

## 2.8 Dependencies

- **ticket-021** — Docker bootstrap setup (compose file, provisioning engine)
- **ticket-022** — Docker compose validation
- **ticket-027** — Docker setup button compose file path fix
- Requires: Docker daemon running on host

## 2.9 Relationship to Other Tickets

- **Ticket-021** — Original Docker bootstrap; this ticket simplifies the flow
- **Ticket-027** — Fixed compose file path resolution used by this flow
- **Ticket-029** — Playwright smoke tests; infrastructure reused for testing
