import type { ApplicationStatus, MissionTracking } from '../lib/core/types/tracking';

export type MutationId = string;
export type TrackingDataEpoch = MutationId;
export type TrackingMutationIntentV2 = 'transition' | 'details' | 'restore';

export type ActorScope = { dataEpoch: TrackingDataEpoch; missionId: string };
export type Correlation = ActorScope & { mutationId: MutationId };

export type TrackingControlIdentityV2 = Correlation & {
  intent: TrackingMutationIntentV2;
  commandDigest: string;
};

export interface SerializedApplicationTrackingErrorV2 {
  version: 2;
  dataEpoch: TrackingDataEpoch | null;
  requestId: MutationId | null;
  code:
    | 'LOAD_FAILED'
    | 'PERSIST_FAILED'
    | 'INVALID_TRANSITION'
    | 'INVALID_DETAILS'
    | 'INVALID_RESTORE'
    | 'TRANSPORT_ERROR'
    | 'PROTOCOL_ERROR'
    | 'STALE_UNDO'
    | 'APPLICATION_BUSY'
    | 'CANCELLED'
    | 'WORKER_RESTARTED'
    | 'EPOCH_CHANGED';
  intent: 'load' | TrackingMutationIntentV2;
  missionId: string | null;
  mutationId: MutationId | null;
  message: string;
  recoverable: boolean;
}

export interface PersistedTrackingEnvelopeV2 extends ActorScope {
  schemaVersion: 2;
  kind: 'record' | 'tombstone';
  tracking: MissionTracking | null;
  revision: number;
  lastMutationId: MutationId | null;
  lastMutationIntent: TrackingMutationIntentV2 | null;
  committedAt: number;
  undoBase: {
    previousTracking: MissionTracking | null;
    expectedCurrentRevision: number;
    expectedCurrentMutationId: MutationId;
  } | null;
}

export interface TrackingRevisionTokenV2 {
  dataEpoch: TrackingDataEpoch;
  revision: number;
  lastMutationId: MutationId | null;
}

export type TrackingMutationCommandV2 =
  | (Correlation & { intent: 'transition'; status: ApplicationStatus; note: string | null })
  | (Correlation & { intent: 'details'; nextActionAt: string | null })
  | (Correlation & {
      intent: 'restore';
      previousTracking: MissionTracking | null;
      expectedCurrentRevision: number;
      expectedCurrentMutationId: MutationId;
    });

export interface ActiveTrackingMutationV2 {
  command: TrackingMutationCommandV2;
  commandDigest: string;
  actorBase: TrackingRevisionTokenV2;
  preparedBase: TrackingRevisionTokenV2 | null;
  cancelRequested: boolean;
}

export interface PreparedTrackingCandidateV2 {
  tracking: MissionTracking | null;
  committedAt: number;
}

export interface TrackingUndoTokenV2 extends ActorScope {
  version: 2;
  previousTracking: MissionTracking | null;
  expectedCurrentRevision: number;
  expectedCurrentMutationId: MutationId;
}

export interface SettlementIdentity extends TrackingControlIdentityV2 {
  version: 2;
  deduplicated: boolean;
}

export interface CommittedCurrentSettlement extends SettlementIdentity {
  outcome: 'committed_current';
  canonical: PersistedTrackingEnvelopeV2;
  committedRevision: number;
  undo: TrackingUndoTokenV2;
  failure: null;
  broadcastRequired: boolean;
}

export interface CommittedSupersededSettlement extends SettlementIdentity {
  outcome: 'committed_superseded';
  canonical: PersistedTrackingEnvelopeV2;
  committedRevision: number;
  undo: null;
  failure: null;
  broadcastRequired: false;
}

export interface FailedSettlement extends SettlementIdentity {
  outcome: 'not_committed' | 'inconsistent' | 'uncertain';
  canonical: PersistedTrackingEnvelopeV2 | null;
  committedRevision: null;
  undo: null;
  failure: SerializedApplicationTrackingErrorV2;
  broadcastRequired: false;
}

export type TrackingSettlementV2 =
  CommittedCurrentSettlement | CommittedSupersededSettlement | FailedSettlement;

