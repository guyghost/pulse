import { BaseConnector } from './base.connector';
import type { Mission } from '../../core/types/mission';
import { parseCometMissions, type CometMission } from '../../core/connectors/comet-parser';
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

const MISSIONS_QUERY = `query SuggestedMissionList {
  freelanceSuggestedMission {
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
      const result = await this.fetchJSON(GRAPHQL_URL, now, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: MISSIONS_QUERY }),
      });

      if (!result.ok) {
        return err(createConnectorError(
          'Failed to fetch missions from Comet',
          { connectorId: this.id, phase: 'fetch', context: { originalError: result.error } },
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

      const parsedMissions = parseCometMissions(missions, new Date(now));
      
      const syncResult = await this.setLastSync(now);
      if (!syncResult.ok) {
        console.warn('Failed to set last sync:', syncResult.error);
      }
      
      return ok(parsedMissions);
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
