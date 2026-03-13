import { FreeWorkConnector } from './freework.connector';
import { MaltConnector } from './malt.connector';
import { CometConnector } from './comet.connector';
import type { PlatformConnector } from '../../core/types/connector';

export const connectorRegistry: PlatformConnector[] = [
  new FreeWorkConnector(),
  new MaltConnector(),
  new CometConnector(),
];

export function getConnector(id: string): PlatformConnector | undefined {
  return connectorRegistry.find(c => c.id === id);
}
