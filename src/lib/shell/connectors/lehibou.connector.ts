import { BaseConnector } from './base.connector';
import type { Mission } from '../../core/types/mission';
import { parseLeHibouHTML } from '../../core/connectors/lehibou-parser';

const BASE_URL = 'https://www.lehibou.com';
const ANNONCES_URL = `${BASE_URL}/recherche/annonces`;
const MAX_PAGES = 5;

export class LeHibouConnector extends BaseConnector {
  readonly id = 'lehibou';
  readonly name = 'LeHibou';
  readonly baseUrl = BASE_URL;
  readonly icon = 'https://www.google.com/s2/favicons?domain=lehibou.com&sz=32';

  protected get sessionCheckUrl() { return ANNONCES_URL; }

  async fetchMissions(): Promise<Mission[]> {
    const allMissions: Mission[] = [];
    const now = new Date();

    for (let page = 1; page <= MAX_PAGES; page++) {
      const url = page === 1 ? ANNONCES_URL : `${ANNONCES_URL}?page=${page}`;
      const html = await this.fetchHTML(url);
      const missions = parseLeHibouHTML(html, now, `lh-${now.getTime()}`);
      if (missions.length === 0) break;
      allMissions.push(...missions);
    }

    await this.setLastSync();
    return allMissions;
  }
}
