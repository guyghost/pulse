import { and, createActor, type Subscription } from 'xstate';

import {
  ONBOARDING_SOURCE_MODEL_VERSION,
  ONBOARDING_SOURCE_MAX_CONSUMED_CORRELATIONS,
  cloneOnboardingSourceCommand,
  cloneOnboardingSourceError,
  deepFreeze,
  initialOnboardingSourceContext,
  normalizeOnboardingSourceEvent,
  parseOnboardingSourceInput,
  type OnboardingSourceContext,
  type OnboardingSourceInput,
  type OnboardingSourcePublicSnapshot,
  type OnboardingSourceState,
  type ParsedOnboardingSourceInput,
} from './onboarding-source.contract';
import { createOnboardingSourceSetup } from './onboarding-source.logic';

export * from './onboarding-source.contract';

const ACTIVE_ONBOARDING_SOURCE_EVENTS = new WeakSet<object>();
const onboardingSourceSetup = createOnboardingSourceSetup((event) =>
  ACTIVE_ONBOARDING_SOURCE_EVENTS.has(event)
);

const selectSource = {
  guard: and(['admittedEvent', 'includedSelection']),
  target: '#onboardingSourceSelecting',
  actions: 'selectSource',
} as const;

const cancelImmediately = {
  guard: and(['admittedEvent', 'freshCancel']),
  target: '#onboardingSourceCancelled',
  actions: 'finishImmediateCancellation',
} as const;

const restartChecking = {
  guard: and(['admittedEvent', 'freshRestart']),
  target: '#onboardingSourceRecovering',
  actions: 'recoverChecking',
} as const;

