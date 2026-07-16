import { describe, expect, it, vi } from 'vitest';

import type { AppSettings } from '../../../src/lib/core/types/app-settings';
import {
  SETTINGS_GLOBAL_SYSTEM_RESERVE_BYTES,
  SETTINGS_STORAGE_KEY,
  commandId,
  originDigest,
  projectSettingsMutationBytes,
  settingsCommandDigest,
  settingsDigest,
  type SettingMutation,
  type SettingsEnvelopeV2,
  type SettingsPersistenceCommand,
} from '../../../src/models/settings-persistence.contract';
import type {
  SettingsAtomicCommitGatePort,
  SettingsDatasetGateCapabilityV1,
} from '../../../src/lib/shell/settings/settings-dataset-gate';
import type { SettingsResetJournalPort } from '../../../src/lib/shell/settings/settings-transaction.repository';
import {
  createSettingsGlobalStorageReservationAuthority,
  SettingsGlobalStorageReservationAuthorityError,
  type SettingsLocalStorageQuotaPort,
  type SettingsLocalWriterFencePort,
} from '../../../src/lib/shell/settings/settings-storage-reservation-authority';

const uuid = (suffix: number): string =>
  `95000000-0000-4000-8000-${String(suffix).padStart(12, '0')}`;
const DATA_EPOCH = uuid(1);

const PREVIOUS: AppSettings = {
  scanIntervalMinutes: 30,
  enabledConnectors: [],
  notifications: true,
  autoScan: true,
  maxSemanticPerScan: 10,
  notificationScoreThreshold: 70,
  respectRateLimits: true,
  customDelayMs: 0,
  theme: 'system',
};
const CANDIDATE: AppSettings = { ...PREVIOUS, theme: 'dark' };

function envelope(): SettingsEnvelopeV2 {
  return {
    version: 2,
    dataEpoch: DATA_EPOCH,
    revision: 0,
    generation: 0,
    settings: PREVIOUS,
    journal: null,
    outcomes: [],
  };
}

