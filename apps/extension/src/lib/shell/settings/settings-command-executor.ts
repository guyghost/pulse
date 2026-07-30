import {
  captureSettingsShellEventBoundary,
  contractFor,
  isUuidV4,
  makeError,
  parseOriginDigest,
  readStrictJsonRecord,
  parseSettledSettingsSnapshot,
  parseSettingsHostPermissionContainsProofV1,
  type SettingsHostPermissionContainsProofV1,
  type SettingsGlobalStorageReservationProofV1,
  type SettingsMutationOutcomeV1,
  type SettingsPersistenceCommand,
  type SettingsPersistenceError,
  type SettingsPersistenceInput,
  type SettingsPersistenceRawEvent,
  type SettingsSnapshotV1,
} from '../../../models/settings-persistence.contract';
import {
  createSettingsCommandExecutionDeferred,
  type SettingsCommandExecutionDeferredV1,
  type SettingsCommandExecutorPort,
} from './settings-persistence.coordinator';
import type {
  SettingsBootstrapRepository,
  SettingsBootstrapResult,
} from './settings-bootstrap.repository';
import type {
  SettingsAtomicCommitGatePort,
  SettingsDatasetGateCapabilityV1,
} from './settings-dataset-gate';
import type { SettingsPendingIntentRepository } from './settings-pending-intent.repository';
import type {
  SettingsHostPermissionContainsPort,
  SettingsReservationAuthorityPort,
  SettingsTransactionRepository,
} from './settings-transaction.repository';
import type { SettingsGlobalStorageReservationAuthority } from './settings-storage-reservation-authority';

type PersistCommand = Extract<
  SettingsPersistenceCommand,
  { type: 'PERSIST_SETTINGS_PENDING_INTENT' }
>;
type ClearCommand = Extract<SettingsPersistenceCommand, { type: 'CLEAR_SETTINGS_PENDING_INTENT' }>;
type LoadCommand = Extract<SettingsPersistenceCommand, { type: 'RECOVER_AND_LOAD_SETTINGS' }>;
type ReserveCommand = Extract<SettingsPersistenceCommand, { type: 'RESERVE_SETTINGS_STORAGE' }>;
type VerifyCommand = Extract<
  SettingsPersistenceCommand,
  { type: 'VERIFY_SETTINGS_HOST_PERMISSIONS' }
>;
type CompareCommand = Extract<SettingsPersistenceCommand, { type: 'COMPARE_AND_SETTLE_SETTINGS' }>;
type RecoverCommand = Extract<SettingsPersistenceCommand, { type: 'RECOVER_SETTINGS_TRANSACTION' }>;
type RebaseCommand = Extract<SettingsPersistenceCommand, { type: 'REBASE_SETTINGS_MUTATION' }>;
type AbortCommand = Extract<SettingsPersistenceCommand, { type: 'ABORT_SETTINGS_MUTATION' }>;
type ReconcileCommand = Extract<SettingsPersistenceCommand, { type: 'RECONCILE_SETTINGS' }>;
type MutationTransactionCommand = Exclude<
  SettingsPersistenceCommand,
  PersistCommand | ClearCommand | LoadCommand
>;

export type SettingsPermissionCommandResult =
  | { kind: 'verified'; proof: SettingsHostPermissionContainsProofV1 }
  | { kind: 'missing'; snapshot: SettingsSnapshotV1 }
  | { kind: 'outcome_unknown' };

export interface SettingsPermissionCommandPort {
  verify(command: VerifyCommand): Promise<SettingsPermissionCommandResult>;
}

export interface ContainsOnlySettingsPermissionCommandDependencies {
  gate: SettingsAtomicCommitGatePort;
  reservationAuthority: SettingsReservationAuthorityPort;
  permissions: SettingsHostPermissionContainsPort;
  transactions: Pick<SettingsTransactionRepository, 'settlePermissionMissing'>;
  includedConnectorIds: readonly string[];
}

export interface SettingsCommandExecutorDependencies {
  pendingIntents: SettingsPendingIntentRepository;
  bootstrap: SettingsBootstrapRepository;
  transactions: SettingsTransactionRepository;
  reservations: SettingsGlobalStorageReservationAuthority;
  permissionChecks: SettingsPermissionCommandPort;
  includedConnectorIds: readonly string[];
  /** Complete immutable epoch seed whose UUIDs may never be reallocated. */
  identitySeed: SettingsPersistenceInput;
  allocateId?: () => string;
}

type SettingsCommandExecutionResult =
  SettingsPersistenceRawEvent | SettingsCommandExecutionDeferredV1;

function error(
  code: Parameters<typeof contractFor>[0],
  outcome: Parameters<typeof contractFor>[1],
  operation: Parameters<typeof contractFor>[2],
  message: string
): SettingsPersistenceError {
  return makeError(contractFor(code, outcome, operation), message);
}