const onboardingSourceMachine = onboardingSourceSetup.createMachine({
  id: 'onboardingSource',
  initial: 'selecting',
  context: ({ input }) => initialOnboardingSourceContext(input),
  on: {
    DATA_EPOCH_INVALIDATED: {
      guard: and(['admittedEvent', 'matchingEpochInvalidation']),
      target: '#onboardingSourceCancelled',
      actions: 'finishEpochInvalidation',
    },
  },
  states: {
    selecting: {
      id: 'onboardingSourceSelecting',
      on: {
        SELECT_SOURCE: selectSource,
        CONTINUE: [
          {
            guard: and([
              'admittedEvent',
              'freshOperationIds',
              'selectedIncluded',
              'selectionPersisted',
            ]),
            target: 'checking.permission',
            actions: 'beginCheckFromIds',
          },
          {
            guard: and([
              'admittedEvent',
              'freshOperationIds',
              'selectedIncluded',
              'selectionNotPersisted',
            ]),
            target: 'persisting',
            actions: 'beginSelectionPersistence',
          },
        ],
        SKIP: [
          {
            guard: and(['admittedEvent', 'freshOperationIds', 'autoScanDisabled']),
            target: 'skipping_completion',
            actions: 'beginSkipCompletion',
          },
          {
            guard: and(['admittedEvent', 'freshOperationIds', 'autoScanEnabled']),
            target: 'skipping_settings',
            actions: 'beginSkipSettings',
          },
        ],
        SERVICE_WORKER_RESTARTED: {
          guard: and(['admittedEvent', 'freshRestart']),
          target: 'recovering',
          actions: 'recoverSelecting',
        },
        CANCEL: cancelImmediately,
      },
    },
    persisting: {
      on: {
        SETTINGS_TRANSACTION_SETTLED: {
          guard: and(['admittedEvent', 'matchingSelectionSettlement']),
          target: 'checking.permission',
          actions: 'adoptSelectionAndBeginCheck',
        },
        SETTINGS_TRANSACTION_FAILED: {
          guard: and(['admittedEvent', 'matchingSelectionFailure']),
          target: 'failed',
          actions: 'failSettingsTransaction',
        },
        NETWORK_OFFLINE: {
          guard: and(['admittedEvent', 'matchingActiveOperation']),
          target: 'failed',
          actions: 'failSelectionOffline',
        },
        CANCEL: {
          guard: and(['admittedEvent', 'freshCancel', 'activeSettingsMutation']),
          target: 'cancelling',
          actions: 'beginSettingsCancel',
        },
        SERVICE_WORKER_RESTARTED: {
          guard: and(['admittedEvent', 'freshRestart']),
          target: 'recovering',
          actions: 'recoverSelection',
        },
      },
    },
    skipping_settings: {
      on: {
        SETTINGS_TRANSACTION_SETTLED: {
          guard: and(['admittedEvent', 'matchingSkipSettingsSettlement']),
          target: 'skipping_completion',
          actions: 'adoptSkipSettingsAndPersistCompletion',
        },
        SETTINGS_TRANSACTION_FAILED: {
          guard: and(['admittedEvent', 'matchingSkipSettingsFailure']),
          target: 'failed',
          actions: 'failSkip',
        },
        NETWORK_OFFLINE: {
          guard: and(['admittedEvent', 'matchingActiveOperation']),
          target: 'failed',
          actions: 'failSkipOffline',
        },
        CANCEL: {
          guard: and(['admittedEvent', 'freshCancel', 'activeSettingsMutation']),
          target: 'cancelling',
          actions: 'beginSettingsCancel',
        },
        SERVICE_WORKER_RESTARTED: {
          guard: and(['admittedEvent', 'freshRestart']),
          target: 'recovering',
          actions: 'recoverSkipSettings',
        },
      },
    },
    skipping_completion: {
      on: {
        ONBOARDING_COMPLETION_PERSISTED: {
          guard: and(['admittedEvent', 'matchingSkipCompletionPersistence']),
          target: 'skipped',
          actions: 'adoptSkipCompletionAndAdvance',
        },
        ONBOARDING_COMPLETION_FAILED: {
          guard: and(['admittedEvent', 'matchingSkipCompletionFailure']),
          target: 'failed',
          actions: 'failSkip',
        },
        NETWORK_OFFLINE: {
          guard: and(['admittedEvent', 'matchingActiveOperation']),
          target: 'failed',
          actions: 'failSkipOffline',
        },
        CANCEL: {
          guard: and(['admittedEvent', 'freshCancel', 'activeCompletionOperation']),
          target: 'cancelling',
          actions: 'beginCompletionCancel',
        },
        SERVICE_WORKER_RESTARTED: {
          guard: and(['admittedEvent', 'freshRestart']),
          target: 'recovering',
          actions: 'recoverSkipCompletion',
        },
      },
    },
    checking: {
      initial: 'permission',
      on: {
        SELECT_SOURCE: selectSource,
        CANCEL: cancelImmediately,
        SERVICE_WORKER_RESTARTED: restartChecking,
        CHECK_FAILED: {
          guard: and(['admittedEvent', 'matchingCheck']),
          target: '#onboardingSourceFailed',
          actions: 'failCheck',
        },
        NETWORK_OFFLINE: {
          guard: and(['admittedEvent', 'matchingCheck']),
          target: '#onboardingSourceFailed',
          actions: 'failCheckOffline',
        },
      },
      states: {
        permission: {
          on: {
            PERMISSION_GRANTED: {
              guard: and(['admittedEvent', 'matchingCheck']),
              target: 'session',
              actions: 'markPermissionAndCheckSession',
            },
            PERMISSION_REFUSED: {
              guard: and(['admittedEvent', 'matchingCheck']),
              target: '#onboardingSourcePermissionDenied',
              actions: 'markPermissionDenied',
            },
          },
        },
        session: {
          on: {
            SESSION_FOUND: {
              guard: and(['admittedEvent', 'matchingCheck', 'sessionAllowed']),
              target: '#onboardingSourceReady',
              actions: 'markSessionFound',
            },
            SESSION_MISSING: {
              guard: and(['admittedEvent', 'matchingCheck', 'sessionAllowed']),
              target: '#onboardingSourceSessionMissing',
              actions: 'markSessionMissing',
            },
          },
        },
      },
    },
    permission_denied: {
      id: 'onboardingSourcePermissionDenied',
      on: {
        RETRY: {
          guard: and(['admittedEvent', 'freshOperationIds', 'selectedIncluded']),
          target: 'checking.permission',
          actions: 'beginCheckFromIds',
        },
        SELECT_SOURCE: selectSource,
        CANCEL: cancelImmediately,
        SERVICE_WORKER_RESTARTED: restartChecking,
      },
    },
    session_missing: {
      id: 'onboardingSourceSessionMissing',
      on: {
        RETRY: {
          guard: and(['admittedEvent', 'freshOperationIds', 'selectedIncluded']),
          target: 'checking.permission',
          actions: 'beginCheckFromIds',
        },
        SELECT_SOURCE: selectSource,
        CANCEL: cancelImmediately,
        SERVICE_WORKER_RESTARTED: restartChecking,
      },
    },
    ready: {
      id: 'onboardingSourceReady',
      on: {
        CONFIRM_SOURCE: [
          {
            guard: and([
              'admittedEvent',
              'freshOperationIds',
              'selectedIncluded',
              'selectionPersisted',
              'consentAlreadyPersisted',
            ]),
            target: 'completed',
            actions: 'completeWithExistingConsent',
          },
          {
            guard: and([
              'admittedEvent',
              'freshOperationIds',
              'selectedIncluded',
              'selectionPersisted',
              'consentNotPersisted',
            ]),
            target: 'consenting',
            actions: 'beginConsentPersistence',
          },
        ],
        SELECT_SOURCE: selectSource,
        CANCEL: cancelImmediately,
        SERVICE_WORKER_RESTARTED: restartChecking,
      },
    },
    consenting: {
      on: {
        ONBOARDING_COMPLETION_PERSISTED: {
          guard: and(['admittedEvent', 'matchingConsentPersistence']),
          target: 'completed',
          actions: 'adoptConsentAndComplete',
        },
        ONBOARDING_COMPLETION_FAILED: {
          guard: and(['admittedEvent', 'matchingConsentFailure']),
          target: 'failed',
          actions: 'failConsentPersistence',
        },
        NETWORK_OFFLINE: {
          guard: and(['admittedEvent', 'matchingActiveOperation']),
          target: 'failed',
          actions: 'failConsentOffline',
        },
        CANCEL: {
          guard: and(['admittedEvent', 'freshCancel', 'activeCompletionOperation']),
          target: 'cancelling',
          actions: 'beginCompletionCancel',
        },
        SERVICE_WORKER_RESTARTED: {
          guard: and(['admittedEvent', 'freshRestart']),
          target: 'recovering',
          actions: 'recoverConsent',
        },
      },
    },
    cancelling: {
      on: {
        SETTINGS_CANCEL_CONFIRMED: {
          guard: and(['admittedEvent', 'matchingCancel']),
          target: 'cancelled',
          actions: 'finishCancellation',
        },
        CONSENT_CANCEL_CONFIRMED: {
          guard: and(['admittedEvent', 'matchingCompletionCancel']),
          target: 'cancelled',
          actions: 'finishCancellation',
        },
        SETTINGS_CANCEL_OUTCOME_UNKNOWN: {
          guard: and(['admittedEvent', 'matchingCancel']),
          target: 'recovering',
          actions: 'recoverCancel',
        },
        CONSENT_CANCEL_OUTCOME_UNKNOWN: {
          guard: and(['admittedEvent', 'matchingCompletionCancel']),
          target: 'recovering',
          actions: 'recoverCancel',
        },
        SERVICE_WORKER_RESTARTED: {
          guard: and(['admittedEvent', 'freshRestart']),
          target: 'recovering',
          actions: 'recoverCancel',
        },
      },
    },
    recovering: {
      id: 'onboardingSourceRecovering',
      on: {
        CANONICAL_STATE_REHYDRATED: [
          {
            guard: and([
              'admittedEvent',
              'matchingRehydration',
              'recoveryCancelCompletion',
              'rehydratedCompletionPersisted',
            ]),
            actions: 'requestCompletionClear',
          },
          {
            guard: and([
              'admittedEvent',
              'matchingRehydration',
              'recoveryCancelCompletion',
              'rehydratedCompletionAbsent',
            ]),
            target: 'cancelled',
            actions: ['adoptRehydratedSettings', 'finishRecoveredCancellation'],
          },
          {
            guard: and(['admittedEvent', 'matchingRehydration', 'recoveryCancelSettings']),
            target: 'cancelled',
            actions: ['adoptRehydratedSettings', 'finishRecoveredCancellation'],
          },
          {
            guard: and(['admittedEvent', 'matchingRehydration', 'recoverySelecting']),
            target: 'selecting',
            actions: 'adoptRehydratedSettings',
          },
          {
            guard: and([
              'admittedEvent',
              'matchingRehydration',
              'recoveryConsent',
              'rehydratedCompletionPersisted',
              'rehydratedSelectionPersisted',
            ]),
            target: 'completed',
            actions: 'adoptRehydratedAndAdvance',
          },
          {
            guard: and(['admittedEvent', 'matchingRehydration', 'recoveryConsent']),
            target: 'failed',
            actions: 'failRecoveredConsent',
          },
          {
            guard: and([
              'admittedEvent',
              'matchingRehydration',
              'recoverySkipSettings',
              'rehydratedAutoScanDisabled',
              'rehydratedCompletionPersisted',
            ]),
            target: 'skipped',
            actions: 'adoptRehydratedAndSkipAdvance',
          },
          {
            guard: and([
              'admittedEvent',
              'matchingRehydration',
              'recoverySkipSettings',
              'rehydratedAutoScanDisabled',
              'rehydratedCompletionAbsent',
            ]),
            target: 'skipping_completion',
            actions: 'adoptRehydratedAndPersistSkipCompletion',
          },
          {
            guard: and([
              'admittedEvent',
              'matchingRehydration',
              'recoverySkipSettings',
              'rehydratedAutoScanEnabled',
            ]),
            target: 'failed',
            actions: 'failRecoveredSkip',
          },
          {
            guard: and([
              'admittedEvent',
              'matchingRehydration',
              'recoverySkipCompletion',
              'rehydratedAutoScanDisabled',
              'rehydratedCompletionPersisted',
            ]),
            target: 'skipped',
            actions: 'adoptRehydratedAndSkipAdvance',
          },
          {
            guard: and([
              'admittedEvent',
              'matchingRehydration',
              'recoverySkipCompletion',
              'rehydratedAutoScanDisabled',
              'rehydratedCompletionAbsent',
            ]),
            target: 'skipping_completion',
            actions: 'adoptRehydratedAndPersistSkipCompletion',
          },
          {
            guard: and([
              'admittedEvent',
              'matchingRehydration',
              'recoverySkipCompletion',
              'rehydratedAutoScanEnabled',
            ]),
            target: 'failed',
            actions: 'failRecoveredSkip',
          },
          {
            guard: and([
              'admittedEvent',
              'matchingRehydration',
              'recoverySelectionOrCheck',
              'rehydratedSelectionPersisted',
            ]),
            target: 'checking.permission',
            actions: 'adoptRehydratedAndCheck',
          },
          {
            guard: and(['admittedEvent', 'matchingRehydration', 'recoverySelectionOrCheck']),
            target: 'failed',
            actions: 'failRecoveredSelection',
          },
        ],
        ONBOARDING_COMPLETION_CLEARED: {
          guard: and(['admittedEvent', 'completionClearMatches']),
          target: 'cancelled',
          actions: 'finishClearedCompletionCancellation',
        },
        NETWORK_OFFLINE: {
          guard: and(['admittedEvent', 'matchingRecoveryOffline']),
          target: 'failed',
          actions: 'failRecoveryOffline',
        },
      },
    },
    failed: {
      id: 'onboardingSourceFailed',
      on: {
        RETRY: [
          {
            guard: and(['admittedEvent', 'freshOperationIds', 'retryRecovery']),
            target: 'recovering',
            actions: 'retryRecoveryRead',
          },
          {
            guard: and(['admittedEvent', 'freshOperationIds', 'retrySkip', 'skipAlreadyComplete']),
            target: 'skipped',
            actions: 'completeSkipFromRetry',
          },
          {
            guard: and(['admittedEvent', 'freshOperationIds', 'retrySkip', 'skipNeedsSettings']),
            target: 'skipping_settings',
            actions: 'beginSkipSettings',
          },
          {
            guard: and(['admittedEvent', 'freshOperationIds', 'retrySkip', 'skipNeedsCompletion']),
            target: 'skipping_completion',
            actions: 'beginSkipCompletion',
          },
          {
            guard: and([
              'admittedEvent',
              'freshOperationIds',
              'selectedIncluded',
              'retryPersistence',
            ]),
            target: 'persisting',
            actions: 'beginSelectionPersistence',
          },
          {
            guard: and(['admittedEvent', 'freshOperationIds', 'selectedIncluded', 'retryConsent']),
            target: 'consenting',
            actions: 'beginConsentPersistence',
          },
          {
            guard: and(['admittedEvent', 'freshOperationIds', 'selectedIncluded', 'retryCheck']),
            target: 'checking.permission',
            actions: 'beginCheckFromIds',
          },
        ],
        SELECT_SOURCE: selectSource,
        CANCEL: cancelImmediately,
      },
    },
    completed: {
      type: 'final',
    },
    cancelled: {
      id: 'onboardingSourceCancelled',
      type: 'final',
    },
    skipped: {
      type: 'final',
    },
  },
});

