import { describe, expect, it, vi } from 'vitest';

import type { AppSettings } from '../../../src/lib/core/types/app-settings';
import {
  SETTINGS_PENDING_INTENT_STORAGE_KEY,
  contractFor,
  expectedAlarm,
  makeError,
  settingsDigest,
  type SettingsEnvelopeV2,
  type SettingsPersistenceCommand,
  type SettingsPersistenceInput,
  type SettingsPersistenceRawEvent,
} from '../../../src/models/settings-persistence.contract';
import {
  createSettingsPersistenceCoordinator,
  type SettingsCommandExecutorPort,
} from '../../../src/lib/shell/settings/settings-persistence.coordinator';

const uuid = (suffix: number): string =>
  `92000000-0000-4000-8000-${String(suffix).padStart(12, '0')}`;
const DATA_EPOCH = uuid(1);
const WORKER_EPOCH = uuid(2);
const SETTINGS: AppSettings = {
  scanIntervalMinutes: 30,
  enabledConnectors: ['free-work'],
  notifications: true,
  autoScan: true,
  maxSemanticPerScan: 10,
  notificationScoreThreshold: 70,
  respectRateLimits: true,
  customDelayMs: 0,
  theme: 'system',
};

function input(): SettingsPersistenceInput {
  return {
    dataEpoch: DATA_EPOCH,
    workerEpoch: WORKER_EPOCH,
    defaultSettings: SETTINGS,
    includedConnectorIds: ['free-work'],
    permissionOriginsByConnectorId: { 'free-work': ['https://www.free-work.com/*'] },
    initialLoadRequestId: uuid(3),
    coldStartSeed: null,
  };
}

function settledEnvelope(): SettingsEnvelopeV2 {
  return {
    version: 2,
    dataEpoch: DATA_EPOCH,
    revision: 0,
    generation: 0,
    settings: SETTINGS,
    journal: null,
    outcomes: [],
  };
}

function loadSuccess(
  command: Extract<SettingsPersistenceCommand, { type: 'RECOVER_AND_LOAD_SETTINGS' }>
): SettingsPersistenceRawEvent {
  const envelope = settledEnvelope();
  return {
    type: 'LOAD_SUCCEEDED',
    dataEpoch: DATA_EPOCH,
    requestId: command.requestId,
    commandId: command.commandId,
    snapshot: {
      version: 1,
      dataEpoch: DATA_EPOCH,
      requestId: command.requestId,
      commandId: command.commandId,
      resetJournalAbsent: true,
      envelope,
      alarmProof: {
        ...expectedAlarm(SETTINGS),
        dataEpoch: DATA_EPOCH,
        envelopeRevision: 0,
        envelopeGeneration: 0,
        settingsDigest: settingsDigest(SETTINGS),
        proofId: uuid(4),
        requestId: command.requestId,
        commandId: command.commandId,
      },
    },
  };
}

class FailureExecutor implements SettingsCommandExecutorPort {
  readonly commands: SettingsPersistenceCommand[] = [];

  async execute(command: SettingsPersistenceCommand): Promise<unknown> {
    this.commands.push(command);
    if (command.type === 'RECOVER_AND_LOAD_SETTINGS') {
      return loadSuccess(command);
    }
    if (command.type === 'PERSIST_SETTINGS_PENDING_INTENT') {
      return {
        type: 'SETTINGS_PENDING_INTENT_PERSIST_FAILED',
        dataEpoch: command.dataEpoch,
        mutationId: command.pendingIntent.mutation.mutationId,
        commandId: command.commandId,
        proof: {
          version: 1,
          kind: 'SETTINGS_PENDING_INTENT_ABSENT',
          storageArea: 'session',
          storageKey: SETTINGS_PENDING_INTENT_STORAGE_KEY,
          dataEpoch: command.dataEpoch,
          mutationId: command.pendingIntent.mutation.mutationId,
          originWorkerEpoch: command.pendingIntent.originWorkerEpoch,
          intentRevision: 1,
          intentDigest: command.intentDigest,
          commandId: command.commandId,
          proofId: uuid(40),
          absenceReadBackVerified: true,
        },
        error: makeError(
          contractFor('SETTINGS_STORAGE_FAILED', 'previous', 'pending_intent'),
          'Pending intent could not be persisted.'
        ),
      } satisfies SettingsPersistenceRawEvent;
    }
    throw new Error(`Unexpected command: ${command.type}`);
  }
}

