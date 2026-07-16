import { assign, setup } from 'xstate';

import {
  DATASET_STARTUP_MODEL_VERSION,
  DATASET_STARTUP_MAX_BOOTSTRAPS_PER_PUBLICATION,
  DATASET_STARTUP_TARGET_DATA_VERSION,
  DATASET_STARTUP_TARGET_DB_VERSION,
  datasetStartupCommandId,
  datasetStartupDowngradeError,
  datasetStartupInputIsValid,
  datasetStartupIsDowngrade,
  datasetStartupProtocolError,
  datasetStartupVersionsAreCoherent,
  expectedSettingsDecodePolicy,
  initialDatasetStartupContext,
  type DatasetStartupCommand,
  type DatasetStartupContext,
  type DatasetStartupEvent,
  type DatasetStartupInput,
  type DatasetStartupResetTransferSource,
  type DatasetStartupResetTransferV1,
  type DatasetStartupStage,
} from './dataset-startup.contract';
import { commandId as settingsCommandId } from './settings-persistence.contract';

function requireAttempt(context: DatasetStartupContext): string {
  if (context.attemptId === null) {
    throw new Error('Dataset startup attempt identity is missing');
  }
  return context.attemptId;
}

function baseCommand<const AllowsDatabaseOpen extends boolean>(
  context: DatasetStartupContext,
  stage: DatasetStartupStage,
  allowsDatabaseOpen: AllowsDatabaseOpen
) {
  const attemptId = requireAttempt(context);
  return {
    version: DATASET_STARTUP_MODEL_VERSION,
    attemptId,
    workerEpoch: context.workerEpoch,
    commandId: datasetStartupCommandId(stage, attemptId),
    allowsDatabaseOpen,
    destructiveRepairAllowed: false as const,
  };
}

function resetAttemptPatch(
  context: DatasetStartupContext,
  event: Extract<DatasetStartupEvent, { type: 'START' | 'RETRY' }>,
  retryCount: number
): Partial<DatasetStartupContext> {
  return {
    attemptId: event.attemptId,
    pendingRequestIds: [event.requestId],
    settingsRecoveryRequestId: event.settingsRecoveryRequestId,
    retryCount,
    expectedStage: null,
    command: null,
    pendingReset: null,
    versions: null,
    entryDataVersion: null,
    structureProof: null,
    dataProof: null,
    verificationProof: null,
    dataEpoch: null,
    settingsEnvelopeProof: null,
    preparedProof: null,
    settingsRecoveryProof: null,
    admissionProof: null,
    lastPublicationProof: null,
    failureFenceProof: null,
    fenceError: null,
    resetTransfer: null,
    error: null,
  };
}

function transfer(
  source: DatasetStartupResetTransferSource,
  event: DatasetStartupEvent
): DatasetStartupResetTransferV1 | null {
  if (event.type === 'RESET_JOURNAL_FOUND' || event.type === 'SETTINGS_RESET_IN_PROGRESS') {
    return {
      version: DATASET_STARTUP_MODEL_VERSION,
      source,
      resetId: event.journal.resetId,
      journal: event.journal,
      proof: null,
    };
  }
  if (event.type === 'RESET_PREFLIGHT_FRESH') {
    return {
      version: DATASET_STARTUP_MODEL_VERSION,
      source,
      resetId: event.proof.resetId,
      journal: null,
      proof: event.proof,
    };
  }
  if (event.type === 'RESET_COMPLETION_RECOGNIZED') {
    return {
      version: DATASET_STARTUP_MODEL_VERSION,
      source,
      resetId: event.proof.resetId,
      journal: null,
      proof: event.proof,
    };
  }
  if (event.type === 'RESET_PREEMPTED') {
    return {
      version: DATASET_STARTUP_MODEL_VERSION,
      source,
      resetId: event.resetId,
      journal: event.journal,
      proof: null,
    };
  }
  return null;
}

function transferCommand(
  context: DatasetStartupContext,
  reset: DatasetStartupResetTransferV1
): DatasetStartupCommand {
  return {
    version: DATASET_STARTUP_MODEL_VERSION,
    type: 'TRANSFER_RESET_OWNERSHIP',
    attemptId: requireAttempt(context),
    workerEpoch: context.workerEpoch,
    reset,
  };
}

function eventMatchesAttempt(context: DatasetStartupContext, event: DatasetStartupEvent): boolean {
  return (
    context.attemptId !== null &&
    event.attemptId === context.attemptId &&
    event.workerEpoch === context.workerEpoch
  );
}

