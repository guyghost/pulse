import { BaseConnector } from './base.connector';
import type { Mission } from '../../core/types/mission';
import { parseFreeWorkHTML } from '../../core/connectors/freework-parser';

const BASE_URL = 'https://www.free-work.com';
const MISSIONS_URL = `${BASE_URL}/fr/tech-it/jobs`;

export class FreeWorkConnector extends BaseConnector {
  readonly id = 'free-work';
  readonly name = 'Free-Work';
  readonly baseUrl = BASE_URL;
  readonly icon = 'https://www.google.com/s2/favicons?domain=free-work.com&sz=32';

  protected get sessionCheckUrl() { return `${BASE_URL}/fr/dashboard`; }

  async fetchMissions(): Promise<Mission[]> {
    const html = await this.fetchHTML(MISSIONS_URL);
    const now = new Date();
    const missions = parseFreeWorkHTML(html, now, `fw-${now.getTime()}`);
    await this.setLastSync();
    return missions;
  }
}
