import type {
  SettingsPersistenceCommand,
  SettingsPersistenceInput,
  SettingsPersistenceRawEvent,
} from '../../../models/settings-persistence.contract';
import {
  captureSettingsShellEventBoundary,
  contractFor,
  isUuidV4,
  makeError,
  readStrictJsonRecord,
} from '../../../models/settings-persistence.contract';
import {
  createSettingsPersistenceController,
  type SettingsPersistenceController,
  type SettingsPersistenceDispatchResult,
  type SettingsPersistencePublicView,
  type SettingsPersistenceSubscription,
} from '../../../models/settings-persistence.machine';

/** Executes one already-modeled Shell command and returns its raw response. */
export interface SettingsCommandExecutorPort {
  execute(command: SettingsPersistenceCommand): Promise<unknown>;
}

/**
 * Shell-only backpressure result. It is not a model event and therefore never
 * enters the controller. The exact current command remains available for an
 * explicit resume or service-worker handoff.
 */
export interface SettingsCommandExecutionDeferredV1 {
  readonly type: 'SETTINGS_COMMAND_EXECUTION_DEFERRED';
  readonly reason: 'identity_exhausted';
  readonly commandType: SettingsPersistenceCommand['type'];
  readonly commandId: string;
  readonly dataEpoch: string;
}

export interface SettingsPersistenceCoordinator {
  dispatch(rawEvent: unknown): SettingsPersistenceDispatchResult;
  getSnapshot(): SettingsPersistencePublicView;
  subscribe(
    listener: (view: SettingsPersistencePublicView) => void
  ): SettingsPersistenceSubscription;
  /** Resolves after every command currently queued by the model has settled. */
  whenIdle(): Promise<void>;
  /** Retries an idempotent command whose prior outcome remained ambiguous. */
  resume(): Promise<void>;
  /** Drains one in-flight effect, then exposes the exact durable handoff. */
  stop(): Promise<SettingsPersistenceCoordinatorHandoffV1>;
}

export interface SettingsPersistenceCoordinatorHandoffV1 {
  readonly version: 1;
  readonly stopped: true;
  readonly pendingCommand: SettingsPersistenceCommand | null;
  readonly view: SettingsPersistencePublicView;
}

export interface SettingsPersistenceCoordinatorDependencies {
  input: SettingsPersistenceInput;
  executor: SettingsCommandExecutorPort;
  /** Injectable only for deterministic tests; production defaults to crypto.randomUUID(). */
  allocateId?: () => string;
}

export class SettingsPersistenceCoordinatorError extends Error {
  constructor(
    readonly code: 'rejected_executor_response' | 'inactive',
    message: string
  ) {
    super(message);
    this.name = 'SettingsPersistenceCoordinatorError';
  }
}

export const MAX_SETTINGS_COORDINATOR_ID_ALLOCATION_ATTEMPTS = 128;

export function createSettingsCommandExecutionDeferred(
  command: SettingsPersistenceCommand
): SettingsCommandExecutionDeferredV1 {
  return Object.freeze({
    type: 'SETTINGS_COMMAND_EXECUTION_DEFERRED',
    reason: 'identity_exhausted',
    commandType: command.type,
    commandId: command.commandId,
    dataEpoch: command.dataEpoch,
  });
}

function isSettingsCommandExecutionDeferred(
  value: unknown,
  command: SettingsPersistenceCommand
): value is SettingsCommandExecutionDeferredV1 {
  const record = readStrictJsonRecord(value, [
    'type',
    'reason',
    'commandType',
    'commandId',
    'dataEpoch',
  ]);
  return (
    record !== null &&
    record.type === 'SETTINGS_COMMAND_EXECUTION_DEFERRED' &&
    record.reason === 'identity_exhausted' &&
    record.commandType === command.type &&
    record.commandId === command.commandId &&
    record.dataEpoch === command.dataEpoch
  );
}

