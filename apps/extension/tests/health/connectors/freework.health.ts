import {
  parseFreeWorkAPI,
  type FreeWorkApiResponse,
} from '../../../src/lib/core/connectors/freework-parser';
import type { HealthCheckResult } from '../types';

const API_BASE = 'https://www.free-work.com/api/job_postings';
const TIMEOUT = parseInt(process.env.HEALTH_CHECK_TIMEOUT ?? '30000', 10);

export async function runFreeWorkHealthCheck(): Promise<HealthCheckResult> {
  const startTime = Date.now();
  const timestamp = new Date().toISOString();

  try {
    const response = await fetch(`${API_BASE}?page=1&itemsPerPage=10&contracts=contractor`, {
      headers: { Accept: 'application/ld+json' },
      signal: AbortSignal.timeout(TIMEOUT),
    });

    const responseTime = Date.now() - startTime;

    if (!response.ok) {
      return {
        connectorId: 'free-work',
        connectorName: 'Free-Work',
        status: 'failed',
        responseTimeMs: responseTime,
        timestamp,
        error: `API returned status ${response.status}`,
        errorDetails: { status: response.status },
      };
    }

    const data = (await response.json()) as FreeWorkApiResponse;
    const missions = parseFreeWorkAPI(data, new Date());

    if (missions.length === 0) {
      return {
        connectorId: 'free-work',
        connectorName: 'Free-Work',
        status: 'failed',
        responseTimeMs: responseTime,
        timestamp,
        error: 'No missions returned from API',
        missionsFound: 0,
      };
    }

    return {
      connectorId: 'free-work',
      connectorName: 'Free-Work',
      status: 'ok',
      responseTimeMs: responseTime,
      timestamp,
      missionsFound: missions.length,
      metadata: {
        sampleTitle: missions[0].title,
        sampleLocation: missions[0].location,
      },
    };
  } catch (error) {
    const responseTime = Date.now() - startTime;
    const isTimeout = error instanceof Error && error.name === 'TimeoutError';

    return {
      connectorId: 'free-work',
      connectorName: 'Free-Work',
      status: isTimeout ? 'timeout' : 'failed',
      responseTimeMs: responseTime,
      timestamp,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
