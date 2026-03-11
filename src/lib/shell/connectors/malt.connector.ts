import { BaseConnector } from './base.connector';
import type { Mission } from '../../core/types/mission';

export class MaltConnector extends BaseConnector {
  readonly id = 'malt';
  readonly name = 'Malt';
  readonly baseUrl = 'https://www.malt.fr';
  readonly icon = 'user-check';

  async fetchMissions(): Promise<Mission[]> {
    // TODO: implement Malt scraping
    return [];
  }
}
