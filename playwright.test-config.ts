import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  outputDir: '/tmp/test-results',
  snapshotDir: './tests/e2e/__snapshots__',
  timeout: 240_000,
  retries: 0,
  workers: 1,
  reporter: [
    ['list', { printSteps: true }],
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
    browserName: 'chromium',
    headless: true,
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'true',
    url: 'http://localhost:9888',
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
