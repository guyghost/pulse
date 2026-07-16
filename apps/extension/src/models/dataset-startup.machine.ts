import { and, createActor, type ActorRefFrom } from 'xstate';

import {
  DATASET_STARTUP_MODEL_VERSION,
  datasetStartupCapacityError,
  normalizeDatasetStartupEvent,
  type DatasetStartupCapacityErrorV1,
  type DatasetStartupCommand,
  type DatasetStartupErrorV1,
  type DatasetStartupEvent,
  type DatasetStartupInput,
  type DatasetStartupResetTransferV1,
  type DatasetStartupStage,
  type LocalDatasetBootstrapV1,
} from './dataset-startup.contract';
import { createDatasetStartupSetup } from './dataset-startup.logic';

export * from './dataset-startup.contract';

const ACTIVE_DATASET_STARTUP_DISPATCH_EVENTS = new WeakSet<object>();
const datasetStartupSetup = createDatasetStartupSetup((event: DatasetStartupEvent) =>
  ACTIVE_DATASET_STARTUP_DISPATCH_EVENTS.has(event)
);

const joinAttempt = {
  guard: and(['admittedEvent', 'joinableStart', 'publicationBatchHasCapacity']),
  actions: 'joinCaller',
} as const;

const datasetStartupMachine = datasetStartupSetup.createMachine({
  id: 'datasetStartup',
  initial: 'boot',
  context: ({ input }) => ({
    workerEpoch: input.workerEpoch,
    defaultSettings: input.defaultSettings,
    includedConnectorIds: [...input.includedConnectorIds],
    attemptId: null,
    pendingRequestIds: [],
    settingsRecoveryRequestId: null,
    retryCount: 0,
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
  }),
  states: {
    boot: {
      always: [
        { guard: 'validInput', target: 'idle', actions: 'initializeContext' },
        { target: 'modelError', actions: 'reportInvalidInput' },
      ],
    },
    modelError: {
      type: 'final',
    },
    idle: {
      on: {
        START: {
          guard: and(['admittedEvent', 'validInitialStart']),
          target: 'active',
          actions: 'startAttempt',
        },
      },
    },
    active: {
      initial: 'checkingResetJournal',
      on: {
        START: joinAttempt,
        STEP_FAILED: [
          {
            guard: and(['admittedEvent', 'failureAfterAdmission']),
            target: '#datasetStartupFencingFailure',
            actions: 'rememberPostAdmissionFailure',
          },
          {
            guard: and(['admittedEvent', 'failureBeforeAdmission']),
            target: '#datasetStartupFailed',
            actions: 'rememberFailure',
          },
        ],
        RESET_PREEMPTED: {
          guard: and(['admittedEvent', 'matchingResetPreemption']),
          target: '#datasetStartupResetOwned',
          actions: 'transferPreemptedReset',
        },
      },
      states: {
        checkingResetJournal: {
          entry: 'issueResetGate',
          on: {
            RESET_GATE_CLEARED: {
              guard: and(['admittedEvent', 'matchingResetGateClear']),
              target: 'readingVersions',
            },
            RESET_REQUEST_PENDING: {
              guard: and(['admittedEvent', 'matchingPendingReset']),
              target: 'preflightingReset',
              actions: 'rememberPendingReset',
            },
            RESET_JOURNAL_FOUND: {
              guard: and(['admittedEvent', 'matchingResetJournal']),
              target: '#datasetStartupResetOwned',
              actions: 'transferBootJournal',
            },
          },
        },
        preflightingReset: {
          entry: 'issueResetPreflight',
          on: {
            RESET_PREFLIGHT_FRESH: {
              guard: and(['admittedEvent', 'matchingFreshPreflight']),
              target: '#datasetStartupResetOwned',
              actions: 'transferFreshReset',
            },
            RESET_COMPLETION_RECOGNIZED: {
              guard: and(['admittedEvent', 'matchingCompletionRecognition']),
              target: '#datasetStartupResetOwned',
              actions: 'transferCompletedReset',
            },
          },
        },
        readingVersions: {
          entry: 'issueReadVersions',
          on: {
            VERSIONS_READ: [
              {
                guard: and(['admittedEvent', 'matchingVersions', 'versionsDowngrade']),
                target: '#datasetStartupDowngradeBlocked',
                actions: 'blockDowngrade',
              },
              {
                guard: and(['admittedEvent', 'matchingVersions', 'versionsIncoherent']),
                target: '#datasetStartupFailed',
                actions: 'failVersionProtocol',
              },
              {
                guard: and(['admittedEvent', 'matchingVersions', 'versionsNeedStructure']),
                target: 'upgradingStructure',
                actions: 'recordVersions',
              },
              {
                guard: and(['admittedEvent', 'matchingVersions', 'versionsNeedData']),
                target: 'migratingData',
                actions: 'recordVersions',
              },
              {
                guard: and(['admittedEvent', 'matchingVersions', 'versionsCurrent']),
                target: 'verifyingCriticalAndEpoch',
                actions: 'recordVersions',
              },
            ],
          },
        },
        upgradingStructure: {
          entry: 'issueStructureUpgrade',
          on: {
            STRUCTURE_COMMITTED: {
              guard: and(['admittedEvent', 'matchingStructureCommit']),
              target: 'migratingData',
              actions: 'recordStructureCommit',
            },
          },
        },
        migratingData: {
          entry: 'issueDataMigration',
          on: {
            DATA_COMMITTED: {
              guard: and(['admittedEvent', 'matchingDataCommit']),
              target: 'verifyingCriticalAndEpoch',
              actions: 'recordDataCommit',
            },
          },
        },
        verifyingCriticalAndEpoch: {
          entry: 'issueVerification',
          on: {
            VERIFICATION_PASSED: {
              guard: and(['admittedEvent', 'matchingVerification']),
              target: 'wrappingSettingsEnvelope',
              actions: 'recordVerification',
            },
          },
        },
        wrappingSettingsEnvelope: {
          entry: 'issueSettingsEnvelopeWrap',
          on: {
            SETTINGS_ENVELOPE_WRAPPED: {
              guard: and(['admittedEvent', 'matchingSettingsEnvelope']),
              target: 'recoveringPreparedLedgers',
              actions: 'recordSettingsEnvelope',
            },
          },
        },
        recoveringPreparedLedgers: {
          entry: 'issuePreparedRecovery',
          on: {
            PREPARED_RECOVERED: {
              guard: and(['admittedEvent', 'matchingPreparedRecovery']),
              target: 'recoveringSettings',
              actions: 'recordPreparedRecovery',
            },
          },
        },
        recoveringSettings: {
          entry: 'issueSettingsRecovery',
          on: {
            SETTINGS_RECOVERY_PASSED: {
              guard: and(['admittedEvent', 'matchingSettingsRecovery']),
              target: 'openingAdmission',
              actions: 'recordSettingsRecovery',
            },
            SETTINGS_RESET_IN_PROGRESS: {
              guard: and(['admittedEvent', 'matchingSettingsReset']),
              target: '#datasetStartupResetOwned',
              actions: 'transferSettingsReset',
            },
          },
        },
        openingAdmission: {
          entry: 'issueOpenAdmission',
          on: {
            ADMISSION_OPENED: {
              guard: and(['admittedEvent', 'allAdmissionProofsRetained']),
              target: 'publishingBootstrap',
              actions: 'recordAdmission',
            },
          },
        },
        publishingBootstrap: {
          id: 'datasetStartupPublishingBootstrap',
          entry: 'issueBootstrapPublication',
          on: {
            START: {
              guard: and(['admittedEvent', 'joinableStart', 'publicationBatchHasCapacity']),
              actions: 'joinCallerAndRefreshPublication',
            },
            BOOTSTRAP_PUBLISHED: {
              guard: and(['admittedEvent', 'matchingPublication']),
              target: '#datasetStartupReady',
              actions: 'recordPublication',
            },
          },
        },
        fencingFailure: {
          id: 'datasetStartupFencingFailure',
          entry: 'issueFailureFence',
          on: {
            FAILURE_FENCED: {
              guard: and(['admittedEvent', 'matchingFailureFence']),
              target: '#datasetStartupFailed',
              actions: 'recordFailureFence',
            },
            STEP_FAILED: {
              guard: and(['admittedEvent', 'matchingFailure']),
              target: '#datasetStartupFailureFenceBlocked',
              actions: 'rememberFenceFailure',
            },
          },
        },
      },
    },
    failed: {
      id: 'datasetStartupFailed',
      on: {
        RETRY: {
          guard: and(['admittedEvent', 'retryAllowed']),
          target: 'active',
          actions: 'retryAttempt',
        },
        RESET_PREEMPTED: {
          guard: and(['admittedEvent', 'matchingResetPreemption']),
          target: '#datasetStartupResetOwned',
          actions: 'transferPreemptedReset',
        },
      },
    },
    downgradeBlocked: {
      id: 'datasetStartupDowngradeBlocked',
      type: 'final',
    },
    resetOwned: {
      id: 'datasetStartupResetOwned',
      type: 'final',
    },
    ready: {
      id: 'datasetStartupReady',
      on: {
        START: [
          {
            guard: and(['admittedEvent', 'duplicateReadyStart']),
          },
          {
            guard: and(['admittedEvent', 'freshReadyStart']),
            target: '#datasetStartupPublishingBootstrap',
            actions: 'joinCaller',
          },
        ],
        RESET_PREEMPTED: {
          guard: and(['admittedEvent', 'matchingResetPreemption']),
          target: '#datasetStartupResetOwned',
          actions: 'transferPreemptedReset',
        },
      },
    },
    failureFenceBlocked: {
      id: 'datasetStartupFailureFenceBlocked',
      on: {
        RESET_PREEMPTED: {
          guard: and(['admittedEvent', 'matchingResetPreemption']),
          target: '#datasetStartupResetOwned',
          actions: 'transferPreemptedReset',
        },
      },
    },
  },
});

