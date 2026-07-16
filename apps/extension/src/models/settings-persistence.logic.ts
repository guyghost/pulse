import { assign, setup } from 'xstate';
import type { AppSettings, ThemePreference } from '../lib/core/types/app-settings';
import {
  MAX_SETTINGS_HANDLED_ACTIVATIONS_PER_WORKER,
  MAX_SETTINGS_CORRELATION_IDS,
  SETTINGS_PENDING_INTENT_STORAGE_KEY,
  cloneSettingMutation,
  cloneSettingsPendingIntentV1,
  cloneSettingsTerminalSettlementV1,
  cloneSettings,
  cloneSettingsSnapshot,
  commandId,
  contractFor,
  createSettingsPendingIntentV1,
  expectedAlarm,
  hasSettingsMutationHeadroom,
  inputIsValid,
  isUuidV4,
  makeError,
  normalizeSettings,
  normalizeCorrelationIds,
  originDigest,
  projectSettingsMutationBytes,
  readStrictJsonArray,
  sameSettings,
  settingsCommandDigest,
  settingsDigest,
  settingsEnvelopeCorrelationIds,
  settingsEnvelopeDigest,
  settingsGenerationHasMutationCapacity,
  settingsRevisionHasMutationCapacity,
  type CanonicalRelation,
  type MutationOutcomeKnowledge,
  type PersistentSettingKey,
  type ReconcileReason,
  type RetryIntent,
  type SettingMutation,
  type SettingValue,
  type SettingsErrorCode,
  type SettingsMutationOutcomeV1,
  type SettingsDeferredPersistenceCommand,
  type SettingsPendingIntentPhase,
  type SettingsPersistenceCommand,
  type SettingsPersistenceContext,
  type SettingsPersistenceError,
  type SettingsPersistenceEvent,
  type SettingsPersistenceInput,
  type SettingsSnapshotV1,
  type SettingsTerminalSettlementV1,
  type LocalDataResetEpochEventV1,
} from './settings-persistence.contract';

const themes = new Set<ThemePreference>(['light', 'dark', 'system']);

function patchSettings(
  settings: AppSettings,
  key: PersistentSettingKey,
  value: unknown,
  includedIds: string[]
): AppSettings | null {
  const next = cloneSettings(settings);

  if (key === 'scanIntervalMinutes') {
    if (!Number.isInteger(value) || Number(value) < 1 || Number(value) > 1440) {
      return null;
    }
    next.scanIntervalMinutes = Number(value);
  } else if (key === 'autoScan' || key === 'notifications') {
    if (typeof value !== 'boolean') {
      return null;
    }
    next[key] = value;
  } else if (key === 'theme') {
    if (typeof value !== 'string' || !themes.has(value as ThemePreference)) {
      return null;
    }
    next.theme = value as ThemePreference;
  } else {
    const ids = readStrictJsonArray(value);
    if (
      ids === null ||
      !ids.every((id): id is string => typeof id === 'string' && includedIds.includes(id)) ||
      new Set(ids).size !== ids.length
    ) {
      return null;
    }
    next.enabledConnectors = [...ids].sort();
  }

  return normalizeSettings(next);
}

const settingValue = (settings: AppSettings, key: PersistentSettingKey): SettingValue =>
  key === 'enabledConnectors' ? [...settings.enabledConnectors] : settings[key];

const canonicalSettings = (context: SettingsPersistenceContext): AppSettings =>
  context.canonical?.envelope.settings ?? context.defaultSettings;

const requiredOrigins = (context: SettingsPersistenceContext, candidate: AppSettings): string[] =>
  [
    ...new Set(
      candidate.enabledConnectors
        .filter((id) => !canonicalSettings(context).enabledConnectors.includes(id))
        .flatMap((id) => context.permissionOriginsByConnectorId[id] ?? [])
    ),
  ].sort();

function contextCorrelationIds(context: SettingsPersistenceContext): Set<string> {
  const ids = new Set<string>([
    context.loadRequestId,
    ...context.handledActivationIds,
    ...context.handledActivationResultIds,
    ...(context.reconcileRequestId ? [context.reconcileRequestId] : []),
    ...(context.canonical ? settingsEnvelopeCorrelationIds(context.canonical.envelope) : []),
    ...(context.mutation?.correlationIds ?? []),
    ...(context.retryIntent
      ? [
          context.retryIntent.failedMutationId,
          context.retryIntent.mutationId,
          context.retryIntent.permissionCheckId,
          context.retryIntent.activationId,
          context.retryIntent.activationResultId,
          context.retryIntent.storageReservationId,
          context.retryIntent.requestId,
        ]
      : []),
    ...(context.pendingReset
      ? [context.pendingReset.resetId, context.pendingReset.settingsBootstrapRequestId]
      : []),
  ]);
  return ids;
}

type ActivationAttemptEvent = Extract<
  SettingsPersistenceEvent,
  { type: 'SETTINGS_CAPTURED/MUTATE' | 'SETTINGS_CAPTURED/RETRY' }
>;

function activationAlreadyHandled(
  context: SettingsPersistenceContext,
  event: ActivationAttemptEvent
): boolean {
  return (
    context.handledActivationIds.includes(event.activationId) ||
    context.handledActivationResultIds.includes(event.activationResult.resultId)
  );
}

function canRecordActivation(context: SettingsPersistenceContext): boolean {
  return (
    context.handledActivationIds.length < MAX_SETTINGS_HANDLED_ACTIVATIONS_PER_WORKER &&
    context.handledActivationResultIds.length < MAX_SETTINGS_HANDLED_ACTIVATIONS_PER_WORKER &&
    context.handledActivationIds.length === context.handledActivationResultIds.length
  );
}

function appendHandledActivation(
  context: SettingsPersistenceContext,
  event: ActivationAttemptEvent
): string[] {
  return [...context.handledActivationIds, event.activationId];
}

function appendHandledActivationResult(
  context: SettingsPersistenceContext,
  event: ActivationAttemptEvent
): string[] {
  return [...context.handledActivationResultIds, event.activationResult.resultId];
}

function verifiedActivationAttempt(
  context: SettingsPersistenceContext,
  event: ActivationAttemptEvent
): boolean {
  return (
    event.activationResult.kind === 'SETTINGS_ACTIVATION_CONSUMED' &&
    !activationAlreadyHandled(context, event) &&
    canRecordActivation(context)
  );
}

function areFreshCorrelationIds(
  context: SettingsPersistenceContext,
  ids: string[],
  excludedExistingIds: string[] = []
): boolean {
  if (ids.length === 0 || ids.some((id) => !isUuidV4(id)) || new Set(ids).size !== ids.length) {
    return false;
  }
  const used = contextCorrelationIds(context);
  excludedExistingIds.forEach((id) => used.delete(id));
  return ids.every((id) => !used.has(id));
}

function canAppendCorrelationIds(mutation: SettingMutation, ...ids: string[]): boolean {
  return (
    normalizeCorrelationIds([...mutation.correlationIds, ...ids]).length <=
    MAX_SETTINGS_CORRELATION_IDS
  );
}

function currentCommandOfType<T extends SettingsPersistenceCommand['type']>(
  context: SettingsPersistenceContext,
  type: T
): Extract<SettingsPersistenceCommand, { type: T }> | null {
  const current = context.command;
  return current?.type === type && current.dataEpoch === context.dataEpoch
    ? (current as Extract<SettingsPersistenceCommand, { type: T }>)
    : null;
}

type MutationIdentityCommand = Extract<SettingsPersistenceCommand, { commandDigest: string }>;

function commandMatchesMutation(
  command: MutationIdentityCommand,
  mutation: SettingMutation
): boolean {
  return (
    command.mutationId === mutation.mutationId &&
    command.commandDigest === mutation.commandDigest &&
    command.baseRevision === mutation.baseRevision &&
    command.baseGeneration === mutation.baseGeneration &&
    command.previousDigest === mutation.previousDigest &&
    command.candidateDigest === mutation.candidateDigest &&
    command.correlationIds.length === mutation.correlationIds.length &&
    command.correlationIds.every((id, index) => id === mutation.correlationIds[index])
  );
}

function currentMutationIdentityCommand(
  context: SettingsPersistenceContext
): MutationIdentityCommand | null {
  const command = context.command;
  return command && 'commandDigest' in command && command.dataEpoch === context.dataEpoch
    ? command
    : null;
}

const mutationCandidate = (
  context: SettingsPersistenceContext,
  event: Extract<SettingsPersistenceEvent, { type: 'SETTINGS_CAPTURED/MUTATE' }>
): AppSettings | null =>
  patchSettings(
    canonicalSettings(context),
    event.key,
    event.candidate,
    context.includedConnectorIds
  );

function validMutationRequest(
  context: SettingsPersistenceContext,
  event: Extract<SettingsPersistenceEvent, { type: 'SETTINGS_CAPTURED/MUTATE' }>
): boolean {
  return (
    verifiedActivationAttempt(context, event) &&
    event.dataEpoch === context.dataEpoch &&
    context.loadStatus === 'ready' &&
    context.canonicalKnowledge === 'known' &&
    context.canonical !== null &&
    isUuidV4(event.mutationId) &&
    isUuidV4(event.permissionCheckId) &&
    isUuidV4(event.activationId) &&
    isUuidV4(event.storageReservationId) &&
    new Set([
      event.mutationId,
      event.permissionCheckId,
      event.activationId,
      event.storageReservationId,
    ]).size === 4 &&
    areFreshCorrelationIds(context, [
      event.mutationId,
      event.permissionCheckId,
      event.activationId,
      event.storageReservationId,
    ]) &&
    !context.canonical.envelope.outcomes.some(
      (outcome) => outcome.mutationId === event.mutationId
    ) &&
    mutationCandidate(context, event) !== null
  );
}

function mutationDigest(
  dataEpoch: string,
  mutationId: string,
  baseRevision: number,
  baseGeneration: number,
  previousDigest: string,
  candidateDigest: string,
  origins: string[],
  baseCorrelationIds: string[]
): string {
  return settingsCommandDigest({
    dataEpoch,
    mutationId,
    baseRevision,
    baseGeneration,
    previousDigest,
    candidateDigest,
    originDigest: originDigest(origins),
    baseCorrelationIds,
  });
}

function outcomeFor(
  snapshot: SettingsSnapshotV1,
  mutation: SettingMutation
): SettingsMutationOutcomeV1 | null {
  return (
    snapshot.envelope.outcomes.find(
      (outcome) =>
        outcome.mutationId === mutation.mutationId &&
        outcome.commandDigest === mutation.commandDigest &&
        outcome.baseRevision === mutation.baseRevision &&
        outcome.baseGeneration === mutation.baseGeneration &&
        outcome.previousDigest === mutation.previousDigest &&
        outcome.candidateDigest === mutation.candidateDigest
    ) ?? null
  );
}

function parsedSnapshotForContext(
  context: SettingsPersistenceContext,
  snapshot: SettingsSnapshotV1,
  expectedDataEpoch = context.dataEpoch
): SettingsSnapshotV1 | null {
  return snapshot.dataEpoch === expectedDataEpoch ? snapshot : null;
}

function parsedSnapshotMatchingCommand(
  context: SettingsPersistenceContext,
  snapshot: SettingsSnapshotV1,
  requestId: string,
  expectedCommandId: string,
  expectedDataEpoch = context.dataEpoch
): SettingsSnapshotV1 | null {
  const parsed = parsedSnapshotForContext(context, snapshot, expectedDataEpoch);
  return parsed?.requestId === requestId && parsed.commandId === expectedCommandId ? parsed : null;
}

function snapshotMatchesCommand(
  context: SettingsPersistenceContext,
  snapshot: SettingsSnapshotV1,
  requestId: string,
  expectedCommandId: string,
  expectedDataEpoch = context.dataEpoch
): boolean {
  return (
    parsedSnapshotMatchingCommand(
      context,
      snapshot,
      requestId,
      expectedCommandId,
      expectedDataEpoch
    ) !== null
  );
}

function parsedActionSnapshot(
  context: SettingsPersistenceContext,
  snapshot: SettingsSnapshotV1
): SettingsSnapshotV1 | null {
  const resetEpoch =
    context.pendingReset?.stage === 'committed' ? context.pendingReset.nextDataEpoch : null;
  return (
    (resetEpoch ? parsedSnapshotForContext(context, snapshot, resetEpoch) : null) ??
    parsedSnapshotForContext(context, snapshot)
  );
}

const parsedEventError = (error: SettingsPersistenceError): SettingsPersistenceError => error;

function errorMatches(
  error: SettingsPersistenceError,
  allowedCodes: readonly SettingsErrorCode[],
  allowedOperations: readonly SettingsPersistenceError['operation'][]
): boolean {
  return allowedCodes.includes(error.code) && allowedOperations.includes(error.operation);
}

function currentLoadCommand(
  context: SettingsPersistenceContext
): Extract<SettingsPersistenceCommand, { type: 'RECOVER_AND_LOAD_SETTINGS' }> | null {
  const command = context.command;
  if (command?.type !== 'RECOVER_AND_LOAD_SETTINGS') {
    return null;
  }
  if (command.dataEpoch === context.dataEpoch) {
    return command;
  }
  return context.pendingReset?.stage === 'committed' &&
    command.dataEpoch === context.pendingReset.nextDataEpoch &&
    command.requestId === context.pendingReset.settingsBootstrapRequestId
    ? command
    : null;
}

const loadCommand = (
  dataEpoch: string,
  requestId: string,
  resetCorrelation: Extract<
    SettingsPersistenceCommand,
    { type: 'RECOVER_AND_LOAD_SETTINGS' }
  >['resetCorrelation'] = null
): SettingsPersistenceCommand => ({
  type: 'RECOVER_AND_LOAD_SETTINGS',
  commandId: commandId('load', requestId),
  dataEpoch,
  requestId,
  resetCorrelation,
});

const reservationCommand = (
  context: SettingsPersistenceContext,
  mutation: SettingMutation
): SettingsPersistenceCommand | null => {
  const byteProjection = context.canonical
    ? projectSettingsMutationBytes(context.canonical.envelope, mutation)
    : null;
  return byteProjection
    ? {
        type: 'RESERVE_SETTINGS_STORAGE',
        commandId: commandId('reserve', mutation.storageReservationId),
        dataEpoch: context.dataEpoch,
        mutationId: mutation.mutationId,
        commandDigest: mutation.commandDigest,
        baseRevision: mutation.baseRevision,
        baseGeneration: mutation.baseGeneration,
        previousDigest: mutation.previousDigest,
        candidateDigest: mutation.candidateDigest,
        correlationIds: [...mutation.correlationIds],
        reservationId: mutation.storageReservationId,
        byteProjection,
      }
    : null;
};

