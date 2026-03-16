import { BaseConnector } from './base.connector';
import type { Mission } from '../../core/types/mission';
import { parseHiwayHTML } from '../../core/connectors/hiway-parser';
import { delayBetweenPages } from '../utils/rate-limiter';
import {
  type Result,
  type AppError,
  ok,
  err,
  createConnectorError,
} from '$lib/core/errors';

const BASE_URL = 'https://hiway-missions.fr';
const MISSIONS_URL = `${BASE_URL}/admin/freelance/missions`;
const MAX_PAGES = 5;

export class HiwayConnector extends BaseConnector {
  readonly id = 'hiway';
  readonly name = 'Hiway';
  readonly baseUrl = BASE_URL;
  readonly icon = 'https://www.google.com/s2/favicons?domain=hiway-missions.fr&sz=32';

  protected get sessionCheckUrl() { return MISSIONS_URL; }

  async fetchMissions(now: number): Promise<Result<Mission[], AppError>> {
    try {
      const allMissions: Mission[] = [];

      for (let page = 1; page <= MAX_PAGES; page++) {
        // Délai entre les pages (sauf première)
        if (page > 1) {
          await delayBetweenPages(this.id, page);
        }

        const url = page === 1 ? MISSIONS_URL : `${MISSIONS_URL}?page=${page}`;
        const result = await this.fetchHTML(url, now);

        if (!result.ok) {
          return err(createConnectorError(
            `Failed to fetch page ${page} from Hiway`,
            { connectorId: this.id, phase: 'fetch', context: { page, originalError: result.error } },
            now
          ));
        }

        const missions = parseHiwayHTML(result.value, new Date(now));
        if (missions.length === 0) break;
        allMissions.push(...missions);
      }

      const syncResult = await this.setLastSync(now);
      if (!syncResult.ok) {
        console.warn('Failed to set last sync:', syncResult.error);
      }

      return ok(allMissions);
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