export type TrackingPreflightDecisionV2 =
  | { kind: 'ACCEPTED'; active: ActiveTrackingMutationV2 }
  | { kind: 'REJECTED'; settlement: TrackingSettlementV2 }
  | {
      kind: 'TERMINAL_FAILURE';
      active: ActiveTrackingMutationV2;
      error: SerializedApplicationTrackingErrorV2;
    };

export type EffectSeed =
  | ({ type: 'READ_CANONICAL' } & ActorScope)
  | { type: 'WRITE_PREPARED_CHECKPOINT'; active: ActiveTrackingMutationV2 }
  | {
      type: 'RECORD_TERMINAL_SETTLEMENT';
      active: ActiveTrackingMutationV2;
      error: SerializedApplicationTrackingErrorV2;
    }
  | {
      type: 'COMMIT_TRANSACTION';
      active: ActiveTrackingMutationV2;
      candidate: PreparedTrackingCandidateV2;
    }
  | { type: 'RECORD_CANCELLATION'; active: ActiveTrackingMutationV2 }
  | { type: 'ABORT_TRANSACTION'; active: ActiveTrackingMutationV2 }
  | ({ type: 'READ_SETTLEMENT' } & TrackingControlIdentityV2)
  | ({ type: 'JOIN_ACTIVE' } & TrackingControlIdentityV2)
  | { type: 'PUBLISH_SETTLEMENT'; settlement: TrackingSettlementV2 }
  | { type: 'BROADCAST_ENVELOPE'; envelope: PersistedTrackingEnvelopeV2 }
  | ({
      type: 'INVALIDATE_ACTOR';
      resetId: MutationId;
      nextDataEpoch: TrackingDataEpoch;
      terminalSettlements: readonly TrackingSettlementV2[];
    } & ActorScope);

export type EffectPhase =
  | 'hydrate'
  | 'tx_a'
  | 'tx_b'
  | 'record_terminal'
  | 'record_cancel'
  | 'abort_tx_b'
  | 'reconcile'
  | 'publish'
  | 'broadcast'
  | 'invalidate';

export type TrackingEffectCommand = EffectSeed & { commandId: number; generation: number };

export interface RunningEffect {
  commandId: number;
  generation: number;
  phase: EffectPhase;
  kind: TrackingEffectCommand['type'];
  control: TrackingControlIdentityV2 | null;
  expectedTerminalFailureFingerprint: string | null;
}

export interface ApplicationTrackingMachineContext extends ActorScope {
  workerEpoch: MutationId;
  generation: number;
  canonical: PersistedTrackingEnvelopeV2 | null;
  active: ActiveTrackingMutationV2 | null;
  candidate: PreparedTrackingCandidateV2 | null;
  txPhase: 'none' | 'queued' | 'running';
  cancellationPhase: 'none' | 'awaiting_tx_a' | 'recording' | 'aborting_tx_b';
  reconcilingControl: TrackingControlIdentityV2 | null;
  settlement: TrackingSettlementV2 | null;
  resumeAfterSettlement: 'ready' | 'failed';
  error: SerializedApplicationTrackingErrorV2 | null;
  fenced: boolean;
  nextCommandId: number;
  commands: readonly TrackingEffectCommand[];
  runningEffects: readonly RunningEffect[];
}

export interface ApplicationTrackingMachineInput extends ActorScope {
  workerEpoch: MutationId;
}

export type ResultIdentity = Correlation & { commandId: number; generation: number };
export type SettlementResult = ResultIdentity & { settlement: TrackingSettlementV2 };

export type ControlRequest = TrackingControlIdentityV2 & {
  type: 'CANCEL_MUTATION' | 'RECONCILE_MUTATION';
  protocolSettlement: TrackingSettlementV2;
};

