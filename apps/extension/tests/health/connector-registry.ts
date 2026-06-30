export interface ConnectorHealthRegistryEntry {
  id: string;
  name: string;
  unitTestFile: string;
  regressionFixtureDir?: string;
}

export const CONNECTOR_HEALTH_REGISTRY: ConnectorHealthRegistryEntry[] = [
  {
    id: 'free-work',
    name: 'Free-Work',
    unitTestFile: 'tests/unit/connectors/freework.test.ts',
  },
  {
    id: 'lehibou',
    name: 'LeHibou',
    unitTestFile: 'tests/unit/connectors/lehibou.test.ts',
    regressionFixtureDir: 'tests/fixtures/regression/lehibou',
  },
  {
    id: 'hiway',
    name: 'Hiway',
    unitTestFile: 'tests/unit/connectors/hiway.test.ts',
  },
  {
    id: 'collective',
    name: 'Collective',
    unitTestFile: 'tests/unit/connectors/collective.test.ts',
  },
  {
    id: 'cherry-pick',
    name: 'Cherry Pick',
    unitTestFile: 'tests/unit/connectors/cherrypick.test.ts',
  },
];
