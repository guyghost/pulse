import type { AppSettings } from '../../core/types/app-settings';
import {
  SETTINGS_STORAGE_KEY,
  cloneSettings,
  cloneSettingsEnvelope,
  captureSettingsShellEventBoundary,
  decodeSettingsStorage,
  isUuidV4,
  parseSettingsEnvelopeV2,
  parseStrictSettings,
  readStrictJsonRecord,
  settingsEnvelopeDigest,
  settingsStorageEntryEncodedBytes,
  type SettingsEnvelopeV2,
  type SettingsPersistenceCommand,
  type SettingsResetCorrelationV1,
} from '../../../models/settings-persistence.contract';
import type {
  SettingsAtomicCommitGatePort,
  SettingsDatasetGateCapabilityV1,
} from './settings-dataset-gate';
import type {
  SettingsLocalStoragePort,
  SettingsResetAdmissionV1,
  SettingsResetJournalPort,
} from './settings-transaction.repository';

type LoadCommand = Extract<SettingsPersistenceCommand, { type: 'RECOVER_AND_LOAD_SETTINGS' }>;

export type SettingsBootstrapResult =
  | { kind: 'ready'; migrated: boolean }
  | { kind: 'invalid' }
  | { kind: 'reset_closed' }
  | { kind: 'capacity_denied' }
  | { kind: 'outcome_unknown' };

export interface SettingsBootstrapCapacityCheckV1 {
  capability: SettingsDatasetGateCapabilityV1;
  sourceFingerprint: string;
  nextEnvelope: SettingsEnvelopeV2;
  nextSettingsEntryBytes: number;
}

/**
 * Extension-global migration capacity authority. A production implementation
 * must account for every chrome.storage.local key and all active reservations;
 * this repository deliberately cannot infer that authority from Settings alone.
 */
export interface SettingsBootstrapCapacityPort {
  assertMigrationWriteAllowed(input: SettingsBootstrapCapacityCheckV1): Promise<boolean>;
}

export interface SettingsBootstrapRepository {
  prepare(command: LoadCommand): Promise<SettingsBootstrapResult>;
}

export interface SettingsBootstrapRepositoryDependencies {
  storage: SettingsLocalStoragePort;
  gate: SettingsAtomicCommitGatePort;
  resetJournal: SettingsResetJournalPort;
  capacity: SettingsBootstrapCapacityPort;
  includedConnectorIds: readonly string[];
  defaultSettings: AppSettings;
  legacyPolicy: 'allow_migration' | 'v2_only';
}

const MAX_FINGERPRINT_DEPTH = 64;
const MAX_FINGERPRINT_NODES = 100_000;

type CapturedJson =
  null | boolean | number | string | CapturedJson[] | { [key: string]: CapturedJson };

interface CapturedStorageSource {
  value: CapturedJson | undefined;
  fingerprint: string;
}

