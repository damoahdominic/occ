# PRD: Docker Card Setup — Playwright TDD + Complete Wizard Flow

## 2.1 Problem Statement

The Docker card setup wizard in the OCC Home panel (the multi-step flow: host picker → bootstrap choice → path input → doctor checks → provision) has zero automated test coverage. Some UI states and transitions may be broken or untested. We need Playwright tests that drive TDD-style implementation of the complete flow.

## 2.2 Scope

Write Playwright tests that describe the intended behaviour of each wizard step using TDD. Tests initially fail where the implementation is incomplete or broken. Fix any gaps found during the test-writing process. Also add visual snapshot tests for each panel state.

These tests build on the Playwright infrastructure from ticket-022 and ticket-029 and extend coverage into the Docker setup wizard.

## 2.3 Flow Being Tested

The wizard has four steps:

1. **Host Picker → Bootstrap Choice**: User clicks Docker card on install wizard → new panel opens showing "Docker Setup" vs "Local Setup" buttons
2. **Bootstrap Choice → Path Input**: User clicks "Docker Setup" (`#btn-choose-docker`) → `#panel-docker-path` appears with `#docker-path-input` pre-filled with default path
3. **Path Input → Doctor Checks**: User confirms path → `#panel-docker-doctor` appears with `#doctor-checklist` showing requirement items (OS, Docker CLI, daemon, port, compose)
4. **Doctor Checks → Provision**: All checks pass → user clicks Start → `#panel-docker-provision` with streaming `#provision-log`

After clicking the Docker card from the host picker, the extension disposes the current panel and opens a new one via the `openclaw.host.setup.docker` command.

## 2.4 Proposed Solution

### Files to create / modify

```
playwright.config.ts                        ← update with snapshot config + always-list reporter
tests/e2e/
  docker-setup.spec.ts                      ← TDD tests for all wizard steps
  snapshots.spec.ts                         ← visual regression tests for workbench, home panel, docker card states
tests/e2e/snapshots/                        ← captured baseline screenshots (auto-generated)
```

### Key selectors

| Selector | Description |
|---|---|
| `[data-card="docker"]` | Docker card in host picker |
| `#panel-bootstrap-choice` | Bootstrap choice panel root |
| `#btn-choose-docker` | "Docker Setup" button |
| `#btn-choose-local` | "Local Setup" button |
| `#panel-docker-path` | Path input panel root |
| `#docker-path-input` | Pre-filled path text input |
| `#panel-docker-doctor` | Doctor checks panel root |
| `#doctor-checklist` | List of requirement items |
| `.doctor-item` | Individual requirement row |
| `#panel-docker-provision` | Provision panel root |
| `#provision-log` | Streaming provision log output |

### Iframe chain

```ts
const inner = page
  .frameLocator('iframe.webview').first()
  .frameLocator('iframe#active-frame');
```

### `playwright.config.ts` additions

```ts
reporter: [['list', { printSteps: true }]],   // always-list reporter
expect: {
  toHaveScreenshot: { maxDiffPixels: 100 },
},
snapshotDir: './tests/e2e/snapshots',
```

### Test: `docker-setup.spec.ts`

```ts
import { test, expect } from '@playwright/test';

test.describe('Docker setup wizard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.locator('.monaco-workbench').waitFor({ timeout: 30_000 });
    // Open home panel via command palette
    await page.keyboard.press('F1');
    await page.locator('.quick-input-widget').waitFor({ timeout: 10_000 });
    await page.keyboard.type('OpenClaw: Open Home');
    await page.locator('.quick-input-list .monaco-list-row').first().click();
  });

  const inner = (page: any) =>
    page.frameLocator('iframe.webview').first().frameLocator('iframe#active-frame');

  test('3a. Docker card is visible in host picker', async ({ page }) => {
    await expect(inner(page).locator('[data-card="docker"]')).toBeVisible({ timeout: 20_000 });
  });

  test('3b. Click Docker card → bootstrap choice panel appears', async ({ page }) => {
    await inner(page).locator('[data-card="docker"]').click();
    await expect(inner(page).locator('#panel-bootstrap-choice')).toBeVisible({ timeout: 20_000 });
  });

  test('3c. Click Docker Setup button → path input panel appears', async ({ page }) => {
    await inner(page).locator('[data-card="docker"]').click();
    await inner(page).locator('#btn-choose-docker').click();
    await expect(inner(page).locator('#panel-docker-path')).toBeVisible({ timeout: 20_000 });
  });

  test('3d. Path input has a default value', async ({ page }) => {
    await inner(page).locator('[data-card="docker"]').click();
    await inner(page).locator('#btn-choose-docker').click();
    const input = inner(page).locator('#docker-path-input');
    await expect(input).not.toHaveValue('', { timeout: 10_000 });
  });

  test('3e. Confirm path → doctor checklist appears', async ({ page }) => {
    await inner(page).locator('[data-card="docker"]').click();
    await inner(page).locator('#btn-choose-docker').click();
    await inner(page).locator('button', { hasText: /confirm|next|continue/i }).click();
    await expect(inner(page).locator('#panel-docker-doctor')).toBeVisible({ timeout: 20_000 });
  });

  test('3f. Doctor checklist shows requirement items', async ({ page }) => {
    await inner(page).locator('[data-card="docker"]').click();
    await inner(page).locator('#btn-choose-docker').click();
    await inner(page).locator('button', { hasText: /confirm|next|continue/i }).click();
    await expect(inner(page).locator('#doctor-checklist')).toBeVisible({ timeout: 20_000 });
    const items = inner(page).locator('.doctor-item');
    await expect(items).toHaveCount(5, { timeout: 10_000 }); // OS, Docker CLI, daemon, port, compose
  });

  test('3g. Back navigation returns to host picker from bootstrap choice', async ({ page }) => {
    await inner(page).locator('[data-card="docker"]').click();
    await expect(inner(page).locator('#panel-bootstrap-choice')).toBeVisible({ timeout: 20_000 });
    await inner(page).locator('button', { hasText: /back/i }).click();
    await expect(inner(page).locator('[data-card="docker"]')).toBeVisible({ timeout: 20_000 });
  });
});
```

