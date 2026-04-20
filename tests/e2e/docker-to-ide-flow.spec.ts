/**
 * docker-to-ide-flow.spec.ts
 *
 * End-to-end test for the complete Docker-to-IDE user journey.
 *
 * Flow: Host Picker → Docker card → Step 1 Config → Step 2 Confirm
 *       → Step 3 Provision → AI Config → IDE Transition
 *
 * Related tickets:
 *   ticket-040  .tickets/ticket-040-docker-config-flow/prd.md
 *   ticket-031  .tickets/ticket-031-ai-config-after-docker/prd.md
 *   ticket-032  .tickets/ticket-032-auto-open-dashboard/prd.md
 *   ticket-034  .tickets/ticket-034-auto-transition-ide/prd.md
 *   ticket-042  .tickets/ticket-042-docker-to-ide-e2e-flow/prd.md
 */

import { test, expect, type FrameLocator, type Page } from './fixtures';
import { waitForHomePanelTab, getInnerFrame } from './test-utils';

// ─── Test environment defaults ────────────────────────────────────────────────
// Use these values when filling Step 1 config fields.
// bunny:latest is a lightweight local image; 18991 is the host binding port (avoids conflicts with default 18789).
const TEST_DOCKER_IMAGE = 'bunny:latest';
const TEST_GATEWAY_PORT = '18991';

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function openOccHomePanel(page: any): Promise<void> {
  await page.goto('/');
  await page.locator('.monaco-workbench').waitFor({ timeout: 30_000 });
  await waitForHomePanelTab(page);
}

async function clickDockerCard(page: Page): Promise<FrameLocator> {
  const frame = getInnerFrame(page);
  const dockerCard = frame.locator('[data-card="docker"]');
  await dockerCard.waitFor({ timeout: 20_000 });
  await dockerCard.click();
  await frame.locator('#docker-config-step-1').waitFor({ timeout: 20_000 });
  return frame;
}

/** Fill Step 1 fields with test-environment values before clicking Next. */
async function fillStep1Config(frame: FrameLocator): Promise<void> {
  await frame.locator('input[placeholder*="openclaw/pod"]').fill(TEST_DOCKER_IMAGE);
  await frame.locator('input[placeholder="18789"]').fill(TEST_GATEWAY_PORT);
}

async function advanceToStep2(frame: FrameLocator): Promise<void> {
  await frame.locator('button:has-text("Next")').click();
  await frame.locator('#docker-config-step-2').waitFor({ timeout: 20_000 });
}

async function advanceToStep3(frame: FrameLocator): Promise<void> {
  await fillStep1Config(frame);
  await advanceToStep2(frame);
  await frame.locator('button:has-text("Confirm & Start")').click();
  await frame.locator('#docker-config-step-3').waitFor({ timeout: 20_000 });
}

// ─── Step 1: Config form ──────────────────────────────────────────────────────

