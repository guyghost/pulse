export interface ConnectorError {
  connectorId: string;
  message: string;
  timestamp: Date;
  recoverable: boolean;
}

export type ConnectorStatus = 'detecting' | 'authenticated' | 'expired' | 'fetching' | 'done' | 'error';
