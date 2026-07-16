import { and, createActor, type ActorRefFrom } from 'xstate';
import type { AppSettings } from '../lib/core/types/app-settings';
import {
  MAX_SETTINGS_OUTCOMES_PER_EPOCH,
  clonePermissionMap,
  cloneSettings,
  normalizeSettingsPersistenceEvent,
  parseSettingsColdStartRecoverySeedV1,
  settingsGenerationHasMutationCapacity,
  settingsRevisionHasMutationCapacity,
  type SaveStatus,
  type SettingsPersistenceContext,
  type SettingsPersistenceCommand,
  type SettingsPersistenceError,
  type SettingsPersistenceEvent,
  type SettingsPersistenceInput,
  type SettingsTerminalSettlementV1,
} from './settings-persistence.contract';
import { createSettingsPersistenceSetup } from './settings-persistence.logic';

export * from './settings-persistence.contract';

const mutateTransitions = [
  {
    guard: and(['admittedEvent', 'handledActivationReplay']),
    target: 'saved',
    actions: 'rejectActivationReplay',
  },
  {
    guard: and(['admittedEvent', 'activationCapacityExhausted']),
    target: 'failed',
    actions: 'rejectActivationCapacity',
  },
  {
    guard: and(['admittedEvent', 'activationRejected']),
    target: 'saved',
    actions: 'settleActivationRejection',
  },
  { guard: and(['admittedEvent', 'noOp']), target: 'saved', actions: 'settleNoOp' },
  {
    guard: and(['admittedEvent', 'revisionExhausted']),
    target: 'failed',
    actions: 'rejectRevisionExhausted',
  },
  {
    guard: and(['admittedEvent', 'generationExhausted']),
    target: 'failed',
    actions: 'rejectGenerationExhausted',
  },
  { guard: and(['admittedEvent', 'ledgerFull']), target: 'failed', actions: 'rejectLedgerFull' },
  {
    guard: and(['admittedEvent', 'validMutation']),
    target: 'persistingIntent',
    actions: 'beginReservation',
  },
  {
    guard: and(['admittedEvent', 'invalidVerifiedMutation']),
    target: 'saved',
    actions: 'rejectInvalidConsumed',
  },
  { guard: 'admittedEvent', actions: 'rejectInvalid' },
] as const;

const restartReconcile = {
  guard: and(['admittedEvent', 'validRestart']),
  target: 'persistingIntent',
  actions: 'reconcileRestart',
} as const;

const protocolReconcile = {
  guard: and(['admittedEvent', 'protocolUnknown']),
  target: 'persistingIntent',
  actions: 'reconcileProtocol',
} as const;

const activeExternal = [
  {
    guard: and(['admittedEvent', 'newerBroadcast']),
    target: 'persistingIntent',
    actions: 'reconcileExternal',
  },
  {
    guard: and(['admittedEvent', 'divergentEqualBroadcastWithMutation']),
    target: 'persistingIntent',
    actions: 'reconcileExternal',
  },
] as const;

const failedMutateTransitions = [
  { guard: and(['admittedEvent', 'immutableOutcomeMissingFatal']) },
  { guard: and(['admittedEvent', 'fatalFailure']) },
  ...mutateTransitions,
] as const;

const failedRetryTransitions = [
  { guard: and(['admittedEvent', 'immutableOutcomeMissingFatal']) },
  {
    guard: and(['admittedEvent', 'handledRetryActivationReplay']),
    actions: 'rejectActivationReplay',
  },
  {
    guard: and(['admittedEvent', 'retryActivationCapacityExhausted']),
    actions: 'rejectActivationCapacity',
  },
  {
    guard: and(['admittedEvent', 'retryActivationRejected']),
    actions: 'settleRetryActivationRejection',
  },
  {
    guard: and(['admittedEvent', 'validRetry']),
    target: 'persistingIntent',
    actions: 'beginRetry',
  },
  {
    guard: and(['admittedEvent', 'verifiedRetryActivation']),
    actions: 'rejectInvalidRetryConsumed',
  },
  { guard: 'admittedEvent', actions: 'rejectInvalid' },
] as const;

