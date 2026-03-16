import { BaseConnector } from './base.connector';
import type { Mission } from '../../core/types/mission';
import { parseCometMissions, type CometMission } from '../../core/connectors/comet-parser';
import { delayBetweenPages } from '../utils/rate-limiter';
import {
  type Result,
  type AppError,
  ok,
  err,
  createConnectorError,
  createParsingError,
} from '$lib/core/errors';

const BASE_URL = 'https://app.comet.co';
const GRAPHQL_URL = 'https://api.comet.co/api/graphql';
const ITEMS_PER_PAGE = 50;
const MAX_PAGES = 5;

// Pagination GraphQL par offset/limit — pattern courant pour les requêtes
// de liste Comet (l'API accepte $limit et $offset comme variables)
const MISSIONS_QUERY = `query SuggestedMissionList($limit: Int, $offset: Int) {
  freelanceSuggestedMission(limit: $limit, offset: $offset) {
    id
    status
    title
    durationInDays
    startDate
    prefWorkplace
    experienceLevel
    createdAt
    address { id city }
    skills(primary: true) { id name }
  }
}`;

export class CometConnector extends BaseConnector {
  readonly id = 'comet';
  readonly name = 'Comet';
  readonly baseUrl = BASE_URL;
  readonly icon = 'https://www.google.com/s2/favicons?domain=comet.co&sz=32';

  protected get sessionCheckUrl() { return `${BASE_URL}/freelancer/dashboard`; }

  async fetchMissions(now: number): Promise<Result<Mission[], AppError>> {
    try {
      const allMissions: Mission[] = [];

      for (let page = 0; page < MAX_PAGES; page++) {
        // Délai entre les pages (sauf première)
        if (page > 0) {
          await delayBetweenPages(this.id, page + 1);
        }

        const result = await this.fetchJSON(GRAPHQL_URL, now, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: MISSIONS_QUERY,
            variables: { limit: ITEMS_PER_PAGE, offset: page * ITEMS_PER_PAGE },
          }),
        });

        if (!result.ok) {
          return err(createConnectorError(
            `Failed to fetch page ${page + 1} from Comet`,
            { connectorId: this.id, phase: 'fetch', context: { page: page + 1, originalError: result.error } },
            now
          ));
        }

        const response = result.value as { data?: { freelanceSuggestedMission?: CometMission[] } };
        const missions = response?.data?.freelanceSuggestedMission;

        if (!Array.isArray(missions)) {
          return err(createParsingError(
            'Invalid response format from Comet API',
            { source: 'comet-api', context: { response } },
            now
          ));
        }

        if (missions.length === 0) break;

        const parsedMissions = parseCometMissions(missions, new Date(now));
        allMissions.push(...parsedMissions);
      }

      const syncResult = await this.setLastSync(now);
      if (!syncResult.ok) {
        console.warn('Failed to set last sync:', syncResult.error);
      }

      return ok(allMissions);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return err(createConnectorError(
        `Unexpected error fetching missions from Comet: ${message}`,
        { connectorId: this.id, phase: 'fetch', context: { originalError: message } },
        now
      ));
    }
  }
}
