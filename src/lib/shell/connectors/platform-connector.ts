import type { Mission } from '../../core/types/mission';

export interface PlatformConnector {
  readonly id: string;
  readonly name: string;
  readonly baseUrl: string;
  readonly icon: string;

  detectSession(): Promise<boolean>;
  fetchMissions(): Promise<Mission[]>;
  getLastSync(): Promise<Date | null>;
}