function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function validVerifyCommand(command: VerifyCommand): boolean {
  const decodedOrigins = parseOriginDigest(command.originDigest);
  return (
    isUuidV4(command.dataEpoch) &&
    isUuidV4(command.mutationId) &&
    isUuidV4(command.permissionCheckId) &&
    isUuidV4(command.activationId) &&
    isUuidV4(command.activationResultId) &&
    command.commandId === `settings/permission_check/${command.permissionCheckId}` &&
    decodedOrigins !== null &&
    sameStrings(decodedOrigins, command.origins) &&
    command.origins.length > 0
  );
}

function sameCapability(
  capability: SettingsDatasetGateCapabilityV1,
  command: VerifyCommand
): boolean {
  return (
    capability.version === 1 &&
    capability.kind === 'DATASET_EPOCH_SETTINGS_LEASE' &&
    capability.dataEpoch === command.dataEpoch &&
    capability.operationId === command.permissionCheckId &&
    capability.purpose === 'permission_check' &&
    isUuidV4(capability.leaseId) &&
    Number.isSafeInteger(capability.authorityRevision) &&
    capability.authorityRevision >= 0
  );
}

function exactSnapshot(
  value: unknown,
  command: SettingsPersistenceCommand,
  requestId: string,
  includedConnectorIds: string[]
): SettingsSnapshotV1 | null {
  const snapshot = parseSettledSettingsSnapshot(value, command.dataEpoch, includedConnectorIds);
  return snapshot !== null &&
    snapshot.requestId === requestId &&
    snapshot.commandId === command.commandId
    ? snapshot
    : null;
}

function outcomeFor(snapshot: SettingsSnapshotV1, mutationId: string) {
  return snapshot.envelope.outcomes.find((outcome) => outcome.mutationId === mutationId) ?? null;
}

function sameOutcome(left: SettingsMutationOutcomeV1, right: SettingsMutationOutcomeV1): boolean {
  return (
    left.version === right.version &&
    left.dataEpoch === right.dataEpoch &&
    left.mutationId === right.mutationId &&
    left.commandDigest === right.commandDigest &&
    left.previousDigest === right.previousDigest &&
    left.candidateDigest === right.candidateDigest &&
    left.baseRevision === right.baseRevision &&
    left.baseGeneration === right.baseGeneration &&
    left.settledRevision === right.settledRevision &&
    left.settledGeneration === right.settledGeneration &&
    left.outcome === right.outcome &&
    sameStrings(left.correlationIds, right.correlationIds)
  );
}

function outcomeMatchesCommand(
  outcome: SettingsMutationOutcomeV1,
  command: Exclude<
    SettingsPersistenceCommand,
    PersistCommand | ClearCommand | LoadCommand | ReserveCommand | RebaseCommand
  >
): boolean {
  return (
    outcome.dataEpoch === command.dataEpoch &&
    outcome.mutationId === command.mutationId &&
    outcome.commandDigest === command.commandDigest &&
    outcome.previousDigest === command.previousDigest &&
    outcome.candidateDigest === command.candidateDigest &&
    outcome.baseRevision === command.baseRevision &&
    outcome.baseGeneration === command.baseGeneration &&
    sameStrings(outcome.correlationIds, command.correlationIds)
  );
}

function parseBootstrapResult(value: unknown): SettingsBootstrapResult | null {
  const kindRecord = readStrictJsonRecord(value, ['kind']);
  if (
    kindRecord !== null &&
    (kindRecord.kind === 'invalid' ||
      kindRecord.kind === 'reset_closed' ||
      kindRecord.kind === 'capacity_denied' ||
      kindRecord.kind === 'outcome_unknown')
  ) {
    return { kind: kindRecord.kind };
  }
  const ready = readStrictJsonRecord(value, ['kind', 'migrated']);
  return ready !== null && ready.kind === 'ready' && typeof ready.migrated === 'boolean'
    ? { kind: 'ready', migrated: ready.migrated }
    : null;
}

function hasExactResultShape(value: unknown, keys: readonly string[]): boolean {
  return readStrictJsonRecord(value, keys) !== null;
}

