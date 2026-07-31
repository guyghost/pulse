import { describe, expect, it } from 'vitest';

import type { AppSettings } from '../../../src/lib/core/types/app-settings';
import type { ConnectorMeta } from '../../../src/lib/shell/connectors/meta';
import {
  createOnboardingSourceController,
  isOnboardingSourceUuidV4,
  parseOnboardingCompletionProof,
  parseOnboardingPermissionContainsProof,
  parseOnboardingSourceError,
  parseOnboardingSourceInput,
  type OnboardingSourceCommand,
  type OnboardingSourceController,
  type OnboardingSourceDispatchResult,
  type OnboardingSourceError,
  type OnboardingSourceOperationIds,
} from '../../../src/models/onboarding-source.machine';
import {
  commandId as settingsCommandId,
  expectedAlarm,
  originDigest,
  settingsDigest,
  type SettingsEnvelopeV2,
  type SettingsMutationOutcomeV1,
  type SettingsSnapshotV1,
} from '../../../src/models/settings-persistence.contract';
import { createSettingsPersistenceController } from '../../../src/models/settings-persistence.machine';

const uuid = (suffix: number): string =>
  `70000000-0000-4000-8000-${suffix.toString(16).padStart(12, '0')}`;

const ATTEMPT_ID = uuid(1);
const DATA_EPOCH = uuid(2);
const NEXT_DATA_EPOCH = uuid(3);
const WORKER_EPOCH = uuid(4);

const CONNECTOR_CATALOG: ConnectorMeta[] = [
  {
    id: 'free-work',
    name: 'Free-Work',
    icon: 'free-work',
    url: 'https://www.free-work.com',
    hostPermissions: ['https://www.free-work.com/*'],
  },
  {
    id: 'lehibou',
    name: 'LeHibou',
    icon: 'lehibou',
    url: 'https://www.lehibou.com',
    hostPermissions: ['https://www.lehibou.com/*', 'https://api.lehibou.com/*'],
  },
];

