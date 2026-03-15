import { FreeWorkConnector } from './freework.connector';
import { CometConnector } from './comet.connector';
import { LeHibouConnector } from './lehibou.connector';
import { GenericConnector } from './generic.connector';
import { HiwayConfig } from './hiway.connector';
import { CollectiveConnector } from './collective.connector';
import { CherryPickConnector } from './cherrypick.connector';
import type { PlatformConnector } from './platform-connector';

export const connectorRegistry: PlatformConnector[] = [
  new FreeWorkConnector(),
  new CometConnector(),
  new LeHibouConnector(),
  new GenericConnector(HiwayConfig),
  new CollectiveConnector(),
  new CherryPickConnector(),
];

export function getConnector(id: string): PlatformConnector | undefined {
  return connectorRegistry.find(c => c.id === id);
}