export function createContainsOnlySettingsPermissionCommandPort(
  dependencies: ContainsOnlySettingsPermissionCommandDependencies
): SettingsPermissionCommandPort {
  const includedConnectorIds = [...dependencies.includedConnectorIds];
  return Object.freeze({
    async verify(command: VerifyCommand): Promise<SettingsPermissionCommandResult> {
      if (!validVerifyCommand(command)) {
        return { kind: 'outcome_unknown' };
      }
      try {
        const observation = await dependencies.gate.runExclusive(
          {
            dataEpoch: command.dataEpoch,
            operationId: command.permissionCheckId,
            purpose: 'permission_check',
          },
          async (
            capability
          ): Promise<SettingsPermissionCommandResult | { kind: 'missing_raw' }> => {
            if (
              !sameCapability(capability, command) ||
              !(await dependencies.reservationAuthority.isActive(
                command.storageReservationProof,
                capability
              ))
            ) {
              return { kind: 'outcome_unknown' };
            }
            const contains = await dependencies.permissions.contains(command.origins, capability);
            if (
              !(await dependencies.reservationAuthority.isActive(
                command.storageReservationProof,
                capability
              ))
            ) {
              return { kind: 'outcome_unknown' };
            }
            if (!contains) {
              return { kind: 'missing_raw' };
            }
            const proof = parseSettingsHostPermissionContainsProofV1(
              {
                version: 1,
                dataEpoch: command.dataEpoch,
                mutationId: command.mutationId,
                permissionCheckId: command.permissionCheckId,
                activationId: command.activationId,
                activationResultId: command.activationResultId,
                originDigest: command.originDigest,
                verifiedOrigins: [...command.origins],
                containsVerified: true,
              },
              command
            );
            return proof === null ? { kind: 'outcome_unknown' } : { kind: 'verified', proof };
          }
        );
        if (observation.kind !== 'missing_raw') {
          return observation;
        }
        const settlementCapture = captureSettingsShellEventBoundary(
          await dependencies.transactions.settlePermissionMissing(command)
        );
        const settlement = settlementCapture?.value as
          Awaited<ReturnType<SettingsTransactionRepository['settlePermissionMissing']>> | undefined;
        if (settlement === undefined) {
          return { kind: 'outcome_unknown' };
        }
        if (
          settlement.kind !== 'settled' ||
          !hasExactResultShape(settlement, ['kind', 'snapshot', 'outcome'])
        ) {
          return { kind: 'outcome_unknown' };
        }
        const snapshot = exactSnapshot(
          settlement.snapshot,
          command,
          command.permissionCheckId,
          includedConnectorIds
        );
        const outcome = snapshot === null ? null : outcomeFor(snapshot, command.mutationId);
        return snapshot !== null &&
          outcome?.outcome === 'not_committed' &&
          outcomeMatchesCommand(outcome, command) &&
          sameOutcome(settlement.outcome, outcome) &&
          outcome.correlationIds.includes(command.permissionCheckId)
          ? { kind: 'missing', snapshot }
          : { kind: 'outcome_unknown' };
      } catch {
        return { kind: 'outcome_unknown' };
      }
    },
  });
}

function collectIds(
  value: unknown,
  target: Set<string>,
  state: { nodes: number } = { nodes: 0 },
  depth = 0
): boolean {
  state.nodes += 1;
  if (depth > 48 || state.nodes > 100_000) {
    return false;
  }
  if (isUuidV4(value)) {
    target.add(value);
    return true;
  }
  if (typeof value !== 'object' || value === null) {
    return true;
  }
  try {
    if (Object.getOwnPropertySymbols(value).length !== 0) {
      return false;
    }
    const descriptors = Object.getOwnPropertyDescriptors(value);
    for (const [key, descriptor] of Object.entries(descriptors)) {
      if (Array.isArray(value) && key === 'length') {
        continue;
      }
      if (
        !descriptor.enumerable ||
        !('value' in descriptor) ||
        'get' in descriptor ||
        'set' in descriptor ||
        !collectIds(descriptor.value, target, state, depth + 1)
      ) {
        return false;
      }
    }
    return true;
  } catch {
    return false;
  }
}

interface SettingsExecutorIdentityRegistry {
  observe(value: unknown): boolean;
  poison(): void;
  allocate(command: SettingsPersistenceCommand): string | null;
}

function idAllocator(source: (() => string) | undefined): SettingsExecutorIdentityRegistry {
  const observed = new Set<string>();
  let graphIsSafe = true;
  return {
    observe(value: unknown): boolean {
      graphIsSafe = collectIds(value, observed) && graphIsSafe;
      return graphIsSafe;
    },
    poison(): void {
      graphIsSafe = false;
    },
    allocate(command: SettingsPersistenceCommand): string | null {
      graphIsSafe = collectIds(command, observed) && graphIsSafe;
      if (!graphIsSafe) {
        return null;
      }
      const candidateSource = source ?? (() => crypto.randomUUID());
      for (let attempt = 0; attempt < 128; attempt += 1) {
        let candidate: string;
        try {
          candidate = candidateSource();
        } catch {
          return null;
        }
        if (isUuidV4(candidate) && !observed.has(candidate)) {
          observed.add(candidate);
          return candidate;
        }
      }
      return null;
    },
  };
}

