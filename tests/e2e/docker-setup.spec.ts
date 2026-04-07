/**
 * Docker card setup TDD tests — ticket-030 + ticket-040.
 *
 * OLD Flow (ticket-030): click Docker card → provision panel appears → auto-start compose → done
 * NEW Flow (ticket-040): click Docker card → 3-step config modal → confirm → provision
 *   - Step 1: Config form (image, port, data dir, fresh build checkbox)
 *   - Step 2: Confirm read-only values
 *   - Step 3: Provision with docker compose
 */

/**
 * Import from cdp-fixtures when running with playwright.remote-debugging.config.ts
 * (CDP-connected browser via noVNC container on port 9222).
 * Falls back to @playwright/test fixtures for standard headless runs.
 */
import { test, expect, type Page, type FrameLocator, withCDP } from './fixtures';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Open (or reveal) the OCC Home panel and wait for its tab to be visible. */
async function waitForHomePanelTab(page: Page): Promise<void> {
  const tab = page.locator('[role="tab"]').filter({ hasText: 'OCC Home' });

  await tab.waitFor({ timeout: 30_000 }).catch(() => null);

  if (!await tab.isVisible()) {
    await page.locator('.activitybar').click({ force: true, timeout: 10_000 }).catch(() => null);
    await page.keyboard.press('Control+Alt+H');
  }

  await tab.waitFor({ timeout: 30_000 });
}

/** Returns the inner FrameLocator for the OCC panel content. */
function getInnerFrame(page: Page): FrameLocator {
  return page.frameLocator('iframe.webview').first().frameLocator('iframe#active-frame');
}

/**
 * Navigate to the home panel and click the Docker card.
 * Returns the new inner frame after the panel has been recreated.
 * With the new flow, this opens the config modal (Step 1).
 */
