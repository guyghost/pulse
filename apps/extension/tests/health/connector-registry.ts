export const CONNECTOR_HEALTH_REGISTRY = [
  {
    id: 'free-work',
    name: 'Free-Work',
    unitTestFile: 'tests/unit/connectors/freework.test.ts',
    regressionFixtureDir: 'tests/fixtures/regression/free-work',
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
    regressionFixtureDir: 'tests/fixtures/regression/hiway',
  },
  {
    id: 'collective',
    name: 'Collective',
    unitTestFile: 'tests/unit/connectors/collective.test.ts',
    regressionFixtureDir: 'tests/fixtures/regression/collective',
  },
  {
    id: 'cherry-pick',
    name: 'Cherry Pick',
    unitTestFile: 'tests/unit/connectors/cherrypick.test.ts',
    regressionFixtureDir: 'tests/fixtures/regression/cherry-pick',
  },
] as const;

export type ConnectorHealthRegistryEntry = (typeof CONNECTOR_HEALTH_REGISTRY)[number];
