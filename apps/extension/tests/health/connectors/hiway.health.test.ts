/**
 * Hiway Connector Health Check
 *
 * Tests the Hiway Supabase API to ensure:
 * - Supabase endpoint is reachable
 * - Response structure is valid JSON
 * - Parser can extract missions
 * - At least one mission is returned
 *
 * @see https://hiway-missions.fr
 */

import { test, expect } from '@playwright/test';
import {
  parseHiwayJSON,
  type HiwayMissionRow,
} from '../../../src/lib/core/connectors/hiway-json-parser';
import { runHiwayHealthCheck } from './hiway.health';

const BASE_URL = 'https://hiway-missions.fr';
const SUPABASE_URL = 'https://jhgjtlkfewuiiofxfrvh.supabase.co';
const SUPABASE_TABLE = 'freelance_posted_missions';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpoZ2p0bGtmZXd1aWlvZnhmcnZoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTA3NTQxMTYsImV4cCI6MjA2NjMzMDExNn0.yK8_ORWq4SYjQH11zvwA4g1MrIeagzErnWtoJWeukPI';
const TIMEOUT = parseInt(process.env.HEALTH_CHECK_TIMEOUT ?? '60000', 10);

test.describe('Hiway Health Check', () => {
  test('Supabase API endpoint responds with valid JSON', async ({ request }) => {
    const startTime = Date.now();

    const endpoint = new URL(`/rest/v1/${SUPABASE_TABLE}`, SUPABASE_URL);
    endpoint.searchParams.set('select', '*');
    endpoint.searchParams.set('order', 'created_at.desc');
    endpoint.searchParams.set('limit', '10');

    const response = await request.get(endpoint.toString(), {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
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
    expect(Array.isArray(data), 'Response is not an array').toBe(true);
    expect(data.length, 'No missions returned').toBeGreaterThan(0);

    console.log(`[Hiway] Response time: ${responseTime}ms, Missions: ${data.length}`);
  });

  test('Parser extracts valid missions from API response', async ({ request }) => {
    const endpoint = new URL(`/rest/v1/${SUPABASE_TABLE}`, SUPABASE_URL);
    endpoint.searchParams.set('select', '*');
    endpoint.searchParams.set('order', 'created_at.desc');
    endpoint.searchParams.set('limit', '10');

    const response = await request.get(endpoint.toString(), {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      timeout: TIMEOUT,
    });

    expect(response.ok()).toBe(true);

    const data = (await response.json()) as unknown[];
    const missions = parseHiwayJSON(data, new Date(), BASE_URL);

    // Validate parsed missions
    expect(missions.length, 'Parser returned no missions').toBeGreaterThan(0);

    // Check first mission has required fields
    const first = missions[0];
    expect(first.id).toBeTruthy();
    expect(first.title).toBeTruthy();
    expect(first.source).toBe('hiway');
    expect(first.url).toContain('hiway');

    console.log(`[Hiway] Parsed ${missions.length} missions`);
    console.log(`[Hiway] Sample: ${first.title} (${first.location})`);
  });

  test('API response contains expected fields', async ({ request }) => {
    const endpoint = new URL(`/rest/v1/${SUPABASE_TABLE}`, SUPABASE_URL);
    endpoint.searchParams.set('select', '*');
    endpoint.searchParams.set('order', 'created_at.desc');
    endpoint.searchParams.set('limit', '5');

    const response = await request.get(endpoint.toString(), {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      },
      timeout: TIMEOUT,
    });

    expect(response.ok()).toBe(true);

    const data = (await response.json()) as HiwayMissionRow[];

    // Check first row has at least some expected fields
    const first = data[0];
    expect(first).toBeDefined();

    // At minimum should have id
    expect(first.id, 'Mission missing id field').toBeTruthy();

    // Log available fields for debugging
    const fields = Object.keys(first);
    console.log(`[Hiway] Available fields: ${fields.join(', ')}`);
  });

  test('Website homepage loads successfully', async ({ page }) => {
    const startTime = Date.now();

    await page.goto(BASE_URL, { timeout: TIMEOUT, waitUntil: 'domcontentloaded' });

    const responseTime = Date.now() - startTime;

    // Check page loaded
    await expect(page).toHaveTitle(/Hiway|Mission/i);

    console.log(`[Hiway] Homepage load time: ${responseTime}ms`);
  });
});
