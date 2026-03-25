import type { PlatformConnector } from './platform-connector';
import type { Mission } from '../../core/types/mission';
import type { ConnectorSearchContext } from '../../core/connectors/search-context';
import {
  type Result,
  type AppError,
  ok,
  err,
  createNetworkError,
  createStorageError,
} from '$lib/core/errors';
import { detectBrowser, type BrowserInfo } from '../../core/browser/browser-compat';

// Lazy-initialized browser info singleton for diagnostic logging
let _browserInfo: BrowserInfo | null = null;

const getBrowserInfo = (): BrowserInfo => {
  if (!_browserInfo) {
    _browserInfo = detectBrowser(typeof navigator !== 'undefined' ? navigator.userAgent : '');
  }
  return _browserInfo;
};

const LOGIN_PATTERNS = ['/login', '/signin', '/sign-in', '/sign_in', '/auth', '/connexion', '/register', '/signup'];

export abstract class BaseConnector implements PlatformConnector {
  abstract readonly id: string;
  abstract readonly name: string;
  abstract readonly baseUrl: string;
  abstract readonly icon: string;

  /** URL to probe for session detection (override for platforms with public landing pages) */
  protected get sessionCheckUrl(): string {
    return this.baseUrl;
  }

  /**
   * Détecte si l'utilisateur a une session active sur la plateforme
   * Retourne un Result<boolean, AppError> au lieu de Promise<boolean>
   */
  async detectSession(now: number): Promise<Result<boolean, AppError>> {
    try {
      // TODO: When `tabs` permission is available, skip detection if platform tab is frozen
      // (Chrome 132+ tabs.Tab.frozen property) to avoid unnecessary fetch requests.
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
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
      if (LOGIN_PATTERNS.some(p => finalUrl.includes(p))) {
        return ok(false);
      }

      return ok(response.ok);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Network request failed';
      const isAbort = e instanceof Error && e.name === 'AbortError';
      
      return err(createNetworkError(
        `Failed to detect session for ${this.id}: ${message}`,
        {
          url: this.sessionCheckUrl,
          retryable: !isAbort,
          context: {
            connectorId: this.id,
            aborted: isAbort,
            originalError: message,
            browser: getBrowserInfo().name,
          },
        },
        now
      ));
    }
  }

  /** Fetch HTML directly from the side panel context — no offscreen/messaging needed */
  protected async fetchHTML(url: string, now: number): Promise<Result<string, AppError>> {
    const doFetch = async (): Promise<Result<string, AppError>> => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      try {
        const response = await fetch(url, {
          credentials: 'include',
          signal: controller.signal,
        });
        clearTimeout(timeout);
        
        if (!response.ok) {
          return err(createNetworkError(
            `HTTP ${response.status} for ${url}`,
            {
              status: response.status,
              url,
              retryable: response.status >= 500 || response.status === 429,
              context: { connectorId: this.id, browser: getBrowserInfo().name },
            },
            now
          ));
        }
        
        const text = await response.text();
        return ok(text);
      } catch (e) {
        clearTimeout(timeout);
        const message = e instanceof Error ? e.message : 'Fetch failed';
        const isAbort = e instanceof Error && e.name === 'AbortError';
        
        return err(createNetworkError(
          `Failed to fetch HTML from ${url}: ${message}`,
          {
            url,
            retryable: !isAbort,
            context: { 
              connectorId: this.id, 
              aborted: isAbort,
              browser: getBrowserInfo().name,
            },
          },
          now
        ));
      }
    };

    const result = await doFetch();
    
    if (result.ok) {
      return result;
    }

    // Retry once if retryable
    if (result.error.type === 'network' && result.error.retryable) {
      await new Promise((r) => setTimeout(r, 1000));
      return doFetch();
    }

    return result;
  }

  /** Fetch JSON directly from the side panel context — no offscreen/messaging needed */
  protected async fetchJSON(url: string, now: number, init?: RequestInit): Promise<Result<unknown, AppError>> {
    const doFetch = async (): Promise<Result<unknown, AppError>> => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      try {
        const response = await fetch(url, {
          credentials: 'include',
          signal: controller.signal,
          ...init,
        });
        clearTimeout(timeout);
        
        if (!response.ok) {
          return err(createNetworkError(
            `HTTP ${response.status} for ${url}`,
            {
              status: response.status,
              url,
              retryable: response.status >= 500 || response.status === 429,
              context: { connectorId: this.id, browser: getBrowserInfo().name },
            },
            now
          ));
        }
        
        const json = await response.json() as unknown;
        return ok(json);
      } catch (e) {
        clearTimeout(timeout);
        const message = e instanceof Error ? e.message : 'Fetch failed';
        const isAbort = e instanceof Error && e.name === 'AbortError';
        
        return err(createNetworkError(
          `Failed to fetch JSON from ${url}: ${message}`,
          {
            url,
            retryable: !isAbort,
            context: { 
              connectorId: this.id, 
              aborted: isAbort,
              browser: getBrowserInfo().name,
            },
          },
          now
        ));
      }
    };

    const result = await doFetch();
    
    if (result.ok) {
      return result;
    }

    // Retry once if retryable
    if (result.error.type === 'network' && result.error.retryable) {
      await new Promise((r) => setTimeout(r, 1000));
      return doFetch();
    }

    return result;
  }

  abstract fetchMissions(now: number, context?: ConnectorSearchContext): Promise<Result<Mission[], AppError>>;

  /**
   * Récupère la date de dernière synchronisation
   * Retourne un Result<Date | null, AppError>
   */
  async getLastSync(now: number): Promise<Result<Date | null, AppError>> {
    try {
      const result = await chrome.storage.local.get(`lastSync_${this.id}`);
      const timestamp = result[`lastSync_${this.id}`] as number | undefined;
      return ok(timestamp ? new Date(timestamp) : null);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Storage read failed';
      return err(createStorageError(
        `Failed to get last sync for ${this.id}: ${message}`,
        {
          operation: 'read',
          key: `lastSync_${this.id}`,
          context: { connectorId: this.id },
        },
        now
      ));
    }
  }

  /**
   * Définit la date de dernière synchronisation
   * Retourne un Result<void, AppError>
   */
  protected async setLastSync(now: number): Promise<Result<void, AppError>> {
    try {
      await chrome.storage.local.set({ [`lastSync_${this.id}`]: now });
      return ok(undefined);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Storage write failed';
      return err(createStorageError(
        `Failed to set last sync for ${this.id}: ${message}`,
        {
          operation: 'write',
          key: `lastSync_${this.id}`,
          context: { connectorId: this.id },
        },
        now
      ));
    }
  }
}
