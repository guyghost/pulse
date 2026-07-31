import { BaseConnector } from './base.connector';
import type { ConnectorSearchContext } from '../../core/connectors/search-context';
import type { Mission } from '../../core/types/mission';
import { parseMaltJSON } from '../../core/connectors/malt-parser';
import { type Result, type AppError, ok, err, createConnectorError } from '$lib/core/errors';

const BASE_URL = 'https://www.malt.fr';

/**
 * Malt mission search API endpoint.
 *
 * ⚠️ This endpoint is a best-guess based on Malt's SPA structure.
 * Malt is a single-page application — its mission search is served by an
 * internal JSON API, not server-rendered HTML. The exact endpoint should be
 * verified by inspecting network requests on https://www.malt.fr/fr/recherche.
 * Update this constant if the API path changes.
 */
const SEARCH_API_URL = 'https://www.malt.fr/api/projects/search';

/** Maximum missions to request per scan. */
const MAX_RESULTS = 50;

/**
 * Malt connector — fetches missions from Malt's JSON search API.
 *
 * Malt is the largest French freelance marketplace. Unlike HTML-scraped
 * connectors, Malt is a SPA and exposes mission data via a JSON API.
 *
 * Session detection: Malt mission listings are publicly browsable, but an
 * authenticated session provides personalized results. We detect the session
 * via cookies and fetch with credentials included.
 */
export class MaltConnector extends BaseConnector {
  readonly id = 'malt';
  readonly name = 'Malt';
  readonly baseUrl = BASE_URL;
  readonly icon = 'https://www.google.com/s2/favicons?domain=malt.fr&sz=32';

  protected get sessionCheckUrl() {
    return `${BASE_URL}/fr/recherche`;
  }

  /**
   * Detect whether the user has an active Malt session.
   *
   * Checks for Malt session cookies. If no session is found, missions are
   * still fetchable (public search), but results may be limited.
   */
  async detectSession(_now: number): Promise<Result<boolean, AppError>> {
    try {
      const cookies = await chrome.cookies.getAll({ domain: 'malt.fr' });
      const hasSession = cookies.some(
        (c) => c.name.startsWith('malt_session') || c.name === 'session'
      );
      return ok(hasSession);
    } catch {
      // Cookie API unavailable — can't confirm a session. Report honestly so
      // the UI doesn't show a false "connected" state. fetchMissions still
      // attempts the public search endpoint regardless of this result.
      return ok(false);
    }
  }

  async fetchMissions(
    now: number,
    context?: ConnectorSearchContext,
    signal?: AbortSignal
  ): Promise<Result<Mission[], AppError>> {
    try {
      const endpoint = new URL(SEARCH_API_URL);
      endpoint.searchParams.set('size', String(MAX_RESULTS));
      endpoint.searchParams.set('page', '0');
      endpoint.searchParams.set('sort', 'date,desc');

      // Apply server-side keyword filter if the user has search keywords
      if (context?.query) {
        endpoint.searchParams.set('query', context.query);
      }

      const result = await this.fetchJSON(
        endpoint.toString(),
        now,
        {
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
        },
        signal
      );

      if (!result.ok) {
        return err(
          createConnectorError(
            `Failed to fetch missions from Malt: ${result.error.message}`,
            {
              connectorId: this.id,
              phase: 'fetch',
              context: { originalError: result.error },
            },
            now
          )
        );
      }

      // Extract the results array — Malt may wrap it in { results: [...] }
      // or return a flat array. Handle both shapes.
      const data = result.value;
      const rows = extractResultsArray(data);

      const missions = parseMaltJSON(rows, new Date(now), BASE_URL);

      // Client-side TJM filter (server-side rate filtering is unreliable
      // because Malt's API may not support it directly)
      const tjmMin = context?.tjmMin;
      const filtered =
        tjmMin !== null && tjmMin !== undefined && tjmMin > 0
          ? missions.filter((m) => m.tjm === null || m.tjm >= tjmMin)
          : missions;

      return ok(filtered);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return err(
        createConnectorError(
          `Unexpected error fetching missions from Malt: ${message}`,
          {
            connectorId: this.id,
            phase: 'fetch',
            context: { originalError: message },
          },
          now
        )
      );
    }
  }
}

/**
 * Extract the results array from a Malt API response.
 *
 * Handles two possible shapes:
 * - Flat array: `[{ id, title, ... }, ...]`
 * - Wrapped: `{ results: [{ id, title, ... }, ...] }` or `{ data: [...] }`
 */
function extractResultsArray(data: unknown): unknown[] {
  if (Array.isArray(data)) {
    return data;
  }
  if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    if (Array.isArray(obj.results)) {
      return obj.results;
    }
    if (Array.isArray(obj.data)) {
      return obj.data;
    }
    if (Array.isArray(obj.items)) {
      return obj.items;
    }
  }
  return [];
}
