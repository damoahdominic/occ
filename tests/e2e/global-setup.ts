/**
 * Global Setup + Playwright Fixtures
 *
 * - Auto-detects Chrome CDP if available (runs once before tests)
 * - Provides custom test/expect/page fixtures for CDP mode
 * - Re-exports login helpers
 *
 * Skip CDP detection with: SKIP_CDP=1 npm run test:e2e
 */

import * as http from 'http';
import { execSync } from 'child_process';
import { test as baseTest, expect as baseExpect, chromium, type Browser, type BrowserContext, type Page } from '@playwright/test';

const BASE_URL = process.env.BASE_URL ?? 'http://127.0.0.1:9888';
const useCDP = !!process.env.CDP_ENDPOINT;

// ---------------------------------------------------------------------------
// Health Check: Wait for editor container to be ready
// ---------------------------------------------------------------------------

async function waitForEditorHealthy(maxWaitMs = 30_000): Promise<void> {
  const startTime = Date.now();
  const checkIntervalMs = 1000;

  while (Date.now() - startTime < maxWaitMs) {
    try {
      const output = execSync('docker compose ps editor --format json', {
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'], // suppress stderr
      }).trim();

      if (!output) {
        throw new Error('Container not found');
      }

      const containers = JSON.parse(output);
      const container = Array.isArray(containers) ? containers[0] : containers;

      if (container.State === 'running' && container.Health === 'healthy') {
        console.log('✓ Editor container is healthy');
        return;
      }

      throw new Error(`Container state: ${container.State}, health: ${container.Health}`);
    } catch (err) {
      const elapsed = Date.now() - startTime;
      if (elapsed >= maxWaitMs) {
        throw new Error(
          `Editor container did not become healthy after ${maxWaitMs}ms. ` +
          `Run: docker-compose up -d`,
        );
      }
      process.stdout.write('.');
      await new Promise((resolve) => setTimeout(resolve, checkIntervalMs));
    }
  }
}

// ---------------------------------------------------------------------------
// CDP Detection (runs once before all tests)
// ---------------------------------------------------------------------------

export default async () => {
  // Wait for editor container to be healthy before proceeding
  await waitForEditorHealthy();

  if (process.env.SKIP_CDP === '1') {
    console.log('ℹ SKIP_CDP=1 - using default browser');
    return;
  }

  const wsEndpoint = await new Promise<string | null>((resolve) => {
    const req = http.get(
      { hostname: '127.0.0.1', port: 9222, path: '/json/version' },
      (res) => {
        let data = '';
        res.on('data', (chunk: Buffer) => { data += chunk; });
        res.on('end', () => {
          try {
            const json = JSON.parse(data) as { webSocketDebuggerUrl?: string };
            resolve(json.webSocketDebuggerUrl || null);
          } catch {
            resolve(null);
          }
        });
      },
    );
    req.setTimeout(2000, () => { req.destroy(); resolve(null); });
    req.on('error', () => resolve(null));
  });

  if (wsEndpoint) {
    process.env.CDP_ENDPOINT = wsEndpoint;
    console.log(`✓ Auto-detected Chrome CDP: ${wsEndpoint}`);
  } else {
    console.log('ℹ No Chrome CDP detected - using default browser');
  }
};

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
// VS Code workspace URL
// ---------------------------------------------------------------------------

const VSCODE_WORKSPACE_URL =
  process.env.VSCODE_WORKSPACE_URL ??
  `${BASE_URL}/?workspace=/root/.occ/My%20OpenClaw%20Workspace.code-workspace`;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

