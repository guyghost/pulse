import { BaseConnector } from './base.connector';
import type { Mission } from '../../core/types/mission';
import { parseHiwayHTML } from '../../core/connectors/hiway-parser';

const BASE_URL = 'https://hiway-missions.fr';

export class HiwayConnector extends BaseConnector {
  readonly id = 'hiway';
  readonly name = 'Hiway';
  readonly baseUrl = BASE_URL;
  readonly icon = 'https://www.google.com/s2/favicons?domain=hiway-missions.fr&sz=32';

  protected get sessionCheckUrl() { return `${BASE_URL}/admin/freelance/missions`; }

  async fetchMissions(): Promise<Mission[]> {
    const html = await this.fetchHTML(`${BASE_URL}/admin/freelance/missions`);
    const now = new Date();
    const missions = parseHiwayHTML(html, now);
    await this.setLastSync();
    return missions;
  }
}
