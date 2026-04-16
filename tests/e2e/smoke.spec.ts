import { test, expect } from './fixtures';

/**
 * Smoke tests — verify the code-server is reachable and the VS Code
 * workbench shell renders to completion.
 */

const BASE_URL = process.env.BASE_URL ?? 'http://127.0.0.1:9888';
const WORKSPACE_URL = process.env.VSCODE_WORKSPACE_URL ??
  `${BASE_URL}/?workspace=/root/.occ/My%20OpenClaw%20Workspace.code-workspace`;

test('server returns 200 and workbench bootstrap element is present', async ({ page }) => {
  const res = await page.goto(WORKSPACE_URL);
  expect(res?.status(), 'Server should return HTTP 200').toBe(200);
  // VS Code injects this element before any JS runs — confirms the right page
  await expect(page.locator('#vscode-workbench-web-configuration'), 'VS Code workbench configuration element should be attached').toBeAttached();
});

test('workbench shell renders with activity bar and status bar', async ({ page }) => {
  await page.goto(WORKSPACE_URL);
  // Monaco workbench root mounts after JS executes
  await expect(page.locator('.monaco-workbench'), 'Monaco workbench should be visible').toBeVisible({ timeout: 30_000 });
  // Activity bar is part of the workbench chrome
  await expect(page.locator('.activitybar'), 'Activity bar should be visible').toBeVisible({ timeout: 20_000 });
  // Status bar is rendered last — its presence means the workbench fully initialised
  await expect(page.locator('.statusbar'), 'Status bar should be visible when workbench fully initializes').toBeVisible({ timeout: 20_000 });
});

test('no critical JS errors on load', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.goto(WORKSPACE_URL);
  await page.locator('.monaco-workbench').waitFor({ timeout: 30_000 });
  // Filter out known benign vsda WASM 404s — they don't affect functionality
  const critical = errors.filter(
    (e) => !e.includes('vsda') && !e.includes('Failed to fetch'),
  );
  expect(critical, `Unexpected JS errors: ${critical.join('\n')}`).toHaveLength(0);
});
