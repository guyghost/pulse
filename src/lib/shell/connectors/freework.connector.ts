import { BaseConnector } from './base.connector';
import type { Mission } from '../../core/types/mission';
import { parseFreeWorkHTML } from '../../core/connectors/freework-parser';
import { sendMessage } from '../messaging/bridge';

const BASE_URL = 'https://www.free-work.com';
const MISSIONS_URL = `${BASE_URL}/fr/tech-it/jobs`;

export class FreeWorkConnector extends BaseConnector {
  readonly id = 'free-work';
  readonly name = 'Free-Work';
  readonly baseUrl = BASE_URL;
  readonly icon = 'briefcase';

  async fetchMissions(): Promise<Mission[]> {
    const response = await sendMessage({
      type: 'SCRAPE_URL',
      payload: { url: MISSIONS_URL, connectorId: this.id },
    });

    if (response.type === 'SCRAPE_RESULT' && 'html' in response.payload) {
      const now = new Date();
      const idPrefix = `fw-${now.getTime()}`;
      const missions = parseFreeWorkHTML((response.payload as { html: string }).html, now, idPrefix);
      await this.setLastSync();
      return missions;
    }

    return [];
  }
}
