/**
 * Unified Playwright fixtures — single import for all test files.
 *
 * Four execution modes, selected by environment variable (or auto-detected).
 * No test file changes are ever needed to switch modes.
 *
 *   Auto (default — no env vars):
 *     npx playwright test --config=playwright.config.ts
 *     Probes localhost:9222 for a running Chrome (playwright-novnc container).
 *     If found, connects via its WebSocket URL. Falls back to local headless Chromium.
 *
 *   VNC mode  (USE_VNC=1):
 *     USE_VNC=1 npx playwright test --ui --config=playwright.remote-debugging.config.ts
 *     Connects to the Chrome running inside the playwright-novnc container.
 *     Requires the container started with --network=host so port 9222 is on localhost:
 *       docker run -d --name playwright-novnc --network host \
 *         -e MCP_BROWSER=chromium ghcr.io/xtr-dev/mcp-playwright-novnc:latest
 *     Watch the browser live at http://127.0.0.1:6080/vnc.html
 *
 *   CDP mode  (CDP_ENDPOINT=<url>):
 *     CDP_ENDPOINT=http://127.0.0.1:9222 npx playwright test --config=playwright.config.ts
 *     Connects to an arbitrary Chrome DevTools HTTP endpoint. USE_VNC is ignored
 *     when CDP_ENDPOINT is set explicitly.
 *
 *   WS mode  (WS_ENDPOINT=<ws-url>):
 *     WS_ENDPOINT=ws://127.0.0.1:9222/devtools/browser/<uuid> npx playwright test --config=playwright.config.ts
 *     Connects directly via WebSocket, bypassing the /json/version HTTP step.
 *     Useful when Chrome is behind a proxy or Host-header restrictions apply.
 *     Takes precedence over CDP_ENDPOINT and USE_VNC.
 *
 * All test files use one canonical import:
 *   import { test, expect, withCDP, type Page, type FrameLocator } from './fixtures';
 */

import * as http from 'http';
import {
  test as baseTest,
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
} from '@playwright/test';

export { expect, type Page, type FrameLocator } from '@playwright/test';
export { baseTest };

// ---------------------------------------------------------------------------
// Mode detection — evaluated once per worker at module load time.
// ---------------------------------------------------------------------------

// Priority: WS_ENDPOINT > CDP_ENDPOINT > USE_VNC > auto-detect localhost:9222 > local Chromium.
const VNC_DEFAULT_ENDPOINT = 'http://127.0.0.1:9222';
const REMOTE_ENDPOINT: string | null =
  process.env.WS_ENDPOINT ??
  process.env.CDP_ENDPOINT ??
  (process.env.USE_VNC ? VNC_DEFAULT_ENDPOINT : null);

const BASE_URL = process.env.BASE_URL ?? 'http://127.0.0.1:9888';

// VS Code web requires a ?workspace= param to open a folder; without it the
// extension never activates and the "OCC Home" tab does not appear.
// VSCODE_WORKSPACE_URL lets callers override the full URL; the default covers
// the standard OCC Docker installation path.
const VSCODE_WORKSPACE_URL =
  process.env.VSCODE_WORKSPACE_URL ??
  // Match the URL format VS Code web uses: path value has literal slashes,
  // only spaces are percent-encoded. The trailing slash before ? is required.
  `${BASE_URL}/?workspace=/root/.occ/My%20OpenClaw%20Workspace.code-workspace`;

// ---------------------------------------------------------------------------
// Auto-detect Chrome on localhost:9222 (equivalent of the curl/awk WS script).
// Used as the default when no CDP_ENDPOINT / WS_ENDPOINT / USE_VNC is set.
// ---------------------------------------------------------------------------

