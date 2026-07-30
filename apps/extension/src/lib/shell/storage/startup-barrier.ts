import type { AppSettings } from '../../core/types/app-settings';
import {
  createDatasetStartupController,
  datasetStartupProtocolError,
  selectDatasetStartupBootstrap,
  type DatasetStartupCapacityErrorV1,
  type DatasetStartupController,
  type DatasetStartupCommand,
  type DatasetStartupErrorV1,
  type DatasetStartupResetTransferV1,
  type DatasetStartupSnapshot,
  type DeepReadonlyDatasetStartupData,
  type LocalDatasetBootstrapV1,
} from '../../../models/dataset-startup.machine';
import {
  isLocalDataResetUuidV4,
  parseLocalDataResetJournal,
  type LocalDataResetJournalV1,
} from '../../../models/local-data-reset.contract';

type StartupCommand<Type extends DatasetStartupCommand['type']> = DeepReadonlyDatasetStartupData<
  Extract<DatasetStartupCommand, { type: Type }>
>;

export interface StartupBarrierPortContext {
  readonly signal: AbortSignal;
}

type StartupBarrierPort<Type extends DatasetStartupCommand['type']> = (
  command: StartupCommand<Type>,
  context: StartupBarrierPortContext
) => Promise<unknown>;

/**
 * Imperative effects for the pure DatasetStartup controller commands.
 *
 * Every non-terminal port returns an untrusted raw controller event. The
 * controller remains the sole authority that validates the event and decides
 * the next transition.
 */
export interface StartupBarrierPorts {
  readonly readResetGate: StartupBarrierPort<'READ_RESET_GATE'>;
  readonly preflightResetRequest: StartupBarrierPort<'PREFLIGHT_RESET_REQUEST'>;
  readonly readVersions: StartupBarrierPort<'READ_VERSIONS'>;
  readonly upgradeStructure: StartupBarrierPort<'UPGRADE_STRUCTURE'>;
  readonly migrateData: StartupBarrierPort<'MIGRATE_DATA'>;
  readonly verifyCriticalAndEpoch: StartupBarrierPort<'VERIFY_CRITICAL_AND_EPOCH'>;
  readonly wrapSettingsEnvelope: StartupBarrierPort<'WRAP_SETTINGS_ENVELOPE'>;
  readonly recoverPreparedLedgers: StartupBarrierPort<'RECOVER_PREPARED_LEDGERS'>;
  readonly recoverSettingsAndAlarm: StartupBarrierPort<'RECOVER_SETTINGS_AND_ALARM'>;
  readonly openEpochAdmission: StartupBarrierPort<'OPEN_EPOCH_ADMISSION'>;
  readonly publishBootstraps: StartupBarrierPort<'PUBLISH_BOOTSTRAPS'>;
  readonly fenceStartupFailure: StartupBarrierPort<'FENCE_STARTUP_FAILURE'>;
  readonly transferResetOwnership: (
    command: StartupCommand<'TRANSFER_RESET_OWNERSHIP'>,
    context: StartupBarrierPortContext
  ) => Promise<void>;
}

export interface StartupBarrierDeps {
  readonly workerEpoch: string;
  readonly defaultSettings: AppSettings;
  readonly includedConnectorIds: readonly string[];
  readonly allocateAttemptId: () => string;
  readonly ports: StartupBarrierPorts;
}

export interface StartupTrigger {
  readonly requestId: string;
  readonly settingsRecoveryRequestId: string;
}

export interface ResetPreemption {
  readonly resetId: string;
  readonly journal: LocalDataResetJournalV1 | null;
}

interface NormalizedResetPreemption {
  readonly resetId: string;
  readonly journal: LocalDataResetJournalV1 | null;
}

export interface ResetOwnedResult {
  readonly status: 'reset_owned';
  readonly attemptId: string;
  readonly workerEpoch: string;
  readonly reset: DeepReadonlyDatasetStartupData<DatasetStartupResetTransferV1>;
}

export interface StartupBarrierSnapshot extends DatasetStartupSnapshot {
  readonly inFlight: boolean;
}

export type StartupBarrierErrorKind =
  | 'capacity_exceeded'
  | 'downgrade_blocked'
  | 'failure_fence_blocked'
  | 'invalid_request'
  | 'model_error'
  | 'reset_owned'
  | 'startup_failed';

export class StartupBarrierError extends Error {
  readonly kind: StartupBarrierErrorKind;
  readonly startupError: DeepReadonlyDatasetStartupData<DatasetStartupErrorV1> | null;
  readonly capacityError: DeepReadonlyDatasetStartupData<DatasetStartupCapacityErrorV1> | null;