const ACTIVE_SETTINGS_DISPATCH_EVENTS = new WeakSet<object>();
const settingsPersistenceSetup = createSettingsPersistenceSetup((event: SettingsPersistenceEvent) =>
  ACTIVE_SETTINGS_DISPATCH_EVENTS.has(event)
);

const settingsPersistenceMachine = settingsPersistenceSetup.createMachine({
  id: 'settingsPersistence',
  initial: 'boot',
  context: ({ input }) => {
    const coldStartSeed =
      input.coldStartSeed === null
        ? null
        : parseSettingsColdStartRecoverySeedV1(input.coldStartSeed, input.includedConnectorIds);
    return {
      dataEpoch: input.dataEpoch,
      workerEpoch: input.workerEpoch,
      defaultSettings: cloneSettings(input.defaultSettings),
      includedConnectorIds: [...input.includedConnectorIds],
      permissionOriginsByConnectorId: clonePermissionMap(input.permissionOriginsByConnectorId),
      coldStartSeedProvided: input.coldStartSeed !== null,
      coldStartSeed,
      loadStatus: 'loading',
      loadRequestId: input.initialLoadRequestId,
      phase: 'saved',
      canonical: null,
      projected: cloneSettings(input.defaultSettings),
      mutation: null,
      mutationOutcome: 'unknown',
      canonicalKnowledge: 'unknown',
      canonicalRelation: 'unknown',
      retryIntent: null,
      handledActivationIds: [],
      handledActivationResultIds: [],
      pendingIntent: coldStartSeed?.pendingIntent ?? null,
      deferredCommand: null,
      pendingTerminalSettlement: null,
      pendingTerminalTarget: null,
      terminalSettlement: null,
      pendingReset: null,
      reconcileRequestId: null,
      reconcileReason: null,
      runtimeEffectError: null,
      error: null,
      lastRejection: null,
      command: null,
    };
  },
  on: {
    'SETTINGS_CAPTURED/RESET_EPOCH_READY_TO_COMMIT': [
      { guard: and(['admittedEvent', 'duplicateResetReady']) },
      {
        guard: and(['admittedEvent', 'resetReadyWithPendingIntent']),
        target: '.clearingIntent',
        actions: 'prepareReadyResetClear',
      },
      {
        guard: and(['admittedEvent', 'resetReady']),
        target: '.resetPending',
        actions: 'prepareReset',
      },
    ],
    'SETTINGS_CAPTURED/RESET_EPOCH_COMMITTED': [
      { guard: and(['admittedEvent', 'duplicateResetCommitted']) },
      {
        guard: and(['admittedEvent', 'resetCommittedWithPendingIntent']),
        target: '.clearingIntent',
        actions: 'prepareCommittedResetClear',
      },
      {
        guard: and(['admittedEvent', 'resetCommitted']),
        target: '.loading',
        actions: 'commitReset',
      },
    ],
    'SETTINGS_CAPTURED/MUTATE': { guard: 'admittedEvent', actions: 'rejectBusy' },
  },
  states: {
    boot: {
      always: [
        {
          guard: 'exhaustedColdStart',
          target: 'modelError',
          actions: 'failColdStartRevision',
        },
        {
          guard: 'validColdStart',
          target: 'persistingIntent',
          actions: 'startColdReconciliation',
        },
        { guard: 'validInput', target: 'loading', actions: 'startInitialLoad' },
        { target: 'modelError', actions: 'failInput' },
      ],
    },
    modelError: {},
    resetPending: {
      on: {
        'SETTINGS_CAPTURED/MUTATE': { guard: 'admittedEvent' },
      },
    },
    loading: {
      on: {
        'SETTINGS_CAPTURED/LOAD': {
          guard: and(['admittedEvent', 'validLoadRequest']),
          actions: 'startLoad',
        },
        'SETTINGS_CAPTURED/LOAD_SUCCEEDED': {
          guard: and(['admittedEvent', 'validLoad']),
          target: 'saved',
          actions: 'acceptLoad',
        },
        'SETTINGS_CAPTURED/LOAD_FAILED': [
          {
            guard: and(['admittedEvent', 'resetLoadProtocolFailure']),
            target: 'loadError',
            actions: 'failResetLoadProtocol',
          },
          { guard: and(['admittedEvent', 'failedLoad']), target: 'loadError', actions: 'failLoad' },
        ],
        'SETTINGS_CAPTURED/SERVICE_WORKER_RESTARTED': [
          { guard: and(['admittedEvent', 'resetLoadRestart']), actions: 'resumeResetLoad' },
          { guard: and(['admittedEvent', 'validRestart']), actions: 'restartLoad' },
        ],
      },
    },
    loadError: {
      on: {
        'SETTINGS_CAPTURED/LOAD': {
          guard: and(['admittedEvent', 'validLoadRequest']),
          target: 'loading',
          actions: 'startLoad',
        },
        'SETTINGS_CAPTURED/SERVICE_WORKER_RESTARTED': [
          {
            guard: and(['admittedEvent', 'resetLoadRestart']),
            target: 'loading',
            actions: 'resumeResetLoad',
          },
          {
            guard: and(['admittedEvent', 'validRestart']),
            target: 'loading',
            actions: 'restartLoad',
          },
        ],
      },
    },
    saved: {
      on: {
        'SETTINGS_CAPTURED/LOAD': {
          guard: and(['admittedEvent', 'validLoadRequest']),
          target: 'loading',
          actions: 'startLoad',
        },
        'SETTINGS_CAPTURED/MUTATE': mutateTransitions,
        'SETTINGS_CAPTURED/CANONICAL_UPDATED': [
          { guard: and(['admittedEvent', 'newerBroadcast']), actions: 'adoptExternal' },
          {
            guard: and(['admittedEvent', 'divergentEqualBroadcast']),
            target: 'loading',
            actions: 'reloadDivergentExternal',
          },
        ],
        'SETTINGS_CAPTURED/SERVICE_WORKER_RESTARTED': {
          guard: and(['admittedEvent', 'validRestart']),
          target: 'loading',
          actions: 'restartLoad',
        },
      },
    },
    persistingIntent: {
      on: {
        'SETTINGS_CAPTURED/SETTINGS_PENDING_INTENT_PERSIST_FAILED': {
          guard: and(['admittedEvent', 'pendingIntentPersistFailed']),
          target: 'failed',
          actions: 'settlePendingIntentPersistFailure',
        },
        'SETTINGS_CAPTURED/SETTINGS_PENDING_INTENT_PERSIST_OUTCOME_UNKNOWN': {
          guard: and(['admittedEvent', 'pendingIntentPersistUnknown']),
          actions: 'retainPendingIntentCommand',
        },
        'SETTINGS_CAPTURED/SETTINGS_PENDING_INTENT_PERSISTED': [
          {
            guard: and(['admittedEvent', 'persistedToReserving']),
            target: 'reserving',
            actions: 'activatePersistedIntent',
          },
          {
            guard: and(['admittedEvent', 'persistedToPermissionCheck']),
            target: 'permissionCheck',
            actions: 'activatePersistedIntent',
          },
          {
            guard: and(['admittedEvent', 'persistedToWriting']),
            target: 'writing',
            actions: 'activatePersistedIntent',
          },
          {
            guard: and(['admittedEvent', 'persistedToCompensating']),
            target: 'compensating',
            actions: 'activatePersistedIntent',
          },
          {
            guard: and(['admittedEvent', 'persistedToRebasing']),
            target: 'rebasing',
            actions: 'activatePersistedIntent',
          },
          {
            guard: and(['admittedEvent', 'persistedToCancelling']),
            target: 'cancelling',
            actions: 'activatePersistedIntent',
          },
          {
            guard: and(['admittedEvent', 'persistedToReconciling']),
            target: 'reconciling',
            actions: 'activatePersistedIntent',
          },
        ],
      },
    },
    reserving: {
      on: {
        'SETTINGS_CAPTURED/STORAGE_RESERVATION_GRANTED': [
          {
            guard: and(['admittedEvent', 'reservationGrantedNeedsPermission']),
            target: 'persistingIntent',
            actions: 'installReservationPermission',
          },
          {
            guard: and(['admittedEvent', 'reservationGrantedReadyToWrite']),
            target: 'persistingIntent',
            actions: 'installReservationWrite',
          },
        ],
        'SETTINGS_CAPTURED/STORAGE_RESERVATION_DENIED': {
          guard: and(['admittedEvent', 'reservationDenied']),
          target: 'clearingIntent',
          actions: 'rejectGlobalStorageQuota',
        },
        'SETTINGS_CAPTURED/CANONICAL_UPDATED': activeExternal,
        'SETTINGS_CAPTURED/SERVICE_WORKER_RESTARTED': restartReconcile,
        'SETTINGS_CAPTURED/PROTOCOL_UNCERTAIN': protocolReconcile,
      },
    },
    permissionCheck: {
      on: {
        'SETTINGS_CAPTURED/HOST_PERMISSIONS_VERIFIED': {
          guard: and(['admittedEvent', 'hostPermissionsVerified']),
          target: 'persistingIntent',
          actions: 'installPermission',
        },
        'SETTINGS_CAPTURED/HOST_PERMISSIONS_MISSING': {
          guard: and(['admittedEvent', 'hostPermissionsMissing']),
          target: 'clearingIntent',
          actions: 'settlePermissionRefusal',
        },
        'SETTINGS_CAPTURED/HOST_PERMISSIONS_OUTCOME_UNKNOWN': {
          guard: and(['admittedEvent', 'hostPermissionsUnknown']),
          target: 'persistingIntent',
          actions: 'reconcilePermission',
        },
        'SETTINGS_CAPTURED/CANCEL': {
          guard: and(['admittedEvent', 'validCancel']),
          target: 'persistingIntent',
          actions: 'beginCancel',
        },
        'SETTINGS_CAPTURED/CANONICAL_UPDATED': activeExternal,
        'SETTINGS_CAPTURED/SERVICE_WORKER_RESTARTED': restartReconcile,
        'SETTINGS_CAPTURED/PROTOCOL_UNCERTAIN': protocolReconcile,
      },
    },
    rebasing: {
      on: {
        'SETTINGS_CAPTURED/RETRY_READY': [
          {
            guard: and(['admittedEvent', 'retryNoOp']),
            target: 'clearingIntent',
            actions: 'settleRetryNoOp',
          },
          {
            guard: and(['admittedEvent', 'retryRevisionExhausted']),
            target: 'clearingIntent',
            actions: 'rejectRetryRevisionExhausted',
          },
          {
            guard: and(['admittedEvent', 'retryGenerationExhausted']),
            target: 'clearingIntent',
            actions: 'rejectRetryGenerationExhausted',
          },
          {
            guard: and(['admittedEvent', 'retryLedgerFull']),
            target: 'clearingIntent',
            actions: 'rejectRetryLedgerFull',
          },
          {
            guard: and(['admittedEvent', 'retryReady']),
            target: 'persistingIntent',
            actions: 'installRetryReservation',
          },
        ],
        'SETTINGS_CAPTURED/RETRY_FAILED': {
          guard: and(['admittedEvent', 'retryFailed']),
          target: 'persistingIntent',
          actions: 'reconcileRebase',
        },
        'SETTINGS_CAPTURED/CANCEL': {
          guard: and(['admittedEvent', 'validRetryCancel']),
          target: 'clearingIntent',
          actions: 'cancelRetryIntent',
        },
        'SETTINGS_CAPTURED/CANONICAL_UPDATED': activeExternal,
        'SETTINGS_CAPTURED/SERVICE_WORKER_RESTARTED': restartReconcile,
        'SETTINGS_CAPTURED/PROTOCOL_UNCERTAIN': {
          guard: and(['admittedEvent', 'rebaseProtocolUnknown']),
          target: 'persistingIntent',
          actions: 'reconcileRebaseProtocol',
        },
      },
    },
    writing: {
      on: {
        'SETTINGS_CAPTURED/SAVE_SUCCEEDED': {
          guard: and(['admittedEvent', 'saveSucceeded']),
          target: 'clearingIntent',
          actions: 'commitSave',
        },
        'SETTINGS_CAPTURED/SAVE_FAILED': {
          guard: and(['admittedEvent', 'saveFailed']),
          target: 'persistingIntent',
          actions: 'reconcileSave',
        },
        'SETTINGS_CAPTURED/RUNTIME_EFFECT_FAILED': {
          guard: and(['admittedEvent', 'effectFailed']),
          target: 'persistingIntent',
          actions: 'beginCompensation',
        },
        'SETTINGS_CAPTURED/CANCEL': {
          guard: and(['admittedEvent', 'validCancel']),
          target: 'persistingIntent',
          actions: 'beginCancel',
        },
        'SETTINGS_CAPTURED/CANONICAL_UPDATED': activeExternal,
        'SETTINGS_CAPTURED/SERVICE_WORKER_RESTARTED': restartReconcile,
        'SETTINGS_CAPTURED/PROTOCOL_UNCERTAIN': protocolReconcile,
      },
    },
    compensating: {
      on: {
        'SETTINGS_CAPTURED/COMPENSATION_SUCCEEDED': {
          guard: and(['admittedEvent', 'compensationSucceeded']),
          target: 'clearingIntent',
          actions: 'settleCompensation',
        },
        'SETTINGS_CAPTURED/COMPENSATION_FAILED': {
          guard: and(['admittedEvent', 'compensationFailed']),
          target: 'persistingIntent',
          actions: 'reconcileCompensation',
        },
        'SETTINGS_CAPTURED/CANONICAL_UPDATED': activeExternal,
        'SETTINGS_CAPTURED/SERVICE_WORKER_RESTARTED': restartReconcile,
        'SETTINGS_CAPTURED/PROTOCOL_UNCERTAIN': protocolReconcile,
      },
    },
    cancelling: {
      on: {
        'SETTINGS_CAPTURED/CANCEL_CONFIRMED': {
          guard: and(['admittedEvent', 'cancelConfirmed']),
          target: 'clearingIntent',
          actions: 'confirmCancel',
        },
        'SETTINGS_CAPTURED/CANCEL_OUTCOME_UNKNOWN': {
          guard: and(['admittedEvent', 'cancelUnknown']),
          target: 'persistingIntent',
          actions: 'reconcileCancel',
        },
        'SETTINGS_CAPTURED/CANONICAL_UPDATED': activeExternal,
        'SETTINGS_CAPTURED/SERVICE_WORKER_RESTARTED': restartReconcile,
        'SETTINGS_CAPTURED/PROTOCOL_UNCERTAIN': protocolReconcile,
      },
    },
    reconciling: {
      on: {
        'SETTINGS_CAPTURED/RECONCILED': [
          {
            guard: and(['admittedEvent', 'reconciledCandidate']),
            target: 'clearingIntent',
            actions: 'settleReconciledCandidate',
          },
          {
            guard: and(['admittedEvent', 'reconciledCancelled']),
            target: 'clearingIntent',
            actions: 'settleReconciledCancel',
          },
          {
            guard: and(['admittedEvent', 'reconciledSettledFailure']),
            target: 'clearingIntent',
            actions: 'settleReconciledFailure',
          },
          {
            guard: and(['admittedEvent', 'reconciledUnknown']),
            target: 'failed',
            actions: 'settleReconciledFailure',
          },
        ],
        'SETTINGS_CAPTURED/RECONCILE_FAILED': {
          guard: and(['admittedEvent', 'reconcileFailed']),
          actions: 'failReconcile',
        },
        'SETTINGS_CAPTURED/RETRY_RECONCILIATION': {
          guard: and(['admittedEvent', 'retryReconcile']),
          target: 'persistingIntent',
          actions: 'retryReconcile',
        },
        'SETTINGS_CAPTURED/CANONICAL_UPDATED': activeExternal,
        'SETTINGS_CAPTURED/SERVICE_WORKER_RESTARTED': {
          guard: and(['admittedEvent', 'validRestart']),
          target: 'persistingIntent',
          actions: 'reconcileRestart',
        },
        'SETTINGS_CAPTURED/PROTOCOL_UNCERTAIN': {
          guard: and(['admittedEvent', 'protocolUnknown']),
          target: 'persistingIntent',
          actions: 'reconcileProtocol',
        },
      },
    },
    clearingIntent: {
      on: {
        'SETTINGS_CAPTURED/SETTINGS_PENDING_INTENT_CLEAR_OUTCOME_UNKNOWN': {
          guard: and(['admittedEvent', 'pendingIntentClearUnknown']),
          actions: 'retainPendingIntentCommand',
        },
        'SETTINGS_CAPTURED/SETTINGS_PENDING_INTENT_CLEARED': [
          {
            guard: and(['admittedEvent', 'clearedToSaved']),
            target: 'saved',
            actions: 'publishClearedTerminal',
          },
          {
            guard: and(['admittedEvent', 'clearedToFailed']),
            target: 'failed',
            actions: 'publishClearedTerminal',
          },
          {
            guard: and(['admittedEvent', 'clearedToResetPending']),
            target: 'resetPending',
            actions: 'publishClearedResetReady',
          },
          {
            guard: and(['admittedEvent', 'clearedToResetLoading']),
            target: 'loading',
            actions: 'publishClearedResetLoad',
          },
        ],
      },
    },
    failed: {
      on: {
        'SETTINGS_CAPTURED/MUTATE': failedMutateTransitions,
        'SETTINGS_CAPTURED/RETRY': failedRetryTransitions,
        'SETTINGS_CAPTURED/DISMISS_ERROR': {
          guard: and(['admittedEvent', 'dismissible']),
          target: 'saved',
          actions: 'dismiss',
        },
        'SETTINGS_CAPTURED/CANONICAL_UPDATED': [
          { guard: and(['admittedEvent', 'newerBroadcast']), actions: 'adoptExternal' },
          {
            guard: and(['admittedEvent', 'divergentEqualBroadcastWithoutMutation']),
            target: 'loading',
            actions: 'reloadDivergentExternal',
          },
          {
            guard: and(['admittedEvent', 'divergentEqualBroadcastWithMutation']),
            target: 'persistingIntent',
            actions: 'reconcileExternal',
          },
        ],
        'SETTINGS_CAPTURED/SERVICE_WORKER_RESTARTED': [
          {
            guard: and(['admittedEvent', 'restartWithoutMutation']),
            target: 'loading',
            actions: 'restartLoad',
          },
          restartReconcile,
        ],
      },
    },
  },
});