export type OnboardingSourceDispatchResult =
  | Readonly<{ status: 'dispatched' }>
  | Readonly<{ status: 'rejected'; reason: 'invalid_event' | 'inactive' | 'reentrant' }>;

export interface OnboardingSourceController {
  dispatch(rawEvent: unknown): OnboardingSourceDispatchResult;
  getSnapshot(): OnboardingSourcePublicSnapshot;
  subscribe(listener: (snapshot: OnboardingSourcePublicSnapshot) => void): Subscription;
  stop(): void;
}

function publicState(value: unknown): OnboardingSourceState {
  if (value !== null && typeof value === 'object' && 'checking' in value) {
    return 'checking';
  }
  if (value === 'skipping_settings' || value === 'skipping_completion') {
    return 'skipping';
  }
  return typeof value === 'string' ? (value as OnboardingSourceState) : 'failed';
}

function publicSnapshot(
  value: unknown,
  context: OnboardingSourceContext
): OnboardingSourcePublicSnapshot {
  const state = publicState(value);
  const terminal = state === 'completed' || state === 'cancelled' || state === 'skipped';
  return deepFreeze({
    version: ONBOARDING_SOURCE_MODEL_VERSION,
    state,
    attemptId: context.attemptId,
    connectorCatalog: context.connectorCatalog.map((item) => ({
      id: item.id,
      name: item.name,
      icon: item.icon,
      url: item.url,
      hostPermissions: [...item.hostPermissions],
    })),
    selectedConnectorId: context.selectedConnectorId,
    persistedEnabledConnectorIds: [
      ...context.canonicalSettings.enabledConnectors,
    ] as OnboardingSourcePublicSnapshot['persistedEnabledConnectorIds'],
    onboardingCompleted: context.onboardingCompleted,
    autoScanEnabled: context.canonicalSettings.autoScan,
    automaticScanAuthorized: context.onboardingCompleted && context.canonicalSettings.autoScan,
    permission: context.permission,
    session: context.session,
    lastSync: context.lastSync,
    failure: cloneOnboardingSourceError(context.failure),
    command: cloneOnboardingSourceCommand(context.command),
    canContinue: state === 'ready',
    canRetry: state === 'permission_denied' || state === 'session_missing' || state === 'failed',
    canCancel: !terminal && state !== 'cancelling' && state !== 'recovering',
    advanceIssued: context.advanceIssued,
    settingsRevision: context.settingsRevision,
    settingsGeneration: context.settingsGeneration,
    correlationCapacityRemaining:
      ONBOARDING_SOURCE_MAX_CONSUMED_CORRELATIONS - context.consumedCorrelationIds.length,
  });
}

