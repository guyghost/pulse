import type { PlatformConnector } from './platform-connector';
import type { Mission } from '../../core/types/mission';

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

  async detectSession(): Promise<boolean> {
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

      if (response.status === 401 || response.status === 403) return false;

      // Detect redirect to login page
      const finalUrl = response.url.toLowerCase();
      if (LOGIN_PATTERNS.some(p => finalUrl.includes(p))) return false;

      return response.ok;
    } catch {
      return false;
    }
  }

  /** Fetch HTML directly from the side panel context — no offscreen/messaging needed */
  protected async fetchHTML(url: string): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const response = await fetch(url, {
      credentials: 'include',
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
    return response.text();
  }

  abstract fetchMissions(): Promise<Mission[]>;

  async getLastSync(): Promise<Date | null> {
    try {
      const result = await chrome.storage.local.get(`lastSync_${this.id}`);
      const timestamp = result[`lastSync_${this.id}`] as number | undefined;
      return timestamp ? new Date(timestamp) : null;
    } catch {
      return null;
    }
  }

  protected async setLastSync(): Promise<void> {
    try {
      await chrome.storage.local.set({ [`lastSync_${this.id}`]: Date.now() });
    } catch {
      // Outside extension context
    }
  }
}
