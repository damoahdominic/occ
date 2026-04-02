import { test, expect } from '@playwright/test';

/**
 * Navigation tests — verify the VS Code workbench chrome is interactive:
 * activity bar is visible and clicking sidebar views works.
 */

test.beforeEach(async ({ page }) => {
  await page.addLocatorHandler(
    page.getByRole('button', { name: 'Yes, I trust the authors' }),
    async (btn) => { await btn.click(); },
  );
  await page.goto('/');
  await page.locator('.monaco-workbench').waitFor({ timeout: 30_000 });
});

test('activity bar is visible and has clickable items', async ({ page }) => {
  const activityBar = page.locator('.activitybar');
  await expect(activityBar).toBeVisible();
  // At least one action item (Explorer, Search, Source Control, …)
  await expect(activityBar.locator('.action-item')).not.toHaveCount(0);
});

test('Explorer panel opens via activity bar', async ({ page }) => {
  // Explorer is the first activity bar item in a default VS Code layout
  const explorerBtn = page.locator('[aria-label="Explorer (Ctrl+Shift+E)"]').first();
  if (await explorerBtn.isVisible()) {
    await explorerBtn.click();
  } else {
    // Fallback to first action item
    await page.locator('.activitybar .action-item').first().click();
  }
  await expect(page.locator('.sidebar')).toBeVisible({ timeout: 10_000 });
});

test('command palette opens and accepts input', async ({ page }) => {
  await page.keyboard.press('F1');
  const quickInput = page.locator('.quick-input-widget');
  await expect(quickInput).toBeVisible({ timeout: 10_000 });
  // Type something to confirm the input is live
  await page.keyboard.type('View:');
  // F1 opens the command palette with '>' already in the input, so typing 'View:' gives '>View:'
  await expect(quickInput.locator('.quick-input-box input')).toHaveValue('>View:');
  // Dismiss
  await page.keyboard.press('Escape');
  await expect(quickInput).not.toBeVisible();
});

test('Extensions panel opens via keyboard shortcut', async ({ page }) => {
  await page.keyboard.press('Control+Shift+X');
  await expect(page.locator('.sidebar')).toBeVisible({ timeout: 10_000 });
});