function commandIdentity(command: SettingsPersistenceCommand): string {
  const base = [command.type, command.commandId, command.dataEpoch];
  switch (command.type) {
    case 'PERSIST_SETTINGS_PENDING_INTENT':
    case 'CLEAR_SETTINGS_PENDING_INTENT':
      return [...base, command.intentDigest].join('\u001f');
    case 'RECOVER_AND_LOAD_SETTINGS':
      return [...base, command.requestId].join('\u001f');
    case 'RESERVE_SETTINGS_STORAGE':
    case 'VERIFY_SETTINGS_HOST_PERMISSIONS':
    case 'COMPARE_AND_SETTLE_SETTINGS':
      return [
        ...base,
        command.mutationId,
        command.commandDigest,
        String(command.baseRevision),
        String(command.baseGeneration),
      ].join('\u001f');
    case 'RECOVER_SETTINGS_TRANSACTION':
    case 'ABORT_SETTINGS_MUTATION':
    case 'RECONCILE_SETTINGS':
      return [
        ...base,
        command.requestId,
        command.mutationId,
        command.commandDigest,
        String(command.baseRevision),
        String(command.baseGeneration),
      ].join('\u001f');
    case 'REBASE_SETTINGS_MUTATION':
      return [...base, command.requestId, command.mutationId].join('\u001f');
  }
}

function detachedCommand(view: SettingsPersistencePublicView): SettingsPersistenceCommand | null {
  return view.command === null
    ? null
    : (structuredClone(view.command) as SettingsPersistenceCommand);
}

function collectUuidValues(value: unknown, target: Set<string>): boolean {
  const capture = captureSettingsShellEventBoundary(value);
  if (capture === null) {
    return false;
  }
  for (const id of capture.uuidIds) {
    target.add(id);
  }
  return true;
}

function deepFreezeDetached<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) {
    return value;
  }
  if (Array.isArray(value)) {
    value.forEach(deepFreezeDetached);
  } else {
    Object.values(value).forEach(deepFreezeDetached);
  }
  return Object.freeze(value);
}

