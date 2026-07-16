import {
  SETTINGS_PENDING_INTENT_STORAGE_KEY,
  isUuidV4,
  parseSettingsPendingIntentV1,
  type SettingsPendingIntentAbsentProofV1,
  type SettingsPendingIntentClearedProofV1,
  type SettingsPendingIntentV1,
  type SettingsPendingIntentPersistedProofV1,
  type SettingsPersistenceCommand,
} from '../../../models/settings-persistence.contract';
import type { SettingsAtomicCommitGatePort } from './settings-dataset-gate';

type PersistCommand = Extract<
  SettingsPersistenceCommand,
  { type: 'PERSIST_SETTINGS_PENDING_INTENT' }
>;
type ClearCommand = Extract<SettingsPersistenceCommand, { type: 'CLEAR_SETTINGS_PENDING_INTENT' }>;

export interface SettingsSessionStoragePort {
  get(key: string): Promise<unknown | undefined>;
  set(key: string, value: unknown): Promise<void>;
  remove(key: string): Promise<void>;
}

export type SettingsPendingIntentPersistResult =
  | { kind: 'persisted'; proof: SettingsPendingIntentPersistedProofV1 }
  | { kind: 'absent'; proof: SettingsPendingIntentAbsentProofV1 }
  | { kind: 'outcome_unknown' };

export type SettingsPendingIntentClearResult =
  { kind: 'cleared'; proof: SettingsPendingIntentClearedProofV1 } | { kind: 'outcome_unknown' };

export interface SettingsPendingIntentRepository {
  persist(command: PersistCommand): Promise<SettingsPendingIntentPersistResult>;
  clear(command: ClearCommand): Promise<SettingsPendingIntentClearResult>;
  load(dataEpoch: string, operationId: string): Promise<unknown | null>;
}

export interface SettingsPendingIntentRepositoryDependencies {
  storage: SettingsSessionStoragePort;
  gate: SettingsAtomicCommitGatePort;
  includedConnectorIds: readonly string[];
  allocateProofId: () => string;
}

function samePendingIntent(left: SettingsPendingIntentV1, right: SettingsPendingIntentV1): boolean {
  return left.intentDigest === right.intentDigest;
}

function validPersistCommand(command: PersistCommand, includedConnectorIds: string[]): boolean {
  const parsed = parseSettingsPendingIntentV1(command.pendingIntent, includedConnectorIds);
  return (
    command.storageArea === 'session' &&
    command.storageKey === SETTINGS_PENDING_INTENT_STORAGE_KEY &&
    parsed !== null &&
    parsed.dataEpoch === command.dataEpoch &&
    parsed.intentRevision === command.intentRevision &&
    parsed.intentDigest === command.intentDigest &&
    samePendingIntent(parsed, command.pendingIntent)
  );
}

function pendingIntentIdentityInventory(intent: SettingsPendingIntentV1): string[] {
  const mutation = intent.mutation;
  return [
    intent.dataEpoch,
    intent.originWorkerEpoch,
    mutation.mutationId,
    mutation.permissionCheckId,
    mutation.activationId,
    mutation.activationResultId,
    mutation.storageReservationId,
    ...mutation.correlationIds,
    ...(mutation.storageReservationProof === null
      ? []
      : [mutation.storageReservationProof.gateLeaseId, mutation.storageReservationProof.proofId]),
    ...(intent.retryIntent === null
      ? []
      : [
          intent.retryIntent.failedMutationId,
          intent.retryIntent.mutationId,
          intent.retryIntent.permissionCheckId,
          intent.retryIntent.activationId,
          intent.retryIntent.activationResultId,
          intent.retryIntent.storageReservationId,
          intent.retryIntent.requestId,
        ]),
    ...(intent.terminalSettlement === null
      ? []
      : [
          intent.terminalSettlement.mutationId,
          intent.terminalSettlement.requestId,
          intent.terminalSettlement.outcome.mutationId,
          ...intent.terminalSettlement.outcome.correlationIds,
        ]),
  ];
}

function nextProofId(
  allocateProofId: () => string,
  forbiddenIds: readonly string[]
): string | null {
  const proofId = allocateProofId();
  return isUuidV4(proofId) && !forbiddenIds.includes(proofId) ? proofId : null;
}