  constructor(
    kind: StartupBarrierErrorKind,
    message: string,
    startupError: DeepReadonlyDatasetStartupData<DatasetStartupErrorV1> | null = null,
    capacityError: DeepReadonlyDatasetStartupData<DatasetStartupCapacityErrorV1> | null = null
  ) {
    super(message);
    this.name = 'StartupBarrierError';
    this.kind = kind;
    this.startupError = startupError;
    this.capacityError = capacityError;
  }
}

export interface StartupBarrier {
  ensureReady(trigger: StartupTrigger): Promise<LocalDatasetBootstrapV1>;
  preemptForReset(request: ResetPreemption): Promise<ResetOwnedResult>;
  snapshot(): StartupBarrierSnapshot;
}

function invalidRequest(message: string): StartupBarrierError {
  return new StartupBarrierError('invalid_request', message);
}

function rejectedDispatch(message: string): never {
  throw invalidRequest(message);
}

function dispatchOrReject(controller: DatasetStartupController, event: unknown): void {
  const result = controller.dispatch(event);
  if (result.status !== 'dispatched') {
    rejectedDispatch(`Dataset startup event rejected: ${result.reason}`);
  }
}

function normalizeResetPreemption(request: ResetPreemption): NormalizedResetPreemption | null {
  try {
    const resetId = request.resetId;
    const rawJournal = request.journal;
    if (!isLocalDataResetUuidV4(resetId)) {
      return null;
    }
    if (rawJournal === null) {
      return Object.freeze({ resetId, journal: null });
    }
    const journal = parseLocalDataResetJournal(rawJournal);
    return journal !== null && journal.resetId === resetId
      ? Object.freeze({ resetId, journal: Object.freeze(journal) })
      : null;
  } catch {
    return null;
  }
}

function sameResetPreemption(
  request: NormalizedResetPreemption,
  reset: DeepReadonlyDatasetStartupData<DatasetStartupResetTransferV1>
): boolean {
  return (
    request.resetId === reset.resetId &&
    JSON.stringify(request.journal) === JSON.stringify(reset.journal)
  );
}

function migrationFailure(value: unknown): { code: string; message: string } | null {
  try {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return null;
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      return null;
    }
    const expectedKeys = ['ok', 'code', 'message'];
    const keys = Reflect.ownKeys(value);
    if (
      keys.length !== expectedKeys.length ||
      keys.some((key) => typeof key !== 'string' || !expectedKeys.includes(key))
    ) {
      return null;
    }
    const record: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const key of expectedKeys) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (
        descriptor === undefined ||
        descriptor.enumerable !== true ||
        !Object.prototype.hasOwnProperty.call(descriptor, 'value')
      ) {
        return null;
      }
      record[key] = descriptor.value;
    }
    return record.ok === false &&
      typeof record.code === 'string' &&
      typeof record.message === 'string' &&
      record.message.trim().length > 0
      ? { code: record.code, message: record.message.slice(0, 500) }
      : null;
  } catch {
    return null;
  }
}

function technicalFailure(
  command: Exclude<
    NonNullable<DatasetStartupSnapshot['command']>,
    { type: 'REPORT_FAILURE' | 'REPORT_DOWNGRADE' | 'TRANSFER_RESET_OWNERSHIP' }
  >,
  message: string
): DatasetStartupErrorV1 {
  const codeByStage = {
    reset_gate: 'RESET_GATE_READ_FAILED',
    reset_preflight: 'RESET_PREFLIGHT_FAILED',
    versions: 'VERSION_READ_FAILED',
    structure: 'STRUCTURE_MIGRATION_FAILED',
    data: 'DATA_MIGRATION_FAILED',
    verification: 'CRITICAL_VERIFICATION_FAILED',
    settings_envelope: 'SETTINGS_ENVELOPE_FAILED',
    prepared_ledgers: 'PREPARED_RECOVERY_FAILED',
    settings_recovery: 'SETTINGS_RECOVERY_FAILED',
    admission: 'ADMISSION_FAILED',
    bootstrap: 'BOOTSTRAP_PUBLISH_FAILED',
    failure_fence: 'AUTHORITY_FENCE_FAILED',
  } as const;
  return {
    version: 1,
    code: codeByStage[command.stage],
    stage: command.stage,
    message: message.slice(0, 500) || 'Dataset startup effect failed',
    retryable: command.stage !== 'failure_fence',
    destructiveEffectPerformed: false,
  };
}

