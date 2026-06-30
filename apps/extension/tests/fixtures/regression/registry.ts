import { parseCherryPickMissions } from '../../../src/lib/core/connectors/cherrypick-parser';
import { parseCollectiveProjects } from '../../../src/lib/core/connectors/collective-parser';
import { parseFreeWorkAPI } from '../../../src/lib/core/connectors/freework-parser';
import { parseHiwayJSON } from '../../../src/lib/core/connectors/hiway-json-parser';
import { parseLeHibouHTML } from '../../../src/lib/core/connectors/lehibou-parser';
import type { Mission } from '../../../src/lib/core/types/mission';

const HIWAY_BASE_URL = 'https://hiway-missions.fr';

export type ParserRegressionFormat = 'html' | 'json';

export interface ParserRegressionRegistryEntry {
  connectorId: string;
  fixtureDir: string;
  format: ParserRegressionFormat;
  parser: (input: never, now: Date) => Mission[];
  now: Date;
}

export const REGRESSION_REGISTRY: ParserRegressionRegistryEntry[] = [
  {
    connectorId: 'lehibou',
    fixtureDir: 'lehibou',
    format: 'html',
    parser: parseLeHibouHTML as (input: never, now: Date) => Mission[],
    now: new Date('2026-03-13T12:00:00Z'),
  },
  {
    connectorId: 'free-work',
    fixtureDir: 'free-work',
    format: 'json',
    parser: parseFreeWorkAPI as (input: never, now: Date) => Mission[],
    now: new Date('2026-03-11T12:00:00Z'),
  },
  {
    connectorId: 'hiway',
    fixtureDir: 'hiway',
    format: 'json',
    parser: ((rows: unknown[], now: Date) => parseHiwayJSON(rows, now, HIWAY_BASE_URL)) as (
      input: never,
      now: Date
    ) => Mission[],
    now: new Date('2026-03-15T12:00:00Z'),
  },
  {
    connectorId: 'collective',
    fixtureDir: 'collective',
    format: 'json',
    parser: parseCollectiveProjects as (input: never, now: Date) => Mission[],
    now: new Date('2026-03-14T12:00:00Z'),
  },
  {
    connectorId: 'cherry-pick',
    fixtureDir: 'cherry-pick',
    format: 'json',
    parser: parseCherryPickMissions as (input: never, now: Date) => Mission[],
    now: new Date('2026-03-15T12:00:00Z'),
  },
];
