import { test, expect } from '@playwright/test';

/**
 * OpenClaw home panel tests.
 *
 * The panel auto-opens when the extension activates (~12–15 s after startup).
 *
 * Iframe nesting in VS Code server mode:
 *   iframe.webview              (outer VS Code webview shell, cross-origin vscode-cdn.net)
 *     └── iframe#active-frame  (inner — actual panel HTML, same content)
 *
 * Playwright's frameLocator chains work across origins via CDP.
 */

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.locator('.monaco-workbench').waitFor({ timeout: 30_000 });
});

/** Open (or reveal) the OCC Home panel and wait for its tab to be visible. */
async function waitForHomePanelTab(page: import('@playwright/test').Page) {
  const tab = page.locator('[role="tab"]').filter({ hasText: 'OCC Home' });

  // The panel auto-opens ~12–15 s after workbench loads. If it hasn't appeared
  // yet (e.g. under load), trigger it explicitly with the keyboard shortcut
  // after stealing focus back from any webview.
  const autoOpen = tab.waitFor({ timeout: 25_000 }).catch(() => null);
  await autoOpen;

  if (!await tab.isVisible()) {
    // Move focus to VS Code chrome so Ctrl+Alt+H reaches the workbench.
    await page.locator('.activitybar').click();
    await page.keyboard.press('Control+Alt+H');
  }

  await tab.waitFor({ timeout: 20_000 });
}

test('home panel command appears in command palette', async ({ page }) => {
  // The home panel auto-opens and captures keyboard focus.
  // Click the activity bar to move focus out of the webview before pressing F1.
  await page.locator('.activitybar').click();

  await page.keyboard.press('F1');
  await page.locator('.quick-input-widget').waitFor({ timeout: 10_000 });
  await page.keyboard.type('OpenClaw: Home');
  // At least one result whose label is "OpenClaw: Home"
  await expect(
    page.locator('.quick-input-list .monaco-list-row').first(),
  ).toBeVisible({ timeout: 5_000 });
  await page.keyboard.press('Escape');
});

test('home panel opens and an iframe is present', async ({ page }) => {
  // Panel opens automatically — wait for the tab then check for the webview iframe
  await waitForHomePanelTab(page);
  const webviewIframe = page.locator('iframe.webview');
  await expect(webviewIframe).toBeAttached({ timeout: 10_000 });
});

test('home panel renders setup UI', async ({ page }) => {
  await waitForHomePanelTab(page);

  // Outer VS Code webview shell
  const outerFrame = page.frameLocator('iframe.webview').first();
  // VS Code wraps webview content in a second iframe inside the shell
  const innerFrame = outerFrame.frameLocator('iframe#active-frame');

  // The panel renders one of two states depending on workspace state:
  //   • Fresh/picker state: h1 "Welcome to OpenClaw" + .card host-picker cards
  //   • Configured state (e.g. docker binding set): div.setup-title "Set up OpenClaw"
  // Either is valid — just verify the panel rendered something meaningful.
  const panelContent = innerFrame.locator('h1, .setup-title, #panel-bootstrap-choice');
  await panelContent.first().waitFor({ timeout: 30_000 });
  await expect(panelContent.first()).toBeVisible();
});

test('home panel host picker cards are clickable', async ({ page }) => {
  await waitForHomePanelTab(page);

  const outerFrame = page.frameLocator('iframe.webview').first();
  const innerFrame = outerFrame.frameLocator('iframe#active-frame');

  // If the panel is in picker state, click the first host card and verify the
  // iframe stays attached.  If workspace state already has a binding (e.g.
  // docker-setup tests ran first), the panel shows a setup wizard without
  // .card elements — just confirm the iframe is still attached.
  const hasCards = await innerFrame.locator('.card').first()
    .waitFor({ timeout: 15_000 })
    .then(() => true)
    .catch(() => false);

  if (hasCards) {
    await innerFrame.locator('.card').first().click();
  }

  await expect(page.locator('iframe.webview')).toBeAttached();
});
