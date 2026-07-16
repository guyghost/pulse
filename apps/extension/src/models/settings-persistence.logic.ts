import { assign, setup } from 'xstate';
import type { AppSettings, ThemePreference } from '../lib/core/types/app-settings';
import {
  MAX_SETTINGS_CORRELATION_IDS,
  cloneSettings,
  cloneSettingsSnapshot,
  commandId,
  contractFor,
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
  type SettingMutation,
  type SettingValue,
  type SettingsErrorCode,
  type SettingsMutationOutcomeV1,
  type SettingsPersistenceCommand,
  type SettingsPersistenceContext,
  type SettingsPersistenceError,
  type SettingsPersistenceEvent,
  type SettingsPersistenceInput,
  type SettingsSnapshotV1,
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
    ...(context.reconcileRequestId ? [context.reconcileRequestId] : []),
    ...(context.canonical ? settingsEnvelopeCorrelationIds(context.canonical.envelope) : []),
    ...(context.mutation?.correlationIds ?? []),
    ...(context.retryIntent
      ? [
          context.retryIntent.failedMutationId,
          context.retryIntent.mutationId,
          context.retryIntent.permissionRequestId,
          context.retryIntent.activationId,
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
    event.dataEpoch === context.dataEpoch &&
    context.loadStatus === 'ready' &&
    context.canonicalKnowledge === 'known' &&
    context.canonical !== null &&
    isUuidV4(event.mutationId) &&
    isUuidV4(event.permissionRequestId) &&
    isUuidV4(event.activationId) &&
    isUuidV4(event.storageReservationId) &&
    new Set([
      event.mutationId,
      event.permissionRequestId,
      event.activationId,
      event.storageReservationId,
    ]).size === 4 &&
    areFreshCorrelationIds(context, [
      event.mutationId,
      event.permissionRequestId,
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
        type: 'REQUEST_SETTINGS_PERMISSION',
        commandId: commandId('permission', mutation.permissionRequestId),
        dataEpoch: context.dataEpoch,
        mutationId: mutation.mutationId,
        commandDigest: mutation.commandDigest,
        baseRevision: mutation.baseRevision,
        baseGeneration: mutation.baseGeneration,
        previousDigest: mutation.previousDigest,
        candidateDigest: mutation.candidateDigest,
        correlationIds: [...mutation.correlationIds],
        permissionRequestId: mutation.permissionRequestId,
        activationId: mutation.activationId,
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
    event.permissionRequestId,
    event.activationId,
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
    permissionRequestId: event.permissionRequestId,
    activationId: event.activationId,
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

  return {
    phase: 'reserving',
    projected: cloneSettings(mutation.candidateSettings),
    mutation,
    mutationOutcome: 'unknown',
    canonicalRelation: 'previous',
    error: null,
    runtimeEffectError: null,
    lastRejection: null,
    command: reservationCommand(context, mutation),
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
  const mutation = withCorrelationIds(context.mutation, requestId);

  return {
    phase: 'reconciling',
    canonicalKnowledge: 'unknown',
    mutation,
    reconcileRequestId: requestId,
    reconcileReason: reason,
    retryIntent: null,
    error,
    command: {
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
    },
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

function terminalFailureFromUnknownSnapshot(
  context: SettingsPersistenceContext,
  value: SettingsSnapshotV1
): Partial<SettingsPersistenceContext> {
  const snapshot = parsedActionSnapshot(context, value);
  return snapshot && context.mutation
    ? terminalFailure(context, snapshot, outcomeFor(snapshot, context.mutation))
    : {};
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
    retryIntent.mutationId,
    retryIntent.permissionRequestId,
    retryIntent.activationId,
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
    permissionRequestId: retryIntent.permissionRequestId,
    activationId: retryIntent.activationId,
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
      permissionGranted: ({ context, event }) => {
        if (event.type !== 'SETTINGS_CAPTURED/PERMISSION_GRANTED' || !context.mutation) {
          return false;
        }
        const command = currentCommandOfType(context, 'REQUEST_SETTINGS_PERMISSION');
        return (
          event.dataEpoch === context.dataEpoch &&
          command !== null &&
          commandMatchesMutation(command, context.mutation) &&
          command.permissionRequestId === context.mutation.permissionRequestId &&
          command.activationId === context.mutation.activationId &&
          event.mutationId === command.mutationId &&
          event.commandId === command.commandId
        );
      },
      permissionRefused: ({ context, event }) => {
        if (event.type !== 'SETTINGS_CAPTURED/PERMISSION_REFUSED' || !context.mutation) {
          return false;
        }
        const command = currentCommandOfType(context, 'REQUEST_SETTINGS_PERMISSION');
        const snapshot =
          command === null
            ? null
            : parsedSnapshotMatchingCommand(
                context,
                event.snapshot,
                command.permissionRequestId,
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
          errorMatches(event.error, ['SETTINGS_PERMISSION_REFUSED'], ['permission']) &&
          outcome?.outcome === 'not_committed' &&
          outcome.correlationIds.includes(command.permissionRequestId)
        );
      },
      permissionUnknown: ({ context, event }) => {
        if (event.type !== 'SETTINGS_CAPTURED/PERMISSION_OUTCOME_UNKNOWN' || !context.mutation) {
          return false;
        }
        const command = currentCommandOfType(context, 'REQUEST_SETTINGS_PERMISSION');
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
            ['permission']
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
        context.canonicalKnowledge === 'known' &&
        context.mutation?.mutationId === event.failedMutationId &&
        context.error?.recoverable === true &&
        areFreshCorrelationIds(context, [
          event.mutationId,
          event.permissionRequestId,
          event.activationId,
          event.storageReservationId,
          event.requestId,
        ]) &&
        context.canonical !== null &&
        !context.canonical.envelope.outcomes.some(
          (outcome) => outcome.mutationId === event.mutationId
        ) &&
        new Set([
          event.mutationId,
          event.permissionRequestId,
          event.activationId,
          event.storageReservationId,
          event.requestId,
          event.failedMutationId,
        ]).size === 6,
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
          canAppendCorrelationIds(context.mutation, event.nextRequestId) &&
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
          canAppendCorrelationIds(context.mutation, event.nextRequestId) &&
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
      settleNoOp: assign(({ context }) => ({
        phase: 'saved' as const,
        projected: cloneSettings(canonicalSettings(context)),
        mutation: null,
        mutationOutcome: 'previous' as const,
        canonicalRelation: 'previous' as const,
        runtimeEffectError: null,
        error: null,
        lastRejection: null,
        command: null,
      })),
      beginReservation: assign(({ context, event }) =>
        event.type === 'SETTINGS_CAPTURED/MUTATE' ? beginMutation(context, event) : {}
      ),
      rejectInvalid: assign(() => ({
        lastRejection: makeError(
          contractFor('SETTINGS_INVALID', 'previous'),
          'Réglage ou identifiants invalides.'
        ),
      })),
      rejectLedgerFull: assign(() => {
        const error = makeError(
          contractFor('SETTINGS_LEDGER_QUOTA_EXHAUSTED'),
          'Le budget durable settings de cet epoch est épuisé; un reset explicite est requis.'
        );
        return { phase: 'failed' as const, error, lastRejection: error, command: null };
      }),
      rejectRevisionExhausted: assign(() => {
        const error = makeError(
          contractFor('SETTINGS_REVISION_EXHAUSTED'),
          'La révision settings ne peut plus avancer sans dépasser la limite sûre.'
        );
        return { phase: 'failed' as const, error, lastRejection: error, command: null };
      }),
      rejectGenerationExhausted: assign(() => {
        const error = makeError(
          contractFor('SETTINGS_GENERATION_EXHAUSTED'),
          'La génération settings ne peut plus réserver les quatre écritures transactionnelles.'
        );
        return { phase: 'failed' as const, error, lastRejection: error, command: null };
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
        return {
          phase: 'permission' as const,
          mutation,
          command: permissionCommand(context, mutation),
        };
      }),
      installReservationWrite: assign(({ context, event }) => {
        if (event.type !== 'SETTINGS_CAPTURED/STORAGE_RESERVATION_GRANTED' || !context.mutation) {
          return {};
        }
        const mutation: SettingMutation = {
          ...context.mutation,
          storageReservationProof: event.proof,
        };
        return {
          phase: 'writing' as const,
          mutation,
          command: writeCommand(context, mutation),
        };
      }),
      rejectGlobalStorageQuota: assign(({ context, event }) => {
        if (event.type !== 'SETTINGS_CAPTURED/STORAGE_RESERVATION_DENIED' || !context.mutation) {
          return {};
        }
        const error = parsedEventError(event.error);
        if (error === null) {
          return {};
        }
        return {
          phase: 'failed' as const,
          projected: cloneSettings(canonicalSettings(context)),
          mutationOutcome: 'previous' as const,
          canonicalRelation: 'previous' as const,
          retryIntent: null,
          runtimeEffectError: null,
          error,
          lastRejection: error,
          command: null,
        };
      }),
      installPermission: assign(({ context, event }) => {
        if (event.type !== 'SETTINGS_CAPTURED/PERMISSION_GRANTED' || !context.mutation) {
          return {};
        }
        const mutation = { ...context.mutation, permissionProof: event.proof };
        return {
          phase: 'writing' as const,
          mutation,
          runtimeEffectError: null,
          command: writeCommand(context, mutation),
        };
      }),
      settlePermissionRefusal: assign(({ context, event }) => {
        if (event.type !== 'SETTINGS_CAPTURED/PERMISSION_REFUSED' || !context.mutation) {
          return {};
        }
        const error = parsedEventError(event.error);
        if (error === null) {
          return {};
        }
        return {
          ...terminalFailureFromUnknownSnapshot(context, event.snapshot),
          error,
        };
      }),
      reconcilePermission: assign(({ context, event }) => {
        const error =
          event.type === 'SETTINGS_CAPTURED/PERMISSION_OUTCOME_UNKNOWN'
            ? parsedEventError(event.error)
            : null;
        return event.type === 'SETTINGS_CAPTURED/PERMISSION_OUTCOME_UNKNOWN' && error
          ? reconcilePatch(context, event.nextRequestId, 'permission_unknown', error)
          : {};
      }),
      commitSave: assign(({ context, event }) => {
        const snapshot =
          event.type === 'SETTINGS_CAPTURED/SAVE_SUCCEEDED'
            ? parsedActionSnapshot(context, event.snapshot)
            : null;
        return event.type === 'SETTINGS_CAPTURED/SAVE_SUCCEEDED' && snapshot
          ? {
              ...adoptSnapshot(context, snapshot),
              phase: 'saved' as const,
              mutation: null,
              mutationOutcome: 'candidate' as const,
              canonicalRelation: 'candidate' as const,
              retryIntent: null,
              reconcileRequestId: null,
              reconcileReason: null,
              runtimeEffectError: null,
              error: null,
              command: null,
            }
          : {};
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
        return {
          phase: 'compensating' as const,
          mutation,
          runtimeEffectError: error,
          error,
          command: {
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
          },
        };
      }),
      settleCompensation: assign(({ context, event }) =>
        event.type === 'SETTINGS_CAPTURED/COMPENSATION_SUCCEEDED' && context.mutation
          ? terminalFailureFromUnknownSnapshot(context, event.snapshot)
          : {}
      ),
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
          permissionRequestId: event.permissionRequestId,
          activationId: event.activationId,
          storageReservationId: event.storageReservationId,
          requestId: event.requestId,
        };
        return {
          phase: 'rebasing' as const,
          retryIntent,
          error: null,
          command: {
            type: 'REBASE_SETTINGS_MUTATION' as const,
            commandId: commandId('rebase', event.requestId),
            dataEpoch: context.dataEpoch,
            requestId: event.requestId,
            mutationId: event.mutationId,
          },
        };
      }),
      settleRetryNoOp: assign(({ context, event }) => {
        const base =
          event.type === 'SETTINGS_CAPTURED/RETRY_READY' ? retryBase(context, event) : null;
        return event.type === 'SETTINGS_CAPTURED/RETRY_READY' && base
          ? {
              ...adoptSnapshot(context, base.snapshot),
              phase: 'saved' as const,
              mutation: null,
              mutationOutcome: 'previous' as const,
              canonicalRelation: 'candidate' as const,
              retryIntent: null,
              runtimeEffectError: null,
              error: null,
              command: null,
            }
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
        return {
          ...adoptSnapshot(context, base.snapshot),
          phase: 'reserving' as const,
          projected: cloneSettings(base.candidate),
          mutation,
          canonicalRelation: 'previous' as const,
          retryIntent: null,
          runtimeEffectError: null,
          command: reservationCommand(rebasedContext, mutation),
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
        return {
          ...adoptSnapshot(context, base.snapshot),
          phase: 'failed' as const,
          retryIntent: null,
          runtimeEffectError: null,
          error,
          lastRejection: error,
          command: null,
        };
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
        return {
          ...adoptSnapshot(context, base.snapshot),
          phase: 'failed' as const,
          retryIntent: null,
          runtimeEffectError: null,
          error,
          lastRejection: error,
          command: null,
        };
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
        return {
          ...adoptSnapshot(context, base.snapshot),
          phase: 'failed' as const,
          retryIntent: null,
          runtimeEffectError: null,
          error,
          lastRejection: error,
          command: null,
        };
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
        phase: 'saved' as const,
        projected: cloneSettings(canonicalSettings(context)),
        mutation: null,
        mutationOutcome: 'unknown' as const,
        canonicalRelation: 'unknown' as const,
        retryIntent: null,
        runtimeEffectError: null,
        error: null,
        command: null,
      })),
      beginCancel: assign(({ context, event }) => {
        if (event.type !== 'SETTINGS_CAPTURED/CANCEL' || !context.mutation) {
          return {};
        }
        const mutation = withCorrelationIds(context.mutation, event.requestId);
        return {
          phase: 'cancelling' as const,
          mutation,
          command: {
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
          },
        };
      }),
      confirmCancel: assign(({ context, event }) => {
        const snapshot =
          event.type === 'SETTINGS_CAPTURED/CANCEL_CONFIRMED'
            ? parsedActionSnapshot(context, event.snapshot)
            : null;
        return event.type === 'SETTINGS_CAPTURED/CANCEL_CONFIRMED' && snapshot
          ? {
              ...adoptSnapshot(context, snapshot),
              phase: 'saved' as const,
              mutation: null,
              mutationOutcome: 'previous' as const,
              canonicalRelation: 'unknown' as const,
              runtimeEffectError: null,
              error: null,
              command: null,
            }
          : {};
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
        return event.type === 'SETTINGS_CAPTURED/RECONCILED' && snapshot
          ? {
              ...adoptSnapshot(context, snapshot),
              phase: 'saved' as const,
              mutation: null,
              mutationOutcome: 'candidate' as const,
              canonicalRelation: 'candidate' as const,
              reconcileRequestId: null,
              reconcileReason: null,
              runtimeEffectError: null,
              error: null,
              command: null,
            }
          : {};
      }),
      settleReconciledCancel: assign(({ context, event }) => {
        const snapshot =
          event.type === 'SETTINGS_CAPTURED/RECONCILED'
            ? parsedActionSnapshot(context, event.snapshot)
            : null;
        return event.type === 'SETTINGS_CAPTURED/RECONCILED' && snapshot
          ? {
              ...adoptSnapshot(context, snapshot),
              phase: 'saved' as const,
              mutation: null,
              mutationOutcome: 'previous' as const,
              canonicalRelation: 'unknown' as const,
              reconcileRequestId: null,
              reconcileReason: null,
              runtimeEffectError: null,
              error: null,
              command: null,
            }
          : {};
      }),
      settleReconciledFailure: assign(({ context, event }) =>
        event.type === 'SETTINGS_CAPTURED/RECONCILED' && context.mutation
          ? terminalFailureFromUnknownSnapshot(context, event.snapshot)
          : {}
      ),
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
