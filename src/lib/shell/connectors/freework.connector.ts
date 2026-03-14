import { BaseConnector } from './base.connector';
import type { Mission } from '../../core/types/mission';
import { parseFreeWorkAPI, type FreeWorkApiResponse } from '../../core/connectors/freework-parser';

const BASE_URL = 'https://www.free-work.com';
const API_BASE = `${BASE_URL}/api/job_postings`;
const ITEMS_PER_PAGE = 50;
const MAX_PAGES = 5;

export class FreeWorkConnector extends BaseConnector {
  readonly id = 'free-work';
  readonly name = 'Free-Work';
  readonly baseUrl = BASE_URL;
  readonly icon = 'https://www.google.com/s2/favicons?domain=free-work.com&sz=32';

  /** Free-Work API is public — no session needed */
  async detectSession(): Promise<boolean> {
    return true;
  }

  async fetchMissions(): Promise<Mission[]> {
    const allMissions: Mission[] = [];
    const now = new Date();

    for (let page = 1; page <= MAX_PAGES; page++) {
      const url = `${API_BASE}?page=${page}&itemsPerPage=${ITEMS_PER_PAGE}&contracts=contractor`;
      const response = await fetch(url, {
        headers: { 'Accept': 'application/ld+json' },
      });
      if (!response.ok) throw new Error(`HTTP ${response.status} for Free-Work API`);
      const data: FreeWorkApiResponse = await response.json();
      const missions = parseFreeWorkAPI(data, now);
      if (missions.length === 0) break;
      allMissions.push(...missions);
    }

    await this.setLastSync();
    return allMissions;
  }
}