class ThrowingLoadExecutor implements SettingsCommandExecutorPort {
  async execute(): Promise<unknown> {
    throw new Error('transport failed');
  }
}

class ThrowingReservationExecutor implements SettingsCommandExecutorPort {
  readonly commands: SettingsPersistenceCommand[] = [];

  async execute(command: SettingsPersistenceCommand): Promise<unknown> {
    this.commands.push(command);
    if (command.type === 'RECOVER_AND_LOAD_SETTINGS') {
      return loadSuccess(command);
    }
    if (command.type === 'PERSIST_SETTINGS_PENDING_INTENT') {
      return {
        type: 'SETTINGS_PENDING_INTENT_PERSISTED',
        dataEpoch: command.dataEpoch,
        mutationId: command.pendingIntent.mutation.mutationId,
        commandId: command.commandId,
        proof: {
          version: 1,
          kind: 'SETTINGS_PENDING_INTENT_PERSISTED',
          storageArea: 'session',
          storageKey: SETTINGS_PENDING_INTENT_STORAGE_KEY,
          dataEpoch: command.dataEpoch,
          mutationId: command.pendingIntent.mutation.mutationId,
          originWorkerEpoch: command.pendingIntent.originWorkerEpoch,
          intentRevision: command.intentRevision,
          intentDigest: command.intentDigest,
          commandId: command.commandId,
          proofId: uuid(70),
          readBackVerified: true,
        },
      } satisfies SettingsPersistenceRawEvent;
    }
    if (command.type === 'RESERVE_SETTINGS_STORAGE') {
      throw new Error('global authority unavailable');
    }
    throw new Error(`Unexpected command: ${command.type}`);
  }
}

class DeferredPersistExecutor implements SettingsCommandExecutorPort {
  readonly commands: SettingsPersistenceCommand[] = [];
  readonly persistStarted: Promise<void>;
  private markPersistStarted!: () => void;
  private settlePersist: ((response: unknown) => void) | null = null;

  constructor() {
    this.persistStarted = new Promise((resolve) => {
      this.markPersistStarted = resolve;
    });
  }

  async execute(command: SettingsPersistenceCommand): Promise<unknown> {
    this.commands.push(command);
    if (command.type === 'RECOVER_AND_LOAD_SETTINGS') {
      return loadSuccess(command);
    }
    if (command.type === 'PERSIST_SETTINGS_PENDING_INTENT') {
      this.markPersistStarted();
      return new Promise((resolve) => {
        this.settlePersist = resolve;
      });
    }
    throw new Error(`Unexpected command after stop request: ${command.type}`);
  }

  resolvePersist(): void {
    const command = this.commands.at(-1);
    if (command?.type !== 'PERSIST_SETTINGS_PENDING_INTENT' || this.settlePersist === null) {
      throw new Error('persist command was not started');
    }
    this.settlePersist({
      type: 'SETTINGS_PENDING_INTENT_PERSISTED',
      dataEpoch: command.dataEpoch,
      mutationId: command.pendingIntent.mutation.mutationId,
      commandId: command.commandId,
      proof: {
        version: 1,
        kind: 'SETTINGS_PENDING_INTENT_PERSISTED',
        storageArea: 'session',
        storageKey: SETTINGS_PENDING_INTENT_STORAGE_KEY,
        dataEpoch: command.dataEpoch,
        mutationId: command.pendingIntent.mutation.mutationId,
        originWorkerEpoch: command.pendingIntent.originWorkerEpoch,
        intentRevision: command.intentRevision,
        intentDigest: command.intentDigest,
        commandId: command.commandId,
        proofId: uuid(50),
        readBackVerified: true,
      },
    } satisfies SettingsPersistenceRawEvent);
  }
}

class ReservationFailureExecutor implements SettingsCommandExecutorPort {
  readonly commands: SettingsPersistenceCommand[] = [];
  private persistCount = 0;

