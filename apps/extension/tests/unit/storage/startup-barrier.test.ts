import { describe, expect, it, vi } from 'vitest';

import type { AppSettings } from '../../../src/lib/core/types/app-settings';
import {
  createStartupBarrier,
  StartupBarrierError,
  type StartupBarrier,
  type StartupBarrierPortContext,
  type StartupBarrierPorts,
} from '../../../src/lib/shell/storage/startup-barrier';
import {
  BACKGROUND_SCHEDULING_HANDOFF_KEY,
  LOCAL_DATA_RESET_JOURNAL_KEY,
  backgroundSchedulingHandoffBundleDigest,
  type LocalDataResetPhase,
} from '../../../src/models/local-data-reset.contract';
import { settingsDigest } from '../../../src/models/settings-persistence.contract';

const workerEpoch = '00000000-0000-4000-8000-000000000001';
const attemptId = '00000000-0000-4000-8000-000000000002';
const requestId = '00000000-0000-4000-8000-000000000003';
const settingsRecoveryRequestId = '00000000-0000-4000-8000-000000000004';
const dataEpoch = '00000000-0000-4000-8000-000000000005';
const admissionProofId = '00000000-0000-4000-8000-000000000006';
const alarmProofId = '00000000-0000-4000-8000-000000000007';
const resetId = '00000000-0000-4000-8000-000000000008';
const previousDataEpoch = '00000000-0000-4000-8000-000000000009';
const nextDataEpoch = '00000000-0000-4000-8000-00000000000a';
const resetSettingsRequestId = '00000000-0000-4000-8000-00000000000b';
const resetBootstrapRequestId = '00000000-0000-4000-8000-00000000000c';
const secondRequestId = '00000000-0000-4000-8000-00000000000d';
const retryAttemptId = '00000000-0000-4000-8000-00000000000e';
const retryRequestId = '00000000-0000-4000-8000-00000000000f';
const retrySettingsRequestId = '00000000-0000-4000-8000-000000000010';
const foreignId = '00000000-0000-4000-8000-000000000011';
const thirdRequestId = '00000000-0000-4000-8000-000000000012';
const resetHandoffSidecarId = '00000000-0000-4000-8000-000000000013';
const resetHandoffId = '00000000-0000-4000-8000-000000000014';
const resetHandoffLaneId = '00000000-0000-4000-8000-000000000015';
const resetHandoffWorkerEpoch = '00000000-0000-4000-8000-000000000016';
const resetHandoffManifestDigest = 'd'.repeat(64);

function resetCleanupRecovery() {
  return {
    version: 1,
    manifestDigest: resetHandoffManifestDigest,
    bundles: ([0, 1, 2] as const).map((casAttempt) => {
      const commandId = `00000000-0000-4000-8000-00000000002${casAttempt}`;
      const resultId = `00000000-0000-4000-8000-00000000003${casAttempt}`;
      const capabilityId = `00000000-0000-4000-8000-00000000004${casAttempt}`;
      return {
        kind: 'sidecar_cleanup' as const,
        controlAttemptIndex: null,
        transitionIndex: 132,
        casAttempt,
        commandId,
        resultId,
        capabilityId,
        bundleDigest: backgroundSchedulingHandoffBundleDigest({
          sidecarId: resetHandoffSidecarId,
          handoffId: resetHandoffId,
          kind: 'sidecar_cleanup',
          controlAttemptIndex: null,
          transitionIndex: 132,
          casAttempt,
          commandId,
          resultId,
          capabilityId,
        }),
      };
    }),
  };
}

type MutablePorts = { -readonly [Key in keyof StartupBarrierPorts]: StartupBarrierPorts[Key] };

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

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

function deferredPort<Command, Result>(
  entered: ReturnType<typeof deferred>,
  release: ReturnType<typeof deferred>,
  port: (command: Command, context: StartupBarrierPortContext) => Promise<Result>
): (command: Command, context: StartupBarrierPortContext) => Promise<Result> {
  return async (command, context) => {
    entered.resolve();
    await release.promise;
    return port(command, context);
  };
}

function unexpectedPort(name: string): () => Promise<never> {
  return async () => {
    throw new Error(`unexpected port: ${name}`);
  };
}

function commandEvent(
  command: { attemptId: string; workerEpoch: string; commandId: string },
  type: string,
  extra: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    type,
    attemptId: command.attemptId,
    workerEpoch: command.workerEpoch,
    commandId: command.commandId,
    ...extra,
  };
}

function resetJournal(phase: LocalDataResetPhase) {
  const backgroundSchedulingHandoff = ['journaled', 'fenced'].includes(phase)
    ? null
    : {
        schemaVersion: 1 as const,
        storageKey: BACKGROUND_SCHEDULING_HANDOFF_KEY,
        sidecarId: resetHandoffSidecarId,
        handoffId: resetHandoffId,
        resetId,
        checkpointRevision: 0,
        slotCount: 0,
        payloadDigest: 'a'.repeat(64),
        sourceControlLaneId: resetHandoffLaneId,
        sourceControlLaneAttemptIndex: 0 as const,
        sourceWorkerEpoch: resetHandoffWorkerEpoch,
        capabilityManifestDigest: resetHandoffManifestDigest,
        cleanupRecovery: resetCleanupRecovery(),
        sidecarEncodedBytes: 24,
      };
  return {
    schemaVersion: 1,
    resetId,
    previousDataEpoch,
    nextDataEpoch,
    settingsRecoveryRequestId: resetSettingsRequestId,
    settingsBootstrapRequestId: resetBootstrapRequestId,
    phase,
    backgroundSchedulingHandoff,
    requestedAt: 1,
    retryCount: 0,
    lastError: null,
  } as const;
}

function pendingResetRequest() {
  return {
    type: 'RESET_REQUESTED',
    resetId,
    previousDataEpoch,
    nextDataEpoch,
    settingsRecoveryRequestId: resetSettingsRequestId,
    settingsBootstrapRequestId: resetBootstrapRequestId,
    requestedAt: 1,
  } as const;
}

function envelope() {
  return {
    version: 2,
    dataEpoch,
    revision: 0,
    generation: 0,
    settings,
    journal: null,
    outcomes: [],
  } as const;
}

function bootstrapRequestId(index: number): string {
  return `10000000-0000-4000-8000-${index.toString(16).padStart(12, '0')}`;
}

function publicationEvent(
  command: Parameters<StartupBarrierPorts['publishBootstraps']>[0],
  bootstraps: unknown
): Record<string, unknown> {
  return commandEvent(command, 'BOOTSTRAP_PUBLISHED', {
    proof: {
      version: 1,
      attemptId: command.attemptId,
      workerEpoch: command.workerEpoch,
      dataEpoch: command.dataEpoch,
      admissionProofId: command.admissionProofId,
      bootstraps,
    },
  });
}

