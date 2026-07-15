import { applicationTrackingMachineSetup } from './application-tracking.machine.logic';

export * from './application-tracking.machine.contract';

const activeRequests = [
  { guard: 'sameActiveRequest', actions: 'joinControl' },
  { guard: 'conflictingActiveRequest', actions: 'publishProtocol' },
  { guard: 'distinctActiveRequest', actions: 'publishBusy' },
] as const;

const reconcilingRequests = [
  { guard: 'sameReconciliationRequest', actions: 'joinControl' },
  { guard: 'conflictingReconciliationRequest', actions: 'publishProtocol' },
  { guard: 'distinctReconciliationRequest', actions: 'publishBusy' },
] as const;

const settledRequests = [
  { guard: 'sameSettledRequest', actions: 'joinControl' },
  { guard: 'conflictingSettledRequest', actions: 'publishProtocol' },
  { guard: 'distinctSettledRequest', actions: 'publishBusy' },
] as const;

const activeReconcile = [
  { guard: 'sameActiveControl', actions: 'joinControl' },
  { guard: 'conflictingControl', actions: 'publishProtocol' },
  { guard: 'distinctControl', actions: 'queueControlRead' },
] as const;

const settledControls = [
  { guard: 'sameSettledControl', actions: 'joinControl' },
  { guard: 'conflictingControl', actions: 'publishProtocol' },
  { guard: 'distinctControl', actions: 'queueControlRead' },
] as const;

const exactCancel = [
  { guard: 'queuedCancelMatches', target: 'cancelling', actions: 'cancelQueued' },
  { guard: 'runningCancelMatches', target: 'cancelling', actions: 'abortTxB' },
  { guard: 'conflictingControl', actions: 'publishProtocol' },
  { guard: 'distinctControl', actions: 'queueControlRead' },
] as const;

const uncertainToReconciliation = {
  target: 'reconciling',
  actions: 'beginReconciliation',
} as const;

const publicationRestart = [
  { guard: 'restartSettlementReady', target: 'ready', actions: 'abandonPublication' },
  { guard: 'restartSettlementFailed', target: 'failed', actions: 'abandonPublication' },
] as const;

