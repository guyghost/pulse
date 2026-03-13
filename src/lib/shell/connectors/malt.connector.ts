import { BaseConnector } from './base.connector';
import type { Mission } from '../../core/types/mission';
import { parseMaltHTML } from '../../core/connectors/malt-parser';
import { sendMessage } from '../messaging/bridge';

const BASE_URL = 'https://www.malt.fr';
const MISSIONS_URL = `${BASE_URL}/s?q=`;

export class MaltConnector extends BaseConnector {
  readonly id = 'malt';
  readonly name = 'Malt';
  readonly baseUrl = BASE_URL;
  readonly icon = 'user-check';

  async fetchMissions(): Promise<Mission[]> {
    const response = await sendMessage({
      type: 'SCRAPE_URL',
      payload: { url: MISSIONS_URL, connectorId: this.id },
    });

    if (response.type === 'SCRAPE_RESULT' && 'html' in response.payload) {
      const now = new Date();
      const idPrefix = `malt-${now.getTime()}`;
      const missions = parseMaltHTML((response.payload as { html: string }).html, now, idPrefix);
      await this.setLastSync();
      return missions;
    }

    return [];
  }
}