test.describe('Step 1: Docker config form (ticket-040)', () => {
  test('clicking Docker card shows full-page Step 1 (not a modal)', async ({ page }) => {
    await openOccHomePanel(page);
    const frame = await clickDockerCard(page);

    await expect(frame.locator('#docker-config-step-1'), 'Step 1 config should be visible (full-page, not modal)').toBeVisible();
    await expect(frame.locator('.modal, [role="dialog"]'), 'No modal dialog should be present').toHaveCount(0);
  });

  test('stepper shows all 3 step indicators', async ({ page }) => {
    await openOccHomePanel(page);
    const frame = await clickDockerCard(page);

    // Stepper items are generic divs — match by visible text
    await expect(frame.locator('text=1. Config').first(), '1. Config step should be visible').toBeVisible();
    await expect(frame.locator('text=2. Confirm').first(), '2. Confirm step should be visible').toBeVisible();
    await expect(frame.locator('text=3. Start').first(), '3. Start step should be visible').toBeVisible();
  });

  test('Step 1 indicator active (blue), Step 3 inactive', async ({ page }) => {
    await openOccHomePanel(page);
    const frame = await clickDockerCard(page);

    // Active step pill is blue (rgb 37 99 235); inactive steps use a darker background
    // Stepper pills have no IDs — select by their text content within the stepper row
    const stepper = frame.locator('#docker-config-step-1').locator('..').locator('..').first();
    await expect(stepper.locator('text=1. Config').first(), 'Step 1 config should be visible in stepper').toBeVisible();
    await expect(stepper.locator('text=3. Start').first(), 'Step 3 start should be visible in stepper').toBeVisible();
  });

  test('all config fields, Bind Address toggle, Browse, Next and Cancel are visible', async ({ page }) => {
    await openOccHomePanel(page);
    const frame = await clickDockerCard(page);

    // Fields use placeholder selectors — no IDs on inputs
    await expect(frame.locator('input[placeholder*="openclaw/pod"]'), 'Docker image field should be visible').toBeVisible();
    await expect(frame.locator('input[placeholder="18789"]'), 'Port field should be visible').toBeVisible();
    await expect(frame.locator('input[placeholder="Select a directory..."]'), 'Directory selection field should be visible').toBeVisible();
    await expect(frame.locator('input[type="checkbox"]'), 'Fresh build checkbox should be visible').toBeVisible();
    // Bind Address toggle (127.0.0.1 / 0.0.0.0 buttons)
    await expect(frame.locator('button:has-text("127.0.0.1")'), 'Bind address 127.0.0.1 button should be visible').toBeVisible();
    await expect(frame.locator('button:has-text("0.0.0.0")'), 'Bind address 0.0.0.0 button should be visible').toBeVisible();
    await expect(frame.locator('button:has-text("Browse")'), 'Browse button should be visible').toBeVisible();
    await expect(frame.locator('button:has-text("Next")'), 'Next button should be visible').toBeVisible();
    await expect(frame.locator('button:has-text("Cancel")'), 'Cancel button should be visible').toBeVisible();
  });

  test('Cancel returns to host picker with all 3 cards', async ({ page }) => {
    await openOccHomePanel(page);
    const frame = await clickDockerCard(page);

    await frame.locator('button:has-text("Cancel")').click();

    await expect(frame.locator('[data-card="docker"]'), 'Docker card should be visible in host picker').toBeVisible();
    await expect(frame.locator('[data-card="local"]'), 'Local card should be visible in host picker').toBeVisible();
    await expect(frame.locator('#docker-config-step-1'), 'Step 1 config should be removed after cancel').toHaveCount(0);
  });
});

// ─── Step 2: Confirm ──────────────────────────────────────────────────────────

test.describe('Step 2: Confirm config (ticket-040)', () => {
  test('Next shows Step 2 and removes Step 1 from DOM', async ({ page }) => {
    await openOccHomePanel(page);
    const frame = await clickDockerCard(page);
    await advanceToStep2(frame);

    await expect(frame.locator('#docker-config-step-2'), 'Step 2 should be visible after Next').toBeVisible();
    await expect(frame.locator('#docker-config-step-1'), 'Step 1 should be removed from DOM on Step 2').toHaveCount(0);
    await expect(frame.locator('#docker-config-step-3'), 'Step 3 should not be in DOM on Step 2').toHaveCount(0);
  });

  test('Step 2 shows all read-only confirm values and Confirm & Start button', async ({ page }) => {
    await openOccHomePanel(page);
    const frame = await clickDockerCard(page);
    await advanceToStep2(frame);

    // Confirm rows are generic divs — assert by label text presence
    await expect(frame.locator('text=Image').first(), 'Image field should be visible on Step 2').toBeVisible();
    await expect(frame.locator('text=Port').first(), 'Port field should be visible on Step 2').toBeVisible();
    await expect(frame.locator('text=Data Directory').first(), 'Data Directory field should be visible on Step 2').toBeVisible();
    await expect(frame.locator('text=Bind Address').first(), 'Bind Address field should be visible on Step 2').toBeVisible();
    await expect(frame.locator('text=Fresh Build').first(), 'Fresh Build field should be visible on Step 2').toBeVisible();
    await expect(frame.locator('button:has-text("Confirm & Start")'), 'Confirm & Start button should be visible').toBeVisible();
  });

  test('Step 2 stepper shows "2. Confirm" pill', async ({ page }) => {
    await openOccHomePanel(page);
    const frame = await clickDockerCard(page);
    await advanceToStep2(frame);

    await expect(frame.locator('text=2. Confirm').first(), '2. Confirm stepper pill should be visible').toBeVisible();
  });

  test('Back from Step 2 returns to Step 1', async ({ page }) => {
    await openOccHomePanel(page);
    const frame = await clickDockerCard(page);
    await advanceToStep2(frame);

    await frame.locator('button:has-text("Back")').click();

    await expect(frame.locator('#docker-config-step-1'), 'Step 1 should be visible after Back').toBeVisible();
    await expect(frame.locator('#docker-config-step-2'), 'Step 2 should be removed from DOM after Back').toHaveCount(0);
  });
});

