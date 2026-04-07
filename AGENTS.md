# OCcode — Agent Reference

This file is the authoritative reference for AI agents working in this repository.
It supersedes all older planning documents.

---

## Agent Operating Protocol

**All operations in this repository use agentic pair programming.**

Every task is executed by two roles working in tandem:

### Driver (main agent)
The driver executes. It reads files, writes code, runs commands, and produces output. It operates within the scope defined by the current task and does not take unilateral decisions on ambiguous requirements.

- Performs one logical step at a time, then yields to the navigator before proceeding.
- Does not take destructive or irreversible actions (force push, volume removal, data deletion, CI changes) without navigator sign-off.
- Flags blockers, conflicts, or unexpected state immediately rather than working around them silently.

### Navigator (sub agent)
The navigator reviews. It runs ahead of the driver — auditing the plan, checking assumptions, spotting edge cases, and verifying output after each step. It does not write code directly but directs the driver's next move.

- Reads the PRD and surfaces ambiguities or risks before the driver starts.
- After each driver step, verifies correctness and either approves the next step or redirects.
- Produces the final audit/summary before any task is marked done.

### Handoff protocol
1. Navigator reads the ticket/PRD and briefs the driver on scope, risks, and acceptance criteria.
2. Driver executes step-by-step; navigator reviews each output.
3. On completion, navigator audits the full diff and confirms all acceptance criteria are met.

When in doubt: navigator asks, driver waits.

---

## Project Overview

