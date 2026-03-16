import { BaseConnector } from './base.connector';
import type { Mission } from '../../core/types/mission';
import { parseCherryPickMissions, type CherryPickMission } from '../../core/connectors/cherrypick-parser';
import {
  type Result,
  type AppError,
  ok,
  err,
  createConnectorError,
} from '$lib/core/errors';

const BASE_URL = 'https://app.cherry-pick.io';
const SEARCH_URL = `${BASE_URL}/api/mission/search`;

export class CherryPickConnector extends BaseConnector {
  readonly id = 'cherry-pick';
  readonly name = 'Cherry Pick';
  readonly baseUrl = BASE_URL;
  readonly icon = 'https://www.google.com/s2/favicons?domain=cherry-pick.io&sz=32';

  protected get sessionCheckUrl() { return `${BASE_URL}/dashboard`; }

  async fetchMissions(now: number): Promise<Result<Mission[], AppError>> {
    try {
      const result = await this.fetchJSON(SEARCH_URL, now, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      if (!result.ok) {
        return err(createConnectorError(
          'Failed to fetch missions from Cherry Pick',
          { connectorId: this.id, phase: 'fetch', context: { originalError: result.error } },
          now
        ));
      }

      const response = result.value as { data?: CherryPickMission[] };
      const missions = response?.data;
      
      if (!Array.isArray(missions)) {
        return ok([]);
      }

      const parsedMissions = parseCherryPickMissions(missions, new Date(now));
      
      const syncResult = await this.setLastSync(now);
      if (!syncResult.ok) {
        console.warn('Failed to set last sync:', syncResult.error);
      }
      
      return ok(parsedMissions);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return err(createConnectorError(
        `Unexpected error fetching missions from Cherry Pick: ${message}`,
        { connectorId: this.id, phase: 'fetch', context: { originalError: message } },
        now
      ));
    }
  }
}
