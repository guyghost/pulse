import { assign, setup } from 'xstate';

import {
  ONBOARDING_SOURCE_MODEL_VERSION,
  adoptSettingsSnapshot,
  cancellationCorrelationReserve,
  cancellationMatches,
  canonicalSettingsRecoveryCommandId,
  checkEventMatches,
  cloneOnboardingSourceError,
  correlationIdsAreFresh,
  correlationIdsHaveCapacity,
  consentFailureMatches,
  consentPersistenceMatches,
  dataEpochInvalidationMatches,
  isOnboardingSourceUuidV4,
  onboardingOperationCorrelationIds,
  onboardingPermissionOriginDigest,
  operationIdsAreFresh,
  permissionContainsEventMatches,
  rememberCorrelationIds,
  rehydratedSelectionIsPersisted,
  rehydrationMatches,
  selectedConnectorIsIncluded,
  selectedConnectorIsPersisted,
  selectedConnectorOrigins,
  sessionCheckAllowed,
  settingsFailureMatches,
  settingsMutationEvent,
  settingsSettlementMatches,
  settingsTransactionExpectation,
  skipCompletionFailureMatches,
  skipCompletionPersistenceMatches,
  type OnboardingRecoveryReason,
  type OnboardingSettingsPurpose,
  type OnboardingSourceActiveOperation,
  type OnboardingSourceCommand,
  type OnboardingSourceContext,
  type OnboardingSourceError,
  type OnboardingSourceEvent,
  type OnboardingSourceOperationIds,
  type ParsedOnboardingSourceInput,
} from './onboarding-source.contract';

type SettingsOperation = Extract<
  OnboardingSourceActiveOperation,
  { purpose: 'selection' | 'skip_auto_scan' }
>;

function commandId(kind: string, id: string): string {
  return `onboarding-source/${kind}/${id}`;
}

function eventIds(event: OnboardingSourceEvent): OnboardingSourceOperationIds {
  if (
    event.type !== 'CONTINUE' &&
    event.type !== 'CONFIRM_SOURCE' &&
    event.type !== 'RETRY' &&
    event.type !== 'SKIP'
  ) {
    throw new Error('Onboarding operation IDs are missing');
  }
  return event.ids;
}

function selectedConnector(context: OnboardingSourceContext) {
  if (context.selectedConnectorId === null) {
    throw new Error('Onboarding selected connector is missing');
  }
  return context.selectedConnectorId;
}

function permissionCommand(
  context: OnboardingSourceContext,
  operationId: string,
  checkId: string
): OnboardingSourceCommand {
  const origins = selectedConnectorOrigins(context);
  return {
    version: ONBOARDING_SOURCE_MODEL_VERSION,
    type: 'CHECK_CONNECTOR_PERMISSION',
    commandId: commandId('permission', operationId),
    workerEpoch: context.workerEpoch,
    dataEpoch: context.dataEpoch,
    operationId,
    checkId,
    connectorId: selectedConnector(context),
    origins,
    originDigest: onboardingPermissionOriginDigest(origins),
    observation: 'contains_only',
  };
}

function sessionCommand(
  context: OnboardingSourceContext,
  operationId: string,
  checkId: string
): OnboardingSourceCommand {
  return {
    version: ONBOARDING_SOURCE_MODEL_VERSION,
    type: 'CHECK_CONNECTOR_SESSION',
    commandId: commandId('session', operationId),
    workerEpoch: context.workerEpoch,
    dataEpoch: context.dataEpoch,
    operationId,
    checkId,
    connectorId: selectedConnector(context),
  };
}

function settingsOperation(
  context: OnboardingSourceContext,
  purpose: OnboardingSettingsPurpose,
  ids: OnboardingSourceOperationIds
): {
  command: OnboardingSourceCommand;
  expectation: ReturnType<typeof settingsTransactionExpectation>;
} {
  const event = settingsMutationEvent(context, purpose, ids);
  const expectation = settingsTransactionExpectation(context, purpose, ids);
  const command: OnboardingSourceCommand =
    purpose === 'selection'
      ? {
          version: ONBOARDING_SOURCE_MODEL_VERSION,
          type: 'DISPATCH_SETTINGS_SELECTION',
          commandId: commandId('selection', ids.operationId),
          event,
          expectation,
        }
      : {
          version: ONBOARDING_SOURCE_MODEL_VERSION,
          type: 'DISPATCH_SETTINGS_SKIP_AUTO_SCAN',
          commandId: commandId('skip-auto-scan', ids.operationId),
          event,
          expectation,
        };
  return { command, expectation };
}

