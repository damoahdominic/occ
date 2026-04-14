/**
 * Playwright config for running tests against an existing Chrome via CDP.
 *
 * DEPRECATED: Use docker-compose.openclaw.yml instead:
 *   docker-compose -f docker/docker-compose.openclaw.yml up -d
 *
 * Legacy `docker run` approach (not recommended):
 *   docker run -d --name playwright-novnc --network host \
 *     -e MCP_BROWSER=chromium \
 *     ghcr.io/xtr-dev/mcp-playwright-novnc
 *
 * Override the CDP endpoint via env var:
 *   CDP_ENDPOINT=http://localhost:9222 npx playwright test --config=playwright.remote-debugging.config.ts
 *
 * Tests must import { test, expect } from './cdp-fixtures' to get the
 * CDP-connected browser, context, and page fixtures.
 */
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  snapshotDir: './tests/e2e/__snapshots__',
  timeout: 120_000,
  retries: 0,
  workers: 1,
  reporter: [
    ['list', { printSteps: true }],
  ],
  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:9888',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // CDP connection is handled by the cdp-fixtures.ts browser fixture.
    // No launchOptions needed — we connect to an existing browser.
  },
  // No 'projects' block — the CDP fixture handles browser setup.
  // No launchOptions/browserName at config level — connectOverCDP is used instead.
  // webServer: {
  //   command: 'true',
  //   url: 'http://localhost:9888',
  //   reuseExistingServer: true,
  //   timeout: 30_000,
  // },
});
