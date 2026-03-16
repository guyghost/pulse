import { BaseConnector } from './base.connector';
import type { Mission } from '../../core/types/mission';
import { parseFreeWorkAPI, type FreeWorkApiResponse } from '../../core/connectors/freework-parser';
import { delayBetweenPages } from '../utils/rate-limiter';
import {
  type Result,
  type AppError,
  ok,
  err,
  createConnectorError,
} from '$lib/core/errors';

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

  async fetchMissions(now: number): Promise<Result<Mission[], AppError>> {
    try {
      const allMissions: Mission[] = [];

      for (let page = 1; page <= MAX_PAGES; page++) {
        // Délai entre les pages (sauf première)
        if (page > 1) {
          await delayBetweenPages(this.id, page);
        }

        const url = `${API_BASE}?page=${page}&itemsPerPage=${ITEMS_PER_PAGE}&contracts=contractor`;
        
        // Utilise fetchJSON du parent qui retourne un Result
        const result = await this.fetchJSON(url, now, {
          headers: { 'Accept': 'application/ld+json' },
        });
        
        if (!result.ok) {
          return err(createConnectorError(
            `Failed to fetch page ${page} from Free-Work`,
            { connectorId: this.id, phase: 'fetch', context: { page, originalError: result.error } },
            now
          ));
        }
        
        const data = result.value as FreeWorkApiResponse;
        const missions = parseFreeWorkAPI(data, new Date(now));
        
        if (missions.length === 0) break;
        allMissions.push(...missions);
      }

      const syncResult = await this.setLastSync(now);
      if (!syncResult.ok) {
        // Log l'erreur mais ne pas bloquer le succès des missions
        console.warn('Failed to set last sync:', syncResult.error);
      }
      
      return ok(allMissions);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return err(createConnectorError(
        `Unexpected error fetching missions from Free-Work: ${message}`,
        { connectorId: this.id, phase: 'fetch', context: { originalError: message } },
        now
      ));
    }
  }
}