function executionFailureEvent(
  command: SettingsPersistenceCommand,
  allocateRequestId: () => string | null
): SettingsPersistenceRawEvent | SettingsCommandExecutionDeferredV1 {
  const message = 'Settings command execution failed before an exact response was proved.';
  switch (command.type) {
    case 'PERSIST_SETTINGS_PENDING_INTENT':
      return {
        type: 'SETTINGS_PENDING_INTENT_PERSIST_OUTCOME_UNKNOWN',
        dataEpoch: command.dataEpoch,
        mutationId: command.pendingIntent.mutation.mutationId,
        commandId: command.commandId,
        error: makeError(
          contractFor('SETTINGS_TRANSPORT_ERROR', 'unknown', 'pending_intent'),
          message
        ),
      };
    case 'CLEAR_SETTINGS_PENDING_INTENT':
      return {
        type: 'SETTINGS_PENDING_INTENT_CLEAR_OUTCOME_UNKNOWN',
        dataEpoch: command.dataEpoch,
        mutationId: command.mutationId,
        commandId: command.commandId,
        error: makeError(
          contractFor('SETTINGS_TRANSPORT_ERROR', 'unknown', 'pending_intent'),
          message
        ),
      };
    case 'RECOVER_AND_LOAD_SETTINGS':
      return {
        type: 'LOAD_FAILED',
        dataEpoch: command.dataEpoch,
        requestId: command.requestId,
        commandId: command.commandId,
        error: makeError(contractFor('SETTINGS_TRANSPORT_ERROR', 'unknown', 'load'), message),
      };
    case 'RESERVE_SETTINGS_STORAGE': {
      const nextRequestId = allocateRequestId();
      if (nextRequestId === null) {
        return createSettingsCommandExecutionDeferred(command);
      }
      return {
        type: 'PROTOCOL_UNCERTAIN',
        dataEpoch: command.dataEpoch,
        mutationId: command.mutationId,
        nextRequestId,
        error: makeError(contractFor('SETTINGS_PROTOCOL_ERROR', 'unknown', 'reconcile'), message),
      };
    }
    case 'VERIFY_SETTINGS_HOST_PERMISSIONS': {
      const nextRequestId = allocateRequestId();
      if (nextRequestId === null) {
        return createSettingsCommandExecutionDeferred(command);
      }
      return {
        type: 'HOST_PERMISSIONS_OUTCOME_UNKNOWN',
        dataEpoch: command.dataEpoch,
        mutationId: command.mutationId,
        commandId: command.commandId,
        nextRequestId,
        error: makeError(
          contractFor('SETTINGS_TRANSPORT_ERROR', 'unknown', 'permission_check'),
          message
        ),
      };
    }
    case 'COMPARE_AND_SETTLE_SETTINGS': {
      const nextRequestId = allocateRequestId();
      if (nextRequestId === null) {
        return createSettingsCommandExecutionDeferred(command);
      }
      return {
        type: 'SAVE_FAILED',
        dataEpoch: command.dataEpoch,
        mutationId: command.mutationId,
        commandId: command.commandId,
        nextRequestId,
        error: makeError(contractFor('SETTINGS_TRANSPORT_ERROR', 'unknown', 'save'), message),
      };
    }
    case 'RECOVER_SETTINGS_TRANSACTION': {
      const nextRequestId = allocateRequestId();
      if (nextRequestId === null) {
        return createSettingsCommandExecutionDeferred(command);
      }
      return {
        type: 'COMPENSATION_FAILED',
        dataEpoch: command.dataEpoch,
        mutationId: command.mutationId,
        requestId: command.requestId,
        commandId: command.commandId,
        nextRequestId,
        error: makeError(contractFor('SETTINGS_TRANSPORT_ERROR', 'unknown', 'compensate'), message),
      };
    }
    case 'REBASE_SETTINGS_MUTATION': {
      const nextRequestId = allocateRequestId();
      if (nextRequestId === null) {
        return createSettingsCommandExecutionDeferred(command);
      }
      return {
        type: 'RETRY_FAILED',
        dataEpoch: command.dataEpoch,
        mutationId: command.mutationId,
        requestId: command.requestId,
        commandId: command.commandId,
        nextRequestId,
        error: makeError(contractFor('SETTINGS_TRANSPORT_ERROR', 'unknown', 'rebase'), message),
      };
    }
    case 'ABORT_SETTINGS_MUTATION': {
      const nextRequestId = allocateRequestId();
      if (nextRequestId === null) {
        return createSettingsCommandExecutionDeferred(command);
      }
      return {
        type: 'CANCEL_OUTCOME_UNKNOWN',
        dataEpoch: command.dataEpoch,
        mutationId: command.mutationId,
        requestId: command.requestId,
        commandId: command.commandId,
        nextRequestId,
        error: makeError(contractFor('SETTINGS_TRANSPORT_ERROR', 'unknown', 'cancel'), message),
      };
    }
    case 'RECONCILE_SETTINGS':
      return {
        type: 'RECONCILE_FAILED',
        dataEpoch: command.dataEpoch,
        requestId: command.requestId,
        commandId: command.commandId,
        error: makeError(contractFor('SETTINGS_TRANSPORT_ERROR', 'unknown', 'reconcile'), message),
      };
  }
}

function malformedExecutorResponseEvent(
  command: SettingsPersistenceCommand,
  allocateRequestId: () => string | null
): SettingsPersistenceRawEvent | SettingsCommandExecutionDeferredV1 {
  if (
    command.type === 'PERSIST_SETTINGS_PENDING_INTENT' ||
    command.type === 'CLEAR_SETTINGS_PENDING_INTENT'
  ) {
    return executionFailureEvent(command, allocateRequestId);
  }
  if (command.type === 'RECOVER_AND_LOAD_SETTINGS') {
    return {
      type: 'LOAD_FAILED',
      dataEpoch: command.dataEpoch,
      requestId: command.requestId,
      commandId: command.commandId,
      error: makeError(
        contractFor('SETTINGS_PROTOCOL_ERROR', 'unknown', 'load'),
        'The matching Settings Load response was malformed.'
      ),
    };
  }
  const nextRequestId = allocateRequestId();
  return nextRequestId === null
    ? createSettingsCommandExecutionDeferred(command)
    : {
        type: 'PROTOCOL_UNCERTAIN',
        dataEpoch: command.dataEpoch,
        mutationId: command.mutationId,
        nextRequestId,
        error: makeError(
          contractFor('SETTINGS_PROTOCOL_ERROR', 'unknown', 'reconcile'),
          'The matching Settings transaction response was malformed.'
        ),
      };
}