export type ApplicationTrackingMachineEvent =
  | { type: 'HYDRATE' }
  | { type: 'COMMAND_STARTED'; commandId: number; generation: number }
  | ({
      type: 'CANONICAL_LOADED';
      canonical: PersistedTrackingEnvelopeV2 | null;
      commandId: number;
      generation: number;
    } & ActorScope)
  | ({
      type: 'HYDRATION_FAILED';
      error: SerializedApplicationTrackingErrorV2;
      commandId: number;
      generation: number;
    } & ActorScope)
  | {
      type: 'REQUEST_MUTATION';
      decision: TrackingPreflightDecisionV2;
      busySettlement: TrackingSettlementV2;
      protocolSettlement: TrackingSettlementV2;
    }
  | ControlRequest
  | ({
      type: 'TX_A_PREPARED';
      preparedBase: TrackingRevisionTokenV2;
      candidate: PreparedTrackingCandidateV2;
    } & ResultIdentity)
  | ({ type: 'TX_A_SETTLED' } & SettlementResult)
  | ({ type: 'TX_A_UNCERTAIN' } & ResultIdentity)
  | ({ type: 'TERMINAL_SETTLEMENT_RECORDED' } & SettlementResult)
  | ({ type: 'TERMINAL_SETTLEMENT_UNCERTAIN' } & SettlementResult)
  | ({ type: 'TX_B_COMMITTED' } & SettlementResult)
  | ({ type: 'TX_B_SETTLED' } & SettlementResult)
  | ({ type: 'TX_B_UNCERTAIN' } & ResultIdentity)
  | ({ type: 'TX_B_ABORTED' } & ResultIdentity)
  | ({ type: 'ABORT_REJECTED' } & ResultIdentity)
  | ({ type: 'CANCELLATION_RECORDED' } & SettlementResult)
  | ({ type: 'CANCELLATION_FAILED' } & ResultIdentity)
  | ({ type: 'CONTROL_RECONCILED' } & SettlementResult & TrackingControlIdentityV2)
  | ({
      type: 'PUBLICATION_ATTEMPTED';
      delivered: boolean;
      commandId: number;
      generation: number;
    } & TrackingControlIdentityV2)
  | { type: 'BROADCAST_ATTEMPTED'; commandId: number; generation: number }
  | { type: 'INVALIDATION_ATTEMPTED'; commandId: number; generation: number }
  | ({ type: 'SERVICE_WORKER_RESTARTED'; workerEpoch: MutationId } & Correlation)
  | ({
      type: 'RESET_INVALIDATED';
      resetId: MutationId;
      nextDataEpoch: TrackingDataEpoch;
      terminalSettlements: readonly TrackingSettlementV2[];
    } & ActorScope);

export function activeIdentity(active: ActiveTrackingMutationV2): TrackingControlIdentityV2 {
  return {
    dataEpoch: active.command.dataEpoch,
    missionId: active.command.missionId,
    mutationId: active.command.mutationId,
    intent: active.command.intent,
    commandDigest: active.commandDigest,
  };
}

export function identityEquals(left: TrackingControlIdentityV2, right: TrackingControlIdentityV2) {
  return (
    left.dataEpoch === right.dataEpoch &&
    left.missionId === right.missionId &&
    left.mutationId === right.mutationId &&
    left.intent === right.intent &&
    left.commandDigest === right.commandDigest
  );
}

export function commandDigestValid(value: string) {
  return /^[0-9a-f]{64}$/.test(value);
}

export function canonicalUuidV4Valid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
}

export function terminalFailureFingerprint(error: SerializedApplicationTrackingErrorV2) {
  return JSON.stringify([
    error.version,
    error.dataEpoch,
    error.requestId,
    error.code,
    error.intent,
    error.missionId,
    error.mutationId,
    error.message,
    error.recoverable,
  ]);
}

export function effectPhase(command: TrackingEffectCommand): EffectPhase {
  switch (command.type) {
    case 'READ_CANONICAL':
      return 'hydrate';
    case 'WRITE_PREPARED_CHECKPOINT':
      return 'tx_a';
    case 'COMMIT_TRANSACTION':
      return 'tx_b';
    case 'RECORD_TERMINAL_SETTLEMENT':
      return 'record_terminal';
    case 'RECORD_CANCELLATION':
      return 'record_cancel';
    case 'ABORT_TRANSACTION':
      return 'abort_tx_b';
    case 'READ_SETTLEMENT':
      return 'reconcile';
    case 'PUBLISH_SETTLEMENT':
    case 'JOIN_ACTIVE':
      return 'publish';
    case 'BROADCAST_ENVELOPE':
      return 'broadcast';
    case 'INVALIDATE_ACTOR':
      return 'invalidate';
  }
}

