import { assign, setup } from 'xstate';
import {
  type ApplicationTrackingMachineContext,
  type ApplicationTrackingMachineEvent,
  type ApplicationTrackingMachineInput,
  type EffectPhase,
  activeIdentity,
  activeMatches,
  actorMatches,
  appendCommands,
  baseMatchesCanonical,
  canonicalUuidV4Valid,
  canonicalDoesNotRegress,
  commandDigestValid,
  commandIdentity,
  completeEffect,
  completeEffectAndAppendCommands,
  controlFromEvent,
  effectPhase,
  identityEquals,
  mutationCommandsRemoved,
  operationSettled,
  pendingCallerIdentities,
  pendingCommand,
  runningEffect,
  settlementMatchesIdentity,
  terminalFailureFingerprint,
} from './application-tracking.machine.contract';

export const applicationTrackingMachineSetup = setup({
  types: {
    context: {} as ApplicationTrackingMachineContext,
    events: {} as ApplicationTrackingMachineEvent,
    input: {} as ApplicationTrackingMachineInput,
  },
  guards: {
    commandCanStart: ({ context, event }) =>
      event.type === 'COMMAND_STARTED' && pendingCommand(context, event) !== undefined,
    hydrationLoadedValid: ({ context, event }) =>
      event.type === 'CANONICAL_LOADED' &&
      actorMatches(context, event) &&
      runningEffect(context, event, 'hydrate') !== undefined &&
      canonicalDoesNotRegress(context, event.canonical),
    hydrationFailedValid: ({ context, event }) =>
      event.type === 'HYDRATION_FAILED' &&
      actorMatches(context, event) &&
      runningEffect(context, event, 'hydrate') !== undefined,
    acceptedRequest: ({ context, event }) =>
      event.type === 'REQUEST_MUTATION' &&
      event.decision.kind === 'ACCEPTED' &&
      actorMatches(context, event.decision.active.command) &&
      commandDigestValid(event.decision.active.commandDigest) &&
      baseMatchesCanonical(context, event.decision.active),
    rejectedRequest: ({ context, event }) =>
      event.type === 'REQUEST_MUTATION' &&
      event.decision.kind === 'REJECTED' &&
      event.decision.settlement.outcome === 'not_committed' &&
      settlementMatchesIdentity(context, event.decision.settlement, event.decision.settlement),
    terminalFailureRequest: ({ context, event }) =>
      event.type === 'REQUEST_MUTATION' &&
      event.decision.kind === 'TERMINAL_FAILURE' &&
      actorMatches(context, event.decision.active.command) &&
      commandDigestValid(event.decision.active.commandDigest) &&
      baseMatchesCanonical(context, event.decision.active) &&
      event.decision.error.code === 'PERSIST_FAILED' &&
      event.decision.error.dataEpoch === context.dataEpoch &&
      event.decision.error.missionId === context.missionId &&
      event.decision.error.mutationId === event.decision.active.command.mutationId &&
      event.decision.error.intent === event.decision.active.command.intent,
    sameActiveRequest: ({ context, event }) =>
      event.type === 'REQUEST_MUTATION' &&
      event.decision.kind === 'ACCEPTED' &&
      context.active !== null &&
      identityEquals(activeIdentity(event.decision.active), activeIdentity(context.active)) &&
      event.decision.active.actorBase.dataEpoch === context.active.actorBase.dataEpoch &&
      event.decision.active.actorBase.revision === context.active.actorBase.revision &&
      event.decision.active.actorBase.lastMutationId === context.active.actorBase.lastMutationId,
    conflictingActiveRequest: ({ context, event }) =>
      event.type === 'REQUEST_MUTATION' &&
      event.decision.kind === 'ACCEPTED' &&
      context.active !== null &&
      event.decision.active.command.mutationId === context.active.command.mutationId &&
      !identityEquals(activeIdentity(event.decision.active), activeIdentity(context.active)) &&
      event.protocolSettlement.failure?.code === 'PROTOCOL_ERROR' &&
      settlementMatchesIdentity(
        context,
        event.protocolSettlement,
        activeIdentity(event.decision.active)
      ),
    distinctActiveRequest: ({ context, event }) =>
      event.type === 'REQUEST_MUTATION' &&
      event.decision.kind === 'ACCEPTED' &&
      context.active !== null &&
      event.decision.active.command.mutationId !== context.active.command.mutationId &&
      event.busySettlement.failure?.code === 'APPLICATION_BUSY' &&
      settlementMatchesIdentity(
        context,
        event.busySettlement,
        activeIdentity(event.decision.active)
      ),
    sameReconciliationRequest: ({ context, event }) =>
      event.type === 'REQUEST_MUTATION' &&
      event.decision.kind === 'ACCEPTED' &&
      context.reconcilingControl !== null &&
      identityEquals(activeIdentity(event.decision.active), context.reconcilingControl),
    conflictingReconciliationRequest: ({ context, event }) =>
      event.type === 'REQUEST_MUTATION' &&
      event.decision.kind === 'ACCEPTED' &&
      context.reconcilingControl !== null &&
      event.decision.active.command.mutationId === context.reconcilingControl.mutationId &&
      !identityEquals(activeIdentity(event.decision.active), context.reconcilingControl) &&
      event.protocolSettlement.failure?.code === 'PROTOCOL_ERROR' &&
      settlementMatchesIdentity(
        context,
        event.protocolSettlement,
        activeIdentity(event.decision.active)
      ),
    distinctReconciliationRequest: ({ context, event }) =>
      event.type === 'REQUEST_MUTATION' &&
      event.decision.kind === 'ACCEPTED' &&
      context.reconcilingControl !== null &&
      event.decision.active.command.mutationId !== context.reconcilingControl.mutationId &&
      event.busySettlement.failure?.code === 'APPLICATION_BUSY' &&
      settlementMatchesIdentity(
        context,
        event.busySettlement,
        activeIdentity(event.decision.active)
      ),
    sameSettledRequest: ({ context, event }) =>
      event.type === 'REQUEST_MUTATION' &&
      event.decision.kind === 'ACCEPTED' &&
      context.settlement !== null &&
      identityEquals(activeIdentity(event.decision.active), context.settlement),
    conflictingSettledRequest: ({ context, event }) =>
      event.type === 'REQUEST_MUTATION' &&
      event.decision.kind === 'ACCEPTED' &&
      context.settlement !== null &&
      event.decision.active.command.mutationId === context.settlement.mutationId &&
      !identityEquals(activeIdentity(event.decision.active), context.settlement) &&
      event.protocolSettlement.failure?.code === 'PROTOCOL_ERROR' &&
      settlementMatchesIdentity(
        context,
        event.protocolSettlement,
        activeIdentity(event.decision.active)
      ),
    distinctSettledRequest: ({ context, event }) =>
      event.type === 'REQUEST_MUTATION' &&
      event.decision.kind === 'ACCEPTED' &&
      context.settlement !== null &&
      event.decision.active.command.mutationId !== context.settlement.mutationId &&
      event.busySettlement.failure?.code === 'APPLICATION_BUSY' &&
      settlementMatchesIdentity(
        context,
        event.busySettlement,
        activeIdentity(event.decision.active)
      ),
    sameActiveControl: ({ context, event }) =>
      (event.type === 'CANCEL_MUTATION' || event.type === 'RECONCILE_MUTATION') &&
      context.active !== null &&
      identityEquals(event, activeIdentity(context.active)),
    controlMatchesActor: ({ context, event }) =>
      (event.type === 'CANCEL_MUTATION' || event.type === 'RECONCILE_MUTATION') &&
      actorMatches(context, event) &&
      commandDigestValid(event.commandDigest),
    sameReconciliationControl: ({ context, event }) =>
      (event.type === 'CANCEL_MUTATION' || event.type === 'RECONCILE_MUTATION') &&
      context.reconcilingControl !== null &&
      identityEquals(event, context.reconcilingControl),
    conflictingControl: ({ context, event }) => {
      if (event.type !== 'CANCEL_MUTATION' && event.type !== 'RECONCILE_MUTATION') {
        return false;
      }
      const current = context.active
        ? activeIdentity(context.active)
        : (context.reconcilingControl ?? context.settlement);
      return (
        actorMatches(context, event) &&
        current !== null &&
        event.mutationId === current.mutationId &&
        !identityEquals(event, current) &&
        event.protocolSettlement.failure?.code === 'PROTOCOL_ERROR' &&
        settlementMatchesIdentity(context, event.protocolSettlement, event)
      );
    },
    distinctControl: ({ context, event }) => {
      if (event.type !== 'CANCEL_MUTATION' && event.type !== 'RECONCILE_MUTATION') {
        return false;
      }
      if (!actorMatches(context, event)) {
        return false;
      }
      const currentId =
        context.active?.command.mutationId ??
        context.reconcilingControl?.mutationId ??
        context.settlement?.mutationId;
      return currentId === undefined || event.mutationId !== currentId;
    },
    sameSettledControl: ({ context, event }) =>
      (event.type === 'CANCEL_MUTATION' || event.type === 'RECONCILE_MUTATION') &&
      context.settlement !== null &&
      identityEquals(event, context.settlement),
    queuedCancelMatches: ({ context, event }) =>
      event.type === 'CANCEL_MUTATION' &&
      context.txPhase === 'queued' &&
      context.active !== null &&
      identityEquals(event, activeIdentity(context.active)),
    runningCancelMatches: ({ context, event }) =>
      event.type === 'CANCEL_MUTATION' &&
      context.txPhase === 'running' &&
      context.active !== null &&
      identityEquals(event, activeIdentity(context.active)),
    txAPreparedValid: ({ context, event }) =>
      event.type === 'TX_A_PREPARED' &&
      activeMatches(context, event) &&
      runningEffect(context, event, 'tx_a') !== undefined &&
      event.preparedBase.dataEpoch === context.dataEpoch &&
      event.preparedBase.revision === context.active?.actorBase.revision &&
      event.preparedBase.lastMutationId === context.active?.actorBase.lastMutationId &&
      (event.candidate.tracking === null ||
        event.candidate.tracking.missionId === context.missionId),
    activeSettlementValid: ({ context, event }) => {
      if (!('settlement' in event) || !context.active || !activeMatches(context, event)) {
        return false;
      }
      const phase: EffectPhase =
        event.type === 'TX_A_SETTLED'
          ? 'tx_a'
          : event.type === 'TX_B_COMMITTED' || event.type === 'TX_B_SETTLED'
            ? 'tx_b'
            : event.type === 'CANCELLATION_RECORDED'
              ? 'record_cancel'
              : 'record_terminal';
      const outcomeValid =
        (event.type === 'TX_A_SETTLED' &&
          (event.settlement.outcome === 'not_committed' ||
            event.settlement.outcome === 'inconsistent')) ||
        (event.type === 'TX_B_COMMITTED' && event.settlement.outcome === 'committed_current') ||
        (event.type === 'TX_B_SETTLED' &&
          (event.settlement.outcome === 'not_committed' ||
            event.settlement.outcome === 'inconsistent')) ||
        (event.type === 'TERMINAL_SETTLEMENT_RECORDED' &&
          event.settlement.outcome === 'not_committed') ||
        (event.type === 'TERMINAL_SETTLEMENT_UNCERTAIN' &&
          event.settlement.outcome === 'uncertain');
      const running = runningEffect(context, event, phase);
      if (
        !outcomeValid ||
        running === undefined ||
        !settlementMatchesIdentity(context, event.settlement, activeIdentity(context.active))
      ) {
        return false;
      }
      if (event.type === 'TERMINAL_SETTLEMENT_RECORDED') {
        return (
          running.kind === 'RECORD_TERMINAL_SETTLEMENT' &&
          running.expectedTerminalFailureFingerprint !== null &&
          event.settlement.outcome === 'not_committed' &&
          event.settlement.failure.code === 'PERSIST_FAILED' &&
          terminalFailureFingerprint(event.settlement.failure) ===
            running.expectedTerminalFailureFingerprint
        );
      }
      if (event.type === 'TERMINAL_SETTLEMENT_UNCERTAIN') {
        return (
          running.kind === 'RECORD_TERMINAL_SETTLEMENT' &&
          running.expectedTerminalFailureFingerprint !== null
        );
      }
      return true;
    },
    cancellationSettlementValid: ({ context, event }) =>
      event.type === 'CANCELLATION_RECORDED' &&
      context.active !== null &&
      activeMatches(context, event) &&
      runningEffect(context, event, 'record_cancel') !== undefined &&
      event.settlement.outcome === 'not_committed' &&
      event.settlement.failure.code === 'CANCELLED' &&
      settlementMatchesIdentity(context, event.settlement, activeIdentity(context.active)),
    txAUncertainValid: ({ context, event }) =>
      event.type === 'TX_A_UNCERTAIN' &&
      activeMatches(context, event) &&
      runningEffect(context, event, 'tx_a') !== undefined,
    txBUncertainValid: ({ context, event }) =>
      event.type === 'TX_B_UNCERTAIN' &&
      activeMatches(context, event) &&
      runningEffect(context, event, 'tx_b') !== undefined,
    abortResultValid: ({ context, event }) =>
      (event.type === 'TX_B_ABORTED' || event.type === 'ABORT_REJECTED') &&
      activeMatches(context, event) &&
      runningEffect(context, event, 'abort_tx_b') !== undefined,
    cancellationFailureValid: ({ context, event }) =>
      event.type === 'CANCELLATION_FAILED' &&
      activeMatches(context, event) &&
      runningEffect(context, event, 'record_cancel') !== undefined,
    restartMatchesActive: ({ context, event }) =>
      event.type === 'SERVICE_WORKER_RESTARTED' &&
      event.workerEpoch !== context.workerEpoch &&
      activeMatches(context, event),
    restartSettlementReady: ({ context, event }) =>
      event.type === 'SERVICE_WORKER_RESTARTED' &&
      event.workerEpoch !== context.workerEpoch &&
      context.resumeAfterSettlement === 'ready' &&
      context.settlement !== null &&
      actorMatches(context, event) &&
      event.mutationId === context.settlement.mutationId,
    restartSettlementFailed: ({ context, event }) =>
      event.type === 'SERVICE_WORKER_RESTARTED' &&
      event.workerEpoch !== context.workerEpoch &&
      context.resumeAfterSettlement === 'failed' &&
      context.settlement !== null &&
      actorMatches(context, event) &&
      event.mutationId === context.settlement.mutationId,
    primaryControlResultValid: ({ context, event }) => {
      if (event.type !== 'CONTROL_RECONCILED' || context.reconcilingControl === null) {
        return false;
      }
      const running = runningEffect(context, event, 'reconcile');
      return (
        running?.control !== null &&
        running?.control !== undefined &&
        identityEquals(running.control, context.reconcilingControl) &&
        identityEquals(event, context.reconcilingControl) &&
        settlementMatchesIdentity(context, event.settlement, context.reconcilingControl)
      );
    },
    secondaryControlResultValid: ({ context, event }) => {
      if (event.type !== 'CONTROL_RECONCILED') {
        return false;
      }
      const running = runningEffect(context, event, 'reconcile');
      return (
        running?.control !== null &&
        running?.control !== undefined &&
        (context.reconcilingControl === null ||
          !identityEquals(running.control, context.reconcilingControl)) &&
        identityEquals(event, running.control) &&
        settlementMatchesIdentity(context, event.settlement, running.control)
      );
    },
    mainPublicationReady: ({ context, event }) => {
      if (event.type !== 'PUBLICATION_ATTEMPTED' || context.settlement === null) {
        return false;
      }
      const running = runningEffect(context, event, 'publish');
      return (
        context.resumeAfterSettlement === 'ready' &&
        running?.control !== null &&
        running?.control !== undefined &&
        running.kind === 'PUBLISH_SETTLEMENT' &&
        identityEquals(event, running.control) &&
        identityEquals(running.control, context.settlement)
      );
    },
    mainPublicationFailed: ({ context, event }) => {
      if (event.type !== 'PUBLICATION_ATTEMPTED' || context.settlement === null) {
        return false;
      }
      const running = runningEffect(context, event, 'publish');
      return (
        context.resumeAfterSettlement === 'failed' &&
        running?.control !== null &&
        running?.control !== undefined &&
        running.kind === 'PUBLISH_SETTLEMENT' &&
        identityEquals(event, running.control) &&
        identityEquals(running.control, context.settlement)
      );
    },
    otherPublicationAttempted: ({ context, event }) =>
      event.type === 'PUBLICATION_ATTEMPTED' &&
      (() => {
        const running = runningEffect(context, event, 'publish');
        return (
          running?.control !== null &&
          running?.control !== undefined &&
          identityEquals(event, running.control)
        );
      })(),
    broadcastAttempted: ({ context, event }) =>
      event.type === 'BROADCAST_ATTEMPTED' &&
      runningEffect(context, event, 'broadcast') !== undefined,
    invalidationAttempted: ({ context, event }) =>
      event.type === 'INVALIDATION_ATTEMPTED' &&
      runningEffect(context, event, 'invalidate') !== undefined,
    resetValid: ({ context, event }) => {
      if (
        event.type !== 'RESET_INVALIDATED' ||
        !actorMatches(context, event) ||
        !canonicalUuidV4Valid(event.resetId) ||
        !canonicalUuidV4Valid(event.nextDataEpoch) ||
        event.nextDataEpoch === context.dataEpoch
      ) {
        return false;
      }
      const callers = pendingCallerIdentities(context);
      return (
        callers.length === event.terminalSettlements.length &&
        callers.every((caller) => {
          const settlement = event.terminalSettlements.find((candidate) =>
            identityEquals(candidate, caller)
          );
          return (
            settlement?.outcome === 'not_committed' &&
            settlement.failure.code === 'EPOCH_CHANGED' &&
            settlementMatchesIdentity(context, settlement, caller)
          );
        })
      );
    },
    notFenced: ({ context }) => !context.fenced,
  },
  actions: {
    startCommand: assign(({ context, event }) => {
      if (event.type !== 'COMMAND_STARTED') {
        return {};
      }
      const command = pendingCommand(context, event);
      if (!command) {
        return {};
      }
      const phase = effectPhase(command);
      return {
        commands: context.commands.filter(
          (candidate) =>
            candidate.commandId !== command.commandId || candidate.generation !== command.generation
        ),
        runningEffects: [
          ...context.runningEffects,
          {
            commandId: command.commandId,
            generation: command.generation,
            phase,
            kind: command.type,
            control: commandIdentity(command),
            expectedTerminalFailureFingerprint:
              command.type === 'RECORD_TERMINAL_SETTLEMENT'
                ? terminalFailureFingerprint(command.error)
                : null,
          },
        ],
        txPhase: phase === 'tx_a' || phase === 'tx_b' ? ('running' as const) : context.txPhase,
      };
    }),
    queueHydration: assign(({ context }) =>
      appendCommands(context, {
        type: 'READ_CANONICAL',
        dataEpoch: context.dataEpoch,
        missionId: context.missionId,
      })
    ),
    applyCanonical: assign(({ context, event }) =>
      event.type === 'CANONICAL_LOADED'
        ? { canonical: event.canonical, error: null, ...completeEffect(context, event) }
        : {}
    ),
    failHydration: assign(({ context, event }) =>
      event.type === 'HYDRATION_FAILED'
        ? { error: event.error, ...completeEffect(context, event) }
        : {}
    ),
    admitRequest: assign(({ context, event }) => {
      if (event.type !== 'REQUEST_MUTATION' || event.decision.kind !== 'ACCEPTED') {
        return {};
      }
      return {
        active: event.decision.active,
        txPhase: 'queued' as const,
        error: null,
        ...appendCommands(context, {
          type: 'WRITE_PREPARED_CHECKPOINT',
          active: event.decision.active,
        }),
      };
    }),
    recordTerminalFailure: assign(({ context, event }) => {
      if (event.type !== 'REQUEST_MUTATION' || event.decision.kind !== 'TERMINAL_FAILURE') {
        return {};
      }
      return {
        active: event.decision.active,
        txPhase: 'none' as const,
        ...appendCommands(context, {
          type: 'RECORD_TERMINAL_SETTLEMENT',
          active: event.decision.active,
          error: event.decision.error,
        }),
      };
    }),
    publishRejected: assign(({ context, event }) => {
      if (event.type !== 'REQUEST_MUTATION' || event.decision.kind !== 'REJECTED') {
        return {};
      }
      const settlement = event.decision.settlement;
      return {
        settlement,
        resumeAfterSettlement: 'ready' as const,
        ...appendCommands(context, { type: 'PUBLISH_SETTLEMENT', settlement }),
      };
    }),
    joinControl: assign(({ context, event }) => {
      const control = controlFromEvent(context, event);
      return control ? appendCommands(context, { type: 'JOIN_ACTIVE', ...control }) : {};
    }),
    publishBusy: assign(({ context, event }) =>
      event.type === 'REQUEST_MUTATION'
        ? appendCommands(context, {
            type: 'PUBLISH_SETTLEMENT',
            settlement: event.busySettlement,
          })
        : {}
    ),
    publishProtocol: assign(({ context, event }) => {
      const settlement =
        event.type === 'REQUEST_MUTATION'
          ? event.protocolSettlement
          : event.type === 'CANCEL_MUTATION' || event.type === 'RECONCILE_MUTATION'
            ? event.protocolSettlement
            : null;
      return settlement ? appendCommands(context, { type: 'PUBLISH_SETTLEMENT', settlement }) : {};
    }),
    queueControlRead: assign(({ context, event }) => {
      if (event.type !== 'CANCEL_MUTATION' && event.type !== 'RECONCILE_MUTATION') {
        return {};
      }
      return appendCommands(context, {
        type: 'READ_SETTLEMENT',
        dataEpoch: event.dataEpoch,
        missionId: event.missionId,
        mutationId: event.mutationId,
        intent: event.intent,
        commandDigest: event.commandDigest,
      });
    }),
    prepareCandidate: assign(({ context, event }) => {
      if (event.type !== 'TX_A_PREPARED' || !context.active) {
        return {};
      }
      const active = { ...context.active, preparedBase: event.preparedBase };
      return {
        active,
        candidate: event.candidate,
        txPhase: 'queued' as const,
        ...completeEffectAndAppendCommands(context, event, [
          { type: 'COMMIT_TRANSACTION', active, candidate: event.candidate },
        ]),
      };
    }),
    acceptSettlement: assign(({ context, event }) =>
      'settlement' in event ? operationSettled(context, event, event.settlement) : {}
    ),
    beginReconciliation: assign(({ context, event }) => {
      const control = controlFromEvent(context, event);
      if (!control) {
        return {};
      }
      const nextContext: ApplicationTrackingMachineContext = {
        ...context,
        generation: context.generation + 1,
        workerEpoch:
          event.type === 'SERVICE_WORKER_RESTARTED' ? event.workerEpoch : context.workerEpoch,
        commands: [],
        runningEffects: [],
        txPhase: 'none',
        cancellationPhase: 'none',
        reconcilingControl: control,
      };
      return {
        generation: nextContext.generation,
        workerEpoch: nextContext.workerEpoch,
        runningEffects: [],
        txPhase: 'none' as const,
        cancellationPhase: 'none' as const,
        reconcilingControl: control,
        ...appendCommands(nextContext, { type: 'READ_SETTLEMENT', ...control }),
      };
    }),
    acceptPrimaryControl: assign(({ context, event }) =>
      event.type === 'CONTROL_RECONCILED' ? operationSettled(context, event, event.settlement) : {}
    ),
    publishSecondaryControl: assign(({ context, event }) => {
      if (event.type !== 'CONTROL_RECONCILED') {
        return {};
      }
      return {
        canonical: event.settlement.canonical,
        ...completeEffectAndAppendCommands(context, event, [
          { type: 'PUBLISH_SETTLEMENT', settlement: event.settlement },
        ]),
      };
    }),
    cancelQueued: assign(({ context }) => {
      if (!context.active) {
        return {};
      }
      const active = { ...context.active, cancelRequested: true };
      const base = { ...context, commands: mutationCommandsRemoved(context) };
      return {
        active,
        txPhase: 'none' as const,
        cancellationPhase: 'recording' as const,
        ...appendCommands(base, { type: 'RECORD_CANCELLATION', active }),
      };
    }),
    awaitTxA: assign(({ context }) => ({
      active: context.active ? { ...context.active, cancelRequested: true } : null,
      cancellationPhase: 'awaiting_tx_a' as const,
    })),
    abortTxB: assign(({ context }) => {
      if (!context.active) {
        return {};
      }
      const active = { ...context.active, cancelRequested: true };
      return {
        active,
        cancellationPhase: 'aborting_tx_b' as const,
        ...appendCommands(context, { type: 'ABORT_TRANSACTION', active }),
      };
    }),
    recordCancellation: assign(({ context, event }) => {
      if (!context.active || (event.type !== 'TX_A_PREPARED' && event.type !== 'TX_B_ABORTED')) {
        return {};
      }
      const preparedBase =
        event.type === 'TX_A_PREPARED' ? event.preparedBase : context.active.preparedBase;
      const active = { ...context.active, preparedBase, cancelRequested: true };
      return {
        active,
        candidate: null,
        txPhase: 'none' as const,
        cancellationPhase: 'recording' as const,
        ...completeEffectAndAppendCommands(
          context,
          event,
          [{ type: 'RECORD_CANCELLATION', active }],
          { removeRunningPhases: ['tx_a', 'tx_b'] }
        ),
      };
    }),
    completePublication: assign(({ context, event }) =>
      event.type === 'PUBLICATION_ATTEMPTED'
        ? { settlement: null, ...completeEffect(context, event) }
        : {}
    ),
    abandonPublication: assign(({ context, event }) =>
      event.type === 'SERVICE_WORKER_RESTARTED'
        ? {
            workerEpoch: event.workerEpoch,
            generation: context.generation + 1,
            commands: [],
            runningEffects: [],
            settlement: null,
          }
        : {}
    ),
    completeSideEffect: assign(({ context, event }) =>
      'commandId' in event && 'generation' in event ? completeEffect(context, event) : {}
    ),
    invalidateActor: assign(({ context, event }) => {
      if (event.type !== 'RESET_INVALIDATED') {
        return {};
      }
      const nextContext: ApplicationTrackingMachineContext = {
        ...context,
        generation: context.generation + 1,
        active: null,
        candidate: null,
        txPhase: 'none',
        cancellationPhase: 'none',
        reconcilingControl: null,
        settlement: null,
        fenced: true,
        commands: [],
        runningEffects: [],
      };
      return {
        generation: nextContext.generation,
        active: null,
        candidate: null,
        txPhase: 'none' as const,
        cancellationPhase: 'none' as const,
        reconcilingControl: null,
        settlement: null,
        fenced: true,
        runningEffects: [],
        ...appendCommands(nextContext, {
          type: 'INVALIDATE_ACTOR',
          dataEpoch: context.dataEpoch,
          missionId: context.missionId,
          resetId: event.resetId,
          nextDataEpoch: event.nextDataEpoch,
          terminalSettlements: event.terminalSettlements,
        }),
      };
    }),
  },
});