function captureJsonForFingerprint(
  value: unknown,
  state: { nodes: number },
  depth = 0
): CapturedJson | undefined {
  state.nodes += 1;
  if (state.nodes > MAX_FINGERPRINT_NODES || depth > MAX_FINGERPRINT_DEPTH) {
    return undefined;
  }
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value !== 'object') {
    return undefined;
  }
  try {
    const ownKeys = Reflect.ownKeys(value);
    if (ownKeys.some((key) => typeof key !== 'string')) {
      return undefined;
    }
    const prototype = Object.getPrototypeOf(value);
    if (Array.isArray(value)) {
      if (prototype !== Array.prototype) {
        return undefined;
      }
      const lengthDescriptor = Object.getOwnPropertyDescriptor(value, 'length');
      if (
        lengthDescriptor === undefined ||
        !('value' in lengthDescriptor) ||
        !Number.isSafeInteger(lengthDescriptor.value) ||
        Number(lengthDescriptor.value) < 0 ||
        ownKeys.length !== Number(lengthDescriptor.value) + 1 ||
        ownKeys.some(
          (key) =>
            key !== 'length' &&
            (!/^(0|[1-9]\d*)$/.test(key as string) ||
              !Number.isSafeInteger(Number(key)) ||
              Number(key) >= Number(lengthDescriptor.value))
        )
      ) {
        return undefined;
      }
      const captured: CapturedJson[] = [];
      for (let index = 0; index < Number(lengthDescriptor.value); index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (
          descriptor === undefined ||
          !descriptor.enumerable ||
          !('value' in descriptor) ||
          'get' in descriptor ||
          'set' in descriptor
        ) {
          return undefined;
        }
        const child = captureJsonForFingerprint(descriptor.value, state, depth + 1);
        if (child === undefined) {
          return undefined;
        }
        captured.push(child);
      }
      return captured;
    }
    if (prototype !== Object.prototype && prototype !== null) {
      return undefined;
    }
    const keys = [...(ownKeys as string[])].sort();
    const captured: { [key: string]: CapturedJson } = Object.create(null) as {
      [key: string]: CapturedJson;
    };
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (
        descriptor === undefined ||
        !descriptor.enumerable ||
        !('value' in descriptor) ||
        'get' in descriptor ||
        'set' in descriptor
      ) {
        return undefined;
      }
      const child = captureJsonForFingerprint(descriptor.value, state, depth + 1);
      if (child === undefined) {
        return undefined;
      }
      captured[key] = child;
    }
    return captured;
  } catch {
    return undefined;
  }
}

function captureStorageSource(value: unknown | undefined): CapturedStorageSource | null {
  if (value === undefined) {
    return { value: undefined, fingerprint: 'settings-storage/absent' };
  }
  const captured = captureJsonForFingerprint(value, { nodes: 0 });
  return captured === undefined
    ? null
    : {
        value: captured,
        fingerprint: `settings-storage/json:${JSON.stringify(captured)}`,
      };
}

function sameCapability(
  left: SettingsDatasetGateCapabilityV1,
  right: SettingsDatasetGateCapabilityV1
): boolean {
  return (
    left.version === right.version &&
    left.kind === right.kind &&
    left.dataEpoch === right.dataEpoch &&
    left.operationId === right.operationId &&
    left.purpose === right.purpose &&
    left.leaseId === right.leaseId &&
    left.authorityRevision === right.authorityRevision
  );
}

function admissionMatches(
  admission: SettingsResetAdmissionV1,
  command: LoadCommand,
  capability: SettingsDatasetGateCapabilityV1
): boolean {
  if (admission.kind === 'closed' || !sameCapability(admission.capability, capability)) {
    return false;
  }
  if (admission.dataEpoch !== command.dataEpoch || admission.resetJournalAbsent !== true) {
    return false;
  }
  if (command.resetCorrelation === null) {
    return admission.kind === 'absent';
  }
  return (
    admission.kind === 'committed_joined' &&
    admission.resetCorrelation.resetId === command.resetCorrelation.resetId &&
    admission.resetCorrelation.nextDataEpoch === command.resetCorrelation.nextDataEpoch
  );
}

function parseDatasetGateCapability(value: unknown): SettingsDatasetGateCapabilityV1 | null {
  const record = readStrictJsonRecord(value, [
    'version',
    'kind',
    'dataEpoch',
    'operationId',
    'purpose',
    'leaseId',
    'authorityRevision',
  ]);
  return record !== null &&
    record.version === 1 &&
    record.kind === 'DATASET_EPOCH_SETTINGS_LEASE' &&
    isUuidV4(record.dataEpoch) &&
    isUuidV4(record.operationId) &&
    typeof record.purpose === 'string' &&
    isUuidV4(record.leaseId) &&
    Number.isSafeInteger(record.authorityRevision) &&
    Number(record.authorityRevision) >= 0
    ? (record as unknown as SettingsDatasetGateCapabilityV1)
    : null;
}

