import { BaseConnector } from './base.connector';
import type { Mission } from '../../core/types/mission';
import { parseCometHTML } from '../../core/connectors/comet-parser';
import { sendMessage } from '../messaging/bridge';

const BASE_URL = 'https://app.comet.co';
const MISSIONS_URL = `${BASE_URL}/missions`;

export class CometConnector extends BaseConnector {
  readonly id = 'comet';
  readonly name = 'Comet';
  readonly baseUrl = BASE_URL;
  readonly icon = 'rocket';

  async fetchMissions(): Promise<Mission[]> {
    const response = await sendMessage({
      type: 'SCRAPE_URL',
      payload: { url: MISSIONS_URL, connectorId: this.id },
    });

    if (response.type === 'SCRAPE_RESULT' && 'html' in response.payload) {
      const now = new Date();
      const idPrefix = `comet-${now.getTime()}`;
      const missions = parseCometHTML((response.payload as { html: string }).html, now, idPrefix);
      await this.setLastSync();
      return missions;
    }

    return [];
  }
}
