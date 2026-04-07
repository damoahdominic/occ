/**
 * Unified Playwright fixtures — single import for all test files.
 *
 * Three execution modes, selected by environment variable alone.
 * No test file changes are ever needed to switch modes.
 *
 *   Standard (default — no env vars):
 *     npx playwright test --config=playwright.config.ts
 *     Launches local headless Chromium.
 *
 *   VNC mode  (USE_VNC=1):
 *     USE_VNC=1 npx playwright test --ui --config=playwright.remote-debugging.config.ts
 *     Connects to the Chrome running inside the playwright-novnc container.
 *     Requires the container started with --network=host so port 9222 is on localhost:
 *       docker run -d --name playwright-novnc --network host \
 *         -e MCP_BROWSER=chromium ghcr.io/xtr-dev/mcp-playwright-novnc:latest
 *     Watch the browser live at http://localhost:6080/vnc.html
 *
 *   CDP mode  (CDP_ENDPOINT=<url>):
 *     CDP_ENDPOINT=http://host:9222 npx playwright test --config=playwright.remote-debugging.config.ts
 *     Connects to an arbitrary Chrome DevTools endpoint. USE_VNC is ignored
 *     when CDP_ENDPOINT is set explicitly.
 *
 * All test files use one canonical import:
 *   import { test, expect, withCDP, type Page, type FrameLocator } from './fixtures';
 */

import {
  test as base,
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
} from '@playwright/test';

export { expect, type Page, type FrameLocator } from '@playwright/test';

// ---------------------------------------------------------------------------
// Mode detection — evaluated once per worker at module load time.
// ---------------------------------------------------------------------------

// VNC mode: USE_VNC=1 → connect to the noVNC container's Chrome on port 9222.
// CDP mode: CDP_ENDPOINT=<url> takes precedence over USE_VNC.
// Standard: neither set → launch local headless Chromium.
const VNC_DEFAULT_ENDPOINT = 'http://localhost:9222';
const REMOTE_ENDPOINT: string | null =
  process.env.CDP_ENDPOINT ??
  (process.env.USE_VNC ? VNC_DEFAULT_ENDPOINT : null);

const BASE_URL = process.env.BASE_URL ?? 'http://localhost:9888';

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

export const test = base.extend<TestFixtures, WorkerFixtures>({
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

      if (REMOTE_ENDPOINT) {
        try {
          browser = await chromium.connectOverCDP(REMOTE_ENDPOINT, { timeout: 5_000 });
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
   * Test-scoped context — fresh per test for full isolation.
   * baseURL lets tests call page.goto('/') without hardcoding the host.
   */
  context: async ({ browser }, use) => {
    const context = await browser.newContext({ baseURL: BASE_URL });
    await use(context);
    await context.close();
  },

  /**
   * Test-scoped page — fresh per test, derived from the isolated context.
   * No automatic navigation; tests navigate themselves.
   */
  page: async ({ context }, use) => {
    const page = await context.newPage();
    await use(page);
    // Page is closed implicitly when context closes.
  },
});

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
 * withCDP() was called.
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

  return () => [...logs];
}