type SettingsPersistenceActor = ActorRefFrom<typeof settingsPersistenceMachine>;
type SettingsPersistenceNativeSnapshot = ReturnType<SettingsPersistenceActor['getSnapshot']>;

export type SettingsPersistenceReadonly<T> = T extends (...args: never[]) => unknown
  ? never
  : T extends readonly (infer Item)[]
    ? readonly SettingsPersistenceReadonly<Item>[]
    : T extends object
      ? { readonly [Key in keyof T]: SettingsPersistenceReadonly<T[Key]> }
      : T;

export type SettingsPersistencePublicState =
  | 'boot'
  | 'modelError'
  | 'resetPending'
  | 'loading'
  | 'loadError'
  | 'saved'
  | 'persistingIntent'
  | 'reserving'
  | 'permissionCheck'
  | 'rebasing'
  | 'writing'
  | 'compensating'
  | 'cancelling'
  | 'reconciling'
  | 'clearingIntent'
  | 'failed';

export interface SettingsPersistencePublicView {
  readonly lifecycle: 'active' | 'stopped';
  readonly state: SettingsPersistencePublicState;
  readonly dataEpoch: string;
  readonly loadStatus: SettingsPersistenceContext['loadStatus'];
  readonly saveStatus: SaveStatus;
  readonly editingDisabled: boolean;
  readonly confirmedSettings: SettingsPersistenceReadonly<AppSettings> | null;
  readonly projectedSettings: SettingsPersistenceReadonly<AppSettings>;
  readonly command: SettingsPersistenceReadonly<SettingsPersistenceCommand> | null;
  readonly error: SettingsPersistenceReadonly<SettingsPersistenceError> | null;
  readonly lastRejection: SettingsPersistenceReadonly<SettingsPersistenceError> | null;
  readonly runtimeEffectError: SettingsPersistenceReadonly<SettingsPersistenceError> | null;
  readonly terminalSettlement: SettingsPersistenceReadonly<SettingsTerminalSettlementV1> | null;
}

