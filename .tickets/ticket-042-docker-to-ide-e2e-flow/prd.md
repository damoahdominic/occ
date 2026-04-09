# ticket-042: Docker-to-IDE End-to-End User Flow

## Related Tickets

- [ticket-040](../ticket-040-docker-config-flow/prd.md) — Docker 3-step config flow (Config → Confirm → Provision)
- [ticket-031](../ticket-031-ai-config-after-docker/prd.md) — AI model configuration panel after Docker provision
- [ticket-032](../ticket-032-auto-open-dashboard/prd.md) — Auto-open web control dashboard after provision
- [ticket-034](../ticket-034-auto-transition-ide/prd.md) — Auto-transition to IDE experience after setup

## Problem Statement

The full Docker-to-IDE user journey spans four tickets (040, 031, 032, 034) but has no single E2E test covering the complete path. Individual unit tests verify each panel in isolation — there is no test that walks a user from clicking the Docker card all the way through to the IDE being open and ready.

## Scope

Document and test the complete post-docker-setup flow as a single E2E spec. The test suite should be runnable via Playwright with any of the three supported browser backends:

- **Local headless Chromium** — `npx playwright test`
- **CDP MCP** — via `chrome-devtools-mcp-wrapper` connecting to a running Chrome on port 9225
- **playwright-novnc MCP** — via `mcp__playwright-novnc__browser_*` tools in Claude Code

## Full User Flow

```
OCC Home Panel
  └─ Host Picker (Docker / Local / SSH cards)
       └─ [Click Docker card]
            └─ Step 1: Config
            │    ├─ GATEWAY_IMAGE field (editable)
            │    ├─ GATEWAY_PORT field (editable)
            │    ├─ OPENCLAW_DATA_DIR field + Browse button
            │    ├─ FRESH_BUILD checkbox
            │    ├─ Stepper shows: [1. Config●] [2. Confirm] [3. Start]
            │    └─ [Click Next]
            └─ Step 2: Confirm
            │    ├─ All 4 fields read-only
            │    ├─ Stepper shows: [1. Config✓] [2. Confirm●] [3. Start]
            │    ├─ [Click Back] → returns to Step 1
            │    └─ [Click Confirm]
            └─ Step 3: Provision
            │    ├─ docker compose pull + up -d running
            │    ├─ Streaming log visible
            │    ├─ Stepper shows: [1. Config✓] [2. Confirm✓] [3. Start●]
            │    └─ Gateway health poll → "Docker environment is ready!"
            └─ Post-Provision
                 ├─ Web control dashboard auto-opens in browser (2s delay)
                 ├─ AI Config panel slides in automatically
                 │    ├─ Provider dropdown (Anthropic/OpenAI/Google/Groq/OpenRouter)
                 │    ├─ API key input with show/hide toggle
                 │    ├─ [Click Finish Setup] → writes openclaw.json → IDE transition
                 │    └─ [Click Skip for now] → IDE transition without AI sidebar
                 └─ IDE Transition
                      ├─ OCC Home panel closes
                      ├─ OpenClaw workspace folder opens
                      ├─ Void AI chat sidebar opens (only if AI configured)
                      └─ Welcome notification shown (only if AI configured)
```

## Acceptance Criteria

### Docker Config Steps (ticket-040)
- [ ] Clicking Docker card renders `#docker-config-step-1` (not a modal)
- [ ] Stepper shows all 3 indicators: `#config-step-1-indicator`, `#config-step-2-indicator`, `#config-step-3-indicator`
- [ ] Step 1 indicator has active background (`rgb(37, 99, 235)`)
- [ ] All 4 fields visible: `#config-gateway-image`, `#config-gateway-port`, `#config-data-dir`, `#config-fresh-build`
- [ ] "Next" advances to `#docker-config-step-2`; Step 1 removed from DOM
- [ ] "Back" from Step 2 returns to `#docker-config-step-1`; Step 2 removed from DOM
- [ ] "Cancel" from Step 1 returns to host picker with all 3 cards visible
- [ ] "Confirm" in Step 2 advances to `#docker-config-step-3`

### Provision Step (ticket-040 Step 3)
- [ ] `#docker-config-step-3` visible after Confirm
- [ ] `#provision-log` or equivalent streaming output visible
- [ ] Provision completes with success state