function detectLocalChrome(): Promise<string | null> {
  return new Promise((resolve) => {
    const req = http.get(
      { hostname: '::1', port: 9222, path: '/json/version', headers: { Host: 'localhost' } },
      (res) => {
        let data = '';
        res.on('data', (chunk: Buffer) => { data += chunk; });
        res.on('end', () => {
          try {
            const json = JSON.parse(data) as { webSocketDebuggerUrl?: string };
            let ws = json.webSocketDebuggerUrl ?? '';
            // Chrome sometimes omits the port in the reported WS URL
            ws = ws.replace('://127.0.0.1/', '://127.0.0.1:9222/');
            resolve(ws || null);
          } catch {
            resolve(null);
          }
        });
      },
    );
    req.setTimeout(2000, () => { req.destroy(); resolve(null); });
    req.on('error', () => resolve(null));
  });
}

// ---------------------------------------------------------------------------
// Fixture types
// ---------------------------------------------------------------------------

type WorkerFixtures = {
  browser: Browser;
};

type TestFixtures = {
  context: BrowserContext;
  page: Page;
};

// ---------------------------------------------------------------------------
// Unified test fixture
// ---------------------------------------------------------------------------

export const test = baseTest.extend<TestFixtures, WorkerFixtures>({
  /**
   * Worker-scoped browser.
   *
   * VNC/CDP mode: connects to an external Chrome via DevTools Protocol;
   *               falls back to local headless Chromium if unreachable.
   * Standard:     always launches a local headless Chromium.
   *
   * Worker scope is used in all modes so a single external connection is
   * shared across tests in the worker. Context/page fixtures provide
   * per-test isolation regardless of browser scope.
   */
  browser: [
    async ({}, use) => {
      let browser: Browser;
      let ownsBrowser = false;

      let endpoint = REMOTE_ENDPOINT ?? await detectLocalChrome();

      // 5-second CDP retry loop: handle transient startup delays
      // (e.g., Playwright container slow to bind port 9225)
      if (!endpoint) {
        for (let attempt = 0; attempt < 5; attempt++) {
          await new Promise(resolve => setTimeout(resolve, 1000));
          endpoint = await detectLocalChrome();
          if (endpoint) break;
        }
      }

      if (endpoint) {
        try {
          browser = await chromium.connectOverCDP(endpoint, { timeout: 30_000 });
        } catch {
          browser = await chromium.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
          });
          ownsBrowser = true;
        }
      } else {
        browser = await chromium.launch({
          headless: true,
          args: ['--no-sandbox', '--disable-setuid-sandbox'],
        });
        ownsBrowser = true;
      }

      await use(browser);

      // Only close the browser if we launched it — never close an externally
      // managed browser (VNC container or user-launched Chrome).
      if (ownsBrowser) {
        await browser.close();
      }
    },
    { scope: 'worker' },
  ],

  /**
   * Test-scoped context.
   * In CDP mode (external browser): reuse the default context so VS Code's
   * localStorage/session state is preserved — a fresh incognito context would
   * blank-page because VS Code web needs existing session cookies.
   * In standard mode (local Chromium): create a fresh context per test.
   */
  context: async ({ browser }, use) => {
    const existing = browser.contexts();
    const context = existing.length > 0
      ? existing[0]
      : await browser.newContext({ baseURL: BASE_URL });
    // Ensure baseURL is set even on reused contexts (CDP mode)
    // In CDP mode, reused contexts don't have baseURL, so apply it explicitly
    (context as any)._baseURL = BASE_URL;
    if (!context.pages().length) {
      await context.newPage();
    }
    await use(context);
    // Never close an externally-managed context
    if (existing.length === 0) {
      await context.close();
    }
  },

  /**
   * Test-scoped page — fresh per test, derived from the isolated context.
   * No automatic navigation; tests navigate themselves.
   *
   * VS Code web needs a ?workspace= param or the OCC extension never activates.
   * Intercept bare-root navigations (page.goto('/')) and redirect to the
   * workspace-aware URL so the extension activates in both CDP and headless modes.
   *
   * After each test, explicitly close any CDP sessions and clear the page to prevent
   * resource leaks and browser connection issues in long-running test suites.
   */
   page: async ({ context }, use) => {
     const page = await context.newPage();

     // Track CDP sessions we create in this test so we can clean them up
     const sessionsCreated = new Set<string>();
     const originalNewCDPSession = page.context().newCDPSession.bind(page.context());
     (page.context() as any).newCDPSession = async function(target: any) {
       const session = await originalNewCDPSession(target);
       sessionsCreated.add(session.toString());
       return session;
     };

     // In CDP mode, prefer the workspace URL from the live VS Code session.
     // In headless mode (no existing pages), fall back to VSCODE_WORKSPACE_URL.
     const vsCodePage = context.pages()
       .filter(p => p !== page)
       .find(p => p.url().startsWith(BASE_URL));
     const targetUrl = vsCodePage?.url() ?? VSCODE_WORKSPACE_URL;

     // Ensure every test starts at the workspace‑aware URL so the OCC extension activates.
     // Increased timeout to 90s for CDP and slower systems with workspace loading
     await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 90_000 });

     // Verify navigation succeeded (check URL contains workspace param)
     const currentUrl = page.url();
     if (!currentUrl.includes('workspace=') && !currentUrl.includes('occode-editor')) {
       throw new Error(`Page navigation failed. Expected workspace URL but got: ${currentUrl}`);
     }

     await use(page);

     // Close only the CDP sessions we created in this test
     const pageContext = page.context();
     if (typeof pageContext.cdpSessions === 'function') {
       try {
         for (const cdpSession of pageContext.cdpSessions()) {
           if (sessionsCreated.has(cdpSession.toString())) {
             try {
               await cdpSession.detach().catch(() => {});
             } catch {
               // Silently ignore errors if session is already detached
             }
           }
         }
       } catch {
         // Silently ignore if cdpSessions is not available
       }
     }

     // Close the page to release resources and prevent state leakage to next test
     await page.close().catch(() => {});
   },
});