**OCcode** is a branded IDE built on the [Void editor](https://github.com/voideditor/void) fork
(which is itself a fork of VS Code). It ships with the **OpenClaw** VS Code extension pre-bundled.

The old `apps/wrapper` (Electron bootstrapper that downloaded VSCodium) has been retired.
The Void editor fork is now the main platform.

---

## Ticket Management

All agent work is organized via tickets in `.tickets/`. See [.tickets/AGENTS.md](./.tickets/AGENTS.md) for:
- Ticket structure and naming conventions
- Task workflow and subtask specification
- Commit process and verification

Key scripts:
```bash
# Find next ticket with pending work
bash .tickets/scripts/find_next_ticket.sh

# Verify ticket statuses
bash .tickets/scripts/verify_tickets.sh
```

---

## Monorepo Structure

```
occ/
├── apps/
│   ├── editor/           # Void editor fork — main IDE platform
│   └── web/              # Next.js marketing site
├── packages/
│   └── control-center/   # Shared React UI components
├── watch-editor.sh       # Dev: compile editor (macOS/Linux)
├── watch-editor.bat      # Dev: compile editor (Windows)
├── launch-editor.sh      # Dev: launch editor (macOS/Linux)
├── launch-editor.bat     # Dev: launch editor (Windows)
└── watch-react.sh        # Dev: watch Void React UI components (macOS/Linux)
```

**Root `package.json` workspaces:** `apps/web`, `packages/control-center`

`apps/editor` is **intentionally excluded from workspaces** — see the npm section below.

---

## Docker Compose Development Workflow (PRIMARY)

**Priority:** When Docker or an OCI-compatible container runtime is available on the host, **use the Docker Compose development workflow as the primary method** for implementation, testing, and verification. This is the default approach unless explicitly constrained.

### Why Docker Compose First

- **No local rebuilds required** — the watch process runs inside the container, picking up source changes automatically
- **Consistent environment** — Node 20.18.2, all dependencies, and build tools are pre-configured
- **Instant verification** — UI and functionality changes are visible through the running editor at `http://localhost:9888`
- **Playwright testing** — browser automation tests (including MCP) run against the live editor without manual setup

### Development Container

The editor runs in the `occ-editor-dev` container (defined in `docker-compose.yml`):

```yaml
services:
  editor:
    build:
      context: .
      dockerfile: Dockerfile
    ports:
      - "9888:9888"
    volumes:
      - .:/workspace
      - /var/run/docker.sock:/var/run/docker.sock
```

The workspace is mounted as a volume, so **source changes on the host are immediately visible inside the container**.

### Typical Workflow

```bash
# 1. Start the dev environment (first time builds the image)
docker compose up -d

# 2. Verify the editor is running
curl -s http://localhost:9888/ | head -5

# 3. Edit source files on the host — changes are picked up by the watch process
#    (no rebuild needed for TypeScript/extension changes)

# 4. For extension TypeScript changes, recompile inside the container:
docker exec occ-editor-dev bash -c "cd /workspace/apps/editor/extensions/openclaw && npx tsc -p ./"

# 5. For Void React changes, rebuild React bundles:
docker exec occ-editor-dev bash -c "cd /workspace && npm run editor:build-react"

# 6. For full editor rebuild (rarely needed — watch handles most cases):
docker exec occ-editor-dev bash -c "cd /workspace/apps/editor && node --max-old-space-size=8192 ./node_modules/gulp/bin/gulp.js compile"

# 7. Verify changes via Playwright or browser automation (MCP):
npx playwright test tests/e2e/ --reporter=list
# or use MCP tools to interact with http://localhost:9888
```

### When Rebuild Is NOT Required

| Change Type | Rebuild Needed? | How to Verify |
|-------------|----------------|---------------|
| Extension TypeScript (`extensions/openclaw/src/**/*.ts`) | Yes — `npx tsc -p ./` inside container | Playwright tests, manual browser check |
| Extension JavaScript (compiled `.js` in `out/`) | No — watch process handles it | Playwright tests, manual browser check |
| Void React source (`react/src/**/*.tsx`) | Yes — `npm run editor:build-react` | Playwright tests, manual browser check |
| Editor core TypeScript (`src/**/*.ts`) | No — watch process handles it | `Developer: Reload Window` in editor |
| CSS/HTML in webviews | No — served directly | Playwright tests, manual browser check |
| `docker-compose.*.yml` | No — changes apply on next `docker compose up` | `docker compose ps` |

### Testing

#### Running the Editor

```bash
# Start the dev environment (first time builds the image)
docker compose up -d

# Verify the editor is running
curl -s http://localhost:9888/ | head -5
```

#### MCP-Based Browser Testing (noVNC)

**Required for headed UI testing.** Use this when tests need a real browser with a visible display — e.g. webview interactions, visual verification, or MCP-driven ad-hoc automation. The container provides a virtual X11 display so Chromium runs headed without a local display server.

- Virtual X11 display (Xvfb) — headed browser, no local display required
- noVNC web interface to watch the browser in real-time at http://localhost:6080/vnc.html
- MCP server on port 3080 for browser automation

**Start the noVNC container:**

```bash
# Start with host network (required for localhost:9888 access)
docker run -d --name playwright-novnc \
  --network host \
  -e SCREEN_WIDTH=1920 \
  -e SCREEN_HEIGHT=1080 \
  -e MCP_BROWSER=chromium \
  ghcr.io/xtr-dev/mcp-playwright-novnc

# Wait for services to be ready
sleep 5
```

**First-time setup — install Playwright inside the container if needed:**

```bash
docker exec playwright-novnc playwright --version 2>/dev/null \
  || docker exec playwright-novnc npm install -g playwright

# Install browser binaries if needed
docker exec playwright-novnc playwright install chromium
```

**Access the noVNC interface:**
- Open http://localhost:6080/vnc.html to watch the browser in real-time

**Using MCP for testing:**

Two MCP servers are configured in `.mcp.json` (Claude Code) and `.opencode.json` (OpenCode):

**1. `playwright-novnc`** — full browser automation via the noVNC container:
```json
{
  "command": "docker",
  "args": ["run","--rm","-i","--network=host",
           "ghcr.io/xtr-dev/mcp-playwright-novnc","mcp-proxy","http://localhost:3080/sse"]
}
```

**2. `chrome-devtools`** — direct Chrome DevTools Protocol access via a remote Chrome instance:
```json
{
  "command": "npx",
  "args": ["chrome-devtools-mcp@latest","--browserUrl","http://localhost:9222"]
}
```
Connects to a Chrome already running with `--remote-debugging-port=9222`. Chrome is always remote — start it via the noVNC container (see VNC mode above) or any other headless/headed Chrome with CDP exposed on port 9222.

> **ℹ️ Port 9222:** `playwright-novnc` does not use port 9222 — it only exposes 3080, 5900, 6080.
> Port 9222 is free for Chrome CDP regardless of whether the container is running.
> If the port appears busy, check for stale processes: `lsof -i :9222`.

**Available MCP tools:**
- `browser_navigate` - Navigate to URL
- `browser_snapshot` - Get page structure with element UIDs  
- `browser_click` - Click elements
- `browser_fill_form` - Fill form fields
- `browser_take_screenshot` - Visual capture
- `browser_list_pages` - List open tabs

**Example test workflow:**

```
Using the playwright MCP:
1. Navigate to http://localhost:9888/
2. Open the Home panel (F1 → "OpenClaw: Home")
3. Click the Docker setup card
4. Verify the 3-step config modal appears
5. Fill in: data directory = /tmp/openclaw-data, port = 18789
6. Click Next, then Confirm
7. Verify provisioning starts
```

**Clean up when done:**

```bash
docker stop playwright-novnc
docker rm playwright-novnc
```

---

#### Playwright E2E Testing (Local)

If your local environment has system dependencies (X11, libglib), you can run Playwright tests directly:

```bash
# Install dependencies (one-time)
npx playwright install-deps chromium

# Run tests against the running editor
npx playwright test tests/e2e/ --reporter=list

# Run specific test file
npx playwright test tests/e2e/docker-setup.spec.ts --reporter=list
```

**Prerequisites:**
- Editor container running: `docker compose up -d`
- Editor accessible at `http://localhost:9888`

**Webview Panel Access:**

The editor's webview panels are accessible via iframe chains:

```ts
const inner = page
  .frameLocator('iframe.webview').first()
  .frameLocator('iframe#active-frame');
```

---

#### Playwright Test Modes (Standard / VNC / CDP)

All test files use one import that never changes:

```ts
import { test, expect, type Page, type FrameLocator, withCDP } from './fixtures';
```

`fixtures.ts` is the strategy selector — mode is controlled entirely by env vars.

| Mode | Env vars | When to use |
|------|----------|-------------|
| **Standard** | _(none)_ | CI, fast headless local runs |
| **VNC** | `USE_VNC=1` | Watch tests live in noVNC at `localhost:6080` |
| **CDP** | `CDP_ENDPOINT=<url>` | Custom Chrome endpoint |

**Standard mode — local headless Chromium:**

```bash
npx playwright test --config=playwright.config.ts
```

**VNC mode — headed browser inside the noVNC container:**

```bash
# 1. Start the noVNC container with host networking (exposes Chrome on port 9222)
docker run -d --name playwright-novnc --network host \
  -e MCP_BROWSER=chromium \
  ghcr.io/xtr-dev/mcp-playwright-novnc:latest

# 2. Open http://localhost:6080/vnc.html to watch the browser

# 3. Run tests — --ui is the default for VNC runs so you control pacing
USE_VNC=1 npx playwright test --ui \
  --config=playwright.remote-debugging.config.ts \
  tests/e2e/docker-setup.spec.ts

# Full suite via VNC
USE_VNC=1 npx playwright test --ui \
  --config=playwright.remote-debugging.config.ts
```

**CDP mode — arbitrary remote Chrome endpoint:**

> **ℹ️ Port 9222:** `playwright-novnc` does NOT use port 9222 — confirmed via the image's
> Dockerfile and supervisord config (only ports 3080, 5900, 6080 are used). Port 9222 is
> free for Chrome CDP whether or not the container is running. If it appears busy, check
> for stale processes: `lsof -i :9222`.
>
> To get a real Chrome CDP endpoint alongside the noVNC container, launch Chrome directly inside it:
> ```bash
> docker exec playwright-novnc bash -c "
>   DISPLAY=:99 /ms-playwright/chromium-1200/chrome-linux64/chrome \
>     --remote-debugging-port=9222 --remote-debugging-address=0.0.0.0 \
>     --no-sandbox --user-data-dir=/tmp/cdp-chrome http://localhost:9888/ &"
> ```

```bash
# Headless (CI)
CDP_ENDPOINT=http://localhost:9222 \
  npx playwright test --config=playwright.remote-debugging.config.ts \
  tests/e2e/docker-setup.spec.ts

# Interactive (with UI)
CDP_ENDPOINT=http://localhost:9222 \
  npx playwright test --ui --config=playwright.remote-debugging.config.ts
```

`cdp-fixtures.ts` is a thin backward-compat alias — always import from `./fixtures` in new code.

---

### Chrome DevTools Protocol (CDP) with Playwright

Playwright can connect to an **externally-launched Chrome instance** via the Chrome DevTools Protocol (CDP). This is useful for debugging with a manually-opened browser, reusing logged-in sessions, or keeping DevTools open while automating.

#### Chrome 136+ Breaking Change

**Important:** Starting with Chrome 136 (March 2025), Google disabled remote debugging for the default user data directory. You **must** use `--user-data-dir` with a custom profile directory for CDP to work.

Without `--user-data-dir`, Chrome will silently ignore `--remote-debugging-port` and won't enter debug mode.

#### How It Works

```
Chrome (manual) --remote-debugging-port=9222 --user-data-dir=remote-debug-profile → 
  http://localhost:9222/json → 
  playwright.chromium.connectOverCDP('http://localhost:9222')
```

#### Step 1: Launch Chrome with Remote Debugging

```bash
# macOS (zsh)
open -a "Google Chrome" --args --remote-debugging-port=9222 --user-data-dir=remote-debug-profile

# Linux
google-chrome --remote-debugging-port=9222 --user-data-dir=remote-debug-profile

# Windows
chrome.exe --remote-debugging-port=9222 --user-data-dir=C:\path\to\remote-debug-profile
```

The `--user-data-dir` creates a fresh profile isolated from your normal Chrome data. This is required for CDP to function in Chrome 136+.

#### Step 2: Verify the Debugging Endpoint

Open http://localhost:9222/json to confirm Chrome is listening (note: `/json/version` is deprecated in Chrome 136+):

```json
[
  {
    "id": "...",
    "type": "page",
    "url": "...",
    "webSocketDebuggerUrl": "ws://localhost:9222/devtools/browser/..."
  }
]
```

#### Step 3: Connect Playwright to External Chrome

```typescript
// tests/e2e/example.spec.ts
import { test, expect } from '@playwright/test';

test('connect to external Chrome via CDP', async () => {
  // Connect to external Chrome instance
  const browser = await chromium.connectOverCDP('http://localhost:9222');
  
  // Option A: Work with existing contexts/pages
  const existingContexts = browser.contexts();
  if (existingContexts.length > 0) {
    const pages = existingContexts[0].pages();
    if (pages.length > 0) {
      await pages[0].bringToFront();
      console.log('Connected to existing tab:', pages[0].url());
    }
  }
  
  // Option B: Create a new context (recommended for automation)
  const context = await browser.newContext();
  const page = await context.newPage();
  
  await page.goto('http://localhost:9888');
  // ... your test actions ...
  
  await context.close();
  // Note: do NOT call browser.close() — that would close your external Chrome!
});
```

#### Step 4: Check for Existing Instance Before Creating New One

To avoid launching a duplicate Chrome when one is already running with debugging enabled:

```typescript
// utils/browser.ts
import { chromium, Browser } from '@playwright/test';

const CDP_ENDPOINT = 'http://localhost:9222';

export async function getOrLaunchChrome(): Promise<Browser> {
  try {
    // Try to connect to existing instance
    const browser = await chromium.connectOverCDP(CDP_ENDPOINT);
    console.log('Connected to existing Chrome instance');
    return browser;
  } catch {
    // Launch new instance if none exists
    console.log('No existing instance found, launching Chrome');
    return await chromium.launch({
      args: [
        '--remote-debugging-port=9222',
        '--user-data-dir=remote-debug-profile',  // Required for Chrome 136+
      ],
    });
  }
}
```

**Usage in tests:**

```typescript
import { test, expect } from '@playwright/test';
import { getOrLaunchChrome } from '../utils/browser';

test('reuse or launch Chrome', async () => {
  const browser = await getOrLaunchChrome();
  const context = await browser.newContext();
  const page = await context.newPage();
  
  await page.goto('http://localhost:9888');
  // ... test actions ...
  
  await context.close();
  // Do NOT close browser — keep it running for future tests
});
```

#### Alternative: Connect via WebSocket

If you prefer using the WebSocket endpoint directly (get it from http://localhost:9222/json):

```typescript
const browser = await chromium.connect({
  wsEndpoint: 'ws://localhost:9222/devtools/browser/...', // from /json
});
```

#### Key Methods

| Method | Purpose |
|--------|---------|
| `chromium.connectOverCDP(endpoint)` | Connect to external Chrome via CDP |
| `chromium.connect({ wsEndpoint })` | Connect via WebSocket |
| `browser.contexts()` | List existing browser contexts |
| `browser.newContext()` | Create new isolated context |

#### Best Practices

- **Close contexts, not the browser** — When done, close only the automation context. Calling `browser.close()` would shut down your external Chrome.
- **Separate contexts for automation** — Create a new context even when reusing an existing browser to avoid interfering with manual tabs.
- **Use for development only** — Connecting to external Chrome is great for debugging; use clean launches for CI/full test suites.
- **Keep DevTools open** — While connected, you can keep DevTools open to inspect DOM, network, and performance in real time.

**Config file:** Tests use the configuration defined in `playwright.remote-debugging.config.ts` (at repo root).

---

### Container Management

```bash
# View container logs
docker logs occ-editor-dev --tail 50

# Execute commands inside the container
docker exec occ-editor-dev bash

# Restart the container (picks up docker-compose.yml changes)
docker compose up -d --force-recreate editor

# Stop without removing
docker compose stop

# Full cleanup (removes containers and networks)
docker compose down
```

### OpenClaw Docker Gateway

The OpenClaw gateway services (postgres, redis, gateway) are managed via `docker/docker-compose.openclaw.yml`:

```bash
# Start gateway services
OPENCLAW_DATA_DIR=~/.openclaw docker compose -f docker/docker-compose.openclaw.yml up -d

# Check service health
docker compose -f docker/docker-compose.openclaw.yml ps

# View gateway logs
docker compose -f docker/docker-compose.openclaw.yml logs -f occ-gateway

# Stop and clean up
docker compose -f docker/docker-compose.openclaw.yml down
```

The gateway is accessible at `http://127.0.0.1:18789`. Postgres and Redis run on the internal Docker network only (no host port exposure).

---

## apps/editor

A fork of the Void editor (vscode `code-oss-dev` v1.99.3). Already branded as OCcode:
- `product.json` → `applicationName: occode`, `dataFolderName: .occode-editor`

### Node version — critical

**Exact version required: `20.18.2`**

Enforced by `apps/editor/build/npm/preinstall.js`. Will hard-fail `npm install` on any other version.
The required version is pinned in `apps/editor/.nvmrc`.

```bash
nvm install 20.18.2   # first time only
cd apps/editor
nvm use               # reads .nvmrc automatically
npm install
```

### Why apps/editor is excluded from root workspaces

When `apps/editor` is in the root `workspaces` array, npm hoists its dependencies (including `gulp`)
to the root `node_modules/`. The editor's internal scripts reference `./node_modules/gulp/bin/gulp.js`
as a local path — hoisting breaks this, causing `Error: Cannot find module`.

Root `package.json` scripts use `npm --prefix apps/editor run <script>` instead of
`npm run --workspace=apps/editor <script>` to delegate without triggering hoisting.

### Installing editor dependencies

Always install inside the editor directory directly:

```bash
cd apps/editor && nvm use && npm install
```

Running `npm install` from the repo root will **not** install editor dependencies.

---

## Dev Cycle (without Docker)

If Docker is not available, use the traditional local development workflow:

### Step 1 — Build React components (once, or when React source changes)

The Void AI UI (sidebar, settings, Ctrl+K modal etc.) is a separate React build pipeline.
The compiled bundles must exist at `apps/editor/src/vs/workbench/contrib/void/browser/react/out/`
before the main TypeScript compilation runs. If they are missing, the main build emits ~9
"Cannot find module" errors for the React bundle paths.

```bash
# From repo root:
npm run editor:build-react

# Or directly:
cd apps/editor && npm run buildreact
```

Only re-run when editing files inside:
`apps/editor/src/vs/workbench/contrib/void/browser/react/src/`

The `watch-editor.sh` script automatically runs `buildreact` if `react/out/` is missing,
and compiles `extensions/openclaw/` if `extensions/openclaw/out/extension.js` is missing.

### Step 2 — Watch the editor (keep running in Terminal 1)

```bash
./watch-editor.sh       # macOS/Linux
watch-editor.bat        # Windows
```

Runs `gulp watch-client` with the correct Node version. Initial compile takes ~2 minutes,
incremental recompiles take a few seconds.

**Ready signal:**
```
Finished compilation with N errors after Xms
Starting compilation...         ← watch mode is now active
```

### Step 3 — Launch the editor (Terminal 2)

```bash
./launch-editor.sh      # macOS/Linux
launch-editor.bat       # Windows
```

Runs `apps/editor/scripts/code.sh` (or `code.bat`) against the compiled `out/` directory.
Any flags are passed through: `./launch-editor.sh --verbose`

### Step 4 — Reload after changes

After saving a source file, `watch-client` recompiles in seconds.
Pick up changes in the running editor: `Cmd+Shift+P` → `Developer: Reload Window`

### Optional — Watch React components (Terminal 3)

Only needed when editing Void AI React source files:

```bash
./watch-react.sh        # macOS/Linux
```

---

## Build System

Two completely independent pipelines:

### 1. Main TypeScript build (gulp)

| | |
|---|---|
| Command | `npm run watch-client` or `npm run compile` |
| Tool | gulp + custom tsc pipeline |
| Input | `src/**/*.ts` |
| Output | `out/` (~139 MB of compiled JS) |
| Config | `src/tsconfig.json` |

`noEmitOnError` is **not set** — JS is emitted even when TypeScript errors are present.

### 2. Void React build (tsup)

| | |
|---|---|
| Commands | `npm run buildreact` (one-off), `npm run watchreact` (watch) |
| Tools | `scope-tailwind` → `tsup` |
| Input | `react/src/` |
| Intermediate | `react/src2/` (auto-generated — never edit directly) |
| Output | `react/out/` (7 JS bundles) |

The React build must run before the main TypeScript build. The main TS code imports the
React bundles as external `.js` files — if they don't exist, TypeScript reports module
not found errors (but still emits JS for all other files).

---

## Void React Components

**Location:** `apps/editor/src/vs/workbench/contrib/void/browser/react/`

Seven bundles compiled by tsup, each with an `index.tsx` that exports a `mountXxx()` function:

| Bundle | Mount function(s) | Purpose |
|--------|-------------------|---------|
| `sidebar-tsx` | `mountSidebar` | AI chat panel — threads, messages, markdown |
| `void-settings-tsx` | `mountVoidSettings` | AI provider and model configuration UI |
| `void-editor-widgets-tsx` | `mountVoidCommandBar`, `mountVoidSelectionHelper` | Accept/reject diff bar inside the editor |
| `quick-edit-tsx` | `mountCtrlK` | Ctrl+K quick-edit modal |
| `void-onboarding` | `mountVoidOnboarding` | First-launch onboarding screen |
| `void-tooltip` | `mountVoidTooltip` | Tooltip system |
| `diff` | _(re-export)_ | `diffLines` / `Change` from the `diff` npm package |

### Key files

| File | Purpose |
|------|---------|
| `src/util/services.tsx` | State hub. Bridges VS Code services into React hooks (`useChatThreadsState`, `useSettingsState`, `useIsDark`, etc.) using manual listener sets — no Redux or Context API. |
| `src/util/mountFnGenerator.tsx` | Creates standardised `{ rerender, dispose }` mount functions used by all bundles. |
| `src/util/inputs.tsx` | Shared input components — `InputBox`, `SelectBox`, `Checkbox`, custom dropdowns. |
| `src/markdown/ChatMarkdownRender.tsx` | Markdown renderer for chat messages, including code blocks with apply/reject buttons. |
| `build.js` | Build orchestrator — runs scope-tailwind then tsup. |
| `tsup.config.js` | Bundles all npm deps; keeps `../../../*.js` imports external (VS Code services). |
| `tailwind.config.js` | Tailwind with `void-` prefix, colours mapped to `--vscode-*` CSS variables. |

### src/ vs src2/

- `src/` — Source files. **Edit these.**
- `src2/` — Auto-generated by `scope-tailwind`, which scopes all Tailwind classes under
  a `void-scope` namespace to prevent collisions with VS Code's own styles.
  **Never edit `src2/` directly** — it is overwritten on every build.

### How React mounts into VS Code

The main TypeScript code imports a compiled bundle and calls its mount function:

```typescript
import { mountSidebar } from './react/out/sidebar-tsx/index.js'
const { rerender, dispose } = mountSidebar(domElement, accessor)
```

`mountFnGenerator` handles ReactDOM root creation, registers VS Code service event listeners,
and returns lifecycle methods for the workbench contribution system.

---

## Known TypeScript Errors (pre-existing, non-blocking)

Every compilation produces 44 TypeScript errors. They fall into two categories:

**Category 1 — React bundles not built (~9 errors, fixable):**
```
Cannot find module '../react/out/diff/index.js'
Cannot find module './react/out/sidebar-tsx/index.js'
```
Fix: run `npm run editor:build-react` once.

**Category 2 — API version skew in Void fork (~35 errors, expected):**
```
vscode.d.ts(6,1): Definitions of the following identifiers conflict with those in another file
extHostMcp.ts: Property 'env' does not exist on type 'McpServerDefinition'
extHostTypes.ts: Class 'LanguageModelDataPart' incorrectly implements...
```
The Void fork's implementation is behind the `vscode.d.ts` type definitions it ships with.
These are inherited from upstream and do not affect runtime behaviour. `noEmitOnError` is unset
so all JS is emitted normally. **Do not attempt to fix these** without a clear reason — they
span the VS Code extension host API and changes risk breaking runtime behaviour.

---

## Root npm Scripts

| Script | What it does |
|--------|-------------|
| `npm run editor:build-react` | One-off build of Void React bundles |
| `npm run editor:watch-react` | Watch mode for Void React bundles |
| `npm run editor:compile` | One-off full compile of the editor |
| `npm run editor:build` | Full compile-build (for distribution) |
| `npm run dev` | `gulp watch-client` on the editor |
| `npm run dev:react` | `watchreact` on the editor |
| `npm run web` | Next.js dev server for `apps/web` at `http://localhost:3000` |

---

## apps/web — Marketing Site

Next.js 16 with Turbopack. Fully independent — no shared build steps with the editor.

```bash
npm run web    # dev server at http://localhost:3000
```

---

## Platform Notes

### macOS / Linux
- The helper scripts source `~/.nvm/nvm.sh` and call `nvm use` automatically.
- Editor launches via `apps/editor/scripts/code.sh`.

### Windows
- Requires [nvm-windows](https://github.com/coreybutler/nvm-windows).
- `.bat` scripts hardcode `nvm use 20.18.2` — nvm-windows does not read `.nvmrc`.
- Editor launches via `apps/editor/scripts/code.bat`.

---

*End of Agent Reference*