### Post-Provision AI Config (ticket-031)
- [ ] `#panel-ai-config` appears automatically after provision succeeds
- [ ] `#ai-provider-select` dropdown has 5 options
- [ ] API key `<input type="password">` visible with toggle button
- [ ] "Finish Setup" button writes config and begins IDE transition
- [ ] "Skip for now" button triggers IDE transition without AI config

### IDE Transition (ticket-034)
- [ ] OCC Home panel/tab closes after Finish or Skip
- [ ] Workspace folder opens (VS Code `vscode.openFolder` fires)
- [ ] Void sidebar visible when AI was configured
- [ ] Welcome notification visible when AI was configured

### Dashboard Auto-Open (ticket-032)
- [ ] `openclaw.configure` command fires 2s after provision succeeds (observable via command execution or browser open event)

## BDD Specification

```gherkin
Feature: Docker-to-IDE Complete User Flow
  As a new OCC user
  I want to set up Docker and configure my AI provider
  So that I can start using the AI-powered IDE immediately

  Background:
    Given the OCC Home panel is open in VS Code
    And the "OCC Home" tab is visible
    And the webview inner frame is loaded

  # ─── DOCKER CONFIG FLOW ───────────────────────────────────────────

  Scenario: Navigate to Docker config from host picker
    Given the host picker shows Docker, Local, and SSH cards
    When I click the Docker card
    Then Step 1 config page is shown full-page (not a modal)
    And the stepper shows indicators: "1. Config", "2. Confirm", "3. Start"
    And the Step 1 indicator has the active blue background
    And Step 2 and Step 3 indicators have inactive dark backgrounds

  Scenario: Step 1 shows all 4 config fields
    Given I am on Step 1 of the Docker config
    Then the Gateway Image field is visible and editable
    And the Gateway Port field is visible and editable
    And the Data Directory field is visible and editable
    And the Browse button is visible next to Data Directory
    And the Fresh Build checkbox is visible
    And the "Next" button is visible
    And the "Cancel" button is visible

  Scenario: Cancel from Step 1 returns to host picker
    Given I am on Step 1 of the Docker config
    When I click Cancel
    Then the host picker is shown
    And the Docker card, Local card, and SSH card are all visible
    And the Step 1 config page is not in the DOM

  Scenario: Next advances to Step 2 confirm
    Given I am on Step 1 of the Docker config
    When I click Next
    Then Step 2 confirm page is shown
    And Step 1 is removed from the DOM
    And all 4 config values are displayed as read-only
    And the Step 2 indicator has the active blue background
    And the "Confirm" button is visible
    And the "Back" button is visible

  Scenario: Back from Step 2 returns to Step 1
    Given I am on Step 2 of the Docker config
    When I click Back
    Then Step 1 config page is shown again
    And Step 2 is removed from the DOM

  Scenario: Confirm advances to Step 3 provision
    Given I am on Step 2 of the Docker config
    When I click Confirm
    Then Step 3 provision page is shown
    And Step 2 is removed from the DOM
    And the Step 3 indicator has the active blue background
    And a provision log or progress indicator is visible

  # ─── PROVISION & POST-PROVISION ───────────────────────────────────

  Scenario: Provision completes and AI config appears
    Given Docker compose provision has completed successfully
    Then "Docker environment is ready!" message is shown
    And within 5 seconds the AI config panel appears automatically
    And the Step 1 and Step 2 provision panel is hidden

  Scenario: AI config panel has all required elements
    Given the AI config panel is visible
    Then the provider dropdown shows 5 options:
      | Anthropic  |
      | OpenAI     |
      | Google     |
      | Groq       |
      | OpenRouter |
    And a password input for the API key is visible
    And a show/hide toggle button is visible next to the API key input
    And the "Finish Setup" button is visible
    And the "Skip for now" button is visible

  Scenario: Finish Setup with AI configured transitions to IDE
    Given the AI config panel is visible
    And I have selected a provider and entered an API key
    When I click "Finish Setup"
    Then the OCC Home panel closes
    And the OpenClaw workspace folder opens in VS Code
    And the Void AI chat sidebar becomes visible
    And a welcome notification is shown

  Scenario: Skip for now transitions to IDE without AI sidebar
    Given the AI config panel is visible
    When I click "Skip for now"
    Then the OCC Home panel closes
    And the OpenClaw workspace folder opens in VS Code
    And the Void AI chat sidebar is NOT opened
    And no welcome notification is shown

  # ─── DASHBOARD AUTO-OPEN ──────────────────────────────────────────

  Scenario: Web control dashboard opens automatically after provision
    Given Docker compose provision has completed successfully
    When 2 seconds have elapsed
    Then the openclaw.configure command has been executed
    And the web control dashboard is open in the system browser
```