function notifyOnboardingSourceSnapshotSafely(
  listener: (snapshot: OnboardingSourcePublicSnapshot) => void,
  snapshot: OnboardingSourcePublicSnapshot
): void {
  try {
    listener(snapshot);
  } catch {
    // A public observer cannot interrupt dispatch or another observer.
  }
}

/**
 * Sole executable façade for the onboarding-source model.
 *
 * It never returns an XState snapshot, machine, actor, implementation object or
 * aliased context. Every read/subscription builds a fresh allowlisted DTO.
 */
export function createOnboardingSourceController(
  input: OnboardingSourceInput
): OnboardingSourceController {
  const parsedInput = parseOnboardingSourceInput(input);
  if (parsedInput === null) {
    throw new TypeError('Invalid onboarding source model input');
  }

  const actor = createActor(onboardingSourceMachine, {
    input: parsedInput as ParsedOnboardingSourceInput,
  });
  let stopped = false;
  let dispatching = false;
  actor.start();

  const project = (): OnboardingSourcePublicSnapshot => {
    const snapshot = actor.getSnapshot();
    return publicSnapshot(snapshot.value, snapshot.context);
  };

  return Object.freeze({
    dispatch(rawEvent: unknown): OnboardingSourceDispatchResult {
      if (stopped || actor.getSnapshot().status !== 'active') {
        return Object.freeze({ status: 'rejected', reason: 'inactive' });
      }
      if (dispatching) {
        return Object.freeze({ status: 'rejected', reason: 'reentrant' });
      }
      dispatching = true;
      try {
        const event = normalizeOnboardingSourceEvent(rawEvent, actor.getSnapshot().context);
        if (event === null) {
          return Object.freeze({ status: 'rejected', reason: 'invalid_event' });
        }
        ACTIVE_ONBOARDING_SOURCE_EVENTS.add(event);
        try {
          actor.send(event);
          return Object.freeze({ status: 'dispatched' });
        } finally {
          ACTIVE_ONBOARDING_SOURCE_EVENTS.delete(event);
        }
      } finally {
        dispatching = false;
      }
    },
    getSnapshot: project,
    subscribe(listener: (snapshot: OnboardingSourcePublicSnapshot) => void): Subscription {
      let unsubscribed = false;
      if (stopped) {
        notifyOnboardingSourceSnapshotSafely(listener, project());
        return Object.freeze({
          unsubscribe(): void {
            unsubscribed = true;
          },
        });
      }

      let receivedSynchronousSnapshot = false;
      const subscription = actor.subscribe((snapshot) => {
        receivedSynchronousSnapshot = true;
        if (!unsubscribed) {
          notifyOnboardingSourceSnapshotSafely(
            listener,
            publicSnapshot(snapshot.value, snapshot.context)
          );
        }
      });
      if (!receivedSynchronousSnapshot && !unsubscribed) {
        notifyOnboardingSourceSnapshotSafely(listener, project());
      }
      return Object.freeze({
        unsubscribe(): void {
          if (!unsubscribed) {
            unsubscribed = true;
            subscription.unsubscribe();
          }
        },
      });
    },
    stop(): void {
      if (!stopped) {
        stopped = true;
        actor.stop();
      }
    },
  });
}
