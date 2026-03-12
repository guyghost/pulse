import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';

export const SIDE_PANEL = '/src/sidepanel/index.html';

export async function waitForDevPanel(page: Page) {
  await page.locator('button:has-text("Ctrl+Shift+D")').waitFor({ state: 'visible' });
}

export async function openDevPanel(page: Page) {
  await waitForDevPanel(page);
  await page.keyboard.press('Control+Shift+D');
  await expect(page.getByText('DEV PANEL')).toBeVisible();
}

export async function closeDevPanel(page: Page) {
  await page.keyboard.press('Control+Shift+D');
  await expect(page.getByText('DEV PANEL')).not.toBeVisible();
}

export async function setFeedState(page: Page, state: 'empty' | 'loading' | 'loaded' | 'error') {
  await openDevPanel(page);
  await page.getByRole('button', { name: state }).click();
  await closeDevPanel(page);
}

export async function injectMissions(page: Page, count: number) {
  await openDevPanel(page);
  await page.locator('input[type="range"]').evaluate((el, val) => {
    (el as HTMLInputElement).value = String(val);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, count);
  await page.getByRole('button', { name: 'inject' }).click();
  await closeDevPanel(page);
}