### Test: `snapshots.spec.ts`

```ts
import { test, expect } from '@playwright/test';

test('workbench baseline snapshot', async ({ page }) => {
  await page.goto('/');
  await page.locator('.monaco-workbench').waitFor({ timeout: 30_000 });
  await expect(page).toHaveScreenshot('workbench.png');
});

test('home panel snapshot', async ({ page }) => {
  await page.goto('/');
  await page.locator('.monaco-workbench').waitFor({ timeout: 30_000 });
  await page.keyboard.press('F1');
  await page.locator('.quick-input-widget').waitFor({ timeout: 10_000 });
  await page.keyboard.type('OpenClaw: Open Home');
  await page.locator('.quick-input-list .monaco-list-row').first().click();
  const inner = page.frameLocator('iframe.webview').first().frameLocator('iframe#active-frame');
  await inner.locator('#root').waitFor({ timeout: 20_000 });
  await expect(page).toHaveScreenshot('home-panel.png');
});

test('bootstrap choice panel snapshot', async ({ page }) => {
  await page.goto('/');
  await page.locator('.monaco-workbench').waitFor({ timeout: 30_000 });
  await page.keyboard.press('F1');
  await page.locator('.quick-input-widget').waitFor({ timeout: 10_000 });
  await page.keyboard.type('OpenClaw: Open Home');
  await page.locator('.quick-input-list .monaco-list-row').first().click();
  const inner = page.frameLocator('iframe.webview').first().frameLocator('iframe#active-frame');
  await inner.locator('[data-card="docker"]').click();
  await inner.locator('#panel-bootstrap-choice').waitFor({ timeout: 20_000 });
  await expect(page).toHaveScreenshot('bootstrap-choice.png');
});

test('docker path input panel snapshot', async ({ page }) => {
  await page.goto('/');
  await page.locator('.monaco-workbench').waitFor({ timeout: 30_000 });
  await page.keyboard.press('F1');
  await page.locator('.quick-input-widget').waitFor({ timeout: 10_000 });
  await page.keyboard.type('OpenClaw: Open Home');
  await page.locator('.quick-input-list .monaco-list-row').first().click();
  const inner = page.frameLocator('iframe.webview').first().frameLocator('iframe#active-frame');
  await inner.locator('[data-card="docker"]').click();
  await inner.locator('#btn-choose-docker').click();
  await inner.locator('#panel-docker-path').waitFor({ timeout: 20_000 });
  await expect(page).toHaveScreenshot('docker-path-input.png');
});
```

## 2.5 Acceptance Criteria

- [x] All tests in `tests/e2e/docker-setup.spec.ts` pass
- [x] Visual snapshots captured for each panel state in `tests/e2e/snapshots/`
- [x] Docker card click correctly transitions to bootstrap choice view
- [x] Bootstrap choice `#btn-choose-docker` shows path input panel
- [x] `#docker-path-input` has a sensible default value
- [x] Doctor checklist appears and shows requirement items after path confirmation
- [x] Back navigation returns to host picker from bootstrap choice
- [x] `playwright.config.ts` updated with snapshot config and always-list reporter
- [x] Host picker cards have `data-card` attributes for reliable test selectors
- [x] Step timeline shows Docker-appropriate labels ("Check Requirements" → "Provision Docker") when `setupFor === 'docker'`
- [x] Provision completion shows "Open Dashboard →" button after successful docker compose setup

## 2.6 Tasks