function nominalPorts(order: string[] = []): MutablePorts {
  return {
    readResetGate: async (command) => {
      order.push('reset_gate');
      return commandEvent(command, 'RESET_GATE_CLEARED', { proof: resetGateClearedProof() });
    },
    preflightResetRequest: async (command) => {
      order.push('reset_preflight');
      return commandEvent(command, 'RESET_PREFLIGHT_FRESH', {
        proof: {
          version: 1,
          result: 'fresh',
          resetId: command.request.resetId,
          previousDataEpoch: command.request.previousDataEpoch,
          nextDataEpoch: command.request.nextDataEpoch,
          settingsRecoveryRequestId: command.request.settingsRecoveryRequestId,
          settingsBootstrapRequestId: command.request.settingsBootstrapRequestId,
          requestedAt: command.request.requestedAt,
          resetJournalAbsent: true,
          backgroundSchedulingHandoffAbsent: true,
          canonicalDataEpoch: command.request.previousDataEpoch,
        },
      });
    },
    readVersions: async (command) => {
      order.push('versions');
      return commandEvent(command, 'VERSIONS_READ', {
        versions: {
          version: 1,
          databaseName: 'missionpulse',
          storedDbVersion: 5,
          storedDataVersion: 2,
          targetDbVersion: 6,
          targetDataVersion: 3,
        },
      });
    },
    upgradeStructure: async (command) => {
      order.push('structure');
      return commandEvent(command, 'STRUCTURE_COMMITTED', {
        proof: {
          version: 1,
          databaseName: 'missionpulse',
          fromDbVersion: command.fromDbVersion,
          dbVersion: 6,
          transactionCommitted: true,
          destructiveRepairPerformed: false,
        },
      });
    },
    migrateData: async (command) => {
      order.push('data');
      return commandEvent(command, 'DATA_COMMITTED', {
        proof: {
          version: 1,
          fromDataVersion: command.fromDataVersion,
          appDataVersion: 3,
          transactionCommitted: true,
          markerReadBack: 3,
          destructiveRepairPerformed: false,
        },
      });
    },
    verifyCriticalAndEpoch: async (command) => {
      order.push('verification');
      return commandEvent(command, 'VERIFICATION_PASSED', {
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
    },
    wrapSettingsEnvelope: async (command) => {
      order.push('settings_envelope');
      return commandEvent(command, 'SETTINGS_ENVELOPE_WRAPPED', {
        proof: {
          version: 1,
          dataEpoch,
          markerReadBack: 3,
          decodePolicy: command.decodePolicy,
          readBack: true,
          envelope: envelope(),
        },
      });
    },
    recoverPreparedLedgers: async (command) => {
      order.push('prepared_ledgers');
      return commandEvent(command, 'PREPARED_RECOVERED', {
        proof: {
          version: 1,
          workerEpoch,
          dataEpoch,
          recoveryCompleted: true,
          olderWorkerPreparedRemaining: 0,
        },
      });
    },
    recoverSettingsAndAlarm: async (command) => {
      order.push('settings_recovery');
      return {
        type: 'SETTINGS_RECOVERY_PASSED',
        attemptId: command.attemptId,
        workerEpoch: command.workerEpoch,
        dataEpoch: command.dataEpoch,
        requestId: command.requestId,
        commandId: command.commandId,
        snapshot: {
          version: 1,
          dataEpoch: command.dataEpoch,
          requestId: command.requestId,
          commandId: command.commandId,
          resetJournalAbsent: true,
          envelope: envelope(),
          alarmProof: {
            version: 1,
            kind: 'AUTO_SCAN_ALARM',
            alarmName: 'auto-scan',
            enabled: true,
            periodInMinutes: 30,
            dataEpoch: command.dataEpoch,
            envelopeRevision: 0,
            envelopeGeneration: 0,
            settingsDigest: settingsDigest(settings),
            proofId: alarmProofId,
            requestId: command.requestId,
            commandId: command.commandId,
          },
        },
      };
    },
    openEpochAdmission: async (command) => {
      order.push('admission');
      return commandEvent(command, 'ADMISSION_OPENED', {
        proof: {
          version: 1,
          attemptId: command.attemptId,
          workerEpoch: command.workerEpoch,
          dataEpoch: command.dataEpoch,
          authorityRevision: 4,
          admission: 'open',
          proofId: admissionProofId,
        },
      });
    },
    publishBootstraps: async (command) => {
      order.push('bootstrap');
      return publicationEvent(
        command,
        command.requestIds.map((publishedRequestId) => ({
          version: 1,
          requestId: publishedRequestId,
          workerEpoch: command.workerEpoch,
          dataEpoch: command.dataEpoch,
        }))
      );
    },
    fenceStartupFailure: async (command) => {
      order.push('failure_fence');
      return commandEvent(command, 'FAILURE_FENCED', {
        proof: {
          version: 1,
          attemptId: command.attemptId,
          workerEpoch: command.workerEpoch,
          dataEpoch: command.dataEpoch,
          admissionProofId: command.admissionProofId,
          previousAuthorityRevision: command.openedAuthorityRevision,
          authorityRevision: command.openedAuthorityRevision + 1,
          admission: 'closed',
          activeLeaseCount: 0,
          allLeasesRevoked: true,
        },
      });
    },
    transferResetOwnership: async () => {
      order.push('reset_transfer');
    },
  };
}

function createNominalBarrier(ports: StartupBarrierPorts, ids: string[] = [attemptId]) {
  let index = 0;
  return createStartupBarrier({
    workerEpoch,
    defaultSettings: settings,
    includedConnectorIds: ['free-work'],
    allocateAttemptId: () => ids[index++] ?? ids.at(-1) ?? attemptId,
    ports,
  });
}

describe('startup barrier', () => {
  it('reads reset journal before any DB open reservation or migration', async () => {
    const order: string[] = [];
    const resetRead = deferred();
    const ports: StartupBarrierPorts = {
      readResetGate: async (command) => {
        order.push('reset_gate');
        await resetRead.promise;
        return {
          type: 'STEP_FAILED',
          attemptId: command.attemptId,
          workerEpoch: command.workerEpoch,
          commandId: command.commandId,
          error: {
            version: 1,
            code: 'RESET_GATE_READ_FAILED',
            stage: 'reset_gate',
            message: 'reset read failed',
            retryable: true,
            destructiveEffectPerformed: false,
          },
        };
      },
      preflightResetRequest: unexpectedPort('preflightResetRequest'),
      readVersions: async () => {
        order.push('versions');
        throw new Error('versions must not start before reset gate completion');
      },
      upgradeStructure: unexpectedPort('upgradeStructure'),
      migrateData: async () => {
        order.push('migration');
        throw new Error('migration must not start before reset gate completion');
      },
      verifyCriticalAndEpoch: unexpectedPort('verifyCriticalAndEpoch'),
      wrapSettingsEnvelope: unexpectedPort('wrapSettingsEnvelope'),
      recoverPreparedLedgers: unexpectedPort('recoverPreparedLedgers'),
      recoverSettingsAndAlarm: unexpectedPort('recoverSettingsAndAlarm'),
      openEpochAdmission: async () => {
        order.push('admission');
        throw new Error('admission must not start before reset gate completion');
      },
      publishBootstraps: unexpectedPort('publishBootstraps'),
      fenceStartupFailure: unexpectedPort('fenceStartupFailure'),
      transferResetOwnership: unexpectedPort('transferResetOwnership'),
    };
    const barrier = createStartupBarrier({
      workerEpoch,
      defaultSettings: settings,
      includedConnectorIds: ['free-work'],
      allocateAttemptId: () => attemptId,
      ports,
    });

    const readiness = barrier.ensureReady({ requestId, settingsRecoveryRequestId });
    await vi.waitFor(() => expect(order).toEqual(['reset_gate']));
    expect(order).not.toContain('versions');
    expect(order).not.toContain('migration');
    expect(order).not.toContain('admission');

    resetRead.resolve();
    await expect(readiness).rejects.toBeInstanceOf(StartupBarrierError);
  });

  it('rejects a cleared gate proof that does not prove the orphan handoff absent', async () => {
    const order: string[] = [];
    const ports = nominalPorts(order);
    ports.readResetGate = async (command) => {
      order.push('reset_gate');
      return commandEvent(command, 'RESET_GATE_CLEARED', {
        proof: { ...resetGateClearedProof(), orphanHandoffSidecarAbsent: false },
      });
    };
    const barrier = createNominalBarrier(ports);
    await expect(
      barrier.ensureReady({ requestId, settingsRecoveryRequestId })
    ).rejects.toBeInstanceOf(StartupBarrierError);
    expect(order).toEqual(['reset_gate']);
  });

  const resetPhases: LocalDataResetPhase[] = [
    'journaled',
    'fenced',
    'quiesced',
    'handles_closed',
    'database_deleted',
    'session_cleared',
    'local_cleared',
    'database_reinitialized',
    'settings_aligned',
    'committed',
    'handoff_adopted',
    'handoff_cleared',
  ];

  it.each(resetPhases)(
    'routes reset journal phase %s to reset_owned with zero ordinary startup effect',
    async (phase) => {
      const ordinary: string[] = [];
      let transfers = 0;
      const ports = nominalPorts(ordinary);
      ports.readResetGate = async (command) =>
        commandEvent(command, 'RESET_JOURNAL_FOUND', { journal: resetJournal(phase) });
      ports.transferResetOwnership = async () => {
        transfers += 1;
      };
      const barrier = createNominalBarrier(ports);

      await expect(
        barrier.ensureReady({ requestId, settingsRecoveryRequestId })
      ).rejects.toMatchObject({ kind: 'reset_owned' });
      expect(barrier.snapshot().state).toBe('resetOwned');
      expect(transfers).toBe(1);
      expect(ordinary).toEqual([]);
    }
  );

  it('preflights a journal-absent pending reset before any migration', async () => {
    const order: string[] = [];
    const ports = nominalPorts(order);
    ports.readResetGate = async (command) => {
      order.push('reset_gate');
      return commandEvent(command, 'RESET_REQUEST_PENDING', {
        request: pendingResetRequest(),
      });
    };
    const barrier = createNominalBarrier(ports);

    await expect(
      barrier.ensureReady({ requestId, settingsRecoveryRequestId })
    ).rejects.toMatchObject({ kind: 'reset_owned' });
    expect(order).toEqual(['reset_gate', 'reset_preflight', 'reset_transfer']);
  });

  it('recognizes an already-completed pending reset and still transfers ownership', async () => {
    const order: string[] = [];
    const ports = nominalPorts(order);
    ports.readResetGate = async (command) => {
      order.push('reset_gate');
      return commandEvent(command, 'RESET_REQUEST_PENDING', {
        request: pendingResetRequest(),
      });
    };
    ports.preflightResetRequest = async (command) => {
      order.push('reset_preflight');
      return commandEvent(command, 'RESET_COMPLETION_RECOGNIZED', {
        proof: {
          version: 1,
          result: 'already_completed',
          resetId,
          previousDataEpoch,
          nextDataEpoch,
          settingsRecoveryRequestId: resetSettingsRequestId,
          settingsBootstrapRequestId: resetBootstrapRequestId,
          requestedAt: 1,
          resetJournalAbsent: true,
          backgroundSchedulingHandoffAbsent: true,
          canonicalDataEpoch: nextDataEpoch,
          receipt: {
            schemaVersion: 1,
            resetId,
            previousDataEpoch,
            nextDataEpoch,
            settingsRecoveryRequestId: resetSettingsRequestId,
            settingsBootstrapRequestId: resetBootstrapRequestId,
            requestedAt: 1,
            phase: 'committed',
          },
          authority: {
            version: 1,
            databaseName: 'missionpulse',
            dbVersion: 6,
            appDataVersion: 3,
            schemaVerified: true,
            dataEpoch: nextDataEpoch,
            trackingMeta: {
              key: 'tracking_meta',
              schemaVersion: 1,
              dataEpoch: nextDataEpoch,
              collectionRevision: 0,
            },
          },
        },
      });
    };
    const barrier = createNominalBarrier(ports);

    await expect(
      barrier.ensureReady({ requestId, settingsRecoveryRequestId })
    ).rejects.toMatchObject({ kind: 'reset_owned' });
    expect(order).toEqual(['reset_gate', 'reset_preflight', 'reset_transfer']);
  });

  it('calls normal startup stages in the exact modeled order', async () => {
    const order: string[] = [];
    const barrier = createNominalBarrier(nominalPorts(order));

    await expect(barrier.ensureReady({ requestId, settingsRecoveryRequestId })).resolves.toEqual({
      version: 1,
      requestId,
      workerEpoch,
      dataEpoch,
    });
    expect(order).toEqual([
      'reset_gate',
      'versions',
      'structure',
      'data',
      'verification',
      'settings_envelope',
      'prepared_ledgers',
      'settings_recovery',
      'admission',
      'bootstrap',
    ]);
  });

  it('rejects MigrationResult ok:false as a typed failure without admission or publication', async () => {
    const order: string[] = [];
    const ports = nominalPorts(order);
    ports.migrateData = async () => ({
      ok: false,
      code: 'data_throw',
      message: 'migration exploded',
    });
    const barrier = createNominalBarrier(ports);

    await expect(
      barrier.ensureReady({ requestId, settingsRecoveryRequestId })
    ).rejects.toMatchObject({
      kind: 'startup_failed',
      startupError: {
        code: 'DATA_MIGRATION_FAILED',
        stage: 'data',
        retryable: true,
        destructiveEffectPerformed: false,
      },
    });
    expect(order).toEqual(['reset_gate', 'versions', 'structure']);
    expect(order).not.toContain('admission');
    expect(order).not.toContain('bootstrap');
  });

  it.each(['attemptId', 'workerEpoch', 'dataEpoch', 'requestId', 'commandId'] as const)(
    'rejects a Settings recovery proof with mismatched %s before admission',
    async (field) => {
      const order: string[] = [];
      const ports = nominalPorts(order);
      const recover = ports.recoverSettingsAndAlarm;
      ports.recoverSettingsAndAlarm = async (command, context) => ({
        ...((await recover(command, context)) as Record<string, unknown>),
        [field]: foreignId,
      });
      const barrier = createNominalBarrier(ports);

      await expect(
        barrier.ensureReady({ requestId, settingsRecoveryRequestId })
      ).rejects.toMatchObject({
        kind: 'startup_failed',
        startupError: {
          code: 'PROTOCOL_ERROR',
          stage: 'settings_recovery',
          retryable: false,
        },
      });
      expect(order).not.toContain('admission');
      expect(order).not.toContain('bootstrap');
    }
  );

  it('returns the exact same in-flight promise and result to duplicate concurrent callers', async () => {
    const order: string[] = [];
    const releaseReset = deferred();
    const ports = nominalPorts(order);
    const readReset = ports.readResetGate;
    ports.readResetGate = async (command, context) => {
      await releaseReset.promise;
      return readReset(command, context);
    };
    let allocations = 0;
    const barrier = createStartupBarrier({
      workerEpoch,
      defaultSettings: settings,
      includedConnectorIds: ['free-work'],
      allocateAttemptId: () => {
        allocations += 1;
        return attemptId;
      },
      ports,
    });

    const first = barrier.ensureReady({ requestId, settingsRecoveryRequestId });
    const duplicate = barrier.ensureReady({ requestId, settingsRecoveryRequestId });
    expect(duplicate).toBe(first);
    expect(allocations).toBe(1);

    releaseReset.resolve();
    const [firstResult, duplicateResult] = await Promise.all([first, duplicate]);
    expect(duplicateResult).toBe(firstResult);
    expect(order).toEqual([
      'reset_gate',
      'versions',
      'structure',
      'data',
      'verification',
      'settings_envelope',
      'prepared_ledgers',
      'settings_recovery',
      'admission',
      'bootstrap',
    ]);
  });

  it('joins a distinct active requestId and resolves each caller with its own bootstrap', async () => {
    const order: string[] = [];
    const releaseReset = deferred();
    const ports = nominalPorts(order);
    const readReset = ports.readResetGate;
    ports.readResetGate = async (command, context) => {
      await releaseReset.promise;
      return readReset(command, context);
    };
    let allocations = 0;
    const barrier = createStartupBarrier({
      workerEpoch,
      defaultSettings: settings,
      includedConnectorIds: ['free-work'],
      allocateAttemptId: () => {
        allocations += 1;
        return attemptId;
      },
      ports,
    });

    const first = barrier.ensureReady({ requestId, settingsRecoveryRequestId });
    const second = barrier.ensureReady({ requestId: secondRequestId, settingsRecoveryRequestId });
    expect(second).not.toBe(first);
    expect(allocations).toBe(1);

    releaseReset.resolve();
    await expect(first).resolves.toMatchObject({ requestId });
    await expect(second).resolves.toMatchObject({ requestId: secondRequestId });
    expect(order.filter((stage) => stage === 'bootstrap')).toHaveLength(1);
    expect(order.filter((stage) => stage === 'versions')).toHaveLength(1);
  });

  it('reserves startup before a reentrant attempt allocator and fans out both callers once', async () => {
    const order: string[] = [];
    const barrierRef: { current: StartupBarrier | null } = { current: null };
    let nested!: Promise<{ requestId: string }>;
    let allocations = 0;
    const barrier = createStartupBarrier({
      workerEpoch,
      defaultSettings: settings,
      includedConnectorIds: ['free-work'],
      allocateAttemptId: () => {
        allocations += 1;
        if (allocations === 1) {
          const currentBarrier = barrierRef.current;
          if (currentBarrier === null) {
            throw new Error('barrier reference is unavailable');
          }
          nested = currentBarrier.ensureReady({
            requestId: secondRequestId,
            settingsRecoveryRequestId,
          });
        }
        return attemptId;
      },
      ports: nominalPorts(order),
    });
    barrierRef.current = barrier;

    const outer = barrier.ensureReady({ requestId, settingsRecoveryRequestId });
    const [outerBootstrap, nestedBootstrap] = await Promise.all([outer, nested]);

    expect(allocations).toBe(1);
    expect(outerBootstrap.requestId).toBe(requestId);
    expect(nestedBootstrap.requestId).toBe(secondRequestId);
    expect(order.filter((stage) => stage === 'reset_gate')).toHaveLength(1);
    expect(order.filter((stage) => stage === 'bootstrap')).toHaveLength(1);
  });

  it('publishes driver coordination before a reentrant first port and runs every stage once', async () => {
    const order: string[] = [];
    const ports = nominalPorts(order);
    const readReset = ports.readResetGate;
    const barrierRef: { current: StartupBarrier | null } = { current: null };
    let nested!: Promise<{ requestId: string }>;
    let resetReads = 0;
    ports.readResetGate = async (command, context) => {
      resetReads += 1;
      if (resetReads === 1) {
        const currentBarrier = barrierRef.current;
        if (currentBarrier === null) {
          throw new Error('barrier reference is unavailable');
        }
        nested = currentBarrier.ensureReady({
          requestId: secondRequestId,
          settingsRecoveryRequestId,
        });
      }
      return readReset(command, context);
    };
    const barrier = createNominalBarrier(ports);
    barrierRef.current = barrier;

    const outer = barrier.ensureReady({ requestId, settingsRecoveryRequestId });
    const [outerBootstrap, nestedBootstrap] = await Promise.all([outer, nested]);

    expect(resetReads).toBe(1);
    expect(outerBootstrap.requestId).toBe(requestId);
    expect(nestedBootstrap.requestId).toBe(secondRequestId);
    for (const stage of [
      'versions',
      'structure',
      'data',
      'verification',
      'settings_envelope',
      'prepared_ledgers',
      'settings_recovery',
      'admission',
      'bootstrap',
    ]) {
      expect(
        order.filter((entry) => entry === stage),
        stage
      ).toHaveLength(1);
    }
  });

  it('rejects a duplicate active requestId carrying a foreign Settings recovery identity', async () => {
    const releaseReset = deferred();
    const ports = nominalPorts();
    const readReset = ports.readResetGate;
    ports.readResetGate = async (command, context) => {
      await releaseReset.promise;
      return readReset(command, context);
    };
    const barrier = createNominalBarrier(ports);
    const first = barrier.ensureReady({ requestId, settingsRecoveryRequestId });

    await expect(
      barrier.ensureReady({ requestId, settingsRecoveryRequestId: foreignId })
    ).rejects.toMatchObject({ kind: 'invalid_request' });
    releaseReset.resolve();
    await expect(first).resolves.toMatchObject({ requestId });
  });

  it('fences a post-admission failure before rejecting all waiters and clears inFlight', async () => {
    const order: string[] = [];
    const ports = nominalPorts(order);
    ports.publishBootstraps = async (command) => {
      order.push('bootstrap');
      return commandEvent(command, 'STEP_FAILED', {
        error: {
          version: 1,
          code: 'BOOTSTRAP_PUBLISH_FAILED',
          stage: 'bootstrap',
          message: 'publication failed',
          retryable: true,
          destructiveEffectPerformed: false,
        },
      });
    };
    const barrier = createNominalBarrier(ports);

    const first = barrier.ensureReady({ requestId, settingsRecoveryRequestId });
    const second = barrier.ensureReady({ requestId: secondRequestId, settingsRecoveryRequestId });
    expect(second).not.toBe(first);
    const failures = await Promise.allSettled([first, second]);

    expect(failures[0]).toMatchObject({
      status: 'rejected',
      reason: { kind: 'startup_failed', startupError: { code: 'BOOTSTRAP_PUBLISH_FAILED' } },
    });
    expect(failures[1]).toMatchObject({
      status: 'rejected',
      reason: { kind: 'startup_failed', startupError: { code: 'BOOTSTRAP_PUBLISH_FAILED' } },
    });
    expect(order.slice(-2)).toEqual(['bootstrap', 'failure_fence']);
    expect(barrier.snapshot()).toMatchObject({ state: 'failed', inFlight: false });
  });

  it('keeps an ambiguous post-admission fence non-retryable in failureFenceBlocked', async () => {
    const ports = nominalPorts();
    ports.publishBootstraps = async (command) =>
      commandEvent(command, 'STEP_FAILED', {
        error: {
          version: 1,
          code: 'BOOTSTRAP_PUBLISH_FAILED',
          stage: 'bootstrap',
          message: 'publication failed',
          retryable: true,
          destructiveEffectPerformed: false,
        },
      });
    ports.fenceStartupFailure = async (command) =>
      commandEvent(command, 'STEP_FAILED', {
        error: {
          version: 1,
          code: 'AUTHORITY_FENCE_FAILED',
          stage: 'failure_fence',
          message: 'closure ambiguous',
          retryable: false,
          destructiveEffectPerformed: false,
        },
      });
    const barrier = createNominalBarrier(ports, [attemptId, retryAttemptId]);

    await expect(
      barrier.ensureReady({ requestId, settingsRecoveryRequestId })
    ).rejects.toMatchObject({ kind: 'failure_fence_blocked' });
    expect(barrier.snapshot()).toMatchObject({
      state: 'failureFenceBlocked',
      inFlight: false,
      fenceError: { code: 'AUTHORITY_FENCE_FAILED', retryable: false },
    });
    await expect(
      barrier.ensureReady({ requestId: retryRequestId, settingsRecoveryRequestId })
    ).rejects.toMatchObject({ kind: 'failure_fence_blocked' });
  });

  it('does not expose failed or admit another caller while the post-admission fence is pending', async () => {
    const ports = nominalPorts();
    ports.publishBootstraps = async (command) =>
      commandEvent(command, 'STEP_FAILED', {
        error: {
          version: 1,
          code: 'BOOTSTRAP_PUBLISH_FAILED',
          stage: 'bootstrap',
          message: 'publication failed',
          retryable: true,
          destructiveEffectPerformed: false,
        },
      });
    const fenceEntered = deferred();
    const releaseFence = deferred();
    ports.fenceStartupFailure = deferredPort(fenceEntered, releaseFence, ports.fenceStartupFailure);
    const barrier = createNominalBarrier(ports, [attemptId, retryAttemptId]);
    const readiness = barrier.ensureReady({ requestId, settingsRecoveryRequestId });
    await fenceEntered.promise;

    expect(barrier.snapshot()).toMatchObject({
      state: 'fencingFailure',
      expectedStage: 'failure_fence',
      command: { type: 'FENCE_STARTUP_FAILURE', admissionProofId },
    });
    await expect(
      barrier.ensureReady({ requestId: retryRequestId, settingsRecoveryRequestId })
    ).rejects.toMatchObject({ kind: 'startup_failed' });
    expect(barrier.snapshot().state).toBe('fencingFailure');

    releaseFence.resolve();
    await expect(readiness).rejects.toMatchObject({ kind: 'startup_failed' });
    expect(barrier.snapshot().state).toBe('failed');
  });

  it('allocates a fresh attempt for the next explicit caller after a retryable failure', async () => {
    const order: string[] = [];
    const ports = nominalPorts(order);
    const verify = ports.verifyCriticalAndEpoch;
    let verificationRuns = 0;
    ports.verifyCriticalAndEpoch = async (command, context) => {
      verificationRuns += 1;
      if (verificationRuns === 1) {
        order.push('verification');
        return commandEvent(command, 'STEP_FAILED', {
          error: {
            version: 1,
            code: 'CRITICAL_VERIFICATION_FAILED',
            stage: 'verification',
            message: 'temporary verification failure',
            retryable: true,
            destructiveEffectPerformed: false,
          },
        });
      }
      return verify(command, context);
    };
    const barrier = createNominalBarrier(ports, [attemptId, retryAttemptId]);

    await expect(
      barrier.ensureReady({ requestId, settingsRecoveryRequestId })
    ).rejects.toMatchObject({ kind: 'startup_failed' });
    await expect(
      barrier.ensureReady({
        requestId: retryRequestId,
        settingsRecoveryRequestId: retrySettingsRequestId,
      })
    ).resolves.toMatchObject({
      requestId: retryRequestId,
      workerEpoch,
      dataEpoch,
    });
    expect(barrier.snapshot()).toMatchObject({
      state: 'ready',
      attemptId: retryAttemptId,
      retryCount: 1,
    });
  });

  it('turns a rejected port into a correlated STEP_FAILED and retries only explicitly', async () => {
    const ports = nominalPorts();
    const verify = ports.verifyCriticalAndEpoch;
    let runs = 0;
    ports.verifyCriticalAndEpoch = async (command, context) => {
      runs += 1;
      if (runs === 1) {
        throw new Error('verification transport rejected');
      }
      return verify(command, context);
    };
    const barrier = createNominalBarrier(ports, [attemptId, retryAttemptId]);

    await expect(
      barrier.ensureReady({ requestId, settingsRecoveryRequestId })
    ).rejects.toMatchObject({
      kind: 'startup_failed',
      startupError: {
        code: 'CRITICAL_VERIFICATION_FAILED',
        stage: 'verification',
        retryable: true,
      },
    });
    expect(barrier.snapshot().state).toBe('failed');

    await expect(
      barrier.ensureReady({
        requestId: retryRequestId,
        settingsRecoveryRequestId: retrySettingsRequestId,
      })
    ).resolves.toMatchObject({ requestId: retryRequestId });
    expect(runs).toBe(2);
  });

  it('publishes only a fresh late bootstrap after ready and keeps the last duplicate idempotent', async () => {
    const order: string[] = [];
    let allocations = 0;
    const barrier = createStartupBarrier({
      workerEpoch,
      defaultSettings: settings,
      includedConnectorIds: ['free-work'],
      allocateAttemptId: () => {
        allocations += 1;
        return attemptId;
      },
      ports: nominalPorts(order),
    });

    await barrier.ensureReady({ requestId, settingsRecoveryRequestId });
    order.splice(0);
    await expect(
      barrier.ensureReady({ requestId: secondRequestId, settingsRecoveryRequestId })
    ).resolves.toMatchObject({ requestId: secondRequestId, dataEpoch });
    expect(order).toEqual(['bootstrap']);
    expect(allocations).toBe(1);

    order.splice(0);
    await expect(
      barrier.ensureReady({ requestId: secondRequestId, settingsRecoveryRequestId })
    ).resolves.toMatchObject({ requestId: secondRequestId });
    expect(order).toEqual([]);
    expect(allocations).toBe(1);
  });

  it('reissues an expanded late publication when another caller joins the publication in flight', async () => {
    const order: string[] = [];
    const ports = nominalPorts(order);
    const barrier = createNominalBarrier(ports);
    await barrier.ensureReady({ requestId, settingsRecoveryRequestId });
    order.splice(0);

    const publishEntered = deferred();
    const releasePublish = deferred();
    let publicationCalls = 0;
    const publish = ports.publishBootstraps;
    ports.publishBootstraps = async (command, context) => {
      publicationCalls += 1;
      publishEntered.resolve();
      await releasePublish.promise;
      return publish(command, context);
    };
    const second = barrier.ensureReady({ requestId: secondRequestId, settingsRecoveryRequestId });
    await publishEntered.promise;
    const third = barrier.ensureReady({ requestId: thirdRequestId, settingsRecoveryRequestId });
    releasePublish.resolve();

    await expect(second).resolves.toMatchObject({ requestId: secondRequestId });
    await expect(third).resolves.toMatchObject({ requestId: thirdRequestId });
    expect(publicationCalls).toBe(2);
    expect(order).toEqual(['bootstrap', 'bootstrap']);
  });

  it('fences a failed late bootstrap publication without replaying startup stages', async () => {
    const order: string[] = [];
    const ports = nominalPorts(order);
    const barrier = createNominalBarrier(ports);
    await barrier.ensureReady({ requestId, settingsRecoveryRequestId });
    order.splice(0);
    ports.publishBootstraps = async (command) => {
      order.push('bootstrap');
      return commandEvent(command, 'STEP_FAILED', {
        error: {
          version: 1,
          code: 'BOOTSTRAP_PUBLISH_FAILED',
          stage: 'bootstrap',
          message: 'late publication failed',
          retryable: true,
          destructiveEffectPerformed: false,
        },
      });
    };

    await expect(
      barrier.ensureReady({ requestId: secondRequestId, settingsRecoveryRequestId })
    ).rejects.toMatchObject({ kind: 'startup_failed' });
    expect(order).toEqual(['bootstrap', 'failure_fence']);
  });

  it('fences a bootstrap proof whose admission identity is mismatched', async () => {
    const order: string[] = [];
    const ports = nominalPorts(order);
    ports.publishBootstraps = async (command) => {
      order.push('bootstrap');
      return commandEvent(command, 'BOOTSTRAP_PUBLISHED', {
        proof: {
          version: 1,
          attemptId: command.attemptId,
          workerEpoch: command.workerEpoch,
          dataEpoch: command.dataEpoch,
          admissionProofId: foreignId,
          bootstraps: command.requestIds.map((publishedRequestId) => ({
            version: 1,
            requestId: publishedRequestId,
            workerEpoch: command.workerEpoch,
            dataEpoch: command.dataEpoch,
          })),
        },
      });
    };
    const barrier = createNominalBarrier(ports);

    await expect(
      barrier.ensureReady({ requestId, settingsRecoveryRequestId })
    ).rejects.toMatchObject({
      kind: 'startup_failed',
      startupError: { code: 'PROTOCOL_ERROR', stage: 'bootstrap' },
    });
    expect(order.slice(-2)).toEqual(['bootstrap', 'failure_fence']);
    expect(barrier.snapshot().state).toBe('failed');
  });

  it.each(['prepared', 'settings'] as const)(
    'cannot reach ready when the %s recovery port is a no-op',
    async (portName) => {
      const order: string[] = [];
      const ports = nominalPorts(order);
      if (portName === 'prepared') {
        ports.recoverPreparedLedgers = async () => undefined;
      } else {
        ports.recoverSettingsAndAlarm = async () => undefined;
      }
      const barrier = createNominalBarrier(ports);

      await expect(
        barrier.ensureReady({ requestId, settingsRecoveryRequestId })
      ).rejects.toMatchObject({
        kind: 'startup_failed',
        startupError: {
          code: 'PROTOCOL_ERROR',
          stage: portName === 'prepared' ? 'prepared_ledgers' : 'settings_recovery',
        },
      });
      expect(order).not.toContain('admission');
      expect(order).not.toContain('bootstrap');
    }
  );

  it('admits 64 distinct waiters, rejects the 65th, and preserves correlated results', async () => {
    const releaseReset = deferred();
    const ports = nominalPorts();
    const readReset = ports.readResetGate;
    ports.readResetGate = async (command, context) => {
      await releaseReset.promise;
      return readReset(command, context);
    };
    const barrier = createNominalBarrier(ports);
    const waiters = Array.from({ length: 64 }, (_, index) =>
      barrier.ensureReady({
        requestId: bootstrapRequestId(index),
        settingsRecoveryRequestId,
      })
    );

    await expect(
      barrier.ensureReady({
        requestId: bootstrapRequestId(64),
        settingsRecoveryRequestId,
      })
    ).rejects.toMatchObject({ kind: 'capacity_exceeded' });
    expect(barrier.snapshot().pendingRequestIds).toHaveLength(64);

    releaseReset.resolve();
    const bootstraps = await Promise.all(waiters);
    expect(bootstraps.map((bootstrap) => bootstrap.requestId)).toEqual(
      Array.from({ length: 64 }, (_, index) => bootstrapRequestId(index))
    );
  });

  it('publishes a descriptor-only bootstrap array without executing its get trap', async () => {
    let getReads = 0;
    const ports = nominalPorts();
    ports.publishBootstraps = async (command) => {
      const values = command.requestIds.map((publishedRequestId) => ({
        version: 1,
        requestId: publishedRequestId,
        workerEpoch: command.workerEpoch,
        dataEpoch: command.dataEpoch,
      }));
      const hostile = new Proxy(values, {
        get(target, key, receiver) {
          getReads += 1;
          return Reflect.get(target, key, receiver);
        },
      });
      return publicationEvent(command, hostile);
    };
    const barrier = createNominalBarrier(ports);

    await expect(
      barrier.ensureReady({ requestId, settingsRecoveryRequestId })
    ).resolves.toMatchObject({ requestId });
    expect(getReads).toBe(0);
  });

  it('rejects hostile bootstrap arrays without getters, admission replay, or false ready', async () => {
    const shapes = [
      {
        name: 'revoked proxy',
        make() {
          const revocable = Proxy.revocable([], {});
          revocable.revoke();
          return revocable.proxy;
        },
      },
      { name: 'hole', make: () => new Array<unknown>(1) },
      {
        name: 'extra key',
        make() {
          const values = [{ version: 1, requestId, workerEpoch, dataEpoch }] as Array<unknown>;
          Object.defineProperty(values, 'extra', { value: true, enumerable: true });
          return values;
        },
      },
      {
        name: 'accessor',
        make(reads: { count: number }) {
          const values = [{ version: 1, requestId, workerEpoch, dataEpoch }] as Array<unknown>;
          Object.defineProperty(values, '0', {
            enumerable: true,
            configurable: true,
            get() {
              reads.count += 1;
              return { version: 1, requestId, workerEpoch, dataEpoch };
            },
          });
          return values;
        },
      },
      {
        name: 'oversized own length descriptor',
        make(_reads: { count: number }, ownKeys: { count: number }) {
          return new Proxy([], {
            getOwnPropertyDescriptor(target, key) {
              const descriptor = Reflect.getOwnPropertyDescriptor(target, key);
              return key === 'length' && descriptor !== undefined
                ? { ...descriptor, value: 2 }
                : descriptor;
            },
            ownKeys(target) {
              ownKeys.count += 1;
              return Reflect.ownKeys(target);
            },
          });
        },
      },
    ];

    for (const shape of shapes) {
      const reads = { count: 0 };
      const ownKeys = { count: 0 };
      const ports = nominalPorts();
      ports.publishBootstraps = async (command) =>
        publicationEvent(command, shape.make(reads, ownKeys));
      const barrier = createNominalBarrier(ports);

      await expect(
        barrier.ensureReady({ requestId, settingsRecoveryRequestId })
      ).rejects.toMatchObject({
        kind: 'startup_failed',
        startupError: { code: 'PROTOCOL_ERROR', stage: 'bootstrap' },
      });
      expect(reads.count, shape.name).toBe(0);
      if (shape.name === 'oversized own length descriptor') {
        expect(ownKeys.count).toBe(0);
      }
      expect(barrier.snapshot().state).toBe('failed');
    }
  });

  it('rejects an invalid reset preemption without aborting the active startup driver', async () => {
    const entered = deferred();
    const release = deferred();
    const ports = nominalPorts();
    const readReset = ports.readResetGate;
    let aborts = 0;
    ports.readResetGate = async (command, context) => {
      context.signal.addEventListener('abort', () => {
        aborts += 1;
      });
      entered.resolve();
      await release.promise;
      return readReset(command, context);
    };
    const barrier = createNominalBarrier(ports);
    const readiness = barrier.ensureReady({ requestId, settingsRecoveryRequestId });
    await entered.promise;

    await expect(
      barrier.preemptForReset({ resetId: 'not-a-reset-id', journal: null })
    ).rejects.toMatchObject({ kind: 'invalid_request' });
    expect(aborts).toBe(0);
    expect(barrier.snapshot()).toMatchObject({ state: 'checkingResetJournal', inFlight: true });

    release.resolve();
    await expect(readiness).resolves.toMatchObject({ requestId });
  });

  it('dispatches a valid RESET_PREEMPTED transition before aborting the active port', async () => {
    const entered = deferred();
    const release = deferred();
    const ports = nominalPorts();
    const barrierRef: { current: StartupBarrier | null } = { current: null };
    let stateAtAbort: string | null = null;
    ports.readResetGate = async (command, context) => {
      context.signal.addEventListener('abort', () => {
        stateAtAbort = barrierRef.current?.snapshot().state ?? null;
      });
      entered.resolve();
      await release.promise;
      return commandEvent(command, 'RESET_GATE_CLEARED', { proof: resetGateClearedProof() });
    };
    const barrier = createNominalBarrier(ports);
    barrierRef.current = barrier;
    const readiness = barrier.ensureReady({ requestId, settingsRecoveryRequestId });
    await entered.promise;

    await expect(barrier.preemptForReset({ resetId, journal: null })).resolves.toMatchObject({
      status: 'reset_owned',
      reset: { resetId, source: 'active_reset_preemption' },
    });
    expect(stateAtAbort).toBe('resetOwned');

    release.resolve();
    await expect(readiness).rejects.toMatchObject({ kind: 'reset_owned' });
  });

  it('publishes the reset transfer before an abort callback reenters with the same request', async () => {
    const startupEntered = deferred();
    const releaseStartup = deferred();
    const transferEntered = deferred();
    const releaseTransfer = deferred();
    const ports = nominalPorts();
    const barrierRef: { current: StartupBarrier | null } = { current: null };
    let reentrantOutcome!: Promise<
      | { status: 'fulfilled'; value: { status: string; reset: { resetId: string } } }
      | { status: 'rejected'; reason: unknown }
    >;
    ports.readResetGate = async (command, context) => {
      context.signal.addEventListener('abort', () => {
        const barrier = barrierRef.current;
        if (barrier === null) {
          throw new Error('barrier reference is unavailable');
        }
        reentrantOutcome = barrier.preemptForReset({ resetId, journal: null }).then(
          (value) => ({ status: 'fulfilled' as const, value }),
          (reason: unknown) => ({ status: 'rejected' as const, reason })
        );
      });
      startupEntered.resolve();
      await releaseStartup.promise;
      return commandEvent(command, 'RESET_GATE_CLEARED', { proof: resetGateClearedProof() });
    };
    let transfers = 0;
    let transferAborts = 0;
    ports.transferResetOwnership = async (_command, context) => {
      transfers += 1;
      context.signal.addEventListener('abort', () => {
        transferAborts += 1;
      });
      transferEntered.resolve();
      await releaseTransfer.promise;
    };
    const barrier = createNominalBarrier(ports);
    barrierRef.current = barrier;
    const readiness = barrier.ensureReady({ requestId, settingsRecoveryRequestId });
    const readinessOutcome = readiness.then(
      (value) => ({ status: 'fulfilled' as const, value }),
      (reason: unknown) => ({ status: 'rejected' as const, reason })
    );
    await startupEntered.promise;

    const owner = barrier.preemptForReset({ resetId, journal: null });
    await transferEntered.promise;
    expect(transfers).toBe(1);
    expect(transferAborts).toBe(0);

    releaseTransfer.resolve();
    await expect(owner).resolves.toMatchObject({ status: 'reset_owned', reset: { resetId } });
    await expect(reentrantOutcome).resolves.toMatchObject({
      status: 'fulfilled',
      value: { status: 'reset_owned', reset: { resetId } },
    });
    releaseStartup.resolve();
    await expect(readinessOutcome).resolves.toMatchObject({
      status: 'rejected',
      reason: { kind: 'reset_owned' },
    });
    expect(transfers).toBe(1);
    expect(transferAborts).toBe(0);
  });

  it('joins an exact duplicate preemption to the pending reset transfer without aborting it', async () => {
    const transferEntered = deferred();
    const releaseTransfer = deferred();
    const ports = nominalPorts();
    ports.readResetGate = async (command) =>
      commandEvent(command, 'RESET_JOURNAL_FOUND', { journal: resetJournal('journaled') });
    let transfers = 0;
    let aborts = 0;
    ports.transferResetOwnership = async (_command, context) => {
      transfers += 1;
      context.signal.addEventListener('abort', () => {
        aborts += 1;
      });
      transferEntered.resolve();
      await releaseTransfer.promise;
    };
    const barrier = createNominalBarrier(ports);
    const readiness = barrier.ensureReady({ requestId, settingsRecoveryRequestId });
    await transferEntered.promise;

    const duplicate = barrier.preemptForReset({
      resetId,
      journal: resetJournal('journaled'),
    });
    const observedDuplicate = duplicate.then(
      (value) => ({ status: 'fulfilled' as const, value }),
      (reason: unknown) => ({ status: 'rejected' as const, reason })
    );
    expect(transfers).toBe(1);
    expect(aborts).toBe(0);

    releaseTransfer.resolve();
    await expect(observedDuplicate).resolves.toMatchObject({
      status: 'fulfilled',
      value: {
        status: 'reset_owned',
        reset: { resetId, source: 'journal_at_boot' },
      },
    });
    await expect(readiness).rejects.toMatchObject({ kind: 'reset_owned' });
    expect(transfers).toBe(1);
    expect(aborts).toBe(0);
  });

  it('rejects a stale preemption without aborting a pending authorized reset transfer', async () => {
    const transferEntered = deferred();
    const releaseTransfer = deferred();
    const ports = nominalPorts();
    ports.readResetGate = async (command) =>
      commandEvent(command, 'RESET_JOURNAL_FOUND', { journal: resetJournal('journaled') });
    let aborts = 0;
    ports.transferResetOwnership = async (_command, context) => {
      context.signal.addEventListener('abort', () => {
        aborts += 1;
      });
      transferEntered.resolve();
      await releaseTransfer.promise;
    };
    const barrier = createNominalBarrier(ports);
    const readiness = barrier.ensureReady({ requestId, settingsRecoveryRequestId });
    await transferEntered.promise;

    await expect(
      barrier.preemptForReset({ resetId: foreignId, journal: null })
    ).rejects.toMatchObject({ kind: 'invalid_request' });
    expect(aborts).toBe(0);

    releaseTransfer.resolve();
    await expect(readiness).rejects.toMatchObject({ kind: 'reset_owned' });
    expect(aborts).toBe(0);
  });

  const preemptedStages = [
    'reset_gate',
    'reset_preflight',
    'versions',
    'structure',
    'data',
    'verification',
    'settings_envelope',
    'prepared_ledgers',
    'settings_recovery',
    'admission',
    'bootstrap',
    'failure_fence',
  ] as const;

  it.each(preemptedStages)(
    'dispatches exact RESET_PREEMPTED during %s, transfers ownership, and ignores stale completion',
    async (stage) => {
      const order: string[] = [];
      const ports = nominalPorts(order);
      if (stage === 'reset_preflight') {
        ports.readResetGate = async (command) =>
          commandEvent(command, 'RESET_REQUEST_PENDING', { request: pendingResetRequest() });
      }
      if (stage === 'failure_fence') {
        ports.publishBootstraps = async (command) =>
          commandEvent(command, 'STEP_FAILED', {
            error: {
              version: 1,
              code: 'BOOTSTRAP_PUBLISH_FAILED',
              stage: 'bootstrap',
              message: 'publication failed',
              retryable: true,
              destructiveEffectPerformed: false,
            },
          });
      }
      const entered = deferred();
      const release = deferred();
      switch (stage) {
        case 'reset_gate':
          ports.readResetGate = deferredPort(entered, release, ports.readResetGate);
          break;
        case 'reset_preflight':
          ports.preflightResetRequest = deferredPort(entered, release, ports.preflightResetRequest);
          break;
        case 'versions':
          ports.readVersions = deferredPort(entered, release, ports.readVersions);
          break;
        case 'structure':
          ports.upgradeStructure = deferredPort(entered, release, ports.upgradeStructure);
          break;
        case 'data':
          ports.migrateData = deferredPort(entered, release, ports.migrateData);
          break;
        case 'verification':
          ports.verifyCriticalAndEpoch = deferredPort(
            entered,
            release,
            ports.verifyCriticalAndEpoch
          );
          break;
        case 'settings_envelope':
          ports.wrapSettingsEnvelope = deferredPort(entered, release, ports.wrapSettingsEnvelope);
          break;
        case 'prepared_ledgers':
          ports.recoverPreparedLedgers = deferredPort(
            entered,
            release,
            ports.recoverPreparedLedgers
          );
          break;
        case 'settings_recovery':
          ports.recoverSettingsAndAlarm = deferredPort(
            entered,
            release,
            ports.recoverSettingsAndAlarm
          );
          break;
        case 'admission':
          ports.openEpochAdmission = deferredPort(entered, release, ports.openEpochAdmission);
          break;
        case 'bootstrap':
          ports.publishBootstraps = deferredPort(entered, release, ports.publishBootstraps);
          break;
        case 'failure_fence':
          ports.fenceStartupFailure = deferredPort(entered, release, ports.fenceStartupFailure);
          break;
      }
      let transfers = 0;
      ports.transferResetOwnership = async () => {
        transfers += 1;
      };
      const barrier = createNominalBarrier(ports);
      const readiness = barrier.ensureReady({ requestId, settingsRecoveryRequestId });
      await entered.promise;

      await expect(barrier.preemptForReset({ resetId, journal: null })).resolves.toMatchObject({
        status: 'reset_owned',
        attemptId,
        workerEpoch,
        reset: { source: 'active_reset_preemption', resetId },
      });
      expect(transfers).toBe(1);
      expect(barrier.snapshot().state).toBe('resetOwned');

      release.resolve();
      await expect(readiness).rejects.toMatchObject({ kind: 'reset_owned' });
      if (stage !== 'bootstrap') {
        expect(order).not.toContain('bootstrap');
      }
      if (stage === 'admission' || stage === 'bootstrap' || stage === 'failure_fence') {
        expect(order.filter((item) => item === 'admission').length).toBeLessThanOrEqual(1);
      }
    }
  );

  it('does not schedule an automatic retry after a retryable failure', async () => {
    vi.useFakeTimers();
    try {
      let attempts = 0;
      let resetReads = 0;
      const ports = nominalPorts();
      ports.readResetGate = async (command) => {
        resetReads += 1;
        return commandEvent(command, 'STEP_FAILED', {
          error: {
            version: 1,
            code: 'RESET_GATE_READ_FAILED',
            stage: 'reset_gate',
            message: 'temporary reset gate failure',
            retryable: true,
            destructiveEffectPerformed: false,
          },
        });
      };
      const barrier = createStartupBarrier({
        workerEpoch,
        defaultSettings: settings,
        includedConnectorIds: ['free-work'],
        allocateAttemptId: () => {
          attempts += 1;
          return attemptId;
        },
        ports,
      });

      await expect(
        barrier.ensureReady({ requestId, settingsRecoveryRequestId })
      ).rejects.toMatchObject({ kind: 'startup_failed' });
      await vi.advanceTimersByTimeAsync(60_000);
      expect(attempts).toBe(1);
      expect(resetReads).toBe(1);
      expect(barrier.snapshot()).toMatchObject({ state: 'failed', inFlight: false });
    } finally {
      vi.useRealTimers();
    }
  });
});
