import { BaseConnector } from './base.connector';
import type { Mission } from '../../core/types/mission';
import { extractCollectiveProjects, parseCollectiveProjects } from '../../core/connectors/collective-parser';

const BASE_URL = 'https://www.collective.work';
const JOB_URL = `${BASE_URL}/job`;
const MAX_PAGES = 5;

export class CollectiveConnector extends BaseConnector {
  readonly id = 'collective';
  readonly name = 'Collective';
  readonly baseUrl = BASE_URL;
  readonly icon = 'https://www.google.com/s2/favicons?domain=collective.work&sz=32';

  /** Collective job board is public — no session needed */
  async detectSession(): Promise<boolean> {
    return true;
  }

  async fetchMissions(): Promise<Mission[]> {
    const allMissions: Mission[] = [];
    const now = new Date();

    for (let page = 1; page <= MAX_PAGES; page++) {
      const url = page === 1 ? JOB_URL : `${JOB_URL}?page=${page}`;
      const html = await this.fetchHTML(url);
      const projects = extractCollectiveProjects(html);
      if (projects.length === 0) break;
      const missions = parseCollectiveProjects(projects, now);
      allMissions.push(...missions);
    }

    await this.setLastSync();
    return allMissions;
  }
}