function completionCommand(
  context: OnboardingSourceContext,
  operationId: string,
  completionKind: 'confirmed_source' | 'skipped'
): OnboardingSourceCommand {
  return {
    version: ONBOARDING_SOURCE_MODEL_VERSION,
    type: 'PERSIST_ONBOARDING_COMPLETED',
    commandId: commandId(completionKind === 'skipped' ? 'skip-completion' : 'consent', operationId),
    dataEpoch: context.dataEpoch,
    attemptId: context.attemptId,
    operationId,
    completionKind,
  };
}

function recoveryCommand(
  context: OnboardingSourceContext,
  requestId: string
): Extract<OnboardingSourceCommand, { type: 'READ_CANONICAL_ONBOARDING_SOURCE' }> {
  return {
    version: ONBOARDING_SOURCE_MODEL_VERSION,
    type: 'READ_CANONICAL_ONBOARDING_SOURCE',
    commandId: commandId('recovery', requestId),
    requestId,
    dataEpoch: context.dataEpoch,
    snapshotRequestId: requestId,
    snapshotCommandId: canonicalSettingsRecoveryCommandId(requestId),
  };
}

function advanceCommand(
  context: OnboardingSourceContext,
  id: string,
  completionKind: 'confirmed_source' | 'skipped'
): OnboardingSourceCommand {
  return {
    version: ONBOARDING_SOURCE_MODEL_VERSION,
    type: 'ADVANCE_ONBOARDING',
    commandId: commandId('advance', id),
    dataEpoch: context.dataEpoch,
    attemptId: context.attemptId,
    connectorId: completionKind === 'skipped' ? null : selectedConnector(context),
    completionKind,
  };
}

function activeOperationId(operation: OnboardingSourceActiveOperation): string {
  return operation.purpose === 'selection' || operation.purpose === 'skip_auto_scan'
    ? operation.ids.operationId
    : operation.operationId;
}

function beginRecoveryPatch(
  context: OnboardingSourceContext,
  reason: OnboardingRecoveryReason,
  requestId: string
): Partial<OnboardingSourceContext> {
  const command = recoveryCommand(context, requestId);
  return {
    consumedCorrelationIds: rememberCorrelationIds(context, [requestId]),
    activeOperation: null,
    recovery: {
      reason,
      requestId,
      commandId: command.commandId,
      snapshotRequestId: command.snapshotRequestId,
      snapshotCommandId: command.snapshotCommandId,
      invalidatedOperationId:
        context.activeOperation === null ? null : activeOperationId(context.activeOperation),
    },
    command,
    failure: null,
  };
}

function failure(
  code: OnboardingSourceError['code'],
  phase: OnboardingSourceError['phase'],
  message: string
): OnboardingSourceError {
  return {
    version: ONBOARDING_SOURCE_MODEL_VERSION,
    code,
    phase,
    message,
    retryable: code !== 'CORRELATION_CAPACITY_EXHAUSTED',
  };
}

function requestIdIsFresh(
  context: OnboardingSourceContext,
  value: unknown,
  reservedFollowUpIds: number
): value is string {
  return (
    isOnboardingSourceUuidV4(value) &&
    correlationIdsAreFresh(context, [value]) &&
    correlationIdsHaveCapacity(context, [value], reservedFollowUpIds)
  );
}

function activeSettingsOperation(
  context: OnboardingSourceContext,
  purpose?: OnboardingSettingsPurpose
): SettingsOperation | null {
  const operation = context.activeOperation;
  if (
    operation === null ||
    (operation.purpose !== 'selection' && operation.purpose !== 'skip_auto_scan') ||
    (purpose !== undefined && operation.purpose !== purpose)
  ) {
    return null;
  }
  return operation;
}

function activeOperationMatches(context: OnboardingSourceContext, event: OnboardingSourceEvent) {
  return (
    event.type === 'NETWORK_OFFLINE' &&
    event.dataEpoch === context.dataEpoch &&
    context.activeOperation !== null &&
    event.operationId === activeOperationId(context.activeOperation)
  );
}

