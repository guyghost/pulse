import { BaseConnector } from './base.connector';
import type { Mission } from '../../core/types/mission';
import { extractCollectiveProjects, parseCollectiveProjects } from '../../core/connectors/collective-parser';
import { delayBetweenPages } from '../utils/rate-limiter';
import {
  type Result,
  type AppError,
  ok,
  err,
  createConnectorError,
} from '$lib/core/errors';

const BASE_URL = 'https://www.collective.work';
const JOB_URL = `${BASE_URL}/jobs/fr`;
const MAX_PAGES = 5;

export class CollectiveConnector extends BaseConnector {
  readonly id = 'collective';
  readonly name = 'Collective';
  readonly baseUrl = BASE_URL;
  readonly icon = 'https://www.google.com/s2/favicons?domain=collective.work&sz=32';

  protected get sessionCheckUrl(): string {
    return JOB_URL;
  }

  /**
   * Collective est derriere Cloudflare — la detection de session peut echouer
   * meme si l'utilisateur est connecte. On tente toujours le fetch.
   */
  async detectSession(now: number): Promise<Result<boolean, AppError>> {
    const result = await super.detectSession(now);
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

        const url = page === 1 ? JOB_URL : `${JOB_URL}?page=${page}`; // /jobs/fr?page=N
        const result = await this.fetchHTML(url, now);
        
        if (!result.ok) {
          return err(createConnectorError(
            `Failed to fetch page ${page} from Collective`,
            { connectorId: this.id, phase: 'fetch', context: { page, originalError: result.error } },
            now
          ));
        }

        const projects = extractCollectiveProjects(result.value);
        if (projects.length === 0) break;
        
        const missions = parseCollectiveProjects(projects, new Date(now));
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
        `Unexpected error fetching missions from Collective: ${message}`,
        { connectorId: this.id, phase: 'fetch', context: { originalError: message } },
        now
      ));
    }
  }
}