function responseMatchesCurrentCommand(
  value: unknown,
  command: SettingsPersistenceCommand
): boolean {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const field = (key: string): unknown => Object.getOwnPropertyDescriptor(value, key)?.value;
  if (field('dataEpoch') !== command.dataEpoch) {
    return false;
  }
  const responseCommandId = field('commandId');
  if (responseCommandId !== undefined && responseCommandId !== command.commandId) {
    return false;
  }
  if (field('type') === 'PROTOCOL_UNCERTAIN' && 'mutationId' in command) {
    return field('mutationId') === command.mutationId;
  }
  switch (command.type) {
    case 'PERSIST_SETTINGS_PENDING_INTENT':
      return field('mutationId') === command.pendingIntent.mutation.mutationId;
    case 'CLEAR_SETTINGS_PENDING_INTENT':
      return field('mutationId') === command.mutationId;
    case 'RECOVER_AND_LOAD_SETTINGS':
      return field('requestId') === command.requestId;
    case 'RESERVE_SETTINGS_STORAGE':
    case 'VERIFY_SETTINGS_HOST_PERMISSIONS':
    case 'COMPARE_AND_SETTLE_SETTINGS':
      return field('mutationId') === command.mutationId;
    case 'RECOVER_SETTINGS_TRANSACTION':
    case 'REBASE_SETTINGS_MUTATION':
    case 'ABORT_SETTINGS_MUTATION':
      return field('mutationId') === command.mutationId && field('requestId') === command.requestId;
    case 'RECONCILE_SETTINGS':
      return field('requestId') === command.requestId;
  }
}

