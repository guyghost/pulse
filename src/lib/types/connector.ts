import type { Mission } from './mission';

export interface PlatformConnector {
  readonly id: string;
  readonly name: string;
  readonly baseUrl: string;
  readonly icon: string;

  detectSession(): Promise<boolean>;
  fetchMissions(): Promise<Mission[]>;
  getLastSync(): Promise<Date | null>;
}

export interface ConnectorError {
  connectorId: string;
  message: string;
  timestamp: Date;
  recoverable: boolean;
}

export type ConnectorStatus = 'detecting' | 'authenticated' | 'expired' | 'fetching' | 'done' | 'error';
