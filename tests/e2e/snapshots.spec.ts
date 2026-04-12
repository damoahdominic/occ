import { test, expect } from './fixtures';
import { waitForHomePanelTab, getInnerFrame } from './test-utils';

/**
 * Visual regression snapshot tests for the OCC editor.
 *
 * On the first run these tests will generate baseline screenshots — that is
 * expected behaviour.  Subsequent runs compare against those baselines using
 * the tolerances configured in playwright.config.ts (maxDiffPixels, threshold).
 *
 * Iframe nesting in VS Code server mode:
 *   iframe.webview              (outer VS Code webview shell, cross-origin vscode-cdn.net)
 *     └── iframe#active-frame  (inner — actual panel HTML, same content)
 */

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.locator('.monaco-workbench').waitFor({ timeout: 30_000 });
});

test('workbench loads and renders correctly', async ({ page }) => {
  // The workbench is already confirmed visible in beforeEach; give any
  // in-progress animations a moment to settle before snapping.
  await page.locator('.monaco-workbench').waitFor({ state: 'visible' });

  await expect(page, 'Workbench snapshot should match baseline').toHaveScreenshot('workbench-loaded.png', {
    animations: 'disabled',
    maxDiffPixels: 100,
  });
});

test('home panel install wizard snapshot', async ({ page }) => {
  await waitForHomePanelTab(page);

  const innerFrame = getInnerFrame(page);

  // The panel may render as a host-picker (h1) or a setup wizard (div.setup-title)
  // depending on workspace state — wait for whichever appears first.
  const panelContent = innerFrame.locator('h1, .setup-title, #panel-bootstrap-choice');
  await panelContent.first().waitFor({ timeout: 30_000 });

  await expect(innerFrame.locator('body'), 'Home panel wizard snapshot should match baseline').toHaveScreenshot('home-panel-wizard.png', {
    animations: 'disabled',
    maxDiffPixels: 100,
  });
});

test('docker card setup view snapshot', async ({ page }) => {
  await waitForHomePanelTab(page);

  const innerFrame = getInnerFrame(page);

  // If workspace state has a 'docker' binding the panel opens directly on
  // bootstrap choice — skip the card click in that case.
  const alreadyAtBootstrap = await innerFrame.locator('#btn-choose-docker')
    .isVisible()
    .catch(() => false);

  if (!alreadyAtBootstrap) {
    // Ensure the wizard cards are rendered before interacting
    const dockerCard = innerFrame.locator('.card').nth(1);
    await dockerCard.waitFor({ timeout: 30_000 });

    // Clicking the Docker card executes openclaw.host.setup.docker which
    // disposes the current panel and creates a new one — wait for the tab
    // to disappear then reappear before looking for content.
    await dockerCard.click();
    const tab = page.locator('[role="tab"]').filter({ hasText: 'OCC Home' });
    await tab.waitFor({ state: 'hidden', timeout: 15_000 }).catch(() => null);
    await tab.waitFor({ state: 'visible', timeout: 30_000 });
  }

  // Wait for the Docker setup choice panel to load inside the (new) inner frame
  const newInnerFrame = getInnerFrame(page);
  await newInnerFrame.locator('#btn-choose-docker').waitFor({ timeout: 20_000 });

  await expect(newInnerFrame.locator('body'), 'Docker setup choice snapshot should match baseline').toHaveScreenshot('docker-setup-choice.png', {
    animations: 'disabled',
    maxDiffPixels: 100,
  });
});
