import type { PlatformConnector } from '../../core/types/connector';
import type { Mission } from '../../core/types/mission';

export abstract class BaseConnector implements PlatformConnector {
  abstract readonly id: string;
  abstract readonly name: string;
  abstract readonly baseUrl: string;
  abstract readonly icon: string;

  async detectSession(): Promise<boolean> {
    try {
      const cookies = await chrome.cookies.getAll({ domain: new URL(this.baseUrl).hostname });
      return cookies.length > 0;
    } catch {
      // Outside extension context — assume OK (side panel can still fetch)
      return true;
    }
  }

  /** Fetch HTML directly from the side panel context — no offscreen/messaging needed */
  protected async fetchHTML(url: string): Promise<string> {
    const response = await fetch(url, { credentials: 'include' });
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
