/**
 * LeHibou Connector Health Check
 *
 * Tests the LeHibou platform to ensure:
 * - Website is accessible
 * - Expected page structure exists
 * - Mission listing selectors are valid
 *
 * Note: LeHibou requires authentication for API access.
 * This health check verifies public page structure only.
 *
 * @see https://www.lehibou.com
 */

/// <reference types="node" />

import { test, expect } from '@playwright/test';
import { join } from 'node:path';
import { runLeHibouHealthCheck } from './lehibou.health';

const BASE_URL = 'https://www.lehibou.com';
const MISSIONS_URL = 'https://www.lehibou.com/en/freelance';
const TIMEOUT = parseInt(process.env.HEALTH_CHECK_TIMEOUT ?? '60000', 10);

test.describe('LeHibou Health Check', () => {
  test('Homepage loads successfully', async ({ page }) => {
    const startTime = Date.now();

    await page.goto(BASE_URL, { timeout: TIMEOUT, waitUntil: 'domcontentloaded' });

    const responseTime = Date.now() - startTime;

    // Check page loaded
    await expect(page).toHaveTitle(/Hibou/i);

    console.log(`[LeHibou] Homepage load time: ${responseTime}ms`);
  });

  test('Missions page is accessible', async ({ page }) => {
    const startTime = Date.now();

    const response = await page.goto(MISSIONS_URL, { timeout: TIMEOUT, waitUntil: 'networkidle' });

    const responseTime = Date.now() - startTime;

    // Check response
    expect(response?.status(), `Page returned status ${response?.status()}`).toBe(200);
    expect(responseTime, `Page load time ${responseTime}ms exceeds ${TIMEOUT}ms`).toBeLessThan(
      TIMEOUT
    );

    // Wait for content to load
    await page.waitForTimeout(2000);

    // Take screenshot on failure path
    const screenshotDir = join(process.cwd(), 'tests/health/screenshots');

    console.log(`[LeHibou] Missions page load time: ${responseTime}ms`);
  });

  test('Public mission entry points are present', async ({ page }) => {
    await page.goto(MISSIONS_URL, { timeout: TIMEOUT, waitUntil: 'networkidle' });

    // Wait for page content to load
    await page.waitForTimeout(3000);

    const missionLinks = await page.locator('a[href*="/annonce/"]').count();
    const expertiseLinks = await page.locator('a[href*="/freelance/"]').count();

    console.log(
      `[LeHibou] Found ${missionLinks} mission links and ${expertiseLinks} expertise links`
    );

    if (missionLinks > 0) {
      const firstLink = page.locator('a[href*="/annonce/"]').first();
      await expect(firstLink).toBeVisible();
      return;
    }

    expect(expertiseLinks, 'No public mission entry points found').toBeGreaterThan(0);
  });

  test('Can extract mission entry data from the public page', async ({ page }) => {
    await page.goto(MISSIONS_URL, { timeout: TIMEOUT, waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);

    const missionLinks = await page.locator('a[href*="/annonce/"]').all();
    const expertiseLinks = await page.locator('a[href*="/freelance/"]').all();
    expect(
      missionLinks.length + expertiseLinks.length,
      'No public mission entries found on LeHibou'
    ).toBeGreaterThan(0);

    const firstLink = missionLinks[0] ?? expertiseLinks[0];
    const href = await firstLink.getAttribute('href');
    const text = await firstLink.textContent();

    expect(href, 'Mission entry has no href').toBeTruthy();
    expect(href, 'Unexpected mission entry path').toMatch(/\/annonce\/|\/freelance\//);
    expect(text?.trim().length, 'Mission card has no text content').toBeGreaterThan(0);

    console.log(`[LeHibou] Sample mission: ${href}`);
    console.log(`[LeHibou] Card text preview: ${text?.substring(0, 100)}...`);
  });

  test('Takes screenshot for debugging', async ({ page }) => {
    await page.goto(MISSIONS_URL, { timeout: TIMEOUT, waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    const screenshotDir = join(process.cwd(), 'tests/health/screenshots');
    const screenshotPath = join(screenshotDir, 'lehibou-missions.png');

    await page.screenshot({
      path: screenshotPath,
      fullPage: false,
    });

    console.log(`[LeHibou] Screenshot saved: ${screenshotPath}`);
  });
});
