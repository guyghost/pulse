import { BaseConnector } from './base.connector';
import type { Mission, MissionSource } from '../../core/types/mission';
import { parseGenericHTML } from '../../core/connectors/generic-parser';

interface GenericConnectorConfig {
  id: string;
  name: string;
  baseUrl: string;
  missionsPath: string;
  idPrefix: string;
  source: MissionSource;
}

class GenericConnector extends BaseConnector {
  readonly id: string;
  readonly name: string;
  readonly baseUrl: string;
  readonly icon: string;
  private readonly missionsUrl: string;
  private readonly idPrefix: string;
  private readonly source: MissionSource;

  constructor(config: GenericConnectorConfig) {
    super();
    this.id = config.id;
    this.name = config.name;
    this.baseUrl = config.baseUrl;
    this.icon = `https://www.google.com/s2/favicons?domain=${new URL(config.baseUrl).hostname}&sz=32`;
    this.missionsUrl = `${config.baseUrl}${config.missionsPath}`;
    this.idPrefix = config.idPrefix;
    this.source = config.source;
  }

  async fetchMissions(): Promise<Mission[]> {
    const html = await this.fetchHTML(this.missionsUrl);
    const now = new Date();
    const missions = parseGenericHTML(html, this.source, this.baseUrl, now, `${this.idPrefix}-${now.getTime()}`);
    await this.setLastSync();
    return missions;
  }
}

export function createGenericConnector(config: GenericConnectorConfig): GenericConnector {
  return new GenericConnector(config);
}