## Playwright / CDP / novnc MCP Test Spec

The spec below can run in any of the three modes:

| Mode | How to run |
|---|---|
| Headless Chromium | `npx playwright test tests/e2e/docker-to-ide-flow.spec.ts` |
| CDP (Chrome on :9225) | `npx playwright test tests/e2e/docker-to-ide-flow.spec.ts` (auto-detected) |
| novnc MCP | Run steps manually via `mcp__playwright-novnc__browser_*` tools |

```typescript
/**
 * docker-to-ide-flow.spec.ts
 *
 * End-to-end test for the complete Docker-to-IDE user journey.
 *
 * Flow: Host Picker → Docker card → Step 1 Config → Step 2 Confirm
 *       → Step 3 Provision → AI Config → IDE Transition
 *
 * Related tickets:
 *   ticket-040  docker-config-flow/prd.md
 *   ticket-031  ai-config-after-docker/prd.md
 *   ticket-032  auto-open-dashboard/prd.md
 *   ticket-034  auto-transition-ide/prd.md
 */

import { test, expect, type Page, type FrameLocator } from './fixtures';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getInnerFrame(page: Page): FrameLocator {
  return page.frameLocator('iframe.webview').first().frameLocator('iframe#active-frame');
}

async function openOccHomePanel(page: Page): Promise<void> {
  await page.goto('/');
  await page.locator('.monaco-workbench').waitFor({ timeout: 30_000 });
  await page.keyboard.press('F1');
  await page.locator('.quick-input-widget').waitFor({ timeout: 10_000 });
  await page.keyboard.type('OpenClaw: Home');
  await page.locator('.quick-input-list .monaco-list-row').first().click();
  await page.locator('[role="tab"]').filter({ hasText: 'OCC Home' }).waitFor({ timeout: 30_000 });
}

async function clickDockerCard(page: Page): Promise<FrameLocator> {
  const frame = getInnerFrame(page);
  const dockerCard = frame.locator('[data-card="docker"]');
  await dockerCard.waitFor({ timeout: 20_000 });
  await dockerCard.click();
  await frame.locator('#docker-config-step-1').waitFor({ timeout: 20_000 });
  return frame;
}

async function advanceToStep2(frame: FrameLocator): Promise<void> {
  await frame.locator('button:has-text("Next")').click();
  await frame.locator('#docker-config-step-2').waitFor({ timeout: 20_000 });
}

async function advanceToStep3(frame: FrameLocator): Promise<void> {
  await advanceToStep2(frame);
  await frame.locator('button:has-text("Confirm")').click();
  await frame.locator('#docker-config-step-3').waitFor({ timeout: 20_000 });
}

// ─── Step 1: Config ───────────────────────────────────────────────────────────

test.describe('Step 1: Docker config form', () => {
  test('clicking Docker card shows Step 1 full-page (not a modal)', async ({ page }) => {
    await openOccHomePanel(page);
    const frame = await clickDockerCard(page);

    await expect(frame.locator('#docker-config-step-1')).toBeVisible();
    // No modal overlay — step 1 is a full-page render
    await expect(frame.locator('.modal, [role="dialog"]')).toHaveCount(0);
  });

  test('stepper shows all 3 step indicators', async ({ page }) => {
    await openOccHomePanel(page);
    const frame = await clickDockerCard(page);

    await expect(frame.locator('#config-step-1-indicator')).toContainText('1. Config');
    await expect(frame.locator('#config-step-2-indicator')).toContainText('2. Confirm');
    await expect(frame.locator('#config-step-3-indicator')).toContainText('3. Start');
  });

  test('Step 1 indicator is active (blue), others inactive', async ({ page }) => {
    await openOccHomePanel(page);
    const frame = await clickDockerCard(page);

    await expect(frame.locator('#config-step-1-indicator')).toHaveCSS('background-color', /rgb\(37,\s*99,\s*235\)/);
    await expect(frame.locator('#config-step-2-indicator')).toHaveCSS('background-color', /rgb\(26,\s*26,\s*26\)/);
    await expect(frame.locator('#config-step-3-indicator')).toHaveCSS('background-color', /rgb\(26,\s*26,\s*26\)/);
  });

  test('all 4 config fields are visible', async ({ page }) => {
    await openOccHomePanel(page);
    const frame = await clickDockerCard(page);

    await expect(frame.locator('#config-gateway-image')).toBeVisible();
    await expect(frame.locator('#config-gateway-port')).toBeVisible();
    await expect(frame.locator('#config-data-dir')).toBeVisible();
    await expect(frame.locator('#config-fresh-build')).toBeVisible();
    await expect(frame.locator('button:has-text("Browse")')).toBeVisible();
  });

  test('Cancel returns to host picker', async ({ page }) => {
    await openOccHomePanel(page);
    const frame = await clickDockerCard(page);

    await frame.locator('button:has-text("Cancel")').click();

    await expect(frame.locator('[data-card="docker"]')).toBeVisible();
    await expect(frame.locator('[data-card="local"]')).toBeVisible();
    await expect(frame.locator('#docker-config-step-1')).toHaveCount(0);
  });
});

// ─── Step 2: Confirm ──────────────────────────────────────────────────────────

test.describe('Step 2: Confirm config', () => {
  test('Next advances to Step 2 and removes Step 1 from DOM', async ({ page }) => {
    await openOccHomePanel(page);
    const frame = await clickDockerCard(page);
    await advanceToStep2(frame);

    await expect(frame.locator('#docker-config-step-2')).toBeVisible();
    await expect(frame.locator('#docker-config-step-1')).toHaveCount(0);
    await expect(frame.locator('#docker-config-step-3')).toHaveCount(0);
  });

  test('Step 2 shows read-only confirm values', async ({ page }) => {
    await openOccHomePanel(page);
    const frame = await clickDockerCard(page);
    await advanceToStep2(frame);

    await expect(frame.locator('#confirm-image')).toBeVisible();
    await expect(frame.locator('#confirm-port')).toBeVisible();
    await expect(frame.locator('#confirm-data-dir')).toBeVisible();
    await expect(frame.locator('#confirm-fresh-build')).toBeVisible();
  });

  test('Step 2 indicator is active', async ({ page }) => {
    await openOccHomePanel(page);
    const frame = await clickDockerCard(page);
    await advanceToStep2(frame);

    await expect(frame.locator('#config-step-2-indicator')).toHaveCSS('background-color', /rgb\(37,\s*99,\s*235\)/);
  });

  test('Back from Step 2 returns to Step 1', async ({ page }) => {
    await openOccHomePanel(page);
    const frame = await clickDockerCard(page);
    await advanceToStep2(frame);

    await frame.locator('button:has-text("Back")').click();

    await expect(frame.locator('#docker-config-step-1')).toBeVisible();
    await expect(frame.locator('#docker-config-step-2')).toHaveCount(0);
  });
});

// ─── Step 3: Provision ────────────────────────────────────────────────────────

test.describe('Step 3: Provision', () => {
  test('Confirm advances to Step 3 and shows provision output', async ({ page }) => {
    await openOccHomePanel(page);
    const frame = await clickDockerCard(page);
    await advanceToStep3(frame);

    await expect(frame.locator('#docker-config-step-3')).toBeVisible();
    await expect(frame.locator('#docker-config-step-1')).toHaveCount(0);
    await expect(frame.locator('#docker-config-step-2')).toHaveCount(0);

    // Provision log or progress indicator should be visible
    const log = frame.locator('#provision-log, .provision-log, [data-testid="provision-output"]');
    await expect(log.first()).toBeVisible();
  });

  test('Step 3 indicator is active during provision', async ({ page }) => {
    await openOccHomePanel(page);
    const frame = await clickDockerCard(page);
    await advanceToStep3(frame);

    await expect(frame.locator('#config-step-3-indicator')).toHaveCSS('background-color', /rgb\(37,\s*99,\s*235\)/);
  });
});

// ─── Post-Provision: AI Config ────────────────────────────────────────────────

test.describe('Post-provision: AI config panel (ticket-031)', () => {
  // NOTE: These tests require a successful Docker provision.
  // In CI, mock the provisionStatus message to simulate success.

  test('AI config panel appears automatically after provision succeeds', async ({ page }) => {
    await openOccHomePanel(page);
    const frame = getInnerFrame(page);

    // Simulate provision success via CDP console injection or wait for real provision
    // In real run: wait for provision to complete (up to 5 min)
    // In mock run: inject provisionStatus done:ok message
    await frame.locator('#panel-ai-config').waitFor({ state: 'visible', timeout: 300_000 });

    await expect(frame.locator('#panel-ai-config')).toBeVisible();
    await expect(frame.locator('#docker-config-step-3')).toBeHidden();
  });

  test('AI config panel has provider dropdown with 5 options', async ({ page }) => {
    await openOccHomePanel(page);
    const frame = getInnerFrame(page);
    await frame.locator('#panel-ai-config').waitFor({ state: 'visible', timeout: 300_000 });

    const select = frame.locator('#ai-provider-select');
    await expect(select).toBeVisible();

    const options = await select.locator('option').allTextContents();
    expect(options).toContain('Anthropic');
    expect(options).toContain('OpenAI');
    expect(options).toContain('Google');
    expect(options).toContain('Groq');
    expect(options).toContain('OpenRouter');
  });

  test('API key input has show/hide toggle', async ({ page }) => {
    await openOccHomePanel(page);
    const frame = getInnerFrame(page);
    await frame.locator('#panel-ai-config').waitFor({ state: 'visible', timeout: 300_000 });

    const keyInput = frame.locator('input[type="password"]');
    const toggleBtn = frame.locator('#ai-key-toggle, button:has-text("Show"), button:has-text("Hide")');

    await expect(keyInput).toBeVisible();
    await expect(toggleBtn.first()).toBeVisible();
  });

  test('Skip for now closes OCC Home panel', async ({ page }) => {
    await openOccHomePanel(page);
    const frame = getInnerFrame(page);
    await frame.locator('#panel-ai-config').waitFor({ state: 'visible', timeout: 300_000 });

    await frame.locator('button:has-text("Skip for now")').click();

    // OCC Home tab should close (panel disposed)
    await expect(
      page.locator('[role="tab"]').filter({ hasText: 'OCC Home' })
    ).toHaveCount(0, { timeout: 10_000 });
  });

  test('Finish Setup closes OCC Home panel and opens chat sidebar', async ({ page }) => {
    await openOccHomePanel(page);
    const frame = getInnerFrame(page);
    await frame.locator('#panel-ai-config').waitFor({ state: 'visible', timeout: 300_000 });

    // Select a provider and enter a test API key
    await frame.locator('#ai-provider-select').selectOption('Anthropic');
    await frame.locator('input[type="password"]').fill('sk-test-key-1234');

    await frame.locator('button:has-text("Finish Setup")').click();

    // OCC Home panel closes
    await expect(
      page.locator('[role="tab"]').filter({ hasText: 'OCC Home' })
    ).toHaveCount(0, { timeout: 10_000 });

    // Void sidebar should open
    await expect(
      page.locator('.void-sidebar, [data-viewlet-id*="void"], .void-chat')
    ).toBeVisible({ timeout: 15_000 });
  });
});
```

