import { assign, setup } from 'xstate';

import {
  commitCheckpointAllowed,
  handoffReferenceFromCheckpointEvent,
  initialLocalDataResetContext,
  isFailureAllowedForStep,
  localDataResetCompletionProven,
  matchesFreshResetPreflight,
  matchesBackgroundSchedulingHandoffAdoption,
  matchesBackgroundSchedulingHandoffCheckpoint,
  matchesBackgroundSchedulingHandoffClear,
  matchesAdmissionOpened,
  matchesFailureCheckpoint,
  matchesPostClearResetCompletion,
  matchesRetryCheckpoint,
  matchesReset,
  matchesReinitializedSettingsEnvelope,
  matchesResetEpochBroadcast,
  matchesResetFenceAuthority,
  matchesResetReceiptWrite,
  matchesSessionClear,
  matchesLocalClear,
  matchesSettingsAlignment,
  resetExpectation as expectation,
  resetFenceAuthorityPatch,
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
    matchingResetFenceAuthority: ({ context, event }) => matchesResetFenceAuthority(context, event),
    matchingFreshPreflight: ({ context, event }) => matchesFreshResetPreflight(context, event),
    matchingPostClearCompletion: ({ context, event }) =>
      matchesPostClearResetCompletion(context, event),
    matchingAdmissionOpened: ({ context, event }) => matchesAdmissionOpened(context, event),
    matchingHandoffCheckpoint: ({ context, event }) =>
      matchesBackgroundSchedulingHandoffCheckpoint(context, event),
    matchingSessionClear: ({ context, event }) => matchesSessionClear(context, event),
    matchingLocalClear: ({ context, event }) => matchesLocalClear(context, event),
    matchingHandoffAdoption: ({ context, event }) =>
      matchesBackgroundSchedulingHandoffAdoption(context, event),
    matchingHandoffClear: ({ context, event }) =>
      matchesBackgroundSchedulingHandoffClear(context, event),
    matchingFailureCheckpoint: ({ context, event }) => matchesFailureCheckpoint(context, event),
    matchingBlockingFailureCheckpoint: ({ context, event }) =>
      context.pendingFailure?.code === 'BLOCKED' && matchesFailureCheckpoint(context, event),
    matchingRetryCheckpoint: ({ context, event }) => matchesRetryCheckpoint(context, event),
    blockingFailure: ({ context, event }) =>
      !context.journalPersisted &&
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
      !context.journalPersisted &&
      event.type === 'STEP_FAILED' &&
      matchesReset(context, event) &&
      isFailureAllowedForStep(
        context.expectedStep,
        context.expectedErrorOrigin,
        context.journalCheckpointExpected,
        event.error
      ),
    journaledFailure: ({ context, event }) =>
      context.journalPersisted &&
      event.type === 'STEP_FAILED' &&
      matchesReset(context, event) &&
      isFailureAllowedForStep(
        context.expectedStep,
        context.expectedErrorOrigin,
        context.journalCheckpointExpected,
        event.error
      ),
    pendingFailureBlocks: ({ context }) => context.pendingFailure?.code === 'BLOCKED',
    allDependenciesQuiescent: ({ context }) =>
      context.scanQuiescent &&
      context.trackingQuiescent &&
      context.migrationQuiescent &&
      context.outboxQuiescent &&
      context.backgroundSchedulingHandoffCheckpointed,
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
    retryHasJournal: ({ context, event }) =>
      event.type === 'RETRY' &&
      matchesReset(context, event) &&
      context.error?.retryable === true &&
      context.journalPersisted,
    retryPostClearAdmission: ({ context, event }) =>
      event.type === 'RETRY' &&
      matchesReset(context, event) &&
      context.error?.retryable === true &&
      !context.journalPersisted &&
      context.phase === 'committed',
    checkpointedRetryNeedsFence: ({ context }) =>
      context.journalPersisted && !context.fenceAcquired,
    checkpointedRetryCanRecover: ({ context }) =>
      context.phase !== 'none' && (!context.journalPersisted || context.fenceAcquired),
    restartShouldResume: ({ context }) => context.restartDisposition === 'resume',
    restartShouldBlock: ({ context }) => context.restartDisposition === 'blocked',
    restartShouldFail: ({ context }) => context.restartDisposition === 'failed',
    resumeAtFenceCheckpoint: ({ context }) => context.phase === 'journaled',
    resumeAtQuiescing: ({ context }) => context.phase === 'fenced',
    resumeAtClosingDatabase: ({ context }) => context.phase === 'quiesced',
    resumeAtDeletingDatabase: ({ context }) => context.phase === 'handles_closed',
    resumeAtClearingSession: ({ context }) => context.phase === 'database_deleted',
    resumeAtClearingLocal: ({ context }) => context.phase === 'session_cleared',
    resumeAtReinitializing: ({ context }) => context.phase === 'local_cleared',
    resumeAtAligningSettings: ({ context }) => context.phase === 'database_reinitialized',
    resumeAtBroadcastingReadiness: ({ context }) => context.phase === 'settings_aligned',
    resumeAtBroadcastingCommitted: ({ context }) => context.phase === 'committed',
    resumeAtClearingBackgroundHandoff: ({ context }) => context.phase === 'handoff_adopted',
    resumeAtClearingJournal: ({ context }) => context.phase === 'handoff_cleared',
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
    markFreshReservation: assign(() => ({ journalOutcome: 'absent_proven' as const })),
    markJournalOutcomeUnknown: assign(() => ({ journalOutcome: 'outcome_unknown' as const })),
    markJournalAbsent: assign(() => ({ journalOutcome: 'absent_proven' as const })),
    markJournaled: assign(() => ({
      journalPersisted: true,
      journalOutcome: 'durable_proven' as const,
      phase: 'journaled' as const,
    })),
    markLiveFenceAcquired: assign(({ context, event }) => resetFenceAuthorityPatch(context, event)),
    markFenced: assign(() => ({ phase: 'fenced' as const })),
    markBootFenceAcquired: assign(({ context, event }) => resetFenceAuthorityPatch(context, event)),
    markScanQuiescent: assign(() => ({ scanQuiescent: true })),
    markTrackingQuiescent: assign(() => ({ trackingQuiescent: true })),
    markMigrationQuiescent: assign(() => ({ migrationQuiescent: true })),
    markOutboxQuiescent: assign(() => ({ outboxQuiescent: true })),
    markHandoffCheckpointed: assign(({ context, event }) => {
      const reference = handoffReferenceFromCheckpointEvent(context, event);
      return reference === null
        ? {}
        : {
            backgroundSchedulingHandoffCheckpointed: true,
            backgroundSchedulingHandoff: reference,
          };
    }),
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
    markHandoffAdopted: assign(({ context }) => {
      const replacementRequired =
        context.backgroundSchedulingHandoff !== null &&
        context.backgroundSchedulingHandoff.sourceWorkerEpoch !== context.workerEpoch;
      return {
        backgroundSchedulingHandoffAdopted: true,
        backgroundSchedulingCleanupReplacementRequired: replacementRequired,
        backgroundSchedulingCleanupReplacementReceipt: replacementRequired
          ? context.backgroundSchedulingCleanupReplacementReceipt
          : null,
        phase: 'handoff_adopted' as const,
      };
    }),
    markHandoffCleared: assign(() => ({
      backgroundSchedulingHandoffCleared: true,
      backgroundSchedulingCleanupReplacementRequired: false,
      backgroundSchedulingCleanupReplacementReceipt: null,
      phase: 'handoff_cleared' as const,
    })),
    markCompletionRecognized: assign(() => recognizedPostClearCompletionPatch()),
    markJournalCleared: assign(() => ({
      journalPersisted: false,
      journalOutcome: 'none' as const,
    })),
    rememberPendingFailure: assign(({ event }) =>
      event.type === 'STEP_FAILED' ? { pendingFailure: { ...event.error } } : {}
    ),
    commitPendingFailure: assign(({ context }) => ({
      error: context.pendingFailure === null ? null : { ...context.pendingFailure },
      pendingFailure: null,
    })),
    rememberFailure: assign(({ event }) =>
      event.type === 'STEP_FAILED' ? { error: { ...event.error } } : {}
    ),
    prepareRetry: assign(({ context }) => ({
      retryCount: context.retryCount + 1,
      readinessDelivery: null,
      postCommitDelivery: null,
      restartDisposition: 'resume' as const,
      error: null,
      pendingFailure: null,
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
    expectHandoffAdoption: assign(() => expectation('handoff_adoption', true)),
    expectHandoffCleanup: assign(() => expectation('handoff_cleanup', true)),
    expectAdmissionOpen: assign(() => expectation('post_clear_admission', false)),
    clearExpectedStep: assign(() => expectation(null, false)),
    finishReset: assign(({ context }) => ({
      fenceAcquired: false,
      admissionOpen: true,
      restartDisposition: null,
      expectedStep: null,
      expectedErrorOrigin: null,
      journalCheckpointExpected: false,
      completionDisposition: context.completionDisposition ?? ('executed' as const),
      error: null,
      pendingFailure: null,
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
            guard: 'journaledFailure',
            target: '#localDataResetCheckpointingFailure',
            actions: 'rememberPendingFailure',
          },
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
              actions: 'markFreshReservation',
            },
            RESET_COMPLETION_RECOGNIZED: {
              guard: 'matchingPostClearCompletion',
              target: 'openingEpochAdmission',
              actions: 'markCompletionRecognized',
            },
          },
        },
        reacquiringFence: {
          id: 'localDataResetReacquiringFence',
          entry: 'expectLiveFence',
          on: {
            BOOT_FENCE_ACQUIRED: {
              guard: 'matchingResetFenceAuthority',
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
              target: 'acquiringFence',
              actions: 'markJournaled',
            },
            RESET_JOURNAL_OUTCOME_UNKNOWN: {
              guard: 'matchingReset',
              target: 'resolvingInitialJournal',
              actions: 'markJournalOutcomeUnknown',
            },
          },
        },
        resolvingInitialJournal: {
          entry: 'expectJournal',
          on: {
            RESET_JOURNALED: {
              guard: 'matchingReset',
              target: 'acquiringFence',
              actions: 'markJournaled',
            },
            RESET_JOURNAL_ABSENCE_PROVEN: {
              guard: 'matchingReset',
              target: 'journaling',
              actions: 'markJournalAbsent',
            },
          },
        },
        acquiringFence: {
          on: {
            RESET_FENCE_AUTHORITY_ACQUIRED: {
              guard: 'matchingResetFenceAuthority',
              target: 'checkpointingFence',
              actions: 'markLiveFenceAcquired',
            },
          },
        },
        checkpointingFence: {
          entry: 'expectFenceCheckpoint',
          on: {
            FENCE_CHECKPOINTED: {
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
            BACKGROUND_SCHEDULING_HANDOFF_CHECKPOINTED: {
              guard: 'matchingHandoffCheckpoint',
              actions: 'markHandoffCheckpointed',
            },
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
              guard: 'matchingSessionClear',
              target: 'clearingLocal',
              actions: 'markSessionCleared',
            },
          },
        },
        clearingLocal: {
          entry: 'expectLocal',
          on: {
            LOCAL_CLEARED: {
              guard: 'matchingLocalClear',
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
              target: 'adoptingBackgroundHandoff',
              actions: 'markCommittedBroadcasted',
            },
          },
        },
        adoptingBackgroundHandoff: {
          entry: 'expectHandoffAdoption',
          on: {
            BACKGROUND_SCHEDULING_HANDOFF_ADOPTED: {
              guard: 'matchingHandoffAdoption',
              target: 'clearingBackgroundHandoff',
              actions: 'markHandoffAdopted',
            },
          },
        },
        clearingBackgroundHandoff: {
          entry: 'expectHandoffCleanup',
          on: {
            BACKGROUND_SCHEDULING_HANDOFF_CLEARED: {
              guard: 'matchingHandoffClear',
              target: 'clearingJournal',
              actions: 'markHandoffCleared',
            },
          },
        },
        clearingJournal: {
          entry: 'expectJournal',
          on: {
            JOURNAL_CLEARED: {
              guard: 'completionProven',
              target: 'openingEpochAdmission',
              actions: 'markJournalCleared',
            },
          },
        },
        openingEpochAdmission: {
          entry: 'expectAdmissionOpen',
          on: {
            RESET_EPOCH_ADMISSION_OPENED: {
              guard: 'matchingAdmissionOpened',
              target: '#localDataResetCompleted',
              actions: 'finishReset',
            },
            STEP_FAILED: {
              guard: 'matchingFailure',
              target: 'postClearAdmissionFailed',
              actions: 'rememberFailure',
            },
          },
        },
        postClearAdmissionFailed: {
          on: {
            RETRY: {
              guard: 'retryPostClearAdmission',
              target: 'openingEpochAdmission',
              actions: 'prepareRetry',
            },
          },
        },
        checkpointingFailure: {
          id: 'localDataResetCheckpointingFailure',
          entry: 'expectJournal',
          on: {
            FAILURE_CHECKPOINTED: [
              {
                guard: 'matchingBlockingFailureCheckpoint',
                target: '#localDataResetBlocked',
                actions: 'commitPendingFailure',
              },
              {
                guard: 'matchingFailureCheckpoint',
                target: '#localDataResetFailed',
                actions: 'commitPendingFailure',
              },
            ],
            FAILURE_CHECKPOINT_FAILED: {
              guard: 'matchingReset',
              target: 'failureCheckpointBlocked',
            },
          },
        },
        failureCheckpointBlocked: {
          on: {
            RETRY_FAILURE_CHECKPOINT: {
              guard: 'matchingReset',
              target: 'checkpointingFailure',
            },
          },
        },
        checkpointingRetry: {
          id: 'localDataResetCheckpointingRetry',
          entry: 'expectJournal',
          on: {
            RETRY_CHECKPOINTED: {
              guard: 'matchingRetryCheckpoint',
              target: 'routingCheckpointedRetry',
              actions: 'prepareRetry',
            },
            RETRY_CHECKPOINT_FAILED: {
              guard: 'matchingReset',
              target: 'retryCheckpointBlocked',
            },
          },
        },
        retryCheckpointBlocked: {
          on: {
            RETRY_RETRY_CHECKPOINT: {
              guard: 'matchingReset',
              target: 'checkpointingRetry',
            },
          },
        },
        routingCheckpointedRetry: {
          always: [
            { guard: 'checkpointedRetryNeedsFence', target: 'reacquiringFence' },
            { guard: 'checkpointedRetryCanRecover', target: 'recovering' },
          ],
        },
        recovering: {
          id: 'localDataResetRecovering',
          entry: 'clearExpectedStep',
          always: [
            { guard: 'resumeAtFenceCheckpoint', target: 'checkpointingFence' },
            { guard: 'resumeAtQuiescing', target: 'quiescing' },
            { guard: 'resumeAtClosingDatabase', target: 'closingDatabase' },
            { guard: 'resumeAtDeletingDatabase', target: 'deletingDatabase' },
            { guard: 'resumeAtClearingSession', target: 'clearingSession' },
            { guard: 'resumeAtClearingLocal', target: 'clearingLocal' },
            { guard: 'resumeAtReinitializing', target: 'reinitializing' },
            { guard: 'resumeAtAligningSettings', target: 'aligningSettings' },
            { guard: 'resumeAtBroadcastingReadiness', target: 'broadcastingReadiness' },
            { guard: 'resumeAtBroadcastingCommitted', target: 'broadcastingCommitted' },
            {
              guard: 'resumeAtClearingBackgroundHandoff',
              target: 'clearingBackgroundHandoff',
            },
            { guard: 'resumeAtClearingJournal', target: 'clearingJournal' },
          ],
        },
      },
    },
    blocked: {
      id: 'localDataResetBlocked',
      on: {
        RETRY: [
          {
            guard: 'retryHasJournal',
            target: '#localDataResetCheckpointingRetry',
          },
          ...retryTransitions,
        ],
      },
    },
    failed: {
      id: 'localDataResetFailed',
      on: {
        RETRY: [
          {
            guard: 'retryHasJournal',
            target: '#localDataResetCheckpointingRetry',
          },
          ...retryTransitions,
        ],
      },
    },
    completed: {
      id: 'localDataResetCompleted',
      type: 'final',
    },
  },
});