export interface SettingsPersistenceSubscription {
  unsubscribe(): void;
}

export type SettingsPersistenceDispatchResult =
  | Readonly<{ status: 'dispatched' }>
  | Readonly<{
      status: 'rejected';
      reason: 'invalid_event' | 'inactive' | 'reentrant';
    }>;

export interface SettingsPersistenceController {
  dispatch(rawEvent: unknown): SettingsPersistenceDispatchResult;
  getSnapshot(): SettingsPersistencePublicView;
  subscribe(
    listener: (view: SettingsPersistencePublicView) => void
  ): SettingsPersistenceSubscription;
  stop(): void;
}

const SETTINGS_PERSISTENCE_PUBLIC_STATES = [
  'boot',
  'modelError',
  'resetPending',
  'loading',
  'loadError',
  'saved',
  'persistingIntent',
  'reserving',
  'permissionCheck',
  'rebasing',
  'writing',
  'compensating',
  'cancelling',
  'reconciling',
  'clearingIntent',
  'failed',
] as const satisfies readonly SettingsPersistencePublicState[];

function cloneAndFreezePublicDomainValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return Object.freeze(value.map((item) => cloneAndFreezePublicDomainValue(item)));
  }
  if (typeof value === 'object' && value !== null) {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError('Settings public view accepts plain domain objects only');
    }
    const clone: Record<string, unknown> = {};
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== 'string') {
        throw new TypeError('Settings public view rejects Symbol keys');
      }
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (
        descriptor === undefined ||
        descriptor.enumerable !== true ||
        !Object.prototype.hasOwnProperty.call(descriptor, 'value')
      ) {
        throw new TypeError('Settings public view accepts enumerable data properties only');
      }
      clone[key] = cloneAndFreezePublicDomainValue(descriptor.value);
    }
    return Object.freeze(clone);
  }
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }
  throw new TypeError('Settings public view accepts JSON domain values only');
}

