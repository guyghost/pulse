import { describe, expect, it, vi } from 'vitest';

import type { AppSettings } from '../../../src/lib/core/types/app-settings';
import {
  createSettingsBootstrapRepository,
  type SettingsBootstrapCapacityPort,
} from '../../../src/lib/shell/settings/settings-bootstrap.repository';
import type {
  SettingsAtomicCommitGatePort,
  SettingsDatasetGateCapabilityV1,
} from '../../../src/lib/shell/settings/settings-dataset-gate';
import type {
  SettingsLocalStoragePort,
  SettingsResetJournalPort,
} from '../../../src/lib/shell/settings/settings-transaction.repository';
import type { SettingsPersistenceCommand } from '../../../src/models/settings-persistence.contract';

const uuid = (value: number): string =>
  `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`;

const DATA_EPOCH = uuid(1);

const DEFAULT_SETTINGS: AppSettings = {
  scanIntervalMinutes: 30,
  enabledConnectors: ['free-work', 'le-hibou'],
  notifications: true,
  autoScan: true,
  maxSemanticPerScan: 20,
  notificationScoreThreshold: 80,
  respectRateLimits: true,
  customDelayMs: 500,
  theme: 'system',
};

const loadCommand = (
  resetCorrelation: { resetId: string; nextDataEpoch: string } | null = null
): Extract<SettingsPersistenceCommand, { type: 'RECOVER_AND_LOAD_SETTINGS' }> => ({
  type: 'RECOVER_AND_LOAD_SETTINGS',
  commandId: `settings/load/${uuid(2)}`,
  dataEpoch: DATA_EPOCH,
  requestId: uuid(2),
  resetCorrelation,
});

function capability(): SettingsDatasetGateCapabilityV1 {
  return {
    version: 1,
    kind: 'DATASET_EPOCH_SETTINGS_LEASE',
    dataEpoch: DATA_EPOCH,
    operationId: uuid(2),
    purpose: 'load',
    leaseId: uuid(3),
    authorityRevision: 1,
  };
}

function gate(): SettingsAtomicCommitGatePort {
  return {
    runExclusive: vi.fn(async (_scope, effect) => effect(capability())),
  };
}

function storage(initial: unknown | undefined): {
  port: SettingsLocalStoragePort;
  get value(): unknown | undefined;
} {
  let current = initial;
  return {
    get value() {
      return current;
    },
    port: {
      get: vi.fn(async () => current),
      set: vi.fn(async (_key, value) => {
        current = structuredClone(value);
      }),
    },
  };
}

function resetJournal(kind: 'absent' | 'closed' = 'absent'): SettingsResetJournalPort {
  return {
    admit: vi.fn(async ({ dataEpoch, capability: admittedCapability }) =>
      kind === 'closed'
        ? { kind: 'closed' as const }
        : {
            kind: 'absent' as const,
            dataEpoch,
            capability: admittedCapability,
            resetJournalAbsent: true as const,
          }
    ),
  };
}

function capacity(allowed = true): SettingsBootstrapCapacityPort {
  return {
    assertMigrationWriteAllowed: vi.fn(async () => allowed),
  };
}

function repository(
  initial: unknown | undefined,
  options: {
    legacyPolicy?: 'allow_migration' | 'v2_only';
    reset?: SettingsResetJournalPort;
    capacity?: SettingsBootstrapCapacityPort;
    storage?: ReturnType<typeof storage>;
  } = {}
) {
  const currentStorage = options.storage ?? storage(initial);
  const currentCapacity = options.capacity ?? capacity();
  return {
    currentStorage,
    currentCapacity,
    repository: createSettingsBootstrapRepository({
      storage: currentStorage.port,
      gate: gate(),
      resetJournal: options.reset ?? resetJournal(),
      capacity: currentCapacity,
      includedConnectorIds: ['free-work', 'le-hibou'],
      defaultSettings: DEFAULT_SETTINGS,
      legacyPolicy: options.legacyPolicy ?? 'allow_migration',
    }),
  };
}

