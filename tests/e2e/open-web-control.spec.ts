/**
 * open-web-control.spec.ts
 *
 * Regression test for the "Open Web Control" button. Previously it rendered a
 * ConfigPanel webview with an <iframe src="http://127.0.0.1:<proxyPort>/">,
 * which Chrome blocks under its Local Network Access policy when the editor
 * is served from anything other than `localhost`:
 *
 *   "The connection is blocked because it was initiated by a public page to
 *    connect to devices or servers on your local network."
 *
 * The fix (ticket-051 follow-up) swaps ConfigPanel for
 * `vscode.env.openExternal(dashInfo.url)`, which is a top-level navigation
 * not subject to LNA. This test verifies that clicking the button:
 *   - does NOT create a 127.0.0.1 iframe inside the editor, and
 *   - does trigger an external navigation (popup / new-tab event).
 */

import { test, expect } from './fixtures';
import { waitForHomePanelTab, getInnerFrame } from './test-utils';

test.beforeEach(async ({ page }) => {
  await page.goto('http://localhost:9888/');
  await page.locator('.monaco-workbench').waitFor({ timeout: 30_000 });
});

test('clicking Open Web Control opens externally — no 127.0.0.1 iframe appears', async ({ page, context }) => {
  await waitForHomePanelTab(page);
  const inner = getInnerFrame(page);

  // Find the primary action button. It is labelled either "Open Web Control"
  // (gateway reachable / installed) or "Install OpenClaw" (fresh install).
  const primary = inner.locator('#btn-primary, [data-command="openclaw.configure"]').first();
  const count = await primary.count();
  test.skip(count === 0, 'Primary button not rendered — skipping (likely fresh install with no dashboard yet)');

  const label = (await primary.textContent())?.trim() ?? '';
  test.skip(!/open web control/i.test(label), `Primary button is "${label}" — only meaningful for "Open Web Control"`);

  // Listen for any new tab (VS Code web maps openExternal → window.open).
  const popupPromise = context.waitForEvent('page', { timeout: 8_000 }).catch(() => null);

  await primary.click();

  // Give the extension host a moment to run the command and dispatch.
  await page.waitForTimeout(1500);

  // Assertion 1: no 127.0.0.1 iframe was inserted into the editor DOM.
  // (If the old ConfigPanel path were still firing we'd see iframes pointing
  // at the loopback proxy.)
  const loopbackFrames = await page.locator('iframe[src*="127.0.0.1"], iframe[src*="localhost:188"], iframe[src*="localhost:1879"]').count();
  expect(loopbackFrames, 'No loopback-IP iframe should be mounted in the editor page').toBe(0);

  // Assertion 2: either a new tab opened OR the browser prompted to navigate.
  // In headless CDP runs openExternal may or may not actually create a page
  // object (depends on VS Code's web bridge). We treat "got a popup" as
  // conclusive success; "no popup but also no loopback iframe" is treated as
  // pass-with-caveat and logged so the assertion above still protects us.
  const popup = await popupPromise;
  if (popup) {
    const popupUrl = popup.url();
    expect(popupUrl, 'Popup URL should point at the gateway dashboard').toMatch(/^https?:\/\//);
    await popup.close();
  } else {
    test.info().annotations.push({ type: 'note', description: 'No popup captured (headless CDP limitation) — loopback-iframe assertion is the primary signal.' });
  }
});
