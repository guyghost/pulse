export const LOCAL_DATA_RESET_EPOCH_EVENT_VERSION = 1 as const;

export type LocalDataResetEpochStage = 'ready_to_commit' | 'committed';

export interface LocalDataResetEpochEventV1 {
  version: typeof LOCAL_DATA_RESET_EPOCH_EVENT_VERSION;
  stage: LocalDataResetEpochStage;
  resetId: string;
  previousDataEpoch: string | null;
  nextDataEpoch: string;
  settingsBootstrapRequestId: string;
}

const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function readExactDataRecord(
  value: unknown,
  expectedKeys: readonly string[]
): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null) {
    return null;
  }

  try {
    if (Array.isArray(value)) {
      return null;
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      return null;
    }

    const ownKeys = Reflect.ownKeys(value);
    if (
      ownKeys.length !== expectedKeys.length ||
      ownKeys.some((key) => typeof key !== 'string' || !expectedKeys.includes(key))
    ) {
      return null;
    }

    const snapshot: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const key of expectedKeys) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (
        descriptor === undefined ||
        descriptor.enumerable !== true ||
        !Object.prototype.hasOwnProperty.call(descriptor, 'value')
      ) {
        return null;
      }
      snapshot[key] = descriptor.value;
    }
    return snapshot;
  } catch {
    return null;
  }
}

export function isLocalDataResetUuidV4(value: unknown): value is string {
  return typeof value === 'string' && UUID_V4_PATTERN.test(value);
}

export function parseLocalDataResetEpochEvent(value: unknown): LocalDataResetEpochEventV1 | null {
  const record = readExactDataRecord(value, [
    'version',
    'stage',
    'resetId',
    'previousDataEpoch',
    'nextDataEpoch',
    'settingsBootstrapRequestId',
  ]);
  if (record === null) {
    return null;
  }

  const previousDataEpoch = record.previousDataEpoch;
  if (previousDataEpoch !== null && !isLocalDataResetUuidV4(previousDataEpoch)) {
    return null;
  }
  const identities = [
    record.resetId,
    record.nextDataEpoch,
    record.settingsBootstrapRequestId,
    ...(previousDataEpoch === null ? [] : [previousDataEpoch]),
  ];
  if (
    record.version !== LOCAL_DATA_RESET_EPOCH_EVENT_VERSION ||
    (record.stage !== 'ready_to_commit' && record.stage !== 'committed') ||
    !isLocalDataResetUuidV4(record.resetId) ||
    !isLocalDataResetUuidV4(record.nextDataEpoch) ||
    !isLocalDataResetUuidV4(record.settingsBootstrapRequestId) ||
    new Set(identities).size !== identities.length
  ) {
    return null;
  }

  return {
    version: LOCAL_DATA_RESET_EPOCH_EVENT_VERSION,
    stage: record.stage,
    resetId: record.resetId,
    previousDataEpoch,
    nextDataEpoch: record.nextDataEpoch,
    settingsBootstrapRequestId: record.settingsBootstrapRequestId,
  };
}

export function localDataResetEpochEventMatches(
  value: unknown,
  expected: Omit<LocalDataResetEpochEventV1, 'version'>
): boolean {
  const parsed = parseLocalDataResetEpochEvent(value);
  return (
    parsed !== null &&
    parsed.stage === expected.stage &&
    parsed.resetId === expected.resetId &&
    parsed.previousDataEpoch === expected.previousDataEpoch &&
    parsed.nextDataEpoch === expected.nextDataEpoch &&
    parsed.settingsBootstrapRequestId === expected.settingsBootstrapRequestId
  );
}
