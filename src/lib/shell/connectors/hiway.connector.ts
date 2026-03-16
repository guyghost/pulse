import { BaseConnector } from './base.connector';
import type { Mission } from '../../core/types/mission';
import { parseHiwayHTML } from '../../core/connectors/hiway-parser';
import {
  type Result,
  type AppError,
  ok,
  err,
  createConnectorError,
} from '$lib/core/errors';

const BASE_URL = 'https://hiway-missions.fr';

export class HiwayConnector extends BaseConnector {
  readonly id = 'hiway';
  readonly name = 'Hiway';
  readonly baseUrl = BASE_URL;
  readonly icon = 'https://www.google.com/s2/favicons?domain=hiway-missions.fr&sz=32';

  protected get sessionCheckUrl() { return `${BASE_URL}/admin/freelance/missions`; }

  async fetchMissions(now: number): Promise<Result<Mission[], AppError>> {
    try {
      const result = await this.fetchHTML(`${BASE_URL}/admin/freelance/missions`, now);
      
      if (!result.ok) {
        return err(createConnectorError(
          'Failed to fetch missions from Hiway',
          { connectorId: this.id, phase: 'fetch', context: { originalError: result.error } },
          now
        ));
      }

      const missions = parseHiwayHTML(result.value, new Date(now));
      
      const syncResult = await this.setLastSync(now);
      if (!syncResult.ok) {
        console.warn('Failed to set last sync:', syncResult.error);
      }
      
      return ok(missions);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return err(createConnectorError(
        `Unexpected error fetching missions from Hiway: ${message}`,
        { connectorId: this.id, phase: 'fetch', context: { originalError: message } },
        now
      ));
    }
  }
}