type DatasetStartupActor = ActorRefFrom<typeof datasetStartupMachine>;
type InternalDatasetStartupSnapshot = ReturnType<DatasetStartupActor['getSnapshot']>;

export type DatasetStartupPublicState =
  | 'boot'
  | 'modelError'
  | 'idle'
  | 'checkingResetJournal'
  | 'preflightingReset'
  | 'readingVersions'
  | 'upgradingStructure'
  | 'migratingData'
  | 'verifyingCriticalAndEpoch'
  | 'wrappingSettingsEnvelope'
  | 'recoveringPreparedLedgers'
  | 'recoveringSettings'
  | 'openingAdmission'
  | 'publishingBootstrap'
  | 'fencingFailure'
  | 'failed'
  | 'failureFenceBlocked'
  | 'downgradeBlocked'
  | 'resetOwned'
  | 'ready';

export type DeepReadonlyDatasetStartupData<T> = T extends (...args: never[]) => unknown
  ? never
  : T extends readonly (infer Item)[]
    ? readonly DeepReadonlyDatasetStartupData<Item>[]
    : T extends object
      ? { readonly [Key in keyof T]: DeepReadonlyDatasetStartupData<T[Key]> }
      : T;

export interface DatasetStartupSnapshot {
  readonly version: typeof DATASET_STARTUP_MODEL_VERSION;
  readonly status: 'active' | 'done' | 'error' | 'stopped';
  readonly state: DatasetStartupPublicState;
  readonly attemptId: string | null;
  readonly workerEpoch: string;
  readonly pendingRequestIds: readonly string[];
  readonly settingsRecoveryRequestId: string | null;
  readonly retryCount: number;
  readonly expectedStage: DatasetStartupStage | null;
  readonly command: DeepReadonlyDatasetStartupData<DatasetStartupCommand> | null;
  readonly dataEpoch: string | null;
  readonly error: DeepReadonlyDatasetStartupData<DatasetStartupErrorV1> | null;
  readonly fenceError: DeepReadonlyDatasetStartupData<DatasetStartupErrorV1> | null;
  readonly resetTransfer: DeepReadonlyDatasetStartupData<DatasetStartupResetTransferV1> | null;
  readonly bootstraps: readonly DeepReadonlyDatasetStartupData<LocalDatasetBootstrapV1>[];
}

