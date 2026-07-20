import {
  LOCAL_DATA_RESET_RECEIPT_RESERVE_BYTES,
  SETTINGS_GLOBAL_SYSTEM_RESERVE_BYTES,
  SETTINGS_STORAGE_KEY,
  isUuidV4,
  parseSettingsCommandDigest,
  readStrictJsonArray,
  readStrictJsonRecord,
  type SettingsGlobalStorageReservationDenialV1,
  type SettingsGlobalStorageReservationProofV1,
  type SettingsMutationByteProjectionV1,
  type SettingsPersistenceCommand,
} from '../../../models/settings-persistence.contract';
import type {
  SettingsAtomicCommitGatePort,
  SettingsDatasetGateCapabilityV1,
} from './settings-dataset-gate';
import type {
  SettingsReservationAuthorityPort,
  SettingsResetJournalPort,
  SettingsStorageCapacityCheckV1,
  SettingsStorageCapacityPort,
} from './settings-transaction.repository';

type ReserveCommand = Extract<SettingsPersistenceCommand, { type: 'RESERVE_SETTINGS_STORAGE' }>;

export interface SettingsLocalStorageQuotaPort {
  getBytesInUse(keys: null | typeof SETTINGS_STORAGE_KEY): Promise<number>;
}

export interface SettingsLocalWriterFenceProofV1 {
  version: 1;
  kind: 'CHROME_LOCAL_WRITERS_FENCED';
  dataEpoch: string;
  gateLeaseId: string;
  authorityRevision: number;
  allLocalWritersFenced: true;
}

export interface SettingsLocalWriterFencePort {
  prove(
    capability: SettingsDatasetGateCapabilityV1
  ): Promise<SettingsLocalWriterFenceProofV1 | null>;
}

export type SettingsGlobalStorageReservationAcquireResult =
  | { kind: 'granted'; proof: SettingsGlobalStorageReservationProofV1 }
  | { kind: 'denied'; denial: SettingsGlobalStorageReservationDenialV1 };

export interface SettingsGlobalStorageReservationAuthority
  extends SettingsReservationAuthorityPort, SettingsStorageCapacityPort {
  acquire(command: unknown): Promise<SettingsGlobalStorageReservationAcquireResult>;
  release(proof: SettingsGlobalStorageReservationProofV1): Promise<boolean>;
}

export interface SettingsGlobalStorageReservationAuthorityDependencies {
  gate: SettingsAtomicCommitGatePort;
  resetJournal: SettingsResetJournalPort;
  quota: SettingsLocalStorageQuotaPort;
  writerFence: SettingsLocalWriterFencePort;
  quotaBytes: number;
  allocateProofId: () => string;
}

export type SettingsGlobalStorageReservationAuthorityErrorCode =
  | 'invalid_configuration'
  | 'invalid_command'
  | 'invalid_capacity_read'
  | 'invalid_proof_identity'
  | 'authority_closed'
  | 'global_writer_cutover_incomplete'
  | 'reservation_busy';

export class SettingsGlobalStorageReservationAuthorityError extends Error {
  constructor(
    readonly code: SettingsGlobalStorageReservationAuthorityErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'SettingsGlobalStorageReservationAuthorityError';
  }
}

const RESERVE_COMMAND_KEYS = [
  'type',
  'commandId',
  'dataEpoch',
  'mutationId',
  'commandDigest',
  'baseRevision',
  'baseGeneration',
  'previousDigest',
  'candidateDigest',
  'correlationIds',
  'reservationId',
  'byteProjection',
] as const;

const PROJECTION_KEYS = [
  'version',
  'settingsKey',
  'currentEnvelopeValueBytes',
  'currentSettingsEntryBytes',
  'maxJournalEnvelopeValueBytes',
  'maxJournalSettingsEntryBytes',
  'maxSettledEnvelopeValueBytes',
  'maxSettledSettingsEntryBytes',
  'reservedSettingsEntryBytes',
  'requiredAdditionalBytes',
  'systemReserveBytes',
  'resetReceiptReserveBytes',
] as const;

const PROOF_KEYS = [
  'version',
  'kind',
  'storageArea',
  'settingsKey',
  'dataEpoch',
  'mutationId',
  'commandDigest',
  'baseRevision',
  'baseGeneration',
  'reservationId',
  'gateLeaseId',
  'proofId',
  'quotaBytes',
  'bytesInUse',
  'currentSettingsEntryBytes',
  'reservedSettingsEntryBytes',
  'requiredAdditionalBytes',
  'systemReserveBytes',
  'resetReceiptReserveBytes',
  'availableAfterReservationBytes',
  'reservationActive',
  'allLocalWritersFenced',
  'resetJournalAbsent',
] as const;

