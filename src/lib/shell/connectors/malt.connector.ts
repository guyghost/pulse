import { BaseConnector } from './base.connector';
import type { Mission } from '../../core/types/mission';
import { parseMaltHTML } from '../../core/connectors/malt-parser';

const BASE_URL = 'https://www.malt.fr';
const MISSIONS_URL = `${BASE_URL}/s?q=`;

export class MaltConnector extends BaseConnector {
  readonly id = 'malt';
  readonly name = 'Malt';
  readonly baseUrl = BASE_URL;
  readonly icon = 'https://www.google.com/s2/favicons?domain=malt.fr&sz=32';

  async fetchMissions(): Promise<Mission[]> {
    const html = await this.fetchHTML(MISSIONS_URL);
    const now = new Date();
    const missions = parseMaltHTML(html, now, `malt-${now.getTime()}`);
    await this.setLastSync();
    return missions;
  }
}