export function commandIdentity(command: TrackingEffectCommand): TrackingControlIdentityV2 | null {
  switch (command.type) {
    case 'WRITE_PREPARED_CHECKPOINT':
    case 'RECORD_TERMINAL_SETTLEMENT':
    case 'COMMIT_TRANSACTION':
    case 'RECORD_CANCELLATION':
    case 'ABORT_TRANSACTION':
      return activeIdentity(command.active);
    case 'READ_SETTLEMENT':
    case 'JOIN_ACTIVE':
      return command;
    case 'PUBLISH_SETTLEMENT':
      return command.settlement;
    default:
      return null;
  }
}

export function appendCommands(context: ApplicationTrackingMachineContext, ...seeds: EffectSeed[]) {
  let nextCommandId = context.nextCommandId;
  const additions = seeds.map((seed) => ({
    ...seed,
    commandId: ++nextCommandId,
    generation: context.generation,
  }));
  return { nextCommandId, commands: [...context.commands, ...additions] };
}

export function actorMatches(context: ApplicationTrackingMachineContext, value: ActorScope) {
  return value.dataEpoch === context.dataEpoch && value.missionId === context.missionId;
}

export function activeMatches(context: ApplicationTrackingMachineContext, value: Correlation) {
  return actorMatches(context, value) && value.mutationId === context.active?.command.mutationId;
}

export function baseMatchesCanonical(
  context: ApplicationTrackingMachineContext,
  active: ActiveTrackingMutationV2
) {
  return (
    active.actorBase.dataEpoch === context.dataEpoch &&
    active.actorBase.revision === (context.canonical?.revision ?? 0) &&
    active.actorBase.lastMutationId === (context.canonical?.lastMutationId ?? null)
  );
}

export function envelopeMatchesScope(
  scope: ActorScope,
  envelope: PersistedTrackingEnvelopeV2 | null
) {
  if (envelope === null) {
    return true;
  }
  const identityValid =
    envelope.schemaVersion === 2 &&
    envelope.dataEpoch === scope.dataEpoch &&
    envelope.missionId === scope.missionId &&
    Number.isSafeInteger(envelope.revision) &&
    envelope.revision >= 1 &&
    Number.isFinite(envelope.committedAt) &&
    envelope.committedAt >= 0;
  const valueValid =
    (envelope.kind === 'record' && envelope.tracking?.missionId === scope.missionId) ||
    (envelope.kind === 'tombstone' && envelope.tracking === null);
  const mutationValid =
    (envelope.lastMutationId === null && envelope.lastMutationIntent === null) ||
    (envelope.lastMutationId !== null && envelope.lastMutationIntent !== null);
  const undoValid =
    envelope.undoBase === null ||
    (envelope.lastMutationId !== null &&
      Number.isSafeInteger(envelope.undoBase.expectedCurrentRevision) &&
      envelope.undoBase.expectedCurrentRevision === envelope.revision &&
      envelope.undoBase.expectedCurrentMutationId === envelope.lastMutationId &&
      (envelope.undoBase.previousTracking === null ||
        envelope.undoBase.previousTracking.missionId === scope.missionId));
  return identityValid && valueValid && mutationValid && undoValid;
}

export function canonicalDoesNotRegress(
  context: ApplicationTrackingMachineContext,
  canonical: PersistedTrackingEnvelopeV2 | null
) {
  if (!envelopeMatchesScope(context, canonical)) {
    return false;
  }
  if (context.canonical === null) {
    return true;
  }
  if (canonical === null || canonical.revision < context.canonical.revision) {
    return false;
  }
  return (
    canonical.revision > context.canonical.revision ||
    JSON.stringify(canonical) === JSON.stringify(context.canonical)
  );
}