function pendingPersistUnknown(command: PersistCommand): SettingsPersistenceRawEvent {
  return {
    type: 'SETTINGS_PENDING_INTENT_PERSIST_OUTCOME_UNKNOWN',
    dataEpoch: command.dataEpoch,
    mutationId: command.pendingIntent.mutation.mutationId,
    commandId: command.commandId,
    error: error(
      'SETTINGS_TRANSPORT_ERROR',
      'unknown',
      'pending_intent',
      'Pending Settings intent persistence outcome is unknown.'
    ),
  };
}

function pendingClearUnknown(command: ClearCommand): SettingsPersistenceRawEvent {
  return {
    type: 'SETTINGS_PENDING_INTENT_CLEAR_OUTCOME_UNKNOWN',
    dataEpoch: command.dataEpoch,
    mutationId: command.mutationId,
    commandId: command.commandId,
    error: error(
      'SETTINGS_TRANSPORT_ERROR',
      'unknown',
      'pending_intent',
      'Pending Settings intent removal outcome is unknown.'
    ),
  };
}

function loadFailure(
  command: LoadCommand,
  code:
    | 'SETTINGS_INVALID'
    | 'SETTINGS_RESET_IN_PROGRESS'
    | 'SETTINGS_STORAGE_FAILED'
    | 'SETTINGS_LOAD_FAILED'
    | 'SETTINGS_PROTOCOL_ERROR',
  message: string
): SettingsPersistenceRawEvent {
  return {
    type: 'LOAD_FAILED',
    dataEpoch: command.dataEpoch,
    requestId: command.requestId,
    commandId: command.commandId,
    error: error(code, 'unknown', 'load', message),
  };
}

function protocolUncertain(
  command: MutationTransactionCommand,
  nextRequestId: string
): SettingsPersistenceRawEvent {
  return {
    type: 'PROTOCOL_UNCERTAIN',
    dataEpoch: command.dataEpoch,
    mutationId: command.mutationId,
    nextRequestId,
    error: error(
      'SETTINGS_PROTOCOL_ERROR',
      'unknown',
      'reconcile',
      'A matching Settings transaction response is malformed or unprovable.'
    ),
  };
}