function cloneAndFreezeData<T>(value: T): DeepReadonlyDatasetStartupData<T> {
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'function') {
      throw new Error('Functions are forbidden in Dataset startup public data');
    }
    return value as DeepReadonlyDatasetStartupData<T>;
  }
  if (Array.isArray(value)) {
    return Object.freeze(
      value.map((item) => cloneAndFreezeData(item))
    ) as DeepReadonlyDatasetStartupData<T>;
  }
  const clone: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    clone[key] = cloneAndFreezeData(item);
  }
  return Object.freeze(clone) as DeepReadonlyDatasetStartupData<T>;
}

function publicState(snapshot: InternalDatasetStartupSnapshot): DatasetStartupPublicState {
  const value: unknown = snapshot.value;
  if (typeof value === 'string') {
    return value as DatasetStartupPublicState;
  }
  if (typeof value === 'object' && value !== null && 'active' in value) {
    const active = (value as { active?: unknown }).active;
    if (typeof active === 'string') {
      return active as DatasetStartupPublicState;
    }
  }
  throw new Error('Unknown Dataset startup state projection');
}

function projectDatasetStartupSnapshot(
  snapshot: InternalDatasetStartupSnapshot
): DatasetStartupSnapshot {
  const context = snapshot.context;
  const projected: DatasetStartupSnapshot = {
    version: DATASET_STARTUP_MODEL_VERSION,
    status: snapshot.status,
    state: publicState(snapshot),
    attemptId: context.attemptId,
    workerEpoch: context.workerEpoch,
    pendingRequestIds: cloneAndFreezeData(context.pendingRequestIds),
    settingsRecoveryRequestId: context.settingsRecoveryRequestId,
    retryCount: context.retryCount,
    expectedStage: context.expectedStage,
    command: context.command === null ? null : cloneAndFreezeData(context.command),
    dataEpoch: context.dataEpoch,
    error: context.error === null ? null : cloneAndFreezeData(context.error),
    fenceError: context.fenceError === null ? null : cloneAndFreezeData(context.fenceError),
    resetTransfer:
      context.resetTransfer === null ? null : cloneAndFreezeData(context.resetTransfer),
    bootstraps:
      context.lastPublicationProof === null
        ? Object.freeze([])
        : cloneAndFreezeData(context.lastPublicationProof.bootstraps),
  };
  return Object.freeze(projected);
}