const DEFAULT_SETTINGS: AppSettings = {
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

type CommandOfType<T extends OnboardingSourceCommand['type']> = Readonly<
  Extract<OnboardingSourceCommand, { type: T }>
>;

function cloneSettings(settings: AppSettings): AppSettings {
  return { ...settings, enabledConnectors: [...settings.enabledConnectors] };
}

function envelope(
  settings: AppSettings = DEFAULT_SETTINGS,
  revision = 0,
  generation = 0,
  outcomes: SettingsMutationOutcomeV1[] = []
): SettingsEnvelopeV2 {
  return {
    version: 2,
    dataEpoch: DATA_EPOCH,
    revision,
    generation,
    settings: cloneSettings(settings),
    journal: null,
    outcomes: outcomes.map((outcome) => ({
      ...outcome,
      correlationIds: [...outcome.correlationIds],
    })),
  };
}

function settingsSnapshot(
  currentEnvelope: SettingsEnvelopeV2,
  requestId: string,
  commandId: string,
  proofId = uuid(900_000)
): SettingsSnapshotV1 {
  const alarm = expectedAlarm(currentEnvelope.settings);
  return {
    version: 1,
    dataEpoch: currentEnvelope.dataEpoch,
    requestId,
    commandId,
    resetJournalAbsent: true,
    envelope: currentEnvelope,
    alarmProof: {
      ...alarm,
      dataEpoch: currentEnvelope.dataEpoch,
      envelopeRevision: currentEnvelope.revision,
      envelopeGeneration: currentEnvelope.generation,
      settingsDigest: settingsDigest(currentEnvelope.settings),
      proofId,
      requestId,
      commandId,
    },
  };
}

function createController(settings: AppSettings = DEFAULT_SETTINGS): OnboardingSourceController {
  const requestId = uuid(10);
  return createOnboardingSourceController({
    attemptId: ATTEMPT_ID,
    dataEpoch: DATA_EPOCH,
    workerEpoch: WORKER_EPOCH,
    connectorCatalog: CONNECTOR_CATALOG,
    settingsSnapshot: settingsSnapshot(
      envelope(settings),
      requestId,
      settingsCommandId('load', requestId),
      uuid(11)
    ),
    onboardingCompleted: false,
    onboardingCompletionDataEpoch: DATA_EPOCH,
  });
}

function operationIds(base: number): OnboardingSourceOperationIds {
  const ids = {
    operationId: uuid(base),
    mutationId: uuid(base + 1),
    permissionCheckId: uuid(base + 2),
    activationId: uuid(base + 3),
    storageReservationId: uuid(base + 4),
  };
  return {
    ...ids,
    activationResult: {
      version: 1,
      kind: 'SETTINGS_ACTIVATION_CONSUMED',
      dataEpoch: DATA_EPOCH,
      workerEpoch: WORKER_EPOCH,
      mutationId: ids.mutationId,
      permissionCheckId: ids.permissionCheckId,
      activationId: ids.activationId,
      storageReservationId: ids.storageReservationId,
      issuedAtMs: 1_000,
      expiresAtMs: 301_000,
      observedAtMs: 2_000,
      resultId: uuid(base + 100_000),
      oneShotConsumed: true,
    },
  };
}

function commandOfType<T extends OnboardingSourceCommand['type']>(
  controller: OnboardingSourceController,
  type: T
): CommandOfType<T> {
  const command = controller.getSnapshot().command;
  expect(command?.type).toBe(type);
  if (command?.type !== type) {
    throw new Error(`Expected ${type} command`);
  }
  return command as CommandOfType<T>;
}

function permissionContainsProof(
  command: CommandOfType<'CHECK_CONNECTOR_PERMISSION'>,
  containsResult: boolean
) {
  return {
    version: 1 as const,
    kind: containsResult
      ? ('ONBOARDING_PERMISSION_CONTAINS_PRESENT' as const)
      : ('ONBOARDING_PERMISSION_CONTAINS_MISSING' as const),
    observation: 'contains_only' as const,
    workerEpoch: command.workerEpoch,
    dataEpoch: command.dataEpoch,
    operationId: command.operationId,
    commandId: command.commandId,
    checkId: command.checkId,
    connectorId: command.connectorId,
    checkedOrigins: [...command.origins],
    originDigest: command.originDigest,
    containsResult,
  };
}

function expectDispatched(controller: OnboardingSourceController, event: unknown): void {
  expect(controller.dispatch(event)).toEqual({ status: 'dispatched' });
}

function expectRejected(controller: OnboardingSourceController, event: unknown): void {
  expect(controller.dispatch(event)).toEqual({ status: 'rejected', reason: 'invalid_event' });
}

function settlementSnapshot(
  command:
    | CommandOfType<'DISPATCH_SETTINGS_SELECTION'>
    | CommandOfType<'DISPATCH_SETTINGS_SKIP_AUTO_SCAN'>,
  settledSettings: AppSettings = command.expectation.candidateSettings,
  proofId = uuid(900_001)
): SettingsSnapshotV1 {
  const expectation = command.expectation;
  const settledRevision = expectation.baseRevision + 1;
  const settledGeneration = expectation.baseGeneration + 2;
  const outcome: SettingsMutationOutcomeV1 = {
    version: 1,
    dataEpoch: expectation.dataEpoch,
    mutationId: expectation.mutationId,
    commandDigest: expectation.commandDigest,
    previousDigest: expectation.previousDigest,
    candidateDigest: expectation.candidateDigest,
    baseRevision: expectation.baseRevision,
    baseGeneration: expectation.baseGeneration,
    settledRevision,
    settledGeneration,
    correlationIds: [...expectation.baseCorrelationIds],
    outcome: 'committed',
  };
  return settingsSnapshot(
    envelope(settledSettings, settledRevision, settledGeneration, [outcome]),
    expectation.snapshotRequestId,
    expectation.snapshotCommandId,
    proofId
  );
}

function dispatchSettlement(
  controller: OnboardingSourceController,
  command:
    | CommandOfType<'DISPATCH_SETTINGS_SELECTION'>
    | CommandOfType<'DISPATCH_SETTINGS_SKIP_AUTO_SCAN'>,
  snapshot = settlementSnapshot(command)
): void {
  const expectation = command.expectation;
  expectDispatched(controller, {
    type: 'SETTINGS_TRANSACTION_SETTLED',
    dataEpoch: DATA_EPOCH,
    purpose: expectation.purpose,
    operationId: expectation.operationId,
    mutationId: expectation.mutationId,
    commandDigest: expectation.commandDigest,
    snapshot,
  });
}

function completionProof(operationId: string, dataEpoch = DATA_EPOCH) {
  return {
    version: 1 as const,
    dataEpoch,
    attemptId: ATTEMPT_ID,
    operationId,
    onboardingCompleted: true as const,
  };
}

function drivePersistedSourceToReady(
  controller: OnboardingSourceController,
  ids: OnboardingSourceOperationIds
): void {
  expectDispatched(controller, { type: 'SELECT_SOURCE', connectorId: 'free-work' });
  expectDispatched(controller, { type: 'CONTINUE', ids });
  const permission = commandOfType(controller, 'CHECK_CONNECTOR_PERMISSION');
  expectDispatched(controller, {
    type: 'PERMISSION_CONTAINS_PRESENT',
    proof: permissionContainsProof(permission, true),
  });
  const session = commandOfType(controller, 'CHECK_CONNECTOR_SESSION');
  expectDispatched(controller, {
    type: 'SESSION_FOUND',
    workerEpoch: session.workerEpoch,
    dataEpoch: session.dataEpoch,
    operationId: session.operationId,
    commandId: session.commandId,
    checkId: session.checkId,
    connectorId: session.connectorId,
    lastSync: '2026-07-16T00:00:00.000Z',
  });
  expect(controller.getSnapshot().state).toBe('ready');
}

interface RecoveryEventOverrides {
  requestId?: string;
  snapshotRequestId?: string;
  snapshotCommandId?: string;
  proofDataEpoch?: string;
  proofRequestId?: string;
  proofCommandId?: string;
  nextCheckId?: string;
}

function recoveryEvent(
  command: CommandOfType<'READ_CANONICAL_ONBOARDING_SOURCE'>,
  nextOperationId: string,
  overrides: RecoveryEventOverrides = {}
): Record<string, unknown> {
  const snapshotRequestId = overrides.snapshotRequestId ?? command.snapshotRequestId;
  const snapshotCommandId = overrides.snapshotCommandId ?? command.snapshotCommandId;
  return {
    type: 'CANONICAL_STATE_REHYDRATED',
    dataEpoch: DATA_EPOCH,
    requestId: overrides.requestId ?? command.requestId,
    nextOperationId,
    nextCheckId: overrides.nextCheckId ?? uuid(999_999),
    snapshot: settingsSnapshot(envelope(), snapshotRequestId, snapshotCommandId, uuid(900_002)),
    completionReadProof: {
      version: 1,
      dataEpoch: overrides.proofDataEpoch ?? DATA_EPOCH,
      requestId: overrides.proofRequestId ?? command.requestId,
      commandId: overrides.proofCommandId ?? command.commandId,
      onboardingCompleted: false,
    },
  };
}

function fillPermissionBatches(
  controller: OnboardingSourceController,
  count: number,
  firstBase: number
): number {
  expectDispatched(controller, { type: 'SELECT_SOURCE', connectorId: 'free-work' });
  let base = firstBase;
  for (let index = 0; index < count; index += 1) {
    const ids = operationIds(base);
    expectDispatched(controller, index === 0 ? { type: 'CONTINUE', ids } : { type: 'RETRY', ids });
    const permission = commandOfType(controller, 'CHECK_CONNECTOR_PERMISSION');
    expectDispatched(controller, {
      type: 'PERMISSION_CONTAINS_MISSING',
      proof: permissionContainsProof(permission, false),
    });
    base += 5;
  }
  return base;
}

describe('Onboarding source executable model', () => {
  it('completes the nominal source, exact Settings, permission, session and consent flow', () => {
    const controller = createController();
    expectDispatched(controller, { type: 'SELECT_SOURCE', connectorId: 'lehibou' });
    const selectionIds = operationIds(100);
    expectDispatched(controller, { type: 'CONTINUE', ids: selectionIds });
    expect(controller.getSnapshot().state).toBe('persisting');

    const settingsCommand = commandOfType(controller, 'DISPATCH_SETTINGS_SELECTION');
    expect(settingsCommand.event.permissionCheckId).toBe(selectionIds.permissionCheckId);
    const commandBeforeForgery = controller.getSnapshot().command;
    dispatchSettlement(
      controller,
      settingsCommand,
      settlementSnapshot(settingsCommand, DEFAULT_SETTINGS)
    );
    expect(controller.getSnapshot().state).toBe('persisting');
    expect(controller.getSnapshot().command).toEqual(commandBeforeForgery);

    dispatchSettlement(controller, settingsCommand);
    const permission = commandOfType(controller, 'CHECK_CONNECTOR_PERMISSION');
    expect(permission).toMatchObject({
      workerEpoch: WORKER_EPOCH,
      checkId: selectionIds.permissionCheckId,
      observation: 'contains_only',
      origins: ['https://api.lehibou.com/*', 'https://www.lehibou.com/*'],
      originDigest: originDigest(['https://api.lehibou.com/*', 'https://www.lehibou.com/*']),
    });
    const beforeEarlySession = controller.getSnapshot();
    expectRejected(controller, {
      type: 'SESSION_FOUND',
      workerEpoch: permission.workerEpoch,
      dataEpoch: permission.dataEpoch,
      operationId: permission.operationId,
      commandId: permission.commandId,
      checkId: permission.checkId,
      connectorId: 'lehibou',
      lastSync: null,
    });
    expect(controller.getSnapshot()).toStrictEqual(beforeEarlySession);
    expectDispatched(controller, {
      type: 'PERMISSION_CONTAINS_PRESENT',
      proof: permissionContainsProof(permission, true),
    });
    const session = commandOfType(controller, 'CHECK_CONNECTOR_SESSION');
    expectDispatched(controller, {
      type: 'SESSION_FOUND',
      workerEpoch: session.workerEpoch,
      dataEpoch: session.dataEpoch,
      operationId: session.operationId,
      commandId: session.commandId,
      checkId: session.checkId,
      connectorId: 'lehibou',
      lastSync: null,
    });
    expect(controller.getSnapshot().state).toBe('ready');

    const consentIds = operationIds(200);
    expectDispatched(controller, { type: 'CONFIRM_SOURCE', ids: consentIds });
    const completion = commandOfType(controller, 'PERSIST_ONBOARDING_COMPLETED');
    expect(completion.completionKind).toBe('confirmed_source');
    expectDispatched(controller, {
      type: 'ONBOARDING_COMPLETION_PERSISTED',
      dataEpoch: DATA_EPOCH,
      operationId: completion.operationId,
      proof: completionProof(completion.operationId),
    });

    const final = controller.getSnapshot();
    expect(final.state).toBe('completed');
    expect(final.persistedEnabledConnectorIds).toContain('lehibou');
    expect(final.automaticScanAuthorized).toBe(true);
    expect(commandOfType(controller, 'ADVANCE_ONBOARDING').completionKind).toBe('confirmed_source');
  });

  it('emits the same five-identity correlation set and command digest as the executable Settings model', () => {
    const onboarding = createController();
    expectDispatched(onboarding, { type: 'SELECT_SOURCE', connectorId: 'lehibou' });
    const ids = operationIds(225);
    expectDispatched(onboarding, { type: 'CONTINUE', ids });
    const onboardingCommand = commandOfType(onboarding, 'DISPATCH_SETTINGS_SELECTION');

    const settings = createSettingsPersistenceController({
      dataEpoch: DATA_EPOCH,
      workerEpoch: WORKER_EPOCH,
      defaultSettings: DEFAULT_SETTINGS,
      includedConnectorIds: CONNECTOR_CATALOG.map((connector) => connector.id),
      permissionOriginsByConnectorId: Object.fromEntries(
        CONNECTOR_CATALOG.map((connector) => [connector.id, [...connector.hostPermissions].sort()])
      ),
      initialLoadRequestId: uuid(240),
      coldStartSeed: null,
    });
    const load = settings.getSnapshot().command;
    expect(load?.type).toBe('RECOVER_AND_LOAD_SETTINGS');
    if (load?.type !== 'RECOVER_AND_LOAD_SETTINGS') {
      throw new Error('Expected Settings load command');
    }
    expect(
      settings.dispatch({
        type: 'LOAD_SUCCEEDED',
        dataEpoch: DATA_EPOCH,
        requestId: load.requestId,
        commandId: load.commandId,
        snapshot: settingsSnapshot(envelope(), load.requestId, load.commandId, uuid(241)),
      })
    ).toEqual({ status: 'dispatched' });
    expect(settings.dispatch(onboardingCommand.event)).toEqual({ status: 'dispatched' });
    const persist = settings.getSnapshot().command;
    expect(persist?.type).toBe('PERSIST_SETTINGS_PENDING_INTENT');
    if (persist?.type !== 'PERSIST_SETTINGS_PENDING_INTENT') {
      throw new Error('Expected Settings pending-intent command');
    }

    const settingsMutation = persist.pendingIntent.mutation;
    expect(onboardingCommand.expectation.baseCorrelationIds).toEqual(
      settingsMutation.correlationIds
    );
    expect(onboardingCommand.expectation.baseCorrelationIds).toContain(
      ids.activationResult.resultId
    );
    expect(onboardingCommand.expectation.commandDigest).toBe(settingsMutation.commandDigest);
  });

  it('accepts only the exact correlated contains result and keeps positive and negative proofs distinct', () => {
    const controller = createController({
      ...DEFAULT_SETTINGS,
      enabledConnectors: ['free-work', 'lehibou'],
    });
    expectDispatched(controller, { type: 'SELECT_SOURCE', connectorId: 'lehibou' });
    expectDispatched(controller, { type: 'CONTINUE', ids: operationIds(250) });
    const command = commandOfType(controller, 'CHECK_CONNECTOR_PERMISSION');
    const present = permissionContainsProof(command, true);
    const missing = permissionContainsProof(command, false);
    const expected = {
      workerEpoch: command.workerEpoch,
      dataEpoch: command.dataEpoch,
      operationId: command.operationId,
      commandId: command.commandId,
      checkId: command.checkId,
      connectorId: command.connectorId,
      origins: command.origins,
    };

    expect(parseOnboardingPermissionContainsProof(present, expected, true)).toEqual(present);
    expect(parseOnboardingPermissionContainsProof(missing, expected, false)).toEqual(missing);
    expect(parseOnboardingPermissionContainsProof(missing, expected, true)).toBeNull();
    expect(
      parseOnboardingPermissionContainsProof(
        { ...present, commandId: 'onboarding-source/permission/forged' },
        expected,
        true
      )
    ).toBeNull();
    expect(
      parseOnboardingPermissionContainsProof(
        { ...present, checkedOrigins: [...present.checkedOrigins].reverse() },
        expected,
        true
      )
    ).toBeNull();

    expectRejected(controller, {
      type: 'PERMISSION_CONTAINS_PRESENT',
      proof: { ...present, originDigest: originDigest(['https://forged.example/*']) },
    });
    expect(commandOfType(controller, 'CHECK_CONNECTOR_PERMISSION')).toEqual(command);
    expectRejected(controller, { type: 'PERMISSION_CONTAINS_PRESENT', proof: missing });
    expect(commandOfType(controller, 'CHECK_CONNECTOR_PERMISSION')).toEqual(command);

    expectDispatched(controller, { type: 'PERMISSION_CONTAINS_MISSING', proof: missing });
    expect(controller.getSnapshot()).toMatchObject({
      state: 'permission_denied',
      permission: 'denied',
      session: 'unknown',
      command: null,
    });
  });

  it('rejects legacy, late and crossed permission callbacks while the session check is active', () => {
    const controller = createController();
    expectDispatched(controller, { type: 'SELECT_SOURCE', connectorId: 'free-work' });
    expectDispatched(controller, { type: 'CONTINUE', ids: operationIds(275) });
    const permission = commandOfType(controller, 'CHECK_CONNECTOR_PERMISSION');
    expectDispatched(controller, {
      type: 'PERMISSION_CONTAINS_PRESENT',
      proof: permissionContainsProof(permission, true),
    });
    const session = commandOfType(controller, 'CHECK_CONNECTOR_SESSION');
    const sessionSnapshot = controller.getSnapshot();
    const permissionError = {
      version: 1 as const,
      code: 'PERMISSION_CHECK_FAILED' as const,
      phase: 'permission' as const,
      message: 'Late permission callback',
      retryable: true,
    };

    expectRejected(controller, {
      type: 'CHECK_FAILED',
      dataEpoch: DATA_EPOCH,
      operationId: permission.operationId,
      connectorId: permission.connectorId,
      error: permissionError,
    });
    expect(controller.getSnapshot()).toStrictEqual(sessionSnapshot);

    expectRejected(controller, {
      type: 'CHECK_FAILED',
      workerEpoch: permission.workerEpoch,
      dataEpoch: permission.dataEpoch,
      operationId: permission.operationId,
      commandId: permission.commandId,
      checkId: permission.checkId,
      connectorId: permission.connectorId,
      checkPhase: 'permission',
      error: permissionError,
    });
    expectRejected(controller, {
      type: 'SESSION_FOUND',
      workerEpoch: permission.workerEpoch,
      dataEpoch: permission.dataEpoch,
      operationId: permission.operationId,
      commandId: permission.commandId,
      checkId: permission.checkId,
      connectorId: permission.connectorId,
      lastSync: null,
    });
    expectRejected(controller, {
      type: 'CHECK_FAILED',
      workerEpoch: session.workerEpoch,
      dataEpoch: session.dataEpoch,
      operationId: session.operationId,
      commandId: session.commandId,
      checkId: session.checkId,
      connectorId: session.connectorId,
      checkPhase: 'session',
      error: permissionError,
    });
    expect(controller.getSnapshot()).toStrictEqual(sessionSnapshot);

    expectDispatched(controller, {
      type: 'SESSION_FOUND',
      workerEpoch: session.workerEpoch,
      dataEpoch: session.dataEpoch,
      operationId: session.operationId,
      commandId: session.commandId,
      checkId: session.checkId,
      connectorId: session.connectorId,
      lastSync: null,
    });
    expect(controller.getSnapshot().state).toBe('ready');
  });

  it('persists SKIP in two phases before entering the safe terminal state', () => {
    const controller = createController();
    const skipIds = operationIds(300);
    expectDispatched(controller, { type: 'SKIP', ids: skipIds });
    const settingsCommand = commandOfType(controller, 'DISPATCH_SETTINGS_SKIP_AUTO_SCAN');

    expectRejected(controller, {
      type: 'ONBOARDING_COMPLETION_PERSISTED',
      dataEpoch: DATA_EPOCH,
      operationId: skipIds.operationId,
      proof: completionProof(skipIds.operationId),
    });
    dispatchSettlement(controller, settingsCommand);
    const completion = commandOfType(controller, 'PERSIST_ONBOARDING_COMPLETED');
    expect(completion.completionKind).toBe('skipped');

    expectRejected(controller, {
      type: 'ONBOARDING_COMPLETION_PERSISTED',
      dataEpoch: NEXT_DATA_EPOCH,
      operationId: completion.operationId,
      proof: completionProof(completion.operationId, NEXT_DATA_EPOCH),
    });
    expectDispatched(controller, {
      type: 'ONBOARDING_COMPLETION_PERSISTED',
      dataEpoch: DATA_EPOCH,
      operationId: completion.operationId,
      proof: completionProof(completion.operationId),
    });

    const final = controller.getSnapshot();
    expect(final.state).toBe('skipped');
    expect(final.autoScanEnabled).toBe(false);
    expect(final.onboardingCompleted).toBe(true);
    expect(final.automaticScanAuthorized).toBe(false);
    expect(commandOfType(controller, 'ADVANCE_ONBOARDING')).toMatchObject({
      connectorId: null,
      completionKind: 'skipped',
    });
  });

  it('accepts one exact Recovery proof and rejects every mixed A/B identity without consumption', () => {
    const controller = createController();
    const requestA = uuid(400);
    const requestB = uuid(401);
    expectDispatched(controller, {
      type: 'SERVICE_WORKER_RESTARTED',
      dataEpoch: DATA_EPOCH,
      requestId: requestA,
    });
    const command = commandOfType(controller, 'READ_CANONICAL_ONBOARDING_SOURCE');
    const nextOperationId = uuid(402);
    const capacity = controller.getSnapshot().correlationCapacityRemaining;
    const expectedCommand = controller.getSnapshot().command;
    const mismatches: RecoveryEventOverrides[] = [
      { requestId: requestB },
      { snapshotRequestId: requestB },
      { snapshotCommandId: settingsCommandId('recover', requestB) },
      { proofRequestId: requestB },
      { proofCommandId: `onboarding-source/recovery/${requestB}` },
      { proofDataEpoch: NEXT_DATA_EPOCH },
      { nextCheckId: nextOperationId },
    ];

    for (const mismatch of mismatches) {
      expectRejected(controller, recoveryEvent(command, nextOperationId, mismatch));
      expect(controller.getSnapshot()).toMatchObject({
        state: 'recovering',
        correlationCapacityRemaining: capacity,
      });
      expect(controller.getSnapshot().command).toEqual(expectedCommand);
    }

    expectDispatched(controller, recoveryEvent(command, nextOperationId));
    expect(controller.getSnapshot()).toMatchObject({
      state: 'selecting',
      correlationCapacityRemaining: capacity - 2,
    });
  });

  it('retries Recovery with fresh IDs while stale and late responses remain inert', () => {
    const controller = createController();
    expectDispatched(controller, {
      type: 'SERVICE_WORKER_RESTARTED',
      dataEpoch: DATA_EPOCH,
      requestId: uuid(500),
    });
    const firstRecovery = commandOfType(controller, 'READ_CANONICAL_ONBOARDING_SOURCE');
    expectDispatched(controller, {
      type: 'NETWORK_OFFLINE',
      dataEpoch: DATA_EPOCH,
      operationId: firstRecovery.requestId,
    });
    expect(controller.getSnapshot().state).toBe('failed');

    const retryIds = operationIds(510);
    expectDispatched(controller, { type: 'RETRY', ids: retryIds });
    const currentRecovery = commandOfType(controller, 'READ_CANONICAL_ONBOARDING_SOURCE');
    expect(currentRecovery.requestId).toBe(retryIds.operationId);
    const capacity = controller.getSnapshot().correlationCapacityRemaining;

    expectRejected(controller, recoveryEvent(firstRecovery, uuid(520)));
    expect(controller.getSnapshot().correlationCapacityRemaining).toBe(capacity);
    const exact = recoveryEvent(currentRecovery, uuid(521));
    expectDispatched(controller, exact);
    expect(controller.getSnapshot().state).toBe('selecting');
    expectRejected(controller, exact);
  });

  it('requires fresh Retry batches and ignores stale or late connector results', () => {
    const controller = createController();
    expectDispatched(controller, { type: 'SELECT_SOURCE', connectorId: 'free-work' });
    const firstIds = operationIds(600);
    expectDispatched(controller, { type: 'CONTINUE', ids: firstIds });
    const firstPermission = commandOfType(controller, 'CHECK_CONNECTOR_PERMISSION');
    expectDispatched(controller, {
      type: 'PERMISSION_CONTAINS_MISSING',
      proof: permissionContainsProof(firstPermission, false),
    });

    expectRejected(controller, { type: 'RETRY', ids: firstIds });
    expectRejected(controller, {
      type: 'RETRY',
      ids: { ...operationIds(610), mutationId: firstIds.mutationId },
    });
    const retryIds = operationIds(620);
    expectDispatched(controller, { type: 'RETRY', ids: retryIds });
    const retryCommand = commandOfType(controller, 'CHECK_CONNECTOR_PERMISSION');
    const commandBeforeStale = controller.getSnapshot().command;

    expectRejected(controller, {
      type: 'PERMISSION_CONTAINS_PRESENT',
      proof: permissionContainsProof(firstPermission, true),
    });
    expect(controller.getSnapshot().command).toEqual(commandBeforeStale);
    expectRejected(controller, {
      type: 'PERMISSION_CONTAINS_PRESENT',
      proof: { ...permissionContainsProof(retryCommand, true), dataEpoch: undefined },
    });
    expectDispatched(controller, {
      type: 'PERMISSION_CONTAINS_PRESENT',
      proof: permissionContainsProof(retryCommand, true),
    });
    const session = commandOfType(controller, 'CHECK_CONNECTOR_SESSION');
    expectRejected(controller, {
      type: 'SESSION_FOUND',
      dataEpoch: DATA_EPOCH,
      operationId: firstIds.operationId,
      connectorId: 'free-work',
      lastSync: null,
    });
    expect(controller.getSnapshot().state).toBe('checking');
    expectDispatched(controller, {
      type: 'SESSION_FOUND',
      workerEpoch: session.workerEpoch,
      dataEpoch: session.dataEpoch,
      operationId: session.operationId,
      commandId: session.commandId,
      checkId: session.checkId,
      connectorId: 'free-work',
      lastSync: null,
    });
    expect(controller.getSnapshot().state).toBe('ready');
  });

  it('lets a matching reset preempt consent while a foreign reset and late ack stay inert', () => {
    const controller = createController();
    drivePersistedSourceToReady(controller, operationIds(700));
    const consentIds = operationIds(710);
    expectDispatched(controller, { type: 'CONFIRM_SOURCE', ids: consentIds });
    const completion = commandOfType(controller, 'PERSIST_ONBOARDING_COMPLETED');

    expectDispatched(controller, {
      type: 'DATA_EPOCH_INVALIDATED',
      resetId: uuid(720),
      previousDataEpoch: uuid(721),
      nextDataEpoch: NEXT_DATA_EPOCH,
    });
    expect(controller.getSnapshot().state).toBe('consenting');
    expectDispatched(controller, {
      type: 'DATA_EPOCH_INVALIDATED',
      resetId: uuid(722),
      previousDataEpoch: DATA_EPOCH,
      nextDataEpoch: NEXT_DATA_EPOCH,
    });
    expect(controller.getSnapshot().state).toBe('cancelled');
    expect(
      controller.dispatch({
        type: 'ONBOARDING_COMPLETION_PERSISTED',
        dataEpoch: DATA_EPOCH,
        operationId: completion.operationId,
        proof: completionProof(completion.operationId),
      })
    ).toEqual({ status: 'rejected', reason: 'inactive' });
  });

  it('consumes immediate CANCEL IDs and reserves capacity for active cancellation follow-ups', () => {
    const immediate = createController();
    const nextBase = fillPermissionBatches(immediate, 51, 1_000);
    expect(immediate.getSnapshot().correlationCapacityRemaining).toBe(1);
    expectRejected(immediate, {
      type: 'SERVICE_WORKER_RESTARTED',
      dataEpoch: DATA_EPOCH,
      requestId: uuid(nextBase),
    });
    expectDispatched(immediate, {
      type: 'CANCEL',
      dataEpoch: DATA_EPOCH,
      requestId: uuid(nextBase),
    });
    expect(immediate.getSnapshot()).toMatchObject({
      state: 'cancelled',
      correlationCapacityRemaining: 0,
    });

    const active = createController();
    expectDispatched(active, { type: 'SELECT_SOURCE', connectorId: 'lehibou' });
    const selectionIds = operationIds(2_000);
    expectDispatched(active, { type: 'CONTINUE', ids: selectionIds });
    const cancelRequestId = uuid(2_010);
    expectDispatched(active, {
      type: 'CANCEL',
      dataEpoch: DATA_EPOCH,
      requestId: cancelRequestId,
    });
    expect(commandOfType(active, 'DISPATCH_SETTINGS_CANCEL').event.requestId).toBe(cancelRequestId);
    const recoveryRequestId = uuid(2_011);
    expectDispatched(active, {
      type: 'SETTINGS_CANCEL_OUTCOME_UNKNOWN',
      dataEpoch: DATA_EPOCH,
      operationId: selectionIds.operationId,
      mutationId: selectionIds.mutationId,
      requestId: cancelRequestId,
      nextRequestId: recoveryRequestId,
    });
    const recovery = commandOfType(active, 'READ_CANONICAL_ONBOARDING_SOURCE');
    expect(recovery.requestId).toBe(recoveryRequestId);
    expectDispatched(active, recoveryEvent(recovery, uuid(2_012)));
    expect(active.getSnapshot().state).toBe('cancelled');

    const exhausted = createController();
    const exhaustedBase = fillPermissionBatches(exhausted, 50, 3_000);
    expect(exhausted.getSnapshot().correlationCapacityRemaining).toBe(7);
    expectDispatched(exhausted, { type: 'SELECT_SOURCE', connectorId: 'lehibou' });
    const finalSelection = operationIds(exhaustedBase);
    expectDispatched(exhausted, { type: 'CONTINUE', ids: finalSelection });
    expect(exhausted.getSnapshot().correlationCapacityRemaining).toBe(1);
    expectRejected(exhausted, {
      type: 'CANCEL',
      dataEpoch: DATA_EPOCH,
      requestId: uuid(exhaustedBase + 5),
    });
    expect(exhausted.getSnapshot()).toMatchObject({
      state: 'persisting',
      correlationCapacityRemaining: 1,
    });
  });

  it('isolates throwing and reentrant observers and exposes only fresh frozen DTOs', () => {
    const controller = createController();
    let healthyCalls = 0;
    let reentrantResult: OnboardingSourceDispatchResult | null = null;
    const throwing = controller.subscribe(() => {
      throw new Error('observer failure');
    });
    const healthy = controller.subscribe(() => {
      healthyCalls += 1;
    });
    const reentrant = controller.subscribe((snapshot) => {
      if (snapshot.selectedConnectorId === 'lehibou') {
        reentrantResult = controller.dispatch({
          type: 'SELECT_SOURCE',
          connectorId: 'free-work',
        });
      }
    });

    expectDispatched(controller, { type: 'SELECT_SOURCE', connectorId: 'lehibou' });
    expect(healthyCalls).toBeGreaterThan(1);
    expect(reentrantResult).toEqual({ status: 'rejected', reason: 'reentrant' });

    const first = controller.getSnapshot();
    const second = controller.getSnapshot();
    expect(first).not.toBe(second);
    expect(first.connectorCatalog).not.toBe(second.connectorCatalog);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.connectorCatalog)).toBe(true);
    expect(Object.isFrozen(first.connectorCatalog[0])).toBe(true);
    expect('context' in first).toBe(false);
    expect('value' in first).toBe(false);
    expect('actor' in first).toBe(false);
    expect(Reflect.set(first.connectorCatalog[0]!, 'name', 'mutated')).toBe(false);

    healthy.unsubscribe();
    const callsAfterUnsubscribe = healthyCalls;
    expectDispatched(controller, { type: 'SELECT_SOURCE', connectorId: 'free-work' });
    expect(healthyCalls).toBe(callsAfterUnsubscribe);
    throwing.unsubscribe();
    reentrant.unsubscribe();
    controller.stop();
    controller.stop();
    expect(controller.dispatch({ type: 'SELECT_SOURCE', connectorId: 'free-work' })).toEqual({
      status: 'rejected',
      reason: 'inactive',
    });
  });

  it('keeps completion proofs descriptor-only and fails closed for revoked or oversized Proxies', () => {
    const expected = {
      dataEpoch: DATA_EPOCH,
      attemptId: ATTEMPT_ID,
      operationId: uuid(4_000),
    };
    let getterReads = 0;
    const accessorProof: Record<string, unknown> = {
      version: 1,
      dataEpoch: DATA_EPOCH,
      attemptId: ATTEMPT_ID,
      onboardingCompleted: true,
    };
    Object.defineProperty(accessorProof, 'operationId', {
      enumerable: true,
      get() {
        getterReads += 1;
        return expected.operationId;
      },
    });
    expect(parseOnboardingCompletionProof(accessorProof, expected)).toBeNull();
    expect(getterReads).toBe(0);

    let proxyGets = 0;
    const validProof = completionProof(expected.operationId);
    const descriptorProxy = new Proxy(validProof, {
      get(target, property, receiver) {
        proxyGets += 1;
        return Reflect.get(target, property, receiver);
      },
    });
    expect(parseOnboardingCompletionProof(descriptorProxy, expected)).toEqual(validProof);
    expect(proxyGets).toBe(0);

    const revoked = Proxy.revocable(validProof, {});
    revoked.revoke();
    expect(parseOnboardingCompletionProof(revoked.proxy, expected)).toBeNull();

    let arrayGets = 0;
    let arrayOwnKeys = 0;
    const hugeCatalog = new Proxy(new Array<unknown>(4_097), {
      get(target, property, receiver) {
        arrayGets += 1;
        return Reflect.get(target, property, receiver);
      },
      ownKeys(target) {
        arrayOwnKeys += 1;
        return Reflect.ownKeys(target);
      },
    });
    const requestId = uuid(4_001);
    expect(
      parseOnboardingSourceInput({
        attemptId: ATTEMPT_ID,
        dataEpoch: DATA_EPOCH,
        workerEpoch: WORKER_EPOCH,
        connectorCatalog: hugeCatalog,
        settingsSnapshot: settingsSnapshot(
          envelope(),
          requestId,
          settingsCommandId('load', requestId)
        ),
        onboardingCompleted: false,
        onboardingCompletionDataEpoch: DATA_EPOCH,
      })
    ).toBeNull();
    expect(arrayGets).toBe(0);
    expect(arrayOwnKeys).toBe(0);
  });

  it('enforces lowercase UUIDs and the closed eight-row error matrix at public boundaries', () => {
    const alphabeticUuid = uuid(10);
    expect(isOnboardingSourceUuidV4(alphabeticUuid)).toBe(true);
    expect(isOnboardingSourceUuidV4(alphabeticUuid.toUpperCase())).toBe(false);

    const matrix: Array<Pick<OnboardingSourceError, 'code' | 'phase' | 'retryable'>> = [
      { code: 'SETTINGS_PERSISTENCE_FAILED', phase: 'persistence', retryable: true },
      { code: 'PERMISSION_CHECK_FAILED', phase: 'permission', retryable: true },
      { code: 'SESSION_CHECK_FAILED', phase: 'session', retryable: true },
      { code: 'NETWORK_OFFLINE', phase: 'offline', retryable: true },
      { code: 'CONSENT_PERSISTENCE_FAILED', phase: 'consent', retryable: true },
      { code: 'SKIP_FAILED', phase: 'skip', retryable: true },
      { code: 'RECOVERY_FAILED', phase: 'recovery', retryable: true },
      { code: 'CORRELATION_CAPACITY_EXHAUSTED', phase: 'correlation', retryable: false },
    ];
    for (const row of matrix) {
      const error = { version: 1 as const, ...row, message: row.code };
      expect(parseOnboardingSourceError(error)).toEqual(error);
      expect(
        parseOnboardingSourceError({
          ...error,
          phase: row.phase === 'offline' ? 'persistence' : 'offline',
        })
      ).toBeNull();
      expect(parseOnboardingSourceError({ ...error, retryable: !row.retryable })).toBeNull();
    }
    expect(
      parseOnboardingSourceError({
        version: 1,
        code: 'RECOVERY_FAILED',
        phase: 'recovery',
        message: 'x'.repeat(501),
        retryable: true,
      })
    ).toBeNull();

    const controller = createController();
    expectRejected(controller, {
      type: 'CANCEL',
      dataEpoch: DATA_EPOCH,
      requestId: alphabeticUuid.toUpperCase(),
    });
    const revokedEvent = Proxy.revocable({ type: 'SELECT_SOURCE', connectorId: 'free-work' }, {});
    revokedEvent.revoke();
    expectRejected(controller, revokedEvent.proxy);
  });
});