function parseResetCorrelation(value: unknown): SettingsResetCorrelationV1 | null {
  const record = readStrictJsonRecord(value, ['resetId', 'nextDataEpoch']);
  return record !== null && isUuidV4(record.resetId) && isUuidV4(record.nextDataEpoch)
    ? { resetId: record.resetId, nextDataEpoch: record.nextDataEpoch }
    : null;
}

function parseResetAdmission(value: unknown): SettingsResetAdmissionV1 | null {
  const closed = readStrictJsonRecord(value, ['kind']);
  if (closed !== null && closed.kind === 'closed') {
    return { kind: 'closed' };
  }

  const absent = readStrictJsonRecord(value, [
    'kind',
    'dataEpoch',
    'capability',
    'resetJournalAbsent',
  ]);
  if (absent !== null && absent.kind === 'absent') {
    const capability = parseDatasetGateCapability(absent.capability);
    if (capability === null || !isUuidV4(absent.dataEpoch) || absent.resetJournalAbsent !== true) {
      return null;
    }
    return {
      kind: 'absent',
      dataEpoch: absent.dataEpoch,
      capability,
      resetJournalAbsent: true,
    };
  }

  const joined = readStrictJsonRecord(value, [
    'kind',
    'dataEpoch',
    'resetCorrelation',
    'capability',
    'resetJournalAbsent',
  ]);
  if (joined !== null && joined.kind === 'committed_joined') {
    const capability = parseDatasetGateCapability(joined.capability);
    const resetCorrelation = parseResetCorrelation(joined.resetCorrelation);
    if (
      capability === null ||
      resetCorrelation === null ||
      !isUuidV4(joined.dataEpoch) ||
      joined.resetJournalAbsent !== true
    ) {
      return null;
    }
    return {
      kind: 'committed_joined',
      dataEpoch: joined.dataEpoch,
      resetCorrelation,
      capability,
      resetJournalAbsent: true,
    };
  }
  return null;
}

function validLoadCommand(command: LoadCommand): boolean {
  return (
    command.type === 'RECOVER_AND_LOAD_SETTINGS' &&
    isUuidV4(command.dataEpoch) &&
    isUuidV4(command.requestId) &&
    command.commandId === `settings/load/${command.requestId}` &&
    command.dataEpoch !== command.requestId &&
    (command.resetCorrelation === null ||
      (isUuidV4(command.resetCorrelation.resetId) &&
        isUuidV4(command.resetCorrelation.nextDataEpoch) &&
        command.resetCorrelation.nextDataEpoch === command.dataEpoch &&
        command.resetCorrelation.resetId !== command.dataEpoch &&
        command.resetCorrelation.resetId !== command.requestId))
  );
}

function migrationEnvelope(
  dataEpoch: string,
  revision: number,
  settings: AppSettings
): SettingsEnvelopeV2 {
  return {
    version: 2,
    dataEpoch,
    revision,
    generation: 0,
    settings: cloneSettings(settings),
    journal: null,
    outcomes: [],
  };
}

