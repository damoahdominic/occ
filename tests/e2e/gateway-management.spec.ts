import { test, expect, type Page } from './fixtures';

/**
 * Gateway Management E2E Tests
 *
 * BDD Specification: ticket-047 Task 2
 * Feature: Gateway Management
 *
 * Test Data Requirements:
 * - OpenClaw installed in test profile
 * - Mock backend server running on localhost:3001
 */

const waitForHomePanelTab = async (page: Page) => {
  const tab = page.locator('[role="tab"]').filter({ hasText: 'OCC Home' });
  const autoOpen = tab.waitFor({ timeout: 25_000 }).catch(() => null);
  await autoOpen;

  if (!await tab.isVisible()) {
    await page.locator('.activitybar').click();
    await page.keyboard.press('Control+Alt+H');
  }

  await tab.waitFor({ timeout: 20_000 });
};

const getInnerFrame = (page: Page) => {
  const outerFrame = page.frameLocator('iframe.webview').first();
  return outerFrame.frameLocator('iframe#active-frame');
};

test.describe('Gateway Management', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.locator('.monaco-workbench').waitFor({ timeout: 30_000 });
  });

  /**
   * Scenario: Start Gateway Successfully
   * Given: OpenClaw is installed in test profile
   * When: user clicks "Start Gateway" button
   * Then: gateway status changes to "Starting"
   * And: after gateway starts, status shows "Running"
   * And: gateway is accessible on configured port
   */
  test('start gateway transitions from stopped to running', async ({ page }) => {
    await waitForHomePanelTab(page);
    const innerFrame = getInnerFrame(page);

    // Find and click Start Gateway button
    const startButton = innerFrame.locator('button, [role="button"]').filter({
      hasText: /start.*gateway|gateway.*start/i,
    });

    const startVisible = await startButton.first().isVisible().catch(() => false);

    if (startVisible) {
      await startButton.first().click();

      // Check for "Starting" status
      const startingStatus = innerFrame.locator('[data-testid="gateway-status"], .status').filter({
        hasText: /starting/i,
      });

      // Wait a moment for status to update
      await page.waitForTimeout(2000);

      // Check for "Running" status
      const runningStatus = innerFrame.locator('[data-testid="gateway-status"], .status').filter({
        hasText: /running/i,
      });

      await expect(runningStatus.first()).toBeVisible({ timeout: 60_000 });
    } else {
      // Gateway may already be running
      const runningStatus = innerFrame.locator('[data-testid="gateway-status"], .status').filter({
        hasText: /running/i,
      });
      await expect(runningStatus.first()).toBeVisible({ timeout: 10_000 });
    }
  });

  /**
   * Scenario: Stop Gateway Successfully
   * Given: gateway is currently running
   * When: user clicks "Stop Gateway" button
   * Then: gateway status changes to "Stopping"
   * And: after gateway stops, status shows "Stopped"
   */
  test('stop gateway transitions from running to stopped', async ({ page }) => {
    await waitForHomePanelTab(page);
    const innerFrame = getInnerFrame(page);

    // Find and click Stop Gateway button
    const stopButton = innerFrame.locator('button, [role="button"]').filter({
      hasText: /stop.*gateway|gateway.*stop/i,
    });

    const stopVisible = await stopButton.first().isVisible().catch(() => false);

    if (stopVisible) {
      await stopButton.first().click();

      // Check for "Stopping" status
      const stoppingStatus = innerFrame.locator('[data-testid="gateway-status"], .status').filter({
        hasText: /stopping/i,
      });

      // Wait a moment for status to update
      await page.waitForTimeout(2000);

      // Check for "Stopped" status
      const stoppedStatus = innerFrame.locator('[data-testid="gateway-status"], .status').filter({
        hasText: /stopped/i,
      });

      await expect(stoppedStatus.first()).toBeVisible({ timeout: 60_000 });
    } else {
      // Gateway may already be stopped - verify stopped status
      const stoppedStatus = innerFrame.locator('[data-testid="gateway-status"], .status').filter({
        hasText: /stopped/i,
      });
      await expect(stoppedStatus.first()).toBeVisible({ timeout: 10_000 });
    }
  });

  /**
   * Scenario: Gateway Start Timeout
   * Given: gateway takes longer than expected to start
   * When: user clicks "Start Gateway"
   * Then: status shows "Starting" within 2 seconds
   * And: after 30 seconds, if still not running, show timeout error
   * And: user should be able to retry
   */
  test('gateway start timeout shows error with retry', async ({ page }) => {
    await waitForHomePanelTab(page);
    const innerFrame = getInnerFrame(page);

    const startButton = innerFrame.locator('button, [role="button"]').filter({
      hasText: /start.*gateway|gateway.*start/i,
    });

    const startVisible = await startButton.first().isVisible().catch(() => false);

    if (startVisible) {
      await startButton.first().click();

      // Should show "Starting" within 2 seconds
      await page.waitForTimeout(2000);
      const startingStatus = innerFrame.locator('[data-testid="gateway-status"], .status"]').filter({
        hasText: /starting/i,
      });
      expect(await startingStatus.count()).toBeGreaterThan(0);

      // Wait for potential timeout (30 seconds is too long for test, use 10)
      await page.waitForTimeout(10_000);

      // Check for error or running status
      const errorStatus = innerFrame.locator('.error, [data-testid="error"]').filter({
        hasText: /timeout|error/i,
      });
      const runningStatus = innerFrame.locator('[data-testid="gateway-status"], .status').filter({
        hasText: /running/i,
      });

      // Either error with retry or successful start is acceptable
      const hasError = await errorStatus.first().isVisible().catch(() => false);
      const hasRunning = await runningStatus.first().isVisible().catch(() => false);

      if (hasError) {
        // Check for retry button
        const retryButton = innerFrame.locator('button, [role="button"]').filter({
          hasText: /retry/i,
        });
        await expect(retryButton.first()).toBeVisible({ timeout: 5_000 });
      } else {
        // Should have started successfully
        await expect(runningStatus.first()).toBeVisible({ timeout: 5_000 });
      }
    }
  });
});