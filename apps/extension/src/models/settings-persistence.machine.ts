import { and, createActor, type ActorRefFrom } from 'xstate';
import type { AppSettings } from '../lib/core/types/app-settings';
import {
  MAX_SETTINGS_OUTCOMES_PER_EPOCH,
  clonePermissionMap,
  cloneSettings,
  normalizeSettingsPersistenceEvent,
  settingsGenerationHasMutationCapacity,
  settingsRevisionHasMutationCapacity,
  type SaveStatus,
  type SettingsPersistenceContext,
  type SettingsPersistenceCommand,
  type SettingsPersistenceError,
  type SettingsPersistenceEvent,
  type SettingsPersistenceInput,
} from './settings-persistence.contract';
import { createSettingsPersistenceSetup } from './settings-persistence.logic';

export * from './settings-persistence.contract';

const mutateTransitions = [
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
    target: 'reserving',
    actions: 'beginReservation',
  },
  { guard: 'admittedEvent', actions: 'rejectInvalid' },
] as const;

const restartReconcile = {
  guard: and(['admittedEvent', 'validRestart']),
  target: 'reconciling',
  actions: 'reconcileRestart',
} as const;

const protocolReconcile = {
  guard: and(['admittedEvent', 'protocolUnknown']),
  target: 'reconciling',
  actions: 'reconcileProtocol',
} as const;

const activeExternal = [
  {
    guard: and(['admittedEvent', 'newerBroadcast']),
    target: 'reconciling',
    actions: 'reconcileExternal',
  },
  {
    guard: and(['admittedEvent', 'divergentEqualBroadcastWithMutation']),
    target: 'reconciling',
    actions: 'reconcileExternal',
  },
] as const;

const failedMutateTransitions = [
  { guard: and(['admittedEvent', 'fatalFailure']) },
  ...mutateTransitions,
] as const;

const ACTIVE_SETTINGS_DISPATCH_EVENTS = new WeakSet<object>();
const settingsPersistenceSetup = createSettingsPersistenceSetup((event: SettingsPersistenceEvent) =>
  ACTIVE_SETTINGS_DISPATCH_EVENTS.has(event)
);