// ─── Step 3: Provision ────────────────────────────────────────────────────────

test.describe('Step 3: Provision (ticket-040)', () => {
  test('Confirm shows Step 3 and provision output', async ({ page }) => {
    await openOccHomePanel(page);
    const frame = await clickDockerCard(page);
    await advanceToStep3(frame);

    await expect(frame.locator('#docker-config-step-3'), 'Step 3 provision panel should be visible').toBeVisible();
    await expect(frame.locator('#docker-config-step-1'), 'Step 1 should be removed from DOM').toHaveCount(0);
    await expect(frame.locator('#docker-config-step-2'), 'Step 2 should be removed from DOM').toHaveCount(0);

    // Provision log visible — rendered as a generic div (no ID/class on log element)
    // Assert via the status text shown below the log
    await expect(frame.locator('[role="status"]').first(), 'Provision status should be visible').toBeVisible();
  });

  test('Step 3 stepper shows "3. Start" pill', async ({ page }) => {
    await openOccHomePanel(page);
    const frame = await clickDockerCard(page);
    await advanceToStep3(frame);

    await expect(frame.locator('text=3. Start').first(), '3. Start stepper pill should be visible').toBeVisible();
  });
});

// ─── Post-Provision: Connect to Gateway ───────────────────────────────────────
// Requires a successful Docker provision (containers healthy).
// Tag: @slow — excluded from default CI run, run via: npx playwright test --grep @slow
//
// NOTE (ticket-031): The in-panel AI config step is not yet implemented.
// The current post-provision flow is: success screen → "Connect to Gateway →"
// button → gateway dashboard opens in a new browser tab at http://127.0.0.1:{port}/chat

test.describe('Post-provision: Connect to Gateway (ticket-031 pending) @slow', () => {
  test('Step 3 success shows Connect to Gateway button', async ({ page }) => {
    await openOccHomePanel(page);
    const frame = await clickDockerCard(page);
    await advanceToStep3(frame);

    // Wait for provision to complete (up to 5 min)
    await frame.locator('text=Docker environment is ready').waitFor({ timeout: 300_000 });
    await expect(frame.locator('button:has-text("Connect to Gateway")'), 'Connect to Gateway button should be visible after provision success').toBeVisible();
  });

  test('Connect to Gateway opens gateway dashboard in new tab', async ({ page }) => {
    await openOccHomePanel(page);
    const frame = await clickDockerCard(page);
    await advanceToStep3(frame);
    await frame.locator('text=Docker environment is ready').waitFor({ timeout: 300_000 });

    const [newTab] = await Promise.all([
      page.context().waitForEvent('page'),
      frame.locator('button:has-text("Connect to Gateway")').click(),
    ]);

    await newTab.waitForLoadState('domcontentloaded');
    // Gateway dashboard URL includes the configured port
    expect(newTab.url()).toContain(`:${TEST_GATEWAY_PORT}/`);
  });

  test('Gateway dashboard pre-fills WebSocket URL with configured port', async ({ page }) => {
    await openOccHomePanel(page);
    const frame = await clickDockerCard(page);
    await advanceToStep3(frame);
    await frame.locator('text=Docker environment is ready').waitFor({ timeout: 300_000 });

    const [newTab] = await Promise.all([
      page.context().waitForEvent('page'),
      frame.locator('button:has-text("Connect to Gateway")').click(),
    ]);
    await newTab.waitForLoadState('domcontentloaded');

    // WebSocket URL field is pre-filled with the port configured in Step 1
    const wsInput = newTab.locator('input[placeholder*="ws://"]');
    await expect(wsInput, 'WebSocket URL should include configured gateway port').toHaveValue(new RegExp(TEST_GATEWAY_PORT));
  });

  // ── ticket-031: AI config panel (NOT YET IMPLEMENTED) ──────────────────────
  // When ticket-031 ships, the in-panel AI config step should appear
  // automatically after provision instead of (or before) "Connect to Gateway".
  // At that point re-enable these tests:

  test.todo('AI config panel appears automatically after provision succeeds (ticket-031)');
  test.todo('provider dropdown has 5 options (ticket-031)');
  test.todo('API key input has password type and show/hide toggle (ticket-031)');
  test.todo('Skip closes OCC Home panel (ticket-034)');
  test.todo('Finish Setup closes panel and opens Void sidebar (ticket-034)');
});

