import { describe, expect, it } from 'vitest';

import type { AppSettings } from '../../../src/lib/core/types/app-settings';
import {
  SETTINGS_PENDING_INTENT_STORAGE_KEY,
  commandId,
  createSettingsPendingIntentV1,
  originDigest,
  parseSettingsCommandDigest,
  parseSettingsPendingIntentV1,
  settingsCommandDigest,
  settingsDigest,
  type SettingMutation,
  type SettingsPersistenceCommand,
} from '../../../src/models/settings-persistence.contract';
import { createDatasetEpochAuthority } from '../../../src/lib/shell/storage/dataset-epoch-authority';
import {
  createSettingsDatasetGate,
  type SettingsAtomicCommitGatePort,
} from '../../../src/lib/shell/settings/settings-dataset-gate';
import {
  createSettingsPendingIntentRepository,
  type SettingsSessionStoragePort,
} from '../../../src/lib/shell/settings/settings-pending-intent.repository';

const uuid = (suffix: number): string =>
  `90000000-0000-4000-8000-${String(suffix).padStart(12, '0')}`;

const DATA_EPOCH = uuid(1);
const WORKER_EPOCH = uuid(2);
const INCLUDED_CONNECTORS = ['free-work'];
const DEFAULT_SETTINGS: AppSettings = {
  scanIntervalMinutes: 30,
  enabledConnectors: INCLUDED_CONNECTORS,
  notifications: true,
  autoScan: true,
  maxSemanticPerScan: 10,
  notificationScoreThreshold: 70,
  respectRateLimits: true,
  customDelayMs: 0,
  theme: 'system',
};
const immediateGate: SettingsAtomicCommitGatePort = {
  async runExclusive(scope, effect) {
    return effect({
      version: 1,
      kind: 'DATASET_EPOCH_SETTINGS_LEASE',
      dataEpoch: scope.dataEpoch,
      operationId: scope.operationId,
      purpose: scope.purpose,
      leaseId: uuid(900),
      authorityRevision: 0,
    });
  },
};

const MUTATION_IDENTITY_KEYS = [
  'mutationId',
  'permissionCheckId',
  'activationId',
  'activationResultId',
  'storageReservationId',
] as const;
type MutationIdentityKey = (typeof MUTATION_IDENTITY_KEYS)[number];
const RETRY_IDENTITY_KEYS = [
  'mutationId',
  'permissionCheckId',
  'activationId',
  'activationResultId',
  'storageReservationId',
  'requestId',
] as const;
type RetryIdentityKey = (typeof RETRY_IDENTITY_KEYS)[number];

class MemorySessionStorage implements SettingsSessionStoragePort {
  readonly values = new Map<string, unknown>();
  failSet = false;
  hideNextRead = false;
  hideReadAfterSet = false;

  async get(key: string): Promise<unknown | undefined> {
    if (this.hideNextRead) {
      this.hideNextRead = false;
      return undefined;
    }
    return structuredClone(this.values.get(key));
  }

  async set(key: string, value: unknown): Promise<void> {
    if (this.failSet) {
      throw new Error('session set failed');
    }
    this.values.set(key, structuredClone(value));
    if (this.hideReadAfterSet) {
      this.hideNextRead = true;
    }
  }

  async remove(key: string): Promise<void> {
    this.values.delete(key);
  }
}

function mutation(overrides: Partial<Record<MutationIdentityKey, string>> = {}): SettingMutation {
  const candidateSettings = { ...DEFAULT_SETTINGS, theme: 'dark' as const };
  const identities = {
    mutationId: uuid(10),
    permissionCheckId: uuid(11),
    activationId: uuid(12),
    activationResultId: uuid(13),
    storageReservationId: uuid(14),
    ...overrides,
  };
  const { mutationId, permissionCheckId, activationId, activationResultId, storageReservationId } =
    identities;
  const identityIds = Object.values(identities).sort();
  const previousDigest = settingsDigest(DEFAULT_SETTINGS);
  const candidateDigest = settingsDigest(candidateSettings);
  const commandDigest = settingsCommandDigest({
    dataEpoch: DATA_EPOCH,
    mutationId,
    baseRevision: 0,
    baseGeneration: 0,
    previousDigest,
    candidateDigest,
    originDigest: originDigest([]),
    baseCorrelationIds: identityIds,
  });
  return {
    key: 'theme',
    previousSettings: DEFAULT_SETTINGS,
    candidateSettings,
    previous: 'system',
    candidate: 'dark',
    previousDigest,
    candidateDigest,
    commandDigest,
    correlationIds: identityIds,
    mutationId,
    permissionCheckId,
    activationId,
    activationResultId,
    requiredOrigins: [],
    baseRevision: 0,
    baseGeneration: 0,
    permissionProof: null,
    storageReservationId,
    storageReservationProof: null,
  };
}

