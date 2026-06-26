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

export class CherryPickConnector extends BaseConnector {
  readonly id = 'cherry-pick';
  readonly name = 'Cherry Pick';
  readonly baseUrl = BASE_URL;
  readonly icon = 'https://www.google.com/s2/favicons?domain=cherry-pick.io&sz=32';

  /**
   * Cherry Pick exposes mission search through a public API.
   * Session detection must not depend on browser cookies because anonymous users
   * can still fetch missions and generic cookies like `laravel_session` would
   * create false positives.
   */
  async detectSession(_now: number): Promise<Result<boolean, AppError>> {
    return ok(true);
  }

  async fetchMissions(
    now: number,
    context?: ConnectorSearchContext
  ): Promise<Result<Mission[], AppError>> {
    try {
      const allMissions: Mission[] = [];

      for (let page = 1; ; page++) {
        // Délai entre les pages (sauf première)
        if (page > 1) {
          await delayBetweenPages(this.id, page);
        }

        // Build request body with search context
        const body: Record<string, unknown> = {
          page,
          // Only fetch freelance/contractor missions (short-term), exclude CDI
          mission_type: 'short',
          // Only fetch published missions — exclude unpublished/closed/archived
          status: 'published',
        };
        if (context?.query) {
          body.search = context.query;
        }
        if (context?.skills?.length) {
          body.skills = context.skills;
        }

        // TJM filter: exclude missions below the user's minimum rate
        if (context?.tjmMin && context.tjmMin > 0) {
          body.minimum_rate = context.tjmMin;
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

        if (!Array.isArray(missions) || missions.length === 0) {
          break;
        }

        const parsedMissions = parseCherryPickMissions(missions, new Date(now));
        allMissions.push(...parsedMissions);
      }

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
