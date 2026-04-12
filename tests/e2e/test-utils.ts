/**
 * Shared E2E Test Utilities
 *
 * Common helpers for Playwright tests across the test suite.
 * Provides reliable element selection, waits, and assertions.
 */

import { Page, FrameLocator, expect } from '@playwright/test';

/**
 * Wait for Home panel tab to be visible and clickable.
 * Handles both auto-opened and manually-triggered tab visibility.
 */
export async function waitForHomePanelTab(page: Page, timeout = 30_000): Promise<void> {
  const tab = page.locator('[role="tab"]').filter({ hasText: /OCC Home|Home/ });

  try {
    // First try: wait for auto-open
    await tab.waitFor({ timeout: 5_000 }).catch(() => null);

    // If not visible, manually open
    if (!await tab.isVisible({ timeout: 1_000 }).catch(() => false)) {
      await page.locator('.activitybar').click().catch(() => null);
      await page.keyboard.press('Control+Alt+H');
    }

    // Final wait for tab to be visible
    await tab.waitFor({ timeout });
  } catch (e) {
    throw new Error(`OCC Home panel tab not found after ${timeout}ms`);
  }
}

/**
 * Get the inner frame within the webview.
 * VS Code webviews use nested iframes:
 * - Outer: iframe.webview (cross-origin)
 * - Inner: iframe#active-frame (actual content)
 */
export function getInnerFrame(page: Page): FrameLocator {
  return page.frameLocator('iframe.webview').first().frameLocator('iframe#active-frame');
}

/**
 * Find a button by text and verify it's clickable.
 * Returns null if not found (instead of throwing).
 */
export async function findButton(
  frame: FrameLocator,
  textPattern: string | RegExp,
  timeout = 10_000
): Promise<boolean> {
  const button = frame.locator('button, [role="button"]').filter({ hasText: textPattern });
  try {
    await button.first().waitFor({ timeout });
    return true;
  } catch {
    return false;
  }
}

/**
 * Click a button by text pattern.
 * Fails with descriptive error if button not found.
 */
export async function clickButton(
  frame: FrameLocator,
  textPattern: string | RegExp,
  timeout = 10_000
): Promise<void> {
  const button = frame.locator('button, [role="button"]').filter({ hasText: textPattern });

  try {
    await button.first().waitFor({ timeout });
    await button.first().click();
  } catch {
    throw new Error(`Button matching "${textPattern}" not found after ${timeout}ms`);
  }
}

/**
 * Get text content from an element, with fallback to empty string.
 */
export async function getTextContent(
  locator: ReturnType<FrameLocator['locator']>,
  defaultValue = ''
): Promise<string> {
  try {
    const text = await locator.textContent({ timeout: 5_000 });
    return text || defaultValue;
  } catch {
    return defaultValue;
  }
}

/**
 * Verify that status text contains expected keyword.
 * Useful for checking UI state like "Running", "Stopped", "Starting", etc.
 */
export async function verifyStatusContains(
  frame: FrameLocator,
  expectedText: string,
  timeout = 10_000,
  statusSelectors = '[data-testid="status"], [data-testid="gateway-status"], .status'
): Promise<boolean> {
  try {
    const status = frame.locator(statusSelectors).first();
    const text = await getTextContent(status);
    return text.toLowerCase().includes(expectedText.toLowerCase());
  } catch {
    return false;
  }
}

/**
 * Wait for a specific text to appear anywhere in the frame.
 */
export async function waitForText(
  frame: FrameLocator,
  textPattern: string | RegExp,
  timeout = 10_000
): Promise<void> {
  const locator = frame.locator(`:has-text("${textPattern}")`);
  try {
    await locator.first().waitFor({ timeout });
  } catch {
    throw new Error(`Text matching "${textPattern}" not found after ${timeout}ms`);
  }
}

/**
 * Verify element is visible and contains expected text.
 */
export async function verifyElementText(
  locator: ReturnType<FrameLocator['locator']>,
  expectedText: string | RegExp,
  timeout = 10_000
): Promise<void> {
  await expect(locator.first()).toBeVisible({ timeout });
  const text = await getTextContent(locator);

  if (typeof expectedText === 'string') {
    expect(text).toContain(expectedText);
  } else {
    expect(text).toMatch(expectedText);
  }
}

/**
 * Wait for a data-testid element with optional text validation.
 */
export async function waitForTestId(
  frame: FrameLocator,
  testId: string,
  expectedText?: string | RegExp,
  timeout = 10_000
): Promise<void> {
  const element = frame.locator(`[data-testid="${testId}"]`);

  try {
    await element.first().waitFor({ timeout });
  } catch {
    throw new Error(`Element with data-testid="${testId}" not found after ${timeout}ms`);
  }

  if (expectedText) {
    await verifyElementText(element, expectedText, timeout);
  }
}

/**
 * Get the current visible state of a button.
 */
export async function isButtonVisible(
  frame: FrameLocator,
  textPattern: string | RegExp,
  timeout = 5_000
): Promise<boolean> {
  const button = frame.locator('button, [role="button"]').filter({ hasText: textPattern });
  try {
    return await button.first().isVisible({ timeout });
  } catch {
    return false;
  }
}

/**
 * Assert that a button is NOT visible.
 */
export async function assertButtonNotVisible(
  frame: FrameLocator,
  textPattern: string | RegExp,
  timeout = 5_000
): Promise<void> {
  const button = frame.locator('button, [role="button"]').filter({ hasText: textPattern });
  const isVisible = await button.first().isVisible({ timeout }).catch(() => false);
  expect(isVisible, `Button "${textPattern}" should not be visible`).toBe(false);
}

/**
 * Common test setup: verify prerequisites before running test.
 */
export async function verifyTestPrerequisites(page: Page): Promise<void> {
  // 1. Editor is responsive
  await page.locator('.monaco-workbench').waitFor({ timeout: 30_000 });

  // 2. Home panel can be opened
  await waitForHomePanelTab(page, 25_000);
}