  constructor(
    private readonly reservationResponse:
      | ((
          command: Extract<SettingsPersistenceCommand, { type: 'RESERVE_SETTINGS_STORAGE' }>
        ) => unknown)
      | null = null
  ) {}

  async execute(command: SettingsPersistenceCommand): Promise<unknown> {
    this.commands.push(command);
    if (command.type === 'RECOVER_AND_LOAD_SETTINGS') {
      return loadSuccess(command);
    }
    if (command.type === 'PERSIST_SETTINGS_PENDING_INTENT') {
      this.persistCount += 1;
      if (this.persistCount > 1) {
        return {
          type: 'SETTINGS_PENDING_INTENT_PERSIST_OUTCOME_UNKNOWN',
          dataEpoch: command.dataEpoch,
          mutationId: command.pendingIntent.mutation.mutationId,
          commandId: command.commandId,
          error: makeError(
            contractFor('SETTINGS_TRANSPORT_ERROR', 'unknown', 'pending_intent'),
            'ambiguous reconciliation intent persist'
          ),
        } satisfies SettingsPersistenceRawEvent;
      }
      return {
        type: 'SETTINGS_PENDING_INTENT_PERSISTED',
        dataEpoch: command.dataEpoch,
        mutationId: command.pendingIntent.mutation.mutationId,
        commandId: command.commandId,
        proof: {
          version: 1,
          kind: 'SETTINGS_PENDING_INTENT_PERSISTED',
          storageArea: 'session',
          storageKey: SETTINGS_PENDING_INTENT_STORAGE_KEY,
          dataEpoch: command.dataEpoch,
          mutationId: command.pendingIntent.mutation.mutationId,
          originWorkerEpoch: command.pendingIntent.originWorkerEpoch,
          intentRevision: command.intentRevision,
          intentDigest: command.intentDigest,
          commandId: command.commandId,
          proofId: uuid(80),
          readBackVerified: true,
        },
      } satisfies SettingsPersistenceRawEvent;
    }
    if (command.type === 'RESERVE_SETTINGS_STORAGE') {
      if (this.reservationResponse !== null) {
        return this.reservationResponse(command);
      }
      throw new Error('reservation transport failed');
    }
    throw new Error(`Unexpected command: ${command.type}`);
  }
}

class MalformedCompareExecutor implements SettingsCommandExecutorPort {
  readonly commands: SettingsPersistenceCommand[] = [];
  private persistCount = 0;
  private reconcileCount = 0;