// ─── Post-completion: Status page stability (ticket-052) ──────────────────────
// Regression coverage for the "flicker back to step 1" bug. After the gateway
// connect step:
//   1. The Status page (Gateway row, etc.) must be visible.
//   2. The host-picker (Local/Docker/SSH cards) must NOT be visible.
//   3. Toggling the webview tab away and back must not re-render the host-picker.
//
// Matches acceptance criteria in .tickets/ticket-052-docker-setup-flicker-reset/prd.md §2.3.
// Tag @slow — excluded from default CI, gated behind a healthy gateway container.

test.describe('Post-completion: Status page stability (ticket-052) @slow', () => {
  /**
   * Drive the wizard to completion and wait past the detection hand-off.
   * Navigator's fix replaces the old `setTimeout(_showStatusPanel, 1800)` with
   * a dispatch of `openclaw.home.refresh`, which re-enters detection. The
   * 1800ms delay is preserved so the "Setup complete!" message stays visible.
   * We wait ~2.5s after clicking Connect to cover that delay plus the
   * detection re-entry render.
   */
  async function completeWizardAndWaitForDetection(page: Page): Promise<FrameLocator> {
    await openOccHomePanel(page);
    const frame = await clickDockerCard(page);
    await advanceToStep3(frame);
    await frame.locator('text=Docker environment is ready').waitFor({ timeout: 300_000 });
    await frame.locator('button:has-text("Connect to Gateway")').click();
    // 1800ms handoff + safety margin for detection re-entry.
    await page.waitForTimeout(2500);
    return frame;
  }

  test('After gateway connect, Status page is rendered (no host-picker)', async ({ page }) => {
    const frame = await completeWizardAndWaitForDetection(page);

    // The Status page renders a "Gateway" row (see statusHtml.ts:1012). Use
    // text-based selectors — statusHtml does not expose `data-testid` hooks
    // and this spec should not fabricate them (ticket-052 scope is narrow).
    await expect(
      frame.locator('text=Gateway').first(),
      'Status page Gateway row should be visible after detection hand-off',
    ).toBeVisible({ timeout: 20_000 });

    // Host-picker cards must be absent — they are the "flicker" symptom.
    await expect(
      frame.locator('[data-card="docker"]'),
      'Docker host-picker card must NOT appear on the Status page',
    ).toHaveCount(0);
    await expect(
      frame.locator('[data-card="local"]'),
      'Local host-picker card must NOT appear on the Status page',
    ).toHaveCount(0);

    // Step 1 config panel must also be absent — a different surface of the
    // same "reset to step 1" regression the old condition caused.
    await expect(
      frame.locator('#docker-config-step-1'),
      'Docker config Step 1 must NOT appear on the Status page',
    ).toHaveCount(0);
  });

  test('Status page stable across webview tab hide/show', async ({ page }) => {
    const frame = await completeWizardAndWaitForDetection(page);

    // Confirm we start on the Status page.
    await expect(frame.locator('text=Gateway').first()).toBeVisible({ timeout: 20_000 });

    // Toggle the OCC Home tab away by opening the Welcome page / another
    // editor tab, then bring OCC Home back. This exercises
    // `onDidChangeViewState` — the pathway that previously triggered the
    // host-picker re-render via `_update()` when `isDockerRunning` was true.
    const homeTab = page.locator('[role="tab"]').filter({ hasText: /OCC Home|Home/ }).first();

    // Open a new untitled editor to push the OCC Home tab off-screen.
    await page.keyboard.press('Control+N').catch(() => null);
    await page.waitForTimeout(500);
    // Return focus to the OCC Home tab — triggers onDidChangeViewState(visible=true).
    await homeTab.click().catch(() => null);
    await page.waitForTimeout(2000);

    // Re-assert Status page still visible and host-picker still absent.
    await expect(
      frame.locator('text=Gateway').first(),
      'Status page Gateway row should still be visible after tab toggle',
    ).toBeVisible({ timeout: 20_000 });
    await expect(
      frame.locator('[data-card="docker"]'),
      'Host-picker must NOT reappear after webview visibility toggle',
    ).toHaveCount(0);
    await expect(
      frame.locator('#docker-config-step-1'),
      'Docker config Step 1 must NOT reappear after webview visibility toggle',
    ).toHaveCount(0);
  });
});
