import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  snapshotDir: './tests/e2e/__snapshots__',
  timeout: 240_000,
  retries: process.env.CI ? 2 : 0,
  // All tests share a single VS Code server — run serially to prevent
  // workspace-state contamination between test files.
  workers: 1,
  reporter: [
    ['list', { printSteps: true }],
    // ['json', { outputFile: 'test-results/test-results.json' }],
  ],
  expect: {
    toHaveScreenshot: {
      maxDiffPixels: 50,
      threshold: 0.2,
      animations: 'disabled',
    },
  },
  use: {
    baseURL: 'http://localhost:9888',
    // Use bundled Playwright Chromium (no external Chrome required)
    browserName: 'chromium',
    headless: true,
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Required when running inside Docker as root (no sandbox available)
        launchOptions: {
          args: ['--no-sandbox', '--disable-setuid-sandbox'],
        },
      },
    },
  ],
  webServer: {
    // The editor container is already running in Docker — reuse it instead of
    // trying to start a new one.
    command: 'true',
    url: 'http://localhost:9888',
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
