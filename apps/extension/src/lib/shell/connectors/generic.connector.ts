import { BaseConnector } from './base.connector';
import type { Mission, MissionSource } from '../../core/types/mission';
import { parseGenericHTML } from '../../core/connectors/generic-parser';
import { type Result, type AppError, ok, err, createConnectorError } from '$lib/core/errors';

export interface GenericConnectorConfig {
  id: string;
  name: string;
  baseUrl: string;
  missionsPath: string;
  idPrefix: string;
  source: MissionSource;
  sessionCheckPath?: string;
}

export class GenericConnector extends BaseConnector {
  readonly id: string;
  readonly name: string;
  readonly baseUrl: string;
  readonly icon: string;
  private readonly missionsUrl: string;
  private readonly idPrefix: string;
  private readonly source: MissionSource;
  private readonly _sessionCheckUrl: string;

  constructor(config: GenericConnectorConfig) {
    super();
    this.id = config.id;
    this.name = config.name;
    this.baseUrl = config.baseUrl;
    this.icon = `https://www.google.com/s2/favicons?domain=${new URL(config.baseUrl).hostname}&sz=32`;
    this.missionsUrl = `${config.baseUrl}${config.missionsPath}`;
    this.idPrefix = config.idPrefix;
    this.source = config.source;
    this._sessionCheckUrl = `${config.baseUrl}${config.sessionCheckPath ?? '/dashboard'}`;
  }

  protected get sessionCheckUrl() {
    return this._sessionCheckUrl;
  }

  /**
   * Fallback session detection via HTTP fetch.
   * WARNING: This is unreliable for SPAs that return 200 regardless of auth state.
   * Specific connectors should override with cookie-based detection.
   */
  async detectSession(now: number, signal?: AbortSignal): Promise<Result<boolean, AppError>> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);

      if (signal) {
        signal.addEventListener('abort', () => controller.abort(), { once: true });
      }

      const response = await fetch(this.sessionCheckUrl, {
        credentials: 'include',
        redirect: 'follow',
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (response.status === 401 || response.status === 403) {
        return ok(false);
      }

      // Detect redirect to login page
      const finalUrl = response.url.toLowerCase();
      const loginPatterns = ['/login', '/signin', '/sign-in', '/auth', '/connexion'];
      if (loginPatterns.some((p) => finalUrl.includes(p))) {
        return ok(false);
      }

      return ok(response.ok);
    } catch {
      return ok(false);
    }
  }

  async fetchMissions(now: number): Promise<Result<Mission[], AppError>> {
    try {
      const result = await this.fetchHTML(this.missionsUrl, now);

      if (!result.ok) {
        return err(
          createConnectorError(
            `Failed to fetch missions from ${this.name}`,
            { connectorId: this.id, phase: 'fetch', context: { originalError: result.error } },
            now
          )
        );
      }

      const missions = parseGenericHTML(
        result.value,
        this.source,
        this.baseUrl,
        new Date(now),
        `${this.idPrefix}-${now}`
      );

      return ok(missions);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return err(
        createConnectorError(
          `Unexpected error fetching missions from ${this.name}: ${message}`,
          { connectorId: this.id, phase: 'fetch', context: { originalError: message } },
          now
        )
      );
    }
  }
}

export function createGenericConnector(config: GenericConnectorConfig): GenericConnector {
  return new GenericConnector(config);
}