export function createSettingsBootstrapRepository(
  dependencies: SettingsBootstrapRepositoryDependencies
): SettingsBootstrapRepository {
  if (dependencies.legacyPolicy !== 'allow_migration' && dependencies.legacyPolicy !== 'v2_only') {
    throw new Error('Settings bootstrap requires an explicit legacy migration policy.');
  }
  const includedConnectorIds = [...dependencies.includedConnectorIds];
  const defaults = parseStrictSettings(dependencies.defaultSettings, includedConnectorIds);
  const validCatalogue =
    new Set(includedConnectorIds).size === includedConnectorIds.length &&
    [...includedConnectorIds]
      .sort()
      .every((connectorId, index) => connectorId === includedConnectorIds[index]);

  if (!validCatalogue || defaults === null) {
    throw new Error('Settings bootstrap requires a canonical catalogue and strict defaults.');
  }

  return Object.freeze({
    async prepare(command: LoadCommand): Promise<SettingsBootstrapResult> {
      if (!validLoadCommand(command)) {
        return { kind: 'invalid' };
      }
      try {
        return await dependencies.gate.runExclusive(
          { dataEpoch: command.dataEpoch, operationId: command.requestId, purpose: 'load' },
          async (capability): Promise<SettingsBootstrapResult> => {
            let rawAdmission: SettingsResetAdmissionV1;
            try {
              rawAdmission = await dependencies.resetJournal.admit({
                dataEpoch: command.dataEpoch,
                resetCorrelation: command.resetCorrelation,
                capability,
              });
            } catch {
              return { kind: 'outcome_unknown' };
            }
            const admissionCapture = captureSettingsShellEventBoundary(rawAdmission);
            const admission =
              admissionCapture === null ? null : parseResetAdmission(admissionCapture.value);
            if (admission === null) {
              return { kind: 'outcome_unknown' };
            }
            if (!admissionMatches(admission, command, capability)) {
              return admission.kind === 'closed'
                ? { kind: 'reset_closed' }
                : { kind: 'outcome_unknown' };
            }

            let source: unknown | undefined;
            try {
              source = await dependencies.storage.get(SETTINGS_STORAGE_KEY);
            } catch {
              return { kind: 'outcome_unknown' };
            }
            const capturedSource = captureStorageSource(source);
            if (capturedSource === null) {
              return { kind: 'invalid' };
            }
            const decoded = decodeSettingsStorage(
              capturedSource.value,
              command.dataEpoch,
              includedConnectorIds,
              defaults,
              dependencies.legacyPolicy
            );
            if (decoded.kind === 'invalid') {
              return { kind: 'invalid' };
            }
            if (decoded.kind === 'current') {
              return { kind: 'ready', migrated: false };
            }
            const sourceIdentity = capturedSource.fingerprint;
            const target = migrationEnvelope(command.dataEpoch, decoded.revision, decoded.settings);
            const targetDigest = settingsEnvelopeDigest(target);
            const targetEntryBytes = settingsStorageEntryEncodedBytes(target);
            let capacityAllowed: unknown;
            try {
              capacityAllowed = await dependencies.capacity.assertMigrationWriteAllowed({
                capability,
                sourceFingerprint: sourceIdentity,
                nextEnvelope: cloneSettingsEnvelope(target),
                nextSettingsEntryBytes: targetEntryBytes,
              });
            } catch {
              return { kind: 'outcome_unknown' };
            }
            if (capacityAllowed !== true) {
              return capacityAllowed === false
                ? { kind: 'capacity_denied' }
                : { kind: 'outcome_unknown' };
            }

            let immediatelyBeforeWrite: unknown | undefined;
            try {
              immediatelyBeforeWrite = await dependencies.storage.get(SETTINGS_STORAGE_KEY);
            } catch {
              return { kind: 'outcome_unknown' };
            }
            if (captureStorageSource(immediatelyBeforeWrite)?.fingerprint !== sourceIdentity) {
              return { kind: 'outcome_unknown' };
            }

            try {
              await dependencies.storage.set(SETTINGS_STORAGE_KEY, cloneSettingsEnvelope(target));
            } catch {
              // A rejected Chrome Promise is ambiguous. Exact V2 read-back is
              // the only authority for deciding whether migration completed.
            }
            let readBackRaw: unknown | undefined;
            try {
              readBackRaw = await dependencies.storage.get(SETTINGS_STORAGE_KEY);
            } catch {
              return { kind: 'outcome_unknown' };
            }
            const readBack = parseSettingsEnvelopeV2(
              readBackRaw,
              command.dataEpoch,
              includedConnectorIds
            );
            return readBack !== null && settingsEnvelopeDigest(readBack) === targetDigest
              ? { kind: 'ready', migrated: true }
              : { kind: 'outcome_unknown' };
          }
        );
      } catch {
        return { kind: 'outcome_unknown' };
      }
    },
  });
}