export const test = baseTest.extend<TestFixtures, WorkerFixtures>({
  /**
   * Worker-scoped browser.
   *
   * CDP mode: connects to external Chrome via CDP_ENDPOINT.
   *           Falls back to local headless Chromium if connection fails.
   * Local mode: always launches a local headless Chromium.
   *
   * Worker scope is used in all modes so a single external connection is
   * shared across tests in the worker. Context/page fixtures provide
   * per-test isolation regardless of browser scope.
   */
  browser: [
    async ({}, use) => {
      let browser: Browser;
      let ownsBrowser = false;

      if (useCDP) {
        try {
          const cdpEndpoint = process.env.CDP_ENDPOINT!;
          console.log(`✓ Connecting via CDP: ${cdpEndpoint}`);
          browser = await chromium.connectOverCDP(cdpEndpoint, { timeout: 10_000 });
        } catch (err) {
          console.log(`ℹ CDP unavailable, using bundled Chromium`);
          browser = await chromium.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
          });
          ownsBrowser = true;
        }
      } else {
        // Use bundled Chromium (already part of Playwright npm package)
        browser = await chromium.launch({
          headless: true,
          args: ['--no-sandbox', '--disable-setuid-sandbox'],
        });
        ownsBrowser = true;
      }

      await use(browser);

      // Only close the browser if we launched it — never close an externally managed browser
      if (ownsBrowser) {
        await browser.close();
      }
    },
    { scope: 'worker' },
  ],

  /**
   * Test-scoped context.
   * In CDP mode (external browser): reuse the default context so VS Code's
   * localStorage/session state is preserved — a fresh context would blank-page.
   * In standard mode (local Chromium): create a fresh context per test.
   */
  context: async ({ browser }, use) => {
    const existing = browser.contexts();
    const context = existing.length > 0
      ? existing[0]
      : await browser.newContext({ baseURL: BASE_URL });
    // Ensure baseURL is honoured even on a reused context
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
   * Intercept bare-root navigations and redirect to the workspace-aware URL.
   *
   * After each test, explicitly close any CDP sessions to prevent resource leaks.
   */
  page: async ({ context }, use) => {
    const page = await context.newPage();

    // Track CDP sessions we create in this test so we can clean them up
    const sessionsCreated = new Set<string>();
    try {
      const originalNewCDPSession = page.context().newCDPSession.bind(page.context());
      (page.context() as any).newCDPSession = async function(target: any) {
        const session = await originalNewCDPSession(target);
        sessionsCreated.add(session.toString());
        return session;
      };
    } catch {
      // CDP not available (local Chromium mode) — skip session tracking
    }

    // In CDP mode, prefer the workspace URL from the live VS Code session.
    // In headless mode (no existing pages), fall back to VSCODE_WORKSPACE_URL.
    const vsCodePage = context.pages()
      .filter(p => p !== page)
      .find(p => p.url().startsWith(BASE_URL));
    const targetUrl = vsCodePage?.url() ?? VSCODE_WORKSPACE_URL;

    // Ensure every test starts at the workspace-aware URL so the OCC extension activates.
    // Use an explicit timeout and verify the final URL; if navigation failed or landed on
    // a non-VS Code page (e.g. chrome://newtab/), retry with the workspace URL directly.
    try {
      await page.goto(targetUrl, { waitUntil: 'load', timeout: 60_000 });
    } catch {
      // Navigation timed out or failed; fall through to the URL check below.
    }
    if (!page.url().startsWith(BASE_URL)) {
      await page.goto(VSCODE_WORKSPACE_URL, { waitUntil: 'load', timeout: 60_000 });
    }

    await use(page);

    // Close only the CDP sessions we created in this test
    try {
      for (const cdpSession of page.context().cdpSessions()) {
        if (sessionsCreated.has(cdpSession.toString())) {
          try {
            await cdpSession.detach().catch(() => {});
          } catch {
            // Silently ignore errors if session is already detached
          }
        }
      }
    } catch {
      // Silently ignore if cdpSessions is not available (local mode)
    }

    // Close the page to release resources
    await page.close().catch(() => {});
  },
});

// Preserve static methods from baseTest
test.beforeEach = baseTest.beforeEach;
test.afterEach = baseTest.afterEach;
test.describe = baseTest.describe;
test.it = baseTest.it;
(test as any).todo = (title: string) => test.skip(`[PENDING] ${title}`, () => {});

export { expect, type Page, type FrameLocator } from '@playwright/test';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export async function withCDP(page: Page): Promise<() => string[]> {
  const cdp = await page.context().newCDPSession(page);
  const logs: string[] = [];
  await cdp.send('Log.enable');
  cdp.on('Log.entryAdded', (entry: { entry: { text: string; level: string } }) => {
    logs.push(`[${entry.entry.level}] ${entry.entry.text}`);
  });
  await cdp.send('Runtime.enable');
  cdp.on('Runtime.consoleAPICalled', (params: { type: string; args: Array<{ value?: unknown; description?: string }> }) => {
    const text = params.args.map((a) => String(a.value ?? a.description ?? '')).join(' ');
    logs.push(`[console.${params.type}] ${text}`);
  });
  return () => [...logs];
}
