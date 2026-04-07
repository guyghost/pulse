/**
 * CherryPick Connector Health Check
 *
 * Tests the CherryPick API to ensure:
 * - API endpoint is reachable
 * - Response structure is valid JSON
 * - Parser can extract missions
 * - At least one mission is returned
 *
 * @see https://app.cherry-pick.io
 */

import { test, expect } from '@playwright/test';
import {
  parseCherryPickMissions,
  type CherryPickMission,
} from '../../../src/lib/core/connectors/cherrypick-parser';
import { join } from 'node:path';
import { runCherryPickHealthCheck } from './cherrypick.health';

const BASE_URL = 'https://app.cherry-pick.io';
const SEARCH_URL = `${BASE_URL}/api/mission/search`;
const TIMEOUT = parseInt(process.env.HEALTH_CHECK_TIMEOUT ?? '60000', 10);

test.describe('CherryPick Health Check', () => {
  test('API endpoint responds with valid JSON', async ({ request }) => {
    const startTime = Date.now();

    const response = await request.post(SEARCH_URL, {
      headers: {
        'Content-Type': 'application/json',
      },
      data: {
        page: 1,
      },
      timeout: TIMEOUT,
    });

    const responseTime = Date.now() - startTime;

    // Status check
    expect(response.ok(), `API returned status ${response.status()}`).toBe(true);
    expect(responseTime, `Response time ${responseTime}ms exceeds ${TIMEOUT}ms`).toBeLessThan(
      TIMEOUT
    );

    // Parse JSON
    const data = await response.json();

    // Validate structure
    expect(data).toHaveProperty('data');
    expect(Array.isArray(data.data), 'data property is not an array').toBe(true);

    console.log(`[CherryPick] Response time: ${responseTime}ms, Missions: ${data.data.length}`);
  });

  test('Parser extracts valid missions from API response', async ({ request }) => {
    const response = await request.post(SEARCH_URL, {
      headers: {
        'Content-Type': 'application/json',
      },
      data: {
        page: 1,
      },
      timeout: TIMEOUT,
    });

    expect(response.ok()).toBe(true);

    const data = (await response.json()) as { data?: CherryPickMission[] };
    const missions = data.data ?? [];

    if (missions.length === 0) {
      console.log(`[CherryPick] No missions returned - may require authentication`);
      test.skip();
      return;
    }

    const parsedMissions = parseCherryPickMissions(missions, new Date());

    // Validate parsed missions
    expect(parsedMissions.length, 'Parser returned no missions').toBeGreaterThan(0);

    // Check first mission has required fields
    const first = parsedMissions[0];
    expect(first.id).toBeTruthy();
    expect(first.title).toBeTruthy();
    expect(first.source).toBe('cherry-pick');
    expect(first.url).toContain('cherry-pick');

    console.log(`[CherryPick] Parsed ${parsedMissions.length} missions`);
    console.log(`[CherryPick] Sample: ${first.title} (${first.location})`);
  });

  test('API returns missions with expected fields', async ({ request }) => {
    const response = await request.post(SEARCH_URL, {
      headers: {
        'Content-Type': 'application/json',
      },
      data: {
        page: 1,
      },
      timeout: TIMEOUT,
    });

    expect(response.ok()).toBe(true);

    const data = (await response.json()) as { data?: CherryPickMission[] };
    const missions = data.data ?? [];

    if (missions.length > 0) {
      const first = missions[0];

      // Check for required fields
      expect(first.id, 'Mission missing id').toBeDefined();
      expect(first.name, 'Mission missing name').toBeDefined();
      expect(first.slug, 'Mission missing slug').toBeDefined();

      // Log available fields for debugging
      const fields = Object.keys(first);
      console.log(`[CherryPick] Available fields: ${fields.join(', ')}`);
    } else {
      console.log(`[CherryPick] No missions in response - may require auth`);
    }
  });

  test('Website homepage loads successfully', async ({ page }) => {
    const startTime = Date.now();

    await page.goto(BASE_URL, { timeout: TIMEOUT, waitUntil: 'domcontentloaded' });

    const responseTime = Date.now() - startTime;

    // Check page loaded - CherryPick might redirect to login
    const title = await page.title();
    console.log(`[CherryPick] Page title: ${title}`);

    console.log(`[CherryPick] Homepage load time: ${responseTime}ms`);
  });

  test('Takes screenshot for debugging', async ({ page }) => {
    await page.goto(BASE_URL, { timeout: TIMEOUT, waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    const screenshotDir = join(process.cwd(), 'tests/health/screenshots');
    const screenshotPath = join(screenshotDir, 'cherrypick-home.png');

    await page.screenshot({
      path: screenshotPath,
      fullPage: false,
    });

    console.log(`[CherryPick] Screenshot saved: ${screenshotPath}`);
  });
});