async function clickDockerCard(page: Page): Promise<FrameLocator> {
  await page.goto('/');
  await page.locator('.monaco-workbench').waitFor({ timeout: 30_000 });

  // Open the home panel
  await page.keyboard.press('F1');
  await page.locator('.quick-input-widget').waitFor({ timeout: 10_000 });
  await page.keyboard.type('OpenClaw: Home');
  await page.locator('.quick-input-list .monaco-list-row').first().click();

  await waitForHomePanelTab(page);
  const initialFrame = getInnerFrame(page);

  // Click the Docker card in host picker
  const dockerCard = initialFrame.locator('[data-card="docker"]');
  await dockerCard.waitFor({ timeout: 20_000 });
  await dockerCard.click();

  // Wait for panel dispose/recreate
  const tab = page.locator('[role="tab"]').filter({ hasText: 'OCC Home' });
  await tab.waitFor({ state: 'hidden', timeout: 20_000 }).catch(() => null);
  await tab.waitFor({ state: 'visible', timeout: 30_000 });

  return getInnerFrame(page);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('docker card is visible in host picker', async ({ page }) => {
  await page.goto('/');
  await page.locator('.monaco-workbench').waitFor({ timeout: 30_000 });

  await page.keyboard.press('F1');
  await page.locator('.quick-input-widget').waitFor({ timeout: 10_000 });
  await page.keyboard.type('OpenClaw: Home');
  await page.locator('.quick-input-list .monaco-list-row').first().click();

  await waitForHomePanelTab(page);
  const innerFrame = getInnerFrame(page);

  // Docker card should be visible with data-card attribute
  const dockerCard = innerFrame.locator('[data-card="docker"]');
  await dockerCard.waitFor({ timeout: 20_000 });
  await expect(dockerCard).toContainText('Docker');
  await expect(dockerCard).toContainText('Recommended');
});

test('clicking docker card shows 3-step config modal (ticket-040)', async ({ page }) => {
  // Capture browser console logs via CDP to aid debugging
  const getLogs = await withCDP(page);

  const innerFrame = await clickDockerCard(page);

  // Config modal should be visible at Step 1
  const configPanel = innerFrame.locator('#panel-docker-config');
  await configPanel.waitFor({ state: 'visible', timeout: 20_000 }).catch(err => {
    console.error('CDP console logs at failure:\n', getLogs().join('\n'));
    throw err;
  });
  await expect(configPanel).toBeVisible();

  // Step 1 should be active (Config)
  const step1 = innerFrame.locator('#config-step-1-indicator');
  await expect(step1).toBeVisible();
  await expect(step1).toContainText('1. Config');

  // Step 2 and Step 3 should not be visible yet
  const step2 = innerFrame.locator('#docker-config-step-2');
  await expect(step2).toHaveCSS('display', 'none');
  const step3 = innerFrame.locator('#docker-config-step-3');
  await expect(step3).toHaveCSS('display', 'none');

  // Old provision panel should NOT be visible
  const provisionPanel = innerFrame.locator('#panel-docker-provision');
  await expect(provisionPanel).not.toBeVisible();
});

test('config modal step 1 shows all 4 fields', async ({ page }) => {
  const innerFrame = await clickDockerCard(page);

  // Check all 4 config fields are visible
  const imageInput = innerFrame.locator('#config-gateway-image');
  await expect(imageInput).toBeVisible();

  const portInput = innerFrame.locator('#config-gateway-port');
  await expect(portInput).toBeVisible();

  const dataDirInput = innerFrame.locator('#config-data-dir');
  await expect(dataDirInput).toBeVisible();

  const freshBuildCheckbox = innerFrame.locator('#config-fresh-build');
  await expect(freshBuildCheckbox).toBeVisible();

  // Browse button should be visible
  const browseBtn = innerFrame.locator('button:has-text("Browse")');
  await expect(browseBtn).toBeVisible();

  // Next and Cancel buttons should be visible
  const nextBtn = innerFrame.locator('button:has-text("Next")');
  await expect(nextBtn).toBeVisible();
  const cancelBtn = innerFrame.locator('button:has-text("Cancel")');
  await expect(cancelBtn).toBeVisible();
});

test('config modal step indicators show correct state', async ({ page }) => {
  const innerFrame = await clickDockerCard(page);

  // Step 1 should be active (blue background)
  const step1Indicator = innerFrame.locator('#config-step-1-indicator');
  await expect(step1Indicator).toHaveCSS('background-color', /rgb\(37\)|#2563eb/i);

  // Step 2 and 3 should be inactive (dark background)
  const step2Indicator = innerFrame.locator('#config-step-2-indicator');
  await expect(step2Indicator).toHaveCSS('background-color', /rgb\(26\)|#1a1a1a/i);
  const step3Indicator = innerFrame.locator('#config-step-3-indicator');
  await expect(step3Indicator).toHaveCSS('background-color', /rgb\(26\)|#1a1a1a/i);
});

test('clicking Next shows Step 2 confirm screen', async ({ page }) => {
  const innerFrame = await clickDockerCard(page);

  // Click Next button to advance to Step 2
  const nextBtn = innerFrame.locator('button:has-text("Next")');
  await nextBtn.click();

  // Wait for Step 2 to appear
  const step2 = innerFrame.locator('#docker-config-step-2');
  await step2.waitFor({ state: 'visible', timeout: 10_000 });

  // Step 2 should show confirmation with read-only values
  const confirmImage = innerFrame.locator('#confirm-image');
  await expect(confirmImage).toBeVisible();
  const confirmPort = innerFrame.locator('#confirm-port');
  await expect(confirmPort).toBeVisible();
  const confirmDataDir = innerFrame.locator('#confirm-data-dir');
  await expect(confirmDataDir).toBeVisible();
  const confirmFreshBuild = innerFrame.locator('#confirm-fresh-build');
  await expect(confirmFreshBuild).toBeVisible();

  // Confirm button should be visible
  const confirmBtn = innerFrame.locator('#btn-confirm-config');
  await expect(confirmBtn).toBeVisible();
});

test('clicking Back from Step 2 returns to Step 1', async ({ page }) => {
  const innerFrame = await clickDockerCard(page);

  // Advance to Step 2
  const nextBtn = innerFrame.locator('button:has-text("Next")');
  await nextBtn.click();

  // Wait for Step 2
  const step2 = innerFrame.locator('#docker-config-step-2');
  await step2.waitFor({ state: 'visible', timeout: 10_000 });

  // Click Back
  const backBtn = innerFrame.locator('button:has-text("Back")');
  await backBtn.click();

  // Step 1 should be visible again
  const step1 = innerFrame.locator('#docker-config-step-1');
  await step1.waitFor({ state: 'visible', timeout: 10_000 });
});

test('cancel button returns to bootstrap choice', async ({ page }) => {
  const innerFrame = await clickDockerCard(page);

  // Click Cancel
  const cancelBtn = innerFrame.locator('button:has-text("Cancel")');
  await cancelBtn.click();

  // Config panel should be hidden
  const configPanel = innerFrame.locator('#panel-docker-config');
  await expect(configPanel).not.toBeVisible();

  // Bootstrap choice should be visible again
  const bootstrapChoice = innerFrame.locator('#panel-bootstrap-choice');
  await bootstrapChoice.waitFor({ state: 'visible', timeout: 10_000 });
});

test('step timeline shows docker flow (Configure → Confirm → Start)', async ({ page }) => {
  const innerFrame = await clickDockerCard(page);

  // All 3 step indicators should be visible in the stepper
  const stepper = innerFrame.locator('.stepper');
  await expect(stepper).toBeVisible();

  const step1 = innerFrame.locator('#config-step-1-indicator');
  await expect(step1).toContainText('1. Config');
  const step2 = innerFrame.locator('#config-step-2-indicator');
  await expect(step2).toContainText('2. Confirm');
  const step3 = innerFrame.locator('#config-step-3-indicator');
  await expect(step3).toContainText('3. Start');
});