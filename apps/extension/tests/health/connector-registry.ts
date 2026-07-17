export const CONNECTOR_HEALTH_REGISTRY = [
  {
    id: 'cherry-pick',
    name: 'Cherry Pick',
    unitTestFile: 'tests/unit/connectors/cherrypick.test.ts',
    regressionFixtureDir: 'tests/fixtures/regression/cherry-pick',
  },
  {
    id: 'collective',
    name: 'Collective',
    unitTestFile: 'tests/unit/connectors/collective.test.ts',
    regressionFixtureDir: 'tests/fixtures/regression/collective',
  },
  {
    id: 'free-work',
    name: 'Free-Work',
    unitTestFile: 'tests/unit/connectors/freework.test.ts',
    regressionFixtureDir: 'tests/fixtures/regression/free-work',
  },
  {
    id: 'hiway',
    name: 'Hiway',
    unitTestFile: 'tests/unit/connectors/hiway.test.ts',
    regressionFixtureDir: 'tests/fixtures/regression/hiway',
  },
  {
    id: 'lehibou',
    name: 'LeHibou',
    unitTestFile: 'tests/unit/connectors/lehibou.test.ts',
    regressionFixtureDir: 'tests/fixtures/regression/lehibou',
  },
  {
    id: 'malt',
    name: 'Malt',
    unitTestFile: 'tests/unit/connectors/malt.test.ts',
    regressionFixtureDir: 'tests/fixtures/regression/malt',
  },
] as const;

export type ConnectorHealthRegistryEntry = (typeof CONNECTOR_HEALTH_REGISTRY)[number];

const registryIdPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const pathPattern =
  /^tests\/(?:unit\/connectors\/[a-z0-9-]+\.test\.ts|fixtures\/regression\/[a-z0-9-]+)$/;

function compareUtf8(left: string, right: string): number {
  return Buffer.compare(Buffer.from(left, 'utf8'), Buffer.from(right, 'utf8'));
}

export function validateConnectorHealthRegistry(
  registry: readonly Readonly<{
    id: string;
    name: string;
    unitTestFile: string;
    regressionFixtureDir: string;
  }>[],
  catalog: readonly Readonly<{ id: string; name: string }>[]
): void {
  if (registry.length === 0) {
    throw new Error('Connector health registry must be nonempty.');
  }
  const ids = new Set<string>();
  const names = new Set<string>();
  let previousId: string | undefined;
  for (const entry of registry) {
    if (ids.has(entry.id) || names.has(entry.name)) {
      throw new Error('Connector health registry contains a duplicate ID or name.');
    }
    ids.add(entry.id);
    names.add(entry.name);
    if (
      !registryIdPattern.test(entry.id) ||
      Buffer.byteLength(entry.id, 'utf8') > 64 ||
      Buffer.byteLength(entry.name, 'utf8') < 1 ||
      Buffer.byteLength(entry.name, 'utf8') > 128
    ) {
      throw new Error('Connector health registry contains an invalid identity.');
    }
    if (previousId !== undefined && compareUtf8(previousId, entry.id) >= 0) {
      throw new Error('Connector health registry must be sorted by unsigned UTF-8 ID.');
    }
    previousId = entry.id;
    if (
      !pathPattern.test(entry.unitTestFile) ||
      !pathPattern.test(entry.regressionFixtureDir) ||
      entry.unitTestFile.includes('..') ||
      entry.regressionFixtureDir.includes('..')
    ) {
      throw new Error('Connector health registry path violates the closed path policy.');
    }
  }

  const expected = catalog
    .map(({ id, name }) => ({ id, name }))
    .sort((left, right) => compareUtf8(left.id, right.id));
  const observed = registry.map(({ id, name }) => ({ id, name }));
  if (
    expected.length !== observed.length ||
    expected.some(
      (entry, index) => entry.id !== observed[index]?.id || entry.name !== observed[index]?.name
    )
  ) {
    throw new Error('Connector health registry does not equal the complete committed catalog.');
  }

  const frozen = CONNECTOR_HEALTH_REGISTRY as readonly {
    id: string;
    name: string;
    unitTestFile: string;
    regressionFixtureDir: string;
  }[];
  if (
    frozen.length !== registry.length ||
    frozen.some(
      (entry, index) =>
        entry.id !== registry[index]?.id ||
        entry.name !== registry[index]?.name ||
        entry.unitTestFile !== registry[index]?.unitTestFile ||
        entry.regressionFixtureDir !== registry[index]?.regressionFixtureDir
    )
  ) {
    throw new Error('Connector health registry has ID/name/path drift.');
  }
}
