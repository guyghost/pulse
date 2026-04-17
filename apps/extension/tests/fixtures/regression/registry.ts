import { parseLeHibouHTML } from '../../../src/lib/core/connectors/lehibou-parser';
import type { Mission } from '../../../src/lib/core/types/mission';

export interface ParserRegressionRegistryEntry {
  connectorId: string;
  fixtureDir: string;
  parser: (html: string, now: Date) => Mission[];
  now: Date;
}

export const REGRESSION_REGISTRY: ParserRegressionRegistryEntry[] = [
  {
    connectorId: 'lehibou',
    fixtureDir: 'lehibou',
    parser: parseLeHibouHTML,
    now: new Date('2026-03-13T12:00:00Z'),
  },
];
