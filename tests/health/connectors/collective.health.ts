import { join } from 'node:path';
import type { HealthCheckResult } from '../types';

const BASE_URL = 'https://app.collective.work';
const API_URL = 'https://api.collective.work/graphql';
const TIMEOUT = parseInt(process.env.HEALTH_CHECK_TIMEOUT ?? '60000', 10);

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

export async function runCollectiveHealthCheck(screenshotDir: string): Promise<HealthCheckResult> {
  const { chromium } = await import('@playwright/test');
  const startTime = Date.now();
  const timestamp = new Date().toISOString();

  let screenshotPath: string | undefined;

  try {
    const response = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
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
      }),
      signal: AbortSignal.timeout(TIMEOUT),
    });

    const responseTime = Date.now() - startTime;
    const data = await response.json();

    if (data.errors) {
      const hasAuthError = data.errors.some(
        (error: { message: string }) =>
          error.message.toLowerCase().includes('auth') ||
          error.message.toLowerCase().includes('unauthenticated')
      );

      if (hasAuthError) {
        const browser = await chromium.launch({ headless: true });
        const page = await browser.newPage();

        try {
          await page.goto(BASE_URL, { timeout: TIMEOUT / 2, waitUntil: 'domcontentloaded' });
          screenshotPath = join(screenshotDir, 'collective-home.png');
          await page.screenshot({ path: screenshotPath });
        } finally {
          await browser.close();
        }

        return {
          connectorId: 'collective',
          connectorName: 'Collective',
          status: 'ok',
          responseTimeMs: responseTime,
          timestamp,
          missionsFound: 0,
          screenshotPath,
          metadata: {
            requiresAuth: true,
            apiReachable: true,
            note: 'API reachable but requires authentication',
          },
        };
      }

      return {
        connectorId: 'collective',
        connectorName: 'Collective',
        status: 'failed',
        responseTimeMs: responseTime,
        timestamp,
        error: 'GraphQL errors returned',
        errorDetails: { errors: data.errors },
      };
    }

    const projects = data.data?.results?.projects ?? [];
    const total = data.data?.results?.pagination?.total ?? 0;

    return {
      connectorId: 'collective',
      connectorName: 'Collective',
      status: 'ok',
      responseTimeMs: responseTime,
      timestamp,
      missionsFound: projects.length,
      metadata: {
        totalMissions: total,
        sampleTitle: projects[0]?.name,
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
        screenshotPath = join(screenshotDir, 'collective-error.png');
        await page.screenshot({ path: screenshotPath });
      } finally {
        await browser.close();
      }
    } catch {
      // Ignore screenshot errors
    }

    return {
      connectorId: 'collective',
      connectorName: 'Collective',
      status: isTimeout ? 'timeout' : 'failed',
      responseTimeMs: responseTime,
      timestamp,
      error: error instanceof Error ? error.message : String(error),
      screenshotPath,
    };
  }
}