export function createSettingsPersistenceCoordinator(
  dependencies: SettingsPersistenceCoordinatorDependencies
): SettingsPersistenceCoordinator {
  const controller: SettingsPersistenceController = createSettingsPersistenceController(
    dependencies.input
  );
  let stopped = false;
  let stopRequested = false;
  let stopPromise: Promise<SettingsPersistenceCoordinatorHandoffV1> | null = null;
  let queue: Promise<void> = Promise.resolve();
  const knownIds = new Set<string>();
  let executorIdentityBoundarySafe = collectUuidValues(dependencies.input, knownIds);
  executorIdentityBoundarySafe =
    collectUuidValues(controller.getSnapshot(), knownIds) && executorIdentityBoundarySafe;

  const captureExecutorIdentityBoundary = (value: unknown) => {
    const capture = captureSettingsShellEventBoundary(value);
    if (capture === null) {
      executorIdentityBoundarySafe = false;
      return null;
    }
    for (const id of capture.uuidIds) {
      knownIds.add(id);
    }
    return capture;
  };

  const allocateRequestId = (command: SettingsPersistenceCommand): string | null => {
    executorIdentityBoundarySafe =
      collectUuidValues(command, knownIds) && executorIdentityBoundarySafe;
    if (!executorIdentityBoundarySafe) {
      return null;
    }
    const source = dependencies.allocateId ?? (() => crypto.randomUUID());
    for (let attempt = 0; attempt < MAX_SETTINGS_COORDINATOR_ID_ALLOCATION_ATTEMPTS; attempt += 1) {
      let candidate: string;
      try {
        candidate = source();
      } catch {
        return null;
      }
      if (isUuidV4(candidate) && !knownIds.has(candidate)) {
        knownIds.add(candidate);
        return candidate;
      }
    }
    return null;
  };

  const dispatchStable = (rawEvent: unknown): SettingsPersistenceDispatchResult => {
    const capture = captureSettingsShellEventBoundary(rawEvent);
    if (capture === null) {
      return { status: 'rejected', reason: 'invalid_event' };
    }
    const result = controller.dispatch(capture.value);
    if (result.status === 'dispatched') {
      for (const id of capture.uuidIds) {
        knownIds.add(id);
      }
      collectUuidValues(controller.getSnapshot(), knownIds);
    }
    return result;
  };

  const pump = async (): Promise<void> => {
    if (stopped || stopRequested) {
      return;
    }
    while (!stopped) {
      if (stopRequested) {
        return;
      }
      const command = detachedCommand(controller.getSnapshot());
      if (command === null) {
        return;
      }
      collectUuidValues(command, knownIds);
      const identity = commandIdentity(command);
      let response: unknown;
      let syntheticFailure = false;
      try {
        response = await dependencies.executor.execute(command);
      } catch {
        response = executionFailureEvent(command, () => allocateRequestId(command));
        syntheticFailure = true;
      }
      const responseCapture = captureExecutorIdentityBoundary(response);
      if (responseCapture === null) {
        return;
      }
      response = responseCapture.value;
      if (isSettingsCommandExecutionDeferred(response, command)) {
        return;
      }
      let dispatchResult = dispatchStable(response);
      if (dispatchResult.status !== 'dispatched') {
        if (syntheticFailure) {
          // Fail closed and retain the exact durable command for resume/handoff.
          return;
        }
        if (!responseMatchesCurrentCommand(response, command)) {
          return;
        }
        response = malformedExecutorResponseEvent(command, () => allocateRequestId(command));
        if (isSettingsCommandExecutionDeferred(response, command)) {
          return;
        }
        dispatchResult = dispatchStable(response);
        if (dispatchResult.status !== 'dispatched') {
          return;
        }
      }
      if (stopRequested) {
        return;
      }
      const next = detachedCommand(controller.getSnapshot());
      if (next !== null && commandIdentity(next) === identity) {
        // An ambiguous set/remove or I/O outcome deliberately retains the same
        // idempotent command. Avoid a hot retry loop; resume() is the explicit
        // scheduler hook for a later attempt.
        return;
      }
    }
  };

  const schedulePump = (): Promise<void> => {
    const scheduled = queue.catch(() => undefined).then(pump);
    queue = scheduled;
    return scheduled;
  };

  // The model is created already started and exposes its initial Load/recovery
  // command synchronously, so scheduling here cannot miss startup work.
  void schedulePump();

  return {
    dispatch(rawEvent) {
      if (stopped || stopRequested) {
        return { status: 'rejected', reason: 'inactive' };
      }
      const result = dispatchStable(rawEvent);
      if (result.status === 'dispatched') {
        void schedulePump();
      }
      return result;
    },

    getSnapshot() {
      return controller.getSnapshot();
    },

    subscribe(listener) {
      return controller.subscribe(listener);
    },

    whenIdle() {
      return queue;
    },

    resume() {
      if (stopped || stopRequested) {
        return Promise.reject(
          new SettingsPersistenceCoordinatorError(
            'inactive',
            'Cannot resume a stopped Settings coordinator.'
          )
        );
      }
      return schedulePump();
    },

    stop() {
      if (stopPromise !== null) {
        return stopPromise;
      }
      stopRequested = true;
      stopPromise = queue
        .catch(() => undefined)
        .then(() => {
          const pendingCommand = detachedCommand(controller.getSnapshot());
          controller.stop();
          stopped = true;
          const view = controller.getSnapshot();
          return deepFreezeDetached({
            version: 1 as const,
            stopped: true as const,
            pendingCommand:
              pendingCommand === null ? null : deepFreezeDetached(structuredClone(pendingCommand)),
            view,
          });
        });
      return stopPromise;
    },
  };
}