/** Pure XState setup. The concrete machine and actor remain private to the façade module. */
export function createOnboardingSourceSetup(
  isAdmittedEvent: (event: OnboardingSourceEvent) => boolean
) {
  return setup({
    types: {
      context: {} as OnboardingSourceContext,
      events: {} as OnboardingSourceEvent,
      input: {} as ParsedOnboardingSourceInput,
    },
    guards: {
      admittedEvent: ({ event }) => isAdmittedEvent(event),
      matchingEpochInvalidation: ({ context, event }) =>
        dataEpochInvalidationMatches(context, event),
      includedSelection: ({ context, event }) =>
        event.type === 'SELECT_SOURCE' && context.includedConnectorIds.includes(event.connectorId),
      freshOperationIds: ({ context, event }) =>
        (event.type === 'CONTINUE' ||
          event.type === 'CONFIRM_SOURCE' ||
          event.type === 'RETRY' ||
          event.type === 'SKIP') &&
        operationIdsAreFresh(
          context,
          event.ids,
          event.type === 'RETRY' && context.recovery !== null ? 2 : 0
        ),
      selectedIncluded: ({ context }) => selectedConnectorIsIncluded(context),
      selectionPersisted: ({ context }) => selectedConnectorIsPersisted(context),
      selectionNotPersisted: ({ context }) => !selectedConnectorIsPersisted(context),
      autoScanEnabled: ({ context }) => context.canonicalSettings.autoScan,
      autoScanDisabled: ({ context }) => !context.canonicalSettings.autoScan,
      matchingSelectionSettlement: ({ context, event }) =>
        settingsSettlementMatches(context, event, 'selection'),
      matchingSkipSettingsSettlement: ({ context, event }) =>
        settingsSettlementMatches(context, event, 'skip_auto_scan'),
      matchingConsentPersistence: ({ context, event }) => consentPersistenceMatches(context, event),
      matchingSkipCompletionPersistence: ({ context, event }) =>
        skipCompletionPersistenceMatches(context, event),
      matchingSelectionFailure: ({ context, event }) =>
        settingsFailureMatches(context, event, 'selection'),
      matchingSkipSettingsFailure: ({ context, event }) =>
        settingsFailureMatches(context, event, 'skip_auto_scan'),
      matchingConsentFailure: ({ context, event }) => consentFailureMatches(context, event),
      matchingSkipCompletionFailure: ({ context, event }) =>
        skipCompletionFailureMatches(context, event),
      matchingCheck: ({ context, event }) => checkEventMatches(context, event),
      matchingPermissionContains: ({ context, event }) =>
        permissionContainsEventMatches(context, event),
      matchingActiveOperation: ({ context, event }) => activeOperationMatches(context, event),
      sessionAllowed: ({ context }) => sessionCheckAllowed(context),
      consentAlreadyPersisted: ({ context }) => context.onboardingCompleted,
      consentNotPersisted: ({ context }) => !context.onboardingCompleted,
      freshCancel: ({ context, event }) =>
        event.type === 'CANCEL' &&
        event.dataEpoch === context.dataEpoch &&
        requestIdIsFresh(context, event.requestId, cancellationCorrelationReserve(context)),
      activeSettingsMutation: ({ context }) => activeSettingsOperation(context) !== null,
      activeCompletionOperation: ({ context }) =>
        context.activeOperation?.purpose === 'consent' ||
        context.activeOperation?.purpose === 'skip_completion',
      matchingCancel: ({ context, event }) => cancellationMatches(context, event),
      matchingCompletionCancel: ({ context, event }) =>
        context.activeOperation?.purpose === 'cancel_consent' &&
        (event.type === 'CONSENT_CANCEL_CONFIRMED' ||
          event.type === 'CONSENT_CANCEL_OUTCOME_UNKNOWN') &&
        event.dataEpoch === context.dataEpoch &&
        event.operationId === context.activeOperation.operationId &&
        event.requestId === context.activeOperation.requestId &&
        (event.type !== 'CONSENT_CANCEL_OUTCOME_UNKNOWN' ||
          (correlationIdsAreFresh(context, [event.nextRequestId]) &&
            correlationIdsHaveCapacity(context, [event.nextRequestId], 2))),
      matchingRehydration: ({ context, event }) => rehydrationMatches(context, event),
      recoverySelecting: ({ context }) => context.recovery?.reason === 'selecting',
      recoveryCancelSettings: ({ context }) => context.recovery?.reason === 'cancel_settings',
      recoveryCancelCompletion: ({ context }) => context.recovery?.reason === 'cancel_consent',
      recoveryConsent: ({ context }) => context.recovery?.reason === 'consent',
      recoverySkipSettings: ({ context }) => context.recovery?.reason === 'skip_settings',
      recoverySkipCompletion: ({ context }) => context.recovery?.reason === 'skip_completion',
      recoverySelectionOrCheck: ({ context }) =>
        context.recovery?.reason === 'selection' || context.recovery?.reason === 'checking',
      rehydratedSelectionPersisted: ({ context, event }) =>
        rehydratedSelectionIsPersisted(context, event),
      rehydratedCompletionPersisted: ({ event }) =>
        event.type === 'CANONICAL_STATE_REHYDRATED' &&
        event.completionReadProof.onboardingCompleted,
      rehydratedCompletionAbsent: ({ event }) =>
        event.type === 'CANONICAL_STATE_REHYDRATED' &&
        !event.completionReadProof.onboardingCompleted,
      rehydratedAutoScanDisabled: ({ event }) =>
        event.type === 'CANONICAL_STATE_REHYDRATED' && !event.snapshot.envelope.settings.autoScan,
      rehydratedAutoScanEnabled: ({ event }) =>
        event.type === 'CANONICAL_STATE_REHYDRATED' && event.snapshot.envelope.settings.autoScan,
      completionClearMatches: ({ context, event }) =>
        event.type === 'ONBOARDING_COMPLETION_CLEARED' &&
        event.dataEpoch === context.dataEpoch &&
        context.recovery?.reason === 'cancel_consent' &&
        event.requestId === context.recovery.requestId,
      freshRestart: ({ context, event }) =>
        event.type === 'SERVICE_WORKER_RESTARTED' &&
        event.dataEpoch === context.dataEpoch &&
        requestIdIsFresh(context, event.requestId, 2),
      matchingRecoveryOffline: ({ context, event }) =>
        event.type === 'NETWORK_OFFLINE' &&
        event.dataEpoch === context.dataEpoch &&
        context.recovery !== null &&
        event.operationId === context.recovery.requestId,
      retryPersistence: ({ context }) =>
        context.failure?.retryable === true && context.failure.phase === 'persistence',
      retryCheck: ({ context }) =>
        context.failure?.retryable === true &&
        context.recovery === null &&
        (context.failure.phase === 'permission' ||
          context.failure.phase === 'session' ||
          context.failure.phase === 'offline'),
      retryConsent: ({ context }) =>
        context.failure?.retryable === true && context.failure.phase === 'consent',
      retrySkip: ({ context }) =>
        context.failure?.retryable === true && context.failure.phase === 'skip',
      retryRecovery: ({ context }) =>
        context.failure?.retryable === true &&
        context.recovery !== null &&
        (context.failure.phase === 'recovery' || context.failure.phase === 'offline'),
      skipAlreadyComplete: ({ context }) =>
        context.onboardingCompleted && !context.canonicalSettings.autoScan,
      skipNeedsSettings: ({ context }) => context.canonicalSettings.autoScan,
      skipNeedsCompletion: ({ context }) =>
        !context.canonicalSettings.autoScan && !context.onboardingCompleted,
    },
    actions: {
      selectSource: assign(({ event }) =>
        event.type === 'SELECT_SOURCE'
          ? {
              selectedConnectorId: event.connectorId,
              permission: 'unknown' as const,
              session: 'unknown' as const,
              lastSync: null,
              activeOperation: null,
              recovery: null,
              failure: null,
              command: null,
            }
          : {}
      ),
      beginSelectionPersistence: assign(({ context, event }) => {
        const ids = eventIds(event);
        const operation = settingsOperation(context, 'selection', ids);
        return {
          consumedCorrelationIds: rememberCorrelationIds(
            context,
            onboardingOperationCorrelationIds(ids)
          ),
          activeOperation: {
            purpose: 'selection' as const,
            ids: { ...ids },
            expectation: operation.expectation,
          },
          permission: 'unknown' as const,
          session: 'unknown' as const,
          lastSync: null,
          recovery: null,
          failure: null,
          command: operation.command,
        };
      }),
      beginSkipSettings: assign(({ context, event }) => {
        const ids = eventIds(event);
        const operation = settingsOperation(context, 'skip_auto_scan', ids);
        return {
          consumedCorrelationIds: rememberCorrelationIds(
            context,
            onboardingOperationCorrelationIds(ids)
          ),
          activeOperation: {
            purpose: 'skip_auto_scan' as const,
            ids: { ...ids },
            expectation: operation.expectation,
          },
          recovery: null,
          failure: null,
          advanceIssued: false,
          command: operation.command,
        };
      }),
      beginSkipCompletion: assign(({ context, event }) => {
        const ids = eventIds(event);
        return {
          consumedCorrelationIds: rememberCorrelationIds(
            context,
            onboardingOperationCorrelationIds(ids)
          ),
          activeOperation: { purpose: 'skip_completion' as const, operationId: ids.operationId },
          recovery: null,
          failure: null,
          advanceIssued: false,
          command: completionCommand(context, ids.operationId, 'skipped'),
        };
      }),
      adoptSkipSettingsAndPersistCompletion: assign(({ context, event }) =>
        event.type === 'SETTINGS_TRANSACTION_SETTLED'
          ? {
              ...adoptSettingsSnapshot(event.snapshot),
              activeOperation: {
                purpose: 'skip_completion' as const,
                operationId: event.operationId,
              },
              recovery: null,
              failure: null,
              command: completionCommand(context, event.operationId, 'skipped'),
            }
          : {}
      ),
      beginCheckFromIds: assign(({ context, event }) => {
        const ids = eventIds(event);
        return {
          consumedCorrelationIds: rememberCorrelationIds(
            context,
            onboardingOperationCorrelationIds(ids)
          ),
          activeOperation: {
            purpose: 'check' as const,
            operationId: ids.operationId,
            checkId: ids.permissionCheckId,
          },
          permission: 'unknown' as const,
          session: 'unknown' as const,
          lastSync: null,
          recovery: null,
          failure: null,
          command: permissionCommand(context, ids.operationId, ids.permissionCheckId),
        };
      }),
      adoptSelectionAndBeginCheck: assign(({ context, event }) => {
        const checkId =
          context.activeOperation?.purpose === 'selection'
            ? context.activeOperation.ids.permissionCheckId
            : null;
        return event.type === 'SETTINGS_TRANSACTION_SETTLED' && checkId !== null
          ? {
              ...adoptSettingsSnapshot(event.snapshot),
              activeOperation: {
                purpose: 'check' as const,
                operationId: event.operationId,
                checkId,
              },
              permission: 'unknown' as const,
              session: 'unknown' as const,
              lastSync: null,
              recovery: null,
              failure: null,
              command: permissionCommand(context, event.operationId, checkId),
            }
          : {};
      }),
      markPermissionAndCheckSession: assign(({ context, event }) =>
        event.type === 'PERMISSION_CONTAINS_PRESENT'
          ? {
              permission: 'granted' as const,
              session: 'unknown' as const,
              command: sessionCommand(context, event.proof.operationId, event.proof.checkId),
            }
          : {}
      ),
      markPermissionDenied: assign(() => ({
        permission: 'denied' as const,
        session: 'unknown' as const,
        activeOperation: null,
        command: null,
        failure: null,
      })),
      markSessionFound: assign(({ event }) =>
        event.type === 'SESSION_FOUND'
          ? {
              session: 'present' as const,
              lastSync: event.lastSync,
              activeOperation: null,
              command: null,
              failure: null,
            }
          : {}
      ),
      markSessionMissing: assign(() => ({
        session: 'missing' as const,
        lastSync: null,
        activeOperation: null,
        command: null,
        failure: null,
      })),
      failSettingsTransaction: assign(({ event }) =>
        event.type === 'SETTINGS_TRANSACTION_FAILED'
          ? {
              activeOperation: null,
              recovery: null,
              command: null,
              failure: cloneOnboardingSourceError(event.error),
            }
          : {}
      ),
      failConsentPersistence: assign(({ event }) =>
        event.type === 'ONBOARDING_COMPLETION_FAILED'
          ? {
              activeOperation: null,
              recovery: null,
              command: null,
              failure: cloneOnboardingSourceError(event.error),
            }
          : {}
      ),
      failSkip: assign(({ event }) =>
        event.type === 'SETTINGS_TRANSACTION_FAILED' ||
        event.type === 'ONBOARDING_COMPLETION_FAILED'
          ? {
              activeOperation: null,
              recovery: null,
              command: null,
              failure: cloneOnboardingSourceError(event.error),
            }
          : {}
      ),
      failCheck: assign(({ event }) =>
        event.type === 'CHECK_FAILED'
          ? {
              activeOperation: null,
              recovery: null,
              command: null,
              failure: cloneOnboardingSourceError(event.error),
            }
          : {}
      ),
      failSelectionOffline: assign(() => ({
        activeOperation: null,
        recovery: null,
        command: null,
        failure: failure(
          'SETTINGS_PERSISTENCE_FAILED',
          'persistence',
          'La source ne peut pas être persistée hors ligne.'
        ),
      })),
      failConsentOffline: assign(() => ({
        activeOperation: null,
        recovery: null,
        command: null,
        failure: failure(
          'CONSENT_PERSISTENCE_FAILED',
          'consent',
          'La finalisation ne peut pas être persistée hors ligne.'
        ),
      })),
      failSkipOffline: assign(() => ({
        activeOperation: null,
        recovery: null,
        command: null,
        failure: failure(
          'SKIP_FAILED',
          'skip',
          "L'ignorance ne peut pas être persistée hors ligne."
        ),
      })),
      failRecoveryOffline: assign(() => ({
        command: null,
        failure: failure(
          'NETWORK_OFFLINE',
          'offline',
          'La relecture canonique est impossible hors ligne.'
        ),
      })),
      beginConsentPersistence: assign(({ context, event }) => {
        const ids = eventIds(event);
        return {
          consumedCorrelationIds: rememberCorrelationIds(
            context,
            onboardingOperationCorrelationIds(ids)
          ),
          activeOperation: { purpose: 'consent' as const, operationId: ids.operationId },
          recovery: null,
          failure: null,
          command: completionCommand(context, ids.operationId, 'confirmed_source'),
        };
      }),
      completeWithExistingConsent: assign(({ context, event }) => {
        const ids = eventIds(event);
        return {
          consumedCorrelationIds: rememberCorrelationIds(
            context,
            onboardingOperationCorrelationIds(ids)
          ),
          activeOperation: null,
          recovery: null,
          failure: null,
          advanceIssued: true,
          command: advanceCommand(context, ids.operationId, 'confirmed_source'),
        };
      }),
      adoptConsentAndComplete: assign(({ context, event }) =>
        event.type === 'ONBOARDING_COMPLETION_PERSISTED'
          ? {
              onboardingCompleted: true,
              activeOperation: null,
              recovery: null,
              failure: null,
              advanceIssued: true,
              command: advanceCommand(context, event.operationId, 'confirmed_source'),
            }
          : {}
      ),
      adoptSkipCompletionAndAdvance: assign(({ context, event }) =>
        event.type === 'ONBOARDING_COMPLETION_PERSISTED'
          ? {
              onboardingCompleted: true,
              activeOperation: null,
              recovery: null,
              failure: null,
              advanceIssued: true,
              command: advanceCommand(context, event.operationId, 'skipped'),
            }
          : {}
      ),
      completeSkipFromRetry: assign(({ context, event }) => {
        const ids = eventIds(event);
        return {
          consumedCorrelationIds: rememberCorrelationIds(
            context,
            onboardingOperationCorrelationIds(ids)
          ),
          activeOperation: null,
          recovery: null,
          failure: null,
          advanceIssued: true,
          command: advanceCommand(context, ids.operationId, 'skipped'),
        };
      }),
      beginSettingsCancel: assign(({ context, event }) => {
        const operation = activeSettingsOperation(context);
        if (event.type !== 'CANCEL' || operation === null) {
          return {};
        }
        return {
          consumedCorrelationIds: rememberCorrelationIds(context, [event.requestId]),
          activeOperation: {
            purpose: 'cancel_settings' as const,
            operationId: operation.ids.operationId,
            mutationId: operation.ids.mutationId,
            requestId: event.requestId,
          },
          command: {
            version: ONBOARDING_SOURCE_MODEL_VERSION,
            type: 'DISPATCH_SETTINGS_CANCEL' as const,
            commandId: commandId('cancel', event.requestId),
            event: {
              type: 'CANCEL' as const,
              dataEpoch: context.dataEpoch,
              mutationId: operation.ids.mutationId,
              requestId: event.requestId,
            },
          },
          failure: null,
        };
      }),
      beginCompletionCancel: assign(({ context, event }) => {
        if (
          event.type !== 'CANCEL' ||
          (context.activeOperation?.purpose !== 'consent' &&
            context.activeOperation?.purpose !== 'skip_completion')
        ) {
          return {};
        }
        const operationId = context.activeOperation.operationId;
        return {
          consumedCorrelationIds: rememberCorrelationIds(context, [event.requestId]),
          activeOperation: {
            purpose: 'cancel_consent' as const,
            operationId,
            requestId: event.requestId,
          },
          command: {
            version: ONBOARDING_SOURCE_MODEL_VERSION,
            type: 'CANCEL_ONBOARDING_COMPLETION_WRITE' as const,
            commandId: commandId('cancel-completion', event.requestId),
            dataEpoch: context.dataEpoch,
            attemptId: context.attemptId,
            operationId,
            requestId: event.requestId,
          },
          failure: null,
        };
      }),
      finishCancellation: assign(({ event }) => ({
        ...(event.type === 'SETTINGS_CANCEL_CONFIRMED'
          ? adoptSettingsSnapshot(event.snapshot)
          : {}),
        activeOperation: null,
        recovery: null,
        command: null,
        advanceIssued: false,
      })),
      finishImmediateCancellation: assign(({ context, event }) =>
        event.type === 'CANCEL'
          ? {
              consumedCorrelationIds: rememberCorrelationIds(context, [event.requestId]),
              activeOperation: null,
              recovery: null,
              command: null,
              advanceIssued: false,
            }
          : {}
      ),
      finishRecoveredCancellation: assign(() => ({
        activeOperation: null,
        recovery: null,
        command: null,
        advanceIssued: false,
      })),
      finishEpochInvalidation: assign(() => ({
        activeOperation: null,
        recovery: null,
        failure: null,
        command: null,
        advanceIssued: false,
      })),
      recoverSelecting: assign(({ context, event }) =>
        event.type === 'SERVICE_WORKER_RESTARTED'
          ? beginRecoveryPatch(context, 'selecting', event.requestId)
          : {}
      ),
      recoverSelection: assign(({ context, event }) =>
        event.type === 'SERVICE_WORKER_RESTARTED'
          ? beginRecoveryPatch(context, 'selection', event.requestId)
          : {}
      ),
      recoverChecking: assign(({ context, event }) =>
        event.type === 'SERVICE_WORKER_RESTARTED'
          ? beginRecoveryPatch(context, 'checking', event.requestId)
          : {}
      ),
      recoverConsent: assign(({ context, event }) =>
        event.type === 'SERVICE_WORKER_RESTARTED'
          ? beginRecoveryPatch(context, 'consent', event.requestId)
          : {}
      ),
      recoverSkipSettings: assign(({ context, event }) =>
        event.type === 'SERVICE_WORKER_RESTARTED'
          ? beginRecoveryPatch(context, 'skip_settings', event.requestId)
          : {}
      ),
      recoverSkipCompletion: assign(({ context, event }) =>
        event.type === 'SERVICE_WORKER_RESTARTED'
          ? beginRecoveryPatch(context, 'skip_completion', event.requestId)
          : {}
      ),
      recoverCancel: assign(({ context, event }) => {
        if (event.type === 'SETTINGS_CANCEL_OUTCOME_UNKNOWN') {
          return beginRecoveryPatch(context, 'cancel_settings', event.nextRequestId);
        }
        if (event.type === 'CONSENT_CANCEL_OUTCOME_UNKNOWN') {
          return beginRecoveryPatch(context, 'cancel_consent', event.nextRequestId);
        }
        if (event.type !== 'SERVICE_WORKER_RESTARTED') {
          return {};
        }
        return beginRecoveryPatch(
          context,
          context.activeOperation?.purpose === 'cancel_consent'
            ? 'cancel_consent'
            : 'cancel_settings',
          event.requestId
        );
      }),
      adoptRehydratedSettings: assign(({ context, event }) =>
        event.type === 'CANONICAL_STATE_REHYDRATED'
          ? {
              ...adoptSettingsSnapshot(event.snapshot),
              consumedCorrelationIds: rememberCorrelationIds(context, [
                event.nextOperationId,
                event.nextCheckId,
              ]),
              onboardingCompleted: event.completionReadProof.onboardingCompleted,
              activeOperation: null,
              recovery: null,
              command: null,
              failure: null,
            }
          : {}
      ),
      adoptRehydratedAndCheck: assign(({ context, event }) =>
        event.type === 'CANONICAL_STATE_REHYDRATED'
          ? {
              ...adoptSettingsSnapshot(event.snapshot),
              consumedCorrelationIds: rememberCorrelationIds(context, [
                event.nextOperationId,
                event.nextCheckId,
              ]),
              onboardingCompleted: event.completionReadProof.onboardingCompleted,
              activeOperation: {
                purpose: 'check' as const,
                operationId: event.nextOperationId,
                checkId: event.nextCheckId,
              },
              recovery: null,
              permission: 'unknown' as const,
              session: 'unknown' as const,
              lastSync: null,
              command: permissionCommand(context, event.nextOperationId, event.nextCheckId),
              failure: null,
            }
          : {}
      ),
      adoptRehydratedAndAdvance: assign(({ context, event }) =>
        event.type === 'CANONICAL_STATE_REHYDRATED'
          ? {
              ...adoptSettingsSnapshot(event.snapshot),
              consumedCorrelationIds: rememberCorrelationIds(context, [
                event.nextOperationId,
                event.nextCheckId,
              ]),
              onboardingCompleted: true,
              activeOperation: null,
              recovery: null,
              failure: null,
              advanceIssued: true,
              command: advanceCommand(
                context,
                context.recovery?.invalidatedOperationId ?? event.nextOperationId,
                'confirmed_source'
              ),
            }
          : {}
      ),
      adoptRehydratedAndSkipAdvance: assign(({ context, event }) =>
        event.type === 'CANONICAL_STATE_REHYDRATED'
          ? {
              ...adoptSettingsSnapshot(event.snapshot),
              consumedCorrelationIds: rememberCorrelationIds(context, [
                event.nextOperationId,
                event.nextCheckId,
              ]),
              onboardingCompleted: true,
              activeOperation: null,
              recovery: null,
              failure: null,
              advanceIssued: true,
              command: advanceCommand(
                context,
                context.recovery?.invalidatedOperationId ?? event.nextOperationId,
                'skipped'
              ),
            }
          : {}
      ),
      adoptRehydratedAndPersistSkipCompletion: assign(({ context, event }) =>
        event.type === 'CANONICAL_STATE_REHYDRATED'
          ? {
              ...adoptSettingsSnapshot(event.snapshot),
              consumedCorrelationIds: rememberCorrelationIds(context, [
                event.nextOperationId,
                event.nextCheckId,
              ]),
              onboardingCompleted: false,
              activeOperation: {
                purpose: 'skip_completion' as const,
                operationId: event.nextOperationId,
              },
              recovery: null,
              failure: null,
              command: completionCommand(context, event.nextOperationId, 'skipped'),
            }
          : {}
      ),
      failRecoveredSelection: assign(({ context, event }) =>
        event.type === 'CANONICAL_STATE_REHYDRATED'
          ? {
              ...adoptSettingsSnapshot(event.snapshot),
              consumedCorrelationIds: rememberCorrelationIds(context, [
                event.nextOperationId,
                event.nextCheckId,
              ]),
              onboardingCompleted: event.completionReadProof.onboardingCompleted,
              activeOperation: null,
              recovery: null,
              command: null,
              failure: failure(
                'SETTINGS_PERSISTENCE_FAILED',
                'persistence',
                "La source sélectionnée n'est pas persistée après redémarrage."
              ),
            }
          : {}
      ),
      failRecoveredConsent: assign(({ context, event }) =>
        event.type === 'CANONICAL_STATE_REHYDRATED'
          ? {
              ...adoptSettingsSnapshot(event.snapshot),
              consumedCorrelationIds: rememberCorrelationIds(context, [
                event.nextOperationId,
                event.nextCheckId,
              ]),
              onboardingCompleted: false,
              activeOperation: null,
              recovery: null,
              command: null,
              failure: failure(
                'CONSENT_PERSISTENCE_FAILED',
                'consent',
                "La finalisation n'est pas persistée après redémarrage."
              ),
            }
          : {}
      ),
      failRecoveredSkip: assign(({ context, event }) =>
        event.type === 'CANONICAL_STATE_REHYDRATED'
          ? {
              ...adoptSettingsSnapshot(event.snapshot),
              consumedCorrelationIds: rememberCorrelationIds(context, [
                event.nextOperationId,
                event.nextCheckId,
              ]),
              onboardingCompleted: event.completionReadProof.onboardingCompleted,
              activeOperation: null,
              recovery: null,
              command: null,
              failure: failure(
                'SKIP_FAILED',
                'skip',
                "L'état sûr de l'ignorance n'est pas confirmé après redémarrage."
              ),
            }
          : {}
      ),
      requestCompletionClear: assign(({ context, event }) =>
        event.type === 'CANONICAL_STATE_REHYDRATED' && context.recovery !== null
          ? {
              ...adoptSettingsSnapshot(event.snapshot),
              consumedCorrelationIds: rememberCorrelationIds(context, [
                event.nextOperationId,
                event.nextCheckId,
              ]),
              onboardingCompleted: true,
              command: {
                version: ONBOARDING_SOURCE_MODEL_VERSION,
                type: 'CLEAR_ONBOARDING_COMPLETED' as const,
                commandId: commandId('clear-completion', context.recovery.requestId),
                dataEpoch: context.dataEpoch,
                attemptId: context.attemptId,
                requestId: context.recovery.requestId,
              },
            }
          : {}
      ),
      finishClearedCompletionCancellation: assign(() => ({
        onboardingCompleted: false,
        activeOperation: null,
        recovery: null,
        command: null,
        advanceIssued: false,
      })),
      retryRecoveryRead: assign(({ context, event }) => {
        const ids = eventIds(event);
        const reason = context.recovery?.reason ?? 'selecting';
        const command = recoveryCommand(context, ids.operationId);
        return {
          consumedCorrelationIds: rememberCorrelationIds(
            context,
            onboardingOperationCorrelationIds(ids)
          ),
          recovery: {
            reason,
            requestId: ids.operationId,
            commandId: command.commandId,
            snapshotRequestId: command.snapshotRequestId,
            snapshotCommandId: command.snapshotCommandId,
            invalidatedOperationId: context.recovery?.invalidatedOperationId ?? null,
          },
          command,
          failure: null,
        };
      }),
    },
  });
}