function publicDomainCopy<T>(value: T): SettingsPersistenceReadonly<T> {
  return cloneAndFreezePublicDomainValue(value) as SettingsPersistenceReadonly<T>;
}

function publicStateFromSnapshot(
  snapshot: SettingsPersistenceNativeSnapshot
): SettingsPersistencePublicState {
  const state = snapshot.value;
  if (
    typeof state !== 'string' ||
    !SETTINGS_PERSISTENCE_PUBLIC_STATES.includes(state as SettingsPersistencePublicState)
  ) {
    throw new TypeError('Settings statechart produced a non-public state');
  }
  return state as SettingsPersistencePublicState;
}

function projectSettingsPersistencePublicView(
  snapshot: SettingsPersistenceNativeSnapshot,
  lifecycle: SettingsPersistencePublicView['lifecycle']
): SettingsPersistencePublicView {
  const context = snapshot.context;
  const uiStatus = selectSettingsUiStatus(context);
  return Object.freeze({
    lifecycle,
    state: publicStateFromSnapshot(snapshot),
    dataEpoch: context.dataEpoch,
    loadStatus: context.loadStatus,
    saveStatus: uiStatus.saveStatus,
    editingDisabled: uiStatus.editingDisabled,
    confirmedSettings:
      context.canonical === null ? null : publicDomainCopy(context.canonical.envelope.settings),
    projectedSettings: publicDomainCopy(context.projected),
    command: context.command === null ? null : publicDomainCopy(context.command),
    error: context.error === null ? null : publicDomainCopy(context.error),
    lastRejection: context.lastRejection === null ? null : publicDomainCopy(context.lastRejection),
    runtimeEffectError:
      context.runtimeEffectError === null ? null : publicDomainCopy(context.runtimeEffectError),
    terminalSettlement:
      context.terminalSettlement === null ? null : publicDomainCopy(context.terminalSettlement),
  });
}

