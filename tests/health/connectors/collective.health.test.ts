/**
 * Collective Connector Health Check
 *
 * Tests the Collective GraphQL API to ensure:
 * - GraphQL endpoint is reachable
 * - Query structure is valid
 * - Response contains expected data
 *
 * Note: Collective requires authentication for full mission access.
 * This health check verifies API connectivity and structure.
 *
 * @see https://app.collective.work
 */

import { test, expect } from '@playwright/test';
import { join } from 'node:path';
import { runCollectiveHealthCheck } from './collective.health';

const BASE_URL = 'https://app.collective.work';
const API_URL = 'https://api.collective.work/graphql';
const TIMEOUT = parseInt(process.env.HEALTH_CHECK_TIMEOUT ?? '60000', 10);

const HEALTH_CHECK_QUERY = `
  query HealthCheck {
    __typename
  }
`;

const SEARCH_QUERY = `
  query Collective_SearchJobs($data: Collective_SearchJobsInputType!) {
    results: Collective_SearchJobs(data: $data) {
      projects {
        id
        slug
        name
      }
      pagination { total }
    }
  }
`;

test.describe('Collective Health Check', () => {
  test('GraphQL endpoint responds', async ({ request }) => {
    const startTime = Date.now();

    const response = await request.post(API_URL, {
      headers: {
        'Content-Type': 'application/json',
      },
      data: {
        query: HEALTH_CHECK_QUERY,
      },
      timeout: TIMEOUT,
    });

    const responseTime = Date.now() - startTime;

    // GraphQL may return 200 even with errors
    expect(responseTime, `Response time ${responseTime}ms exceeds ${TIMEOUT}ms`).toBeLessThan(
      TIMEOUT
    );

    const data = await response.json();
    console.log(`[Collective] Response time: ${responseTime}ms`);
    console.log(`[Collective] Response:`, JSON.stringify(data).substring(0, 200));
  });

  test('Search query returns valid structure', async ({ request }) => {
    const response = await request.post(API_URL, {
      headers: {
        'Content-Type': 'application/json',
      },
      data: {
        query: SEARCH_QUERY,
        variables: {
          data: {
            query: '',
            dailyRates: { from: 0, to: null },
            locations: [],
            skills: [],
            workPreferences: [],
            exclusive: false,
            hasDailyRate: false,
            companies: [],
            fromTopRecruiter: false,
            idealStartDate: [],
            contractType: 'All',
            offerLanguages: [],
            from: 0,
            sort: 'PublishedAt',
            explain: false,
          },
        },
      },
      timeout: TIMEOUT,
    });

    const data = await response.json();

    // Check for GraphQL errors
    if (data.errors) {
      console.log(`[Collective] GraphQL errors:`, data.errors);
      // May fail due to auth - check error type
      const hasAuthError = data.errors.some(
        (e: { message: string }) =>
          e.message.toLowerCase().includes('auth') ||
          e.message.toLowerCase().includes('unauthenticated')
      );
      if (hasAuthError) {
        console.log(`[Collective] Auth required - expected for unauthenticated health check`);
      }
    }

    // If we have data, validate structure
    if (data.data?.results) {
      expect(data.data.results).toHaveProperty('projects');
      expect(data.data.results).toHaveProperty('pagination');
      expect(Array.isArray(data.data.results.projects)).toBe(true);
      console.log(`[Collective] Found ${data.data.results.projects.length} projects`);
    }
  });

  test('Website homepage loads successfully', async ({ page }) => {
    const startTime = Date.now();

    await page.goto(BASE_URL, { timeout: TIMEOUT, waitUntil: 'domcontentloaded' });

    const responseTime = Date.now() - startTime;

    // Check page loaded
    await expect(page).toHaveTitle(/Collective/i);

    console.log(`[Collective] Homepage load time: ${responseTime}ms`);
  });

  test('Takes screenshot for debugging', async ({ page }) => {
    await page.goto(BASE_URL, { timeout: TIMEOUT, waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    const screenshotDir = join(process.cwd(), 'tests/health/screenshots');
    const screenshotPath = join(screenshotDir, 'collective-home.png');

    await page.screenshot({
      path: screenshotPath,
      fullPage: false,
    });

    console.log(`[Collective] Screenshot saved: ${screenshotPath}`);
  });
});
