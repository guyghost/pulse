import { BaseConnector } from './base.connector';
import type { Mission } from '../../core/types/mission';
import { parseFreeWorkAPI, type FreeWorkApiResponse } from '../../core/connectors/freework-parser';

const BASE_URL = 'https://www.free-work.com';
const API_URL = `${BASE_URL}/api/job_postings?page=1&itemsPerPage=50&contracts=contractor`;

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
    const response = await fetch(API_URL, {
      headers: { 'Accept': 'application/ld+json' },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status} for Free-Work API`);
    const data: FreeWorkApiResponse = await response.json();
    const now = new Date();
    const missions = parseFreeWorkAPI(data, now);
    await this.setLastSync();
    return missions;
  }
}
