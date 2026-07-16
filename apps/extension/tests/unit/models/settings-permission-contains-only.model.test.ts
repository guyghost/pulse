import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import type { AppSettings } from '../../../src/lib/core/types/app-settings';
import {
  SETTINGS_PENDING_INTENT_STORAGE_KEY,
  contractFor,
  expectedAlarm,
  makeError,
  originDigest,
  parseSettingsHostPermissionContainsProofV1,
  settingsDigest,
  type SettingsActivationRegistryResultV1,
  type SettingsEnvelopeV2,
  type SettingsGlobalStorageReservationProofV1,
  type SettingsHostPermissionContainsProofV1,
  type SettingsMutationOutcomeV1,
  type SettingsPendingIntentPersistedProofV1,
  type SettingsSnapshotV1,
} from '../../../src/models/settings-persistence.contract';
import {
  createSettingsPersistenceController,
  type SettingsPersistenceController,
  type SettingsPersistencePublicView,
} from '../../../src/models/settings-persistence.machine';

const uuid = (suffix: number): string =>
  `30000000-0000-4000-8000-${String(suffix).padStart(12, '0')}`;

const DATA_EPOCH = uuid(1);
const WORKER_EPOCH = uuid(2);
const DEFAULT_SETTINGS: AppSettings = {
  scanIntervalMinutes: 30,
  enabledConnectors: ['free-work'],
  notifications: true,
  autoScan: true,
  maxSemanticPerScan: 10,
  notificationScoreThreshold: 70,
  respectRateLimits: true,
  customDelayMs: 0,
  theme: 'system',
};
const INCLUDED_CONNECTORS = ['free-work', 'malt'];
const PERMISSION_ORIGINS = {
  'free-work': ['https://www.free-work.com/*'],
  malt: ['https://www.malt.fr/*'],
};

type PublicCommand = NonNullable<SettingsPersistencePublicView['command']>;

function consumedActivation(
  mutationId: string,
  permissionCheckId: string,
  activationId: string,
  storageReservationId: string,
  resultId = uuid(900)
): SettingsActivationRegistryResultV1 {
  return {
    version: 1,
    kind: 'SETTINGS_ACTIVATION_CONSUMED',
    dataEpoch: DATA_EPOCH,
    workerEpoch: WORKER_EPOCH,
    mutationId,
    permissionCheckId,
    activationId,
    storageReservationId,
    issuedAtMs: 1_000,
    expiresAtMs: 301_000,
    observedAtMs: 2_000,
    resultId,
    oneShotConsumed: true,
  };
}

function rejectedActivation(
  mutationId: string,
  permissionCheckId: string,
  activationId: string,
  storageReservationId: string,
  reason: 'expired' | 'replayed' | 'crossed',
  resultId: string
): SettingsActivationRegistryResultV1 {
  return {
    version: 1,
    kind: 'SETTINGS_ACTIVATION_REJECTED',
    dataEpoch: DATA_EPOCH,
    workerEpoch: WORKER_EPOCH,
    mutationId,
    permissionCheckId,
    activationId,
    storageReservationId,
    issuedAtMs: 1_000,
    expiresAtMs: 2_000,
    observedAtMs: reason === 'expired' ? 2_001 : 1_500,
    resultId,
    reason,
  };
}

function commandOfType<T extends PublicCommand['type']>(
  current: SettingsPersistenceController,
  type: T
): Extract<PublicCommand, { type: T }> {
  const command = current.getSnapshot().command;
  expect(command?.type).toBe(type);
  if (command?.type !== type) {
    throw new Error(`Expected ${type}`);
  }
  return command as Extract<PublicCommand, { type: T }>;
}

function envelope(
  settings: AppSettings = DEFAULT_SETTINGS,
  revision = 0,
  generation = 0,
  outcomes: SettingsMutationOutcomeV1[] = []
): SettingsEnvelopeV2 {
  return {
    version: 2,
    dataEpoch: DATA_EPOCH,
    revision,
    generation,
    settings: { ...settings, enabledConnectors: [...settings.enabledConnectors] },
    journal: null,
    outcomes,
  };
}