const settingsPersistenceMachine = settingsPersistenceSetup.createMachine({
  id: 'settingsPersistence',
  initial: 'boot',
  context: ({ input }) => ({
    dataEpoch: input.dataEpoch,
    defaultSettings: cloneSettings(input.defaultSettings),
    includedConnectorIds: [...input.includedConnectorIds],
    permissionOriginsByConnectorId: clonePermissionMap(input.permissionOriginsByConnectorId),
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
    pendingReset: null,
    reconcileRequestId: null,
    reconcileReason: null,
    runtimeEffectError: null,
    error: null,
    lastRejection: null,
    command: null,
  }),
  on: {
    'SETTINGS_CAPTURED/RESET_EPOCH_READY_TO_COMMIT': [
      { guard: and(['admittedEvent', 'duplicateResetReady']) },
      {
        guard: and(['admittedEvent', 'resetReady']),
        target: '.resetPending',
        actions: 'prepareReset',
      },
    ],
    'SETTINGS_CAPTURED/RESET_EPOCH_COMMITTED': [
      { guard: and(['admittedEvent', 'duplicateResetCommitted']) },
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
    reserving: {
      on: {
        'SETTINGS_CAPTURED/STORAGE_RESERVATION_GRANTED': [
          {
            guard: and(['admittedEvent', 'reservationGrantedNeedsPermission']),
            target: 'permission',
            actions: 'installReservationPermission',
          },
          {
            guard: and(['admittedEvent', 'reservationGrantedReadyToWrite']),
            target: 'writing',
            actions: 'installReservationWrite',
          },
        ],
        'SETTINGS_CAPTURED/STORAGE_RESERVATION_DENIED': {
          guard: and(['admittedEvent', 'reservationDenied']),
          target: 'failed',
          actions: 'rejectGlobalStorageQuota',
        },
        'SETTINGS_CAPTURED/CANONICAL_UPDATED': activeExternal,
        'SETTINGS_CAPTURED/SERVICE_WORKER_RESTARTED': restartReconcile,
        'SETTINGS_CAPTURED/PROTOCOL_UNCERTAIN': protocolReconcile,
      },
    },
    permission: {
      on: {
        'SETTINGS_CAPTURED/PERMISSION_GRANTED': {
          guard: and(['admittedEvent', 'permissionGranted']),
          target: 'writing',
          actions: 'installPermission',
        },
        'SETTINGS_CAPTURED/PERMISSION_REFUSED': {
          guard: and(['admittedEvent', 'permissionRefused']),
          target: 'failed',
          actions: 'settlePermissionRefusal',
        },
        'SETTINGS_CAPTURED/PERMISSION_OUTCOME_UNKNOWN': {
          guard: and(['admittedEvent', 'permissionUnknown']),
          target: 'reconciling',
          actions: 'reconcilePermission',
        },
        'SETTINGS_CAPTURED/CANCEL': {
          guard: and(['admittedEvent', 'validCancel']),
          target: 'cancelling',
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
            target: 'saved',
            actions: 'settleRetryNoOp',
          },
          {
            guard: and(['admittedEvent', 'retryRevisionExhausted']),
            target: 'failed',
            actions: 'rejectRetryRevisionExhausted',
          },
          {
            guard: and(['admittedEvent', 'retryGenerationExhausted']),
            target: 'failed',
            actions: 'rejectRetryGenerationExhausted',
          },
          {
            guard: and(['admittedEvent', 'retryLedgerFull']),
            target: 'failed',
            actions: 'rejectRetryLedgerFull',
          },
          {
            guard: and(['admittedEvent', 'retryReady']),
            target: 'reserving',
            actions: 'installRetryReservation',
          },
        ],
        'SETTINGS_CAPTURED/RETRY_FAILED': {
          guard: and(['admittedEvent', 'retryFailed']),
          target: 'reconciling',
          actions: 'reconcileRebase',
        },
        'SETTINGS_CAPTURED/CANCEL': {
          guard: and(['admittedEvent', 'validRetryCancel']),
          target: 'saved',
          actions: 'cancelRetryIntent',
        },
        'SETTINGS_CAPTURED/CANONICAL_UPDATED': activeExternal,
        'SETTINGS_CAPTURED/SERVICE_WORKER_RESTARTED': restartReconcile,
        'SETTINGS_CAPTURED/PROTOCOL_UNCERTAIN': {
          guard: and(['admittedEvent', 'rebaseProtocolUnknown']),
          target: 'reconciling',
          actions: 'reconcileRebaseProtocol',
        },
      },
    },
    writing: {
      on: {
        'SETTINGS_CAPTURED/SAVE_SUCCEEDED': {
          guard: and(['admittedEvent', 'saveSucceeded']),
          target: 'saved',
          actions: 'commitSave',
        },
        'SETTINGS_CAPTURED/SAVE_FAILED': {
          guard: and(['admittedEvent', 'saveFailed']),
          target: 'reconciling',
          actions: 'reconcileSave',
        },
        'SETTINGS_CAPTURED/RUNTIME_EFFECT_FAILED': {
          guard: and(['admittedEvent', 'effectFailed']),
          target: 'compensating',
          actions: 'beginCompensation',
        },
        'SETTINGS_CAPTURED/CANCEL': {
          guard: and(['admittedEvent', 'validCancel']),
          target: 'cancelling',
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
          target: 'failed',
          actions: 'settleCompensation',
        },
        'SETTINGS_CAPTURED/COMPENSATION_FAILED': {
          guard: and(['admittedEvent', 'compensationFailed']),
          target: 'reconciling',
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
          target: 'saved',
          actions: 'confirmCancel',
        },
        'SETTINGS_CAPTURED/CANCEL_OUTCOME_UNKNOWN': {
          guard: and(['admittedEvent', 'cancelUnknown']),
          target: 'reconciling',
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
            target: 'saved',
            actions: 'settleReconciledCandidate',
          },
          {
            guard: and(['admittedEvent', 'reconciledCancelled']),
            target: 'saved',
            actions: 'settleReconciledCancel',
          },
          {
            guard: and(['admittedEvent', 'reconciledSettledFailure']),
            target: 'failed',
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
          actions: 'retryReconcile',
        },
        'SETTINGS_CAPTURED/CANONICAL_UPDATED': activeExternal,
        'SETTINGS_CAPTURED/SERVICE_WORKER_RESTARTED': {
          guard: and(['admittedEvent', 'validRestart']),
          actions: 'reconcileRestart',
        },
        'SETTINGS_CAPTURED/PROTOCOL_UNCERTAIN': {
          guard: and(['admittedEvent', 'protocolUnknown']),
          actions: 'reconcileProtocol',
        },
      },
    },
    failed: {
      on: {
        'SETTINGS_CAPTURED/MUTATE': failedMutateTransitions,
        'SETTINGS_CAPTURED/RETRY': {
          guard: and(['admittedEvent', 'validRetry']),
          target: 'rebasing',
          actions: 'beginRetry',
        },
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
            target: 'reconciling',
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
  | 'reserving'
  | 'permission'
  | 'rebasing'
  | 'writing'
  | 'compensating'
  | 'cancelling'
  | 'reconciling'
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
  'reserving',
  'permission',
  'rebasing',
  'writing',
  'compensating',
  'cancelling',
  'reconciling',
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
