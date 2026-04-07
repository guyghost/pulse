/**
 * FreeWork Connector Health Check
 *
 * Tests the FreeWork public API to ensure:
 * - API endpoint is reachable
 * - Response structure is valid JSON
 * - Parser can extract missions
 * - At least one mission is returned
 *
 * @see https://www.free-work.com/api/job_postings
 */

import { test, expect } from '@playwright/test';
import {
  parseFreeWorkAPI,
  type FreeWorkApiResponse,
} from '../../../src/lib/core/connectors/freework-parser';
import { runFreeWorkHealthCheck } from './freework.health';

const API_BASE = 'https://www.free-work.com/api/job_postings';
const TIMEOUT = parseInt(process.env.HEALTH_CHECK_TIMEOUT ?? '30000', 10);

test.describe('FreeWork Health Check', () => {
  test('API endpoint responds with valid JSON', async ({ request }) => {
    const startTime = Date.now();

    const response = await request.get(API_BASE, {
      params: {
        page: '1',
        itemsPerPage: '10',
        contracts: 'contractor',
      },
      headers: {
        Accept: 'application/ld+json',
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
    const data = (await response.json()) as FreeWorkApiResponse;

    // Validate structure
    expect(data).toHaveProperty('hydra:member');
    expect(Array.isArray(data['hydra:member'])).toBe(true);
    expect(data['hydra:member'].length, 'No missions returned').toBeGreaterThan(0);

    // Log response time
    console.log(
      `[FreeWork] Response time: ${responseTime}ms, Missions: ${data['hydra:member'].length}`
    );
  });

  test('Parser extracts valid missions from API response', async ({ request }) => {
    const response = await request.get(API_BASE, {
      params: {
        page: '1',
        itemsPerPage: '10',
        contracts: 'contractor',
      },
      headers: {
        Accept: 'application/ld+json',
      },
      timeout: TIMEOUT,
    });

    expect(response.ok()).toBe(true);

    const data = (await response.json()) as FreeWorkApiResponse;
    const missions = parseFreeWorkAPI(data, new Date());

    // Validate parsed missions
    expect(missions.length, 'Parser returned no missions').toBeGreaterThan(0);

    // Check first mission has required fields
    const first = missions[0];
    expect(first.id).toBeTruthy();
    expect(first.title).toBeTruthy();
    expect(first.source).toBe('free-work');
    expect(first.url).toContain('free-work.com');

    console.log(`[FreeWork] Parsed ${missions.length} missions`);
    console.log(`[FreeWork] Sample: ${first.title} (${first.location})`);
  });

  test('API returns contractor missions only', async ({ request }) => {
    const response = await request.get(API_BASE, {
      params: {
        page: '1',
        itemsPerPage: '50',
        contracts: 'contractor',
      },
      headers: {
        Accept: 'application/ld+json',
      },
      timeout: TIMEOUT,
    });

    expect(response.ok()).toBe(true);

    const data = (await response.json()) as FreeWorkApiResponse;
    const members = data['hydra:member'];

    // All should have contractor contract type
    for (const m of members) {
      expect(m.contracts).toContain('contractor');
    }

    console.log(`[FreeWork] Verified ${members.length} contractor missions`);
  });

  test('API handles pagination correctly', async ({ request }) => {
    // Fetch page 1
    const page1 = await request.get(API_BASE, {
      params: {
        page: '1',
        itemsPerPage: '5',
        contracts: 'contractor',
      },
      timeout: TIMEOUT,
    });

    expect(page1.ok()).toBe(true);
    const data1 = (await page1.json()) as FreeWorkApiResponse;

    // Fetch page 2
    const page2 = await request.get(API_BASE, {
      params: {
        page: '2',
        itemsPerPage: '5',
        contracts: 'contractor',
      },
      timeout: TIMEOUT,
    });

    expect(page2.ok()).toBe(true);
    const data2 = (await page2.json()) as FreeWorkApiResponse;

    // Pages should have different missions (different IDs)
    const ids1 = new Set(data1['hydra:member'].map((m) => m.id));
    const ids2 = new Set(data2['hydra:member'].map((m) => m.id));

    const overlap = [...ids1].filter((id) => ids2.has(id));
    expect(overlap.length, 'Pages returned same missions').toBe(0);

    console.log(
      `[FreeWork] Pagination verified: page 1 has ${ids1.size} missions, page 2 has ${ids2.size}`
    );
  });
});
