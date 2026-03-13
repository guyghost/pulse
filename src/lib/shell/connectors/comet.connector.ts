import { BaseConnector } from './base.connector';
import type { Mission } from '../../core/types/mission';
import { parseCometHTML } from '../../core/connectors/comet-parser';

const BASE_URL = 'https://app.comet.co';
const MISSIONS_URL = `${BASE_URL}/missions`;

export class CometConnector extends BaseConnector {
  readonly id = 'comet';
  readonly name = 'Comet';
  readonly baseUrl = BASE_URL;
  readonly icon = 'https://www.google.com/s2/favicons?domain=comet.co&sz=32';

  protected get sessionCheckUrl() { return `${BASE_URL}/freelance/dashboard`; }

  async fetchMissions(): Promise<Mission[]> {
    const html = await this.fetchHTML(MISSIONS_URL);
    const now = new Date();
    const missions = parseCometHTML(html, now, `comet-${now.getTime()}`);
    await this.setLastSync();
    return missions;
  }
}