function persistCommand(
  intentRevision = 1,
  currentMutation = mutation(),
  originWorkerEpoch = WORKER_EPOCH
): Extract<SettingsPersistenceCommand, { type: 'PERSIST_SETTINGS_PENDING_INTENT' }> {
  const pendingIntent = createSettingsPendingIntentV1({
    dataEpoch: DATA_EPOCH,
    originWorkerEpoch,
    intentRevision,
    mutation: currentMutation,
    retryIntent: null,
    phase: 'reserving',
    nextCommandType: 'RESERVE_SETTINGS_STORAGE',
    nextCommandId: commandId('reserve', currentMutation.storageReservationId),
    requestId: null,
    terminalSettlement: null,
  });
  return {
    type: 'PERSIST_SETTINGS_PENDING_INTENT',
    commandId: commandId('persist_intent', uuid(100 + intentRevision)),
    dataEpoch: DATA_EPOCH,
    storageArea: 'session',
    storageKey: SETTINGS_PENDING_INTENT_STORAGE_KEY,
    intentRevision,
    intentDigest: pendingIntent.intentDigest,
    pendingIntent,
  };
}

function reconcilePendingIntent(requestId: string, originWorkerEpoch = WORKER_EPOCH) {
  const current = mutation();
  const mutationWithRequest: SettingMutation = {
    ...current,
    correlationIds: [...current.correlationIds, requestId].sort(),
  };
  return createSettingsPendingIntentV1({
    dataEpoch: DATA_EPOCH,
    originWorkerEpoch,
    intentRevision: 2,
    mutation: mutationWithRequest,
    retryIntent: null,
    phase: 'reconciling',
    nextCommandType: 'RECONCILE_SETTINGS',
    nextCommandId: commandId('reconcile', requestId),
    requestId,
    terminalSettlement: null,
  });
}

function retryPendingIntent(
  overrides: Partial<Record<RetryIdentityKey, string>> = {},
  originWorkerEpoch = WORKER_EPOCH
) {
  const current = mutation();
  const retryIntent = {
    failedMutationId: current.mutationId,
    mutationId: uuid(160),
    permissionCheckId: uuid(161),
    activationId: uuid(162),
    activationResultId: uuid(163),
    storageReservationId: uuid(164),
    requestId: uuid(165),
    ...overrides,
  };
  return createSettingsPendingIntentV1({
    dataEpoch: DATA_EPOCH,
    originWorkerEpoch,
    intentRevision: 2,
    mutation: current,
    retryIntent,
    phase: 'rebasing',
    nextCommandType: 'REBASE_SETTINGS_MUTATION',
    nextCommandId: commandId('rebase', retryIntent.requestId),
    requestId: retryIntent.requestId,
    terminalSettlement: null,
  });
}