  async execute(command: SettingsPersistenceCommand): Promise<unknown> {
    this.commands.push(command);
    if (command.type === 'RECOVER_AND_LOAD_SETTINGS') {
      return loadSuccess(command);
    }
    if (command.type === 'PERSIST_SETTINGS_PENDING_INTENT') {
      this.persistCount += 1;
      return {
        type: 'SETTINGS_PENDING_INTENT_PERSISTED',
        dataEpoch: command.dataEpoch,
        mutationId: command.pendingIntent.mutation.mutationId,
        commandId: command.commandId,
        proof: {
          version: 1,
          kind: 'SETTINGS_PENDING_INTENT_PERSISTED',
          storageArea: 'session',
          storageKey: SETTINGS_PENDING_INTENT_STORAGE_KEY,
          dataEpoch: command.dataEpoch,
          mutationId: command.pendingIntent.mutation.mutationId,
          originWorkerEpoch: command.pendingIntent.originWorkerEpoch,
          intentRevision: command.intentRevision,
          intentDigest: command.intentDigest,
          commandId: command.commandId,
          proofId: uuid(300 + this.persistCount),
          readBackVerified: true,
        },
      } satisfies SettingsPersistenceRawEvent;
    }
    if (command.type === 'RESERVE_SETTINGS_STORAGE') {
      const bytesInUse = command.byteProjection.currentSettingsEntryBytes;
      const quotaBytes =
        bytesInUse +
        command.byteProjection.requiredAdditionalBytes +
        command.byteProjection.systemReserveBytes +
        10_000;
      return {
        type: 'STORAGE_RESERVATION_GRANTED',
        dataEpoch: command.dataEpoch,
        mutationId: command.mutationId,
        commandId: command.commandId,
        proof: {
          version: 1,
          kind: 'CHROME_LOCAL_SETTINGS_RESERVATION',
          storageArea: 'local',
          settingsKey: 'settings',
          dataEpoch: command.dataEpoch,
          mutationId: command.mutationId,
          commandDigest: command.commandDigest,
          baseRevision: command.baseRevision,
          baseGeneration: command.baseGeneration,
          reservationId: command.reservationId,
          gateLeaseId: uuid(320),
          proofId: uuid(321),
          quotaBytes,
          bytesInUse,
          currentSettingsEntryBytes: command.byteProjection.currentSettingsEntryBytes,
          reservedSettingsEntryBytes: command.byteProjection.reservedSettingsEntryBytes,
          requiredAdditionalBytes: command.byteProjection.requiredAdditionalBytes,
          systemReserveBytes: command.byteProjection.systemReserveBytes,
          resetReceiptReserveBytes: command.byteProjection.resetReceiptReserveBytes,
          availableAfterReservationBytes:
            quotaBytes - bytesInUse - command.byteProjection.requiredAdditionalBytes,
          reservationActive: true,
          allLocalWritersFenced: true,
          resetJournalAbsent: true,
        },
      } satisfies SettingsPersistenceRawEvent;
    }
    if (command.type === 'COMPARE_AND_SETTLE_SETTINGS') {
      return {
        type: 'SAVE_SUCCEEDED',
        dataEpoch: command.dataEpoch,
        mutationId: command.mutationId,
        commandId: command.commandId,
        snapshot: {},
      };
    }
    if (command.type === 'RECONCILE_SETTINGS') {
      this.reconcileCount += 1;
      if (this.reconcileCount === 1) {
        return {
          type: 'PROTOCOL_UNCERTAIN',
          dataEpoch: command.dataEpoch,
          mutationId: command.mutationId,
          nextRequestId: uuid(600),
          error: makeError(
            contractFor('SETTINGS_PROTOCOL_ERROR', 'unknown', 'reconcile'),
            'matching but malformed protocol response'
          ),
          extra: true,
        };
      }
      throw new Error('stop after observing reconciliation command');
    }
    throw new Error(`Unexpected command: ${command.type}`);
  }
}

function mutationEvent(): SettingsPersistenceRawEvent {
  const mutationId = uuid(60);
  const permissionCheckId = uuid(61);
  const activationId = uuid(62);
  const storageReservationId = uuid(63);
  return {
    type: 'MUTATE',
    dataEpoch: DATA_EPOCH,
    mutationId,
    permissionCheckId,
    activationId,
    storageReservationId,
    activationResult: {
      version: 1,
      kind: 'SETTINGS_ACTIVATION_CONSUMED',
      dataEpoch: DATA_EPOCH,
      workerEpoch: WORKER_EPOCH,
      mutationId,
      permissionCheckId,
      activationId,
      storageReservationId,
      issuedAtMs: 1_000,
      expiresAtMs: 301_000,
      observedAtMs: 2_000,
      resultId: uuid(64),
      oneShotConsumed: true,
    },
    key: 'theme',
    candidate: 'dark',
  };
}