export function createSettingsPendingIntentRepository(
  dependencies: SettingsPendingIntentRepositoryDependencies
): SettingsPendingIntentRepository {
  const includedConnectorIds = [...dependencies.includedConnectorIds];

  const persistWithinGate = async (
    command: PersistCommand
  ): Promise<SettingsPendingIntentPersistResult> => {
    const forbiddenProofIds = pendingIntentIdentityInventory(command.pendingIntent);
    try {
      const currentRaw = await dependencies.storage.get(SETTINGS_PENDING_INTENT_STORAGE_KEY);
      if (currentRaw === undefined) {
        if (command.intentRevision !== 1) {
          return { kind: 'outcome_unknown' };
        }
      } else {
        const current = parseSettingsPendingIntentV1(currentRaw, includedConnectorIds);
        if (current === null) {
          return { kind: 'outcome_unknown' };
        }
        if (samePendingIntent(current, command.pendingIntent)) {
          const proofId = nextProofId(dependencies.allocateProofId, forbiddenProofIds);
          return proofId === null
            ? { kind: 'outcome_unknown' }
            : {
                kind: 'persisted',
                proof: {
                  version: 1,
                  kind: 'SETTINGS_PENDING_INTENT_PERSISTED',
                  storageArea: 'session',
                  storageKey: SETTINGS_PENDING_INTENT_STORAGE_KEY,
                  dataEpoch: command.dataEpoch,
                  mutationId: command.pendingIntent.mutation.mutationId,
                  originWorkerEpoch: command.pendingIntent.originWorkerEpoch,
                  intentRevision: command.intentRevision,
                  intentDigest: command.intentDigest,
                  commandId: command.commandId,
                  proofId,
                  readBackVerified: true,
                },
              };
        }
        if (
          current.dataEpoch !== command.dataEpoch ||
          current.mutation.mutationId !== command.pendingIntent.mutation.mutationId ||
          current.originWorkerEpoch !== command.pendingIntent.originWorkerEpoch ||
          current.intentRevision + 1 !== command.intentRevision
        ) {
          return { kind: 'outcome_unknown' };
        }
      }
    } catch {
      return { kind: 'outcome_unknown' };
    }

    try {
      await dependencies.storage.set(SETTINGS_PENDING_INTENT_STORAGE_KEY, command.pendingIntent);
    } catch {
      // A rejected browser Promise does not prove whether the write committed.
      // The mandatory read-back below is the sole authority.
    }

    let raw: unknown | undefined;
    try {
      raw = await dependencies.storage.get(SETTINGS_PENDING_INTENT_STORAGE_KEY);
    } catch {
      return { kind: 'outcome_unknown' };
    }

    const parsed = parseSettingsPendingIntentV1(raw, includedConnectorIds);
    if (parsed !== null && samePendingIntent(parsed, command.pendingIntent)) {
      const proofId = nextProofId(dependencies.allocateProofId, forbiddenProofIds);
      if (proofId === null) {
        return { kind: 'outcome_unknown' };
      }
      return {
        kind: 'persisted',
        proof: {
          version: 1,
          kind: 'SETTINGS_PENDING_INTENT_PERSISTED',
          storageArea: 'session',
          storageKey: SETTINGS_PENDING_INTENT_STORAGE_KEY,
          dataEpoch: command.dataEpoch,
          mutationId: command.pendingIntent.mutation.mutationId,
          originWorkerEpoch: command.pendingIntent.originWorkerEpoch,
          intentRevision: command.intentRevision,
          intentDigest: command.intentDigest,
          commandId: command.commandId,
          proofId,
          readBackVerified: true,
        },
      };
    }

    if (
      raw === undefined &&
      command.intentRevision === 1 &&
      command.pendingIntent.mutation.storageReservationProof === null
    ) {
      const proofId = nextProofId(dependencies.allocateProofId, forbiddenProofIds);
      if (proofId === null) {
        return { kind: 'outcome_unknown' };
      }
      return {
        kind: 'absent',
        proof: {
          version: 1,
          kind: 'SETTINGS_PENDING_INTENT_ABSENT',
          storageArea: 'session',
          storageKey: SETTINGS_PENDING_INTENT_STORAGE_KEY,
          dataEpoch: command.dataEpoch,
          mutationId: command.pendingIntent.mutation.mutationId,
          originWorkerEpoch: command.pendingIntent.originWorkerEpoch,
          intentRevision: 1,
          intentDigest: command.intentDigest,
          commandId: command.commandId,
          proofId,
          absenceReadBackVerified: true,
        },
      };
    }

    return { kind: 'outcome_unknown' };
  };

  const clearWithinGate = async (
    command: ClearCommand
  ): Promise<SettingsPendingIntentClearResult> => {
    let currentIntent: SettingsPendingIntentV1 | null = null;
    try {
      const currentRaw = await dependencies.storage.get(SETTINGS_PENDING_INTENT_STORAGE_KEY);
      if (currentRaw !== undefined) {
        const current = parseSettingsPendingIntentV1(currentRaw, includedConnectorIds);
        if (
          current === null ||
          current.dataEpoch !== command.dataEpoch ||
          current.mutation.mutationId !== command.mutationId ||
          current.originWorkerEpoch !== command.originWorkerEpoch ||
          current.intentRevision !== command.intentRevision ||
          current.intentDigest !== command.intentDigest
        ) {
          return { kind: 'outcome_unknown' };
        }
        currentIntent = current;
      }
    } catch {
      return { kind: 'outcome_unknown' };
    }

    try {
      await dependencies.storage.remove(SETTINGS_PENDING_INTENT_STORAGE_KEY);
    } catch {
      // As with set(), a rejected Promise is ambiguous until read-back.
    }

    try {
      const raw = await dependencies.storage.get(SETTINGS_PENDING_INTENT_STORAGE_KEY);
      if (raw !== undefined) {
        return { kind: 'outcome_unknown' };
      }
    } catch {
      return { kind: 'outcome_unknown' };
    }

    const proofId = nextProofId(dependencies.allocateProofId, [
      command.dataEpoch,
      command.mutationId,
      command.originWorkerEpoch,
      ...(currentIntent === null ? [] : pendingIntentIdentityInventory(currentIntent)),
    ]);
    if (proofId === null) {
      return { kind: 'outcome_unknown' };
    }
    return {
      kind: 'cleared',
      proof: {
        version: 1,
        kind: 'SETTINGS_PENDING_INTENT_CLEARED',
        storageArea: 'session',
        storageKey: SETTINGS_PENDING_INTENT_STORAGE_KEY,
        dataEpoch: command.dataEpoch,
        mutationId: command.mutationId,
        originWorkerEpoch: command.originWorkerEpoch,
        intentRevision: command.intentRevision,
        intentDigest: command.intentDigest,
        commandId: command.commandId,
        proofId,
        absenceReadBackVerified: true,
      },
    };
  };

  return {
    persist(command) {
      if (!validPersistCommand(command, includedConnectorIds)) {
        return Promise.resolve({ kind: 'outcome_unknown' });
      }
      return dependencies.gate.runExclusive(
        {
          dataEpoch: command.dataEpoch,
          operationId: command.pendingIntent.mutation.mutationId,
          purpose: 'pending_intent',
        },
        () => persistWithinGate(command)
      );
    },

    clear(command) {
      if (
        command.storageArea !== 'session' ||
        command.storageKey !== SETTINGS_PENDING_INTENT_STORAGE_KEY
      ) {
        return Promise.resolve({ kind: 'outcome_unknown' });
      }
      return dependencies.gate.runExclusive(
        {
          dataEpoch: command.dataEpoch,
          operationId: command.mutationId,
          purpose: 'pending_intent',
        },
        () => clearWithinGate(command)
      );
    },

    load(dataEpoch, operationId) {
      return dependencies.gate.runExclusive(
        { dataEpoch, operationId, purpose: 'pending_intent' },
        async () => {
          const raw = await dependencies.storage.get(SETTINGS_PENDING_INTENT_STORAGE_KEY);
          return raw === undefined ? null : raw;
        }
      );
    },
  };
}