- [x] Task 1: Update `playwright.config.ts` with snapshot config + always-list reporter
- [x] Task 2: Create `tests/e2e/snapshots.spec.ts` with visual regression tests for workbench, home panel, and docker card states
- [x] Task 3: Create `tests/e2e/docker-setup.spec.ts` with TDD tests for all wizard steps
  - [x] 3a. Test: Docker card visible in host picker (PASSED)
  - [x] 3b. Test: Click Docker card → bootstrap choice panel appears (PASSED)
  - [x] 3c. Test: Click Docker Setup button → path input panel appears (PASSED)
  - [x] 3d. Test: Path input has a default value (PASSED)
  - [x] 3e. Test: Confirm path → doctor checklist appears (PASSED)
  - [x] 3f. Test: Doctor checklist shows requirement items (PASSED)
  - [x] 3g. Test: Back navigation returns to host picker (PASSED)
  - [x] 3h. Snapshots for bootstrap choice and path input panels
- [x] Task 4: Fix gaps discovered during test authoring
  - [x] Add `data-card` attributes to host picker cards (`data-card="local"`, `data-card="docker"`, `data-card="ssh"`)
  - [x] Fix step timeline labels for Docker flow ("Check Requirements" → "Provision Docker" → "Ready")
  - [x] Verify provision completion UI shows "Open Dashboard →" button
- [x] Task 5: Run full test suite; confirm all tests pass

## 2.7 Audit Notes — Incorrect Bug Analysis Corrected

The original PRD (Section 2.7) described an "Extension Bug" that was **incorrect**. The analysis claimed that `isInstalled` logic at `home.ts:411` would prevent `_getSetupHtml()` from rendering when `setupFor === 'docker'`.

**Why the claimed bug does not exist:**

When the Docker card is clicked from the host picker, the `openclaw.host.setup.docker` command creates a new `HomePanel` with `setupFor: 'docker'`. The `_host` field defaults to `DefaultLocalHostConnection` (type `'local'`), so `this._host.type !== 'local'` is **always `false`** during initial setup. This means:

```
isInstalled = isConfigured || (false && cliCheck.ok) = false
```

Therefore `_getSetupHtml()` IS rendered with `isInstalled = false`, the bootstrap choice panel IS visible, and all JavaScript handlers (`chooseDocker()`, `chooseLocal()`, etc.) are present and functional.

**Real issues found and fixed:**

1. **Missing `data-card` attributes** — Host picker cards lacked `data-card` attributes, making the PRD's proposed test selectors (`[data-card="docker"]`) non-functional. Fixed by adding `data-card="local"`, `data-card="docker"`, `data-card="ssh"` to the respective cards in `_getHostTypeSelectionHtml()`.

2. **Generic step timeline labels** — The step timeline showed "Install OpenClaw" → "Configure AI Model" regardless of setup type. Fixed by passing `setupFor` to `_getSetupHtml()` and rendering Docker-appropriate labels ("Check Requirements" → "Provision Docker") when `setupFor === 'docker'`.

3. **Provision completion UI** — Already implemented correctly. After `docker compose up` succeeds, the `provisionStatus` handler renders an "Open Dashboard →" button.

## 2.8 Technical Details

### Iframe nesting

VS Code wraps webview panels in two iframe layers:

1. Outer: `iframe.webview` — sandboxed shell
2. Inner: `iframe#active-frame` inside the outer — contains the actual React/HTML app

Use `frameLocator` chains as shown above. If the inner frame is cross-origin, pass `--disable-web-security` in the Playwright launch args or configure `page.context().setAllowedLocalhostRanges()`.

### Panel lifecycle

After clicking the Docker card from the host picker, the extension disposes the current panel and opens a new one via the `openclaw.host.setup.docker` command. Tests must wait for the new panel's inner frame to be ready before querying selectors — use explicit `waitFor` calls rather than relying on navigation timing.

### Docker Compose Provisioning

The Docker setup flow uses `docker/docker-compose.full.yml` which defines:
- `occ-gateway` (image: `openclaw/pod:latest`) — OpenClaw gateway on port 18789
- `occ-postgres` (image: `postgres:16-alpine`) — PostgreSQL database
- `occ-redis` (image: `redis:7-alpine`) — Redis cache

The provisioning engine (`runDockerProvision` in `home.ts`) writes a `.env` file with `OPENCLAW_DATA_DIR`, runs `docker compose pull`, then `docker compose up -d`, polls the gateway health endpoint, and writes `openclaw.json` with gateway configuration.

## 2.9 Dependencies

- **ticket-022** — Docker compose validation (prerequisite)
- **ticket-029** — Playwright smoke tests (Playwright infrastructure in place)
- Requires: Docker container running at `localhost:9888` (code-server)

## 2.10 Relationship to Other Tickets

- **Ticket-029** — Playwright smoke tests; this ticket extends that suite with wizard-specific coverage
- **Ticket-022** — Docker compose validation workflow; the wizard under test drives the compose setup
- **Ticket-027** — Docker setup button compose file path fix (already resolved)
- **Ticket-021** — Docker bootstrap setup; this ticket tests the flow implemented there