function snapshot(
  currentEnvelope: SettingsEnvelopeV2,
  requestId: string,
  commandId: string,
  proofId: string
): SettingsSnapshotV1 {
  return {
    version: 1,
    dataEpoch: DATA_EPOCH,
    requestId,
    commandId,
    resetJournalAbsent: true,
    envelope: currentEnvelope,
    alarmProof: {
      ...expectedAlarm(currentEnvelope.settings),
      dataEpoch: DATA_EPOCH,
      envelopeRevision: currentEnvelope.revision,
      envelopeGeneration: currentEnvelope.generation,
      settingsDigest: settingsDigest(currentEnvelope.settings),
      proofId,
      requestId,
      commandId,
    },
  };
}

function controller(): SettingsPersistenceController {
  const current = createSettingsPersistenceController({
    dataEpoch: DATA_EPOCH,
    workerEpoch: WORKER_EPOCH,
    defaultSettings: DEFAULT_SETTINGS,
    includedConnectorIds: INCLUDED_CONNECTORS,
    permissionOriginsByConnectorId: PERMISSION_ORIGINS,
    initialLoadRequestId: uuid(10),
    coldStartSeed: null,
  });
  const load = commandOfType(current, 'RECOVER_AND_LOAD_SETTINGS');
  expect(
    current.dispatch({
      type: 'LOAD_SUCCEEDED',
      dataEpoch: DATA_EPOCH,
      requestId: load.requestId,
      commandId: load.commandId,
      snapshot: snapshot(envelope(), load.requestId, load.commandId, uuid(11)),
    })
  ).toEqual({ status: 'dispatched' });
  return current;
}

function persistedProof(
  command: Extract<PublicCommand, { type: 'PERSIST_SETTINGS_PENDING_INTENT' }>,
  proofId: string
): SettingsPendingIntentPersistedProofV1 {
  return {
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
  };
}

function advancePersist(current: SettingsPersistenceController, proofId: string): void {
  const persist = commandOfType(current, 'PERSIST_SETTINGS_PENDING_INTENT');
  expect(
    current.dispatch({
      type: 'SETTINGS_PENDING_INTENT_PERSISTED',
      dataEpoch: DATA_EPOCH,
      mutationId: persist.pendingIntent.mutation.mutationId,
      commandId: persist.commandId,
      proof: persistedProof(persist, proofId),
    })
  ).toEqual({ status: 'dispatched' });
}

function advanceClear(current: SettingsPersistenceController, proofId: string): void {
  const clear = commandOfType(current, 'CLEAR_SETTINGS_PENDING_INTENT');
  expect(
    current.dispatch({
      type: 'SETTINGS_PENDING_INTENT_CLEARED',
      dataEpoch: clear.dataEpoch,
      mutationId: clear.mutationId,
      commandId: clear.commandId,
      proof: {
        version: 1,
        kind: 'SETTINGS_PENDING_INTENT_CLEARED',
        storageArea: 'session',
        storageKey: SETTINGS_PENDING_INTENT_STORAGE_KEY,
        dataEpoch: clear.dataEpoch,
        mutationId: clear.mutationId,
        originWorkerEpoch: clear.originWorkerEpoch,
        intentRevision: clear.intentRevision,
        intentDigest: clear.intentDigest,
        commandId: clear.commandId,
        proofId,
        absenceReadBackVerified: true,
      },
    })
  ).toEqual({ status: 'dispatched' });
}

function reservationProof(
  command: Extract<PublicCommand, { type: 'RESERVE_SETTINGS_STORAGE' }>
): SettingsGlobalStorageReservationProofV1 {
  const quotaBytes = 10_000_000;
  return {
    version: 1,
    kind: 'CHROME_LOCAL_SETTINGS_RESERVATION',
    storageArea: 'local',
    settingsKey: 'settings',
    dataEpoch: command.dataEpoch,
    mutationId: command.mutationId,
    commandDigest: command.commandDigest,
    baseRevision: command.baseRevision,
    baseGeneration: command.baseGeneration,
    reservationId: command.reservationId,
    gateLeaseId: uuid(20),
    proofId: uuid(21),
    quotaBytes,
    bytesInUse: 0,
    currentSettingsEntryBytes: command.byteProjection.currentSettingsEntryBytes,
    reservedSettingsEntryBytes: command.byteProjection.reservedSettingsEntryBytes,
    requiredAdditionalBytes: command.byteProjection.requiredAdditionalBytes,
    systemReserveBytes: command.byteProjection.systemReserveBytes,
    resetReceiptReserveBytes: command.byteProjection.resetReceiptReserveBytes,
    availableAfterReservationBytes: quotaBytes - command.byteProjection.requiredAdditionalBytes,
    reservationActive: true,
    allLocalWritersFenced: true,
    resetJournalAbsent: true,
  };
}