const CAPABILITY_KEYS = [
  'version',
  'kind',
  'dataEpoch',
  'operationId',
  'purpose',
  'leaseId',
  'authorityRevision',
] as const;

const FENCE_KEYS = [
  'version',
  'kind',
  'dataEpoch',
  'gateLeaseId',
  'authorityRevision',
  'allLocalWritersFenced',
] as const;

function safeNonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function parseProjection(value: unknown): SettingsMutationByteProjectionV1 | null {
  const record = readStrictJsonRecord(value, PROJECTION_KEYS);
  if (
    record === null ||
    record.version !== 1 ||
    record.settingsKey !== SETTINGS_STORAGE_KEY ||
    !PROJECTION_KEYS.slice(2).every((key) => safeNonNegativeInteger(record[key])) ||
    record.reservedSettingsEntryBytes !==
      Math.max(
        Number(record.maxJournalSettingsEntryBytes),
        Number(record.maxSettledSettingsEntryBytes)
      ) ||
    record.requiredAdditionalBytes !==
      Math.max(
        0,
        Number(record.reservedSettingsEntryBytes) - Number(record.currentSettingsEntryBytes)
      ) ||
    record.systemReserveBytes !== SETTINGS_GLOBAL_SYSTEM_RESERVE_BYTES ||
    record.resetReceiptReserveBytes !== LOCAL_DATA_RESET_RECEIPT_RESERVE_BYTES
  ) {
    return null;
  }
  return { ...(record as unknown as SettingsMutationByteProjectionV1) };
}

function parseReserveCommand(value: unknown): ReserveCommand | null {
  const record = readStrictJsonRecord(value, RESERVE_COMMAND_KEYS);
  const correlations = record === null ? null : readStrictJsonArray(record.correlationIds);
  const projection = record === null ? null : parseProjection(record.byteProjection);
  const digest = record === null ? null : parseSettingsCommandDigest(record.commandDigest);
  if (
    record === null ||
    correlations === null ||
    projection === null ||
    digest === null ||
    record.type !== 'RESERVE_SETTINGS_STORAGE' ||
    !isUuidV4(record.dataEpoch) ||
    !isUuidV4(record.mutationId) ||
    !isUuidV4(record.reservationId) ||
    record.commandId !== `settings/reserve/${record.reservationId as string}` ||
    !safeNonNegativeInteger(record.baseRevision) ||
    !safeNonNegativeInteger(record.baseGeneration) ||
    !correlations.every(isUuidV4) ||
    new Set(correlations).size !== correlations.length ||
    !(correlations as string[]).every(
      (id, index) => id === [...(correlations as string[])].sort()[index]
    ) ||
    !correlations.includes(record.mutationId) ||
    !correlations.includes(record.reservationId) ||
    digest.dataEpoch !== record.dataEpoch ||
    digest.mutationId !== record.mutationId ||
    digest.baseRevision !== record.baseRevision ||
    digest.baseGeneration !== record.baseGeneration ||
    digest.previousDigest !== record.previousDigest ||
    digest.candidateDigest !== record.candidateDigest ||
    digest.baseCorrelationIds.length !== correlations.length ||
    !digest.baseCorrelationIds.every((id, index) => id === correlations[index])
  ) {
    return null;
  }
  return {
    type: 'RESERVE_SETTINGS_STORAGE',
    commandId: record.commandId as string,
    dataEpoch: record.dataEpoch,
    mutationId: record.mutationId,
    commandDigest: record.commandDigest as string,
    baseRevision: record.baseRevision,
    baseGeneration: record.baseGeneration,
    previousDigest: record.previousDigest as string,
    candidateDigest: record.candidateDigest as string,
    correlationIds: [...(correlations as string[])],
    reservationId: record.reservationId,
    byteProjection: projection,
  };
}

function parseCapability(value: unknown): SettingsDatasetGateCapabilityV1 | null {
  const record = readStrictJsonRecord(value, CAPABILITY_KEYS);
  return record !== null &&
    record.version === 1 &&
    record.kind === 'DATASET_EPOCH_SETTINGS_LEASE' &&
    isUuidV4(record.dataEpoch) &&
    isUuidV4(record.operationId) &&
    isUuidV4(record.leaseId) &&
    typeof record.purpose === 'string' &&
    safeNonNegativeInteger(record.authorityRevision)
    ? (record as unknown as SettingsDatasetGateCapabilityV1)
    : null;
}

