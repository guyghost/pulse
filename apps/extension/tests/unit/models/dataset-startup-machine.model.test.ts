import { describe, expect, it } from 'vitest';

import type { AppSettings } from '../../../src/lib/core/types/app-settings';
import {
  DATASET_STARTUP_MAX_BOOTSTRAPS_PER_PUBLICATION,
  createDatasetStartupController,
  initialDatasetStartupContext,
  parseDatasetBootstrapPublicationProof,
  selectDatasetStartupBootstrap,
  type DatasetStartupController,
  type DatasetStartupContext,
  type DatasetStartupSnapshot,
} from '../../../src/models/dataset-startup.machine';
import {
  BACKGROUND_SCHEDULING_HANDOFF_KEY,
  LOCAL_DATA_RESET_JOURNAL_KEY,
} from '../../../src/models/local-data-reset.contract';
import { settingsDigest } from '../../../src/models/settings-persistence.contract';

const workerEpoch = '00000000-0000-4000-8000-000000000001';
const attemptId = '00000000-0000-4000-8000-000000000002';
const requestId = '00000000-0000-4000-8000-000000000003';
const settingsRecoveryRequestId = '00000000-0000-4000-8000-000000000004';
const dataEpoch = '00000000-0000-4000-8000-000000000005';
const admissionProofId = '00000000-0000-4000-8000-000000000006';
const alarmProofId = '00000000-0000-4000-8000-000000000007';
const lateRequestId = '00000000-0000-4000-8000-000000000008';
const retryAttemptId = '00000000-0000-4000-8000-000000000009';
const retryRequestId = '00000000-0000-4000-8000-00000000000a';
const retrySettingsRequestId = '00000000-0000-4000-8000-00000000000b';
const resetId = '00000000-0000-4000-8000-00000000000c';

function resetGateClearedProof() {
  return {
    version: 1,
    storageArea: 'chrome.storage.local' as const,
    inspectedKeys: [LOCAL_DATA_RESET_JOURNAL_KEY, BACKGROUND_SCHEDULING_HANDOFF_KEY],
    absentKeys: [LOCAL_DATA_RESET_JOURNAL_KEY, BACKGROUND_SCHEDULING_HANDOFF_KEY],
    resetJournalAbsent: true as const,
    orphanHandoffSidecarAbsent: true as const,
    linkedAllowlistExact: true as const,
    readBackVerified: true as const,
  };
}