export type DatasetStartupDispatchResult =
  | Readonly<{ status: 'dispatched' }>
  | Readonly<{
      status: 'rejected';
      reason: 'capacity_exceeded';
      error: DeepReadonlyDatasetStartupData<DatasetStartupCapacityErrorV1>;
    }>
  | Readonly<{
      status: 'rejected';
      reason: 'invalid_event' | 'inactive' | 'reentrant';
    }>;

export interface DatasetStartupController {
  dispatch(rawEvent: unknown): DatasetStartupDispatchResult;
  getSnapshot(): DatasetStartupSnapshot;
  subscribe(listener: (snapshot: DatasetStartupSnapshot) => void): DatasetStartupSubscription;
  stop(): void;
}

export interface DatasetStartupSubscription {
  unsubscribe(): void;
}

/**
 * Sole façade for the executable startup model.
 *
 * The machine and actor stay private. Unknown events are copied and strictly
 * normalized against the current attempt/command before their synchronous send.
 */
export function createDatasetStartupController(
  input: DatasetStartupInput
): DatasetStartupController {
  const actor = createActor(datasetStartupMachine, { input });
  let dispatching = false;
  let stopped = false;
  actor.start();

  return Object.freeze({
    dispatch(rawEvent: unknown): DatasetStartupDispatchResult {
      const snapshot = actor.getSnapshot();
      if (stopped || snapshot.status !== 'active') {
        return { status: 'rejected', reason: 'inactive' };
      }
      if (dispatching) {
        return { status: 'rejected', reason: 'reentrant' };
      }

      dispatching = true;
      try {
        let event: DatasetStartupEvent | null;
        try {
          event = normalizeDatasetStartupEvent(rawEvent, snapshot.context);
        } catch {
          return { status: 'rejected', reason: 'invalid_event' };
        }
        if (event === null) {
          return { status: 'rejected', reason: 'invalid_event' };
        }
        const capacityError = datasetStartupCapacityError(snapshot.context, event);
        if (capacityError !== null) {
          return Object.freeze({
            status: 'rejected',
            reason: 'capacity_exceeded',
            error: cloneAndFreezeData(capacityError),
          });
        }

        ACTIVE_DATASET_STARTUP_DISPATCH_EVENTS.add(event);
        try {
          actor.send(event);
          return { status: 'dispatched' };
        } finally {
          ACTIVE_DATASET_STARTUP_DISPATCH_EVENTS.delete(event);
        }
      } finally {
        dispatching = false;
      }
    },
    getSnapshot: () => projectDatasetStartupSnapshot(actor.getSnapshot()),
    subscribe(listener: (snapshot: DatasetStartupSnapshot) => void): DatasetStartupSubscription {
      const subscription = actor.subscribe((snapshot) =>
        listener(projectDatasetStartupSnapshot(snapshot))
      );
      return Object.freeze({
        unsubscribe: () => subscription.unsubscribe(),
      });
    },
    stop(): void {
      stopped = true;
      actor.stop();
    },
  });
}

export function selectDatasetStartupBootstrap(
  snapshot: DatasetStartupSnapshot,
  requestId: string
): DeepReadonlyDatasetStartupData<LocalDatasetBootstrapV1> | null {
  if (snapshot.state !== 'ready') {
    return null;
  }
  const bootstrap = snapshot.bootstraps.find((candidate) => candidate.requestId === requestId);
  return bootstrap === undefined ? null : cloneAndFreezeData(bootstrap);
}