function sameCapability(
  left: SettingsDatasetGateCapabilityV1,
  right: SettingsDatasetGateCapabilityV1
): boolean {
  return CAPABILITY_KEYS.every((key) => left[key] === right[key]);
}

function parseWriterFence(
  value: unknown,
  capability: SettingsDatasetGateCapabilityV1
): SettingsLocalWriterFenceProofV1 | null {
  const record = readStrictJsonRecord(value, FENCE_KEYS);
  return record !== null &&
    record.version === 1 &&
    record.kind === 'CHROME_LOCAL_WRITERS_FENCED' &&
    record.dataEpoch === capability.dataEpoch &&
    record.gateLeaseId === capability.leaseId &&
    record.authorityRevision === capability.authorityRevision &&
    record.allLocalWritersFenced === true
    ? {
        version: 1,
        kind: 'CHROME_LOCAL_WRITERS_FENCED',
        dataEpoch: capability.dataEpoch,
        gateLeaseId: capability.leaseId,
        authorityRevision: capability.authorityRevision,
        allLocalWritersFenced: true,
      }
    : null;
}

function proofRecord(value: unknown): Record<string, unknown> | null {
  return readStrictJsonRecord(value, PROOF_KEYS);
}

function sameProof(value: unknown, expected: SettingsGlobalStorageReservationProofV1): boolean {
  const record = proofRecord(value);
  return record !== null && PROOF_KEYS.every((key) => record[key] === expected[key]);
}

function sameReserveCommand(left: ReserveCommand, right: ReserveCommand): boolean {
  return (
    left.commandId === right.commandId &&
    left.dataEpoch === right.dataEpoch &&
    left.mutationId === right.mutationId &&
    left.commandDigest === right.commandDigest &&
    left.baseRevision === right.baseRevision &&
    left.baseGeneration === right.baseGeneration &&
    left.previousDigest === right.previousDigest &&
    left.candidateDigest === right.candidateDigest &&
    left.reservationId === right.reservationId &&
    JSON.stringify(left.correlationIds) === JSON.stringify(right.correlationIds) &&
    JSON.stringify(left.byteProjection) === JSON.stringify(right.byteProjection)
  );
}