function commandFailureEvent(
  command: Exclude<
    NonNullable<DatasetStartupSnapshot['command']>,
    { type: 'REPORT_FAILURE' | 'REPORT_DOWNGRADE' | 'TRANSFER_RESET_OWNERSHIP' }
  >,
  error: DatasetStartupErrorV1
): Record<string, unknown> {
  return {
    type: 'STEP_FAILED',
    attemptId: command.attemptId,
    workerEpoch: command.workerEpoch,
    commandId: command.commandId,
    error,
  };
}

export function createStartupBarrier(deps: StartupBarrierDeps): StartupBarrier {
  const controller = createDatasetStartupController({
    workerEpoch: deps.workerEpoch,
    defaultSettings: deps.defaultSettings,
    includedConnectorIds: [...deps.includedConnectorIds],
  });
  interface Waiter {
    readonly settingsRecoveryRequestId: string;
    readonly promise: Promise<LocalDatasetBootstrapV1>;
    readonly resolve: (bootstrap: LocalDatasetBootstrapV1) => void;
    readonly reject: (reason: StartupBarrierError) => void;
  }

  interface StartReservation {
    readonly eventType: 'START' | 'RETRY';
    readonly settingsRecoveryRequestId: string;
    readonly triggers: StartupTrigger[];
  }

  const waiters = new Map<string, Waiter>();
  let startReservation: StartReservation | null = null;
  let inFlight: Promise<void> | null = null;
  let runGeneration = 0;
  let activeRunGeneration = 0;
  let activeAbortController: AbortController | null = null;
  interface ResetTransferReservation {
    readonly attemptId: string;
    readonly reset: DeepReadonlyDatasetStartupData<DatasetStartupResetTransferV1>;
    readonly promise: Promise<ResetOwnedResult>;
    readonly start: () => void;
  }

  let resetTransfer: ResetTransferReservation | null = null;

  function executeCommand(
    command: Exclude<
      NonNullable<DatasetStartupSnapshot['command']>,
      { type: 'REPORT_FAILURE' | 'REPORT_DOWNGRADE' | 'TRANSFER_RESET_OWNERSHIP' }
    >,
    context: StartupBarrierPortContext
  ): Promise<unknown> {
    switch (command.type) {
      case 'READ_RESET_GATE':
        return deps.ports.readResetGate(command, context);
      case 'PREFLIGHT_RESET_REQUEST':
        return deps.ports.preflightResetRequest(command, context);
      case 'READ_VERSIONS':
        return deps.ports.readVersions(command, context);
      case 'UPGRADE_STRUCTURE':
        return deps.ports.upgradeStructure(command, context);
      case 'MIGRATE_DATA':
        return deps.ports.migrateData(command, context);
      case 'VERIFY_CRITICAL_AND_EPOCH':
        return deps.ports.verifyCriticalAndEpoch(command, context);
      case 'WRAP_SETTINGS_ENVELOPE':
        return deps.ports.wrapSettingsEnvelope(command, context);
      case 'RECOVER_PREPARED_LEDGERS':
        return deps.ports.recoverPreparedLedgers(command, context);
      case 'RECOVER_SETTINGS_AND_ALARM':
        return deps.ports.recoverSettingsAndAlarm(command, context);
      case 'OPEN_EPOCH_ADMISSION':
        return deps.ports.openEpochAdmission(command, context);
      case 'PUBLISH_BOOTSTRAPS':
        return deps.ports.publishBootstraps(command, context);
      case 'FENCE_STARTUP_FAILURE':
        return deps.ports.fenceStartupFailure(command, context);
    }
  }

  function sameCommand(
    left: DatasetStartupSnapshot['command'],
    right: DatasetStartupSnapshot['command']
  ): boolean {
    return left !== null && right !== null && JSON.stringify(left) === JSON.stringify(right);
  }

  function resetOwnedError(message: string): StartupBarrierError {
    return new StartupBarrierError('reset_owned', message);
  }

  function reserveResetTransfer(
    command: StartupCommand<'TRANSFER_RESET_OWNERSHIP'>
  ): ResetTransferReservation {
    if (
      resetTransfer !== null &&
      resetTransfer.attemptId === command.attemptId &&
      resetTransfer.reset.resetId === command.reset.resetId
    ) {
      return resetTransfer;
    }
    const abortController = new AbortController();
    let started = false;
    let resolveTransfer!: (result: ResetOwnedResult) => void;
    let rejectTransfer!: (reason: StartupBarrierError) => void;
    const execution = new Promise<ResetOwnedResult>((resolve, reject) => {
      resolveTransfer = resolve;
      rejectTransfer = reject;
    });
    const promise = execution.finally(() => {
      if (activeAbortController === abortController) {
        activeAbortController = null;
      }
    });
    const start = (): void => {
      if (started) {
        return;
      }
      started = true;
      activeAbortController = abortController;
      try {
        void deps.ports.transferResetOwnership(command, { signal: abortController.signal }).then(
          () => {
            resolveTransfer(
              Object.freeze({
                status: 'reset_owned',
                attemptId: command.attemptId,
                workerEpoch: command.workerEpoch,
                reset: command.reset,
              })
            );
          },
          (cause: unknown) => {
            const message =
              cause instanceof Error ? cause.message : 'Dataset reset ownership transfer failed';
            rejectTransfer(resetOwnedError(message));
          }
        );
      } catch (cause) {
        const message =
          cause instanceof Error ? cause.message : 'Dataset reset ownership transfer failed';
        rejectTransfer(resetOwnedError(message));
      }
    };
    const reservation = Object.freeze({
      attemptId: command.attemptId,
      reset: command.reset,
      promise,
      start,
    });
    resetTransfer = reservation;
    return reservation;
  }

  function transferReset(
    command: StartupCommand<'TRANSFER_RESET_OWNERSHIP'>
  ): Promise<ResetOwnedResult> {
    const reservation = reserveResetTransfer(command);
    reservation.start();
    return reservation.promise;
  }

  function rejectAll(error: StartupBarrierError): void {
    const pending = [...waiters.values()];
    waiters.clear();
    for (const waiter of pending) {
      waiter.reject(error);
    }
  }

  function rejectWaiter(requestId: string, error: StartupBarrierError): void {
    const waiter = waiters.get(requestId);
    if (waiter === undefined) {
      return;
    }
    waiters.delete(requestId);
    waiter.reject(error);
  }

  function dispatchError(
    result: ReturnType<DatasetStartupController['dispatch']>,
    label: string
  ): StartupBarrierError | null {
    if (result.status === 'dispatched') {
      return null;
    }
    if (result.reason === 'capacity_exceeded') {
      return new StartupBarrierError(
        'capacity_exceeded',
        `Dataset startup publication is limited to ${result.error.maxBatchSize} callers`,
        null,
        result.error
      );
    }
    return invalidRequest(`${label} rejected: ${result.reason}`);
  }

  function resolveAllReady(): void {
    const snapshot = controller.getSnapshot();
    const pending = [...waiters.entries()];
    waiters.clear();
    for (const [requestId, waiter] of pending) {
      const bootstrap = selectDatasetStartupBootstrap(snapshot, requestId);
      if (bootstrap === null) {
        waiter.reject(
          invalidRequest(`Dataset startup reached ready without bootstrap ${requestId}`)
        );
      } else {
        waiter.resolve({ ...bootstrap });
      }
    }
  }

  async function drive(): Promise<void> {
    for (;;) {
      const snapshot = controller.getSnapshot();
      const command = snapshot.command;
      if (snapshot.state === 'ready') {
        return;
      }
      if (command === null) {
        throw invalidRequest(`Dataset startup has no executable command in ${snapshot.state}`);
      }
      if (command.type === 'REPORT_FAILURE') {
        throw new StartupBarrierError(
          snapshot.state === 'failureFenceBlocked' ? 'failure_fence_blocked' : 'startup_failed',
          command.error.message,
          command.error
        );
      }
      if (command.type === 'REPORT_DOWNGRADE') {
        throw new StartupBarrierError('downgrade_blocked', command.error.message, command.error);
      }
      if (command.type === 'TRANSFER_RESET_OWNERSHIP') {
        await transferReset(command);
        throw resetOwnedError(
          `Dataset startup ownership transferred to reset ${command.reset.resetId}`
        );
      }

      const abortController = new AbortController();
      activeAbortController = abortController;
      let event: unknown;
      try {
        try {
          event = await executeCommand(command, { signal: abortController.signal });
        } catch (cause) {
          const current = controller.getSnapshot();
          if (current.state === 'resetOwned') {
            return;
          }
          if (!sameCommand(current.command, command)) {
            continue;
          }
          const message = cause instanceof Error ? cause.message : 'Dataset startup effect failed';
          dispatchOrReject(
            controller,
            commandFailureEvent(command, technicalFailure(command, message))
          );
          continue;
        }
      } finally {
        if (activeAbortController === abortController) {
          activeAbortController = null;
        }
      }
      const current = controller.getSnapshot();
      if (current.state === 'resetOwned') {
        return;
      }
      if (!sameCommand(current.command, command)) {
        continue;
      }
      const result = controller.dispatch(event);
      if (result.status === 'dispatched') {
        continue;
      }
      const failedMigration =
        command.type === 'UPGRADE_STRUCTURE' || command.type === 'MIGRATE_DATA'
          ? migrationFailure(event)
          : null;
      const error =
        failedMigration === null
          ? datasetStartupProtocolError(
              command.stage,
              `Invalid Dataset startup response for ${command.type}`
            )
          : technicalFailure(command, failedMigration.message);
      dispatchOrReject(controller, commandFailureEvent(command, error));
    }
  }

  function waiterFor(settingsRecoveryRequestId: string): Waiter {
    let resolve!: (bootstrap: LocalDatasetBootstrapV1) => void;
    let reject!: (reason: StartupBarrierError) => void;
    const promise = new Promise<LocalDatasetBootstrapV1>((onResolve, onReject) => {
      resolve = onResolve;
      reject = onReject;
    });
    return Object.freeze({ settingsRecoveryRequestId, promise, resolve, reject });
  }

  function terminalError(snapshot: DatasetStartupSnapshot): StartupBarrierError | null {
    if (snapshot.state === 'fencingFailure') {
      return new StartupBarrierError(
        'startup_failed',
        snapshot.error?.message ?? 'Dataset startup authority fence is pending',
        snapshot.error
      );
    }
    if (snapshot.state === 'failureFenceBlocked') {
      return new StartupBarrierError(
        'failure_fence_blocked',
        snapshot.fenceError?.message ?? 'Dataset startup authority fence is unresolved',
        snapshot.fenceError
      );
    }
    if (snapshot.state === 'resetOwned') {
      return resetOwnedError('Dataset startup ownership belongs to reset');
    }
    if (snapshot.state === 'downgradeBlocked') {
      return new StartupBarrierError(
        'downgrade_blocked',
        snapshot.error?.message ?? 'Dataset startup downgrade is blocked',
        snapshot.error
      );
    }
    if (snapshot.state === 'modelError') {
      return new StartupBarrierError(
        'model_error',
        snapshot.error?.message ?? 'Dataset startup model input is invalid',
        snapshot.error
      );
    }
    return null;
  }

  function startDriver(): void {
    if (inFlight !== null) {
      return;
    }
    const generation = ++runGeneration;
    activeRunGeneration = generation;
    let finishReservation!: () => void;
    const reservation = new Promise<void>((resolve) => {
      finishReservation = resolve;
    });
    const tracked = reservation.finally(() => {
      if (activeRunGeneration === generation) {
        inFlight = null;
        activeRunGeneration = 0;
      }
    });
    inFlight = tracked;
    void (async () => {
      try {
        await drive();
        if (activeRunGeneration === generation) {
          inFlight = null;
        }
        resolveAllReady();
      } catch (cause: unknown) {
        if (activeRunGeneration === generation) {
          inFlight = null;
        }
        const error =
          cause instanceof StartupBarrierError
            ? cause
            : invalidRequest(cause instanceof Error ? cause.message : 'Dataset startup failed');
        rejectAll(error);
      } finally {
        finishReservation();
      }
    })();
  }

  function ensureReady(trigger: StartupTrigger): Promise<LocalDatasetBootstrapV1> {
    const duplicate = waiters.get(trigger.requestId);
    if (duplicate !== undefined) {
      return duplicate.settingsRecoveryRequestId === trigger.settingsRecoveryRequestId
        ? duplicate.promise
        : Promise.reject(
            invalidRequest('Duplicate Dataset startup request has a foreign recovery identity')
          );
    }
    if (startReservation !== null) {
      if (trigger.settingsRecoveryRequestId !== startReservation.settingsRecoveryRequestId) {
        return Promise.reject(
          invalidRequest('Dataset startup request has a foreign recovery identity')
        );
      }
      const waiter = waiterFor(trigger.settingsRecoveryRequestId);
      waiters.set(trigger.requestId, waiter);
      startReservation.triggers.push(trigger);
      return waiter.promise;
    }
    const before = controller.getSnapshot();
    const terminal = terminalError(before);
    if (terminal !== null) {
      return Promise.reject(terminal);
    }
    let attemptId = before.attemptId;
    if (before.state === 'idle' || before.state === 'failed') {
      const waiter = waiterFor(trigger.settingsRecoveryRequestId);
      waiters.set(trigger.requestId, waiter);
      const reservation: StartReservation = {
        eventType: before.state === 'failed' ? 'RETRY' : 'START',
        settingsRecoveryRequestId: trigger.settingsRecoveryRequestId,
        triggers: [trigger],
      };
      startReservation = reservation;
      try {
        attemptId = deps.allocateAttemptId();
      } catch (cause) {
        const error = invalidRequest(
          cause instanceof Error ? cause.message : 'Attempt allocation failed'
        );
        startReservation = null;
        for (const reservedTrigger of reservation.triggers) {
          rejectWaiter(reservedTrigger.requestId, error);
        }
        return waiter.promise;
      }
      const [initialTrigger, ...joinedTriggers] = reservation.triggers;
      const initialResult = controller.dispatch({
        type: reservation.eventType,
        attemptId,
        workerEpoch: deps.workerEpoch,
        requestId: initialTrigger.requestId,
        settingsRecoveryRequestId: initialTrigger.settingsRecoveryRequestId,
      });
      const initialError = dispatchError(initialResult, 'Dataset startup event');
      if (initialError !== null) {
        startReservation = null;
        for (const reservedTrigger of reservation.triggers) {
          rejectWaiter(reservedTrigger.requestId, initialError);
        }
        return waiter.promise;
      }
      for (const joinedTrigger of joinedTriggers) {
        const joinedResult = controller.dispatch({
          type: 'START',
          attemptId,
          workerEpoch: deps.workerEpoch,
          requestId: joinedTrigger.requestId,
          settingsRecoveryRequestId: joinedTrigger.settingsRecoveryRequestId,
        });
        const joinedError = dispatchError(joinedResult, 'Dataset startup event');
        if (joinedError !== null) {
          rejectWaiter(joinedTrigger.requestId, joinedError);
        }
      }
      startReservation = null;
      startDriver();
      return waiter.promise;
    }
    if (attemptId === null) {
      return Promise.reject(invalidRequest('Dataset startup attempt identity is unavailable'));
    }
    const result = controller.dispatch({
      type: 'START',
      attemptId,
      workerEpoch: deps.workerEpoch,
      requestId: trigger.requestId,
      settingsRecoveryRequestId: trigger.settingsRecoveryRequestId,
    });
    const error = dispatchError(result, 'Dataset startup event');
    if (error !== null) {
      return Promise.reject(error);
    }
    const waiter = waiterFor(trigger.settingsRecoveryRequestId);
    waiters.set(trigger.requestId, waiter);
    startDriver();
    return waiter.promise;
  }

  return Object.freeze({
    ensureReady,
    async preemptForReset(request: ResetPreemption): Promise<ResetOwnedResult> {
      const normalized = normalizeResetPreemption(request);
      if (normalized === null) {
        throw invalidRequest('Dataset reset preemption request is invalid');
      }
      if (resetTransfer !== null) {
        if (sameResetPreemption(normalized, resetTransfer.reset)) {
          return resetTransfer.promise;
        }
        throw invalidRequest('Dataset reset preemption does not match the active transfer');
      }
      const before = controller.getSnapshot();
      if (before.attemptId === null) {
        throw invalidRequest('Dataset startup has no attempt to preempt');
      }
      const startupAbortController = activeAbortController;
      const result = controller.dispatch({
        type: 'RESET_PREEMPTED',
        attemptId: before.attemptId,
        workerEpoch: before.workerEpoch,
        resetId: normalized.resetId,
        journal: normalized.journal,
      });
      if (result.status !== 'dispatched') {
        throw invalidRequest(`Dataset reset preemption rejected: ${result.reason}`);
      }
      const after = controller.getSnapshot();
      const command = after.command;
      if (command?.type !== 'TRANSFER_RESET_OWNERSHIP') {
        throw invalidRequest('Dataset reset preemption produced no transfer command');
      }
      const transfer = reserveResetTransfer(command);
      startupAbortController?.abort();
      const error = resetOwnedError(
        `Dataset startup ownership transferred to reset ${command.reset.resetId}`
      );
      rejectAll(error);
      inFlight = null;
      activeRunGeneration = 0;
      transfer.start();
      return transfer.promise;
    },
    snapshot(): StartupBarrierSnapshot {
      return Object.freeze({ ...controller.getSnapshot(), inFlight: inFlight !== null });
    },
  });
}
