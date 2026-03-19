import { BaseConnector } from './base.connector';
import type { Mission } from '../../core/types/mission';
import { parseLeHibouHTML } from '../../core/connectors/lehibou-parser';
import { delayBetweenPages } from '../utils/rate-limiter';
import {
  type Result,
  type AppError,
  ok,
  err,
  createConnectorError,
} from '$lib/core/errors';

const BASE_URL = 'https://www.lehibou.com';
const ANNONCES_URL = `${BASE_URL}/recherche/annonces`;
const MAX_PAGES = 5;

export class LeHibouConnector extends BaseConnector {
  readonly id = 'lehibou';
  readonly name = 'LeHibou';
  readonly baseUrl = BASE_URL;
  readonly icon = 'https://www.google.com/s2/favicons?domain=lehibou.com&sz=32';

  protected get sessionCheckUrl() { return ANNONCES_URL; }

  /**
   * LeHibou est derriere Cloudflare — la detection de session peut echouer
   * meme si l'utilisateur est connecte. On tente toujours le fetch.
   */
  async detectSession(now: number): Promise<Result<boolean, AppError>> {
    const result = await super.detectSession(now);
    // Si la detection echoue (Cloudflare), on tente quand meme
    if (!result.ok || result.value === false) {
      return ok(true);
    }
    return result;
  }

  async fetchMissions(now: number): Promise<Result<Mission[], AppError>> {
    try {
      const allMissions: Mission[] = [];

      for (let page = 1; page <= MAX_PAGES; page++) {
        // Délai entre les pages (sauf première)
        if (page > 1) {
          await delayBetweenPages(this.id, page);
        }

        const url = page === 1 ? ANNONCES_URL : `${ANNONCES_URL}?page=${page}`;
        const result = await this.fetchHTML(url, now);
        
        if (!result.ok) {
          return err(createConnectorError(
            `Failed to fetch page ${page} from LeHibou`,
            { connectorId: this.id, phase: 'fetch', context: { page, originalError: result.error } },
            now
          ));
        }

        const missions = parseLeHibouHTML(result.value, new Date(now));
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
        `Unexpected error fetching missions from LeHibou: ${message}`,
        { connectorId: this.id, phase: 'fetch', context: { originalError: message } },
        now
      ));
    }
  }
}