const permissionCommand = (
  context: SettingsPersistenceContext,
  mutation: SettingMutation
): SettingsPersistenceCommand | null =>
  mutation.storageReservationProof
    ? {
        type: 'VERIFY_SETTINGS_HOST_PERMISSIONS',
        commandId: commandId('permission_check', mutation.permissionCheckId),
        dataEpoch: context.dataEpoch,
        mutationId: mutation.mutationId,
        commandDigest: mutation.commandDigest,
        baseRevision: mutation.baseRevision,
        baseGeneration: mutation.baseGeneration,
        previousDigest: mutation.previousDigest,
        candidateDigest: mutation.candidateDigest,
        correlationIds: [...mutation.correlationIds],
        permissionCheckId: mutation.permissionCheckId,
        activationId: mutation.activationId,
        activationResultId: mutation.activationResultId,
        origins: [...mutation.requiredOrigins],
        originDigest: originDigest(mutation.requiredOrigins),
        storageReservationProof: { ...mutation.storageReservationProof },
      }
    : null;

const writeCommand = (
  context: SettingsPersistenceContext,
  mutation: SettingMutation
): SettingsPersistenceCommand | null =>
  mutation.storageReservationProof
    ? {
        type: 'COMPARE_AND_SETTLE_SETTINGS',
        commandId: commandId('write', mutation.mutationId),
        dataEpoch: context.dataEpoch,
        mutationId: mutation.mutationId,
        commandDigest: mutation.commandDigest,
        baseRevision: mutation.baseRevision,
        baseGeneration: mutation.baseGeneration,
        previousDigest: mutation.previousDigest,
        candidateDigest: mutation.candidateDigest,
        correlationIds: [...mutation.correlationIds],
        previousSettings: cloneSettings(mutation.previousSettings),
        candidateSettings: cloneSettings(mutation.candidateSettings),
        permissionProof: mutation.permissionProof
          ? {
              ...mutation.permissionProof,
              verifiedOrigins: [...mutation.permissionProof.verifiedOrigins],
            }
          : null,
        expectedAlarm: expectedAlarm(mutation.candidateSettings),
        storageReservationProof: { ...mutation.storageReservationProof },
      }
    : null;

const PENDING_PHASE_BY_COMMAND = {
  RESERVE_SETTINGS_STORAGE: 'reserving',
  VERIFY_SETTINGS_HOST_PERMISSIONS: 'permission_check',
  COMPARE_AND_SETTLE_SETTINGS: 'writing',
  RECOVER_SETTINGS_TRANSACTION: 'compensating',
  REBASE_SETTINGS_MUTATION: 'rebasing',
  ABORT_SETTINGS_MUTATION: 'cancelling',
  RECONCILE_SETTINGS: 'reconciling',
} as const satisfies Record<SettingsDeferredPersistenceCommand['type'], SettingsPendingIntentPhase>;

function pendingCommandRequestId(command: SettingsDeferredPersistenceCommand): string | null {
  return 'requestId' in command ? command.requestId : null;
}

function persistPendingIntentPatch(
  context: SettingsPersistenceContext,
  mutation: SettingMutation,
  deferredCommand: SettingsDeferredPersistenceCommand,
  retryIntent: RetryIntent | null = context.retryIntent
): Partial<SettingsPersistenceContext> {
  const priorRevision = context.pendingIntent?.intentRevision ?? 0;
  if (
    !Number.isSafeInteger(priorRevision) ||
    priorRevision < 0 ||
    priorRevision >= Number.MAX_SAFE_INTEGER - 1
  ) {
    const error = makeError(
      contractFor('SETTINGS_REVISION_EXHAUSTED'),
      'La révision du pending intent ne peut plus avancer de manière sûre.'
    );
    return {
      phase: 'failed',
      canonicalKnowledge: 'unknown',
      error,
      lastRejection: error,
      command: null,
    };
  }

  const pendingIntent = createSettingsPendingIntentV1({
    dataEpoch: context.dataEpoch,
    originWorkerEpoch: context.pendingIntent?.originWorkerEpoch ?? context.workerEpoch,
    intentRevision: priorRevision + 1,
    mutation,
    retryIntent,
    phase: PENDING_PHASE_BY_COMMAND[deferredCommand.type],
    nextCommandType: deferredCommand.type,
    nextCommandId: deferredCommand.commandId,
    requestId: pendingCommandRequestId(deferredCommand),
    terminalSettlement: null,
  });
  const deferredIdentity = deferredCommand.commandId.slice(
    deferredCommand.commandId.lastIndexOf('/') + 1
  );
  if (!isUuidV4(deferredIdentity)) {
    const error = makeError(
      contractFor('SETTINGS_PROTOCOL_ERROR'),
      "L'identité de la commande différée est invalide."
    );
    return {
      phase: 'failed',
      canonicalKnowledge: 'unknown',
      error,
      lastRejection: error,
      command: null,
    };
  }
  const persistCommandId = commandId('persist_intent', deferredIdentity);

  return {
    phase: 'persisting_intent',
    mutation: cloneSettingMutation(mutation),
    retryIntent: retryIntent ? { ...retryIntent } : null,
    pendingIntent,
    deferredCommand,
    pendingTerminalSettlement: null,
    pendingTerminalTarget: null,
    terminalSettlement: null,
    command: {
      type: 'PERSIST_SETTINGS_PENDING_INTENT',
      commandId: persistCommandId,
      dataEpoch: context.dataEpoch,
      storageArea: 'session',
      storageKey: SETTINGS_PENDING_INTENT_STORAGE_KEY,
      intentRevision: pendingIntent.intentRevision,
      intentDigest: pendingIntent.intentDigest,
      pendingIntent: cloneSettingsPendingIntentV1(pendingIntent),
    },
  };
}

function clearPendingIntentPatch(
  context: SettingsPersistenceContext,
  base: Partial<SettingsPersistenceContext>,
  target: NonNullable<SettingsPersistenceContext['pendingTerminalTarget']>,
  settlement: SettingsTerminalSettlementV1 | null
): Partial<SettingsPersistenceContext> {
  const pendingIntent = context.pendingIntent;
  const mutation = context.mutation;
  if (pendingIntent === null || mutation === null) {
    return base;
  }
  const clearId = settlement?.requestId ?? mutation.mutationId;
  return {
    ...base,
    phase: 'clearing_intent',
    pendingTerminalSettlement:
      settlement === null ? null : cloneSettingsTerminalSettlementV1(settlement),
    pendingTerminalTarget: target,
    terminalSettlement: null,
    deferredCommand: null,
    command: {
      type: 'CLEAR_SETTINGS_PENDING_INTENT',
      commandId: commandId('clear_intent', clearId),
      dataEpoch: context.dataEpoch,
      storageArea: 'session',
      storageKey: SETTINGS_PENDING_INTENT_STORAGE_KEY,
      mutationId: mutation.mutationId,
      originWorkerEpoch: pendingIntent.originWorkerEpoch,
      intentRevision: pendingIntent.intentRevision,
      intentDigest: pendingIntent.intentDigest,
    },
  };
}

function terminalSettlement(
  context: SettingsPersistenceContext,
  snapshot: SettingsSnapshotV1,
  requestId: string,
  commandIdValue: string,
  error: SettingsPersistenceError | null
): SettingsTerminalSettlementV1 | null {
  const mutation = context.mutation;
  const outcome = mutation ? outcomeFor(snapshot, mutation) : null;
  return mutation && outcome
    ? {
        version: 1,
        dataEpoch: context.dataEpoch,
        mutationId: mutation.mutationId,
        requestId,
        commandId: commandIdValue,
        outcome: { ...outcome, correlationIds: [...outcome.correlationIds] },
        error: error === null ? null : { ...error },
      }
    : null;
}

const withCorrelationIds = (mutation: SettingMutation, ...ids: string[]): SettingMutation => ({
  ...mutation,
  correlationIds: normalizeCorrelationIds([...mutation.correlationIds, ...ids]),
});

function mutationForEvent(
  context: SettingsPersistenceContext,
  event: Extract<SettingsPersistenceEvent, { type: 'SETTINGS_CAPTURED/MUTATE' }>
): SettingMutation | null {
  const candidateSettings = mutationCandidate(context, event);
  const canonical = context.canonical;
  if (!candidateSettings || !canonical) {
    return null;
  }

  const previousSettings = cloneSettings(canonical.envelope.settings);
  const origins = requiredOrigins(context, candidateSettings);
  const previousDigest = settingsDigest(previousSettings);
  const candidateDigest = settingsDigest(candidateSettings);
  const baseCorrelationIds = normalizeCorrelationIds([
    event.mutationId,
    event.permissionCheckId,
    event.activationId,
    event.activationResult.resultId,
    event.storageReservationId,
  ]);
  return {
    key: event.key,
    previousSettings,
    candidateSettings,
    previous: settingValue(previousSettings, event.key),
    candidate: settingValue(candidateSettings, event.key),
    previousDigest,
    candidateDigest,
    commandDigest: mutationDigest(
      context.dataEpoch,
      event.mutationId,
      canonical.envelope.revision,
      canonical.envelope.generation,
      previousDigest,
      candidateDigest,
      origins,
      baseCorrelationIds
    ),
    correlationIds: baseCorrelationIds,
    mutationId: event.mutationId,
    permissionCheckId: event.permissionCheckId,
    activationId: event.activationId,
    activationResultId: event.activationResult.resultId,
    requiredOrigins: origins,
    baseRevision: canonical.envelope.revision,
    baseGeneration: canonical.envelope.generation,
    permissionProof: null,
    storageReservationId: event.storageReservationId,
    storageReservationProof: null,
  };
}

function beginMutation(
  context: SettingsPersistenceContext,
  event: Extract<SettingsPersistenceEvent, { type: 'SETTINGS_CAPTURED/MUTATE' }>
): Partial<SettingsPersistenceContext> {
  const mutation = mutationForEvent(context, event);
  if (!mutation) {
    return {};
  }

  const reserve = reservationCommand(context, mutation);
  if (reserve === null || reserve.type !== 'RESERVE_SETTINGS_STORAGE') {
    return {};
  }

  return {
    projected: cloneSettings(mutation.candidateSettings),
    mutationOutcome: 'unknown',
    canonicalRelation: 'previous',
    error: null,
    runtimeEffectError: null,
    lastRejection: null,
    ...persistPendingIntentPatch(context, mutation, reserve, null),
  };
}

function reconcilePatch(
  context: SettingsPersistenceContext,
  requestId: string,
  reason: ReconcileReason,
  error: SettingsPersistenceError
): Partial<SettingsPersistenceContext> {
  if (!context.mutation) {
    return {};
  }
  const retryCorrelationIds = context.retryIntent
    ? [
        context.retryIntent.mutationId,
        context.retryIntent.permissionCheckId,
        context.retryIntent.activationId,
        context.retryIntent.activationResultId,
        context.retryIntent.storageReservationId,
        context.retryIntent.requestId,
      ]
    : [];
  const mutation = withCorrelationIds(context.mutation, ...retryCorrelationIds, requestId);
  const reconcileCommand: SettingsDeferredPersistenceCommand = {
    type: 'RECONCILE_SETTINGS',
    commandId: commandId('reconcile', requestId),
    dataEpoch: context.dataEpoch,
    requestId,
    mutationId: mutation.mutationId,
    commandDigest: mutation.commandDigest,
    baseRevision: mutation.baseRevision,
    baseGeneration: mutation.baseGeneration,
    previousDigest: mutation.previousDigest,
    candidateDigest: mutation.candidateDigest,
    correlationIds: [...mutation.correlationIds],
    storageReservationProof: mutation.storageReservationProof
      ? { ...mutation.storageReservationProof }
      : null,
    reason,
  };

  return {
    canonicalKnowledge: 'unknown',
    reconcileRequestId: requestId,
    reconcileReason: reason,
    retryIntent: null,
    error,
    ...persistPendingIntentPatch(context, mutation, reconcileCommand, null),
  };
}

function relationToMutation(
  snapshot: SettingsSnapshotV1,
  mutation: SettingMutation
): CanonicalRelation {
  const digest = settingsDigest(snapshot.envelope.settings);
  if (digest === mutation.candidateDigest) {
    return 'candidate';
  }
  if (digest === mutation.previousDigest) {
    return 'previous';
  }
  return 'other';
}

function adoptSnapshot(
  context: SettingsPersistenceContext,
  snapshot: SettingsSnapshotV1
): Partial<SettingsPersistenceContext> {
  const canonical = cloneSettingsSnapshot(snapshot);
  return {
    canonical,
    projected: cloneSettings(canonical.envelope.settings),
    canonicalKnowledge: 'known',
    canonicalRelation: context.mutation
      ? relationToMutation(canonical, context.mutation)
      : 'unknown',
    lastRejection: null,
  };
}

function terminalFailure(
  context: SettingsPersistenceContext,
  snapshot: SettingsSnapshotV1,
  outcome: SettingsMutationOutcomeV1 | null
): Partial<SettingsPersistenceContext> {
  const mutation = context.mutation;
  if (!mutation) {
    return {};
  }

  const relation = relationToMutation(snapshot, mutation);
  const outcomeKnowledge: MutationOutcomeKnowledge =
    outcome?.outcome === 'committed' ? 'candidate' : outcome ? 'previous' : 'unknown';
  const code: SettingsErrorCode = !outcome
    ? 'SETTINGS_OUTCOME_MISSING'
    : relation === 'other' || (outcome.outcome === 'committed' && relation !== 'candidate')
      ? 'SETTINGS_SUPERSEDED'
      : 'SETTINGS_NOT_COMMITTED';
  const terminalError =
    outcome?.outcome === 'compensated' && context.runtimeEffectError
      ? makeError(
          contractFor('SETTINGS_RUNTIME_EFFECT_FAILED', 'previous'),
          context.runtimeEffectError.message
        )
      : code === 'SETTINGS_OUTCOME_MISSING'
        ? makeError(
            contractFor('SETTINGS_OUTCOME_MISSING'),
            'Le recovery n’a pas produit la preuve causale durable attendue.'
          )
        : context.error?.recoverable === false
          ? context.error
          : makeError(
              contractFor(code, outcomeKnowledge),
              code === 'SETTINGS_SUPERSEDED'
                ? 'Une révision canonique ultérieure a remplacé cette tentative.'
                : 'La mutation n’a pas été validée comme commit canonique.'
            );

  return {
    ...adoptSnapshot(context, snapshot),
    phase: 'failed',
    mutationOutcome: outcomeKnowledge,
    canonicalRelation: relation,
    reconcileRequestId: null,
    reconcileReason: null,
    retryIntent: null,
    runtimeEffectError: null,
    error: terminalError,
    command: null,
  };
}

