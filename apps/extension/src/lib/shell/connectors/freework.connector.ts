import { BaseConnector } from './base.connector';
import type { Mission } from '../../core/types/mission';
import type { ConnectorSearchContext } from '../../core/connectors/search-context';
import { parseFreeWorkAPI, type FreeWorkApiResponse } from '../../core/connectors/freework-parser';
import { delayBetweenPages } from '../utils/rate-limiter';
import { type Result, type AppError, ok, err, createConnectorError } from '$lib/core/errors';

const BASE_URL = 'https://www.free-work.com';
const API_BASE = `${BASE_URL}/api/job_postings`;
const ITEMS_PER_PAGE = 50;
const MAX_PAGES = 5;

/**
 * Validates that the API response has the expected Hydra/JSON-LD shape.
 * Returns a diagnostic message if the shape is unexpected.
 */
function validateApiResponse(data: unknown): { valid: boolean; diagnostic: string } {
  if (data === null || data === undefined) {
    return { valid: false, diagnostic: 'Response body is null/undefined' };
  }
  if (typeof data !== 'object') {
    return { valid: false, diagnostic: `Response is ${typeof data}, expected object` };
  }
  const obj = data as Record<string, unknown>;

  if (!('hydra:member' in obj)) {
    const keys = Object.keys(obj).slice(0, 10).join(', ');
    return {
      valid: false,
      diagnostic: `Response missing "hydra:member". Keys found: [${keys}]`,
    };
  }
  if (!Array.isArray(obj['hydra:member'])) {
    return {
      valid: false,
      diagnostic: `"hydra:member" is ${typeof obj['hydra:member']}, expected array`,
    };
  }
  return { valid: true, diagnostic: `OK (${(obj['hydra:member'] as unknown[]).length} items)` };
}

export class FreeWorkConnector extends BaseConnector {
  readonly id = 'free-work';
  readonly name = 'Free-Work';
  readonly baseUrl = BASE_URL;
  readonly icon = 'https://www.google.com/s2/favicons?domain=free-work.com&sz=32';

  /** Free-Work API is public — no session needed */
  async detectSession(now: number): Promise<Result<boolean, AppError>> {
    return ok(true);
  }

  async fetchMissions(
    now: number,
    context?: ConnectorSearchContext
  ): Promise<Result<Mission[], AppError>> {
    try {
      const allMissions: Mission[] = [];

      for (let page = 1; page <= MAX_PAGES; page++) {
        if (page > 1) {
          await delayBetweenPages(this.id, page);
        }

        const url = new URL(API_BASE);
        url.searchParams.set('page', String(page));
        url.searchParams.set('itemsPerPage', String(ITEMS_PER_PAGE));
        url.searchParams.set('contracts', 'contractor');

        if (context?.query) {
          url.searchParams.set('q', context.query);
        }

        if (context?.skills.length) {
          for (const skill of context.skills) {
            url.searchParams.append('properties[]', skill);
          }
        }

        const result = await this.fetchJSON(url.toString(), now, {
          headers: {
            Accept: 'application/ld+json',
            // Free-Work API uses Accept-Language to filter results by locale.
            // Without 'fr', the API returns 0 results for English locales.
            // This was invisible on Chrome (system locale fr-FR) but broke on
            // browsers defaulting to en-US (Dia, Arc, etc.).
            'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.1',
          },
          credentials: 'omit', // Public API — no cookies needed
        });

        if (!result.ok) {
          if (import.meta.env.DEV) {
            console.error(
              `[FreeWork] Page ${page} fetch failed:`,
              result.error.message
            );
          }
          return err(
            createConnectorError(
              `Free-Work page ${page}: ${result.error.message}`,
              {
                connectorId: this.id,
                phase: 'fetch',
                context: { page, originalError: result.error },
              },
              now
            )
          );
        }

        // Validate response shape BEFORE parsing — catch silent failures
        const validation = validateApiResponse(result.value);
        if (!validation.valid) {
          if (page === 1) {
            return err(
              createConnectorError(
                `Free-Work API returned unexpected format: ${validation.diagnostic}`,
                {
                  connectorId: this.id,
                  phase: 'parse',
                  context: {
                    page,
                    diagnostic: validation.diagnostic,
                    responsePreview: JSON.stringify(result.value).slice(0, 500),
                  },
                },
                now
              )
            );
          }
          break;
        }

        const data = result.value as FreeWorkApiResponse;
        const missions = parseFreeWorkAPI(data, new Date(now));

        if (import.meta.env.DEV) {
          console.log(
            `[FreeWork] Page ${page}: ${missions.length} missions (total: ${data['hydra:totalItems'] ?? '?'})`
          );
        }

        if (missions.length === 0) break;
        allMissions.push(...missions);
      }

      return ok(allMissions);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return err(
        createConnectorError(
          `Unexpected error fetching missions from Free-Work: ${message}`,
          { connectorId: this.id, phase: 'fetch', context: { originalError: message } },
          now
        )
      );
    }
  }
}