export function errorMatchesSettlement(settlement: TrackingSettlementV2) {
  if (settlement.failure === null) {
    return (
      settlement.outcome === 'committed_current' || settlement.outcome === 'committed_superseded'
    );
  }
  const error = settlement.failure;
  const intentAllowed =
    (error.code === 'LOAD_FAILED' && error.intent === 'load') ||
    (error.code === 'INVALID_TRANSITION' && error.intent === 'transition') ||
    (error.code === 'INVALID_DETAILS' && error.intent === 'details') ||
    ((error.code === 'INVALID_RESTORE' || error.code === 'STALE_UNDO') &&
      error.intent === 'restore') ||
    (error.code !== 'LOAD_FAILED' &&
      error.code !== 'INVALID_TRANSITION' &&
      error.code !== 'INVALID_DETAILS' &&
      error.code !== 'INVALID_RESTORE' &&
      error.code !== 'STALE_UNDO' &&
      error.intent !== 'load');
  const recoverable = new Set<SerializedApplicationTrackingErrorV2['code']>([
    'LOAD_FAILED',
    'PERSIST_FAILED',
    'TRANSPORT_ERROR',
    'PROTOCOL_ERROR',
    'APPLICATION_BUSY',
    'CANCELLED',
    'WORKER_RESTARTED',
    'EPOCH_CHANGED',
  ]).has(error.code);
  const identityValid =
    error.version === 2 &&
    error.dataEpoch === settlement.dataEpoch &&
    error.requestId === null &&
    error.intent === settlement.intent &&
    error.missionId === settlement.missionId &&
    error.mutationId === settlement.mutationId &&
    error.recoverable === recoverable;
  if (!identityValid || !intentAllowed) {
    return false;
  }
  if (settlement.outcome === 'inconsistent') {
    return error.code === 'PROTOCOL_ERROR';
  }
  if (settlement.outcome === 'uncertain') {
    return ['PERSIST_FAILED', 'TRANSPORT_ERROR', 'WORKER_RESTARTED'].includes(error.code);
  }
  return settlement.outcome === 'not_committed';
}

export function settlementMatchesIdentity(
  context: ApplicationTrackingMachineContext,
  settlement: TrackingSettlementV2,
  identity: TrackingControlIdentityV2
) {
  if (
    settlement.version !== 2 ||
    !actorMatches(context, settlement) ||
    !commandDigestValid(settlement.commandDigest) ||
    !commandDigestValid(identity.commandDigest) ||
    !identityEquals(settlement, identity) ||
    !canonicalDoesNotRegress(context, settlement.canonical) ||
    !errorMatchesSettlement(settlement)
  ) {
    return false;
  }
  if (settlement.outcome === 'committed_current') {
    const undoBase = settlement.canonical.undoBase;
    return (
      Number.isSafeInteger(settlement.committedRevision) &&
      settlement.committedRevision >= 1 &&
      settlement.canonical.revision === settlement.committedRevision &&
      settlement.canonical.lastMutationId === settlement.mutationId &&
      settlement.canonical.lastMutationIntent === settlement.intent &&
      undoBase !== null &&
      settlement.undo.version === 2 &&
      settlement.undo.dataEpoch === settlement.dataEpoch &&
      settlement.undo.missionId === settlement.missionId &&
      settlement.undo.expectedCurrentRevision === settlement.committedRevision &&
      settlement.undo.expectedCurrentMutationId === settlement.mutationId &&
      settlement.undo.expectedCurrentRevision === undoBase.expectedCurrentRevision &&
      settlement.undo.expectedCurrentMutationId === undoBase.expectedCurrentMutationId &&
      JSON.stringify(settlement.undo.previousTracking) ===
        JSON.stringify(undoBase.previousTracking) &&
      settlement.broadcastRequired === !settlement.deduplicated
    );
  }
  if (settlement.outcome === 'committed_superseded') {
    return (
      Number.isSafeInteger(settlement.committedRevision) &&
      settlement.committedRevision >= 1 &&
      settlement.canonical.revision > settlement.committedRevision
    );
  }
  return true;
}

export function pendingCommand(
  context: ApplicationTrackingMachineContext,
  event: Extract<ApplicationTrackingMachineEvent, { type: 'COMMAND_STARTED' }>
) {
  return context.commands.find(
    (command) =>
      command.commandId === event.commandId &&
      command.generation === event.generation &&
      command.generation === context.generation
  );
}

export function runningEffect(
  context: ApplicationTrackingMachineContext,
  event: { commandId: number; generation: number },
  phase: EffectPhase
) {
  return context.runningEffects.find(
    (effect) =>
      effect.commandId === event.commandId &&
      effect.generation === event.generation &&
      effect.generation === context.generation &&
      effect.phase === phase
  );
}