function reservationDenial(
  command: Extract<PublicCommand, { type: 'RESERVE_SETTINGS_STORAGE' }>,
  gateLeaseId: string,
  proofId: string
) {
  return {
    version: 1 as const,
    kind: 'CHROME_LOCAL_SETTINGS_RESERVATION_DENIED' as const,
    storageArea: 'local' as const,
    settingsKey: 'settings' as const,
    dataEpoch: command.dataEpoch,
    mutationId: command.mutationId,
    commandDigest: command.commandDigest,
    baseRevision: command.baseRevision,
    baseGeneration: command.baseGeneration,
    reservationId: command.reservationId,
    gateLeaseId,
    proofId,
    quotaBytes: 0,
    bytesInUse: 0,
    currentSettingsEntryBytes: command.byteProjection.currentSettingsEntryBytes,
    reservedSettingsEntryBytes: command.byteProjection.reservedSettingsEntryBytes,
    requiredAdditionalBytes: command.byteProjection.requiredAdditionalBytes,
    systemReserveBytes: command.byteProjection.systemReserveBytes,
    resetReceiptReserveBytes: command.byteProjection.resetReceiptReserveBytes,
    availableBytes: 0,
    reason: 'INSUFFICIENT_GLOBAL_HEADROOM' as const,
    allLocalWritersFenced: true as const,
    resetJournalAbsent: true as const,
  };
}

function beginThemeReservation(
  current: SettingsPersistenceController,
  base: number
): Extract<PublicCommand, { type: 'RESERVE_SETTINGS_STORAGE' }> {
  const ids = {
    mutationId: uuid(base),
    permissionCheckId: uuid(base + 1),
    activationId: uuid(base + 2),
    storageReservationId: uuid(base + 3),
  };
  expect(
    current.dispatch({
      type: 'MUTATE',
      dataEpoch: DATA_EPOCH,
      ...ids,
      activationResult: consumedActivation(
        ids.mutationId,
        ids.permissionCheckId,
        ids.activationId,
        ids.storageReservationId,
        uuid(base + 4)
      ),
      key: 'theme',
      candidate: 'dark',
    })
  ).toEqual({ status: 'dispatched' });
  advancePersist(current, uuid(base + 5));
  return commandOfType(current, 'RESERVE_SETTINGS_STORAGE');
}

function beginConnectorMutation(current: SettingsPersistenceController): void {
  expect(
    current.dispatch({
      type: 'MUTATE',
      dataEpoch: DATA_EPOCH,
      mutationId: uuid(30),
      permissionCheckId: uuid(31),
      activationId: uuid(32),
      storageReservationId: uuid(33),
      activationResult: consumedActivation(uuid(30), uuid(31), uuid(32), uuid(33)),
      key: 'enabledConnectors',
      candidate: ['free-work', 'malt'],
    })
  ).toEqual({ status: 'dispatched' });
  advancePersist(current, uuid(34));
  const reserve = commandOfType(current, 'RESERVE_SETTINGS_STORAGE');
  expect(
    current.dispatch({
      type: 'STORAGE_RESERVATION_GRANTED',
      dataEpoch: DATA_EPOCH,
      mutationId: reserve.mutationId,
      commandId: reserve.commandId,
      proof: reservationProof(reserve),
    })
  ).toEqual({ status: 'dispatched' });
  expect(commandOfType(current, 'PERSIST_SETTINGS_PENDING_INTENT').intentRevision).toBe(2);
  advancePersist(current, uuid(35));
}

