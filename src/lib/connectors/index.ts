import { FreeWorkConnector } from './freework.connector';
import { MaltConnector } from './malt.connector';
import type { PlatformConnector } from '../types/connector';

export const connectorRegistry: PlatformConnector[] = [
  new FreeWorkConnector(),
  new MaltConnector(),
];

export function getConnector(id: string): PlatformConnector | undefined {
  return connectorRegistry.find(c => c.id === id);
}
