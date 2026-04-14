/**
 * Docker card setup TDD tests — ticket-030 + ticket-040.
 *
 * OLD Flow (ticket-030): click Docker card → provision panel appears → auto-start compose → done
 * NEW Flow (ticket-040): click Docker card → 3-step config page → confirm → provision
 *   - Step 1: Config form (image, port, data dir, fresh build checkbox)
 *   - Step 2: Confirm read-only values
 *   - Step 3: Provision with docker compose
 *
 * Implementation: each step is a full-page render (no modal, no hidden panels).
 * The stepper is always visible at the top showing progress.
 */

import { test, expect, type FrameLocator, type Page, withCDP } from './fixtures';
import { waitForHomePanelTab, getInnerFrame } from './test-utils';

const BASE_URL = process.env.BASE_URL ?? 'http://127.0.0.1:9888';
const WORKSPACE_URL = process.env.VSCODE_WORKSPACE_URL ??
  `${BASE_URL}/?workspace=/root/.occ/My%20OpenClaw%20Workspace.code-workspace`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Navigate to the home panel and click the Docker card.
 * With the new flow, clicking Docker renders the full-page docker config (Step 1)
 * in-place — no panel dispose/recreate.
 */
async function clickDockerCard(page: Page): Promise<FrameLocator> {
  await page.goto(WORKSPACE_URL);
  await page.locator('.monaco-workbench').waitFor({ timeout: 30_000 });

  // Open the home panel
  await page.keyboard.press('F1');
  await page.locator('.quick-input-widget').waitFor({ timeout: 10_000 });
  await page.keyboard.type('OpenClaw: Home');
  await page.locator('.quick-input-list .monaco-list-row').first().click();

  await waitForHomePanelTab(page);
  const frame = getInnerFrame(page);

  // Click the Docker card in host picker
  const dockerCard = frame.locator('[data-card="docker"]');
  await dockerCard.waitFor({ timeout: 20_000 });
  await dockerCard.click();

  // Wait for step 1 content to appear (full-page render, no panel recreate)
  await frame.locator('#docker-config-step-1').waitFor({ timeout: 20_000 });

  return frame;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('docker card is visible in host picker', async ({ page }) => {
  await page.goto(WORKSPACE_URL);
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
  await expect(dockerCard, 'Docker card should contain "Docker" text').toContainText('Docker');
  await expect(dockerCard, 'Docker card should contain "Recommended" label').toContainText('Recommended');
});

test('clicking docker card shows 3-step config page (ticket-040)', async ({ page }) => {
  // Capture browser console logs via CDP to aid debugging
  const getLogs = await withCDP(page);

  const innerFrame = await clickDockerCard(page);

  // Step 1 config content should be visible (full-page render, not a modal)
  const step1 = innerFrame.locator('#docker-config-step-1');
  await step1.waitFor({ state: 'visible', timeout: 20_000 }).catch(err => {
    console.error('CDP console logs at failure:\n', getLogs().join('\n'));
    throw err;
  });
  await expect(step1, 'Step 1 config page should be visible').toBeVisible();

  // Stepper should show all 3 step indicators
  const step1Ind = innerFrame.locator('#config-step-1-indicator');
  await expect(step1Ind, 'Step 1 indicator should be visible').toBeVisible();
  await expect(step1Ind, 'Step 1 indicator should contain "1. Config"').toContainText('1. Config');

  const step2Ind = innerFrame.locator('#config-step-2-indicator');
  await expect(step2Ind, 'Step 2 indicator should be visible').toBeVisible();
  await expect(step2Ind, 'Step 2 indicator should contain "2. Confirm"').toContainText('2. Confirm');

  const step3Ind = innerFrame.locator('#config-step-3-indicator');
  await expect(step3Ind, 'Step 3 indicator should be visible').toBeVisible();
  await expect(step3Ind, 'Step 3 indicator should contain "3. Start"').toContainText('3. Start');

  // Step 2 and 3 content should NOT be in the DOM (full-page render)
  await expect(innerFrame.locator('#docker-config-step-2'), 'Step 2 content should not be in DOM yet').toHaveCount(0);
  await expect(innerFrame.locator('#docker-config-step-3'), 'Step 3 content should not be in DOM yet').toHaveCount(0);
});

test('config page step 1 shows all 4 fields', async ({ page }) => {
  const innerFrame = await clickDockerCard(page);

  // Check all 4 config fields are visible
  await expect(innerFrame.locator('#config-gateway-image'), 'Gateway image field should be visible').toBeVisible();
  await expect(innerFrame.locator('#config-gateway-port'), 'Gateway port field should be visible').toBeVisible();
  await expect(innerFrame.locator('#config-data-dir'), 'Data directory field should be visible').toBeVisible();
  await expect(innerFrame.locator('#config-fresh-build'), 'Fresh build checkbox should be visible').toBeVisible();

  // Browse button should be visible
  await expect(innerFrame.locator('button:has-text("Browse")'), 'Browse button should be visible').toBeVisible();

  // Next and Cancel buttons should be visible
  await expect(innerFrame.locator('button:has-text("Next")'), 'Next button should be visible').toBeVisible();
  await expect(innerFrame.locator('button:has-text("Cancel")'), 'Cancel button should be visible').toBeVisible();
});

test('step indicators show correct active state', async ({ page }) => {
  const innerFrame = await clickDockerCard(page);

  // Step 1 indicator should be active (blue background #2563eb → rgb(37, 99, 235))
  const step1Indicator = innerFrame.locator('#config-step-1-indicator');
  await expect(step1Indicator, 'Step 1 indicator should have active blue color').toHaveCSS('background-color', /rgb\(37,|rgb\(37 /);

  // Step 2 and 3 should be inactive (dark background #1a1a1a → rgb(26, 26, 26))
  const step2Indicator = innerFrame.locator('#config-step-2-indicator');
  await expect(step2Indicator, 'Step 2 indicator should have inactive dark color').toHaveCSS('background-color', /rgb\(26,|rgb\(26 /);

  const step3Indicator = innerFrame.locator('#config-step-3-indicator');
  await expect(step3Indicator, 'Step 3 indicator should have inactive dark color').toHaveCSS('background-color', /rgb\(26,|rgb\(26 /);
});

test('clicking Next renders Step 2 confirm page', async ({ page }) => {
  const innerFrame = await clickDockerCard(page);

  // Click Next button to advance to Step 2
  const nextBtn = innerFrame.locator('button:has-text("Next")');
  await nextBtn.click();

  // Wait for Step 2 content to appear (full-page re-render)
  const step2 = innerFrame.locator('#docker-config-step-2');
  await step2.waitFor({ state: 'visible', timeout: 20_000 });

  // Step 2 should show read-only confirm values
  await expect(innerFrame.locator('#confirm-image'), 'Confirm image field should be visible').toBeVisible();
  await expect(innerFrame.locator('#confirm-port'), 'Confirm port field should be visible').toBeVisible();
  await expect(innerFrame.locator('#confirm-data-dir'), 'Confirm data directory field should be visible').toBeVisible();
  await expect(innerFrame.locator('#confirm-fresh-build'), 'Confirm fresh build field should be visible').toBeVisible();

  // Confirm button should be visible
  await expect(innerFrame.locator('#btn-confirm-config'), 'Confirm button should be visible').toBeVisible();

  // Step 1 and 3 content should NOT be in DOM
  await expect(innerFrame.locator('#docker-config-step-1'), 'Step 1 content should not be in DOM on Step 2').toHaveCount(0);
  await expect(innerFrame.locator('#docker-config-step-3'), 'Step 3 content should not be in DOM on Step 2').toHaveCount(0);

  // Stepper: step 2 indicator should be active
  const step2Indicator = innerFrame.locator('#config-step-2-indicator');
  await expect(step2Indicator, 'Step 2 indicator should have active blue color').toHaveCSS('background-color', /rgb\(37,|rgb\(37 /);
});

test('clicking Back from Step 2 returns to Step 1', async ({ page }) => {
  const innerFrame = await clickDockerCard(page);

  // Advance to Step 2
  await innerFrame.locator('button:has-text("Next")').click();
  await innerFrame.locator('#docker-config-step-2').waitFor({ state: 'visible', timeout: 20_000 });

  // Click Back
  await innerFrame.locator('button:has-text("Back")').click();

  // Step 1 should be visible again (full-page re-render)
  await innerFrame.locator('#docker-config-step-1').waitFor({ state: 'visible', timeout: 20_000 });
  await expect(innerFrame.locator('#docker-config-step-2'), 'Step 2 content should be removed when going back to Step 1').toHaveCount(0);
});

test('cancel returns to host picker', async ({ page }) => {
  const innerFrame = await clickDockerCard(page);

  // Click Cancel
  await innerFrame.locator('button:has-text("Cancel")').click();

  // Should return to the host picker (Docker/Local/SSH cards)
  const dockerCard = innerFrame.locator('[data-card="docker"]');
  await dockerCard.waitFor({ state: 'visible', timeout: 20_000 });
  await expect(innerFrame.locator('[data-card="local"]'), 'Local card should be visible in host picker after cancel').toBeVisible();
});

test('step timeline shows docker flow (1. Config → 2. Confirm → 3. Start)', async ({ page }) => {
  const innerFrame = await clickDockerCard(page);

  // All 3 step indicators should be visible in the stepper
  await expect(innerFrame.locator('.stepper'), 'Stepper should be visible').toBeVisible();
  await expect(innerFrame.locator('#config-step-1-indicator'), 'Step 1 indicator should show "1. Config"').toContainText('1. Config');
  await expect(innerFrame.locator('#config-step-2-indicator'), 'Step 2 indicator should show "2. Confirm"').toContainText('2. Confirm');
  await expect(innerFrame.locator('#config-step-3-indicator'), 'Step 3 indicator should show "3. Start"').toContainText('3. Start');
});
