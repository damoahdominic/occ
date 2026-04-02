import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 120_000,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:9888',
    browserName: 'chromium',
    headless: true,
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    // `docker compose up editor` keeps the process in the foreground so Playwright
    // can manage its lifecycle in CI.  Locally the container is already running,
    // so reuseExistingServer skips the command entirely.
    command: 'docker compose up editor',
    url: 'http://localhost:9888',
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
