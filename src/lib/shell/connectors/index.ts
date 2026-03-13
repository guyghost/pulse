import { FreeWorkConnector } from './freework.connector';
import { MaltConnector } from './malt.connector';
import { CometConnector } from './comet.connector';
import { LeHibouConnector } from './lehibou.connector';
import { HiwayConnector } from './hiway.connector';
import { CollectiveConnector } from './collective.connector';
import { CherryPickConnector } from './cherrypick.connector';
import type { PlatformConnector } from '../../core/types/connector';

export const connectorRegistry: PlatformConnector[] = [
  new FreeWorkConnector(),
  new MaltConnector(),
  new CometConnector(),
  new LeHibouConnector(),
  HiwayConnector,
  CollectiveConnector,
  CherryPickConnector,
];

export function getConnector(id: string): PlatformConnector | undefined {
  return connectorRegistry.find(c => c.id === id);
}