export function createSettingsGlobalStorageReservationAuthority(
  dependencies: SettingsGlobalStorageReservationAuthorityDependencies
): SettingsGlobalStorageReservationAuthority {
  if (
    typeof dependencies !== 'object' ||
    dependencies === null ||
    typeof dependencies.gate?.runExclusive !== 'function' ||
    typeof dependencies.resetJournal?.admit !== 'function' ||
    typeof dependencies.quota?.getBytesInUse !== 'function' ||
    typeof dependencies.writerFence?.prove !== 'function' ||
    !safeNonNegativeInteger(dependencies.quotaBytes) ||
    dependencies.quotaBytes < SETTINGS_GLOBAL_SYSTEM_RESERVE_BYTES ||
    typeof dependencies.allocateProofId !== 'function'
  ) {
    throw new SettingsGlobalStorageReservationAuthorityError(
      'invalid_configuration',
      'Settings global storage reservation dependencies are invalid.'
    );
  }
  const quotaBytes = dependencies.quotaBytes;
  let active: {
    command: ReserveCommand;
    proof: SettingsGlobalStorageReservationProofV1;
  } | null = null;

  const writerFenceOpen = async (capability: SettingsDatasetGateCapabilityV1): Promise<boolean> =>
    parseWriterFence(await dependencies.writerFence.prove(capability), capability) !== null;

  const resetBoundaryOpen = async (
    capability: SettingsDatasetGateCapabilityV1
  ): Promise<boolean> => {
    const admission = await dependencies.resetJournal.admit({
      dataEpoch: capability.dataEpoch,
      resetCorrelation: null,
      capability,
    });
    return (
      admission.kind === 'absent' &&
      admission.dataEpoch === capability.dataEpoch &&
      admission.resetJournalAbsent === true &&
      sameCapability(admission.capability, capability)
    );
  };

  const readBytes = async (): Promise<{ total: number; settings: number }> => {
    const [total, settings] = await Promise.all([
      dependencies.quota.getBytesInUse(null),
      dependencies.quota.getBytesInUse(SETTINGS_STORAGE_KEY),
    ]);
    if (
      !safeNonNegativeInteger(total) ||
      !safeNonNegativeInteger(settings) ||
      settings > total ||
      total > quotaBytes
    ) {
      throw new SettingsGlobalStorageReservationAuthorityError(
        'invalid_capacity_read',
        'chrome.storage.local returned invalid byte counts.'
      );
    }
    return { total, settings };
  };

  const allocateProofId = (
    command: ReserveCommand,
    capability: SettingsDatasetGateCapabilityV1
  ) => {
    let proofId: unknown;
    try {
      proofId = dependencies.allocateProofId();
    } catch {
      throw new SettingsGlobalStorageReservationAuthorityError(
        'invalid_proof_identity',
        'Settings reservation proof allocator threw.'
      );
    }
    if (
      !isUuidV4(proofId) ||
      new Set([
        command.dataEpoch,
        command.reservationId,
        capability.leaseId,
        proofId,
        ...command.correlationIds,
      ]).size !==
        command.correlationIds.length + 3
    ) {
      throw new SettingsGlobalStorageReservationAuthorityError(
        'invalid_proof_identity',
        'Settings reservation proof allocator returned a crossed or reused identity.'
      );
    }
    return proofId;
  };

  const isActiveInsideCapability = async (
    rawProof: SettingsGlobalStorageReservationProofV1,
    capability: SettingsDatasetGateCapabilityV1
  ): Promise<boolean> => {
    if (
      active === null ||
      capability.dataEpoch !== active.proof.dataEpoch ||
      !sameProof(rawProof, active.proof) ||
      !(await resetBoundaryOpen(capability)) ||
      !(await writerFenceOpen(capability))
    ) {
      return false;
    }
    let bytes: { total: number; settings: number };
    try {
      bytes = await readBytes();
    } catch {
      return false;
    }
    const additional = Math.max(0, active.proof.reservedSettingsEntryBytes - bytes.settings);
    return bytes.total + additional + SETTINGS_GLOBAL_SYSTEM_RESERVE_BYTES <= quotaBytes;
  };

  return Object.freeze({
    acquire(rawCommand: unknown): Promise<SettingsGlobalStorageReservationAcquireResult> {
      const command = parseReserveCommand(rawCommand);
      if (command === null) {
        return Promise.reject(
          new SettingsGlobalStorageReservationAuthorityError(
            'invalid_command',
            'Settings reservation command is not an exact canonical descriptor.'
          )
        );
      }
      return dependencies.gate.runExclusive(
        {
          dataEpoch: command.dataEpoch,
          operationId: command.reservationId,
          purpose: 'reservation',
        },
        async (capability) => {
          if (!(await resetBoundaryOpen(capability))) {
            throw new SettingsGlobalStorageReservationAuthorityError(
              'authority_closed',
              'Dataset reset admission is closed for Settings reservation.'
            );
          }
          if (!(await writerFenceOpen(capability))) {
            throw new SettingsGlobalStorageReservationAuthorityError(
              'global_writer_cutover_incomplete',
              'Not all chrome.storage.local writers participate in the global authority.'
            );
          }
          if (active !== null) {
            if (
              sameReserveCommand(active.command, command) &&
              active.proof.gateLeaseId === capability.leaseId
            ) {
              return { kind: 'granted' as const, proof: { ...active.proof } };
            }
            throw new SettingsGlobalStorageReservationAuthorityError(
              'reservation_busy',
              'A different Settings storage reservation is already active.'
            );
          }
          const bytes = await readBytes();
          if (bytes.settings !== command.byteProjection.currentSettingsEntryBytes) {
            throw new SettingsGlobalStorageReservationAuthorityError(
              'invalid_capacity_read',
              'Physical Settings entry bytes differ from the modeled projection.'
            );
          }
          const proofId = allocateProofId(command, capability);
          const availableBytes = quotaBytes - bytes.total;
          if (
            availableBytes <
            command.byteProjection.requiredAdditionalBytes + SETTINGS_GLOBAL_SYSTEM_RESERVE_BYTES
          ) {
            return {
              kind: 'denied' as const,
              denial: Object.freeze({
                version: 1 as const,
                kind: 'CHROME_LOCAL_SETTINGS_RESERVATION_DENIED' as const,
                storageArea: 'local' as const,
                settingsKey: SETTINGS_STORAGE_KEY,
                dataEpoch: command.dataEpoch,
                mutationId: command.mutationId,
                commandDigest: command.commandDigest,
                baseRevision: command.baseRevision,
                baseGeneration: command.baseGeneration,
                reservationId: command.reservationId,
                gateLeaseId: capability.leaseId,
                proofId,
                quotaBytes,
                bytesInUse: bytes.total,
                currentSettingsEntryBytes: command.byteProjection.currentSettingsEntryBytes,
                reservedSettingsEntryBytes: command.byteProjection.reservedSettingsEntryBytes,
                requiredAdditionalBytes: command.byteProjection.requiredAdditionalBytes,
                systemReserveBytes: SETTINGS_GLOBAL_SYSTEM_RESERVE_BYTES,
                resetReceiptReserveBytes: LOCAL_DATA_RESET_RECEIPT_RESERVE_BYTES,
                availableBytes,
                reason: 'INSUFFICIENT_GLOBAL_HEADROOM' as const,
                allLocalWritersFenced: true as const,
                resetJournalAbsent: true as const,
              }),
            };
          }
          const proof = Object.freeze({
            version: 1 as const,
            kind: 'CHROME_LOCAL_SETTINGS_RESERVATION' as const,
            storageArea: 'local' as const,
            settingsKey: SETTINGS_STORAGE_KEY,
            dataEpoch: command.dataEpoch,
            mutationId: command.mutationId,
            commandDigest: command.commandDigest,
            baseRevision: command.baseRevision,
            baseGeneration: command.baseGeneration,
            reservationId: command.reservationId,
            gateLeaseId: capability.leaseId,
            proofId,
            quotaBytes,
            bytesInUse: bytes.total,
            currentSettingsEntryBytes: command.byteProjection.currentSettingsEntryBytes,
            reservedSettingsEntryBytes: command.byteProjection.reservedSettingsEntryBytes,
            requiredAdditionalBytes: command.byteProjection.requiredAdditionalBytes,
            systemReserveBytes: SETTINGS_GLOBAL_SYSTEM_RESERVE_BYTES,
            resetReceiptReserveBytes: LOCAL_DATA_RESET_RECEIPT_RESERVE_BYTES,
            availableAfterReservationBytes:
              quotaBytes - bytes.total - command.byteProjection.requiredAdditionalBytes,
            reservationActive: true as const,
            allLocalWritersFenced: true as const,
            resetJournalAbsent: true as const,
          });
          active = { command, proof };
          return { kind: 'granted' as const, proof: { ...proof } };
        }
      );
    },

    async isActive(
      proof: SettingsGlobalStorageReservationProofV1,
      rawCapability: SettingsDatasetGateCapabilityV1
    ): Promise<boolean> {
      const capability = parseCapability(rawCapability);
      return capability === null ? false : isActiveInsideCapability(proof, capability);
    },

    release(proof: SettingsGlobalStorageReservationProofV1): Promise<boolean> {
      const record = proofRecord(proof);
      if (record === null || !isUuidV4(record.dataEpoch) || !isUuidV4(record.reservationId)) {
        return Promise.resolve(false);
      }
      return dependencies.gate.runExclusive(
        {
          dataEpoch: record.dataEpoch,
          operationId: record.reservationId,
          purpose: 'reservation',
        },
        async () => {
          if (active === null || !sameProof(proof, active.proof)) {
            return false;
          }
          active = null;
          return true;
        }
      );
    },

    async assertWriteAllowed(input: SettingsStorageCapacityCheckV1): Promise<boolean> {
      const capability = parseCapability(input.capability);
      if (
        capability === null ||
        !sameCapability(capability, input.authority.capability) ||
        !safeNonNegativeInteger(input.currentSettingsEntryBytes) ||
        !safeNonNegativeInteger(input.nextSettingsEntryBytes) ||
        !(await resetBoundaryOpen(capability)) ||
        !(await writerFenceOpen(capability))
      ) {
        return false;
      }
      if (
        input.authority.kind === 'reservation' &&
        !(await isActiveInsideCapability(input.authority.reservationProof, capability))
      ) {
        return false;
      }
      let bytes: { total: number; settings: number };
      try {
        bytes = await readBytes();
      } catch {
        return false;
      }
      if (bytes.settings !== input.currentSettingsEntryBytes) {
        return false;
      }
      const reservedSettingsEntryBytes = active?.proof.reservedSettingsEntryBytes ?? 0;
      if (
        input.authority.kind === 'reservation' &&
        input.nextSettingsEntryBytes > input.authority.reservationProof.reservedSettingsEntryBytes
      ) {
        return false;
      }
      const protectedSettingsEntryBytes = Math.max(
        input.nextSettingsEntryBytes,
        reservedSettingsEntryBytes
      );
      const projectedTotal =
        bytes.total - input.currentSettingsEntryBytes + protectedSettingsEntryBytes;
      return projectedTotal + SETTINGS_GLOBAL_SYSTEM_RESERVE_BYTES <= quotaBytes;
    },
  });
}
