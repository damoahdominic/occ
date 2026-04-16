/**
 * Global teardown hook — closes all pages/tabs after tests complete.
 *
 * Playwright runs this once per worker after all tests finish.
 * Ensures no lingering tabs remain in the browser.
 */

import { chromium } from '@playwright/test';

async function globalTeardown() {
  // If tests used a local Chromium (not CDP), close it
  // The browser was already created and managed by Playwright,
  // so Playwright will close it automatically. This is just for safety.

  // For CDP mode (browser already running), we don't close it
  // since we connected to an external instance, not launched it.

  // Close any remaining pages by connecting to the browser and clearing them
  if (process.env.CDP_ENDPOINT) {
    try {
      const browser = await chromium.connectOverCDP(process.env.CDP_ENDPOINT, {
        timeout: 5_000,
      });
      const contexts = browser.contexts();
      for (const context of contexts) {
        const pages = context.pages();
        for (const page of pages) {
          await page.close();
        }
        await context.close();
      }
      // Don't close the browser itself if using CDP (external instance)
    } catch (err) {
      // Silently ignore connection errors during teardown
      // Browser may already be closed or unreachable
    }
  }
}

export default globalTeardown;