function currentCommandId(context: DatasetStartupContext): string | null {
  return context.command !== null && 'commandId' in context.command
    ? context.command.commandId
    : null;
}

function eventMatchesCommand(context: DatasetStartupContext, event: DatasetStartupEvent): boolean {
  return (
    eventMatchesAttempt(context, event) &&
    'commandId' in event &&
    event.commandId === currentCommandId(context)
  );
}

export function createDatasetStartupSetup(
  isAdmittedEvent: (event: DatasetStartupEvent) => boolean
) {
  return setup({
    types: {
      context: {} as DatasetStartupContext,
      events: {} as DatasetStartupEvent,
      input: {} as DatasetStartupInput,
    },
    guards: {
      validInput: ({ context }) =>
        datasetStartupInputIsValid({
          workerEpoch: context.workerEpoch,
          defaultSettings: context.defaultSettings,
          includedConnectorIds: context.includedConnectorIds,
        }),
      admittedEvent: ({ event }) => isAdmittedEvent(event),
      validInitialStart: ({ context, event }) =>
        event.type === 'START' &&
        context.attemptId === null &&
        event.workerEpoch === context.workerEpoch,
      joinableStart: ({ context, event }) =>
        event.type === 'START' &&
        context.error === null &&
        eventMatchesAttempt(context, event) &&
        event.settingsRecoveryRequestId === context.settingsRecoveryRequestId,
      publicationBatchHasCapacity: ({ context, event }) =>
        event.type === 'START' &&
        (context.pendingRequestIds.includes(event.requestId) ||
          context.pendingRequestIds.length < DATASET_STARTUP_MAX_BOOTSTRAPS_PER_PUBLICATION),
      duplicateReadyStart: ({ context, event }) =>
        event.type === 'START' &&
        context.error === null &&
        eventMatchesAttempt(context, event) &&
        event.settingsRecoveryRequestId === context.settingsRecoveryRequestId &&
        context.lastPublicationProof?.bootstraps.some(
          (bootstrap) => bootstrap.requestId === event.requestId
        ) === true,
      freshReadyStart: ({ context, event }) =>
        event.type === 'START' &&
        context.error === null &&
        eventMatchesAttempt(context, event) &&
        event.settingsRecoveryRequestId === context.settingsRecoveryRequestId &&
        context.lastPublicationProof?.bootstraps.some(
          (bootstrap) => bootstrap.requestId === event.requestId
        ) !== true,
      matchingCommand: ({ context, event }) => eventMatchesCommand(context, event),
      versionsDowngrade: ({ event }) =>
        event.type === 'VERSIONS_READ' && datasetStartupIsDowngrade(event.versions),
      versionsIncoherent: ({ event }) =>
        event.type === 'VERSIONS_READ' && !datasetStartupVersionsAreCoherent(event.versions),
      versionsNeedStructure: ({ event }) =>
        event.type === 'VERSIONS_READ' &&
        event.versions.storedDbVersion < DATASET_STARTUP_TARGET_DB_VERSION,
      versionsNeedData: ({ event }) =>
        event.type === 'VERSIONS_READ' &&
        event.versions.storedDbVersion === DATASET_STARTUP_TARGET_DB_VERSION &&
        (event.versions.storedDataVersion ?? 0) < DATASET_STARTUP_TARGET_DATA_VERSION,
      versionsCurrent: ({ event }) =>
        event.type === 'VERSIONS_READ' &&
        event.versions.storedDbVersion === DATASET_STARTUP_TARGET_DB_VERSION &&
        event.versions.storedDataVersion === DATASET_STARTUP_TARGET_DATA_VERSION,
      matchingResetGateClear: ({ context, event }) =>
        event.type === 'RESET_GATE_CLEARED' && eventMatchesCommand(context, event),
      matchingPendingReset: ({ context, event }) =>
        event.type === 'RESET_REQUEST_PENDING' && eventMatchesCommand(context, event),
      matchingResetJournal: ({ context, event }) =>
        event.type === 'RESET_JOURNAL_FOUND' && eventMatchesCommand(context, event),
      matchingFreshPreflight: ({ context, event }) =>
        event.type === 'RESET_PREFLIGHT_FRESH' && eventMatchesCommand(context, event),
      matchingCompletionRecognition: ({ context, event }) =>
        event.type === 'RESET_COMPLETION_RECOGNIZED' && eventMatchesCommand(context, event),
      matchingVersions: ({ context, event }) =>
        event.type === 'VERSIONS_READ' && eventMatchesCommand(context, event),
      matchingStructureCommit: ({ context, event }) =>
        event.type === 'STRUCTURE_COMMITTED' && eventMatchesCommand(context, event),
      matchingDataCommit: ({ context, event }) =>
        event.type === 'DATA_COMMITTED' && eventMatchesCommand(context, event),
      matchingVerification: ({ context, event }) =>
        event.type === 'VERIFICATION_PASSED' && eventMatchesCommand(context, event),
      matchingSettingsEnvelope: ({ context, event }) =>
        event.type === 'SETTINGS_ENVELOPE_WRAPPED' && eventMatchesCommand(context, event),
      matchingPreparedRecovery: ({ context, event }) =>
        event.type === 'PREPARED_RECOVERED' && eventMatchesCommand(context, event),
      matchingSettingsRecovery: ({ context, event }) =>
        event.type === 'SETTINGS_RECOVERY_PASSED' &&
        eventMatchesAttempt(context, event) &&
        event.commandId === currentCommandId(context),
      matchingSettingsReset: ({ context, event }) =>
        event.type === 'SETTINGS_RESET_IN_PROGRESS' &&
        context.expectedStage === 'settings_recovery' &&
        eventMatchesCommand(context, event),
      allAdmissionProofsRetained: ({ context, event }) =>
        event.type === 'ADMISSION_OPENED' &&
        eventMatchesCommand(context, event) &&
        context.verificationProof !== null &&
        context.settingsEnvelopeProof !== null &&
        context.preparedProof !== null &&
        context.settingsRecoveryProof !== null &&
        context.dataEpoch !== null &&
        event.proof.dataEpoch === context.dataEpoch,
      matchingPublication: ({ context, event }) =>
        event.type === 'BOOTSTRAP_PUBLISHED' && eventMatchesCommand(context, event),
      matchingFailure: ({ context, event }) =>
        event.type === 'STEP_FAILED' &&
        eventMatchesCommand(context, event) &&
        event.error.stage === context.expectedStage,
      failureBeforeAdmission: ({ context, event }) =>
        event.type === 'STEP_FAILED' &&
        eventMatchesCommand(context, event) &&
        event.error.stage === context.expectedStage &&
        context.admissionProof === null,
      failureAfterAdmission: ({ context, event }) =>
        event.type === 'STEP_FAILED' &&
        eventMatchesCommand(context, event) &&
        event.error.stage === context.expectedStage &&
        context.admissionProof !== null,
      matchingFailureFence: ({ context, event }) =>
        event.type === 'FAILURE_FENCED' &&
        eventMatchesCommand(context, event) &&
        context.admissionProof !== null &&
        event.proof.admissionProofId === context.admissionProof.proofId &&
        event.proof.previousAuthorityRevision === context.admissionProof.authorityRevision &&
        event.proof.authorityRevision > context.admissionProof.authorityRevision &&
        event.proof.activeLeaseCount === 0 &&
        event.proof.allLeasesRevoked,
      retryAllowed: ({ context, event }) =>
        event.type === 'RETRY' &&
        context.error?.retryable === true &&
        event.workerEpoch === context.workerEpoch &&
        event.attemptId !== context.attemptId &&
        (context.admissionProof === null || context.failureFenceProof !== null),
      matchingResetPreemption: ({ context, event }) =>
        event.type === 'RESET_PREEMPTED' && eventMatchesAttempt(context, event),
    },
    actions: {
      initializeContext: assign(({ context }) =>
        initialDatasetStartupContext({
          workerEpoch: context.workerEpoch,
          defaultSettings: context.defaultSettings,
          includedConnectorIds: context.includedConnectorIds,
        })
      ),
      startAttempt: assign(({ context, event }) =>
        event.type === 'START' ? resetAttemptPatch(context, event, 0) : {}
      ),
      retryAttempt: assign(({ context, event }) =>
        event.type === 'RETRY' ? resetAttemptPatch(context, event, context.retryCount + 1) : {}
      ),
      joinCaller: assign(({ context, event }) => {
        if (
          event.type !== 'START' ||
          context.pendingRequestIds.includes(event.requestId) ||
          context.pendingRequestIds.length >= DATASET_STARTUP_MAX_BOOTSTRAPS_PER_PUBLICATION
        ) {
          return {};
        }
        return { pendingRequestIds: [...context.pendingRequestIds, event.requestId] };
      }),
      joinCallerAndRefreshPublication: assign(({ context, event }) => {
        if (
          event.type !== 'START' ||
          context.dataEpoch === null ||
          context.admissionProof === null
        ) {
          return {};
        }
        const requestIds = context.pendingRequestIds.includes(event.requestId)
          ? [...context.pendingRequestIds]
          : context.pendingRequestIds.length < DATASET_STARTUP_MAX_BOOTSTRAPS_PER_PUBLICATION
            ? [...context.pendingRequestIds, event.requestId]
            : [...context.pendingRequestIds];
        return {
          pendingRequestIds: requestIds,
          expectedStage: 'bootstrap' as const,
          command: {
            ...baseCommand(context, 'bootstrap', false),
            type: 'PUBLISH_BOOTSTRAPS' as const,
            stage: 'bootstrap' as const,
            dataEpoch: context.dataEpoch,
            admissionProofId: context.admissionProof.proofId,
            requestIds,
          },
        };
      }),
      issueResetGate: assign(({ context }) => ({
        expectedStage: 'reset_gate' as const,
        command: {
          ...baseCommand(context, 'reset_gate', false),
          type: 'READ_RESET_GATE' as const,
          stage: 'reset_gate' as const,
        },
      })),
      rememberPendingReset: assign(({ event }) =>
        event.type === 'RESET_REQUEST_PENDING' ? { pendingReset: { ...event.request } } : {}
      ),
      issueResetPreflight: assign(({ context }) => {
        if (context.pendingReset === null) {
          return {};
        }
        return {
          expectedStage: 'reset_preflight' as const,
          command: {
            ...baseCommand(context, 'reset_preflight', false),
            type: 'PREFLIGHT_RESET_REQUEST' as const,
            stage: 'reset_preflight' as const,
            request: { ...context.pendingReset },
          },
        };
      }),
      transferBootJournal: assign(({ context, event }) => {
        const reset = transfer('journal_at_boot', event);
        return reset === null
          ? {}
          : { resetTransfer: reset, expectedStage: null, command: transferCommand(context, reset) };
      }),
      transferFreshReset: assign(({ context, event }) => {
        const reset = transfer('pending_reset_fresh', event);
        return reset === null
          ? {}
          : { resetTransfer: reset, expectedStage: null, command: transferCommand(context, reset) };
      }),
      transferCompletedReset: assign(({ context, event }) => {
        const reset = transfer('pending_reset_completed', event);
        return reset === null
          ? {}
          : { resetTransfer: reset, expectedStage: null, command: transferCommand(context, reset) };
      }),
      transferPreemptedReset: assign(({ context, event }) => {
        const reset = transfer('active_reset_preemption', event);
        return reset === null
          ? {}
          : { resetTransfer: reset, expectedStage: null, command: transferCommand(context, reset) };
      }),
      transferSettingsReset: assign(({ context, event }) => {
        const reset = transfer('settings_reset_in_progress', event);
        return reset === null
          ? {}
          : { resetTransfer: reset, expectedStage: null, command: transferCommand(context, reset) };
      }),
      issueReadVersions: assign(({ context }) => ({
        expectedStage: 'versions' as const,
        command: {
          ...baseCommand(context, 'versions', true),
          type: 'READ_VERSIONS' as const,
          stage: 'versions' as const,
          targetDbVersion: DATASET_STARTUP_TARGET_DB_VERSION,
          targetDataVersion: DATASET_STARTUP_TARGET_DATA_VERSION,
        },
      })),
      recordVersions: assign(({ event }) =>
        event.type === 'VERSIONS_READ'
          ? {
              versions: { ...event.versions },
              entryDataVersion: event.versions.storedDataVersion,
              error: null,
            }
          : {}
      ),
      blockDowngrade: assign(({ context, event }) => {
        if (event.type !== 'VERSIONS_READ') {
          return {};
        }
        const error = datasetStartupDowngradeError();
        return {
          versions: { ...event.versions },
          entryDataVersion: event.versions.storedDataVersion,
          expectedStage: null,
          error,
          command: {
            version: DATASET_STARTUP_MODEL_VERSION,
            type: 'REPORT_DOWNGRADE' as const,
            attemptId: requireAttempt(context),
            workerEpoch: context.workerEpoch,
            error,
            versions: { ...event.versions },
          },
        };
      }),
      failVersionProtocol: assign(({ context, event }) => {
        if (event.type !== 'VERSIONS_READ') {
          return {};
        }
        const error = datasetStartupProtocolError(
          'versions',
          'Les versions IndexedDB et applicative ne forment pas un état de démarrage cohérent.'
        );
        return {
          versions: { ...event.versions },
          entryDataVersion: event.versions.storedDataVersion,
          expectedStage: null,
          error,
          command: {
            version: DATASET_STARTUP_MODEL_VERSION,
            type: 'REPORT_FAILURE' as const,
            attemptId: requireAttempt(context),
            workerEpoch: context.workerEpoch,
            error,
          },
        };
      }),
      issueStructureUpgrade: assign(({ context }) => ({
        expectedStage: 'structure' as const,
        command: {
          ...baseCommand(context, 'structure', true),
          type: 'UPGRADE_STRUCTURE' as const,
          stage: 'structure' as const,
          fromDbVersion: context.versions?.storedDbVersion ?? 0,
          toDbVersion: DATASET_STARTUP_TARGET_DB_VERSION,
        },
      })),
      recordStructureCommit: assign(({ event }) =>
        event.type === 'STRUCTURE_COMMITTED' ? { structureProof: { ...event.proof } } : {}
      ),
      issueDataMigration: assign(({ context }) => ({
        expectedStage: 'data' as const,
        command: {
          ...baseCommand(context, 'data', true),
          type: 'MIGRATE_DATA' as const,
          stage: 'data' as const,
          fromDataVersion: context.entryDataVersion,
          toDataVersion: DATASET_STARTUP_TARGET_DATA_VERSION,
        },
      })),
      recordDataCommit: assign(({ event }) =>
        event.type === 'DATA_COMMITTED' ? { dataProof: { ...event.proof } } : {}
      ),
      issueVerification: assign(({ context }) => ({
        expectedStage: 'verification' as const,
        command: {
          ...baseCommand(context, 'verification', true),
          type: 'VERIFY_CRITICAL_AND_EPOCH' as const,
          stage: 'verification' as const,
        },
      })),
      recordVerification: assign(({ event }) =>
        event.type === 'VERIFICATION_PASSED'
          ? {
              verificationProof: event.proof,
              dataEpoch: event.proof.authority.dataEpoch,
            }
          : {}
      ),
      issueSettingsEnvelopeWrap: assign(({ context }) =>
        context.dataEpoch === null
          ? {}
          : {
              expectedStage: 'settings_envelope' as const,
              command: {
                ...baseCommand(context, 'settings_envelope', false),
                type: 'WRAP_SETTINGS_ENVELOPE' as const,
                stage: 'settings_envelope' as const,
                dataEpoch: context.dataEpoch,
                decodePolicy: expectedSettingsDecodePolicy(context),
              },
            }
      ),
      recordSettingsEnvelope: assign(({ event }) =>
        event.type === 'SETTINGS_ENVELOPE_WRAPPED' ? { settingsEnvelopeProof: event.proof } : {}
      ),
      issuePreparedRecovery: assign(({ context }) =>
        context.dataEpoch === null
          ? {}
          : {
              expectedStage: 'prepared_ledgers' as const,
              command: {
                ...baseCommand(context, 'prepared_ledgers', true),
                type: 'RECOVER_PREPARED_LEDGERS' as const,
                stage: 'prepared_ledgers' as const,
                dataEpoch: context.dataEpoch,
              },
            }
      ),
      recordPreparedRecovery: assign(({ event }) =>
        event.type === 'PREPARED_RECOVERED' ? { preparedProof: event.proof } : {}
      ),
      issueSettingsRecovery: assign(({ context }) => {
        if (context.dataEpoch === null || context.settingsRecoveryRequestId === null) {
          return {};
        }
        return {
          expectedStage: 'settings_recovery' as const,
          command: {
            ...baseCommand(context, 'settings_recovery', false),
            type: 'RECOVER_SETTINGS_AND_ALARM' as const,
            stage: 'settings_recovery' as const,
            commandId: settingsCommandId('recover', context.settingsRecoveryRequestId),
            dataEpoch: context.dataEpoch,
            requestId: context.settingsRecoveryRequestId,
          },
        };
      }),
      recordSettingsRecovery: assign(({ event }) =>
        event.type === 'SETTINGS_RECOVERY_PASSED' ? { settingsRecoveryProof: event } : {}
      ),
      issueOpenAdmission: assign(({ context }) =>
        context.dataEpoch === null
          ? {}
          : {
              expectedStage: 'admission' as const,
              command: {
                ...baseCommand(context, 'admission', false),
                type: 'OPEN_EPOCH_ADMISSION' as const,
                stage: 'admission' as const,
                dataEpoch: context.dataEpoch,
              },
            }
      ),
      recordAdmission: assign(({ event }) =>
        event.type === 'ADMISSION_OPENED' ? { admissionProof: event.proof } : {}
      ),
      issueBootstrapPublication: assign(({ context }) => {
        if (
          context.dataEpoch === null ||
          context.admissionProof === null ||
          context.pendingRequestIds.length === 0 ||
          context.pendingRequestIds.length > DATASET_STARTUP_MAX_BOOTSTRAPS_PER_PUBLICATION
        ) {
          return {};
        }
        return {
          expectedStage: 'bootstrap' as const,
          command: {
            ...baseCommand(context, 'bootstrap', false),
            type: 'PUBLISH_BOOTSTRAPS' as const,
            stage: 'bootstrap' as const,
            dataEpoch: context.dataEpoch,
            admissionProofId: context.admissionProof.proofId,
            requestIds: [...context.pendingRequestIds],
          },
        };
      }),
      recordPublication: assign(({ event }) =>
        event.type === 'BOOTSTRAP_PUBLISHED'
          ? {
              lastPublicationProof: event.proof,
              pendingRequestIds: [],
              expectedStage: null,
              command: null,
              error: null,
            }
          : {}
      ),
      rememberFailure: assign(({ context, event }) => {
        if (event.type !== 'STEP_FAILED') {
          return {};
        }
        return {
          expectedStage: null,
          error: event.error,
          command: {
            version: DATASET_STARTUP_MODEL_VERSION,
            type: 'REPORT_FAILURE' as const,
            attemptId: requireAttempt(context),
            workerEpoch: context.workerEpoch,
            error: event.error,
          },
        };
      }),
      rememberPostAdmissionFailure: assign(({ event }) =>
        event.type === 'STEP_FAILED'
          ? {
              expectedStage: null,
              command: null,
              error: event.error,
              fenceError: null,
              failureFenceProof: null,
            }
          : {}
      ),
      issueFailureFence: assign(({ context }) => {
        if (
          context.dataEpoch === null ||
          context.admissionProof === null ||
          context.error === null
        ) {
          return {};
        }
        return {
          expectedStage: 'failure_fence' as const,
          command: {
            ...baseCommand(context, 'failure_fence', false),
            type: 'FENCE_STARTUP_FAILURE' as const,
            stage: 'failure_fence' as const,
            dataEpoch: context.dataEpoch,
            admissionProofId: context.admissionProof.proofId,
            openedAuthorityRevision: context.admissionProof.authorityRevision,
            failure: { ...context.error },
          },
        };
      }),
      recordFailureFence: assign(({ context, event }) => {
        if (event.type !== 'FAILURE_FENCED' || context.error === null) {
          return {};
        }
        return {
          failureFenceProof: event.proof,
          fenceError: null,
          expectedStage: null,
          command: {
            version: DATASET_STARTUP_MODEL_VERSION,
            type: 'REPORT_FAILURE' as const,
            attemptId: requireAttempt(context),
            workerEpoch: context.workerEpoch,
            error: { ...context.error },
          },
        };
      }),
      rememberFenceFailure: assign(({ context, event }) => {
        if (event.type !== 'STEP_FAILED') {
          return {};
        }
        return {
          expectedStage: null,
          fenceError: event.error,
          command: {
            version: DATASET_STARTUP_MODEL_VERSION,
            type: 'REPORT_FAILURE' as const,
            attemptId: requireAttempt(context),
            workerEpoch: context.workerEpoch,
            error: event.error,
          },
        };
      }),
      reportInvalidInput: assign(({ context }) => {
        const error = datasetStartupProtocolError(
          'reset_gate',
          'La configuration initiale du modèle Dataset startup est invalide.'
        );
        return {
          error,
          command:
            context.attemptId === null
              ? null
              : {
                  version: DATASET_STARTUP_MODEL_VERSION,
                  type: 'REPORT_FAILURE' as const,
                  attemptId: context.attemptId,
                  workerEpoch: context.workerEpoch,
                  error,
                },
        };
      }),
    },
  });
}