export function completeEffect(
  context: ApplicationTrackingMachineContext,
  event: { commandId: number; generation: number }
) {
  return {
    runningEffects: context.runningEffects.filter(
      (effect) => effect.commandId !== event.commandId || effect.generation !== event.generation
    ),
  };
}

const MUTATION_COMMAND_TYPES: readonly TrackingEffectCommand['type'][] = [
  'WRITE_PREPARED_CHECKPOINT',
  'RECORD_TERMINAL_SETTLEMENT',
  'COMMIT_TRANSACTION',
  'RECORD_CANCELLATION',
  'ABORT_TRANSACTION',
];

const MUTATION_EFFECT_PHASES: readonly EffectPhase[] = [
  'tx_a',
  'tx_b',
  'record_terminal',
  'record_cancel',
  'abort_tx_b',
];

interface CompletionCleanup {
  removePendingTypes?: readonly TrackingEffectCommand['type'][];
  removeRunningPhases?: readonly EffectPhase[];
}

export function completeEffectAndAppendCommands(
  context: ApplicationTrackingMachineContext,
  event: { commandId: number; generation: number },
  successors: readonly EffectSeed[],
  cleanup: CompletionCleanup = {}
) {
  const removedPendingTypes = new Set(cleanup.removePendingTypes ?? []);
  const removedRunningPhases = new Set(cleanup.removeRunningPhases ?? []);
  const runningEffects = completeEffect(context, event).runningEffects.filter(
    (effect) => !removedRunningPhases.has(effect.phase)
  );
  const base: ApplicationTrackingMachineContext = {
    ...context,
    commands: context.commands.filter((command) => !removedPendingTypes.has(command.type)),
    runningEffects,
  };
  return {
    runningEffects,
    ...appendCommands(base, ...successors),
  };
}

export function mutationCommandsRemoved(context: ApplicationTrackingMachineContext) {
  const mutationTypes = new Set<TrackingEffectCommand['type']>(MUTATION_COMMAND_TYPES);
  return context.commands.filter((command) => !mutationTypes.has(command.type));
}

export function operationSettled(
  context: ApplicationTrackingMachineContext,
  event: SettlementResult,
  settlement: TrackingSettlementV2
) {
  const commands: EffectSeed[] = [{ type: 'PUBLISH_SETTLEMENT', settlement }];
  if (settlement.broadcastRequired) {
    commands.push({ type: 'BROADCAST_ENVELOPE', envelope: settlement.canonical });
  }
  const completed = completeEffectAndAppendCommands(context, event, commands, {
    removePendingTypes: MUTATION_COMMAND_TYPES,
    removeRunningPhases: MUTATION_EFFECT_PHASES,
  });
  return {
    canonical: settlement.canonical,
    active: null,
    candidate: null,
    txPhase: 'none' as const,
    cancellationPhase: 'none' as const,
    reconcilingControl: null,
    settlement,
    resumeAfterSettlement:
      settlement.outcome === 'inconsistent' || settlement.outcome === 'uncertain'
        ? ('failed' as const)
        : ('ready' as const),
    error: settlement.failure,
    fenced: settlement.outcome === 'inconsistent' || settlement.outcome === 'uncertain',
    ...completed,
  };
}

export function controlFromEvent(
  context: ApplicationTrackingMachineContext,
  event: ApplicationTrackingMachineEvent
): TrackingControlIdentityV2 | null {
  if (event.type === 'CANCEL_MUTATION' || event.type === 'RECONCILE_MUTATION') {
    return event;
  }
  if (event.type === 'REQUEST_MUTATION' && event.decision.kind === 'ACCEPTED') {
    return activeIdentity(event.decision.active);
  }
  return context.active ? activeIdentity(context.active) : context.reconcilingControl;
}

export function pendingCallerIdentities(context: ApplicationTrackingMachineContext) {
  const identities: TrackingControlIdentityV2[] = [];
  const add = (identity: TrackingControlIdentityV2 | null) => {
    if (identity && !identities.some((candidate) => identityEquals(candidate, identity))) {
      identities.push(identity);
    }
  };
  add(context.active ? activeIdentity(context.active) : null);
  add(context.reconcilingControl);
  add(context.settlement);
  for (const command of context.commands) {
    add(commandIdentity(command));
  }
  for (const effect of context.runningEffects) {
    add(effect.control);
  }
  return identities;
}