const settings: AppSettings = {
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

function current(controller: DatasetStartupController): DatasetStartupSnapshot {
  return controller.getSnapshot();
}

function commandId(controller: DatasetStartupController): string {
  const command = current(controller).command;
  if (command === null || !('commandId' in command)) {
    throw new Error('expected command');
  }
  return command.commandId;
}

function sendResult(
  controller: DatasetStartupController,
  type: string,
  extra: Record<string, unknown> = {}
): void {
  expect(
    controller.dispatch({
      type,
      attemptId,
      workerEpoch,
      commandId: commandId(controller),
      ...extra,
    })
  ).toEqual({ status: 'dispatched' });
}

function publicationProof(ids: string[]) {
  return {
    version: 1,
    attemptId,
    workerEpoch,
    dataEpoch,
    admissionProofId,
    bootstraps: ids.map((id) => ({ version: 1, requestId: id, workerEpoch, dataEpoch })),
  };
}

function boundedRequestId(index: number): string {
  return `10000000-0000-4000-8000-${index.toString(16).padStart(12, '0')}`;
}

function publicationContext(): DatasetStartupContext {
  return {
    ...initialDatasetStartupContext({
      workerEpoch,
      defaultSettings: settings,
      includedConnectorIds: ['free-work'],
    }),
    attemptId,
    pendingRequestIds: [requestId],
    settingsRecoveryRequestId,
    expectedStage: 'bootstrap',
    entryDataVersion: 3,
    dataEpoch,
    admissionProof: {
      version: 1,
      attemptId,
      workerEpoch,
      dataEpoch,
      authorityRevision: 4,
      admission: 'open',
      proofId: admissionProofId,
    },
  };
}

function enterFailureFence(controller: DatasetStartupController): void {
  driveReady(controller);
  expect(
    controller.dispatch({
      type: 'START',
      attemptId,
      workerEpoch,
      requestId: lateRequestId,
      settingsRecoveryRequestId,
    })
  ).toEqual({ status: 'dispatched' });
  sendResult(controller, 'STEP_FAILED', {
    error: {
      version: 1,
      code: 'BOOTSTRAP_PUBLISH_FAILED',
      stage: 'bootstrap',
      message: 'publication failed',
      retryable: true,
      destructiveEffectPerformed: false,
    },
  });
  expect(current(controller).state).toBe('fencingFailure');
  expect(current(controller).command?.type).toBe('FENCE_STARTUP_FAILURE');
}

function driveReady(controller: DatasetStartupController): void {
  expect(
    controller.dispatch({
      type: 'START',
      attemptId,
      workerEpoch,
      requestId,
      settingsRecoveryRequestId,
    })
  ).toEqual({ status: 'dispatched' });
  sendResult(controller, 'RESET_GATE_CLEARED', { proof: resetGateClearedProof() });
  sendResult(controller, 'VERSIONS_READ', {
    versions: {
      version: 1,
      databaseName: 'missionpulse',
      storedDbVersion: 6,
      storedDataVersion: 3,
      targetDbVersion: 6,
      targetDataVersion: 3,
    },
  });
  sendResult(controller, 'VERIFICATION_PASSED', {
    proof: {
      version: 1,
      markerReadBack: 3,
      criticalRecordsValid: true,
      authority: {
        version: 1,
        databaseName: 'missionpulse',
        dbVersion: 6,
        appDataVersion: 3,
        schemaVerified: true,
        dataEpoch,
        trackingMeta: {
          key: 'tracking_meta',
          schemaVersion: 1,
          dataEpoch,
          collectionRevision: 0,
        },
      },
    },
  });
  const envelope = {
    version: 2,
    dataEpoch,
    revision: 0,
    generation: 0,
    settings,
    journal: null,
    outcomes: [],
  } as const;
  sendResult(controller, 'SETTINGS_ENVELOPE_WRAPPED', {
    proof: {
      version: 1,
      dataEpoch,
      markerReadBack: 3,
      decodePolicy: 'v2_only',
      readBack: true,
      envelope,
    },
  });
  sendResult(controller, 'PREPARED_RECOVERED', {
    proof: {
      version: 1,
      workerEpoch,
      dataEpoch,
      recoveryCompleted: true,
      olderWorkerPreparedRemaining: 0,
    },
  });
  const recoveryCommandId = commandId(controller);
  expect(
    controller.dispatch({
      type: 'SETTINGS_RECOVERY_PASSED',
      attemptId,
      workerEpoch,
      dataEpoch,
      requestId: settingsRecoveryRequestId,
      commandId: recoveryCommandId,
      snapshot: {
        version: 1,
        dataEpoch,
        requestId: settingsRecoveryRequestId,
        commandId: recoveryCommandId,
        resetJournalAbsent: true,
        envelope,
        alarmProof: {
          version: 1,
          kind: 'AUTO_SCAN_ALARM',
          alarmName: 'auto-scan',
          enabled: true,
          periodInMinutes: 30,
          dataEpoch,
          envelopeRevision: 0,
          envelopeGeneration: 0,
          settingsDigest: settingsDigest(settings),
          proofId: alarmProofId,
          requestId: settingsRecoveryRequestId,
          commandId: recoveryCommandId,
        },
      },
    })
  ).toEqual({ status: 'dispatched' });
  sendResult(controller, 'ADMISSION_OPENED', {
    proof: {
      version: 1,
      attemptId,
      workerEpoch,
      dataEpoch,
      authorityRevision: 4,
      admission: 'open',
      proofId: admissionProofId,
    },
  });
  sendResult(controller, 'BOOTSTRAP_PUBLISHED', {
    proof: publicationProof([requestId]),
  });
  expect(current(controller).state).toBe('ready');
}

describe('Dataset startup executable model', () => {
  it('blocks READ_VERSIONS until the reset gate proves the exact allowlist and orphan absence', () => {
    const controller = createDatasetStartupController({
      workerEpoch,
      defaultSettings: settings,
      includedConnectorIds: ['free-work'],
    });
    expect(
      controller.dispatch({
        type: 'START',
        attemptId,
        workerEpoch,
        requestId,
        settingsRecoveryRequestId,
      })
    ).toEqual({ status: 'dispatched' });
    expect(current(controller).command?.type).toBe('READ_RESET_GATE');
    expect(
      controller.dispatch({
        type: 'RESET_GATE_CLEARED',
        attemptId,
        workerEpoch,
        commandId: commandId(controller),
        proof: { ...resetGateClearedProof(), orphanHandoffSidecarAbsent: false },
      })
    ).toEqual({ status: 'rejected', reason: 'invalid_event' });
    expect(current(controller).command?.type).toBe('READ_RESET_GATE');
    for (const invalidProof of [
      {
        ...resetGateClearedProof(),
        inspectedKeys: [BACKGROUND_SCHEDULING_HANDOFF_KEY, LOCAL_DATA_RESET_JOURNAL_KEY],
      },
      {
        ...resetGateClearedProof(),
        absentKeys: [
          LOCAL_DATA_RESET_JOURNAL_KEY,
          BACKGROUND_SCHEDULING_HANDOFF_KEY,
          'foreign.key',
        ],
      },
      { ...resetGateClearedProof(), linkedAllowlistExact: false },
    ]) {
      expect(
        controller.dispatch({
          type: 'RESET_GATE_CLEARED',
          attemptId,
          workerEpoch,
          commandId: commandId(controller),
          proof: invalidProof,
        })
      ).toEqual({ status: 'rejected', reason: 'invalid_event' });
      expect(current(controller).command?.type).toBe('READ_RESET_GATE');
    }
    sendResult(controller, 'RESET_GATE_CLEARED', { proof: resetGateClearedProof() });
    expect(current(controller).command?.type).toBe('READ_VERSIONS');
  });

  it('does not execute a hostile array get trap', () => {
    let getReads = 0;
    const bootstraps = new Proxy(publicationProof([requestId]).bootstraps, {
      get(target, key, receiver) {
        getReads += 1;
        return Reflect.get(target, key, receiver);
      },
    });
    expect(
      parseDatasetBootstrapPublicationProof(
        { ...publicationProof([requestId]), bootstraps },
        publicationContext()
      )
    ).not.toBeNull();
    expect(getReads).toBe(0);

    const sparse = new Array<unknown>(1);
    expect(
      parseDatasetBootstrapPublicationProof(
        { ...publicationProof([requestId]), bootstraps: sparse },
        publicationContext()
      )
    ).toBeNull();

    const withExtraKey = publicationProof([requestId]).bootstraps;
    Object.defineProperty(withExtraKey, 'extra', { value: true, enumerable: true });
    expect(
      parseDatasetBootstrapPublicationProof(
        { ...publicationProof([requestId]), bootstraps: withExtraKey },
        publicationContext()
      )
    ).toBeNull();

    let accessorReads = 0;
    const withAccessor = publicationProof([requestId]).bootstraps;
    Object.defineProperty(withAccessor, '0', {
      enumerable: true,
      configurable: true,
      get() {
        accessorReads += 1;
        return publicationProof([requestId]).bootstraps[0];
      },
    });
    expect(
      parseDatasetBootstrapPublicationProof(
        { ...publicationProof([requestId]), bootstraps: withAccessor },
        publicationContext()
      )
    ).toBeNull();
    expect(accessorReads).toBe(0);

    const revocable = Proxy.revocable(publicationProof([requestId]).bootstraps, {});
    revocable.revoke();
    expect(
      parseDatasetBootstrapPublicationProof(
        { ...publicationProof([requestId]), bootstraps: revocable.proxy },
        publicationContext()
      )
    ).toBeNull();

    let oversizedOwnKeysReads = 0;
    const oversized = new Proxy([], {
      getOwnPropertyDescriptor(target, key) {
        const descriptor = Reflect.getOwnPropertyDescriptor(target, key);
        return key === 'length' && descriptor !== undefined
          ? {
              ...descriptor,
              value: DATASET_STARTUP_MAX_BOOTSTRAPS_PER_PUBLICATION + 1,
            }
          : descriptor;
      },
      ownKeys(target) {
        oversizedOwnKeysReads += 1;
        return Reflect.ownKeys(target);
      },
    });
    expect(
      parseDatasetBootstrapPublicationProof(
        { ...publicationProof([requestId]), bootstraps: oversized },
        publicationContext()
      )
    ).toBeNull();
    expect(oversizedOwnKeysReads).toBe(0);
  });

  it('rejects a waiter burst above the bounded batch capacity without mutation', () => {
    const controller = createDatasetStartupController({
      workerEpoch,
      defaultSettings: settings,
      includedConnectorIds: ['free-work'],
    });
    expect(
      controller.dispatch({
        type: 'START',
        attemptId,
        workerEpoch,
        requestId,
        settingsRecoveryRequestId,
      })
    ).toEqual({ status: 'dispatched' });

    for (let index = 0; index < DATASET_STARTUP_MAX_BOOTSTRAPS_PER_PUBLICATION - 1; index += 1) {
      expect(
        controller.dispatch({
          type: 'START',
          attemptId,
          workerEpoch,
          requestId: boundedRequestId(index),
          settingsRecoveryRequestId,
        })
      ).toEqual({ status: 'dispatched' });
    }
    const full = current(controller);
    expect(full.pendingRequestIds).toHaveLength(DATASET_STARTUP_MAX_BOOTSTRAPS_PER_PUBLICATION);
    let notifications = 0;
    const subscription = controller.subscribe(() => {
      notifications += 1;
    });
    const notificationsBeforeOverflow = notifications;

    const overflowRequestId = boundedRequestId(DATASET_STARTUP_MAX_BOOTSTRAPS_PER_PUBLICATION);
    const overflow = controller.dispatch({
      type: 'START',
      attemptId,
      workerEpoch,
      requestId: overflowRequestId,
      settingsRecoveryRequestId,
    });
    expect(overflow).toEqual({
      status: 'rejected',
      reason: 'capacity_exceeded',
      error: {
        version: 1,
        code: 'BOOTSTRAP_BATCH_CAPACITY_EXCEEDED',
        stage: 'bootstrap',
        attemptId,
        workerEpoch,
        requestId: overflowRequestId,
        maxBatchSize: DATASET_STARTUP_MAX_BOOTSTRAPS_PER_PUBLICATION,
        retryable: true,
      },
    });
    expect(Object.isFrozen(overflow)).toBe(true);
    expect(
      overflow.status === 'rejected' && 'error' in overflow && Object.isFrozen(overflow.error)
    ).toBe(true);
    expect(notifications).toBe(notificationsBeforeOverflow);
    expect(current(controller)).toEqual(full);

    expect(
      controller.dispatch({
        type: 'START',
        attemptId,
        workerEpoch,
        requestId,
        settingsRecoveryRequestId,
      })
    ).toEqual({ status: 'dispatched' });
    expect(current(controller)).toEqual(full);
    subscription.unsubscribe();
  });

  it('keeps ready active and publishes for a fresh late caller only', () => {
    const controller = createDatasetStartupController({
      workerEpoch,
      defaultSettings: settings,
      includedConnectorIds: ['free-work'],
    });
    driveReady(controller);
    expect(current(controller).command).toBeNull();
    expect(
      controller.dispatch({
        type: 'START',
        attemptId,
        workerEpoch,
        requestId,
        settingsRecoveryRequestId,
      })
    ).toEqual({ status: 'dispatched' });
    expect(current(controller).state).toBe('ready');
    expect(current(controller).command).toBeNull();
    expect(current(controller).pendingRequestIds).toEqual([]);

    expect(
      controller.dispatch({
        type: 'START',
        attemptId,
        workerEpoch,
        requestId: lateRequestId,
        settingsRecoveryRequestId,
      })
    ).toEqual({ status: 'dispatched' });
    expect(current(controller).state).toBe('publishingBootstrap');
    expect(current(controller).pendingRequestIds).toEqual([lateRequestId]);
    expect(current(controller).command).toMatchObject({
      type: 'PUBLISH_BOOTSTRAPS',
      requestIds: [lateRequestId],
    });
    sendResult(controller, 'BOOTSTRAP_PUBLISHED', {
      proof: publicationProof([lateRequestId]),
    });
    expect(selectDatasetStartupBootstrap(current(controller), lateRequestId)?.requestId).toBe(
      lateRequestId
    );
    expect(current(controller).pendingRequestIds).toEqual([]);
  });

  it('purges each late batch across thousands of cycles and deterministically republishes old IDs', () => {
    const controller = createDatasetStartupController({
      workerEpoch,
      defaultSettings: settings,
      includedConnectorIds: ['free-work'],
    });
    driveReady(controller);
    const firstLateRequestId = boundedRequestId(10_000);

    for (let index = 0; index < 2_000; index += 1) {
      const cycleRequestId = boundedRequestId(10_000 + index);
      expect(
        controller.dispatch({
          type: 'START',
          attemptId,
          workerEpoch,
          requestId: cycleRequestId,
          settingsRecoveryRequestId,
        })
      ).toEqual({ status: 'dispatched' });
      expect(current(controller).pendingRequestIds).toEqual([cycleRequestId]);
      expect(current(controller).command).toMatchObject({
        type: 'PUBLISH_BOOTSTRAPS',
        requestIds: [cycleRequestId],
      });
      sendResult(controller, 'BOOTSTRAP_PUBLISHED', {
        proof: publicationProof([cycleRequestId]),
      });
      expect(current(controller).pendingRequestIds).toEqual([]);
      expect(current(controller).bootstraps).toHaveLength(1);
    }

    expect(current(controller).bootstraps[0]?.requestId).toBe(boundedRequestId(11_999));
    expect(selectDatasetStartupBootstrap(current(controller), firstLateRequestId)).toBeNull();
    expect(
      controller.dispatch({
        type: 'START',
        attemptId,
        workerEpoch,
        requestId: firstLateRequestId,
        settingsRecoveryRequestId,
      })
    ).toEqual({ status: 'dispatched' });
    expect(current(controller).command).toMatchObject({
      type: 'PUBLISH_BOOTSTRAPS',
      requestIds: [firstLateRequestId],
    });
    sendResult(controller, 'BOOTSTRAP_PUBLISHED', {
      proof: publicationProof([firstLateRequestId]),
    });
    expect(selectDatasetStartupBootstrap(current(controller), firstLateRequestId)?.requestId).toBe(
      firstLateRequestId
    );
    expect(current(controller).pendingRequestIds).toEqual([]);
    expect(current(controller).bootstraps).toHaveLength(1);
  });

  it('fences a post-admission publication failure before failed and retry', () => {
    const controller = createDatasetStartupController({
      workerEpoch,
      defaultSettings: settings,
      includedConnectorIds: ['free-work'],
    });
    enterFailureFence(controller);

    const fenceCommandId = commandId(controller);
    expect(
      controller.dispatch({
        type: 'FAILURE_FENCED',
        attemptId,
        workerEpoch,
        commandId: fenceCommandId,
        proof: {
          version: 1,
          attemptId,
          workerEpoch,
          dataEpoch,
          admissionProofId,
          previousAuthorityRevision: 4,
          authorityRevision: 5,
          admission: 'closed',
          activeLeaseCount: 1,
          allLeasesRevoked: true,
        },
      })
    ).toEqual({ status: 'rejected', reason: 'invalid_event' });
    expect(current(controller).state).toBe('fencingFailure');

    expect(
      controller.dispatch({
        type: 'RETRY',
        attemptId: retryAttemptId,
        workerEpoch,
        requestId: retryRequestId,
        settingsRecoveryRequestId: retrySettingsRequestId,
      })
    ).toEqual({ status: 'dispatched' });
    expect(current(controller).state).toBe('fencingFailure');
    expect(commandId(controller)).toBe(fenceCommandId);

    expect(
      controller.dispatch({
        type: 'FAILURE_FENCED',
        attemptId,
        workerEpoch,
        commandId: fenceCommandId,
        proof: {
          version: 1,
          attemptId,
          workerEpoch,
          dataEpoch,
          admissionProofId,
          previousAuthorityRevision: 4,
          authorityRevision: 5,
          admission: 'closed',
          activeLeaseCount: 0,
          allLeasesRevoked: true,
        },
      })
    ).toEqual({ status: 'dispatched' });
    expect(current(controller).state).toBe('failed');
    expect(
      controller.dispatch({
        type: 'RETRY',
        attemptId: retryAttemptId,
        workerEpoch,
        requestId: retryRequestId,
        settingsRecoveryRequestId: retrySettingsRequestId,
      })
    ).toEqual({ status: 'dispatched' });
    expect(current(controller).state).toBe('checkingResetJournal');
  });

  it('keeps an ambiguous authority fence failure blocked and non-retryable', () => {
    const controller = createDatasetStartupController({
      workerEpoch,
      defaultSettings: settings,
      includedConnectorIds: ['free-work'],
    });
    enterFailureFence(controller);
    sendResult(controller, 'STEP_FAILED', {
      error: {
        version: 1,
        code: 'AUTHORITY_FENCE_FAILED',
        stage: 'failure_fence',
        message: 'authority closure is ambiguous',
        retryable: false,
        destructiveEffectPerformed: false,
      },
    });
    expect(current(controller).state).toBe('failureFenceBlocked');
    expect(current(controller).fenceError?.code).toBe('AUTHORITY_FENCE_FAILED');

    expect(
      controller.dispatch({
        type: 'RETRY',
        attemptId: retryAttemptId,
        workerEpoch,
        requestId: retryRequestId,
        settingsRecoveryRequestId: retrySettingsRequestId,
      })
    ).toEqual({ status: 'dispatched' });
    expect(current(controller).state).toBe('failureFenceBlocked');
  });

  it('lets a correlated reset preempt ready without replaying startup', () => {
    const controller = createDatasetStartupController({
      workerEpoch,
      defaultSettings: settings,
      includedConnectorIds: ['free-work'],
    });
    driveReady(controller);
    expect(
      controller.dispatch({
        type: 'RESET_PREEMPTED',
        attemptId,
        workerEpoch,
        resetId,
        journal: null,
      })
    ).toEqual({ status: 'dispatched' });
    expect(current(controller)).toMatchObject({
      state: 'resetOwned',
      command: {
        type: 'TRANSFER_RESET_OWNERSHIP',
        reset: { resetId, source: 'active_reset_preemption' },
      },
    });
  });

  it('projects a deeply frozen DTO without an actor or native XState snapshot', () => {
    const controller = createDatasetStartupController({
      workerEpoch,
      defaultSettings: settings,
      includedConnectorIds: ['free-work'],
    });
    driveReady(controller);
    const snapshot = current(controller);
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.pendingRequestIds)).toBe(true);
    expect(Object.isFrozen(snapshot.bootstraps)).toBe(true);
    expect(Object.isFrozen(snapshot.bootstraps[0])).toBe(true);
    expect(snapshot).not.toHaveProperty('context');
    expect(snapshot).not.toHaveProperty('machine');
    expect(snapshot).not.toHaveProperty('_nodes');
    expect(snapshot).not.toHaveProperty('send');
  });
});
