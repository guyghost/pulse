import { BaseConnector } from './base.connector';
import type { Mission } from '../../core/types/mission';
import type { ConnectorSearchContext } from '../../core/connectors/search-context';
import { parseFreeWorkAPI, type FreeWorkApiResponse } from '../../core/connectors/freework-parser';
import { globalRateLimiter } from '../utils/rate-limiter';
import { type Result, type AppError, ok, err, createConnectorError } from '$lib/core/errors';
import {
  type RequestHeaderRuleHeader,
  injectRequestHeaderRule,
  removeCookieRule,
} from './cookie-rules';

const BASE_URL = 'https://www.free-work.com';
const API_BASE = `${BASE_URL}/api/job_postings`;
export const FREEWORK_ITEMS_PER_PAGE = 100;
const PAGE_CONCURRENCY = 3;
const HEADER_RULE_ID = 3;
const REQUEST_DOMAIN = 'www.free-work.com';
const URL_FILTER = '|https://www.free-work.com/api/';
const FREEWORK_HEADERS: RequestHeaderRuleHeader[] = [
  { header: 'Origin', value: BASE_URL },
  { header: 'Referer', value: `${BASE_URL}/` },
];
/** Max age in days — stop paginating when missions are older than this */
const MAX_AGE_DAYS = 30;
const MAX_AGE_MS = MAX_AGE_DAYS * 24 * 60 * 60 * 1000;

interface FreeWorkPageResult {
  page: number;
  missions: Mission[];
  totalItems: number | null;
  shouldStop: boolean;
}

export function buildFreeWorkApiUrl(
  page: number,
  context?: ConnectorSearchContext,
  itemsPerPage = FREEWORK_ITEMS_PER_PAGE
): string {
  const url = new URL(API_BASE);
  url.searchParams.set('page', String(page));
  url.searchParams.set('itemsPerPage', String(itemsPerPage));
  url.searchParams.set('contracts', 'contractor');

  if (context?.tjmMin && context.tjmMin > 0) {
    url.searchParams.set('minDailySalary', String(context.tjmMin));
  }

  return url.toString();
}

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
  async detectSession(_now: number): Promise<Result<boolean, AppError>> {
    return ok(true);
  }

  async fetchMissions(
    now: number,
    context?: ConnectorSearchContext,
    signal?: AbortSignal
  ): Promise<Result<Mission[], AppError>> {
    try {
      await injectRequestHeaderRule({
        ruleId: HEADER_RULE_ID,
        urlFilter: URL_FILTER,
        requestDomains: [REQUEST_DOMAIN],
        requestHeaders: FREEWORK_HEADERS,
      });
      const allMissions: Mission[] = [];
      const scrapedAt = new Date(now);

      const fetchPage = async (page: number): Promise<Result<FreeWorkPageResult, AppError>> => {
        if (signal?.aborted) {
          return ok({ page, missions: [], totalItems: null, shouldStop: true });
        }

        const url = buildFreeWorkApiUrl(page, context);
        await globalRateLimiter.acquire(url, signal);

        const result = await this.fetchJSON(
          url,
          now,
          {
            headers: {
              Accept: 'application/ld+json',
              // Free-Work API uses Accept-Language to filter results by locale.
              // Without 'fr', the API returns 0 results for English locales.
              // This was invisible on Chrome (system locale fr-FR) but broke on
              // browsers defaulting to en-US (Dia, Arc, etc.).
              'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.1',
            },
            credentials: 'omit', // Public API — no cookies needed
          },
          signal
        );

        if (!result.ok) {
          if (import.meta.env.DEV) {
            console.error(`[FreeWork] Page ${page} fetch failed:`, result.error.message);
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

        // Validate response shape BEFORE parsing — catch silent failures.
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
          return ok({ page, missions: [], totalItems: null, shouldStop: true });
        }

        const data = result.value as FreeWorkApiResponse;
        const missions = parseFreeWorkAPI(data, scrapedAt);
        const totalItems =
          typeof data['hydra:totalItems'] === 'number' ? data['hydra:totalItems'] : null;

        if (import.meta.env.DEV) {
          console.debug(
            `[FreeWork] Page ${page}: ${missions.length} missions (total: ${data['hydra:totalItems'] ?? '?'})`
          );
        }

        if (missions.length === 0) {
          return ok({ page, missions: [], totalItems, shouldStop: true });
        }

        // Early termination: FreeWork results are ordered by publishedAt DESC.
        // If the last mission on this page is older than MAX_AGE_DAYS, stop paginating.
        const lastMission = missions[missions.length - 1];
        if (lastMission.publishedAt) {
          const publishedDate = new Date(lastMission.publishedAt);
          const ageMs = now - publishedDate.getTime();
          if (ageMs > MAX_AGE_MS) {
            // Keep only fresh missions from this page (some may still be within range)
            const freshOnPage = missions.filter((m) => {
              if (!m.publishedAt) {
                return true;
              }
              return now - new Date(m.publishedAt).getTime() <= MAX_AGE_MS;
            });
            if (import.meta.env.DEV) {
              console.debug(
                `[FreeWork] Stopping at page ${page}: last mission older than ${MAX_AGE_DAYS} days. Kept ${freshOnPage.length}/${missions.length} from this page.`
              );
            }
            return ok({ page, missions: freshOnPage, totalItems, shouldStop: true });
          }
        }

        return ok({ page, missions, totalItems, shouldStop: false });
      };

      const firstPage = await fetchPage(1);
      if (!firstPage.ok) {
        return firstPage;
      }

      allMissions.push(...firstPage.value.missions);
      if (firstPage.value.shouldStop) {
        return ok(allMissions);
      }

      const totalPages =
        firstPage.value.totalItems === null
          ? Number.POSITIVE_INFINITY
          : Math.ceil(firstPage.value.totalItems / FREEWORK_ITEMS_PER_PAGE);
      let nextPage = 2;
      let shouldStop = false;

      while (!shouldStop && nextPage <= totalPages) {
        if (signal?.aborted) {
          break;
        }

        const pages: number[] = [];
        while (pages.length < PAGE_CONCURRENCY && nextPage <= totalPages) {
          pages.push(nextPage);
          nextPage += 1;
        }

        const pageResults = await Promise.all(pages.map((page) => fetchPage(page)));

        for (const pageResult of pageResults) {
          if (!pageResult.ok) {
            return pageResult;
          }

          allMissions.push(...pageResult.value.missions);
          if (pageResult.value.shouldStop) {
            shouldStop = true;
            break;
          }
        }
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
    } finally {
      await removeCookieRule(HEADER_RULE_ID);
    }
  }
}
