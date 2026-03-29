import { parseHiwayJSON } from '../../../src/lib/core/connectors/hiway-json-parser';
import type { HealthCheckResult } from '../types';

const BASE_URL = 'https://hiway-missions.fr';
const SUPABASE_URL = 'https://jhgjtlkfewuiiofxfrvh.supabase.co';
const SUPABASE_TABLE = 'freelance_posted_missions';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpoZ2p0bGtmZXd1aWlvZnhmcnZoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTA3NTQxMTYsImV4cCI6MjA2NjMzMDExNn0.yK8_ORWq4SYjQH11zvwA4g1MrIeagzErnWtoJWeukPI';
const TIMEOUT = parseInt(process.env.HEALTH_CHECK_TIMEOUT ?? '60000', 10);

export async function runHiwayHealthCheck(): Promise<HealthCheckResult> {
  const startTime = Date.now();
  const timestamp = new Date().toISOString();

  try {
    const endpoint = new URL(`/rest/v1/${SUPABASE_TABLE}`, SUPABASE_URL);
    endpoint.searchParams.set('select', '*');
    endpoint.searchParams.set('order', 'created_at.desc');
    endpoint.searchParams.set('limit', '10');

    const response = await fetch(endpoint.toString(), {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(TIMEOUT),
    });

    const responseTime = Date.now() - startTime;

    if (!response.ok) {
      return {
        connectorId: 'hiway',
        connectorName: 'Hiway',
        status: 'failed',
        responseTimeMs: responseTime,
        timestamp,
        error: `API returned status ${response.status}`,
        errorDetails: { status: response.status },
      };
    }

    const data = (await response.json()) as unknown[];
    const missions = parseHiwayJSON(data, new Date(), BASE_URL);

    if (missions.length === 0) {
      return {
        connectorId: 'hiway',
        connectorName: 'Hiway',
        status: 'failed',
        responseTimeMs: responseTime,
        timestamp,
        error: 'No missions returned from API',
        missionsFound: 0,
      };
    }

    return {
      connectorId: 'hiway',
      connectorName: 'Hiway',
      status: 'ok',
      responseTimeMs: responseTime,
      timestamp,
      missionsFound: missions.length,
      metadata: {
        sampleTitle: missions[0].title,
        sampleLocation: missions[0].location,
        rawCount: data.length,
      },
    };
  } catch (error) {
    const responseTime = Date.now() - startTime;
    const isTimeout = error instanceof Error && error.name === 'TimeoutError';

    return {
      connectorId: 'hiway',
      connectorName: 'Hiway',
      status: isTimeout ? 'timeout' : 'failed',
      responseTimeMs: responseTime,
      timestamp,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
