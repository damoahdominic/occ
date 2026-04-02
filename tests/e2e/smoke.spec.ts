import { test, expect } from '@playwright/test';

/**
 * Smoke tests — verify the code-server is reachable and the VS Code
 * workbench shell renders to completion.
 */

test('server returns 200 and workbench bootstrap element is present', async ({ page }) => {
  const res = await page.goto('/');
  expect(res?.status()).toBe(200);
  // VS Code injects this element before any JS runs — confirms the right page
  await expect(page.locator('#vscode-workbench-web-configuration')).toBeAttached();
});

test('workbench shell renders with activity bar and status bar', async ({ page }) => {
  await page.goto('/');
  // Monaco workbench root mounts after JS executes
  await expect(page.locator('.monaco-workbench')).toBeVisible({ timeout: 30_000 });
  // Activity bar is part of the workbench chrome
  await expect(page.locator('.activitybar')).toBeVisible({ timeout: 20_000 });
  // Status bar is rendered last — its presence means the workbench fully initialised
  await expect(page.locator('.statusbar')).toBeVisible({ timeout: 20_000 });
});

test('no critical JS errors on load', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));
  await page.goto('/');
  await page.locator('.monaco-workbench').waitFor({ timeout: 30_000 });
  // Filter out known benign vsda WASM 404s — they don't affect functionality
  const critical = errors.filter(
    (e) => !e.includes('vsda') && !e.includes('Failed to fetch'),
  );
  expect(critical, `Unexpected JS errors: ${critical.join('\n')}`).toHaveLength(0);
});
