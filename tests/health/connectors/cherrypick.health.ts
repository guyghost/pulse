import { join } from 'node:path';
import {
  parseCherryPickMissions,
  type CherryPickMission,
} from '../../../src/lib/core/connectors/cherrypick-parser';
import type { HealthCheckResult } from '../types';

const BASE_URL = 'https://app.cherry-pick.io';
const SEARCH_URL = `${BASE_URL}/api/mission/search`;
const TIMEOUT = parseInt(process.env.HEALTH_CHECK_TIMEOUT ?? '60000', 10);

export async function runCherryPickHealthCheck(screenshotDir: string): Promise<HealthCheckResult> {
  const { chromium } = await import('@playwright/test');
  const startTime = Date.now();
  const timestamp = new Date().toISOString();

  let screenshotPath: string | undefined;

  try {
    const response = await fetch(SEARCH_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ page: 1 }),
      signal: AbortSignal.timeout(TIMEOUT),
    });

    const responseTime = Date.now() - startTime;

    if (!response.ok) {
      try {
        const browser = await chromium.launch({ headless: true });
        const page = await browser.newPage();

        try {
          await page.goto(BASE_URL, { timeout: TIMEOUT / 2, waitUntil: 'domcontentloaded' });
          screenshotPath = join(screenshotDir, 'cherrypick-error.png');
          await page.screenshot({ path: screenshotPath });
        } finally {
          await browser.close();
        }
      } catch {
        // Ignore screenshot errors
      }

      return {
        connectorId: 'cherry-pick',
        connectorName: 'Cherry Pick',
        status: 'failed',
        responseTimeMs: responseTime,
        timestamp,
        error: `API returned status ${response.status}`,
        errorDetails: { status: response.status },
        screenshotPath,
      };
    }

    const data = (await response.json()) as { data?: CherryPickMission[] };
    const rawMissions = data.data ?? [];

    if (rawMissions.length === 0) {
      return {
        connectorId: 'cherry-pick',
        connectorName: 'Cherry Pick',
        status: 'ok',
        responseTimeMs: responseTime,
        timestamp,
        missionsFound: 0,
        metadata: {
          note: 'API reachable but returned no missions - may require authentication',
        },
      };
    }

    const missions = parseCherryPickMissions(rawMissions, new Date());

    return {
      connectorId: 'cherry-pick',
      connectorName: 'Cherry Pick',
      status: 'ok',
      responseTimeMs: responseTime,
      timestamp,
      missionsFound: missions.length,
      metadata: {
        sampleTitle: missions[0]?.title,
        sampleLocation: missions[0]?.location,
        rawCount: rawMissions.length,
      },
    };
  } catch (error) {
    const responseTime = Date.now() - startTime;
    const isTimeout = error instanceof Error && error.name === 'TimeoutError';

    try {
      const browser = await chromium.launch({ headless: true });
      const page = await browser.newPage();

      try {
        await page.goto(BASE_URL, { timeout: TIMEOUT / 2, waitUntil: 'domcontentloaded' });
        screenshotPath = join(screenshotDir, 'cherrypick-error.png');
        await page.screenshot({ path: screenshotPath });
      } finally {
        await browser.close();
      }
    } catch {
      // Ignore screenshot errors
    }

    return {
      connectorId: 'cherry-pick',
      connectorName: 'Cherry Pick',
      status: isTimeout ? 'timeout' : 'failed',
      responseTimeMs: responseTime,
      timestamp,
      error: error instanceof Error ? error.message : String(error),
      screenshotPath,
    };
  }
}