function retryBase(
  context: SettingsPersistenceContext,
  event: Extract<SettingsPersistenceEvent, { type: 'SETTINGS_CAPTURED/RETRY_READY' }>
): { candidate: AppSettings; snapshot: SettingsSnapshotV1 } | null {
  const command = currentCommandOfType(context, 'REBASE_SETTINGS_MUTATION');
  const snapshot = parsedSnapshotMatchingCommand(
    context,
    event.snapshot,
    event.requestId,
    event.commandId
  );
  if (
    !context.mutation ||
    !context.retryIntent ||
    command === null ||
    context.retryIntent.requestId !== event.requestId ||
    context.retryIntent.mutationId !== event.mutationId ||
    command.requestId !== event.requestId ||
    command.mutationId !== event.mutationId ||
    event.commandId !== command.commandId ||
    snapshot === null ||
    snapshot.envelope.outcomes.some(
      (outcome) => outcome.mutationId === context.retryIntent?.mutationId
    )
  ) {
    return null;
  }

  const candidate = patchSettings(
    snapshot.envelope.settings,
    context.mutation.key,
    context.mutation.candidate,
    context.includedConnectorIds
  );
  return candidate ? { candidate, snapshot } : null;
}

function buildRetryMutation(
  context: SettingsPersistenceContext,
  base: { candidate: AppSettings; snapshot: SettingsSnapshotV1 },
  origins: string[]
): SettingMutation | null {
  const failedMutation = context.mutation;
  const retryIntent = context.retryIntent;
  if (!failedMutation || !retryIntent) {
    return null;
  }

  const previousSettings = cloneSettings(base.snapshot.envelope.settings);
  const candidateSettings = cloneSettings(base.candidate);
  const previousDigest = settingsDigest(previousSettings);
  const candidateDigest = settingsDigest(candidateSettings);
  const baseRevision = base.snapshot.envelope.revision;
  const baseGeneration = base.snapshot.envelope.generation;
  const baseCorrelationIds = normalizeCorrelationIds([
    retryIntent.failedMutationId,
    retryIntent.mutationId,
    retryIntent.permissionCheckId,
    retryIntent.activationId,
    retryIntent.activationResultId,
    retryIntent.storageReservationId,
    retryIntent.requestId,
  ]);
  return {
    key: failedMutation.key,
    previousSettings,
    candidateSettings,
    previous: settingValue(previousSettings, failedMutation.key),
    candidate: settingValue(candidateSettings, failedMutation.key),
    previousDigest,
    candidateDigest,
    commandDigest: mutationDigest(
      context.dataEpoch,
      retryIntent.mutationId,
      baseRevision,
      baseGeneration,
      previousDigest,
      candidateDigest,
      origins,
      baseCorrelationIds
    ),
    correlationIds: baseCorrelationIds,
    mutationId: retryIntent.mutationId,
    permissionCheckId: retryIntent.permissionCheckId,
    activationId: retryIntent.activationId,
    activationResultId: retryIntent.activationResultId,
    requiredOrigins: [...origins],
    baseRevision,
    baseGeneration,
    permissionProof: null,
    storageReservationId: retryIntent.storageReservationId,
    storageReservationProof: null,
  };
}

function retryIsNoOp(
  context: SettingsPersistenceContext,
  event: Extract<SettingsPersistenceEvent, { type: 'SETTINGS_CAPTURED/RETRY_READY' }>
): boolean {
  const base = retryBase(context, event);
  return base !== null && sameSettings(base.candidate, base.snapshot.envelope.settings);
}

function retryMutation(
  context: SettingsPersistenceContext,
  event: Extract<SettingsPersistenceEvent, { type: 'SETTINGS_CAPTURED/RETRY_READY' }>
): SettingMutation | null {
  const base = retryBase(context, event);
  if (!base) {
    return null;
  }
  const origins = requiredOrigins({ ...context, canonical: base.snapshot }, base.candidate);
  return buildRetryMutation(context, base, origins);
}

type ResetReadyEvent = Extract<
  SettingsPersistenceEvent,
  { type: 'SETTINGS_CAPTURED/RESET_EPOCH_READY_TO_COMMIT' }
>;
type ResetCommittedEvent = Extract<
  SettingsPersistenceEvent,
  { type: 'SETTINGS_CAPTURED/RESET_EPOCH_COMMITTED' }
>;

function normalizedResetPayloadForEvent(
  event: ResetReadyEvent | ResetCommittedEvent
): LocalDataResetEpochEventV1 | null {
  const expectedStage =
    event.type === 'SETTINGS_CAPTURED/RESET_EPOCH_READY_TO_COMMIT'
      ? 'ready_to_commit'
      : 'committed';
  return event.payload.stage === expectedStage ? event.payload : null;
}

function pendingResetMatches(
  pending: SettingsPersistenceContext['pendingReset'],
  payload: LocalDataResetEpochEventV1
): boolean {
  return (
    pending !== null &&
    pending.version === payload.version &&
    pending.resetId === payload.resetId &&
    pending.previousDataEpoch === payload.previousDataEpoch &&
    pending.nextDataEpoch === payload.nextDataEpoch &&
    pending.settingsBootstrapRequestId === payload.settingsBootstrapRequestId
  );
}

function persistedIntentTargets(
  context: SettingsPersistenceContext,
  event: SettingsPersistenceEvent,
  commandType: SettingsDeferredPersistenceCommand['type']
): boolean {
  return (
    event.type === 'SETTINGS_CAPTURED/SETTINGS_PENDING_INTENT_PERSISTED' &&
    context.command?.type === 'PERSIST_SETTINGS_PENDING_INTENT' &&
    context.pendingIntent !== null &&
    context.deferredCommand?.type === commandType &&
    event.dataEpoch === context.dataEpoch &&
    event.mutationId === context.pendingIntent.mutation.mutationId &&
    event.commandId === context.command.commandId
  );
}

function clearedIntentTargets(
  context: SettingsPersistenceContext,
  event: SettingsPersistenceEvent,
  target: NonNullable<SettingsPersistenceContext['pendingTerminalTarget']>
): boolean {
  return (
    event.type === 'SETTINGS_CAPTURED/SETTINGS_PENDING_INTENT_CLEARED' &&
    context.command?.type === 'CLEAR_SETTINGS_PENDING_INTENT' &&
    context.pendingIntent !== null &&
    context.pendingTerminalTarget === target &&
    event.dataEpoch === context.dataEpoch &&
    event.mutationId === context.pendingIntent.mutation.mutationId &&
    event.commandId === context.command.commandId
  );
}

function clearCurrentPendingIntentForReset(
  context: SettingsPersistenceContext,
  pendingReset: LocalDataResetEpochEventV1,
  target: 'reset_pending' | 'reset_loading'
): Partial<SettingsPersistenceContext> {
  if (context.pendingIntent === null || context.mutation === null) {
    return {};
  }
  return clearPendingIntentPatch(
    context,
    {
      loadStatus: target === 'reset_pending' ? 'reset_pending' : 'loading',
      projected: cloneSettings(context.defaultSettings),
      canonicalKnowledge: 'unknown',
      canonicalRelation: 'unknown',
      retryIntent: null,
      pendingReset: { ...pendingReset },
      reconcileRequestId: null,
      reconcileReason: null,
      runtimeEffectError: null,
      error: null,
      lastRejection: null,
    },
    target,
    null
  );
}

function coldStartReconcilePatch(
  context: SettingsPersistenceContext
): Partial<SettingsPersistenceContext> {
  const seed = context.coldStartSeed;
  if (seed === null) {
    return {};
  }
  const mutation = withCorrelationIds(
    {
      ...seed.pendingIntent.mutation,
      storageReservationProof: null,
    },
    seed.recoveryRequestId
  );
  const reconcileCommand: SettingsDeferredPersistenceCommand = {
    type: 'RECONCILE_SETTINGS',
    commandId: commandId('reconcile', seed.recoveryRequestId),
    dataEpoch: context.dataEpoch,
    requestId: seed.recoveryRequestId,
    mutationId: mutation.mutationId,
    commandDigest: mutation.commandDigest,
    baseRevision: mutation.baseRevision,
    baseGeneration: mutation.baseGeneration,
    previousDigest: mutation.previousDigest,
    candidateDigest: mutation.candidateDigest,
    correlationIds: [...mutation.correlationIds],
    storageReservationProof: null,
    reason: 'worker_restart',
  };
  const durableRotation = persistPendingIntentPatch(context, mutation, reconcileCommand, null);
  return {
    loadStatus: 'ready',
    canonical: null,
    projected: cloneSettings(seed.envelope.settings),
    mutationOutcome: 'unknown',
    canonicalKnowledge: 'unknown',
    canonicalRelation: 'unknown',
    reconcileRequestId: seed.recoveryRequestId,
    reconcileReason: 'worker_restart',
    runtimeEffectError: null,
    error: makeError(
      contractFor('SETTINGS_WORKER_RESTARTED'),
      'Un pending intent durable exige une réconciliation après cold start.'
    ),
    ...durableRotation,
  };
}