function notifySettingsViewSafely(
  listener: (view: SettingsPersistencePublicView) => void,
  view: SettingsPersistencePublicView
): void {
  try {
    listener(view);
  } catch {
    // Public observers cannot interrupt the private actor or another observer.
  }
}

/**
 * Sole runtime façade for the Settings statechart.
 *
 * The actor starts before this controller is returned and is never exposed.
 * Admission exists only while its synchronous send call is on the stack.
 */
export function createSettingsPersistenceController(
  input: SettingsPersistenceInput
): SettingsPersistenceController {
  const actor = createActor(settingsPersistenceMachine, { input });
  let dispatching = false;
  let stopped = false;
  actor.start();

  const currentPublicView = (): SettingsPersistencePublicView =>
    projectSettingsPersistencePublicView(actor.getSnapshot(), stopped ? 'stopped' : 'active');

  return Object.freeze({
    dispatch(rawEvent: unknown): SettingsPersistenceDispatchResult {
      if (stopped || actor.getSnapshot().status !== 'active') {
        return { status: 'rejected', reason: 'inactive' };
      }
      if (dispatching) {
        return { status: 'rejected', reason: 'reentrant' };
      }

      dispatching = true;
      try {
        let event: SettingsPersistenceEvent | null;
        try {
          event = normalizeSettingsPersistenceEvent(rawEvent, actor.getSnapshot().context);
        } catch {
          return { status: 'rejected', reason: 'invalid_event' };
        }
        if (event === null) {
          return { status: 'rejected', reason: 'invalid_event' };
        }

        ACTIVE_SETTINGS_DISPATCH_EVENTS.add(event);
        try {
          actor.send(event);
          return { status: 'dispatched' };
        } finally {
          ACTIVE_SETTINGS_DISPATCH_EVENTS.delete(event);
        }
      } finally {
        dispatching = false;
      }
    },
    getSnapshot: currentPublicView,
    subscribe(
      listener: (view: SettingsPersistencePublicView) => void
    ): SettingsPersistenceSubscription {
      let unsubscribed = false;
      if (stopped) {
        notifySettingsViewSafely(listener, currentPublicView());
        return Object.freeze({
          unsubscribe(): void {
            unsubscribed = true;
          },
        });
      }

      let receivedSynchronousView = false;
      const actorSubscription = actor.subscribe((snapshot) => {
        receivedSynchronousView = true;
        if (!unsubscribed) {
          notifySettingsViewSafely(
            listener,
            projectSettingsPersistencePublicView(snapshot, stopped ? 'stopped' : 'active')
          );
        }
      });
      if (!receivedSynchronousView && !unsubscribed) {
        notifySettingsViewSafely(listener, currentPublicView());
      }
      return Object.freeze({
        unsubscribe(): void {
          if (!unsubscribed) {
            unsubscribed = true;
            actorSubscription.unsubscribe();
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

export interface SettingsUiStatus {
  loadStatus: SettingsPersistenceContext['loadStatus'];
  saveStatus: SaveStatus;
  editingDisabled: boolean;
}

export function selectSettingsUiStatus(context: SettingsPersistenceContext): SettingsUiStatus {
  if (context.loadStatus !== 'ready') {
    return { loadStatus: context.loadStatus, saveStatus: 'saving', editingDisabled: true };
  }

  const saveStatus: SaveStatus =
    context.phase === 'saved' ? 'saved' : context.phase === 'failed' ? 'failed' : 'saving';
  return {
    loadStatus: context.loadStatus,
    saveStatus,
    editingDisabled:
      !['saved', 'failed'].includes(context.phase) ||
      context.canonicalKnowledge !== 'known' ||
      (context.phase === 'failed' && context.error?.recoverable === false) ||
      !settingsRevisionHasMutationCapacity(context.canonical?.envelope.revision ?? -1) ||
      !settingsGenerationHasMutationCapacity(context.canonical?.envelope.generation ?? -1) ||
      (context.canonical?.envelope.outcomes.length ?? 0) >= MAX_SETTINGS_OUTCOMES_PER_EPOCH,
  };
}

export const selectSettingsSaveStatus = (context: SettingsPersistenceContext): SaveStatus =>
  selectSettingsUiStatus(context).saveStatus;
