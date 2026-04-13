import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  snapshotDir: './tests/e2e/__snapshots__',
  outputDir: './test-results',
  timeout: 240_000,
  retries: process.env.CI ? 2 : 0,
  // Allow workers to be set via CLI or env var; default to 1 for VS Code server isolation
  // Usage: npx playwright test --workers=4
  workers: process.env.WORKERS ? parseInt(process.env.WORKERS) : 1,
  fullyParallel: true,
  expect: {
    toHaveScreenshot: {
      maxDiffPixels: 50,
      threshold: 0.2,
      animations: 'disabled',
    },
  },
  use: {
    baseURL: 'http://[::1]:9888/',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // Connect to existing Chrome via CDP when CDP_ENDPOINT is set
    // The browser connection is handled in the test fixtures (fixtures.ts)
    // Note: Do NOT configure browserName or launchOptions here when using CDP
    // Fixtures will handle the connection based on CDP_ENDPOINT env var
  },
  // Chromium project - fixtures.ts handles all browser connection logic
  projects: [
    {
      name: 'chromium',
      use: {
        baseURL: 'http://[::1]:9888/',
        // Fixtures (global-setup.ts) will connect via CDP if CDP_ENDPOINT is set
        // Otherwise fixtures will launch local Chromium with appropriate args
      },
    },
  ],
  // Global setup to auto-detect Chrome CDP
  globalSetup: require.resolve('./tests/e2e/global-setup.ts'),
  // Global teardown to close all tabs/pages when tests complete
  globalTeardown: require.resolve('./tests/e2e/global-teardown.ts'),
  webServer: {
    // The editor container is already running in Docker — reuse it instead of
    // trying to start a new one.
    command: 'true',
    url: 'http://127.0.0.1:9888',
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