export const applicationTrackingMachine = applicationTrackingMachineSetup.createMachine({
  id: 'applicationTracking',
  initial: 'unhydrated',
  context: ({ input }) => ({
    ...input,
    generation: 0,
    canonical: null,
    active: null,
    candidate: null,
    txPhase: 'none',
    cancellationPhase: 'none',
    reconcilingControl: null,
    settlement: null,
    resumeAfterSettlement: 'ready',
    error: null,
    fenced: false,
    nextCommandId: 0,
    commands: [],
    runningEffects: [],
  }),
  on: {
    COMMAND_STARTED: { guard: 'commandCanStart', actions: 'startCommand' },
    CONTROL_RECONCILED: {
      guard: 'secondaryControlResultValid',
      actions: 'publishSecondaryControl',
    },
    PUBLICATION_ATTEMPTED: {
      guard: 'otherPublicationAttempted',
      actions: 'completeSideEffect',
    },
    BROADCAST_ATTEMPTED: { guard: 'broadcastAttempted', actions: 'completeSideEffect' },
    RESET_INVALIDATED: { guard: 'resetValid', target: '.invalidating', actions: 'invalidateActor' },
  },
  states: {
    unhydrated: { on: { HYDRATE: { target: 'hydrating', actions: 'queueHydration' } } },
    hydrating: {
      on: {
        CANONICAL_LOADED: {
          guard: 'hydrationLoadedValid',
          target: 'ready',
          actions: 'applyCanonical',
        },
        HYDRATION_FAILED: {
          guard: 'hydrationFailedValid',
          target: 'failed',
          actions: 'failHydration',
        },
      },
    },
    ready: {
      on: {
        REQUEST_MUTATION: [
          { guard: 'acceptedRequest', target: 'preparing', actions: 'admitRequest' },
          {
            guard: 'terminalFailureRequest',
            target: 'recordingTerminal',
            actions: 'recordTerminalFailure',
          },
          { guard: 'rejectedRequest', target: 'settling', actions: 'publishRejected' },
        ],
        RECONCILE_MUTATION: {
          guard: 'controlMatchesActor',
          target: 'reconciling',
          actions: 'beginReconciliation',
        },
        CANCEL_MUTATION: {
          guard: 'controlMatchesActor',
          target: 'reconciling',
          actions: 'beginReconciliation',
        },
      },
    },
    recordingTerminal: {
      on: {
        REQUEST_MUTATION: activeRequests,
        TERMINAL_SETTLEMENT_RECORDED: {
          guard: 'activeSettlementValid',
          target: 'settling',
          actions: 'acceptSettlement',
        },
        TERMINAL_SETTLEMENT_UNCERTAIN: {
          guard: 'activeSettlementValid',
          target: 'settling',
          actions: 'acceptSettlement',
        },
        RECONCILE_MUTATION: activeReconcile,
        CANCEL_MUTATION: activeReconcile,
        SERVICE_WORKER_RESTARTED: {
          guard: 'restartMatchesActive',
          ...uncertainToReconciliation,
        },
      },
    },
    preparing: {
      on: {
        REQUEST_MUTATION: activeRequests,
        RECONCILE_MUTATION: activeReconcile,
        CANCEL_MUTATION: [
          { guard: 'queuedCancelMatches', target: 'cancelling', actions: 'cancelQueued' },
          { guard: 'runningCancelMatches', target: 'cancelling', actions: 'awaitTxA' },
          { guard: 'conflictingControl', actions: 'publishProtocol' },
          { guard: 'distinctControl', actions: 'queueControlRead' },
        ],
        TX_A_PREPARED: {
          guard: 'txAPreparedValid',
          target: 'committing',
          actions: 'prepareCandidate',
        },
        TX_A_SETTLED: {
          guard: 'activeSettlementValid',
          target: 'settling',
          actions: 'acceptSettlement',
        },
        TX_A_UNCERTAIN: {
          guard: 'txAUncertainValid',
          ...uncertainToReconciliation,
        },
        SERVICE_WORKER_RESTARTED: {
          guard: 'restartMatchesActive',
          ...uncertainToReconciliation,
        },
      },
    },
    committing: {
      on: {
        REQUEST_MUTATION: activeRequests,
        RECONCILE_MUTATION: activeReconcile,
        CANCEL_MUTATION: exactCancel,
        TX_B_COMMITTED: {
          guard: 'activeSettlementValid',
          target: 'settling',
          actions: 'acceptSettlement',
        },
        TX_B_SETTLED: {
          guard: 'activeSettlementValid',
          target: 'settling',
          actions: 'acceptSettlement',
        },
        TX_B_UNCERTAIN: {
          guard: 'txBUncertainValid',
          ...uncertainToReconciliation,
        },
        SERVICE_WORKER_RESTARTED: {
          guard: 'restartMatchesActive',
          ...uncertainToReconciliation,
        },
      },
    },
    cancelling: {
      on: {
        REQUEST_MUTATION: activeRequests,
        RECONCILE_MUTATION: activeReconcile,
        CANCEL_MUTATION: activeReconcile,
        TX_A_PREPARED: {
          guard: 'txAPreparedValid',
          actions: 'recordCancellation',
        },
        TX_A_SETTLED: {
          guard: 'activeSettlementValid',
          target: 'settling',
          actions: 'acceptSettlement',
        },
        TX_B_ABORTED: { guard: 'abortResultValid', actions: 'recordCancellation' },
        ABORT_REJECTED: {
          guard: 'abortResultValid',
          ...uncertainToReconciliation,
        },
        TX_B_COMMITTED: {
          guard: 'activeSettlementValid',
          target: 'settling',
          actions: 'acceptSettlement',
        },
        CANCELLATION_RECORDED: {
          guard: 'cancellationSettlementValid',
          target: 'cancelled',
          actions: 'acceptSettlement',
        },
        CANCELLATION_FAILED: {
          guard: 'cancellationFailureValid',
          ...uncertainToReconciliation,
        },
        SERVICE_WORKER_RESTARTED: {
          guard: 'restartMatchesActive',
          ...uncertainToReconciliation,
        },
      },
    },
    reconciling: {
      on: {
        REQUEST_MUTATION: reconcilingRequests,
        RECONCILE_MUTATION: [
          { guard: 'sameReconciliationControl', actions: 'joinControl' },
          { guard: 'conflictingControl', actions: 'publishProtocol' },
          { guard: 'distinctControl', actions: 'queueControlRead' },
        ],
        CANCEL_MUTATION: [
          { guard: 'sameReconciliationControl', actions: 'joinControl' },
          { guard: 'conflictingControl', actions: 'publishProtocol' },
          { guard: 'distinctControl', actions: 'queueControlRead' },
        ],
        CONTROL_RECONCILED: {
          guard: 'primaryControlResultValid',
          target: 'settling',
          actions: 'acceptPrimaryControl',
        },
      },
    },
    settling: {
      on: {
        REQUEST_MUTATION: settledRequests,
        RECONCILE_MUTATION: settledControls,
        CANCEL_MUTATION: settledControls,
        PUBLICATION_ATTEMPTED: [
          {
            guard: 'mainPublicationReady',
            target: 'ready',
            actions: 'completePublication',
          },
          {
            guard: 'mainPublicationFailed',
            target: 'failed',
            actions: 'completePublication',
          },
        ],
        SERVICE_WORKER_RESTARTED: publicationRestart,
      },
    },
    cancelled: {
      on: {
        REQUEST_MUTATION: settledRequests,
        RECONCILE_MUTATION: settledControls,
        CANCEL_MUTATION: settledControls,
        PUBLICATION_ATTEMPTED: [
          {
            guard: 'mainPublicationReady',
            target: 'ready',
            actions: 'completePublication',
          },
          {
            guard: 'mainPublicationFailed',
            target: 'failed',
            actions: 'completePublication',
          },
        ],
        SERVICE_WORKER_RESTARTED: publicationRestart,
      },
    },
    failed: {
      on: {
        HYDRATE: { guard: 'notFenced', target: 'hydrating', actions: 'queueHydration' },
        RECONCILE_MUTATION: {
          guard: 'controlMatchesActor',
          target: 'reconciling',
          actions: 'beginReconciliation',
        },
        CANCEL_MUTATION: {
          guard: 'controlMatchesActor',
          target: 'reconciling',
          actions: 'beginReconciliation',
        },
      },
    },
    invalidating: {
      on: {
        INVALIDATION_ATTEMPTED: {
          guard: 'invalidationAttempted',
          target: 'invalidated',
          actions: 'completeSideEffect',
        },
      },
    },
    invalidated: { type: 'final' },
  },
});