describe('Settings bootstrap repository', () => {
  it('rejects an unknown runtime migration policy instead of reopening legacy writes', () => {
    const currentStorage = storage(undefined);
    expect(() =>
      createSettingsBootstrapRepository({
        storage: currentStorage.port,
        gate: gate(),
        resetJournal: resetJournal(),
        capacity: capacity(),
        includedConnectorIds: ['free-work', 'le-hibou'],
        defaultSettings: DEFAULT_SETTINGS,
        legacyPolicy: 'unexpected' as 'v2_only',
      })
    ).toThrow('explicit legacy migration policy');
  });

  it('supports the valid build configuration with every connector excluded', async () => {
    const currentStorage = storage(undefined);
    const current = createSettingsBootstrapRepository({
      storage: currentStorage.port,
      gate: gate(),
      resetJournal: resetJournal(),
      capacity: capacity(),
      includedConnectorIds: [],
      defaultSettings: { ...DEFAULT_SETTINGS, enabledConnectors: [] },
      legacyPolicy: 'allow_migration',
    });

    await expect(current.prepare(loadCommand())).resolves.toEqual({
      kind: 'ready',
      migrated: true,
    });
    expect(currentStorage.value).toMatchObject({
      version: 2,
      settings: { enabledConnectors: [] },
    });
  });

  it('initializes a missing legacy value as an exact V2 envelope and verifies read-back', async () => {
    const current = repository(undefined);

    await expect(current.repository.prepare(loadCommand())).resolves.toEqual({
      kind: 'ready',
      migrated: true,
    });
    expect(current.currentStorage.value).toEqual({
      version: 2,
      dataEpoch: DATA_EPOCH,
      revision: 0,
      generation: 0,
      settings: DEFAULT_SETTINGS,
      journal: null,
      outcomes: [],
    });
    expect(current.currentCapacity.assertMigrationWriteAllowed).toHaveBeenCalledOnce();
  });

  it('migrates strict V1 and bare pre-theme values without inventing other fields', async () => {
    const v1 = repository({ version: 1, revision: 7, settings: DEFAULT_SETTINGS });
    await expect(v1.repository.prepare(loadCommand())).resolves.toEqual({
      kind: 'ready',
      migrated: true,
    });
    expect(v1.currentStorage.value).toMatchObject({ revision: 7, generation: 0 });

    const { theme: _theme, ...preTheme } = DEFAULT_SETTINGS;
    const bare = repository({
      ...preTheme,
      enabledConnectors: ['le-hibou', 'excluded', 'free-work', 'le-hibou'],
    });
    await expect(bare.repository.prepare(loadCommand())).resolves.toEqual({
      kind: 'ready',
      migrated: true,
    });
    expect(bare.currentStorage.value).toMatchObject({
      settings: {
        theme: 'system',
        enabledConnectors: ['free-work', 'le-hibou'],
      },
    });
  });

  it('accepts a current exact V2 envelope without writing', async () => {
    const envelope = {
      version: 2,
      dataEpoch: DATA_EPOCH,
      revision: 4,
      generation: 9,
      settings: DEFAULT_SETTINGS,
      journal: null,
      outcomes: [],
    };
    const current = repository(envelope);

    await expect(current.repository.prepare(loadCommand())).resolves.toEqual({
      kind: 'ready',
      migrated: false,
    });
    expect(current.currentStorage.port.set).not.toHaveBeenCalled();
    expect(current.currentCapacity.assertMigrationWriteAllowed).not.toHaveBeenCalled();
  });

  it('fails closed after the V2-only cutover and while reset admission is closed', async () => {
    const cutover = repository(undefined, { legacyPolicy: 'v2_only' });
    await expect(cutover.repository.prepare(loadCommand())).resolves.toEqual({ kind: 'invalid' });
    expect(cutover.currentStorage.port.set).not.toHaveBeenCalled();

    const duringReset = repository(undefined, { reset: resetJournal('closed') });
    await expect(duringReset.repository.prepare(loadCommand())).resolves.toEqual({
      kind: 'reset_closed',
    });
    expect(duringReset.currentStorage.port.get).not.toHaveBeenCalled();
  });

  it('admits a committed reset load only through the exact joined reset correlation', async () => {
    const resetId = uuid(4);
    const resetCorrelation = { resetId, nextDataEpoch: DATA_EPOCH };
    const joined: SettingsResetJournalPort = {
      admit: vi.fn(async ({ dataEpoch, capability: admittedCapability }) => ({
        kind: 'committed_joined' as const,
        dataEpoch,
        resetCorrelation,
        capability: admittedCapability,
        resetJournalAbsent: true as const,
      })),
    };
    const current = repository(undefined, { reset: joined });

    await expect(current.repository.prepare(loadCommand(resetCorrelation))).resolves.toEqual({
      kind: 'ready',
      migrated: true,
    });

    const crossed: SettingsResetJournalPort = {
      admit: vi.fn(async ({ dataEpoch, capability: admittedCapability }) => ({
        kind: 'committed_joined' as const,
        dataEpoch,
        resetCorrelation: { resetId: uuid(5), nextDataEpoch: DATA_EPOCH },
        capability: admittedCapability,
        resetJournalAbsent: true as const,
      })),
    };
    const rejected = repository(undefined, { reset: crossed });
    await expect(
      rejected.repository.prepare(loadCommand({ resetId, nextDataEpoch: DATA_EPOCH }))
    ).resolves.toEqual({ kind: 'outcome_unknown' });
    expect(rejected.currentStorage.port.get).not.toHaveBeenCalled();
  });

  it('does not write without the extension-global migration capacity proof', async () => {
    const current = repository(undefined, { capacity: capacity(false) });

    await expect(current.repository.prepare(loadCommand())).resolves.toEqual({
      kind: 'capacity_denied',
    });
    expect(current.currentStorage.port.set).not.toHaveBeenCalled();
  });

  it('rejects a malformed truthy migration-capacity result', async () => {
    const malformedCapacity: SettingsBootstrapCapacityPort = {
      assertMigrationWriteAllowed: vi.fn(async () => 'yes' as never),
    };
    const current = repository(undefined, { capacity: malformedCapacity });

    await expect(current.repository.prepare(loadCommand())).resolves.toEqual({
      kind: 'outcome_unknown',
    });
    expect(current.currentStorage.port.set).not.toHaveBeenCalled();
  });

  it('captures reset admission once and never reads a transparent Proxy', async () => {
    let businessGetReads = 0;
    const target = {
      kind: 'absent' as const,
      dataEpoch: DATA_EPOCH,
      capability: capability(),
      resetJournalAbsent: true as const,
    };
    const admission = new Proxy(target, {
      get(current, key, receiver) {
        if (key === 'then') {
          return undefined;
        }
        businessGetReads += 1;
        return Reflect.get(current, key, receiver);
      },
    });
    const current = repository(undefined, {
      reset: { admit: vi.fn(async () => admission) },
    });

    await expect(current.repository.prepare(loadCommand())).resolves.toEqual({
      kind: 'ready',
      migrated: true,
    });
    expect(businessGetReads).toBe(0);
  });

  it('treats a rejected set as success only when exact V2 read-back proves the write', async () => {
    let reads = 0;
    const target = {
      version: 2,
      dataEpoch: DATA_EPOCH,
      revision: 0,
      generation: 0,
      settings: DEFAULT_SETTINGS,
      journal: null,
      outcomes: [],
    };
    const port: SettingsLocalStoragePort = {
      get: vi.fn(async () => (reads++ < 2 ? undefined : target)),
      set: vi.fn(async () => {
        throw new Error('ambiguous browser response');
      }),
    };
    const current = repository(undefined, {
      storage: {
        port,
        get value() {
          return target;
        },
      },
    });

    await expect(current.repository.prepare(loadCommand())).resolves.toEqual({
      kind: 'ready',
      migrated: true,
    });
  });

  it('does not let a storage adapter mutate the capacity-proved migration target', async () => {
    let stored: unknown;
    const port: SettingsLocalStoragePort = {
      get: vi.fn(async () => stored),
      set: vi.fn(async (_key, value) => {
        (value as { revision: number }).revision = 9;
        stored = value;
      }),
    };
    const current = repository(undefined, {
      storage: {
        port,
        get value() {
          return stored;
        },
      },
    });

    await expect(current.repository.prepare(loadCommand())).resolves.toEqual({
      kind: 'outcome_unknown',
    });
    expect(stored).toMatchObject({ revision: 9 });
  });

  it('detects a concurrent physical legacy replacement before writing', async () => {
    const first = { version: 1, revision: 1, settings: DEFAULT_SETTINGS };
    const second = { version: 1, revision: 2, settings: DEFAULT_SETTINGS };
    let reads = 0;
    const port: SettingsLocalStoragePort = {
      get: vi.fn(async () => (reads++ === 0 ? first : second)),
      set: vi.fn(async () => undefined),
    };
    const current = repository(first, {
      storage: {
        port,
        get value() {
          return second;
        },
      },
    });

    await expect(current.repository.prepare(loadCommand())).resolves.toEqual({
      kind: 'outcome_unknown',
    });
    expect(port.set).not.toHaveBeenCalled();
  });

  it('captures a hostile legacy source once before decode and CAS fingerprinting', async () => {
    const target = { version: 1, revision: 1, settings: DEFAULT_SETTINGS };
    let revisionReads = 0;
    const changingSource = new Proxy(target, {
      getOwnPropertyDescriptor(current, key) {
        const descriptor = Reflect.getOwnPropertyDescriptor(current, key);
        if (descriptor !== undefined && key === 'revision') {
          revisionReads += 1;
          return { ...descriptor, value: revisionReads === 1 ? 1 : 2 };
        }
        return descriptor;
      },
    });
    const port: SettingsLocalStoragePort = {
      get: vi.fn(async () => changingSource),
      set: vi.fn(async () => undefined),
    };
    const current = repository(changingSource, {
      storage: {
        port,
        get value() {
          return changingSource;
        },
      },
    });

    await expect(current.repository.prepare(loadCommand())).resolves.toEqual({
      kind: 'outcome_unknown',
    });
    expect(revisionReads).toBe(2);
    expect(port.set).not.toHaveBeenCalled();
  });
});
