import { createActor } from 'xstate';
import { describe, expect, it } from 'vitest';
import { applicationTrackingMachine } from '../../../src/models/application-tracking.machine';
import type {
  ActiveTrackingMutationV2,
  FailedSettlement,
  PersistedTrackingEnvelopeV2,
  SerializedApplicationTrackingErrorV2,
  TrackingControlIdentityV2,
  TrackingEffectCommand,
  TrackingSettlementV2,
} from '../../../src/models/application-tracking.machine.contract';
import type { MissionTracking } from '../../../src/lib/core/types/tracking';

const DATA_EPOCH = '11111111-1111-4111-8111-111111111111';
const NEXT_DATA_EPOCH = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const WORKER_EPOCH = '33333333-3333-4333-8333-333333333333';
const MUTATION_ID = '44444444-4444-4444-8444-444444444444';
const OTHER_MUTATION_ID = '55555555-5555-4555-8555-555555555555';
const RESET_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const MISSION_ID = 'mission-model-trace';
const DIGEST = 'a'.repeat(64);
const OTHER_DIGEST = 'b'.repeat(64);

function tracking(status: MissionTracking['currentStatus'] = 'selected'): MissionTracking {
  return {
    missionId: MISSION_ID,
    currentStatus: status,
    history: [{ from: null, to: status, timestamp: 1, note: null }],
    generatedAssetIds: [],
    userRating: null,
    notes: '',
    nextActionAt: null,
  };
}

function activeMutation(
  revision = 0,
  lastMutationId: string | null = null,
  mutationId = MUTATION_ID,
  commandDigest = DIGEST
): ActiveTrackingMutationV2 {
  return {
    command: {
      dataEpoch: DATA_EPOCH,
      missionId: MISSION_ID,
      mutationId,
      intent: 'transition',
      status: 'selected',
      note: null,
    },
    commandDigest,
    actorBase: { dataEpoch: DATA_EPOCH, revision, lastMutationId },
    preparedBase: null,
    cancelRequested: false,
  };
}

function identity(active: ActiveTrackingMutationV2): TrackingControlIdentityV2 {
  return {
    dataEpoch: active.command.dataEpoch,
    missionId: active.command.missionId,
    mutationId: active.command.mutationId,
    intent: active.command.intent,
    commandDigest: active.commandDigest,
  };
}

function failure(
  active: ActiveTrackingMutationV2,
  code: SerializedApplicationTrackingErrorV2['code']
): SerializedApplicationTrackingErrorV2 {
  return {
    version: 2,
    dataEpoch: active.command.dataEpoch,
    requestId: null,
    code,
    intent: active.command.intent,
    missionId: active.command.missionId,
    mutationId: active.command.mutationId,
    message: `trace:${code}`,
    recoverable: ![
      'INVALID_TRANSITION',
      'INVALID_DETAILS',
      'INVALID_RESTORE',
      'STALE_UNDO',
    ].includes(code),
  };
}

function failedSettlement(
  active: ActiveTrackingMutationV2,
  code: SerializedApplicationTrackingErrorV2['code']
): FailedSettlement {
  return {
    version: 2,
    ...identity(active),
    deduplicated: false,
    outcome: 'not_committed',
    canonical: null,
    committedRevision: null,
    undo: null,
    failure: failure(active, code),
    broadcastRequired: false,
  };
}

function committedSettlement(
  active: ActiveTrackingMutationV2,
  revision: number,
  canonicalPrevious: MissionTracking | null,
  responsePrevious: MissionTracking | null = canonicalPrevious
): TrackingSettlementV2 {
  const envelope: PersistedTrackingEnvelopeV2 = {
    schemaVersion: 2,
    dataEpoch: active.command.dataEpoch,
    missionId: active.command.missionId,
    kind: 'record',
    tracking: tracking(),
    revision,
    lastMutationId: active.command.mutationId,
    lastMutationIntent: active.command.intent,
    committedAt: revision,
    undoBase: {
      previousTracking: canonicalPrevious,
      expectedCurrentRevision: revision,
      expectedCurrentMutationId: active.command.mutationId,
    },
  };
  return {
    version: 2,
    ...identity(active),
    deduplicated: false,
    outcome: 'committed_current',
    canonical: envelope,
    committedRevision: revision,
    undo: {
      version: 2,
      dataEpoch: active.command.dataEpoch,
      missionId: active.command.missionId,
      previousTracking: responsePrevious,
      expectedCurrentRevision: revision,
      expectedCurrentMutationId: active.command.mutationId,
    },
    failure: null,
    broadcastRequired: true,
  };
}

function createTrackingActor() {
  const actor = createActor(applicationTrackingMachine, {
    input: { dataEpoch: DATA_EPOCH, missionId: MISSION_ID, workerEpoch: WORKER_EPOCH },
  });
  actor.start();
  return actor;
}

type TrackingActor = ReturnType<typeof createTrackingActor>;