export function createSettingsCommandExecutor(
  dependencies: SettingsCommandExecutorDependencies
): SettingsCommandExecutorPort {
  const includedConnectorIds = [...dependencies.includedConnectorIds];
  const identityRegistry = idAllocator(dependencies.allocateId);
  const identitySeedCapture = captureSettingsShellEventBoundary(dependencies.identitySeed);
  if (identitySeedCapture === null) {
    identityRegistry.poison();
  } else {
    identityRegistry.observe(identitySeedCapture.value);
  }
  const captureDependencyResult = <T>(value: T): T | null => {
    const capture = captureSettingsShellEventBoundary(value);
    if (capture === null) {
      identityRegistry.poison();
      return null;
    }
    if (!identityRegistry.observe(capture.value)) {
      return null;
    }
    return capture.value as T;
  };
  const allocateFreshId = (command: SettingsPersistenceCommand): string | null =>
    identityRegistry.allocate(command);
  const withFreshId = (
    command: SettingsPersistenceCommand,
    createEvent: (freshId: string) => SettingsPersistenceRawEvent
  ): SettingsCommandExecutionResult => {
    const freshId = allocateFreshId(command);
    return freshId === null
      ? createSettingsCommandExecutionDeferred(command)
      : createEvent(freshId);
  };
  const transactionProtocolUncertain = (
    command: MutationTransactionCommand
  ): SettingsCommandExecutionResult =>
    withFreshId(command, (freshId) => protocolUncertain(command, freshId));
  const releaseReservation = async (
    proof: SettingsGlobalStorageReservationProofV1 | null
  ): Promise<void> => {
    if (proof !== null) {
      await dependencies.reservations.release(proof);
    }
  };

  const executePersist = async (
    command: PersistCommand
  ): Promise<SettingsCommandExecutionResult> => {
    try {
      const result = captureDependencyResult(await dependencies.pendingIntents.persist(command));
      if (result === null) {
        return pendingPersistUnknown(command);
      }
      if (result.kind === 'persisted' && hasExactResultShape(result, ['kind', 'proof'])) {
        return {
          type: 'SETTINGS_PENDING_INTENT_PERSISTED',
          dataEpoch: command.dataEpoch,
          mutationId: command.pendingIntent.mutation.mutationId,
          commandId: command.commandId,
          proof: result.proof,
        };
      }
      if (result.kind === 'absent' && hasExactResultShape(result, ['kind', 'proof'])) {
        return {
          type: 'SETTINGS_PENDING_INTENT_PERSIST_FAILED',
          dataEpoch: command.dataEpoch,
          mutationId: command.pendingIntent.mutation.mutationId,
          commandId: command.commandId,
          proof: result.proof,
          error: error(
            'SETTINGS_STORAGE_FAILED',
            'previous',
            'pending_intent',
            'Pending Settings intent is proved absent after persistence.'
          ),
        };
      }
      return pendingPersistUnknown(command);
    } catch {
      return pendingPersistUnknown(command);
    }
  };

  const executeClear = async (command: ClearCommand): Promise<SettingsCommandExecutionResult> => {
    try {
      const result = captureDependencyResult(await dependencies.pendingIntents.clear(command));
      if (result === null) {
        return pendingClearUnknown(command);
      }
      return result.kind === 'cleared' && hasExactResultShape(result, ['kind', 'proof'])
        ? {
            type: 'SETTINGS_PENDING_INTENT_CLEARED',
            dataEpoch: command.dataEpoch,
            mutationId: command.mutationId,
            commandId: command.commandId,
            proof: result.proof,
          }
        : pendingClearUnknown(command);
    } catch {
      return pendingClearUnknown(command);
    }
  };

  const executeLoad = async (command: LoadCommand): Promise<SettingsCommandExecutionResult> => {
    try {
      const bootstrap = captureDependencyResult(await dependencies.bootstrap.prepare(command));
      if (bootstrap === null) {
        return loadFailure(
          command,
          'SETTINGS_PROTOCOL_ERROR',
          'Settings bootstrap returned an unsafe response graph.'
        );
      }
      const parsedBootstrap = parseBootstrapResult(bootstrap);
      if (parsedBootstrap === null) {
        return loadFailure(
          command,
          'SETTINGS_PROTOCOL_ERROR',
          'Settings bootstrap returned a malformed result.'
        );
      }
      if (parsedBootstrap.kind === 'invalid') {
        return loadFailure(
          command,
          'SETTINGS_INVALID',
          'Settings storage is not a strict V2 value.'
        );
      }
      if (parsedBootstrap.kind === 'reset_closed') {
        return loadFailure(
          command,
          'SETTINGS_RESET_IN_PROGRESS',
          'Settings bootstrap is closed by local-data reset.'
        );
      }
      if (
        parsedBootstrap.kind === 'capacity_denied' ||
        parsedBootstrap.kind === 'outcome_unknown'
      ) {
        return loadFailure(
          command,
          'SETTINGS_STORAGE_FAILED',
          'Settings bootstrap write outcome is unknown.'
        );
      }
      const result = captureDependencyResult(
        await dependencies.transactions.recoverAndLoad(command)
      );
      if (result === null) {
        return loadFailure(
          command,
          'SETTINGS_PROTOCOL_ERROR',
          'Settings recovery returned an unsafe response graph.'
        );
      }
      if (result.kind === 'recovery_required' && hasExactResultShape(result, ['kind'])) {
        return loadFailure(
          command,
          'SETTINGS_LOAD_FAILED',
          'Settings recovery barrier did not produce a settled snapshot.'
        );
      }
      if (result.kind !== 'settled' || !hasExactResultShape(result, ['kind', 'snapshot'])) {
        return loadFailure(
          command,
          'SETTINGS_PROTOCOL_ERROR',
          'Settings recovery returned an unknown or malformed result.'
        );
      }
      const snapshot = exactSnapshot(
        result.snapshot,
        command,
        command.requestId,
        includedConnectorIds
      );
      return snapshot === null
        ? loadFailure(
            command,
            'SETTINGS_PROTOCOL_ERROR',
            'Settings recovery returned a malformed or uncorrelated snapshot.'
          )
        : {
            type: 'LOAD_SUCCEEDED',
            dataEpoch: command.dataEpoch,
            requestId: command.requestId,
            commandId: command.commandId,
            snapshot,
          };
    } catch {
      return loadFailure(
        command,
        'SETTINGS_STORAGE_FAILED',
        'Settings recovery failed without an exact settled proof.'
      );
    }
  };

  const executeReserve = async (
    command: ReserveCommand
  ): Promise<SettingsCommandExecutionResult> => {
    try {
      const result = captureDependencyResult(await dependencies.reservations.acquire(command));
      if (result === null) {
        return transactionProtocolUncertain(command);
      }
      if (result.kind === 'granted' && hasExactResultShape(result, ['kind', 'proof'])) {
        return {
          type: 'STORAGE_RESERVATION_GRANTED',
          dataEpoch: command.dataEpoch,
          mutationId: command.mutationId,
          commandId: command.commandId,
          proof: result.proof,
        };
      }
      if (result.kind === 'denied' && hasExactResultShape(result, ['kind', 'denial'])) {
        return {
          type: 'STORAGE_RESERVATION_DENIED',
          dataEpoch: command.dataEpoch,
          mutationId: command.mutationId,
          commandId: command.commandId,
          denial: result.denial,
          error: error(
            'SETTINGS_GLOBAL_STORAGE_QUOTA_EXHAUSTED',
            'previous',
            'mutate',
            'Global extension storage cannot reserve the required Settings headroom.'
          ),
        };
      }
      return transactionProtocolUncertain(command);
    } catch {
      return transactionProtocolUncertain(command);
    }
  };

  const executePermission = async (
    command: VerifyCommand
  ): Promise<SettingsCommandExecutionResult> => {
    try {
      const result = captureDependencyResult(await dependencies.permissionChecks.verify(command));
      if (result === null) {
        return transactionProtocolUncertain(command);
      }
      if (result.kind === 'verified' && hasExactResultShape(result, ['kind', 'proof'])) {
        const proof = parseSettingsHostPermissionContainsProofV1(result.proof, command);
        if (proof !== null) {
          return {
            type: 'HOST_PERMISSIONS_VERIFIED',
            dataEpoch: command.dataEpoch,
            mutationId: command.mutationId,
            commandId: command.commandId,
            proof,
          };
        }
        return transactionProtocolUncertain(command);
      }
      if (result.kind === 'missing' && hasExactResultShape(result, ['kind', 'snapshot'])) {
        const snapshot = exactSnapshot(
          result.snapshot,
          command,
          command.permissionCheckId,
          includedConnectorIds
        );
        const outcome = snapshot === null ? null : outcomeFor(snapshot, command.mutationId);
        if (
          snapshot !== null &&
          outcome?.outcome === 'not_committed' &&
          outcomeMatchesCommand(outcome, command) &&
          outcome.correlationIds.includes(command.permissionCheckId)
        ) {
          await releaseReservation(command.storageReservationProof);
          return {
            type: 'HOST_PERMISSIONS_MISSING',
            dataEpoch: command.dataEpoch,
            mutationId: command.mutationId,
            commandId: command.commandId,
            snapshot,
            error: error(
              'SETTINGS_HOST_PERMISSION_MISSING',
              'previous',
              'permission_check',
              'A mandatory connector host permission is missing.'
            ),
          };
        }
        return transactionProtocolUncertain(command);
      }
      if (result.kind !== 'outcome_unknown' || !hasExactResultShape(result, ['kind'])) {
        return transactionProtocolUncertain(command);
      }
    } catch {
      // The contains observation is ambiguous; reconciliation is mandatory.
    }
    return withFreshId(command, (freshId) => ({
      type: 'HOST_PERMISSIONS_OUTCOME_UNKNOWN',
      dataEpoch: command.dataEpoch,
      mutationId: command.mutationId,
      commandId: command.commandId,
      nextRequestId: freshId,
      error: error(
        'SETTINGS_TRANSPORT_ERROR',
        'unknown',
        'permission_check',
        'Host-permission contains outcome is unknown.'
      ),
    }));
  };

  const executeCompare = async (
    command: CompareCommand
  ): Promise<SettingsCommandExecutionResult> => {
    try {
      const result = captureDependencyResult(
        await dependencies.transactions.compareAndSettle(command)
      );
      if (result === null) {
        return transactionProtocolUncertain(command);
      }
      if (
        (result.kind === 'committed' || result.kind === 'already_settled') &&
        hasExactResultShape(result, ['kind', 'snapshot'])
      ) {
        const snapshot = exactSnapshot(
          result.snapshot,
          command,
          command.mutationId,
          includedConnectorIds
        );
        const outcome = snapshot === null ? null : outcomeFor(snapshot, command.mutationId);
        if (
          snapshot !== null &&
          outcome?.outcome === 'committed' &&
          outcomeMatchesCommand(outcome, command)
        ) {
          await releaseReservation(command.storageReservationProof);
          return {
            type: 'SAVE_SUCCEEDED',
            dataEpoch: command.dataEpoch,
            mutationId: command.mutationId,
            commandId: command.commandId,
            snapshot,
          };
        }
        return transactionProtocolUncertain(command);
      }
      if (
        result.kind === 'effect_failed' &&
        hasExactResultShape(result, ['kind', 'recoveryRequestId', 'journalProof'])
      ) {
        return {
          type: 'RUNTIME_EFFECT_FAILED',
          dataEpoch: command.dataEpoch,
          mutationId: command.mutationId,
          commandId: command.commandId,
          recoveryRequestId: result.recoveryRequestId,
          journalProof: result.journalProof,
          error: error(
            'SETTINGS_RUNTIME_EFFECT_FAILED',
            'candidate',
            'effect',
            'Auto-scan alarm alignment failed after the candidate write.'
          ),
        };
      }
      if (
        (result.kind !== 'conflict' && result.kind !== 'permission_missing') ||
        !hasExactResultShape(result, ['kind'])
      ) {
        return transactionProtocolUncertain(command);
      }
      return withFreshId(command, (freshId) => ({
        type: 'SAVE_FAILED',
        dataEpoch: command.dataEpoch,
        mutationId: command.mutationId,
        commandId: command.commandId,
        nextRequestId: freshId,
        error: error(
          'SETTINGS_CONFLICT',
          'previous',
          'save',
          result.kind === 'permission_missing'
            ? 'Required permissions changed before Settings commit.'
            : 'Settings compare-and-settle did not prove a commit.'
        ),
      }));
    } catch {
      return withFreshId(command, (freshId) => ({
        type: 'SAVE_FAILED',
        dataEpoch: command.dataEpoch,
        mutationId: command.mutationId,
        commandId: command.commandId,
        nextRequestId: freshId,
        error: error(
          'SETTINGS_STORAGE_FAILED',
          'unknown',
          'save',
          'Settings compare-and-settle outcome is unknown.'
        ),
      }));
    }
  };

  const executeRecover = async (
    command: RecoverCommand
  ): Promise<SettingsCommandExecutionResult> => {
    try {
      const result = captureDependencyResult(
        await dependencies.transactions.recoverCompensation(command)
      );
      if (result === null) {
        return transactionProtocolUncertain(command);
      }
      if (
        (result.kind === 'compensated' || result.kind === 'already_settled') &&
        hasExactResultShape(result, ['kind', 'snapshot'])
      ) {
        const snapshot = exactSnapshot(
          result.snapshot,
          command,
          command.requestId,
          includedConnectorIds
        );
        const outcome = snapshot === null ? null : outcomeFor(snapshot, command.mutationId);
        if (
          snapshot !== null &&
          outcome?.outcome === 'compensated' &&
          outcomeMatchesCommand(outcome, command)
        ) {
          await releaseReservation(command.storageReservationProof);
          return {
            type: 'COMPENSATION_SUCCEEDED',
            dataEpoch: command.dataEpoch,
            mutationId: command.mutationId,
            requestId: command.requestId,
            commandId: command.commandId,
            snapshot,
          };
        }
        return transactionProtocolUncertain(command);
      }
      if (result.kind !== 'outcome_unknown' || !hasExactResultShape(result, ['kind'])) {
        return transactionProtocolUncertain(command);
      }
    } catch {
      // Ambiguous recovery is represented below and never promoted to success.
    }
    return withFreshId(command, (freshId) => ({
      type: 'COMPENSATION_FAILED',
      dataEpoch: command.dataEpoch,
      mutationId: command.mutationId,
      requestId: command.requestId,
      commandId: command.commandId,
      nextRequestId: freshId,
      error: error(
        'SETTINGS_COMPENSATION_FAILED',
        'unknown',
        'compensate',
        'Settings compensation outcome is unknown.'
      ),
    }));
  };

  const executeRebase = async (command: RebaseCommand): Promise<SettingsCommandExecutionResult> => {
    try {
      const result = captureDependencyResult(await dependencies.transactions.readSettled(command));
      if (result === null) {
        return transactionProtocolUncertain(command);
      }
      if (result.kind === 'settled' && hasExactResultShape(result, ['kind', 'snapshot'])) {
        const snapshot = exactSnapshot(
          result.snapshot,
          command,
          command.requestId,
          includedConnectorIds
        );
        if (snapshot !== null) {
          return {
            type: 'RETRY_READY',
            dataEpoch: command.dataEpoch,
            mutationId: command.mutationId,
            requestId: command.requestId,
            commandId: command.commandId,
            snapshot,
          };
        }
        return transactionProtocolUncertain(command);
      }
      if (result.kind !== 'recovery_required' || !hasExactResultShape(result, ['kind'])) {
        return transactionProtocolUncertain(command);
      }
    } catch {
      // Rebase remains unproved; reconciliation gets a fresh identity below.
    }
    return withFreshId(command, (freshId) => ({
      type: 'RETRY_FAILED',
      dataEpoch: command.dataEpoch,
      mutationId: command.mutationId,
      requestId: command.requestId,
      commandId: command.commandId,
      nextRequestId: freshId,
      error: error(
        'SETTINGS_LOAD_FAILED',
        'unknown',
        'rebase',
        'Settings rebase did not produce a settled snapshot.'
      ),
    }));
  };

  const executeAbort = async (command: AbortCommand): Promise<SettingsCommandExecutionResult> => {
    try {
      const result = captureDependencyResult(await dependencies.transactions.abort(command));
      if (result === null) {
        return transactionProtocolUncertain(command);
      }
      if (
        (result.kind === 'cancelled' || result.kind === 'already_settled') &&
        hasExactResultShape(result, ['kind', 'snapshot', 'outcome'])
      ) {
        const snapshot = exactSnapshot(
          result.snapshot,
          command,
          command.requestId,
          includedConnectorIds
        );
        const outcome = snapshot === null ? null : outcomeFor(snapshot, command.mutationId);
        if (
          snapshot !== null &&
          outcome?.outcome === 'cancelled' &&
          outcomeMatchesCommand(outcome, command) &&
          sameOutcome(result.outcome, outcome)
        ) {
          await releaseReservation(command.storageReservationProof);
          return {
            type: 'CANCEL_CONFIRMED',
            dataEpoch: command.dataEpoch,
            mutationId: command.mutationId,
            requestId: command.requestId,
            commandId: command.commandId,
            snapshot,
          };
        }
        return transactionProtocolUncertain(command);
      }
      if (result.kind !== 'outcome_unknown' || !hasExactResultShape(result, ['kind'])) {
        return transactionProtocolUncertain(command);
      }
    } catch {
      // Abort result remains ambiguous and must reconcile.
    }
    return withFreshId(command, (freshId) => ({
      type: 'CANCEL_OUTCOME_UNKNOWN',
      dataEpoch: command.dataEpoch,
      mutationId: command.mutationId,
      requestId: command.requestId,
      commandId: command.commandId,
      nextRequestId: freshId,
      error: error(
        'SETTINGS_TRANSPORT_ERROR',
        'unknown',
        'cancel',
        'Settings abort outcome is unknown.'
      ),
    }));
  };

  const executeReconcile = async (
    command: ReconcileCommand
  ): Promise<SettingsCommandExecutionResult> => {
    try {
      const result = captureDependencyResult(await dependencies.transactions.reconcile(command));
      if (result === null) {
        return transactionProtocolUncertain(command);
      }
      if (
        result.kind === 'settled' &&
        hasExactResultShape(result, ['kind', 'snapshot', 'outcome'])
      ) {
        const snapshot = exactSnapshot(
          result.snapshot,
          command,
          command.requestId,
          includedConnectorIds
        );
        const outcome = snapshot === null ? null : outcomeFor(snapshot, command.mutationId);
        if (
          snapshot !== null &&
          outcome !== null &&
          outcomeMatchesCommand(outcome, command) &&
          sameOutcome(result.outcome, outcome)
        ) {
          await releaseReservation(command.storageReservationProof);
          return {
            type: 'RECONCILED',
            dataEpoch: command.dataEpoch,
            requestId: command.requestId,
            commandId: command.commandId,
            snapshot,
          };
        }
        return transactionProtocolUncertain(command);
      }
      if (result.kind === 'outcome_missing' && hasExactResultShape(result, ['kind', 'snapshot'])) {
        const snapshot = exactSnapshot(
          result.snapshot,
          command,
          command.requestId,
          includedConnectorIds
        );
        if (snapshot !== null && outcomeFor(snapshot, command.mutationId) === null) {
          return {
            type: 'RECONCILED',
            dataEpoch: command.dataEpoch,
            requestId: command.requestId,
            commandId: command.commandId,
            snapshot,
          };
        }
        return transactionProtocolUncertain(command);
      }
      if (result.kind !== 'outcome_unknown' || !hasExactResultShape(result, ['kind'])) {
        return transactionProtocolUncertain(command);
      }
    } catch {
      // Reconciliation failure stays recoverable and command-correlated.
    }
    return {
      type: 'RECONCILE_FAILED',
      dataEpoch: command.dataEpoch,
      requestId: command.requestId,
      commandId: command.commandId,
      error: error(
        'SETTINGS_RECONCILE_FAILED',
        'unknown',
        'reconcile',
        'Settings reconciliation did not produce a causal settled snapshot.'
      ),
    };
  };

  return Object.freeze({
    execute(command: SettingsPersistenceCommand): Promise<SettingsCommandExecutionResult> {
      identityRegistry.observe(command);
      switch (command.type) {
        case 'PERSIST_SETTINGS_PENDING_INTENT':
          return executePersist(command);
        case 'CLEAR_SETTINGS_PENDING_INTENT':
          return executeClear(command);
        case 'RECOVER_AND_LOAD_SETTINGS':
          return executeLoad(command);
        case 'RESERVE_SETTINGS_STORAGE':
          return executeReserve(command);
        case 'VERIFY_SETTINGS_HOST_PERMISSIONS':
          return executePermission(command);
        case 'COMPARE_AND_SETTLE_SETTINGS':
          return executeCompare(command);
        case 'RECOVER_SETTINGS_TRANSACTION':
          return executeRecover(command);
        case 'REBASE_SETTINGS_MUTATION':
          return executeRebase(command);
        case 'ABORT_SETTINGS_MUTATION':
          return executeAbort(command);
        case 'RECONCILE_SETTINGS':
          return executeReconcile(command);
      }
    },
  });
}
