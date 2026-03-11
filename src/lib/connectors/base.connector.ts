import type { PlatformConnector } from '../types/connector';
import type { Mission } from '../types/mission';

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
      return false;
    }
  }

  abstract fetchMissions(): Promise<Mission[]>;

  async getLastSync(): Promise<Date | null> {
    const result = await chrome.storage.local.get(`lastSync_${this.id}`);
    const timestamp = result[`lastSync_${this.id}`] as number | undefined;
    return timestamp ? new Date(timestamp) : null;
  }

  protected async setLastSync(): Promise<void> {
    await chrome.storage.local.set({ [`lastSync_${this.id}`]: Date.now() });
  }
}