## novnc MCP Manual Test Script

For manual testing via `mcp__playwright-novnc__browser_*` tools in Claude Code:

```
1. browser_navigate → http://localhost:9888/?workspace=/root/.occ/My%20OpenClaw%20Workspace.code-workspace
2. browser_snapshot  → verify .monaco-workbench loaded
3. browser_press_key → F1
4. browser_type      → "OpenClaw: Home"
5. browser_click     → first .monaco-list-row
6. browser_snapshot  → verify "OCC Home" tab visible
7. browser_click     → [data-card="docker"] inside inner iframe
8. browser_snapshot  → verify #docker-config-step-1 visible
9. browser_click     → Next button
10. browser_snapshot → verify #docker-config-step-2 visible
11. browser_click    → Back button
12. browser_snapshot → verify #docker-config-step-1 visible again
13. browser_click    → Next → then Confirm
14. browser_snapshot → verify #docker-config-step-3 + provision log visible
15. (wait for provision) browser_snapshot → verify #panel-ai-config visible
16. browser_select_option → #ai-provider-select → Anthropic
17. browser_fill     → [type=password] → test API key
18. browser_click    → "Finish Setup"
19. browser_snapshot → verify OCC Home tab closed, Void sidebar open
```

## Tasks

- [ ] Task 1: Create `tests/e2e/docker-to-ide-flow.spec.ts` from the spec above
- [ ] Task 2: Wire Step 3 provision completion to trigger AI config panel (verify ticket-031 integration)
- [ ] Task 3: Add mock mode — inject `provisionStatus done:ok` via CDP to skip real Docker provision in CI
- [ ] Task 4: Run full suite against live Docker environment (integration test)
- [ ] Task 5: Add novnc MCP manual walkthrough to CI/CD manual verification checklist