function mutation(): SettingMutation {
  const ids = [uuid(10), uuid(11), uuid(12), uuid(13), uuid(14)].sort();
  const [mutationId, permissionCheckId, activationId, activationResultId, storageReservationId] =
    ids as [string, string, string, string, string];
  const previousDigest = settingsDigest(PREVIOUS);
  const candidateDigest = settingsDigest(CANDIDATE);
  return {
    key: 'theme',
    previousSettings: PREVIOUS,
    candidateSettings: CANDIDATE,
    previous: 'system',
    candidate: 'dark',
    previousDigest,
    candidateDigest,
    commandDigest: settingsCommandDigest({
      dataEpoch: DATA_EPOCH,
      mutationId,
      baseRevision: 0,
      baseGeneration: 0,
      previousDigest,
      candidateDigest,
      originDigest: originDigest([]),
      baseCorrelationIds: ids,
    }),
    correlationIds: ids,
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

function reserveCommand(): Extract<
  SettingsPersistenceCommand,
  { type: 'RESERVE_SETTINGS_STORAGE' }
> {
  const current = mutation();
  const byteProjection = projectSettingsMutationBytes(envelope(), current);
  if (byteProjection === null) {
    throw new Error('projection failed');
  }
  return {
    type: 'RESERVE_SETTINGS_STORAGE',
    commandId: commandId('reserve', current.storageReservationId),
    dataEpoch: DATA_EPOCH,
    mutationId: current.mutationId,
    commandDigest: current.commandDigest,
    baseRevision: current.baseRevision,
    baseGeneration: current.baseGeneration,
    previousDigest: current.previousDigest,
    candidateDigest: current.candidateDigest,
    correlationIds: current.correlationIds,
    reservationId: current.storageReservationId,
    byteProjection,
  };
}

const capability = (
  operationId: string,
  purpose: 'reservation' | 'candidate_write' = 'reservation'
): SettingsDatasetGateCapabilityV1 => ({
  version: 1,
  kind: 'DATASET_EPOCH_SETTINGS_LEASE',
  dataEpoch: DATA_EPOCH,
  operationId,
  purpose,
  leaseId: uuid(900),
  authorityRevision: 0,
});

function dependencies(
  options: {
    bytesInUse?: number;
    settingsBytes?: number;
    writerFence?: boolean;
    quotaBytes?: number;
  } = {}
) {
  const command = reserveCommand();
  const scopes: unknown[] = [];
  const gate: SettingsAtomicCommitGatePort = {
    async runExclusive(scope, effect) {
      scopes.push(structuredClone(scope));
      return effect(capability(scope.operationId, scope.purpose as 'reservation'));
    },
  };
  const resetJournal: SettingsResetJournalPort = {
    async admit(input) {
      return {
        kind: 'absent',
        dataEpoch: input.dataEpoch,
        capability: input.capability,
        resetJournalAbsent: true,
      };
    },
  };
  const quota: SettingsLocalStorageQuotaPort = {
    getBytesInUse: vi.fn(async (keys) =>
      keys === null
        ? (options.bytesInUse ?? 1_000)
        : (options.settingsBytes ?? command.byteProjection.currentSettingsEntryBytes)
    ),
  };
  const writerFence: SettingsLocalWriterFencePort = {
    prove: vi.fn(async (currentCapability) =>
      options.writerFence === false
        ? null
        : {
            version: 1,
            kind: 'CHROME_LOCAL_WRITERS_FENCED',
            dataEpoch: currentCapability.dataEpoch,
            gateLeaseId: currentCapability.leaseId,
            authorityRevision: currentCapability.authorityRevision,
            allLocalWritersFenced: true,
          }
    ),
  };
  const allocateProofId = vi.fn(() => uuid(901));
  return {
    command,
    scopes,
    quota,
    writerFence,
    allocateProofId,
    authority: createSettingsGlobalStorageReservationAuthority({
      gate,
      resetJournal,
      quota,
      writerFence,
      quotaBytes: options.quotaBytes ?? 20_000_000,
      allocateProofId,
    }),
  };
}

describe('global chrome.storage.local Settings reservation authority', () => {
  it('fails closed before measuring or allocating when all local writers are not fenced', async () => {
    const context = dependencies({ writerFence: false });

    await expect(context.authority.acquire(context.command)).rejects.toMatchObject({
      code: 'global_writer_cutover_incomplete',
    });
    expect(context.scopes).toEqual([
      {
        dataEpoch: DATA_EPOCH,
        operationId: context.command.reservationId,
        purpose: 'reservation',
      },
    ]);
    expect(context.quota.getBytesInUse).not.toHaveBeenCalled();
    expect(context.allocateProofId).not.toHaveBeenCalled();
  });

  it('acquires, capability-revalidates and idempotently releases one exact reservation', async () => {
    const context = dependencies();
    const result = await context.authority.acquire(context.command);

    expect(result.kind).toBe('granted');
    if (result.kind !== 'granted') {
      return;
    }
    expect(result.proof).toMatchObject({
      kind: 'CHROME_LOCAL_SETTINGS_RESERVATION',
      dataEpoch: DATA_EPOCH,
      reservationId: context.command.reservationId,
      gateLeaseId: uuid(900),
      proofId: uuid(901),
      allLocalWritersFenced: true,
      reservationActive: true,
    });
    expect(result.proof.availableAfterReservationBytes).toBe(
      result.proof.quotaBytes - result.proof.bytesInUse - result.proof.requiredAdditionalBytes
    );
    await expect(
      context.authority.isActive(
        result.proof,
        capability(context.command.mutationId, 'candidate_write')
      )
    ).resolves.toBe(true);
    await expect(context.authority.release(result.proof)).resolves.toBe(true);
    await expect(context.authority.release(result.proof)).resolves.toBe(false);
  });

  it('returns the exact modeled denial only for insufficient global headroom', async () => {
    const probe = reserveCommand();
    const bytesInUse = 10_000;
    const quotaBytes =
      bytesInUse +
      probe.byteProjection.requiredAdditionalBytes +
      SETTINGS_GLOBAL_SYSTEM_RESERVE_BYTES -
      1;
    const context = dependencies({ bytesInUse, quotaBytes });

    const result = await context.authority.acquire(context.command);

    expect(result).toMatchObject({
      kind: 'denied',
      denial: {
        kind: 'CHROME_LOCAL_SETTINGS_RESERVATION_DENIED',
        reason: 'INSUFFICIENT_GLOBAL_HEADROOM',
        bytesInUse,
        quotaBytes,
        allLocalWritersFenced: true,
        resetJournalAbsent: true,
      },
    });
  });

  it('rejects hostile/crossed descriptors and preserves active capacity against oversized writes', async () => {
    const context = dependencies();
    const getter = vi.fn(() => DATA_EPOCH);
    const hostile = Object.defineProperty({ ...context.command }, 'dataEpoch', {
      enumerable: true,
      get: getter,
    });
    await expect(context.authority.acquire(hostile)).rejects.toMatchObject({
      code: 'invalid_command',
    });
    expect(getter).not.toHaveBeenCalled();

    const result = await context.authority.acquire(context.command);
    if (result.kind !== 'granted') {
      throw new Error('expected grant');
    }
    const current = envelope();
    await expect(
      context.authority.assertWriteAllowed({
        capability: capability(context.command.mutationId, 'candidate_write'),
        authority: {
          kind: 'reservation',
          capability: capability(context.command.mutationId, 'candidate_write'),
          reservationProof: result.proof,
        },
        currentEnvelope: current,
        nextEnvelope: current,
        currentSettingsEntryBytes: context.command.byteProjection.currentSettingsEntryBytes,
        nextSettingsEntryBytes: result.proof.reservedSettingsEntryBytes + 1,
      })
    ).resolves.toBe(false);
    expect(SettingsGlobalStorageReservationAuthorityError).toBeTypeOf('function');
    expect(SETTINGS_STORAGE_KEY).toBe('settings');
  });
});