describe('settings persistence coordinator', () => {
  it('maps executor exceptions to modeled failure events without rejecting the pump', async () => {
    const coordinator = createSettingsPersistenceCoordinator({
      input: input(),
      executor: new ThrowingLoadExecutor(),
    });

    await expect(coordinator.whenIdle()).resolves.toBeUndefined();

    expect(coordinator.getSnapshot()).toMatchObject({
      state: 'loadError',
      error: { code: 'SETTINGS_TRANSPORT_ERROR', operation: 'load' },
    });
  });

  it('bounds fresh-ID allocation and retains the exact command when identity space is exhausted', async () => {
    const executor = new ThrowingReservationExecutor();
    let allocationAttempts = 0;
    const coordinator = createSettingsPersistenceCoordinator({
      input: input(),
      executor,
      allocateId: () => {
        allocationAttempts += 1;
        return DATA_EPOCH;
      },
    });
    await coordinator.whenIdle();
    const mutationId = uuid(80);
    const permissionCheckId = uuid(81);
    const activationId = uuid(82);
    const storageReservationId = uuid(83);
    const activationResultId = uuid(84);

    expect(
      coordinator.dispatch({
        type: 'MUTATE',
        dataEpoch: DATA_EPOCH,
        mutationId,
        permissionCheckId,
        activationId,
        storageReservationId,
        activationResult: {
          version: 1,
          kind: 'SETTINGS_ACTIVATION_CONSUMED',
          dataEpoch: DATA_EPOCH,
          workerEpoch: WORKER_EPOCH,
          mutationId,
          permissionCheckId,
          activationId,
          storageReservationId,
          issuedAtMs: 1_000,
          expiresAtMs: 301_000,
          observedAtMs: 2_000,
          resultId: activationResultId,
          oneShotConsumed: true,
        },
        key: 'theme',
        candidate: 'dark',
      })
    ).toEqual({ status: 'dispatched' });
    await coordinator.whenIdle();

    expect(allocationAttempts).toBe(128);
    expect(coordinator.getSnapshot()).toMatchObject({
      state: 'reserving',
      command: { type: 'RESERVE_SETTINGS_STORAGE', mutationId },
    });
    await coordinator.resume();
    expect(allocationAttempts).toBe(256);
    expect(coordinator.getSnapshot()).toMatchObject({
      state: 'reserving',
      command: { type: 'RESERVE_SETTINGS_STORAGE', mutationId },
    });
    const handoff = await coordinator.stop();
    expect(handoff.pendingCommand).toMatchObject({
      type: 'RESERVE_SETTINGS_STORAGE',
      mutationId,
    });
  });

  it('executes the initial command serially and exposes only the model public view', async () => {
    const executor = new FailureExecutor();
    const coordinator = createSettingsPersistenceCoordinator({ input: input(), executor });

    expect(coordinator.getSnapshot()).toMatchObject({
      state: 'loading',
      editingDisabled: true,
      confirmedSettings: null,
    });

    await coordinator.whenIdle();

    expect(executor.commands.map((command) => command.type)).toEqual(['RECOVER_AND_LOAD_SETTINGS']);
    expect(coordinator.getSnapshot()).toMatchObject({
      state: 'saved',
      saveStatus: 'saved',
      confirmedSettings: SETTINGS,
    });
  });

  it('keeps confirmed settings unchanged when a projected candidate fails before admission', async () => {
    const executor = new FailureExecutor();
    const coordinator = createSettingsPersistenceCoordinator({ input: input(), executor });
    await coordinator.whenIdle();
    const mutationId = uuid(10);
    const permissionCheckId = uuid(11);
    const activationId = uuid(12);
    const storageReservationId = uuid(13);
    const activationResultId = uuid(14);

    const dispatch = coordinator.dispatch({
      type: 'MUTATE',
      dataEpoch: DATA_EPOCH,
      mutationId,
      permissionCheckId,
      activationId,
      storageReservationId,
      activationResult: {
        version: 1,
        kind: 'SETTINGS_ACTIVATION_CONSUMED',
        dataEpoch: DATA_EPOCH,
        workerEpoch: WORKER_EPOCH,
        mutationId,
        permissionCheckId,
        activationId,
        storageReservationId,
        issuedAtMs: 1_000,
        expiresAtMs: 301_000,
        observedAtMs: 2_000,
        resultId: activationResultId,
        oneShotConsumed: true,
      },
      key: 'theme',
      candidate: 'dark',
    });

    expect(dispatch).toEqual({ status: 'dispatched' });
    expect(coordinator.getSnapshot()).toMatchObject({
      state: 'persistingIntent',
      saveStatus: 'saving',
      confirmedSettings: { theme: 'system' },
      projectedSettings: { theme: 'dark' },
    });

    await coordinator.whenIdle();

    expect(coordinator.getSnapshot()).toMatchObject({
      state: 'failed',
      saveStatus: 'failed',
      confirmedSettings: { theme: 'system' },
      error: { code: 'SETTINGS_STORAGE_FAILED', operation: 'pending_intent' },
    });
  });

  it('drains the in-flight effect on stop and hands off the next durable command without cancellation', async () => {
    const executor = new DeferredPersistExecutor();
    const coordinator = createSettingsPersistenceCoordinator({ input: input(), executor });
    await coordinator.whenIdle();
    const mutationId = uuid(60);
    const permissionCheckId = uuid(61);
    const activationId = uuid(62);
    const storageReservationId = uuid(63);
    const activationResultId = uuid(64);
    expect(
      coordinator.dispatch({
        type: 'MUTATE',
        dataEpoch: DATA_EPOCH,
        mutationId,
        permissionCheckId,
        activationId,
        storageReservationId,
        activationResult: {
          version: 1,
          kind: 'SETTINGS_ACTIVATION_CONSUMED',
          dataEpoch: DATA_EPOCH,
          workerEpoch: WORKER_EPOCH,
          mutationId,
          permissionCheckId,
          activationId,
          storageReservationId,
          issuedAtMs: 1_000,
          expiresAtMs: 301_000,
          observedAtMs: 2_000,
          resultId: activationResultId,
          oneShotConsumed: true,
        },
        key: 'theme',
        candidate: 'dark',
      })
    ).toEqual({ status: 'dispatched' });
    await executor.persistStarted;

    const stopping = coordinator.stop();
    executor.resolvePersist();
    const handoff = await stopping;

    expect(executor.commands.map((command) => command.type)).toEqual([
      'RECOVER_AND_LOAD_SETTINGS',
      'PERSIST_SETTINGS_PENDING_INTENT',
    ]);
    expect(handoff.pendingCommand?.type).toBe('RESERVE_SETTINGS_STORAGE');
    expect(handoff.view).toMatchObject({ lifecycle: 'stopped', state: 'reserving' });
    expect(Object.isFrozen(handoff)).toBe(true);
    expect(Object.isFrozen(handoff.pendingCommand)).toBe(true);
  });

  it('bounds a hostile recovery-ID allocator and retains the exact command without crypto fallback', async () => {
    const executor = new ReservationFailureExecutor();
    const allocateId = vi.fn(() => DATA_EPOCH);
    const coordinator = createSettingsPersistenceCoordinator({
      input: input(),
      executor,
      allocateId,
    });
    await coordinator.whenIdle();
    expect(coordinator.dispatch(mutationEvent())).toEqual({ status: 'dispatched' });

    await expect(coordinator.whenIdle()).resolves.toBeUndefined();

    expect(allocateId).toHaveBeenCalledTimes(128);
    expect(coordinator.getSnapshot().command?.type).toBe('RESERVE_SETTINGS_STORAGE');
    const handoff = await coordinator.stop();
    expect(handoff.pendingCommand?.type).toBe('RESERVE_SETTINGS_STORAGE');
  });

  it('never reuses a proof ID adopted by the preceding durable snapshot', async () => {
    const executor = new ReservationFailureExecutor();
    const candidates = [uuid(4), uuid(500)];
    const allocateId = vi.fn(() => candidates.shift() ?? uuid(501));
    const coordinator = createSettingsPersistenceCoordinator({
      input: input(),
      executor,
      allocateId,
    });
    await coordinator.whenIdle();
    expect(coordinator.dispatch(mutationEvent())).toEqual({ status: 'dispatched' });

    await coordinator.whenIdle();

    expect(allocateId).toHaveBeenNthCalledWith(1);
    expect(allocateId).toHaveBeenCalledTimes(2);
    expect(executor.commands.map((command) => command.type)).toEqual([
      'RECOVER_AND_LOAD_SETTINGS',
      'PERSIST_SETTINGS_PENDING_INTENT',
      'RESERVE_SETTINGS_STORAGE',
      'PERSIST_SETTINGS_PENDING_INTENT',
    ]);
    expect(executor.commands.at(-1)).toMatchObject({
      pendingIntent: { requestId: uuid(500), nextCommandType: 'RECONCILE_SETTINGS' },
    });
  });

  it('never reuses the worker epoch captured from the immutable coordinator input', async () => {
    const executor = new ReservationFailureExecutor();
    const candidates = [WORKER_EPOCH, uuid(500)];
    const allocateId = vi.fn(() => candidates.shift() ?? uuid(501));
    const coordinator = createSettingsPersistenceCoordinator({
      input: input(),
      executor,
      allocateId,
    });
    await coordinator.whenIdle();
    expect(coordinator.dispatch(mutationEvent())).toEqual({ status: 'dispatched' });

    await coordinator.whenIdle();

    expect(allocateId).toHaveBeenCalledTimes(2);
    expect(executor.commands.at(-1)).toMatchObject({
      pendingIntent: { requestId: uuid(500), nextCommandType: 'RECONCILE_SETTINGS' },
    });
  });

  it('never reuses an ID observed in a rejected executor response', async () => {
    const rejectedResponseId = uuid(500);
    const executor = new ReservationFailureExecutor((command) => ({
      type: 'PROTOCOL_UNCERTAIN',
      dataEpoch: command.dataEpoch,
      mutationId: command.mutationId,
      nextRequestId: rejectedResponseId,
      error: makeError(
        contractFor('SETTINGS_PROTOCOL_ERROR', 'unknown', 'reconcile'),
        'malformed response with an extra field'
      ),
      extra: true,
    }));
    const candidates = [rejectedResponseId, uuid(501)];
    const allocateId = vi.fn(() => candidates.shift() ?? uuid(502));
    const coordinator = createSettingsPersistenceCoordinator({
      input: input(),
      executor,
      allocateId,
    });
    await coordinator.whenIdle();
    expect(coordinator.dispatch(mutationEvent())).toEqual({ status: 'dispatched' });

    await coordinator.whenIdle();

    expect(allocateId).toHaveBeenCalledTimes(2);
    expect(executor.commands.at(-1)).toMatchObject({
      type: 'PERSIST_SETTINGS_PENDING_INTENT',
      pendingIntent: { requestId: uuid(501), nextCommandType: 'RECONCILE_SETTINGS' },
    });
  });

  it('defers identity allocation when an executor response cannot be inspected safely', async () => {
    const hiddenIdGetter = vi.fn(() => uuid(500));
    const malformedResponse = {
      type: 'PROTOCOL_UNCERTAIN',
      dataEpoch: DATA_EPOCH,
      mutationId: uuid(60),
    } as Record<string, unknown>;
    Object.defineProperty(malformedResponse, 'nextRequestId', {
      enumerable: true,
      get: hiddenIdGetter,
    });
    const executor = new ReservationFailureExecutor(() => malformedResponse);
    const allocateId = vi.fn(() => uuid(501));
    const coordinator = createSettingsPersistenceCoordinator({
      input: input(),
      executor,
      allocateId,
    });
    await coordinator.whenIdle();
    expect(coordinator.dispatch(mutationEvent())).toEqual({ status: 'dispatched' });

    await coordinator.whenIdle();

    expect(hiddenIdGetter).not.toHaveBeenCalled();
    expect(allocateId).not.toHaveBeenCalled();
    expect(coordinator.getSnapshot().command?.type).toBe('RESERVE_SETTINGS_STORAGE');
  });

  it('converts a matching malformed compare response into protocol reconciliation', async () => {
    const executor = new MalformedCompareExecutor();
    const candidates = [uuid(500), uuid(501)];
    const allocateId = vi.fn(() => candidates.shift() ?? uuid(502));
    const coordinator = createSettingsPersistenceCoordinator({
      input: input(),
      executor,
      allocateId,
    });
    await coordinator.whenIdle();
    expect(coordinator.dispatch(mutationEvent())).toEqual({ status: 'dispatched' });

    await coordinator.whenIdle();

    expect(allocateId).toHaveBeenCalledTimes(2);
    expect(executor.commands.map((command) => command.type)).toContain('RECONCILE_SETTINGS');
    expect(
      executor.commands
        .filter((command) => command.type === 'RECONCILE_SETTINGS')
        .map((command) => command.requestId)
    ).toEqual([uuid(500), uuid(501)]);
  });
});