function command(actor: TrackingActor, type: TrackingEffectCommand['type']) {
  const result = actor.getSnapshot().context.commands.find((candidate) => candidate.type === type);
  if (!result) {
    throw new Error(`Missing ${type} command`);
  }
  return result;
}

function startCommand(actor: TrackingActor, type: TrackingEffectCommand['type']) {
  const result = command(actor, type);
  actor.send({
    type: 'COMMAND_STARTED',
    commandId: result.commandId,
    generation: result.generation,
  });
  return result;
}

function createReadyActor() {
  const actor = createTrackingActor();
  actor.send({ type: 'HYDRATE' });
  const read = startCommand(actor, 'READ_CANONICAL');
  actor.send({
    type: 'CANONICAL_LOADED',
    dataEpoch: DATA_EPOCH,
    missionId: MISSION_ID,
    canonical: null,
    commandId: read.commandId,
    generation: read.generation,
  });
  expect(actor.getSnapshot().value).toBe('ready');
  return actor;
}

function requestMutation(actor: TrackingActor, active: ActiveTrackingMutationV2) {
  actor.send({
    type: 'REQUEST_MUTATION',
    decision: { kind: 'ACCEPTED', active },
    busySettlement: failedSettlement(active, 'APPLICATION_BUSY'),
    protocolSettlement: failedSettlement(active, 'PROTOCOL_ERROR'),
  });
}

function prepare(actor: TrackingActor, active: ActiveTrackingMutationV2) {
  const txA = startCommand(actor, 'WRITE_PREPARED_CHECKPOINT');
  actor.send({
    type: 'TX_A_PREPARED',
    dataEpoch: DATA_EPOCH,
    missionId: MISSION_ID,
    mutationId: active.command.mutationId,
    commandId: txA.commandId,
    generation: txA.generation,
    preparedBase: active.actorBase,
    candidate: { tracking: tracking(), committedAt: active.actorBase.revision + 1 },
  });
  return txA;
}

