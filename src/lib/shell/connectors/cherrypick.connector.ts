import type { ConnectorSearchContext } from '../../core/connectors/search-context';
import type { Mission } from '../../core/types/mission';
import {
  parseCherryPickMissions,
  type CherryPickMission,
} from '../../core/connectors/cherrypick-parser';
import { delayBetweenPages } from '../utils/rate-limiter';
import { BaseConnector } from './base.connector';
import { type Result, type AppError, ok, err, createConnectorError } from '$lib/core/errors';

const BASE_URL = 'https://app.cherry-pick.io';
const SEARCH_URL = `${BASE_URL}/api/mission/search`;
const MAX_PAGES = 5;

export class CherryPickConnector extends BaseConnector {
  readonly id = 'cherry-pick';
  readonly name = 'Cherry Pick';
  readonly baseUrl = BASE_URL;
  readonly icon = 'https://www.google.com/s2/favicons?domain=cherry-pick.io&sz=32';

  protected get sessionCheckUrl() {
    return `${BASE_URL}/dashboard`;
  }

  async fetchMissions(
    now: number,
    context?: ConnectorSearchContext
  ): Promise<Result<Mission[], AppError>> {
    try {
      const allMissions: Mission[] = [];

      for (let page = 1; page <= MAX_PAGES; page++) {
        // Délai entre les pages (sauf première)
        if (page > 1) {
          await delayBetweenPages(this.id, page);
        }

        // Build request body with search context
        const body: Record<string, unknown> = { page };
        if (context?.query) {
          body.search = context.query;
        }
        if (context?.skills?.length) {
          body.skills = context.skills;
        }

        // Paramètre de pagination : { page: N } est le pattern le plus courant
        // pour les API REST paginées type Laravel/Symfony
        const result = await this.fetchJSON(SEARCH_URL, now, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });

        if (!result.ok) {
          return err(
            createConnectorError(
              `Failed to fetch page ${page} from Cherry Pick`,
              {
                connectorId: this.id,
                phase: 'fetch',
                context: { page, originalError: result.error },
              },
              now
            )
          );
        }

        const response = result.value as { data?: CherryPickMission[] };
        const missions = response?.data;

        if (!Array.isArray(missions) || missions.length === 0) break;

        const parsedMissions = parseCherryPickMissions(missions, new Date(now));
        allMissions.push(...parsedMissions);
      }

      // Last sync tracking (non-critical)
      this.setLastSync(now).catch(() => {});

      return ok(allMissions);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return err(
        createConnectorError(
          `Unexpected error fetching missions from Cherry Pick: ${message}`,
          { connectorId: this.id, phase: 'fetch', context: { originalError: message } },
          now
        )
      );
    }
  }
}
