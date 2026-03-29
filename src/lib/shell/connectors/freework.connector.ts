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

        // Build URL with search context using URL API for proper encoding
        const url = new URL(API_BASE);
        url.searchParams.set('page', String(page));
        url.searchParams.set('itemsPerPage', String(ITEMS_PER_PAGE));
        url.searchParams.set('contracts', 'contractor');
        // Note: order[publishedAt]=desc is listed in hydra:search but returns 400.
        // The API already returns newest first by default.

        // Server-side keyword search on title + reference
        if (context?.query) {
          url.searchParams.set('q', context.query);
        }

        // Skill/property filtering
        if (context?.skills.length) {
          for (const skill of context.skills) {
            url.searchParams.append('properties[]', skill);
          }
        }

        // Incremental: only fetch missions published after last sync
        if (context?.lastSync) {
          url.searchParams.set('createdAt[after]', context.lastSync.toISOString());
        }

        const result = await this.fetchJSON(url.toString(), now, {
          headers: { Accept: 'application/ld+json' },
          credentials: 'omit', // Public API — no cookies needed
        });

        if (!result.ok) {
          return err(
            createConnectorError(
              `Failed to fetch page ${page} from Free-Work`,
              {
                connectorId: this.id,
                phase: 'fetch',
                context: { page, originalError: result.error },
              },
              now
            )
          );
        }

        const data = result.value as FreeWorkApiResponse;
        const missions = parseFreeWorkAPI(data, new Date(now));

        if (missions.length === 0) break;
        allMissions.push(...missions);
      }

      // Last sync tracking (non-critical)
      this.setLastSync(now).catch(() => {});

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
