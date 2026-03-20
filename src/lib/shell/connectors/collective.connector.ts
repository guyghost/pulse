import { BaseConnector } from './base.connector';
import type { Mission } from '../../core/types/mission';
import { extractCollectiveProjects, parseCollectiveProjects } from '../../core/connectors/collective-parser';
import {
  type Result,
  type AppError,
  ok,
  err,
  createConnectorError,
} from '$lib/core/errors';

const APP_URL = 'https://app.collective.work';
const USER_ID_PATTERN = /\/collective\/([^/]+)/;

export class CollectiveConnector extends BaseConnector {
  readonly id = 'collective';
  readonly name = 'Collective';
  readonly baseUrl = APP_URL;
  readonly icon = 'https://www.google.com/s2/favicons?domain=collective.work&sz=32';

  private userId: string | null = null;

  protected get sessionCheckUrl(): string {
    return APP_URL;
  }

  /**
   * Détecte la session en suivant la redirection vers /collective/<userId>/
   * Si l'utilisateur est connecté, l'app redirige vers son dashboard.
   */
  async detectSession(now: number): Promise<Result<boolean, AppError>> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      const response = await fetch(APP_URL, {
        credentials: 'include',
        redirect: 'follow',
        signal: controller.signal,
      });
      clearTimeout(timeout);

      const finalUrl = response.url;
      const match = finalUrl.match(USER_ID_PATTERN);
      if (match) {
        this.userId = match[1];
        return ok(true);
      }

      // Pas de redirection vers le dashboard → pas connecté
      return ok(false);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Network request failed';
      return err(createConnectorError(
        `Failed to detect Collective session: ${message}`,
        { connectorId: this.id, phase: 'detect', recoverable: true },
        now
      ));
    }
  }

  async fetchMissions(now: number): Promise<Result<Mission[], AppError>> {
    if (!this.userId) {
      return err(createConnectorError(
        'User ID not discovered during session detection',
        { connectorId: this.id, phase: 'fetch', recoverable: false },
        now
      ));
    }

    try {
      const jobsUrl = `${APP_URL}/collective/${this.userId}/jobs`;
      const result = await this.fetchHTML(jobsUrl, now);

      if (!result.ok) {
        return err(createConnectorError(
          'Failed to fetch jobs from Collective',
          { connectorId: this.id, phase: 'fetch', context: { originalError: result.error } },
          now
        ));
      }

      const projects = extractCollectiveProjects(result.value);
      const missions = parseCollectiveProjects(projects, new Date(now));

      const syncResult = await this.setLastSync(now);
      if (!syncResult.ok) {
        console.warn('Failed to set last sync:', syncResult.error);
      }

      return ok(missions);
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