/** Internal statechart factory; runtime consumers use the controller façade. */
export function createSettingsPersistenceSetup(
  isAdmittedEvent: (event: SettingsPersistenceEvent) => boolean
) {
  return setup({
    types: {
      context: {} as SettingsPersistenceContext,
      events: {} as SettingsPersistenceEvent,
      input: {} as SettingsPersistenceInput,
    },
    guards: {
      admittedEvent: ({ event }) => isAdmittedEvent(event),
      validInput: ({ context }) => inputIsValid(context),
      validColdStart: ({ context }) =>
        inputIsValid(context) &&
        context.coldStartSeed !== null &&
        context.coldStartSeed.pendingIntent.intentRevision < Number.MAX_SAFE_INTEGER - 1,
      exhaustedColdStart: ({ context }) =>
        inputIsValid(context) &&
        context.coldStartSeed !== null &&
        context.coldStartSeed.pendingIntent.intentRevision >= Number.MAX_SAFE_INTEGER - 1,
      handledActivationReplay: ({ context, event }) =>
        event.type === 'SETTINGS_CAPTURED/MUTATE' &&
        event.dataEpoch === context.dataEpoch &&
        activationAlreadyHandled(context, event),
      activationCapacityExhausted: ({ context, event }) =>
        event.type === 'SETTINGS_CAPTURED/MUTATE' &&
        event.dataEpoch === context.dataEpoch &&
        !activationAlreadyHandled(context, event) &&
        !canRecordActivation(context),
      activationRejected: ({ context, event }) =>
        event.type === 'SETTINGS_CAPTURED/MUTATE' &&
        event.dataEpoch === context.dataEpoch &&
        context.loadStatus === 'ready' &&
        context.canonicalKnowledge === 'known' &&
        !activationAlreadyHandled(context, event) &&
        canRecordActivation(context) &&
        event.activationResult.kind === 'SETTINGS_ACTIVATION_REJECTED',
      handledRetryActivationReplay: ({ context, event }) =>
        event.type === 'SETTINGS_CAPTURED/RETRY' &&
        event.dataEpoch === context.dataEpoch &&
        activationAlreadyHandled(context, event),
      retryActivationCapacityExhausted: ({ context, event }) =>
        event.type === 'SETTINGS_CAPTURED/RETRY' &&
        event.dataEpoch === context.dataEpoch &&
        !activationAlreadyHandled(context, event) &&
        !canRecordActivation(context),
      retryActivationRejected: ({ context, event }) =>
        event.type === 'SETTINGS_CAPTURED/RETRY' &&
        event.dataEpoch === context.dataEpoch &&
        !activationAlreadyHandled(context, event) &&
        canRecordActivation(context) &&
        event.activationResult.kind === 'SETTINGS_ACTIVATION_REJECTED',
      verifiedRetryActivation: ({ context, event }) =>
        event.type === 'SETTINGS_CAPTURED/RETRY' &&
        event.dataEpoch === context.dataEpoch &&
        verifiedActivationAttempt(context, event),
      persistedToReserving: ({ context, event }) =>
        persistedIntentTargets(context, event, 'RESERVE_SETTINGS_STORAGE'),
      persistedToPermissionCheck: ({ context, event }) =>
        persistedIntentTargets(context, event, 'VERIFY_SETTINGS_HOST_PERMISSIONS'),
      persistedToWriting: ({ context, event }) =>
        persistedIntentTargets(context, event, 'COMPARE_AND_SETTLE_SETTINGS'),
      persistedToCompensating: ({ context, event }) =>
        persistedIntentTargets(context, event, 'RECOVER_SETTINGS_TRANSACTION'),
      persistedToRebasing: ({ context, event }) =>
        persistedIntentTargets(context, event, 'REBASE_SETTINGS_MUTATION'),
      persistedToCancelling: ({ context, event }) =>
        persistedIntentTargets(context, event, 'ABORT_SETTINGS_MUTATION'),
      persistedToReconciling: ({ context, event }) =>
        persistedIntentTargets(context, event, 'RECONCILE_SETTINGS'),
      pendingIntentPersistFailed: ({ context, event }) =>
        event.type === 'SETTINGS_CAPTURED/SETTINGS_PENDING_INTENT_PERSIST_FAILED' &&
        context.command?.type === 'PERSIST_SETTINGS_PENDING_INTENT' &&
        context.command.intentRevision === 1 &&
        event.dataEpoch === context.dataEpoch &&
        event.mutationId === context.command.pendingIntent.mutation.mutationId &&
        event.commandId === context.command.commandId &&
        errorMatches(event.error, ['SETTINGS_STORAGE_FAILED'], ['pending_intent']),
      pendingIntentPersistUnknown: ({ context, event }) =>
        event.type === 'SETTINGS_CAPTURED/SETTINGS_PENDING_INTENT_PERSIST_OUTCOME_UNKNOWN' &&
        context.command?.type === 'PERSIST_SETTINGS_PENDING_INTENT' &&
        event.dataEpoch === context.dataEpoch &&
        event.mutationId === context.command.pendingIntent.mutation.mutationId &&
        event.commandId === context.command.commandId &&
        errorMatches(event.error, ['SETTINGS_TRANSPORT_ERROR'], ['pending_intent']),
      clearedToSaved: ({ context, event }) => clearedIntentTargets(context, event, 'saved'),
      clearedToFailed: ({ context, event }) => clearedIntentTargets(context, event, 'failed'),
      clearedToResetPending: ({ context, event }) =>
        clearedIntentTargets(context, event, 'reset_pending'),
      clearedToResetLoading: ({ context, event }) =>
        clearedIntentTargets(context, event, 'reset_loading'),
      pendingIntentClearUnknown: ({ context, event }) =>
        event.type === 'SETTINGS_CAPTURED/SETTINGS_PENDING_INTENT_CLEAR_OUTCOME_UNKNOWN' &&
        context.command?.type === 'CLEAR_SETTINGS_PENDING_INTENT' &&
        event.dataEpoch === context.dataEpoch &&
        event.mutationId === context.command.mutationId &&
        event.commandId === context.command.commandId &&
        errorMatches(event.error, ['SETTINGS_TRANSPORT_ERROR'], ['pending_intent']),
      validLoadRequest: ({ context, event }) =>
        event.type === 'SETTINGS_CAPTURED/LOAD' &&
        context.pendingReset?.stage !== 'committed' &&
        event.dataEpoch === context.dataEpoch &&
        areFreshCorrelationIds(context, [event.requestId]),
      validLoad: ({ context, event }) => {
        if (event.type !== 'SETTINGS_CAPTURED/LOAD_SUCCEEDED') {
          return false;
        }
        const command = currentLoadCommand(context);
        return (
          command !== null &&
          event.dataEpoch === command.dataEpoch &&
          command.requestId === context.loadRequestId &&
          event.requestId === command.requestId &&
          event.commandId === command.commandId &&
          snapshotMatchesCommand(
            context,
            event.snapshot,
            event.requestId,
            event.commandId,
            command.dataEpoch
          )
        );
      },
      resetLoadProtocolFailure: ({ context, event }) => {
        if (
          event.type !== 'SETTINGS_CAPTURED/LOAD_FAILED' ||
          context.pendingReset?.stage !== 'committed'
        ) {
          return false;
        }
        const command = currentLoadCommand(context);
        return (
          command !== null &&
          event.dataEpoch === command.dataEpoch &&
          event.requestId === command.requestId &&
          event.commandId === command.commandId &&
          errorMatches(event.error, ['SETTINGS_RESET_IN_PROGRESS'], ['load'])
        );
      },
      failedLoad: ({ context, event }) => {
        if (event.type !== 'SETTINGS_CAPTURED/LOAD_FAILED') {
          return false;
        }
        const command = currentLoadCommand(context);
        const validError = errorMatches(
          event.error,
          [
            'SETTINGS_LOAD_FAILED',
            'SETTINGS_INVALID',
            'SETTINGS_STORAGE_FAILED',
            'SETTINGS_TRANSPORT_ERROR',
            'SETTINGS_PROTOCOL_ERROR',
            'SETTINGS_RESET_IN_PROGRESS',
          ],
          ['load']
        );
        return (
          command !== null &&
          event.dataEpoch === command.dataEpoch &&
          command.requestId === context.loadRequestId &&
          event.requestId === command.requestId &&
          event.commandId === command.commandId &&
          validError &&
          !(
            context.pendingReset?.stage === 'committed' &&
            event.error.code === 'SETTINGS_RESET_IN_PROGRESS'
          )
        );
      },
      noOp: ({ context, event }) => {
        if (
          event.type !== 'SETTINGS_CAPTURED/MUTATE' ||
          !validMutationRequest(context, event) ||
          context.canonical === null
        ) {
          return false;
        }
        const candidate = mutationCandidate(context, event);
        return candidate !== null && sameSettings(candidate, canonicalSettings(context));
      },
      revisionExhausted: ({ context, event }) =>
        event.type === 'SETTINGS_CAPTURED/MUTATE' &&
        validMutationRequest(context, event) &&
        context.canonical !== null &&
        !settingsRevisionHasMutationCapacity(context.canonical.envelope.revision),
      generationExhausted: ({ context, event }) =>
        event.type === 'SETTINGS_CAPTURED/MUTATE' &&
        validMutationRequest(context, event) &&
        context.canonical !== null &&
        !settingsGenerationHasMutationCapacity(context.canonical.envelope.generation),
      validMutation: ({ context, event }) => {
        if (
          event.type !== 'SETTINGS_CAPTURED/MUTATE' ||
          !validMutationRequest(context, event) ||
          !context.canonical
        ) {
          return false;
        }
        const mutation = mutationForEvent(context, event);
        return (
          mutation !== null && hasSettingsMutationHeadroom(context.canonical.envelope, mutation)
        );
      },
      invalidVerifiedMutation: ({ context, event }) =>
        event.type === 'SETTINGS_CAPTURED/MUTATE' &&
        event.dataEpoch === context.dataEpoch &&
        context.loadStatus === 'ready' &&
        context.canonicalKnowledge === 'known' &&
        verifiedActivationAttempt(context, event) &&
        !validMutationRequest(context, event),
      ledgerFull: ({ context, event }) => {
        if (
          event.type !== 'SETTINGS_CAPTURED/MUTATE' ||
          !validMutationRequest(context, event) ||
          !context.canonical
        ) {
          return false;
        }
        const mutation = mutationForEvent(context, event);
        return (
          mutation !== null &&
          settingsRevisionHasMutationCapacity(context.canonical.envelope.revision) &&
          settingsGenerationHasMutationCapacity(context.canonical.envelope.generation) &&
          !hasSettingsMutationHeadroom(context.canonical.envelope, mutation)
        );
      },
      reservationGrantedNeedsPermission: ({ context, event }) => {
        if (event.type !== 'SETTINGS_CAPTURED/STORAGE_RESERVATION_GRANTED' || !context.mutation) {
          return false;
        }
        const command = currentCommandOfType(context, 'RESERVE_SETTINGS_STORAGE');
        return (
          command !== null &&
          event.dataEpoch === context.dataEpoch &&
          event.mutationId === context.mutation.mutationId &&
          event.commandId === command.commandId &&
          commandMatchesMutation(command, context.mutation) &&
          context.mutation.requiredOrigins.length > 0
        );
      },
      reservationGrantedReadyToWrite: ({ context, event }) => {
        if (event.type !== 'SETTINGS_CAPTURED/STORAGE_RESERVATION_GRANTED' || !context.mutation) {
          return false;
        }
        const command = currentCommandOfType(context, 'RESERVE_SETTINGS_STORAGE');
        return (
          command !== null &&
          event.dataEpoch === context.dataEpoch &&
          event.mutationId === context.mutation.mutationId &&
          event.commandId === command.commandId &&
          commandMatchesMutation(command, context.mutation) &&
          context.mutation.requiredOrigins.length === 0
        );
      },
      reservationDenied: ({ context, event }) => {
        if (event.type !== 'SETTINGS_CAPTURED/STORAGE_RESERVATION_DENIED' || !context.mutation) {
          return false;
        }
        const command = currentCommandOfType(context, 'RESERVE_SETTINGS_STORAGE');
        return (
          command !== null &&
          event.dataEpoch === context.dataEpoch &&
          event.mutationId === context.mutation.mutationId &&
          event.commandId === command.commandId &&
          commandMatchesMutation(command, context.mutation) &&
          errorMatches(event.error, ['SETTINGS_GLOBAL_STORAGE_QUOTA_EXHAUSTED'], ['mutate'])
        );
      },
      hostPermissionsVerified: ({ context, event }) => {
        if (event.type !== 'SETTINGS_CAPTURED/HOST_PERMISSIONS_VERIFIED' || !context.mutation) {
          return false;
        }
        const command = currentCommandOfType(context, 'VERIFY_SETTINGS_HOST_PERMISSIONS');
        return (
          event.dataEpoch === context.dataEpoch &&
          command !== null &&
          commandMatchesMutation(command, context.mutation) &&
          command.permissionCheckId === context.mutation.permissionCheckId &&
          command.activationId === context.mutation.activationId &&
          event.mutationId === command.mutationId &&
          event.commandId === command.commandId
        );
      },
      hostPermissionsMissing: ({ context, event }) => {
        if (event.type !== 'SETTINGS_CAPTURED/HOST_PERMISSIONS_MISSING' || !context.mutation) {
          return false;
        }
        const command = currentCommandOfType(context, 'VERIFY_SETTINGS_HOST_PERMISSIONS');
        const snapshot =
          command === null
            ? null
            : parsedSnapshotMatchingCommand(
                context,
                event.snapshot,
                command.permissionCheckId,
                command.commandId
              );
        const outcome = snapshot ? outcomeFor(snapshot, context.mutation) : null;
        return (
          event.dataEpoch === context.dataEpoch &&
          command !== null &&
          commandMatchesMutation(command, context.mutation) &&
          event.mutationId === command.mutationId &&
          event.commandId === command.commandId &&
          snapshot !== null &&
          errorMatches(event.error, ['SETTINGS_HOST_PERMISSION_MISSING'], ['permission_check']) &&
          outcome?.outcome === 'not_committed' &&
          outcome.correlationIds.includes(command.permissionCheckId)
        );
      },
      hostPermissionsUnknown: ({ context, event }) => {
        if (
          event.type !== 'SETTINGS_CAPTURED/HOST_PERMISSIONS_OUTCOME_UNKNOWN' ||
          !context.mutation
        ) {
          return false;
        }
        const command = currentCommandOfType(context, 'VERIFY_SETTINGS_HOST_PERMISSIONS');
        return (
          event.dataEpoch === context.dataEpoch &&
          command !== null &&
          commandMatchesMutation(command, context.mutation) &&
          event.mutationId === command.mutationId &&
          event.commandId === command.commandId &&
          areFreshCorrelationIds(context, [event.nextRequestId]) &&
          canAppendCorrelationIds(context.mutation, event.nextRequestId) &&
          errorMatches(
            event.error,
            ['SETTINGS_CONFLICT', 'SETTINGS_TRANSPORT_ERROR', 'SETTINGS_STORAGE_FAILED'],
            ['permission_check']
          )
        );
      },
      saveSucceeded: ({ context, event }) => {
        if (event.type !== 'SETTINGS_CAPTURED/SAVE_SUCCEEDED' || !context.mutation) {
          return false;
        }
        const command = currentCommandOfType(context, 'COMPARE_AND_SETTLE_SETTINGS');
        const snapshot = parsedSnapshotMatchingCommand(
          context,
          event.snapshot,
          event.mutationId,
          event.commandId
        );
        const outcome = snapshot ? outcomeFor(snapshot, context.mutation) : null;
        return (
          event.dataEpoch === context.dataEpoch &&
          command !== null &&
          commandMatchesMutation(command, context.mutation) &&
          event.mutationId === command.mutationId &&
          event.commandId === command.commandId &&
          snapshot !== null &&
          outcome?.outcome === 'committed' &&
          outcome.correlationIds.includes(event.mutationId) &&
          settingsDigest(snapshot.envelope.settings) === context.mutation.candidateDigest
        );
      },
      saveFailed: ({ context, event }) => {
        if (event.type !== 'SETTINGS_CAPTURED/SAVE_FAILED' || !context.mutation) {
          return false;
        }
        const command = currentCommandOfType(context, 'COMPARE_AND_SETTLE_SETTINGS');
        return (
          event.dataEpoch === context.dataEpoch &&
          command !== null &&
          commandMatchesMutation(command, context.mutation) &&
          event.mutationId === command.mutationId &&
          event.commandId === command.commandId &&
          areFreshCorrelationIds(context, [event.nextRequestId]) &&
          canAppendCorrelationIds(context.mutation, event.nextRequestId) &&
          errorMatches(
            event.error,
            [
              'SETTINGS_CONFLICT',
              'SETTINGS_STORAGE_FAILED',
              'SETTINGS_TRANSPORT_ERROR',
              'SETTINGS_GENERATION_EXHAUSTED',
              'SETTINGS_REVISION_EXHAUSTED',
            ],
            ['save']
          )
        );
      },
      effectFailed: ({ context, event }) => {
        if (
          event.type !== 'SETTINGS_CAPTURED/RUNTIME_EFFECT_FAILED' ||
          !context.mutation?.storageReservationProof
        ) {
          return false;
        }
        const command = currentCommandOfType(context, 'COMPARE_AND_SETTLE_SETTINGS');
        return (
          event.dataEpoch === context.dataEpoch &&
          command !== null &&
          commandMatchesMutation(command, context.mutation) &&
          event.mutationId === command.mutationId &&
          event.commandId === command.commandId &&
          areFreshCorrelationIds(context, [event.recoveryRequestId]) &&
          canAppendCorrelationIds(context.mutation, event.recoveryRequestId) &&
          errorMatches(event.error, ['SETTINGS_RUNTIME_EFFECT_FAILED'], ['effect'])
        );
      },
      compensationSucceeded: ({ context, event }) => {
        if (event.type !== 'SETTINGS_CAPTURED/COMPENSATION_SUCCEEDED' || !context.mutation) {
          return false;
        }
        const command = currentCommandOfType(context, 'RECOVER_SETTINGS_TRANSACTION');
        const snapshot = parsedSnapshotMatchingCommand(
          context,
          event.snapshot,
          event.requestId,
          event.commandId
        );
        const outcome = snapshot ? outcomeFor(snapshot, context.mutation) : null;
        return (
          event.dataEpoch === context.dataEpoch &&
          command !== null &&
          commandMatchesMutation(command, context.mutation) &&
          event.mutationId === command.mutationId &&
          event.requestId === command.requestId &&
          event.commandId === command.commandId &&
          snapshot !== null &&
          outcome?.outcome === 'compensated' &&
          outcome.correlationIds.includes(event.requestId)
        );
      },
      compensationFailed: ({ context, event }) => {
        if (event.type !== 'SETTINGS_CAPTURED/COMPENSATION_FAILED' || !context.mutation) {
          return false;
        }
        const command = currentCommandOfType(context, 'RECOVER_SETTINGS_TRANSACTION');
        return (
          event.dataEpoch === context.dataEpoch &&
          command !== null &&
          commandMatchesMutation(command, context.mutation) &&
          event.mutationId === command.mutationId &&
          event.requestId === command.requestId &&
          event.commandId === command.commandId &&
          areFreshCorrelationIds(context, [event.nextRequestId]) &&
          canAppendCorrelationIds(context.mutation, event.nextRequestId) &&
          errorMatches(
            event.error,
            ['SETTINGS_COMPENSATION_FAILED', 'SETTINGS_STORAGE_FAILED', 'SETTINGS_TRANSPORT_ERROR'],
            ['compensate']
          )
        );
      },
      validRetry: ({ context, event }) =>
        event.type === 'SETTINGS_CAPTURED/RETRY' &&
        event.dataEpoch === context.dataEpoch &&
        verifiedActivationAttempt(context, event) &&
        context.canonicalKnowledge === 'known' &&
        context.mutation?.mutationId === event.failedMutationId &&
        context.error?.recoverable === true &&
        areFreshCorrelationIds(context, [
          event.mutationId,
          event.permissionCheckId,
          event.activationId,
          event.activationResult.resultId,
          event.storageReservationId,
          event.requestId,
        ]) &&
        canAppendCorrelationIds(
          context.mutation,
          event.mutationId,
          event.permissionCheckId,
          event.activationId,
          event.activationResult.resultId,
          event.storageReservationId,
          event.requestId
        ) &&
        context.canonical !== null &&
        !context.canonical.envelope.outcomes.some(
          (outcome) => outcome.mutationId === event.mutationId
        ) &&
        new Set([
          event.mutationId,
          event.permissionCheckId,
          event.activationId,
          event.activationResult.resultId,
          event.storageReservationId,
          event.requestId,
          event.failedMutationId,
        ]).size === 7,
      retryNoOp: ({ context, event }) => {
        if (
          event.type !== 'SETTINGS_CAPTURED/RETRY_READY' ||
          event.dataEpoch !== context.dataEpoch
        ) {
          return false;
        }
        const command = currentCommandOfType(context, 'REBASE_SETTINGS_MUTATION');
        return (
          command !== null &&
          command.mutationId === event.mutationId &&
          command.requestId === event.requestId &&
          command.commandId === event.commandId &&
          retryIsNoOp(context, event)
        );
      },
      retryRevisionExhausted: ({ context, event }) => {
        if (
          event.type !== 'SETTINGS_CAPTURED/RETRY_READY' ||
          event.dataEpoch !== context.dataEpoch
        ) {
          return false;
        }
        const mutation = retryMutation(context, event);
        return mutation !== null && !settingsRevisionHasMutationCapacity(mutation.baseRevision);
      },
      retryGenerationExhausted: ({ context, event }) => {
        if (
          event.type !== 'SETTINGS_CAPTURED/RETRY_READY' ||
          event.dataEpoch !== context.dataEpoch
        ) {
          return false;
        }
        const mutation = retryMutation(context, event);
        return mutation !== null && !settingsGenerationHasMutationCapacity(mutation.baseGeneration);
      },
      retryLedgerFull: ({ context, event }) => {
        if (
          event.type !== 'SETTINGS_CAPTURED/RETRY_READY' ||
          event.dataEpoch !== context.dataEpoch
        ) {
          return false;
        }
        const mutation = retryMutation(context, event);
        const base = retryBase(context, event);
        return (
          mutation !== null &&
          base !== null &&
          settingsRevisionHasMutationCapacity(mutation.baseRevision) &&
          settingsGenerationHasMutationCapacity(mutation.baseGeneration) &&
          !hasSettingsMutationHeadroom(base.snapshot.envelope, mutation)
        );
      },
      retryReady: ({ context, event }) => {
        if (
          event.type !== 'SETTINGS_CAPTURED/RETRY_READY' ||
          event.dataEpoch !== context.dataEpoch
        ) {
          return false;
        }
        const command = currentCommandOfType(context, 'REBASE_SETTINGS_MUTATION');
        const mutation = retryMutation(context, event);
        const base = retryBase(context, event);
        return (
          command !== null &&
          command.mutationId === event.mutationId &&
          command.requestId === event.requestId &&
          command.commandId === event.commandId &&
          mutation !== null &&
          base !== null &&
          hasSettingsMutationHeadroom(base.snapshot.envelope, mutation)
        );
      },
      retryFailed: ({ context, event }) => {
        if (
          event.type !== 'SETTINGS_CAPTURED/RETRY_FAILED' ||
          !context.mutation ||
          !context.retryIntent
        ) {
          return false;
        }
        const command = currentCommandOfType(context, 'REBASE_SETTINGS_MUTATION');
        return (
          event.dataEpoch === context.dataEpoch &&
          command !== null &&
          context.retryIntent.mutationId === event.mutationId &&
          context.retryIntent.requestId === event.requestId &&
          command.mutationId === event.mutationId &&
          command.requestId === event.requestId &&
          command.commandId === event.commandId &&
          areFreshCorrelationIds(context, [event.nextRequestId]) &&
          canAppendCorrelationIds(
            context.mutation,
            context.retryIntent.mutationId,
            context.retryIntent.permissionCheckId,
            context.retryIntent.activationId,
            context.retryIntent.activationResultId,
            context.retryIntent.storageReservationId,
            context.retryIntent.requestId,
            event.nextRequestId
          ) &&
          errorMatches(
            event.error,
            ['SETTINGS_LOAD_FAILED', 'SETTINGS_STORAGE_FAILED', 'SETTINGS_TRANSPORT_ERROR'],
            ['rebase']
          )
        );
      },
      validCancel: ({ context, event }) =>
        event.type === 'SETTINGS_CAPTURED/CANCEL' &&
        event.dataEpoch === context.dataEpoch &&
        context.mutation?.mutationId === event.mutationId &&
        areFreshCorrelationIds(context, [event.requestId]) &&
        canAppendCorrelationIds(context.mutation, event.requestId),
      validRetryCancel: ({ context, event }) =>
        event.type === 'SETTINGS_CAPTURED/CANCEL' &&
        event.dataEpoch === context.dataEpoch &&
        context.retryIntent?.mutationId === event.mutationId &&
        areFreshCorrelationIds(context, [event.requestId]),
      cancelConfirmed: ({ context, event }) => {
        if (event.type !== 'SETTINGS_CAPTURED/CANCEL_CONFIRMED' || !context.mutation) {
          return false;
        }
        const command = currentCommandOfType(context, 'ABORT_SETTINGS_MUTATION');
        const snapshot = parsedSnapshotMatchingCommand(
          context,
          event.snapshot,
          event.requestId,
          event.commandId
        );
        const outcome = snapshot ? outcomeFor(snapshot, context.mutation) : null;
        return (
          event.dataEpoch === context.dataEpoch &&
          command !== null &&
          commandMatchesMutation(command, context.mutation) &&
          event.mutationId === command.mutationId &&
          event.requestId === command.requestId &&
          event.commandId === command.commandId &&
          snapshot !== null &&
          outcome?.outcome === 'cancelled' &&
          outcome.correlationIds.includes(event.requestId)
        );
      },
      cancelUnknown: ({ context, event }) => {
        if (event.type !== 'SETTINGS_CAPTURED/CANCEL_OUTCOME_UNKNOWN' || !context.mutation) {
          return false;
        }
        const command = currentCommandOfType(context, 'ABORT_SETTINGS_MUTATION');
        return (
          event.dataEpoch === context.dataEpoch &&
          command !== null &&
          commandMatchesMutation(command, context.mutation) &&
          event.mutationId === command.mutationId &&
          event.requestId === command.requestId &&
          event.commandId === command.commandId &&
          areFreshCorrelationIds(context, [event.nextRequestId]) &&
          canAppendCorrelationIds(context.mutation, event.nextRequestId) &&
          errorMatches(
            event.error,
            ['SETTINGS_TRANSPORT_ERROR', 'SETTINGS_STORAGE_FAILED'],
            ['cancel']
          )
        );
      },
      resetLoadRestart: ({ context, event }) => {
        if (
          event.type !== 'SETTINGS_CAPTURED/SERVICE_WORKER_RESTARTED' ||
          context.pendingReset?.stage !== 'committed'
        ) {
          return false;
        }
        return (
          event.dataEpoch === context.pendingReset.nextDataEpoch &&
          event.requestId === context.pendingReset.settingsBootstrapRequestId &&
          context.loadRequestId === context.pendingReset.settingsBootstrapRequestId
        );
      },
      validRestart: ({ context, event }) =>
        event.type === 'SETTINGS_CAPTURED/SERVICE_WORKER_RESTARTED' &&
        context.pendingReset?.stage !== 'committed' &&
        event.dataEpoch === context.dataEpoch &&
        areFreshCorrelationIds(context, [event.requestId]) &&
        (context.mutation === null || canAppendCorrelationIds(context.mutation, event.requestId)),
      restartWithoutMutation: ({ context, event }) =>
        event.type === 'SETTINGS_CAPTURED/SERVICE_WORKER_RESTARTED' &&
        context.pendingReset?.stage !== 'committed' &&
        context.mutation === null &&
        event.dataEpoch === context.dataEpoch &&
        areFreshCorrelationIds(context, [event.requestId]),
      protocolUnknown: ({ context, event }) => {
        if (event.type !== 'SETTINGS_CAPTURED/PROTOCOL_UNCERTAIN' || !context.mutation) {
          return false;
        }
        const command = currentMutationIdentityCommand(context);
        return (
          event.dataEpoch === context.dataEpoch &&
          event.mutationId === context.mutation.mutationId &&
          command !== null &&
          commandMatchesMutation(command, context.mutation) &&
          areFreshCorrelationIds(context, [event.nextRequestId]) &&
          canAppendCorrelationIds(context.mutation, event.nextRequestId) &&
          errorMatches(event.error, ['SETTINGS_PROTOCOL_ERROR'], ['reconcile'])
        );
      },
      rebaseProtocolUnknown: ({ context, event }) => {
        if (
          event.type !== 'SETTINGS_CAPTURED/PROTOCOL_UNCERTAIN' ||
          !context.mutation ||
          !context.retryIntent
        ) {
          return false;
        }
        const command = currentCommandOfType(context, 'REBASE_SETTINGS_MUTATION');
        return (
          command !== null &&
          event.dataEpoch === context.dataEpoch &&
          event.mutationId === command.mutationId &&
          command.mutationId === context.retryIntent.mutationId &&
          command.requestId === context.retryIntent.requestId &&
          areFreshCorrelationIds(context, [event.nextRequestId]) &&
          canAppendCorrelationIds(
            context.mutation,
            context.retryIntent.mutationId,
            context.retryIntent.permissionCheckId,
            context.retryIntent.activationId,
            context.retryIntent.activationResultId,
            context.retryIntent.storageReservationId,
            context.retryIntent.requestId,
            event.nextRequestId
          ) &&
          errorMatches(event.error, ['SETTINGS_PROTOCOL_ERROR'], ['reconcile'])
        );
      },
      reconciledCandidate: ({ context, event }) => {
        if (event.type !== 'SETTINGS_CAPTURED/RECONCILED' || !context.mutation) {
          return false;
        }
        const command = currentCommandOfType(context, 'RECONCILE_SETTINGS');
        const snapshot = parsedSnapshotMatchingCommand(
          context,
          event.snapshot,
          event.requestId,
          event.commandId
        );
        return (
          event.dataEpoch === context.dataEpoch &&
          command !== null &&
          commandMatchesMutation(command, context.mutation) &&
          context.reconcileRequestId === command.requestId &&
          event.requestId === command.requestId &&
          event.commandId === command.commandId &&
          snapshot !== null &&
          outcomeFor(snapshot, context.mutation)?.outcome === 'committed' &&
          settingsDigest(snapshot.envelope.settings) === context.mutation.candidateDigest
        );
      },
      reconciledCancelled: ({ context, event }) => {
        if (event.type !== 'SETTINGS_CAPTURED/RECONCILED' || !context.mutation) {
          return false;
        }
        const command = currentCommandOfType(context, 'RECONCILE_SETTINGS');
        const snapshot = parsedSnapshotMatchingCommand(
          context,
          event.snapshot,
          event.requestId,
          event.commandId
        );
        return (
          event.dataEpoch === context.dataEpoch &&
          command !== null &&
          commandMatchesMutation(command, context.mutation) &&
          context.reconcileRequestId === command.requestId &&
          event.requestId === command.requestId &&
          event.commandId === command.commandId &&
          snapshot !== null &&
          outcomeFor(snapshot, context.mutation)?.outcome === 'cancelled'
        );
      },
      reconciledSettledFailure: ({ context, event }) => {
        if (event.type !== 'SETTINGS_CAPTURED/RECONCILED' || !context.mutation) {
          return false;
        }
        const command = currentCommandOfType(context, 'RECONCILE_SETTINGS');
        const snapshot = parsedSnapshotMatchingCommand(
          context,
          event.snapshot,
          event.requestId,
          event.commandId
        );
        return (
          event.dataEpoch === context.dataEpoch &&
          command !== null &&
          commandMatchesMutation(command, context.mutation) &&
          context.reconcileRequestId === command.requestId &&
          event.requestId === command.requestId &&
          event.commandId === command.commandId &&
          snapshot !== null &&
          outcomeFor(snapshot, context.mutation) !== null
        );
      },
      reconciledUnknown: ({ context, event }) => {
        if (event.type !== 'SETTINGS_CAPTURED/RECONCILED' || !context.mutation) {
          return false;
        }
        const command = currentCommandOfType(context, 'RECONCILE_SETTINGS');
        const snapshot = parsedSnapshotMatchingCommand(
          context,
          event.snapshot,
          event.requestId,
          event.commandId
        );
        return (
          event.dataEpoch === context.dataEpoch &&
          command !== null &&
          commandMatchesMutation(command, context.mutation) &&
          context.reconcileRequestId === command.requestId &&
          event.requestId === command.requestId &&
          event.commandId === command.commandId &&
          snapshot !== null &&
          outcomeFor(snapshot, context.mutation) === null
        );
      },
      reconcileFailed: ({ context, event }) => {
        if (event.type !== 'SETTINGS_CAPTURED/RECONCILE_FAILED' || !context.mutation) {
          return false;
        }
        const command = currentCommandOfType(context, 'RECONCILE_SETTINGS');
        return (
          event.dataEpoch === context.dataEpoch &&
          command !== null &&
          commandMatchesMutation(command, context.mutation) &&
          context.reconcileRequestId === command.requestId &&
          event.requestId === command.requestId &&
          event.commandId === command.commandId &&
          errorMatches(
            event.error,
            [
              'SETTINGS_RECONCILE_FAILED',
              'SETTINGS_STORAGE_FAILED',
              'SETTINGS_TRANSPORT_ERROR',
              'SETTINGS_PROTOCOL_ERROR',
            ],
            ['reconcile']
          )
        );
      },
      retryReconcile: ({ context, event }) =>
        event.type === 'SETTINGS_CAPTURED/RETRY_RECONCILIATION' &&
        event.dataEpoch === context.dataEpoch &&
        context.mutation !== null &&
        context.command === null &&
        areFreshCorrelationIds(context, [event.requestId]) &&
        canAppendCorrelationIds(context.mutation, event.requestId),
      immutableOutcomeMissingFatal: ({ context, event }) =>
        (event.type === 'SETTINGS_CAPTURED/MUTATE' || event.type === 'SETTINGS_CAPTURED/RETRY') &&
        context.phase === 'failed' &&
        context.pendingIntent !== null &&
        context.mutation !== null &&
        context.pendingIntent.mutation.mutationId === context.mutation.mutationId &&
        context.error?.code === 'SETTINGS_OUTCOME_MISSING' &&
        context.error.operation === 'reconcile' &&
        context.error.recoverable === false &&
        context.error.mutationOutcome === 'unknown' &&
        context.error.canonicalKnowledge === 'known' &&
        context.command === null,
      fatalFailure: ({ context, event }) =>
        event.type === 'SETTINGS_CAPTURED/MUTATE' && context.error?.recoverable === false,
      dismissible: ({ context, event }) =>
        event.type === 'SETTINGS_CAPTURED/DISMISS_ERROR' &&
        event.dataEpoch === context.dataEpoch &&
        context.mutation?.mutationId === event.mutationId &&
        context.canonicalKnowledge === 'known' &&
        context.canonical !== null &&
        context.error?.recoverable === true,
      newerBroadcast: ({ context, event }) => {
        if (
          event.type !== 'SETTINGS_CAPTURED/CANONICAL_UPDATED' ||
          event.dataEpoch !== context.dataEpoch
        ) {
          return false;
        }
        const snapshot = parsedSnapshotForContext(context, event.snapshot);
        return (
          areFreshCorrelationIds(context, [event.broadcastId, event.nextRequestId]) &&
          (context.mutation === null ||
            canAppendCorrelationIds(context.mutation, event.nextRequestId)) &&
          snapshot !== null &&
          (context.canonical === null ||
            snapshot.envelope.generation > context.canonical.envelope.generation)
        );
      },
      divergentEqualBroadcast: ({ context, event }) => {
        if (
          event.type !== 'SETTINGS_CAPTURED/CANONICAL_UPDATED' ||
          event.dataEpoch !== context.dataEpoch
        ) {
          return false;
        }
        const snapshot = parsedSnapshotForContext(context, event.snapshot);
        return (
          areFreshCorrelationIds(context, [event.broadcastId, event.nextRequestId]) &&
          (context.mutation === null ||
            canAppendCorrelationIds(context.mutation, event.nextRequestId)) &&
          snapshot !== null &&
          context.canonical !== null &&
          snapshot.envelope.generation === context.canonical.envelope.generation &&
          settingsEnvelopeDigest(snapshot.envelope) !==
            settingsEnvelopeDigest(context.canonical.envelope)
        );
      },
      divergentEqualBroadcastWithMutation: ({ context, event }) => {
        if (
          context.mutation === null ||
          event.type !== 'SETTINGS_CAPTURED/CANONICAL_UPDATED' ||
          event.dataEpoch !== context.dataEpoch
        ) {
          return false;
        }
        const snapshot = parsedSnapshotForContext(context, event.snapshot);
        return (
          areFreshCorrelationIds(context, [event.broadcastId, event.nextRequestId]) &&
          canAppendCorrelationIds(context.mutation, event.nextRequestId) &&
          snapshot !== null &&
          context.canonical !== null &&
          snapshot.envelope.generation === context.canonical.envelope.generation &&
          settingsEnvelopeDigest(snapshot.envelope) !==
            settingsEnvelopeDigest(context.canonical.envelope)
        );
      },
      divergentEqualBroadcastWithoutMutation: ({ context, event }) => {
        if (
          context.mutation !== null ||
          event.type !== 'SETTINGS_CAPTURED/CANONICAL_UPDATED' ||
          event.dataEpoch !== context.dataEpoch
        ) {
          return false;
        }
        const snapshot = parsedSnapshotForContext(context, event.snapshot);
        return (
          areFreshCorrelationIds(context, [event.broadcastId, event.nextRequestId]) &&
          snapshot !== null &&
          context.canonical !== null &&
          snapshot.envelope.generation === context.canonical.envelope.generation &&
          settingsEnvelopeDigest(snapshot.envelope) !==
            settingsEnvelopeDigest(context.canonical.envelope)
        );
      },
      resetReadyWithPendingIntent: ({ context, event }) => {
        if (
          event.type !== 'SETTINGS_CAPTURED/RESET_EPOCH_READY_TO_COMMIT' ||
          !inputIsValid(context) ||
          context.pendingIntent === null ||
          context.mutation === null
        ) {
          return false;
        }
        const payload = normalizedResetPayloadForEvent(event);
        return (
          payload !== null &&
          payload.nextDataEpoch !== context.dataEpoch &&
          (payload.previousDataEpoch === null || payload.previousDataEpoch === context.dataEpoch) &&
          context.pendingReset === null &&
          areFreshCorrelationIds(context, [payload.resetId, payload.settingsBootstrapRequestId])
        );
      },
      resetCommittedWithPendingIntent: ({ context, event }) => {
        if (
          event.type !== 'SETTINGS_CAPTURED/RESET_EPOCH_COMMITTED' ||
          !inputIsValid(context) ||
          context.pendingIntent === null ||
          context.mutation === null
        ) {
          return false;
        }
        const payload = normalizedResetPayloadForEvent(event);
        return (
          payload !== null &&
          context.pendingReset === null &&
          payload.nextDataEpoch !== context.dataEpoch &&
          (payload.previousDataEpoch === null
            ? event.resetFenceProof !== undefined
            : payload.previousDataEpoch === context.dataEpoch &&
              event.resetFenceProof === undefined) &&
          areFreshCorrelationIds(context, [payload.resetId, payload.settingsBootstrapRequestId])
        );
      },
      duplicateResetReady: ({ context, event }) => {
        if (event.type !== 'SETTINGS_CAPTURED/RESET_EPOCH_READY_TO_COMMIT') {
          return false;
        }
        const payload = normalizedResetPayloadForEvent(event);
        return payload !== null && pendingResetMatches(context.pendingReset, payload);
      },
      resetReady: ({ context, event }) => {
        if (
          event.type !== 'SETTINGS_CAPTURED/RESET_EPOCH_READY_TO_COMMIT' ||
          !inputIsValid(context)
        ) {
          return false;
        }
        const payload = normalizedResetPayloadForEvent(event);
        return (
          payload !== null &&
          payload.nextDataEpoch !== context.dataEpoch &&
          (payload.previousDataEpoch === null || payload.previousDataEpoch === context.dataEpoch) &&
          context.pendingReset === null &&
          context.pendingIntent === null &&
          areFreshCorrelationIds(context, [payload.resetId, payload.settingsBootstrapRequestId])
        );
      },
      duplicateResetCommitted: ({ context, event }) => {
        if (event.type !== 'SETTINGS_CAPTURED/RESET_EPOCH_COMMITTED') {
          return false;
        }
        const payload = normalizedResetPayloadForEvent(event);
        return (
          payload !== null &&
          context.pendingReset?.stage === 'committed' &&
          pendingResetMatches(context.pendingReset, payload)
        );
      },
      resetCommitted: ({ context, event }) => {
        if (event.type !== 'SETTINGS_CAPTURED/RESET_EPOCH_COMMITTED' || !inputIsValid(context)) {
          return false;
        }
        const payload = normalizedResetPayloadForEvent(event);
        if (payload === null) {
          return false;
        }
        if (context.pendingIntent !== null) {
          return false;
        }
        if (context.pendingReset?.stage === 'ready_to_commit') {
          return (
            event.resetFenceProof === undefined &&
            pendingResetMatches(context.pendingReset, payload)
          );
        }
        return (
          context.pendingReset === null &&
          payload.nextDataEpoch !== context.dataEpoch &&
          (payload.previousDataEpoch === null
            ? event.resetFenceProof !== undefined
            : payload.previousDataEpoch === context.dataEpoch &&
              event.resetFenceProof === undefined) &&
          areFreshCorrelationIds(context, [payload.resetId, payload.settingsBootstrapRequestId])
        );
      },
    },
    actions: {
      startColdReconciliation: assign(({ context }) => coldStartReconcilePatch(context)),
      activatePersistedIntent: assign(({ context }) =>
        context.deferredCommand === null
          ? {}
          : {
              phase: PENDING_PHASE_BY_COMMAND[context.deferredCommand.type],
              command: context.deferredCommand,
              deferredCommand: null,
              lastRejection: null,
            }
      ),
      settlePendingIntentPersistFailure: assign(({ context, event }) =>
        event.type === 'SETTINGS_CAPTURED/SETTINGS_PENDING_INTENT_PERSIST_FAILED'
          ? {
              phase: 'failed' as const,
              projected: cloneSettings(canonicalSettings(context)),
              mutationOutcome: 'previous' as const,
              canonicalRelation: 'previous' as const,
              pendingIntent: null,
              deferredCommand: null,
              pendingTerminalSettlement: null,
              pendingTerminalTarget: null,
              terminalSettlement: null,
              runtimeEffectError: null,
              error: event.error,
              lastRejection: event.error,
              command: null,
            }
          : {}
      ),
      retainPendingIntentCommand: assign(({ event }) =>
        event.type === 'SETTINGS_CAPTURED/SETTINGS_PENDING_INTENT_PERSIST_OUTCOME_UNKNOWN' ||
        event.type === 'SETTINGS_CAPTURED/SETTINGS_PENDING_INTENT_CLEAR_OUTCOME_UNKNOWN'
          ? { lastRejection: event.error }
          : {}
      ),
      publishClearedTerminal: assign(({ context }) => {
        const target = context.pendingTerminalTarget;
        if (target !== 'saved' && target !== 'failed') {
          return {};
        }
        return {
          phase: target,
          mutation: target === 'saved' ? null : context.mutation,
          pendingIntent: null,
          deferredCommand: null,
          pendingTerminalSettlement: null,
          pendingTerminalTarget: null,
          terminalSettlement:
            context.pendingTerminalSettlement === null
              ? null
              : cloneSettingsTerminalSettlementV1(context.pendingTerminalSettlement),
          retryIntent: null,
          reconcileRequestId: null,
          reconcileReason: null,
          runtimeEffectError: null,
          lastRejection: null,
          command: null,
        };
      }),
      prepareReadyResetClear: assign(({ context, event }) => {
        if (event.type !== 'SETTINGS_CAPTURED/RESET_EPOCH_READY_TO_COMMIT') {
          return {};
        }
        const payload = normalizedResetPayloadForEvent(event);
        return payload ? clearCurrentPendingIntentForReset(context, payload, 'reset_pending') : {};
      }),
      prepareCommittedResetClear: assign(({ context, event }) => {
        if (event.type !== 'SETTINGS_CAPTURED/RESET_EPOCH_COMMITTED') {
          return {};
        }
        const payload = normalizedResetPayloadForEvent(event);
        return payload ? clearCurrentPendingIntentForReset(context, payload, 'reset_loading') : {};
      }),
      publishClearedResetReady: assign(() => ({
        phase: 'saved' as const,
        canonical: null,
        mutation: null,
        mutationOutcome: 'unknown' as const,
        pendingIntent: null,
        deferredCommand: null,
        pendingTerminalSettlement: null,
        pendingTerminalTarget: null,
        terminalSettlement: null,
        command: null,
      })),
      publishClearedResetLoad: assign(({ context }) => {
        const pending = context.pendingReset;
        return pending?.stage === 'committed'
          ? {
              loadStatus: 'loading' as const,
              loadRequestId: pending.settingsBootstrapRequestId,
              phase: 'saved' as const,
              canonical: null,
              mutation: null,
              mutationOutcome: 'unknown' as const,
              pendingIntent: null,
              deferredCommand: null,
              pendingTerminalSettlement: null,
              pendingTerminalTarget: null,
              terminalSettlement: null,
              command: loadCommand(pending.nextDataEpoch, pending.settingsBootstrapRequestId, {
                resetId: pending.resetId,
                nextDataEpoch: pending.nextDataEpoch,
              }),
            }
          : {};
      }),
      startInitialLoad: assign(({ context }) => ({
        loadStatus: 'loading' as const,
        command: loadCommand(context.dataEpoch, context.loadRequestId),
      })),
      failInput: assign(() => ({
        loadStatus: 'error' as const,
        canonicalKnowledge: 'unknown' as const,
        error: makeError(contractFor('SETTINGS_INVALID'), 'Entrées du modèle settings invalides.'),
        command: null,
      })),
      failColdStartRevision: assign(() => ({
        loadStatus: 'error' as const,
        phase: 'failed' as const,
        canonicalKnowledge: 'unknown' as const,
        error: makeError(
          contractFor('SETTINGS_REVISION_EXHAUSTED'),
          'La reprise du pending intent ne peut pas produire une révision durable sûre.'
        ),
        command: null,
      })),
      startLoad: assign(({ context, event }) =>
        event.type === 'SETTINGS_CAPTURED/LOAD'
          ? {
              loadStatus: 'loading' as const,
              loadRequestId: event.requestId,
              runtimeEffectError: null,
              error: null,
              command: loadCommand(context.dataEpoch, event.requestId),
            }
          : {}
      ),
      restartLoad: assign(({ context, event }) =>
        event.type === 'SETTINGS_CAPTURED/SERVICE_WORKER_RESTARTED'
          ? {
              loadStatus: 'loading' as const,
              loadRequestId: event.requestId,
              canonicalKnowledge: 'unknown' as const,
              runtimeEffectError: null,
              error: null,
              command: loadCommand(context.dataEpoch, event.requestId),
            }
          : {}
      ),
      acceptLoad: assign(({ context, event }) => {
        if (event.type !== 'SETTINGS_CAPTURED/LOAD_SUCCEEDED') {
          return {};
        }
        const snapshot = parsedActionSnapshot(context, event.snapshot);
        return snapshot
          ? {
              ...adoptSnapshot(context, snapshot),
              dataEpoch: snapshot.dataEpoch,
              loadStatus: 'ready' as const,
              phase: 'saved' as const,
              mutation: null,
              mutationOutcome: 'unknown' as const,
              canonicalRelation: 'unknown' as const,
              retryIntent: null,
              pendingReset: null,
              reconcileRequestId: null,
              reconcileReason: null,
              runtimeEffectError: null,
              error: null,
              lastRejection: null,
              command: null,
            }
          : {};
      }),
      failLoad: assign(({ event }) => {
        if (event.type !== 'SETTINGS_CAPTURED/LOAD_FAILED') {
          return {};
        }
        const error = parsedEventError(event.error);
        return error
          ? {
              loadStatus: 'error' as const,
              canonicalKnowledge: 'unknown' as const,
              runtimeEffectError: null,
              error,
              lastRejection: null,
              command: null,
            }
          : {};
      }),
      failResetLoadProtocol: assign(() => ({
        loadStatus: 'error' as const,
        canonicalKnowledge: 'unknown' as const,
        runtimeEffectError: null,
        error: makeError(
          contractFor('SETTINGS_PROTOCOL_ERROR'),
          'Un Load corrélé au reset committed ne peut pas répondre SETTINGS_RESET_IN_PROGRESS.'
        ),
        lastRejection: null,
        command: null,
      })),
      settleNoOp: assign(({ context, event }) =>
        event.type === 'SETTINGS_CAPTURED/MUTATE'
          ? {
              phase: 'saved' as const,
              projected: cloneSettings(canonicalSettings(context)),
              mutation: null,
              mutationOutcome: 'previous' as const,
              canonicalRelation: 'previous' as const,
              handledActivationIds: appendHandledActivation(context, event),
              handledActivationResultIds: appendHandledActivationResult(context, event),
              runtimeEffectError: null,
              error: null,
              lastRejection: null,
              command: null,
            }
          : {}
      ),
      beginReservation: assign(({ context, event }) =>
        event.type === 'SETTINGS_CAPTURED/MUTATE'
          ? {
              ...beginMutation(context, event),
              handledActivationIds: appendHandledActivation(context, event),
              handledActivationResultIds: appendHandledActivationResult(context, event),
            }
          : {}
      ),
      rejectActivationReplay: assign(() => ({
        lastRejection: makeError(
          contractFor('SETTINGS_ACTIVATION_REJECTED'),
          'Cette activation de réglage a déjà été traitée par ce worker.'
        ),
        command: null,
      })),
      settleActivationRejection: assign(({ context, event }) =>
        event.type === 'SETTINGS_CAPTURED/MUTATE'
          ? {
              handledActivationIds: appendHandledActivation(context, event),
              handledActivationResultIds: appendHandledActivationResult(context, event),
              lastRejection: makeError(
                contractFor('SETTINGS_ACTIVATION_REJECTED'),
                `Activation de réglage rejetée: ${event.activationResult.kind === 'SETTINGS_ACTIVATION_REJECTED' ? event.activationResult.reason : 'invalid'}.`
              ),
              command: null,
            }
          : {}
      ),
      settleRetryActivationRejection: assign(({ context, event }) =>
        event.type === 'SETTINGS_CAPTURED/RETRY'
          ? {
              handledActivationIds: appendHandledActivation(context, event),
              handledActivationResultIds: appendHandledActivationResult(context, event),
              lastRejection: makeError(
                contractFor('SETTINGS_ACTIVATION_REJECTED'),
                `Activation de retry rejetée: ${event.activationResult.kind === 'SETTINGS_ACTIVATION_REJECTED' ? event.activationResult.reason : 'invalid'}.`
              ),
              command: null,
            }
          : {}
      ),
      rejectActivationCapacity: assign(() => {
        const error = makeError(
          contractFor('SETTINGS_ACTIVATION_CAPACITY_EXHAUSTED'),
          "Le registre d'activations de ce worker est saturé; un nouveau worker est requis."
        );
        return { phase: 'failed' as const, error, lastRejection: error, command: null };
      }),
      rejectInvalidConsumed: assign(({ context, event }) =>
        event.type === 'SETTINGS_CAPTURED/MUTATE'
          ? {
              handledActivationIds: appendHandledActivation(context, event),
              handledActivationResultIds: appendHandledActivationResult(context, event),
              lastRejection: makeError(
                contractFor('SETTINGS_INVALID', 'previous'),
                'Réglage ou identifiants invalides.'
              ),
              command: null,
            }
          : {}
      ),
      rejectInvalidRetryConsumed: assign(({ context, event }) =>
        event.type === 'SETTINGS_CAPTURED/RETRY'
          ? {
              handledActivationIds: appendHandledActivation(context, event),
              handledActivationResultIds: appendHandledActivationResult(context, event),
              lastRejection: makeError(
                contractFor('SETTINGS_INVALID', 'previous'),
                'Retry ou identifiants invalides.'
              ),
              command: null,
            }
          : {}
      ),
      rejectInvalid: assign(() => ({
        lastRejection: makeError(
          contractFor('SETTINGS_INVALID', 'previous'),
          'Réglage ou identifiants invalides.'
        ),
      })),
      rejectLedgerFull: assign(({ context, event }) => {
        const error = makeError(
          contractFor('SETTINGS_LEDGER_QUOTA_EXHAUSTED'),
          'Le budget durable settings de cet epoch est épuisé; un reset explicite est requis.'
        );
        return {
          phase: 'failed' as const,
          handledActivationIds:
            event.type === 'SETTINGS_CAPTURED/MUTATE'
              ? appendHandledActivation(context, event)
              : context.handledActivationIds,
          handledActivationResultIds:
            event.type === 'SETTINGS_CAPTURED/MUTATE'
              ? appendHandledActivationResult(context, event)
              : context.handledActivationResultIds,
          error,
          lastRejection: error,
          command: null,
        };
      }),
      rejectRevisionExhausted: assign(({ context, event }) => {
        const error = makeError(
          contractFor('SETTINGS_REVISION_EXHAUSTED'),
          'La révision settings ne peut plus avancer sans dépasser la limite sûre.'
        );
        return {
          phase: 'failed' as const,
          handledActivationIds:
            event.type === 'SETTINGS_CAPTURED/MUTATE'
              ? appendHandledActivation(context, event)
              : context.handledActivationIds,
          handledActivationResultIds:
            event.type === 'SETTINGS_CAPTURED/MUTATE'
              ? appendHandledActivationResult(context, event)
              : context.handledActivationResultIds,
          error,
          lastRejection: error,
          command: null,
        };
      }),
      rejectGenerationExhausted: assign(({ context, event }) => {
        const error = makeError(
          contractFor('SETTINGS_GENERATION_EXHAUSTED'),
          'La génération settings ne peut plus réserver les quatre écritures transactionnelles.'
        );
        return {
          phase: 'failed' as const,
          handledActivationIds:
            event.type === 'SETTINGS_CAPTURED/MUTATE'
              ? appendHandledActivation(context, event)
              : context.handledActivationIds,
          handledActivationResultIds:
            event.type === 'SETTINGS_CAPTURED/MUTATE'
              ? appendHandledActivationResult(context, event)
              : context.handledActivationResultIds,
          error,
          lastRejection: error,
          command: null,
        };
      }),
      rejectBusy: assign(() => ({
        lastRejection: makeError(
          contractFor('SETTINGS_BUSY'),
          'Chargement ou transaction settings déjà actif.'
        ),
      })),
      installReservationPermission: assign(({ context, event }) => {
        if (event.type !== 'SETTINGS_CAPTURED/STORAGE_RESERVATION_GRANTED' || !context.mutation) {
          return {};
        }
        const mutation: SettingMutation = {
          ...context.mutation,
          storageReservationProof: event.proof,
        };
        const verify = permissionCommand(context, mutation);
        return verify?.type === 'VERIFY_SETTINGS_HOST_PERMISSIONS'
          ? persistPendingIntentPatch(context, mutation, verify)
          : {};
      }),
      installReservationWrite: assign(({ context, event }) => {
        if (event.type !== 'SETTINGS_CAPTURED/STORAGE_RESERVATION_GRANTED' || !context.mutation) {
          return {};
        }
        const mutation: SettingMutation = {
          ...context.mutation,
          storageReservationProof: event.proof,
        };
        const write = writeCommand(context, mutation);
        return write?.type === 'COMPARE_AND_SETTLE_SETTINGS'
          ? persistPendingIntentPatch(context, mutation, write)
          : {};
      }),
      rejectGlobalStorageQuota: assign(({ context, event }) => {
        if (event.type !== 'SETTINGS_CAPTURED/STORAGE_RESERVATION_DENIED' || !context.mutation) {
          return {};
        }
        const error = parsedEventError(event.error);
        if (error === null) {
          return {};
        }
        const base = {
          projected: cloneSettings(canonicalSettings(context)),
          mutationOutcome: 'previous' as const,
          canonicalRelation: 'previous' as const,
          retryIntent: null,
          runtimeEffectError: null,
          error,
          lastRejection: error,
        };
        return clearPendingIntentPatch(context, base, 'failed', null);
      }),
      installPermission: assign(({ context, event }) => {
        if (event.type !== 'SETTINGS_CAPTURED/HOST_PERMISSIONS_VERIFIED' || !context.mutation) {
          return {};
        }
        const mutation = { ...context.mutation, permissionProof: event.proof };
        const write = writeCommand(context, mutation);
        return write?.type === 'COMPARE_AND_SETTLE_SETTINGS'
          ? {
              runtimeEffectError: null,
              ...persistPendingIntentPatch(context, mutation, write),
            }
          : {};
      }),
      settlePermissionRefusal: assign(({ context, event }) => {
        if (event.type !== 'SETTINGS_CAPTURED/HOST_PERMISSIONS_MISSING' || !context.mutation) {
          return {};
        }
        const error = parsedEventError(event.error);
        if (error === null) {
          return {};
        }
        const snapshot = parsedActionSnapshot(context, event.snapshot);
        if (snapshot === null) {
          return {};
        }
        const base = {
          ...terminalFailure(context, snapshot, outcomeFor(snapshot, context.mutation)),
          error,
        };
        return clearPendingIntentPatch(
          context,
          base,
          'failed',
          terminalSettlement(
            context,
            snapshot,
            context.mutation.permissionCheckId,
            event.commandId,
            error
          )
        );
      }),
      reconcilePermission: assign(({ context, event }) => {
        const error =
          event.type === 'SETTINGS_CAPTURED/HOST_PERMISSIONS_OUTCOME_UNKNOWN'
            ? parsedEventError(event.error)
            : null;
        return event.type === 'SETTINGS_CAPTURED/HOST_PERMISSIONS_OUTCOME_UNKNOWN' && error
          ? reconcilePatch(context, event.nextRequestId, 'permission_check_unknown', error)
          : {};
      }),
      commitSave: assign(({ context, event }) => {
        const snapshot =
          event.type === 'SETTINGS_CAPTURED/SAVE_SUCCEEDED'
            ? parsedActionSnapshot(context, event.snapshot)
            : null;
        if (event.type !== 'SETTINGS_CAPTURED/SAVE_SUCCEEDED' || snapshot === null) {
          return {};
        }
        const settlement = terminalSettlement(
          context,
          snapshot,
          event.mutationId,
          event.commandId,
          null
        );
        const base = {
          ...adoptSnapshot(context, snapshot),
          mutationOutcome: 'candidate' as const,
          canonicalRelation: 'candidate' as const,
          retryIntent: null,
          reconcileRequestId: null,
          reconcileReason: null,
          runtimeEffectError: null,
          error: null,
        };
        return clearPendingIntentPatch(context, base, 'saved', settlement);
      }),
      reconcileSave: assign(({ context, event }) => {
        const error =
          event.type === 'SETTINGS_CAPTURED/SAVE_FAILED' ? parsedEventError(event.error) : null;
        return event.type === 'SETTINGS_CAPTURED/SAVE_FAILED' && error
          ? reconcilePatch(
              context,
              event.nextRequestId,
              error.code === 'SETTINGS_CONFLICT' ? 'conflict' : 'save_failed',
              error
            )
          : {};
      }),
      beginCompensation: assign(({ context, event }) => {
        const storageReservationProof = context.mutation?.storageReservationProof;
        if (
          event.type !== 'SETTINGS_CAPTURED/RUNTIME_EFFECT_FAILED' ||
          !context.mutation ||
          !storageReservationProof
        ) {
          return {};
        }
        const error = parsedEventError(event.error);
        if (error === null) {
          return {};
        }
        const mutation = withCorrelationIds(context.mutation, event.recoveryRequestId);
        const recoverCommand: SettingsDeferredPersistenceCommand = {
          type: 'RECOVER_SETTINGS_TRANSACTION' as const,
          commandId: commandId('recover', event.recoveryRequestId),
          dataEpoch: context.dataEpoch,
          requestId: event.recoveryRequestId,
          mutationId: mutation.mutationId,
          commandDigest: mutation.commandDigest,
          baseRevision: mutation.baseRevision,
          baseGeneration: mutation.baseGeneration,
          previousDigest: mutation.previousDigest,
          candidateDigest: mutation.candidateDigest,
          correlationIds: [...mutation.correlationIds],
          storageReservationProof: { ...storageReservationProof },
        };
        return {
          runtimeEffectError: error,
          error,
          ...persistPendingIntentPatch(context, mutation, recoverCommand),
        };
      }),
      settleCompensation: assign(({ context, event }) => {
        const snapshot =
          event.type === 'SETTINGS_CAPTURED/COMPENSATION_SUCCEEDED'
            ? parsedActionSnapshot(context, event.snapshot)
            : null;
        if (
          event.type !== 'SETTINGS_CAPTURED/COMPENSATION_SUCCEEDED' ||
          context.mutation === null ||
          snapshot === null
        ) {
          return {};
        }
        const base = terminalFailure(context, snapshot, outcomeFor(snapshot, context.mutation));
        return clearPendingIntentPatch(
          context,
          base,
          'failed',
          terminalSettlement(
            context,
            snapshot,
            event.requestId,
            event.commandId,
            context.runtimeEffectError
          )
        );
      }),
      reconcileCompensation: assign(({ context, event }) => {
        const error =
          event.type === 'SETTINGS_CAPTURED/COMPENSATION_FAILED'
            ? parsedEventError(event.error)
            : null;
        return event.type === 'SETTINGS_CAPTURED/COMPENSATION_FAILED' && error
          ? reconcilePatch(context, event.nextRequestId, 'compensation_unknown', error)
          : {};
      }),
      beginRetry: assign(({ context, event }) => {
        if (event.type !== 'SETTINGS_CAPTURED/RETRY' || !context.mutation || !context.canonical) {
          return {};
        }
        const retryIntent = {
          failedMutationId: event.failedMutationId,
          mutationId: event.mutationId,
          permissionCheckId: event.permissionCheckId,
          activationId: event.activationId,
          activationResultId: event.activationResult.resultId,
          storageReservationId: event.storageReservationId,
          requestId: event.requestId,
        };
        const rebaseCommand: SettingsDeferredPersistenceCommand = {
          type: 'REBASE_SETTINGS_MUTATION' as const,
          commandId: commandId('rebase', event.requestId),
          dataEpoch: context.dataEpoch,
          requestId: event.requestId,
          mutationId: event.mutationId,
        };
        return {
          error: null,
          handledActivationIds: appendHandledActivation(context, event),
          handledActivationResultIds: appendHandledActivationResult(context, event),
          ...persistPendingIntentPatch(context, context.mutation, rebaseCommand, retryIntent),
        };
      }),
      settleRetryNoOp: assign(({ context, event }) => {
        const base =
          event.type === 'SETTINGS_CAPTURED/RETRY_READY' ? retryBase(context, event) : null;
        return event.type === 'SETTINGS_CAPTURED/RETRY_READY' && base
          ? clearPendingIntentPatch(
              context,
              {
                ...adoptSnapshot(context, base.snapshot),
                mutationOutcome: 'previous' as const,
                canonicalRelation: 'candidate' as const,
                retryIntent: null,
                runtimeEffectError: null,
                error: null,
              },
              'saved',
              null
            )
          : {};
      }),
      installRetryReservation: assign(({ context, event }) => {
        const base =
          event.type === 'SETTINGS_CAPTURED/RETRY_READY' ? retryBase(context, event) : null;
        const mutation =
          event.type === 'SETTINGS_CAPTURED/RETRY_READY' ? retryMutation(context, event) : null;
        if (!base || !mutation) {
          return {};
        }
        const rebasedContext = { ...context, canonical: base.snapshot };
        const reserve = reservationCommand(rebasedContext, mutation);
        if (reserve?.type !== 'RESERVE_SETTINGS_STORAGE') {
          return {};
        }
        return {
          ...adoptSnapshot(context, base.snapshot),
          projected: cloneSettings(base.candidate),
          canonicalRelation: 'previous' as const,
          retryIntent: null,
          runtimeEffectError: null,
          ...persistPendingIntentPatch(context, mutation, reserve, null),
        };
      }),
      rejectRetryLedgerFull: assign(({ context, event }) => {
        if (event.type !== 'SETTINGS_CAPTURED/RETRY_READY') {
          return {};
        }
        const base = retryBase(context, event);
        if (base === null) {
          return {};
        }
        const error = makeError(
          contractFor('SETTINGS_LEDGER_QUOTA_EXHAUSTED'),
          'Le budget durable settings ne peut pas admettre ce retry.'
        );
        return clearPendingIntentPatch(
          context,
          {
            ...adoptSnapshot(context, base.snapshot),
            retryIntent: null,
            runtimeEffectError: null,
            error,
            lastRejection: error,
          },
          'failed',
          null
        );
      }),
      rejectRetryRevisionExhausted: assign(({ context, event }) => {
        if (event.type !== 'SETTINGS_CAPTURED/RETRY_READY') {
          return {};
        }
        const base = retryBase(context, event);
        if (base === null) {
          return {};
        }
        const error = makeError(
          contractFor('SETTINGS_REVISION_EXHAUSTED'),
          'La base rechargée ne réserve pas deux révisions sûres.'
        );
        return clearPendingIntentPatch(
          context,
          {
            ...adoptSnapshot(context, base.snapshot),
            retryIntent: null,
            runtimeEffectError: null,
            error,
            lastRejection: error,
          },
          'failed',
          null
        );
      }),
      rejectRetryGenerationExhausted: assign(({ context, event }) => {
        if (event.type !== 'SETTINGS_CAPTURED/RETRY_READY') {
          return {};
        }
        const base = retryBase(context, event);
        if (base === null) {
          return {};
        }
        const error = makeError(
          contractFor('SETTINGS_GENERATION_EXHAUSTED'),
          'La base rechargée ne réserve pas quatre générations transactionnelles sûres.'
        );
        return clearPendingIntentPatch(
          context,
          {
            ...adoptSnapshot(context, base.snapshot),
            retryIntent: null,
            runtimeEffectError: null,
            error,
            lastRejection: error,
          },
          'failed',
          null
        );
      }),
      reconcileRebase: assign(({ context, event }) => {
        const error =
          event.type === 'SETTINGS_CAPTURED/RETRY_FAILED' ? parsedEventError(event.error) : null;
        return event.type === 'SETTINGS_CAPTURED/RETRY_FAILED' && error
          ? reconcilePatch(context, event.nextRequestId, 'rebase_failed', error)
          : {};
      }),
      reconcileRebaseProtocol: assign(({ context, event }) => {
        const error =
          event.type === 'SETTINGS_CAPTURED/PROTOCOL_UNCERTAIN'
            ? parsedEventError(event.error)
            : null;
        return event.type === 'SETTINGS_CAPTURED/PROTOCOL_UNCERTAIN' && error
          ? reconcilePatch(context, event.nextRequestId, 'protocol_uncertain', error)
          : {};
      }),
      cancelRetryIntent: assign(({ context }) => ({
        ...clearPendingIntentPatch(
          context,
          {
            projected: cloneSettings(canonicalSettings(context)),
            mutationOutcome: 'unknown' as const,
            canonicalRelation: 'unknown' as const,
            retryIntent: null,
            runtimeEffectError: null,
            error: null,
          },
          'saved',
          null
        ),
      })),
      beginCancel: assign(({ context, event }) => {
        if (event.type !== 'SETTINGS_CAPTURED/CANCEL' || !context.mutation) {
          return {};
        }
        const mutation = withCorrelationIds(context.mutation, event.requestId);
        const abortCommand: SettingsDeferredPersistenceCommand = {
          type: 'ABORT_SETTINGS_MUTATION' as const,
          commandId: commandId('abort', event.requestId),
          dataEpoch: context.dataEpoch,
          requestId: event.requestId,
          mutationId: mutation.mutationId,
          commandDigest: mutation.commandDigest,
          baseRevision: mutation.baseRevision,
          baseGeneration: mutation.baseGeneration,
          previousDigest: mutation.previousDigest,
          candidateDigest: mutation.candidateDigest,
          correlationIds: [...mutation.correlationIds],
          storageReservationProof: mutation.storageReservationProof
            ? { ...mutation.storageReservationProof }
            : null,
        };
        return persistPendingIntentPatch(context, mutation, abortCommand);
      }),
      confirmCancel: assign(({ context, event }) => {
        const snapshot =
          event.type === 'SETTINGS_CAPTURED/CANCEL_CONFIRMED'
            ? parsedActionSnapshot(context, event.snapshot)
            : null;
        if (event.type !== 'SETTINGS_CAPTURED/CANCEL_CONFIRMED' || snapshot === null) {
          return {};
        }
        return clearPendingIntentPatch(
          context,
          {
            ...adoptSnapshot(context, snapshot),
            mutationOutcome: 'previous' as const,
            canonicalRelation: 'unknown' as const,
            runtimeEffectError: null,
            error: null,
          },
          'saved',
          terminalSettlement(context, snapshot, event.requestId, event.commandId, null)
        );
      }),
      reconcileCancel: assign(({ context, event }) => {
        const error =
          event.type === 'SETTINGS_CAPTURED/CANCEL_OUTCOME_UNKNOWN'
            ? parsedEventError(event.error)
            : null;
        return event.type === 'SETTINGS_CAPTURED/CANCEL_OUTCOME_UNKNOWN' && error
          ? reconcilePatch(context, event.nextRequestId, 'cancel_unknown', error)
          : {};
      }),
      reconcileProtocol: assign(({ context, event }) => {
        const error =
          event.type === 'SETTINGS_CAPTURED/PROTOCOL_UNCERTAIN'
            ? parsedEventError(event.error)
            : null;
        return event.type === 'SETTINGS_CAPTURED/PROTOCOL_UNCERTAIN' && error
          ? reconcilePatch(context, event.nextRequestId, 'protocol_uncertain', error)
          : {};
      }),
      reconcileRestart: assign(({ context, event }) =>
        event.type === 'SETTINGS_CAPTURED/SERVICE_WORKER_RESTARTED'
          ? reconcilePatch(
              context,
              event.requestId,
              'worker_restart',
              makeError(contractFor('SETTINGS_WORKER_RESTARTED'), 'Le service worker a redémarré.')
            )
          : {}
      ),
      settleReconciledCandidate: assign(({ context, event }) => {
        const snapshot =
          event.type === 'SETTINGS_CAPTURED/RECONCILED'
            ? parsedActionSnapshot(context, event.snapshot)
            : null;
        if (event.type !== 'SETTINGS_CAPTURED/RECONCILED' || snapshot === null) {
          return {};
        }
        return clearPendingIntentPatch(
          context,
          {
            ...adoptSnapshot(context, snapshot),
            mutationOutcome: 'candidate' as const,
            canonicalRelation: 'candidate' as const,
            reconcileRequestId: null,
            reconcileReason: null,
            runtimeEffectError: null,
            error: null,
          },
          'saved',
          terminalSettlement(context, snapshot, event.requestId, event.commandId, null)
        );
      }),
      settleReconciledCancel: assign(({ context, event }) => {
        const snapshot =
          event.type === 'SETTINGS_CAPTURED/RECONCILED'
            ? parsedActionSnapshot(context, event.snapshot)
            : null;
        if (event.type !== 'SETTINGS_CAPTURED/RECONCILED' || snapshot === null) {
          return {};
        }
        return clearPendingIntentPatch(
          context,
          {
            ...adoptSnapshot(context, snapshot),
            mutationOutcome: 'previous' as const,
            canonicalRelation: 'unknown' as const,
            reconcileRequestId: null,
            reconcileReason: null,
            runtimeEffectError: null,
            error: null,
          },
          'saved',
          terminalSettlement(context, snapshot, event.requestId, event.commandId, null)
        );
      }),
      settleReconciledFailure: assign(({ context, event }) => {
        const snapshot =
          event.type === 'SETTINGS_CAPTURED/RECONCILED'
            ? parsedActionSnapshot(context, event.snapshot)
            : null;
        if (
          event.type !== 'SETTINGS_CAPTURED/RECONCILED' ||
          context.mutation === null ||
          snapshot === null
        ) {
          return {};
        }
        const outcome = outcomeFor(snapshot, context.mutation);
        const base = terminalFailure(context, snapshot, outcome);
        if (outcome === null) {
          return {
            ...base,
            deferredCommand: null,
            pendingTerminalSettlement: null,
            pendingTerminalTarget: null,
            terminalSettlement: null,
            command: null,
          };
        }
        return clearPendingIntentPatch(
          context,
          base,
          'failed',
          terminalSettlement(
            context,
            snapshot,
            event.requestId,
            event.commandId,
            base.error ?? null
          )
        );
      }),
      failReconcile: assign(({ event }) => {
        const error =
          event.type === 'SETTINGS_CAPTURED/RECONCILE_FAILED'
            ? parsedEventError(event.error)
            : null;
        return event.type === 'SETTINGS_CAPTURED/RECONCILE_FAILED' && error
          ? {
              canonicalKnowledge: 'unknown' as const,
              error,
              command: null,
            }
          : {};
      }),
      retryReconcile: assign(({ context, event }) =>
        event.type === 'SETTINGS_CAPTURED/RETRY_RECONCILIATION' && context.mutation
          ? reconcilePatch(
              context,
              event.requestId,
              'manual_retry',
              context.error ??
                makeError(contractFor('SETTINGS_RECONCILE_FAILED'), 'Réconciliation requise.')
            )
          : {}
      ),
      dismiss: assign(({ context }) => ({
        phase: 'saved' as const,
        projected: cloneSettings(canonicalSettings(context)),
        mutation: null,
        mutationOutcome: 'unknown' as const,
        canonicalRelation: 'unknown' as const,
        retryIntent: null,
        reconcileRequestId: null,
        reconcileReason: null,
        runtimeEffectError: null,
        error: null,
        lastRejection: null,
        command: null,
      })),
      adoptExternal: assign(({ context, event }) => {
        const snapshot =
          event.type === 'SETTINGS_CAPTURED/CANONICAL_UPDATED'
            ? parsedActionSnapshot(context, event.snapshot)
            : null;
        return snapshot ? { ...adoptSnapshot(context, snapshot), lastRejection: null } : {};
      }),
      reloadDivergentExternal: assign(({ context, event }) =>
        event.type === 'SETTINGS_CAPTURED/CANONICAL_UPDATED'
          ? {
              loadStatus: 'loading' as const,
              loadRequestId: event.nextRequestId,
              canonicalKnowledge: 'unknown' as const,
              error: makeError(
                contractFor('SETTINGS_PROTOCOL_ERROR'),
                'Deux enveloppes différentes partagent la même révision.'
              ),
              command: loadCommand(context.dataEpoch, event.nextRequestId),
            }
          : {}
      ),
      reconcileExternal: assign(({ context, event }) => {
        const snapshot =
          event.type === 'SETTINGS_CAPTURED/CANONICAL_UPDATED'
            ? parsedActionSnapshot(context, event.snapshot)
            : null;
        return event.type === 'SETTINGS_CAPTURED/CANONICAL_UPDATED' && snapshot
          ? {
              ...adoptSnapshot(context, snapshot),
              ...reconcilePatch(
                context,
                event.nextRequestId,
                'external_revision',
                makeError(
                  contractFor('SETTINGS_RECONCILE_FAILED'),
                  'Une révision canonique externe requiert une réconciliation.'
                )
              ),
            }
          : {};
      }),
      prepareReset: assign(({ context, event }) => {
        if (event.type !== 'SETTINGS_CAPTURED/RESET_EPOCH_READY_TO_COMMIT') {
          return {};
        }
        const payload = normalizedResetPayloadForEvent(event);
        return payload
          ? {
              loadStatus: 'reset_pending' as const,
              phase: 'saved' as const,
              canonical: null,
              projected: cloneSettings(context.defaultSettings),
              mutation: null,
              mutationOutcome: 'unknown' as const,
              canonicalKnowledge: 'unknown' as const,
              canonicalRelation: 'unknown' as const,
              retryIntent: null,
              pendingReset: { ...payload },
              reconcileRequestId: null,
              reconcileReason: null,
              runtimeEffectError: null,
              error: null,
              lastRejection: null,
              command: null,
            }
          : {};
      }),
      commitReset: assign(({ context, event }) => {
        if (event.type !== 'SETTINGS_CAPTURED/RESET_EPOCH_COMMITTED') {
          return {};
        }
        const payload = normalizedResetPayloadForEvent(event);
        return payload
          ? {
              loadStatus: 'loading' as const,
              loadRequestId: payload.settingsBootstrapRequestId,
              phase: 'saved' as const,
              canonical: null,
              projected: cloneSettings(context.defaultSettings),
              mutation: null,
              mutationOutcome: 'unknown' as const,
              canonicalKnowledge: 'unknown' as const,
              canonicalRelation: 'unknown' as const,
              retryIntent: null,
              pendingReset: { ...payload },
              reconcileRequestId: null,
              reconcileReason: null,
              runtimeEffectError: null,
              error: null,
              lastRejection: null,
              command: loadCommand(payload.nextDataEpoch, payload.settingsBootstrapRequestId, {
                resetId: payload.resetId,
                nextDataEpoch: payload.nextDataEpoch,
              }),
            }
          : {};
      }),
      resumeResetLoad: assign(({ context }) => {
        const pending = context.pendingReset;
        return pending?.stage === 'committed'
          ? {
              loadStatus: 'loading' as const,
              loadRequestId: pending.settingsBootstrapRequestId,
              canonicalKnowledge: 'unknown' as const,
              error: null,
              command: loadCommand(pending.nextDataEpoch, pending.settingsBootstrapRequestId, {
                resetId: pending.resetId,
                nextDataEpoch: pending.nextDataEpoch,
              }),
            }
          : {};
      }),
    },
  });
}
