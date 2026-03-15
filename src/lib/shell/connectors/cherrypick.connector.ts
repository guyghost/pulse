import { BaseConnector } from './base.connector';
import type { Mission } from '../../core/types/mission';
import { parseCherryPickMissions } from '../../core/connectors/cherrypick-parser';

const BASE_URL = 'https://app.cherry-pick.io';
const SEARCH_URL = `${BASE_URL}/api/mission/search`;

export class CherryPickConnector extends BaseConnector {
  readonly id = 'cherry-pick';
  readonly name = 'Cherry Pick';
  readonly baseUrl = BASE_URL;
  readonly icon = 'https://www.google.com/s2/favicons?domain=cherry-pick.io&sz=32';

  protected get sessionCheckUrl() { return `${BASE_URL}/dashboard`; }

  async fetchMissions(): Promise<Mission[]> {
    const response = await this.fetchJSON(SEARCH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    const missions = response?.data;
    if (!Array.isArray(missions)) return [];

    const result = parseCherryPickMissions(missions, new Date());
    await this.setLastSync();
    return result;
  }
}
