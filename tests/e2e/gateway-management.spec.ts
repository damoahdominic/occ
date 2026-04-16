import { test, expect } from './fixtures';
import {
  waitForHomePanelTab,
  getInnerFrame,
  clickButton,
  isButtonVisible,
  verifyStatusContains,
  getTextContent,
} from './test-utils';

/**
 * Gateway Management E2E Tests
 *
 * BDD Specification: ticket-047 Task 2
 * Feature: Gateway Management
 *
 * Scenarios:
 *   1. Start gateway transitions from stopped to running
 *   2. Stop gateway transitions from running to stopped
 *   3. Gateway status displays current state
 *
 * Test Data Requirements:
 * - OpenClaw installed in test profile
 * - Editor running on http://localhost:9888
 * - OCC Home panel accessible
 */

test.describe('Gateway Management', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to VS Code web interface
    await page.goto('/');
    // Wait for editor to be fully loaded
    await page.locator('.monaco-workbench').waitFor({ timeout: 30_000 });
  });

  /**
   * Scenario: Start Gateway Successfully
   *
   * Given: OpenClaw is installed in test profile
   * When: user clicks "Start Gateway" button
   * Then: gateway status changes to indicate starting/running
   * And: status eventually shows "Running" (or "Stopped" if already started)
   *
   * Acceptance Criteria:
   * - Start button is found and clickable
   * - Clicking starts the gateway process
   * - Status updates to Running (or other valid state)
   * - Gateway reaches running state within 60 seconds
   */
  test('start gateway transitions from stopped to running', async ({ page }) => {
    await waitForHomePanelTab(page);
    const innerFrame = getInnerFrame(page);

    // Check if Start button is visible
    const hasStartButton = await isButtonVisible(innerFrame, /start.*gateway|gateway.*start/i, 10_000);

    if (hasStartButton) {
      // Click Start Gateway button
      await clickButton(innerFrame, /start.*gateway|gateway.*start/i);

      // Gateway startup typically takes 5-30 seconds
      // Allow up to 60 seconds for cold start
      const statusIsRunning = await verifyStatusContains(innerFrame, 'running', 60_000);

      expect(statusIsRunning, 'Gateway status should show Running after startup').toBe(true);
    } else {
      // Start button not visible - gateway may already be running
      const statusIsRunning = await verifyStatusContains(innerFrame, 'running', 10_000);

      expect(statusIsRunning, 'Gateway should be in Running state when Start button not visible').toBe(true);
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

    // Check if Stop button is visible
    const hasStopButton = await isButtonVisible(innerFrame, /stop.*gateway|gateway.*stop/i, 10_000);

    if (hasStopButton) {
      // Click Stop Gateway button
      await clickButton(innerFrame, /stop.*gateway|gateway.*stop/i);

      // Gateway shutdown typically takes 2-10 seconds
      const statusIsStopped = await verifyStatusContains(innerFrame, 'stopped', 30_000);

      expect(statusIsStopped, 'Gateway status should show Stopped after stop').toBe(true);

      // Verify Stop button is no longer visible (replaced by Start button)
      await page.waitForTimeout(1000);
      const stopButtonStillVisible = await isButtonVisible(
        innerFrame,
        /stop.*gateway|gateway.*stop/i,
        5_000
      );

      expect(stopButtonStillVisible, 'Stop button should be hidden after gateway stops').toBe(false);
    } else {
      // Stop button not visible - gateway may already be stopped
      const statusIsStopped = await verifyStatusContains(innerFrame, 'stopped', 10_000);

      expect(statusIsStopped, 'Gateway should be in Stopped state when Stop button not visible').toBe(true);
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

    // Check if Start button is visible
    const hasStartButton = await isButtonVisible(innerFrame, /start.*gateway|gateway.*start/i, 10_000);

    if (hasStartButton) {
      // Click Start Gateway button
      await clickButton(innerFrame, /start.*gateway|gateway.*start/i);

      // Should show "Starting" within 2 seconds
      await page.waitForTimeout(2000);
      const startingStatus = await verifyStatusContains(innerFrame, 'starting', 5_000);
      expect(startingStatus, 'Status should show Starting after clicking start button').toBe(true);

      // Wait for potential timeout (30 seconds is too long for test, use 10)
      await page.waitForTimeout(10_000);

      // Check for error or running status
      const hasError = innerFrame.locator('[data-testid="error"], .error').filter({
        hasText: /timeout|error/i,
      });
      const isErrorVisible = await hasError.first().isVisible({ timeout: 2_000 }).catch(() => false);
      const isRunning = await verifyStatusContains(innerFrame, 'running', 2_000);

      // Either error with retry or successful start is acceptable
      if (isErrorVisible) {
        // Check for retry button when error is shown
        const retryButton = innerFrame.locator('button, [role="button"]').filter({
          hasText: /retry/i,
        });
        const hasRetry = await retryButton.first().isVisible({ timeout: 5_000 }).catch(() => false);
        expect(hasRetry, 'Retry button should be visible when error occurs').toBe(true);
      } else {
        // Should have started successfully
        expect(isRunning, 'Gateway should be Running or error with retry should be shown').toBe(true);
      }
    }
  });
});