import { assign, setup } from 'xstate';

import {
  commitCheckpointAllowed,
  initialLocalDataResetContext,
  isFailureAllowedForStep,
  localDataResetCompletionProven,
  matchesFreshResetPreflight,
  matchesPostClearResetCompletion,
  matchesReset,
  matchesReinitializedSettingsEnvelope,
  matchesResetEpochBroadcast,
  matchesResetReceiptWrite,
  matchesSettingsAlignment,
  resetExpectation as expectation,
  restartClassification,
  restartHasKind,
  recognizedPostClearCompletionPatch,
  restoreLocalDataResetContext,
  validLocalDataResetRequest,
  type LocalDataResetContext,
  type LocalDataResetEvent,
  type LocalDataResetMachineInput,
} from './local-data-reset.contract';

export type * from './local-data-reset.contract';

const localDataResetSetup = setup({
  types: {
    context: {} as LocalDataResetContext,
    events: {} as LocalDataResetEvent,
    input: {} as LocalDataResetMachineInput,
  },
  guards: {
    validRequest: ({ context, event }) => validLocalDataResetRequest(context, event),
    restartWithoutJournal: ({ event }) => restartHasKind(event, 'none'),
    restartWithValidJournal: ({ event }) => {
      const kind = restartClassification(event).kind;
      return kind === 'resume' || kind === 'blocked' || kind === 'failed';
    },
    matchingReset: ({ context, event }) => matchesReset(context, event),
    matchingFreshPreflight: ({ context, event }) => matchesFreshResetPreflight(context, event),
    matchingPostClearCompletion: ({ context, event }) =>
      matchesPostClearResetCompletion(context, event),
    blockingFailure: ({ context, event }) =>
      event.type === 'STEP_FAILED' &&
      matchesReset(context, event) &&
      isFailureAllowedForStep(
        context.expectedStep,
        context.expectedErrorOrigin,
        context.journalCheckpointExpected,
        event.error
      ) &&
      event.error.code === 'BLOCKED',
    matchingFailure: ({ context, event }) =>
      event.type === 'STEP_FAILED' &&
      matchesReset(context, event) &&
      isFailureAllowedForStep(
        context.expectedStep,
        context.expectedErrorOrigin,
        context.journalCheckpointExpected,
        event.error
      ),
    allDependenciesQuiescent: ({ context }) =>
      context.scanQuiescent &&
      context.trackingQuiescent &&
      context.migrationQuiescent &&
      context.outboxQuiescent,
    matchingReinitializedEpoch: ({ context, event }) =>
      matchesReinitializedSettingsEnvelope(context, event),
    matchingSettingsAlignment: ({ context, event }) => matchesSettingsAlignment(context, event),
    matchingReadinessEcho: ({ context, event }) =>
      matchesResetEpochBroadcast(context, event, 'ready_to_commit'),
    matchingReceiptWrite: ({ context, event }) => matchesResetReceiptWrite(context, event),
    commitCheckpointAllowed: ({ context, event }) => commitCheckpointAllowed(context, event),
    matchingCommittedEcho: ({ context, event }) =>
      context.phase === 'committed' &&
      context.commitCheckpointed &&
      matchesResetEpochBroadcast(context, event, 'committed'),
    completionProven: ({ context, event }) => localDataResetCompletionProven(context, event),
    retryNeedsFence: ({ context, event }) =>
      event.type === 'RETRY' &&
      matchesReset(context, event) &&
      context.error?.retryable === true &&
      context.journalPersisted &&
      !context.fenceAcquired,
    retryAtPreflight: ({ context, event }) =>
      event.type === 'RETRY' &&
      matchesReset(context, event) &&
      context.error?.retryable === true &&
      context.phase === 'none' &&
      !context.journalPersisted,
    retryCanRecover: ({ context, event }) =>
      event.type === 'RETRY' &&
      matchesReset(context, event) &&
      context.error?.retryable === true &&
      context.phase !== 'none' &&
      (!context.journalPersisted || context.fenceAcquired),
    restartShouldResume: ({ context }) => context.restartDisposition === 'resume',
    restartShouldBlock: ({ context }) => context.restartDisposition === 'blocked',
    restartShouldFail: ({ context }) => context.restartDisposition === 'failed',
    resumeAtFencing: ({ context }) => context.phase === 'journaled',
    resumeAtQuiescing: ({ context }) => context.phase === 'fenced',
    resumeAtClosingDatabase: ({ context }) => context.phase === 'quiesced',
    resumeAtDeletingDatabase: ({ context }) => context.phase === 'handles_closed',
    resumeAtClearingSession: ({ context }) => context.phase === 'database_deleted',
    resumeAtClearingLocal: ({ context }) => context.phase === 'session_cleared',
    resumeAtReinitializing: ({ context }) => context.phase === 'local_cleared',
    resumeAtAligningSettings: ({ context }) => context.phase === 'database_reinitialized',
    resumeAtBroadcastingReadiness: ({ context }) => context.phase === 'settings_aligned',
    resumeAtBroadcastingCommitted: ({ context }) => context.phase === 'committed',
  },
  actions: {
    initializeReset: assign(({ context, event }) =>
      event.type === 'RESET_REQUESTED'
        ? {
            ...initialLocalDataResetContext(context),
            resetId: event.resetId,
            previousDataEpoch: event.previousDataEpoch,
            nextDataEpoch: event.nextDataEpoch,
            settingsRecoveryRequestId: event.settingsRecoveryRequestId,
            settingsBootstrapRequestId: event.settingsBootstrapRequestId,
            requestedAt: event.requestedAt,
          }
        : {}
    ),
    restoreJournal: assign(({ context, event }) => restoreLocalDataResetContext(context, event)),
    recordCorruptJournal: assign(({ context }) => ({
      ...initialLocalDataResetContext(context),
      journalPersisted: true,
      error: {
        code: 'JOURNAL_CORRUPT' as const,
        step: 'journal' as const,
        origin: 'workflow_step' as const,
        message: 'Le journal de réinitialisation locale est invalide.',
        retryable: false,
      },
    })),
    markJournaled: assign(() => ({ journalPersisted: true, phase: 'journaled' as const })),
    markFenced: assign(() => ({ fenceAcquired: true, phase: 'fenced' as const })),
    markBootFenceAcquired: assign(() => ({ fenceAcquired: true })),
    markScanQuiescent: assign(() => ({ scanQuiescent: true })),
    markTrackingQuiescent: assign(() => ({ trackingQuiescent: true })),
    markMigrationQuiescent: assign(() => ({ migrationQuiescent: true })),
    markOutboxQuiescent: assign(() => ({ outboxQuiescent: true })),
    markQuiesced: assign(() => ({ phase: 'quiesced' as const })),
    markHandlesClosed: assign(() => ({
      databaseHandlesClosed: true,
      phase: 'handles_closed' as const,
    })),
    markDatabaseDeleted: assign(() => ({
      databaseDeleted: true,
      phase: 'database_deleted' as const,
    })),
    markSessionCleared: assign(() => ({
      sessionCleared: true,
      phase: 'session_cleared' as const,
    })),
    markLocalCleared: assign(() => ({ localCleared: true, phase: 'local_cleared' as const })),
    markDatabaseReinitialized: assign(() => ({
      databaseReinitialized: true,
      phase: 'database_reinitialized' as const,
    })),
    markSettingsAligned: assign(() => ({
      settingsAligned: true,
      phase: 'settings_aligned' as const,
    })),
    markReadinessBroadcasted: assign(({ event }) =>
      event.type === 'RESET_READY_BROADCASTED' ? { readinessDelivery: event.delivery } : {}
    ),
    markReceiptPersisted: assign(() => ({ receiptPersisted: true })),
    markCommitCheckpointed: assign(() => ({
      commitCheckpointed: true,
      phase: 'committed' as const,
    })),
    markCommittedBroadcasted: assign(({ event }) =>
      event.type === 'RESET_COMMITTED_BROADCASTED' ? { postCommitDelivery: event.delivery } : {}
    ),
    markCompletionRecognized: assign(() => recognizedPostClearCompletionPatch()),
    rememberFailure: assign(({ event }) =>
      event.type === 'STEP_FAILED' ? { error: { ...event.error } } : {}
    ),
    prepareRetry: assign(({ context }) => ({
      retryCount: context.retryCount + 1,
      readinessDelivery: null,
      postCommitDelivery: null,
      restartDisposition: 'resume' as const,
      error: null,
    })),
    expectJournal: assign(() => expectation('journal', true)),
    expectPreflight: assign(() => expectation('preflight', false)),
    expectFenceCheckpoint: assign(() => expectation('fence', true)),
    expectLiveFence: assign(() => expectation('fence', false, 'boot_fence_reacquisition')),
    expectQuiescence: assign(() => expectation('quiescence', false)),
    expectQuiescenceCheckpoint: assign(() => expectation('quiescence', true)),
    expectHandles: assign(() => expectation('handles', true)),
    expectDatabase: assign(() => expectation('database', true)),
    expectSession: assign(() => expectation('session', true)),
    expectLocal: assign(() => expectation('local', true)),
    expectReinitialize: assign(() => expectation('reinitialize', true)),
    expectSettingsRecovery: assign(() => expectation('settings_recovery', true)),
    expectReadinessBroadcast: assign(() => expectation('readiness_broadcast', false)),
    expectReceipt: assign(() => expectation('receipt', false)),
    expectPostCommitBroadcast: assign(() => expectation('postcommit_broadcast', false)),
    clearExpectedStep: assign(() => expectation(null, false)),
    finishReset: assign(() => ({
      journalPersisted: false,
      fenceAcquired: false,
      restartDisposition: null,
      expectedStep: null,
      expectedErrorOrigin: null,
      journalCheckpointExpected: false,
      completionDisposition: 'executed' as const,
      error: null,
    })),
  },
});