describe('applicationTrackingMachine model traces', () => {
  it('removes completed effects and rejects an old command ID in a later same-ID operation', () => {
    const actor = createReadyActor();
    const first = activeMutation();
    requestMutation(actor, first);
    prepare(actor, first);
    expect(actor.getSnapshot().context.runningEffects).toEqual([]);

    const firstTxB = startCommand(actor, 'COMMIT_TRANSACTION');
    const firstSettlement = committedSettlement(first, 1, null);
    actor.send({
      type: 'TX_B_COMMITTED',
      dataEpoch: DATA_EPOCH,
      missionId: MISSION_ID,
      mutationId: MUTATION_ID,
      commandId: firstTxB.commandId,
      generation: firstTxB.generation,
      settlement: firstSettlement,
    });
    expect(actor.getSnapshot().value).toBe('settling');
    expect(actor.getSnapshot().context.runningEffects).toEqual([]);

    const publication = startCommand(actor, 'PUBLISH_SETTLEMENT');
    actor.send({
      type: 'PUBLICATION_ATTEMPTED',
      ...identity(first),
      delivered: false,
      commandId: publication.commandId,
      generation: publication.generation,
    });
    expect(actor.getSnapshot().value).toBe('ready');

    const second = activeMutation(1, MUTATION_ID);
    requestMutation(actor, second);
    prepare(actor, second);
    const secondTxB = startCommand(actor, 'COMMIT_TRANSACTION');
    actor.send({
      type: 'TX_B_COMMITTED',
      dataEpoch: DATA_EPOCH,
      missionId: MISSION_ID,
      mutationId: MUTATION_ID,
      commandId: firstTxB.commandId,
      generation: firstTxB.generation,
      settlement: firstSettlement,
    });

    expect(actor.getSnapshot().value).toBe('committing');
    expect(actor.getSnapshot().context.runningEffects).toMatchObject([
      { commandId: secondTxB.commandId, generation: secondTxB.generation, phase: 'tx_b' },
    ]);
  });

  it('removes the secondary reconciliation effect before publishing its result', () => {
    const actor = createReadyActor();
    const active = activeMutation();
    requestMutation(actor, active);
    const control = activeMutation(0, null, OTHER_MUTATION_ID, OTHER_DIGEST);
    actor.send({
      type: 'RECONCILE_MUTATION',
      ...identity(control),
      protocolSettlement: failedSettlement(control, 'PROTOCOL_ERROR'),
    });
    const read = startCommand(actor, 'READ_SETTLEMENT');
    actor.send({
      type: 'CONTROL_RECONCILED',
      ...identity(control),
      commandId: read.commandId,
      generation: read.generation,
      settlement: failedSettlement(control, 'TRANSPORT_ERROR'),
    });

    expect(actor.getSnapshot().value).toBe('preparing');
    expect(actor.getSnapshot().context.runningEffects).toEqual([]);
    expect(command(actor, 'PUBLISH_SETTLEMENT')).toBeDefined();
  });

  it('removes Tx-A before queuing durable cancellation', () => {
    const actor = createReadyActor();
    const active = activeMutation();
    requestMutation(actor, active);
    const txA = startCommand(actor, 'WRITE_PREPARED_CHECKPOINT');
    actor.send({
      type: 'CANCEL_MUTATION',
      ...identity(active),
      protocolSettlement: failedSettlement(active, 'PROTOCOL_ERROR'),
    });
    actor.send({
      type: 'TX_A_PREPARED',
      dataEpoch: DATA_EPOCH,
      missionId: MISSION_ID,
      mutationId: MUTATION_ID,
      commandId: txA.commandId,
      generation: txA.generation,
      preparedBase: active.actorBase,
      candidate: { tracking: tracking(), committedAt: 1 },
    });

    expect(actor.getSnapshot().value).toBe('cancelling');
    expect(actor.getSnapshot().context.runningEffects).toEqual([]);
    expect(command(actor, 'RECORD_CANCELLATION')).toBeDefined();
  });

  it.each([
    ['null canonical vs record response', null, tracking('detected')],
    ['record canonical vs null response', tracking('detected'), null],
  ] as const)('rejects Undo mismatch: %s', (_label, canonicalPrevious, responsePrevious) => {
    const actor = createReadyActor();
    const active = activeMutation();
    requestMutation(actor, active);
    prepare(actor, active);
    const txB = startCommand(actor, 'COMMIT_TRANSACTION');
    actor.send({
      type: 'TX_B_COMMITTED',
      dataEpoch: DATA_EPOCH,
      missionId: MISSION_ID,
      mutationId: MUTATION_ID,
      commandId: txB.commandId,
      generation: txB.generation,
      settlement: committedSettlement(active, 1, canonicalPrevious, responsePrevious),
    });

    expect(actor.getSnapshot().value).toBe('committing');
    expect(actor.getSnapshot().context.runningEffects).toMatchObject([
      { commandId: txB.commandId, generation: txB.generation, phase: 'tx_b' },
    ]);
  });

  it('rejects CANCELLED substitution for a durable pre-Tx-A PERSIST_FAILED', () => {
    const actor = createReadyActor();
    const active = activeMutation();
    const persistFailure = failure(active, 'PERSIST_FAILED');
    actor.send({
      type: 'REQUEST_MUTATION',
      decision: { kind: 'TERMINAL_FAILURE', active, error: persistFailure },
      busySettlement: failedSettlement(active, 'APPLICATION_BUSY'),
      protocolSettlement: failedSettlement(active, 'PROTOCOL_ERROR'),
    });
    const record = startCommand(actor, 'RECORD_TERMINAL_SETTLEMENT');
    actor.send({
      type: 'TERMINAL_SETTLEMENT_RECORDED',
      dataEpoch: DATA_EPOCH,
      missionId: MISSION_ID,
      mutationId: MUTATION_ID,
      commandId: record.commandId,
      generation: record.generation,
      settlement: failedSettlement(active, 'CANCELLED'),
    });
    expect(actor.getSnapshot().value).toBe('recordingTerminal');

    actor.send({
      type: 'TERMINAL_SETTLEMENT_RECORDED',
      dataEpoch: DATA_EPOCH,
      missionId: MISSION_ID,
      mutationId: MUTATION_ID,
      commandId: record.commandId,
      generation: record.generation,
      settlement: {
        ...failedSettlement(active, 'PERSIST_FAILED'),
        failure: persistFailure,
      },
    });
    expect(actor.getSnapshot().value).toBe('settling');
    expect(actor.getSnapshot().context.runningEffects).toEqual([]);
  });

  it.each([
    ['same epoch', RESET_ID, DATA_EPOCH],
    ['uppercase reset ID', RESET_ID.toUpperCase(), NEXT_DATA_EPOCH],
    ['uppercase next epoch', RESET_ID, NEXT_DATA_EPOCH.toUpperCase()],
    ['malformed reset ID', 'not-a-uuid', NEXT_DATA_EPOCH],
  ])('rejects reset with %s', (_label, resetId, nextDataEpoch) => {
    const actor = createReadyActor();
    actor.send({
      type: 'RESET_INVALIDATED',
      dataEpoch: DATA_EPOCH,
      missionId: MISSION_ID,
      resetId,
      nextDataEpoch,
      terminalSettlements: [],
    });
    expect(actor.getSnapshot().value).toBe('ready');
  });

  it('accepts one reset settlement per joined identity', () => {
    const actor = createReadyActor();
    const active = activeMutation();
    requestMutation(actor, active);
    requestMutation(actor, active);
    actor.send({
      type: 'RESET_INVALIDATED',
      dataEpoch: DATA_EPOCH,
      missionId: MISSION_ID,
      resetId: RESET_ID,
      nextDataEpoch: NEXT_DATA_EPOCH,
      terminalSettlements: [failedSettlement(active, 'EPOCH_CHANGED')],
    });

    expect(actor.getSnapshot().value).toBe('invalidating');
    const invalidate = command(actor, 'INVALIDATE_ACTOR');
    expect(invalidate.type === 'INVALIDATE_ACTOR' && invalidate.terminalSettlements).toHaveLength(
      1
    );
  });
});
