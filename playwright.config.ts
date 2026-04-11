import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  snapshotDir: './tests/e2e/__snapshots__',
  timeout: 240_000,
  retries: process.env.CI ? 2 : 0,
  // All tests share a single VS Code server — run serially to prevent
  // workspace-state contamination between test files.
  workers: 1,
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
    // Otherwise use bundled Playwright Chromium
    ...(process.env.CDP_ENDPOINT ? {
      // In CDP mode, we don't specify browserName or launchOptions
      // The browser connection is handled in the test fixtures (fixtures.ts)
      // We still need to set up the use object with baseURL etc.
    } : {
      // Standard mode - launch local Chromium
      browserName: 'chromium',
      headless: true,
      baseURL: 'http://[::1]:9888/',
      ...devices['Desktop Chrome'],
      // Required when running inside Docker as root (no sandbox available)
      launchOptions: {
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      },
    }),
  },
  // Always use the chromium project - fixtures.ts handles the browser connection
  projects: [
    {
      name: 'chromium',
      use: {
        baseURL: 'http://[::1]:9888/',
        ...devices['Desktop Chrome'],
        // Required when running inside Docker as root (no sandbox available)
        launchOptions: {
          args: ['--no-sandbox', '--disable-setuid-sandbox'],
        },
        // In CDP mode, the fixtures.ts will override the browser connection
        // so these launchOptions are only used in standard mode
      },
    },
  ],
  // No global setup needed - the fixtures.ts handles browser connection
  webServer: {
    // The editor container is already running in Docker — reuse it instead of
    // trying to start a new one.
    command: 'true',
    // url: 'http://[::1]:9888',
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