const retryTransitions = [
  {
    guard: 'retryNeedsFence',
    target: '#localDataResetReacquiringFence',
    actions: 'prepareRetry',
  },
  {
    guard: 'retryAtPreflight',
    target: '#localDataResetPreflightingCompletion',
    actions: 'prepareRetry',
  },
  {
    guard: 'retryCanRecover',
    target: '#localDataResetRecovering',
    actions: 'prepareRetry',
  },
] as const;

export const localDataResetMachine = localDataResetSetup.createMachine({
  id: 'localDataReset',
  initial: 'idle',
  context: ({ input }) => initialLocalDataResetContext(input),
  states: {
    idle: {
      on: {
        RESET_REQUESTED: {
          guard: 'validRequest',
          target: '#localDataResetPreflightingCompletion',
          actions: 'initializeReset',
        },
        SERVICE_WORKER_RESTARTED: [
          { guard: 'restartWithoutJournal' },
          {
            guard: 'restartWithValidJournal',
            target: '#localDataResetReacquiringFence',
            actions: 'restoreJournal',
          },
          { target: '#localDataResetFailed', actions: 'recordCorruptJournal' },
        ],
      },
    },
    active: {
      initial: 'preflightingCompletion',
      on: {
        STEP_FAILED: [
          {
            guard: 'blockingFailure',
            target: '#localDataResetBlocked',
            actions: 'rememberFailure',
          },
          {
            guard: 'matchingFailure',
            target: '#localDataResetFailed',
            actions: 'rememberFailure',
          },
        ],
      },
      states: {
        preflightingCompletion: {
          id: 'localDataResetPreflightingCompletion',
          entry: 'expectPreflight',
          on: {
            RESET_PREFLIGHT_FRESH: {
              guard: 'matchingFreshPreflight',
              target: 'journaling',
            },
            RESET_COMPLETION_RECOGNIZED: {
              guard: 'matchingPostClearCompletion',
              target: '#localDataResetCompleted',
              actions: 'markCompletionRecognized',
            },
          },
        },
        reacquiringFence: {
          id: 'localDataResetReacquiringFence',
          entry: 'expectLiveFence',
          on: {
            BOOT_FENCE_ACQUIRED: {
              guard: 'matchingReset',
              target: 'routingRestart',
              actions: 'markBootFenceAcquired',
            },
          },
        },
        routingRestart: {
          entry: 'clearExpectedStep',
          always: [
            { guard: 'restartShouldResume', target: 'recovering' },
            { guard: 'restartShouldBlock', target: '#localDataResetBlocked' },
            { guard: 'restartShouldFail', target: '#localDataResetFailed' },
          ],
        },
        journaling: {
          id: 'localDataResetJournaling',
          entry: 'expectJournal',
          on: {
            RESET_JOURNALED: {
              guard: 'matchingReset',
              target: 'fencing',
              actions: 'markJournaled',
            },
          },
        },
        fencing: {
          entry: 'expectFenceCheckpoint',
          on: {
            FENCE_ACQUIRED: {
              guard: 'matchingReset',
              target: 'quiescing',
              actions: 'markFenced',
            },
          },
        },
        quiescing: {
          entry: 'expectQuiescence',
          always: { guard: 'allDependenciesQuiescent', target: 'checkpointingQuiescence' },
          on: {
            SCAN_QUIESCED: { guard: 'matchingReset', actions: 'markScanQuiescent' },
            TRACKING_QUIESCED: { guard: 'matchingReset', actions: 'markTrackingQuiescent' },
            MIGRATION_QUIESCED: { guard: 'matchingReset', actions: 'markMigrationQuiescent' },
            OUTBOX_QUIESCED: { guard: 'matchingReset', actions: 'markOutboxQuiescent' },
          },
        },
        checkpointingQuiescence: {
          entry: 'expectQuiescenceCheckpoint',
          on: {
            QUIESCENCE_CHECKPOINTED: {
              guard: 'matchingReset',
              target: 'closingDatabase',
              actions: 'markQuiesced',
            },
          },
        },
        closingDatabase: {
          entry: 'expectHandles',
          on: {
            DB_HANDLES_CLOSED: {
              guard: 'matchingReset',
              target: 'deletingDatabase',
              actions: 'markHandlesClosed',
            },
          },
        },
        deletingDatabase: {
          entry: 'expectDatabase',
          on: {
            DATABASE_DELETED: {
              guard: 'matchingReset',
              target: 'clearingSession',
              actions: 'markDatabaseDeleted',
            },
          },
        },
        clearingSession: {
          entry: 'expectSession',
          on: {
            SESSION_CLEARED: {
              guard: 'matchingReset',
              target: 'clearingLocal',
              actions: 'markSessionCleared',
            },
          },
        },
        clearingLocal: {
          entry: 'expectLocal',
          on: {
            LOCAL_CLEARED: {
              guard: 'matchingReset',
              target: 'reinitializing',
              actions: 'markLocalCleared',
            },
          },
        },
        reinitializing: {
          entry: 'expectReinitialize',
          on: {
            DATABASE_REINITIALIZED: {
              guard: 'matchingReinitializedEpoch',
              target: 'aligningSettings',
              actions: 'markDatabaseReinitialized',
            },
          },
        },
        aligningSettings: {
          entry: 'expectSettingsRecovery',
          on: {
            SETTINGS_ALIGNED: {
              guard: 'matchingSettingsAlignment',
              target: 'broadcastingReadiness',
              actions: 'markSettingsAligned',
            },
          },
        },
        broadcastingReadiness: {
          entry: 'expectReadinessBroadcast',
          on: {
            RESET_READY_BROADCASTED: {
              guard: 'matchingReadinessEcho',
              target: 'writingReceipt',
              actions: 'markReadinessBroadcasted',
            },
          },
        },
        writingReceipt: {
          entry: 'expectReceipt',
          on: {
            RESET_RECEIPT_WRITTEN: {
              guard: 'matchingReceiptWrite',
              target: 'checkpointingCommit',
              actions: 'markReceiptPersisted',
            },
          },
        },
        checkpointingCommit: {
          entry: 'expectJournal',
          on: {
            RESET_COMMIT_CHECKPOINTED: {
              guard: 'commitCheckpointAllowed',
              target: 'broadcastingCommitted',
              actions: 'markCommitCheckpointed',
            },
          },
        },
        broadcastingCommitted: {
          entry: 'expectPostCommitBroadcast',
          on: {
            RESET_COMMITTED_BROADCASTED: {
              guard: 'matchingCommittedEcho',
              target: 'clearingJournal',
              actions: 'markCommittedBroadcasted',
            },
          },
        },
        clearingJournal: {
          entry: 'expectJournal',
          on: {
            JOURNAL_CLEARED: {
              guard: 'completionProven',
              target: '#localDataResetCompleted',
              actions: 'finishReset',
            },
          },
        },
        recovering: {
          id: 'localDataResetRecovering',
          entry: 'clearExpectedStep',
          always: [
            { guard: 'resumeAtFencing', target: 'fencing' },
            { guard: 'resumeAtQuiescing', target: 'quiescing' },
            { guard: 'resumeAtClosingDatabase', target: 'closingDatabase' },
            { guard: 'resumeAtDeletingDatabase', target: 'deletingDatabase' },
            { guard: 'resumeAtClearingSession', target: 'clearingSession' },
            { guard: 'resumeAtClearingLocal', target: 'clearingLocal' },
            { guard: 'resumeAtReinitializing', target: 'reinitializing' },
            { guard: 'resumeAtAligningSettings', target: 'aligningSettings' },
            { guard: 'resumeAtBroadcastingReadiness', target: 'broadcastingReadiness' },
            { guard: 'resumeAtBroadcastingCommitted', target: 'broadcastingCommitted' },
          ],
        },
      },
    },
    blocked: {
      id: 'localDataResetBlocked',
      on: { RETRY: retryTransitions },
    },
    failed: {
      id: 'localDataResetFailed',
      on: { RETRY: retryTransitions },
    },
    completed: {
      id: 'localDataResetCompleted',
      type: 'final',
    },
  },
});