describe('settings pending intent repository', () => {
  it('rejects command digests that reuse the data epoch as a correlation identity', () => {
    const crossed = mutation({ activationId: DATA_EPOCH });

    expect(parseSettingsCommandDigest(crossed.commandDigest)).toBeNull();
  });

  it.each(MUTATION_IDENTITY_KEYS)(
    'rejects a pending mutation whose %s reuses the data epoch',
    (identityKey) => {
      const crossed = persistCommand(1, mutation({ [identityKey]: DATA_EPOCH }));

      expect(parseSettingsPendingIntentV1(crossed.pendingIntent, INCLUDED_CONNECTORS)).toBeNull();
    }
  );

  it.each(MUTATION_IDENTITY_KEYS)(
    'rejects a pending origin worker that reuses the mutation %s',
    (identityKey) => {
      const current = mutation();
      const crossed = persistCommand(1, current, current[identityKey] as string);

      expect(parseSettingsPendingIntentV1(crossed.pendingIntent, INCLUDED_CONNECTORS)).toBeNull();
    }
  );

  it.each([
    ['origin worker equals data epoch', reconcilePendingIntent(uuid(150), DATA_EPOCH)],
    ['request equals data epoch', reconcilePendingIntent(DATA_EPOCH)],
    ['request equals origin worker', reconcilePendingIntent(WORKER_EPOCH)],
  ])('rejects crossed pending identity: %s', (_label, pendingIntent) => {
    expect(parseSettingsPendingIntentV1(pendingIntent, INCLUDED_CONNECTORS)).toBeNull();
  });

  it('accepts a retry only when its six fresh identities are epoch-disjoint', () => {
    expect(parseSettingsPendingIntentV1(retryPendingIntent(), INCLUDED_CONNECTORS)).not.toBeNull();
  });

  it.each(RETRY_IDENTITY_KEYS)('rejects retry %s reuse of the data epoch', (identityKey) => {
    const crossed = retryPendingIntent({ [identityKey]: DATA_EPOCH });

    expect(parseSettingsPendingIntentV1(crossed, INCLUDED_CONNECTORS)).toBeNull();
  });

  it.each(RETRY_IDENTITY_KEYS)(
    'rejects retry %s reuse of the origin worker epoch',
    (identityKey) => {
      const crossed = retryPendingIntent({ [identityKey]: WORKER_EPOCH });

      expect(parseSettingsPendingIntentV1(crossed, INCLUDED_CONNECTORS)).toBeNull();
    }
  );

  it('keeps read/compare/set/read-back atomic across two repository instances', async () => {
    let releaseFirstSet!: () => void;
    let firstSetEntered!: () => void;
    const release = new Promise<void>((resolve) => {
      releaseFirstSet = resolve;
    });
    const entered = new Promise<void>((resolve) => {
      firstSetEntered = resolve;
    });
    const operations: string[] = [];
    let firstSet = true;
    const values = new Map<string, unknown>();
    const storage: SettingsSessionStoragePort = {
      async get(key) {
        operations.push('get');
        return structuredClone(values.get(key));
      },
      async set(key, value) {
        operations.push('set:start');
        if (firstSet) {
          firstSet = false;
          firstSetEntered();
          await release;
        }
        values.set(key, structuredClone(value));
        operations.push('set:end');
      },
      async remove(key) {
        values.delete(key);
      },
    };
    const authority = createDatasetEpochAuthority({
      workerEpoch: uuid(300),
      allocateLeaseId: () => uuid(301),
    });
    authority.openAdmission({
      version: 1,
      attemptId: uuid(302),
      workerEpoch: uuid(300),
      dataEpoch: DATA_EPOCH,
      authorityRevision: 0,
      admission: 'open',
      proofId: uuid(303),
    });
    const gate = createSettingsDatasetGate(authority);
    let proofId = 310;
    const dependencies = {
      storage,
      gate,
      includedConnectorIds: INCLUDED_CONNECTORS,
      allocateProofId: () => uuid(proofId++),
    };
    const firstRepository = createSettingsPendingIntentRepository(dependencies);
    const secondRepository = createSettingsPendingIntentRepository(dependencies);
    const command = persistCommand();

    const first = firstRepository.persist(command);
    await entered;
    const second = secondRepository.persist(command);
    await Promise.resolve();
    await Promise.resolve();
    expect(operations).toEqual(['get', 'set:start']);

    releaseFirstSet();
    await expect(Promise.all([first, second])).resolves.toMatchObject([
      { kind: 'persisted' },
      { kind: 'persisted' },
    ]);
    expect(operations).toEqual(['get', 'set:start', 'set:end', 'get', 'get']);
  });

  it('persists the exact record and returns a read-back proof', async () => {
    const storage = new MemorySessionStorage();
    const repository = createSettingsPendingIntentRepository({
      storage,
      gate: immediateGate,
      includedConnectorIds: INCLUDED_CONNECTORS,
      allocateProofId: () => uuid(200),
    });
    const command = persistCommand();

    const result = await repository.persist(command);

    expect(result.kind).toBe('persisted');
    expect(result.proof).toMatchObject({
      kind: 'SETTINGS_PENDING_INTENT_PERSISTED',
      commandId: command.commandId,
      intentDigest: command.intentDigest,
      readBackVerified: true,
    });
    expect(
      parseSettingsPendingIntentV1(
        storage.values.get(SETTINGS_PENDING_INTENT_STORAGE_KEY),
        INCLUDED_CONNECTORS
      )
    ).toEqual(command.pendingIntent);
  });

  it('returns an exact absent proof only for the first pre-admission revision', async () => {
    const storage = new MemorySessionStorage();
    storage.hideReadAfterSet = true;
    const repository = createSettingsPendingIntentRepository({
      storage,
      gate: immediateGate,
      includedConnectorIds: INCLUDED_CONNECTORS,
      allocateProofId: () => uuid(201),
    });

    const result = await repository.persist(persistCommand(1));

    expect(result).toMatchObject({
      kind: 'absent',
      proof: {
        kind: 'SETTINGS_PENDING_INTENT_ABSENT',
        intentRevision: 1,
        absenceReadBackVerified: true,
      },
    });
  });

  it('fails closed when a later revision cannot be read back', async () => {
    const storage = new MemorySessionStorage();
    storage.hideReadAfterSet = true;
    const repository = createSettingsPendingIntentRepository({
      storage,
      gate: immediateGate,
      includedConnectorIds: INCLUDED_CONNECTORS,
      allocateProofId: () => uuid(202),
    });

    const result = await repository.persist(persistCommand(2));

    expect(result).toEqual({ kind: 'outcome_unknown' });
  });

  it('does not overwrite a newer read-back-verified intent with a stale revision', async () => {
    const storage = new MemorySessionStorage();
    const repository = createSettingsPendingIntentRepository({
      storage,
      gate: immediateGate,
      includedConnectorIds: INCLUDED_CONNECTORS,
      allocateProofId: () => uuid(207),
    });
    const stale = persistCommand(1);
    const newer = persistCommand(2);
    storage.values.set(SETTINGS_PENDING_INTENT_STORAGE_KEY, structuredClone(newer.pendingIntent));

    const result = await repository.persist(stale);

    expect(result).toEqual({ kind: 'outcome_unknown' });
    expect(storage.values.get(SETTINGS_PENDING_INTENT_STORAGE_KEY)).toEqual(newer.pendingIntent);
  });

  it('clears only after an absence read-back and keeps ambiguity explicit', async () => {
    const storage = new MemorySessionStorage();
    const repository = createSettingsPendingIntentRepository({
      storage,
      gate: immediateGate,
      includedConnectorIds: INCLUDED_CONNECTORS,
      allocateProofId: () => uuid(203),
    });
    const persist = persistCommand();
    await repository.persist(persist);
    const clear: Extract<SettingsPersistenceCommand, { type: 'CLEAR_SETTINGS_PENDING_INTENT' }> = {
      type: 'CLEAR_SETTINGS_PENDING_INTENT',
      commandId: commandId('clear_intent', uuid(204)),
      dataEpoch: persist.dataEpoch,
      storageArea: 'session',
      storageKey: SETTINGS_PENDING_INTENT_STORAGE_KEY,
      mutationId: persist.pendingIntent.mutation.mutationId,
      originWorkerEpoch: persist.pendingIntent.originWorkerEpoch,
      intentRevision: persist.intentRevision,
      intentDigest: persist.intentDigest,
    };

    const result = await repository.clear(clear);

    expect(result).toMatchObject({
      kind: 'cleared',
      proof: {
        kind: 'SETTINGS_PENDING_INTENT_CLEARED',
        absenceReadBackVerified: true,
      },
    });
    expect(storage.values.has(SETTINGS_PENDING_INTENT_STORAGE_KEY)).toBe(false);
  });

  it('never clears a newer durable intent owned by another command revision', async () => {
    const storage = new MemorySessionStorage();
    const repository = createSettingsPendingIntentRepository({
      storage,
      gate: immediateGate,
      includedConnectorIds: INCLUDED_CONNECTORS,
      allocateProofId: () => uuid(205),
    });
    const stale = persistCommand(1);
    const newer = persistCommand(2);
    storage.values.set(SETTINGS_PENDING_INTENT_STORAGE_KEY, structuredClone(newer.pendingIntent));
    const clear: Extract<SettingsPersistenceCommand, { type: 'CLEAR_SETTINGS_PENDING_INTENT' }> = {
      type: 'CLEAR_SETTINGS_PENDING_INTENT',
      commandId: commandId('clear_intent', uuid(206)),
      dataEpoch: stale.dataEpoch,
      storageArea: 'session',
      storageKey: SETTINGS_PENDING_INTENT_STORAGE_KEY,
      mutationId: stale.pendingIntent.mutation.mutationId,
      originWorkerEpoch: stale.pendingIntent.originWorkerEpoch,
      intentRevision: stale.intentRevision,
      intentDigest: stale.intentDigest,
    };

    const result = await repository.clear(clear);

    expect(result).toEqual({ kind: 'outcome_unknown' });
    expect(storage.values.get(SETTINGS_PENDING_INTENT_STORAGE_KEY)).toEqual(newer.pendingIntent);
  });
});
