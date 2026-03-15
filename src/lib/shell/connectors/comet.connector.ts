import { BaseConnector } from './base.connector';
import type { Mission } from '../../core/types/mission';
import { parseCometMissions } from '../../core/connectors/comet-parser';

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

  async fetchMissions(): Promise<Mission[]> {
    const response = await this.fetchJSON(GRAPHQL_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: MISSIONS_QUERY }),
    });

    const missions = response?.data?.freelanceSuggestedMission;
    if (!Array.isArray(missions)) return [];

    const now = new Date();
    const result = parseCometMissions(missions, now);
    await this.setLastSync();
    return result;
  }
}