function containsProof(
  command: Extract<PublicCommand, { type: 'VERIFY_SETTINGS_HOST_PERMISSIONS' }>
): SettingsHostPermissionContainsProofV1 {
  return {
    version: 1,
    dataEpoch: command.dataEpoch,
    mutationId: command.mutationId,
    permissionCheckId: command.permissionCheckId,
    activationId: command.activationId,
    activationResultId: command.activationResultId,
    originDigest: command.originDigest,
    verifiedOrigins: [...command.origins],
    containsVerified: true,
  };
}

describe('settings mandatory host permission model', () => {
  it('consumes a verified activation even for a no-op and rejects replay with fresh mutation IDs', () => {
    const current = controller();
    const first = {
      mutationId: uuid(100),
      permissionCheckId: uuid(101),
      activationId: uuid(102),
      storageReservationId: uuid(103),
    };
    expect(
      current.dispatch({
        type: 'MUTATE',
        dataEpoch: DATA_EPOCH,
        ...first,
        activationResult: consumedActivation(
          first.mutationId,
          first.permissionCheckId,
          first.activationId,
          first.storageReservationId,
          uuid(104)
        ),
        key: 'theme',
        candidate: 'system',
      })
    ).toEqual({ status: 'dispatched' });
    expect(current.getSnapshot()).toMatchObject({ state: 'saved', command: null });

    const replay = {
      ...first,
      mutationId: uuid(105),
      permissionCheckId: uuid(106),
      storageReservationId: uuid(107),
    };
    expect(
      current.dispatch({
        type: 'MUTATE',
        dataEpoch: DATA_EPOCH,
        ...replay,
        activationResult: consumedActivation(
          replay.mutationId,
          replay.permissionCheckId,
          replay.activationId,
          replay.storageReservationId,
          uuid(108)
        ),
        key: 'theme',
        candidate: 'dark',
      })
    ).toEqual({ status: 'dispatched' });
    expect(current.getSnapshot()).toMatchObject({
      state: 'saved',
      command: null,
      lastRejection: { code: 'SETTINGS_ACTIVATION_REJECTED', operation: 'activation' },
    });
  });

  it.each(['expired', 'replayed', 'crossed'] as const)(
    'settles an explicitly %s activation result without reservation or write',
    (reason) => {
      const current = controller();
      const ids = {
        mutationId: uuid(110),
        permissionCheckId: uuid(111),
        activationId: uuid(112),
        storageReservationId: uuid(113),
      };
      expect(
        current.dispatch({
          type: 'MUTATE',
          dataEpoch: DATA_EPOCH,
          ...ids,
          activationResult: rejectedActivation(
            ids.mutationId,
            ids.permissionCheckId,
            ids.activationId,
            ids.storageReservationId,
            reason,
            uuid(114)
          ),
          key: 'enabledConnectors',
          candidate: ['free-work', 'malt'],
        })
      ).toEqual({ status: 'dispatched' });
      expect(current.getSnapshot()).toMatchObject({
        state: 'saved',
        command: null,
        lastRejection: { code: 'SETTINGS_ACTIVATION_REJECTED', operation: 'activation' },
      });
    }
  );

  it('consumes activation before rejecting an excluded connector candidate', () => {
    const current = controller();
    const ids = {
      mutationId: uuid(120),
      permissionCheckId: uuid(121),
      activationId: uuid(122),
      storageReservationId: uuid(123),
    };
    expect(
      current.dispatch({
        type: 'MUTATE',
        dataEpoch: DATA_EPOCH,
        ...ids,
        activationResult: consumedActivation(
          ids.mutationId,
          ids.permissionCheckId,
          ids.activationId,
          ids.storageReservationId,
          uuid(124)
        ),
        key: 'enabledConnectors',
        candidate: ['free-work', 'excluded'],
      })
    ).toEqual({ status: 'dispatched' });
    expect(current.getSnapshot()).toMatchObject({ state: 'saved', command: null });
    expect(current.getSnapshot().lastRejection?.code).toBe('SETTINGS_INVALID');
  });

  it('rejects hostile activation descriptors, symbols, prototypes and worker crossings', () => {
    const current = controller();
    const ids = {
      mutationId: uuid(130),
      permissionCheckId: uuid(131),
      activationId: uuid(132),
      storageReservationId: uuid(133),
    };
    const activationResult = consumedActivation(
      ids.mutationId,
      ids.permissionCheckId,
      ids.activationId,
      ids.storageReservationId,
      uuid(134)
    );
    const base = {
      type: 'MUTATE' as const,
      dataEpoch: DATA_EPOCH,
      ...ids,
      activationResult,
      key: 'theme' as const,
      candidate: 'dark',
    };

    const accessor = { ...base } as Record<string, unknown>;
    Object.defineProperty(accessor, 'activationResult', {
      enumerable: true,
      get() {
        throw new Error('must not execute');
      },
    });
    expect(current.dispatch(accessor)).toEqual({ status: 'rejected', reason: 'invalid_event' });

    const symbolResult = { ...activationResult } as SettingsActivationRegistryResultV1 & {
      [key: symbol]: unknown;
    };
    symbolResult[Symbol('hidden')] = true;
    expect(current.dispatch({ ...base, activationResult: symbolResult })).toEqual({
      status: 'rejected',
      reason: 'invalid_event',
    });

    const inheritedResult = Object.assign(Object.create({ inherited: true }), activationResult);
    expect(current.dispatch({ ...base, activationResult: inheritedResult })).toEqual({
      status: 'rejected',
      reason: 'invalid_event',
    });
    expect(
      current.dispatch({
        ...base,
        activationResult: { ...activationResult, workerEpoch: uuid(998) },
      })
    ).toEqual({ status: 'rejected', reason: 'invalid_event' });

    expect(current.dispatch(base)).toEqual({ status: 'dispatched' });
    expect(
      commandOfType(current, 'PERSIST_SETTINGS_PENDING_INTENT').pendingIntent.mutation
    ).toMatchObject({ activationId: ids.activationId, activationResultId: uuid(134) });
  });

  it('contains no interactive permission request protocol in Settings sources', () => {
    const sourceFiles = [
      'src/models/settings-persistence.contract.ts',
      'src/models/settings-persistence.logic.ts',
      'src/models/settings-persistence.machine.ts',
    ];
    const source = sourceFiles
      .map((path) => readFileSync(resolve(process.cwd(), path), 'utf8'))
      .join('\n');
    expect(source).not.toContain('permissionRequestId');
    expect(source).not.toContain('REQUEST_SETTINGS_PERMISSION');
    expect(source).not.toContain('PERMISSION_GRANTED');
    expect(source).not.toContain('PERMISSION_REFUSED');
    expect(source).not.toContain('PERMISSION_OUTCOME_UNKNOWN');
    expect(source).not.toContain('permissions.request');
  });

  it('persists the reservation rotation before issuing the contains-only command', () => {
    const current = controller();
    beginConnectorMutation(current);
    expect(current.getSnapshot().state).toBe('permissionCheck');
    expect(commandOfType(current, 'VERIFY_SETTINGS_HOST_PERMISSIONS')).toMatchObject({
      permissionCheckId: uuid(31),
      activationId: uuid(32),
      origins: ['https://www.malt.fr/*'],
      originDigest: originDigest(['https://www.malt.fr/*']),
    });
  });

  it('accepts only an exact contains proof, then repersists before candidate write', () => {
    const current = controller();
    beginConnectorMutation(current);
    const verify = commandOfType(current, 'VERIFY_SETTINGS_HOST_PERMISSIONS');
    const proof = containsProof(verify);
    expect(
      parseSettingsHostPermissionContainsProofV1(proof, {
        dataEpoch: verify.dataEpoch,
        mutationId: verify.mutationId,
        permissionCheckId: verify.permissionCheckId,
        activationId: verify.activationId,
        activationResultId: verify.activationResultId,
        origins: verify.origins,
      })
    ).toEqual(proof);
    expect(
      parseSettingsHostPermissionContainsProofV1(
        {
          ...proof,
          verifiedOrigins: ['https://www.free-work.com/*'],
        },
        {
          dataEpoch: verify.dataEpoch,
          mutationId: verify.mutationId,
          permissionCheckId: verify.permissionCheckId,
          activationId: verify.activationId,
          activationResultId: verify.activationResultId,
          origins: verify.origins,
        }
      )
    ).toBeNull();
    expect(
      current.dispatch({
        type: 'HOST_PERMISSIONS_VERIFIED',
        dataEpoch: DATA_EPOCH,
        mutationId: verify.mutationId,
        commandId: verify.commandId,
        proof: { ...proof, activationId: uuid(36) },
      })
    ).toEqual({ status: 'rejected', reason: 'invalid_event' });
    expect(commandOfType(current, 'VERIFY_SETTINGS_HOST_PERMISSIONS').commandId).toBe(
      verify.commandId
    );

    const proofWithSymbol = { ...proof } as SettingsHostPermissionContainsProofV1 & {
      [key: symbol]: unknown;
    };
    proofWithSymbol[Symbol('hidden')] = true;
    expect(
      current.dispatch({
        type: 'HOST_PERMISSIONS_VERIFIED',
        dataEpoch: DATA_EPOCH,
        mutationId: verify.mutationId,
        commandId: verify.commandId,
        proof: proofWithSymbol,
      })
    ).toEqual({ status: 'rejected', reason: 'invalid_event' });

    const sparseOrigins = new Array<string>(1);
    expect(
      current.dispatch({
        type: 'HOST_PERMISSIONS_VERIFIED',
        dataEpoch: DATA_EPOCH,
        mutationId: verify.mutationId,
        commandId: verify.commandId,
        proof: { ...proof, verifiedOrigins: sparseOrigins },
      })
    ).toEqual({ status: 'rejected', reason: 'invalid_event' });

    const accessorProof = { ...proof } as Record<string, unknown>;
    Object.defineProperty(accessorProof, 'containsVerified', {
      enumerable: true,
      get() {
        throw new Error('must not execute');
      },
    });
    expect(
      current.dispatch({
        type: 'HOST_PERMISSIONS_VERIFIED',
        dataEpoch: DATA_EPOCH,
        mutationId: verify.mutationId,
        commandId: verify.commandId,
        proof: accessorProof,
      })
    ).toEqual({ status: 'rejected', reason: 'invalid_event' });
    expect(commandOfType(current, 'VERIFY_SETTINGS_HOST_PERMISSIONS')).toEqual(verify);

    expect(
      current.dispatch({
        type: 'HOST_PERMISSIONS_VERIFIED',
        dataEpoch: DATA_EPOCH,
        mutationId: verify.mutationId,
        commandId: verify.commandId,
        proof,
      })
    ).toEqual({ status: 'dispatched' });
    const persist = commandOfType(current, 'PERSIST_SETTINGS_PENDING_INTENT');
    expect(persist.intentRevision).toBe(3);
    expect(persist.pendingIntent.mutation.permissionProof).toEqual(proof);
    advancePersist(current, uuid(37));
    expect(commandOfType(current, 'COMPARE_AND_SETTLE_SETTINGS').permissionProof).toEqual(proof);
  });

  it('maps contains false to missing/not_committed and never emits a candidate write', () => {
    const current = controller();
    beginConnectorMutation(current);
    const verify = commandOfType(current, 'VERIFY_SETTINGS_HOST_PERMISSIONS');
    const outcome: SettingsMutationOutcomeV1 = {
      version: 1,
      dataEpoch: DATA_EPOCH,
      mutationId: verify.mutationId,
      commandDigest: verify.commandDigest,
      previousDigest: verify.previousDigest,
      candidateDigest: verify.candidateDigest,
      baseRevision: verify.baseRevision,
      baseGeneration: verify.baseGeneration,
      settledRevision: verify.baseRevision,
      settledGeneration: verify.baseGeneration + 1,
      correlationIds: [...verify.correlationIds],
      outcome: 'not_committed',
    };
    const missingSnapshot = snapshot(
      envelope(DEFAULT_SETTINGS, verify.baseRevision, verify.baseGeneration + 1, [outcome]),
      verify.permissionCheckId,
      verify.commandId,
      uuid(40)
    );
    expect(
      current.dispatch({
        type: 'HOST_PERMISSIONS_MISSING',
        dataEpoch: DATA_EPOCH,
        mutationId: verify.mutationId,
        commandId: verify.commandId,
        snapshot: missingSnapshot,
        error: makeError(
          contractFor('SETTINGS_HOST_PERMISSION_MISSING'),
          'Mandatory host permission is missing.'
        ),
      })
    ).toEqual({ status: 'dispatched' });
    expect(current.getSnapshot()).toMatchObject({
      state: 'clearingIntent',
      terminalSettlement: null,
      error: { code: 'SETTINGS_HOST_PERMISSION_MISSING', operation: 'permission_check' },
    });
    expect(current.getSnapshot().command?.type).toBe('CLEAR_SETTINGS_PENDING_INTENT');
    expect(current.getSnapshot().command?.type).not.toBe('COMPARE_AND_SETTLE_SETTINGS');
  });

  it('routes an ambiguous contains outcome through a repersisted reconciliation identity', () => {
    const current = controller();
    beginConnectorMutation(current);
    const verify = commandOfType(current, 'VERIFY_SETTINGS_HOST_PERMISSIONS');
    expect(
      current.dispatch({
        type: 'HOST_PERMISSIONS_OUTCOME_UNKNOWN',
        dataEpoch: DATA_EPOCH,
        mutationId: verify.mutationId,
        commandId: verify.commandId,
        nextRequestId: uuid(45),
        error: makeError(contractFor('SETTINGS_STORAGE_FAILED'), 'Contains outcome is unknown.'),
      })
    ).toEqual({ status: 'dispatched' });
    const persist = commandOfType(current, 'PERSIST_SETTINGS_PENDING_INTENT');
    expect(persist.pendingIntent).toMatchObject({
      intentRevision: 3,
      phase: 'reconciling',
      nextCommandType: 'RECONCILE_SETTINGS',
      requestId: uuid(45),
    });
    expect(current.getSnapshot().command?.type).not.toBe('COMPARE_AND_SETTLE_SETTINGS');
  });

  it('linearizes cancel before late contains results and settles only the cancelled outcome', () => {
    const current = controller();
    beginConnectorMutation(current);
    const verify = commandOfType(current, 'VERIFY_SETTINGS_HOST_PERMISSIONS');
    const lateProof = containsProof(verify);
    const cancelRequestId = uuid(160);

    expect(
      current.dispatch({
        type: 'CANCEL',
        dataEpoch: DATA_EPOCH,
        mutationId: verify.mutationId,
        requestId: cancelRequestId,
      })
    ).toEqual({ status: 'dispatched' });
    const cancelPersist = commandOfType(current, 'PERSIST_SETTINGS_PENDING_INTENT');
    expect(cancelPersist.pendingIntent.nextCommandType).toBe('ABORT_SETTINGS_MUTATION');

    expect(
      current.dispatch({
        type: 'HOST_PERMISSIONS_VERIFIED',
        dataEpoch: DATA_EPOCH,
        mutationId: verify.mutationId,
        commandId: verify.commandId,
        proof: lateProof,
      })
    ).toEqual({ status: 'rejected', reason: 'invalid_event' });
    expect(commandOfType(current, 'PERSIST_SETTINGS_PENDING_INTENT')).toEqual(cancelPersist);

    advancePersist(current, uuid(161));
    const abort = commandOfType(current, 'ABORT_SETTINGS_MUTATION');
    expect(
      current.dispatch({
        type: 'HOST_PERMISSIONS_VERIFIED',
        dataEpoch: DATA_EPOCH,
        mutationId: verify.mutationId,
        commandId: verify.commandId,
        proof: lateProof,
      })
    ).toEqual({ status: 'rejected', reason: 'invalid_event' });
    expect(commandOfType(current, 'ABORT_SETTINGS_MUTATION')).toEqual(abort);

    const cancelledOutcome: SettingsMutationOutcomeV1 = {
      version: 1,
      dataEpoch: DATA_EPOCH,
      mutationId: abort.mutationId,
      commandDigest: abort.commandDigest,
      previousDigest: abort.previousDigest,
      candidateDigest: abort.candidateDigest,
      baseRevision: abort.baseRevision,
      baseGeneration: abort.baseGeneration,
      settledRevision: abort.baseRevision,
      settledGeneration: abort.baseGeneration + 1,
      correlationIds: [...abort.correlationIds],
      outcome: 'cancelled',
    };
    expect(
      current.dispatch({
        type: 'CANCEL_CONFIRMED',
        dataEpoch: DATA_EPOCH,
        mutationId: abort.mutationId,
        requestId: cancelRequestId,
        commandId: abort.commandId,
        snapshot: snapshot(
          envelope(DEFAULT_SETTINGS, abort.baseRevision, abort.baseGeneration + 1, [
            cancelledOutcome,
          ]),
          cancelRequestId,
          abort.commandId,
          uuid(162)
        ),
      })
    ).toEqual({ status: 'dispatched' });
    advanceClear(current, uuid(163));
    expect(current.getSnapshot()).toMatchObject({ state: 'saved', command: null, error: null });
  });

  it('consumes rejected retry activations once and admits only a fresh verified retry batch', () => {
    const current = controller();
    const reserve = beginThemeReservation(current, 200);
    expect(
      current.dispatch({
        type: 'STORAGE_RESERVATION_DENIED',
        dataEpoch: DATA_EPOCH,
        mutationId: reserve.mutationId,
        commandId: reserve.commandId,
        denial: reservationDenial(reserve, uuid(206), uuid(207)),
        error: makeError(
          contractFor('SETTINGS_GLOBAL_STORAGE_QUOTA_EXHAUSTED'),
          'Global quota exhausted.'
        ),
      })
    ).toEqual({ status: 'dispatched' });
    advanceClear(current, uuid(208));
    expect(current.getSnapshot()).toMatchObject({
      state: 'failed',
      error: { code: 'SETTINGS_GLOBAL_STORAGE_QUOTA_EXHAUSTED' },
    });

    const rejectedIds = {
      mutationId: uuid(210),
      permissionCheckId: uuid(211),
      activationId: uuid(212),
      storageReservationId: uuid(213),
    };
    expect(
      current.dispatch({
        type: 'RETRY',
        dataEpoch: DATA_EPOCH,
        failedMutationId: reserve.mutationId,
        ...rejectedIds,
        activationResult: rejectedActivation(
          rejectedIds.mutationId,
          rejectedIds.permissionCheckId,
          rejectedIds.activationId,
          rejectedIds.storageReservationId,
          'expired',
          uuid(214)
        ),
        requestId: uuid(215),
      })
    ).toEqual({ status: 'dispatched' });
    expect(current.getSnapshot()).toMatchObject({
      state: 'failed',
      command: null,
      lastRejection: { code: 'SETTINGS_ACTIVATION_REJECTED' },
    });

    const replayIds = {
      mutationId: uuid(220),
      permissionCheckId: uuid(221),
      activationId: rejectedIds.activationId,
      storageReservationId: uuid(223),
    };
    expect(
      current.dispatch({
        type: 'RETRY',
        dataEpoch: DATA_EPOCH,
        failedMutationId: reserve.mutationId,
        ...replayIds,
        activationResult: consumedActivation(
          replayIds.mutationId,
          replayIds.permissionCheckId,
          replayIds.activationId,
          replayIds.storageReservationId,
          uuid(224)
        ),
        requestId: uuid(225),
      })
    ).toEqual({ status: 'dispatched' });
    expect(current.getSnapshot()).toMatchObject({ state: 'failed', command: null });

    const freshIds = {
      mutationId: uuid(230),
      permissionCheckId: uuid(231),
      activationId: uuid(232),
      storageReservationId: uuid(233),
    };
    expect(
      current.dispatch({
        type: 'RETRY',
        dataEpoch: DATA_EPOCH,
        failedMutationId: reserve.mutationId,
        ...freshIds,
        activationResult: consumedActivation(
          freshIds.mutationId,
          freshIds.permissionCheckId,
          freshIds.activationId,
          freshIds.storageReservationId,
          uuid(234)
        ),
        requestId: uuid(235),
      })
    ).toEqual({ status: 'dispatched' });
    expect(
      commandOfType(current, 'PERSIST_SETTINGS_PENDING_INTENT').pendingIntent.retryIntent
    ).toMatchObject({
      activationId: freshIds.activationId,
      activationResultId: uuid(234),
      requestId: uuid(235),
    });
  });
});