// Preserve static methods from baseTest that get lost on .extend()
test.beforeEach = baseTest.beforeEach;
test.afterEach = baseTest.afterEach;
test.describe = baseTest.describe;
test.it = baseTest.it;

// Polyfill for test.todo() - not available in Playwright 1.59+ extended fixtures
// Creates a skipped test that can be enabled when feature is implemented
(test as any).todo = function(title: string) {
  return test.skip(`[PENDING] ${title}`, () => {});
};

// ---------------------------------------------------------------------------
// withCDP helper
// ---------------------------------------------------------------------------

/**
 * Attach a CDP session to a Chromium page and collect console log entries.
 *
 * Works in both standard and CDP modes — newCDPSession() is available for
 * any Chromium page regardless of how the browser was launched.
 *
 * Returns a getter that returns all captured log strings accumulated since
 * withCDP() was called. The CDP session is automatically cleaned up when the
 * page is closed at the end of the test.
 *
 * Example:
 *   const getLogs = await withCDP(page);
 *   await page.goto('/');
 *   console.log(getLogs());
 */
export async function withCDP(page: Page): Promise<() => string[]> {
  const cdp = await page.context().newCDPSession(page);
  const logs: string[] = [];

  await cdp.send('Log.enable');
  cdp.on('Log.entryAdded', (entry: { entry: { text: string; level: string } }) => {
    logs.push(`[${entry.entry.level}] ${entry.entry.text}`);
  });

  await cdp.send('Runtime.enable');
  cdp.on(
    'Runtime.consoleAPICalled',
    (params: { type: string; args: Array<{ value?: unknown; description?: string }> }) => {
      const text = params.args.map((a) => a.value ?? a.description ?? '').join(' ');
      logs.push(`[console.${params.type}] ${text}`);
    },
  );

  // Session cleanup is handled by the page fixture teardown when page is closed
  return () => [...logs];
}
