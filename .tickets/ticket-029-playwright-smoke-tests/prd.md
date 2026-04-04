# PRD: Playwright Smoke Tests — Code-Server + Basic Navigation

## 2.1 Problem Statement

The editor now runs as an HTTP server (ticket-028) and is confirmed healthy on port 9888, but there are no automated tests verifying the workbench loads and core navigation works. Without smoke tests, regressions in the server startup path, extension activation, or home panel rendering go undetected until manual review.

## 2.2 Scope

Implement a minimal Playwright test suite targeting the live code-server at `http://localhost:9888`. Tests must pass against the container already running (`reuseExistingServer: true` for local dev). The test suite is not a full E2E suite — it covers the happy path only: server accessible, workbench renders, activity bar navigation works, and the OpenClaw home panel loads inside its webview.

These tests replace the Electron/CDP approach from ticket-016 and implement Phase 3 of ticket-028.

## 2.3 Known 404s (non-blocking)

`vsda/rust/web/vsda_bg.wasm` and `vsda.js` produce `File not found` in the server log. These are VS Code's license attestation WASM files — not built because `npm i --ignore-scripts` skips the `vsda` postinstall. They do not affect workbench functionality and can be ignored in tests.

## 2.4 Proposed Solution

### Files to create

```
playwright.config.ts          ← repo root
tests/e2e/
  smoke.spec.ts               ← server accessible + workbench renders
  navigation.spec.ts          ← activity bar + sidebar switching
  home-panel.spec.ts          ← OpenClaw home panel inside webview
```

### `playwright.config.ts`

```ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 60_000,
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL: 'http://localhost:9888',
    browserName: 'chromium',
    headless: true,
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'docker compose up editor',
    url: 'http://localhost:9888',
    reuseExistingServer: true,   // don't restart if already running locally
    timeout: 180_000,
  },
});
```

`reuseExistingServer: true` means local runs against the already-running container; CI starts its own via `docker compose up editor`.

### Test: `smoke.spec.ts`

```ts
import { test, expect } from '@playwright/test';

test('server returns 200 and workbench HTML', async ({ page }) => {
  const res = await page.goto('/');
  expect(res?.status()).toBe(200);
  await expect(page.locator('#vscode-workbench-web-configuration')).toBeAttached();
});

test('workbench shell renders', async ({ page }) => {
  await page.goto('/');
  // Monaco workbench mounts after JS executes
  await expect(page.locator('.monaco-workbench')).toBeVisible({ timeout: 30_000 });
  // Status bar is the last element to render — confirms full workbench init
  await expect(page.locator('.statusbar')).toBeVisible({ timeout: 30_000 });
});
```

### Test: `navigation.spec.ts`

```ts
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.locator('.monaco-workbench').waitFor({ timeout: 30_000 });
});

test('activity bar is visible', async ({ page }) => {
  await expect(page.locator('.activitybar')).toBeVisible();
});

test('can open Explorer via activity bar', async ({ page }) => {
  // Click the Explorer icon (first item) in the activity bar
  await page.locator('.activitybar .action-item').first().click();
  await expect(page.locator('.sidebar')).toBeVisible({ timeout: 10_000 });
});

test('can open Extensions panel', async ({ page }) => {
  // Extensions icon is aria-labelled
  const extensionsBtn = page.locator('[aria-label="Extensions (Ctrl+Shift+X)"]');
  if (await extensionsBtn.isVisible()) {
    await extensionsBtn.click();
    await expect(page.locator('.sidebar')).toBeVisible({ timeout: 10_000 });
  } else {
    // Fallback: open via keyboard shortcut
    await page.keyboard.press('Control+Shift+X');
    await expect(page.locator('.sidebar')).toBeVisible({ timeout: 10_000 });
  }
});
```

### Test: `home-panel.spec.ts`

The OpenClaw home panel is rendered inside a VS Code webview (`<iframe>`). Playwright must switch to the iframe context to query its DOM.

```ts
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.locator('.monaco-workbench').waitFor({ timeout: 30_000 });
});

test('home panel opens and renders', async ({ page }) => {
  // OpenClaw registers a command to open the home panel;
  // trigger it via the command palette
  await page.keyboard.press('F1');
  await page.locator('.quick-input-widget').waitFor({ timeout: 10_000 });
  await page.keyboard.type('OpenClaw: Open Home');
  await page.locator('.quick-input-list .monaco-list-row').first().click();

  // Home panel is a webview — locate its iframe
  const webviewFrame = page.frameLocator('iframe.webview').first();
  // The inner iframe (VS Code double-wraps webviews)
  const innerFrame = webviewFrame.frameLocator('iframe');

  // Unauthenticated state: Sign In button is visible
  // Authenticated state: setup cards or dashboard visible
  // Either way, the root div#root should be present
  await expect(innerFrame.locator('#root')).toBeVisible({ timeout: 20_000 });
});

test('home panel shows sign-in UI when not authenticated', async ({ page }) => {
  await page.keyboard.press('F1');
  await page.locator('.quick-input-widget').waitFor({ timeout: 10_000 });
  await page.keyboard.type('OpenClaw: Open Home');
  await page.locator('.quick-input-list .monaco-list-row').first().click();

  const innerFrame = page.frameLocator('iframe.webview').first().frameLocator('iframe');
  // Sign In button text varies — match loosely
  const signInBtn = innerFrame.locator('button', { hasText: /sign.?in/i });
  await expect(signInBtn).toBeVisible({ timeout: 20_000 });
});
```

## 2.5 Root `package.json` change

Add:
```json
"test:e2e": "playwright test",
"test:e2e:ui": "playwright test --ui"
```

## 2.6 Acceptance Criteria

- [ ] `npx playwright install chromium` documented in README or handled by CI
- [ ] `npm run test:e2e` runs all three spec files with no failures against a live container
- [ ] `smoke.spec.ts` passes: 200 response, `#vscode-workbench-web-configuration` present, `.monaco-workbench` and `.statusbar` visible
- [ ] `navigation.spec.ts` passes: activity bar visible, Explorer/Extensions panels openable
- [ ] `home-panel.spec.ts` passes: home panel opens, `#root` inside webview iframe is visible, sign-in button visible when unauthenticated
- [ ] Tests run in CI (GitHub Actions) against the container without a display (`headless: true`)
- [ ] `video: 'retain-on-failure'` and `screenshot: 'only-on-failure'` artifacts uploaded in CI

## 2.7 Notes on Webview Iframe Nesting

VS Code wraps webview panels in two iframe layers:
1. Outer: `iframe.webview` — sandboxed shell
2. Inner: `iframe` inside the outer — contains the actual React app

Playwright's `frameLocator` chains handle this. If the inner frame is cross-origin, `page.context().setAllowedLocalhostRanges()` or `--disable-web-security` may be needed in the Playwright launch config.

## 2.8 Relationship to Other Tickets

- **Ticket-016** — superseded by this ticket; Electron/CDP approach dropped
- **Ticket-028** — web server mode (prerequisite); Phase 3 implementation lives here
