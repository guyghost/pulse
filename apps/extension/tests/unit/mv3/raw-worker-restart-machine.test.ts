import { createHash } from 'node:crypto';

import { createActor } from 'xstate';
import { describe, expect, it } from 'vitest';

import {
  rawWorkerRestartMachine,
  type RawWorkerRestartEvent,
} from '../../mv3/harness/raw-worker-restart.machine';

const PROCESS_GENERATION = 1;
const LEASE_EPOCH = 1;
const EXTENSION_ID = 'abcdefghijklmnopabcdefghijklmnop';
const SCOPE_URL = `chrome-extension://${EXTENSION_ID}/`;
const SCRIPT_URL = `${SCOPE_URL}service-worker-loader.js`;
const REGISTRATION_ID = 'registration-1';
const VERSION_ID = 'version-selected';
const TARGET_ID = 'target-selected';
const SESSION_ID = 'session-selected';
const MANUAL_SESSION_ID = 'session-manual';
const CONTROL_SESSION_ID = 'control-session-1';
const SENTINEL_TARGET_ID = 'sentinel-target-42';
const UNIQUE_CONTEXT_ID = 'unique-context-replacement';
const RESTART_GENERATION = 1;
const TEST_PROBE_EXPRESSION = 'globalThis.__pulseProbe';
const IDENTITY_EXPRESSION =
  '(() => ({ workerUrl: globalThis.location.href, registrationScope: globalThis.registration.scope }))()';
const RESUME_COMMAND_ID = 101;
const IDENTITY_COMMAND_ID = 102;
const TEST_COMMAND_ID = 103;
const RESUME_METHOD = 'Runtime.runIfWaitingForDebugger' as const;
const EVALUATE_METHOD = 'Runtime.evaluate' as const;

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error('Canonical JSON does not admit non-finite numbers.');
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }
  if (typeof value === 'object') {
    const record = value as Readonly<Record<string, unknown>>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(',')}}`;
  }
  throw new Error('Canonical JSON received an unsupported value.');
}

function sha256Canonical(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value), 'utf8').digest('hex');
}

const RESUME_PARAMS_SHA256 = sha256Canonical({});
const IDENTITY_PARAMS_SHA256 = sha256Canonical({
  expression: IDENTITY_EXPRESSION,
  uniqueContextId: UNIQUE_CONTEXT_ID,
  awaitPromise: true,
  returnByValue: true,
  includeCommandLineAPI: false,
  silent: false,
});
const TEST_PARAMS_SHA256 = sha256Canonical({
  expression: TEST_PROBE_EXPRESSION,
  uniqueContextId: UNIQUE_CONTEXT_ID,
  awaitPromise: true,
  returnByValue: true,
  includeCommandLineAPI: false,
  silent: false,
});
const RESUME_RESULT_SHA256 = sha256Canonical({});
const IDENTITY_RESULT_SHA256 = sha256Canonical({
  result: {
    type: 'object',
    value: { workerUrl: SCRIPT_URL, registrationScope: SCOPE_URL },
  },
});
const TEST_RESULT_SHA256 = sha256Canonical({ result: { type: 'undefined' } });

function expectedBootstrapBatchSha256(testProbeConfigured: boolean, sessionId = SESSION_ID) {
  const commands: readonly object[] = [
    {
      ordinal: 0,
      commandId: RESUME_COMMAND_ID,
      method: RESUME_METHOD,
      paramsSha256: RESUME_PARAMS_SHA256,
      resultSha256: RESUME_RESULT_SHA256,
    },
    {
      ordinal: 1,
      commandId: IDENTITY_COMMAND_ID,
      method: EVALUATE_METHOD,
      paramsSha256: IDENTITY_PARAMS_SHA256,
      resultSha256: IDENTITY_RESULT_SHA256,
    },
    ...(testProbeConfigured
      ? [
          {
            ordinal: 2,
            commandId: TEST_COMMAND_ID,
            method: EVALUATE_METHOD,
            paramsSha256: TEST_PARAMS_SHA256,
            resultSha256: TEST_RESULT_SHA256,
          },
        ]
      : []),
  ];
  return sha256Canonical({
    schemaVersion: 1,
    processGeneration: PROCESS_GENERATION,
    leaseEpoch: LEASE_EPOCH,
    restartGeneration: RESTART_GENERATION,
    sessionId,
    testProbeConfigured,
    commands,
  });
}

function startRawActor(testProbeConfigured = false) {
  return createActor(rawWorkerRestartMachine, {
    input: {
      processGeneration: PROCESS_GENERATION,
      leaseEpoch: LEASE_EPOCH,
      restartGeneration: 0,
      expectedWorkerPath: 'service-worker-loader.js',
      testProbeExpression: testProbeConfigured ? TEST_PROBE_EXPRESSION : null,
    },
  }).start();
}

function current<const T extends object>(
  event: T
): T & {
  readonly processGeneration: number;
  readonly leaseEpoch: number;
} {
  return {
    processGeneration: PROCESS_GENERATION,
    leaseEpoch: LEASE_EPOCH,
    ...event,
  };
}

function detachEvent(targetId: string, sessionId: string) {
  const eventPreimage = { targetId, sessionId };
  return current({
    type: 'TARGET_DETACHED' as const,
    targetId,
    sessionId,
    eventPreimage,
    eventSha256: sha256Canonical(eventPreimage),
  });
}

function reachConverging(testProbeConfigured = false) {
  const actor = startRawActor(testProbeConfigured);
  actor.send(
    current({
      type: 'INITIAL_SENTINEL_FENCE_RESOLVED',
      commandId: 'sentinel-fence-1',
      sentinels: [{ targetId: SENTINEL_TARGET_ID, url: 'about:blank', attached: false }],
    })
  );
  actor.send(
    current({
      type: 'PREARM_ATTACH_FENCE_RESOLVED',
      commandId: 'prearm-fence-1',
      attachedWorkers: [],
    })
  );
  actor.send(current({ type: 'DISCOVERY_ACKED', commandId: 'discover-1' }));
  actor.send(current({ type: 'AUTO_ATTACH_ACKED', commandId: 'auto-attach-1' }));
  actor.send(
    current({
      type: 'CONTROL_ATTACH_RESOLVED',
      commandId: 'control-attach-1',
      targetId: SENTINEL_TARGET_ID,
      sessionId: 'control-session-1',
    })
  );
  actor.send(
    current({
      type: 'SERVICE_WORKER_ENABLED',
      commandId: 'service-worker-enable-1',
      sessionId: 'control-session-1',
    })
  );
  expect(actor.getSnapshot().matches('converging')).toBe(true);
  return actor;
}

function sendRegistration(actor: ReturnType<typeof reachConverging>) {
  actor.send(
    current({
      type: 'REGISTRATION_UPDATED',
      registration: {
        registrationId: REGISTRATION_ID,
        scopeURL: SCOPE_URL,
        isDeleted: false,
      },
    })
  );
}

function sendVersion(
  actor: ReturnType<typeof reachConverging>,
  runningStatus: 'starting' | 'running' | 'stopped',
  targetId: string | undefined = TARGET_ID
) {
  actor.send(
    current({
      type: 'VERSION_UPDATED',
      version: {
        registrationId: REGISTRATION_ID,
        versionId: VERSION_ID,
        scriptURL: SCRIPT_URL,
        status: 'activated',
        runningStatus,
        ...(targetId === undefined ? {} : { targetId }),
      },
    })
  );
}

function sendSelectedAttachment(
  actor: ReturnType<typeof reachConverging>,
  waitingForDebugger: boolean,
  sessionId = SESSION_ID
) {
  actor.send(
    current({
      type: 'TARGET_ATTACHED',
      attachmentOrigin: 'auto',
      targetId: TARGET_ID,
      sessionId,
      targetType: 'service_worker',
      url: SCRIPT_URL,
      waitingForDebugger,
    })
  );
}

function sendObserverReplies(actor: ReturnType<typeof reachConverging>, sessionId = SESSION_ID) {
  actor.send(
    current({
      type: 'INSPECTOR_ENABLED',
      commandId: `inspector-enable-${sessionId}`,
      sessionId,
    })
  );
  actor.send(
    current({
      type: 'RUNTIME_ENABLED',
      commandId: `runtime-enable-${sessionId}`,
      sessionId,
    })
  );
}

function sendConvergenceFence(actor: ReturnType<typeof reachConverging>, attached: boolean) {
  actor.send(
    current({
      type: 'CONVERGENCE_FENCE_RESOLVED',
      commandId: 'convergence-fence-1',
      targets: [
        {
          targetId: TARGET_ID,
          type: 'service_worker',
          url: SCRIPT_URL,
          attached,
        },
      ],
    })
  );
}

function reachRunningWithoutSession(testProbeConfigured = false) {
  const actor = reachConverging(testProbeConfigured);
  sendRegistration(actor);
  sendVersion(actor, 'running');
  sendConvergenceFence(actor, false);
  expect(actor.getSnapshot().matches('warmup_target_fencing')).toBe(true);
  return actor;
}

function reachWarmAuthorityReady(testProbeConfigured = false) {
  const actor = reachConverging(testProbeConfigured);
  sendRegistration(actor);
  sendVersion(actor, 'running');
  sendSelectedAttachment(actor, false);
  sendObserverReplies(actor);
  sendConvergenceFence(actor, true);
  expect(actor.getSnapshot().matches('warm_authority_ready')).toBe(true);
  return actor;
}

function reachManualWarmAuthorityReady(testProbeConfigured = false) {
  const actor = reachRunningWithoutSession(testProbeConfigured);
  actor.send(
    current({
      type: 'WARMUP_TARGET_FENCE_RESOLVED',
      commandId: 'warmup-target-fence-manual',
      targets: [
        {
          targetId: TARGET_ID,
          type: 'service_worker',
          url: SCRIPT_URL,
          attached: false,
        },
      ],
    })
  );
  actor.send(
    current({
      type: 'WARMUP_ATTACH_RESOLVED',
      commandId: 'warmup-manual-attach',
      sessionId: MANUAL_SESSION_ID,
    })
  );
  sendObserverReplies(actor, MANUAL_SESSION_ID);
  expect(actor.getSnapshot().matches('warmup_resuming')).toBe(true);
  actor.send(
    current({
      type: 'WARMUP_RESUME_RESOLVED',
      commandId: 'warmup-manual-resume',
      sessionId: MANUAL_SESSION_ID,
    })
  );
  sendVersion(actor, 'running');
  expect(actor.getSnapshot().matches('warm_authority_ready')).toBe(true);
  return actor;
}

type StopProof = 'stop' | 'version' | 'crash';
type StartProof = 'start' | 'reload' | 'version' | 'runtime' | 'context';

function sendStopProof(
  actor: ReturnType<typeof reachConverging>,
  proof: StopProof,
  sessionId = SESSION_ID
) {
  if (proof === 'stop') {
    actor.send(current({ type: 'STOP_RESOLVED', commandId: 'controlled-stop-1' }));
  } else if (proof === 'version') {
    sendVersion(actor, 'stopped');
  } else if (proof === 'crash') {
    actor.send(
      current({
        type: 'INSPECTOR_TARGET_CRASHED',
        targetId: TARGET_ID,
        sessionId,
        eventSha256: 'a'.repeat(64),
      })
    );
  }
}

function reachReplacementStarting(
  testProbeConfigured = false,
  attachmentOrigin: 'auto' | 'manual' = 'auto'
) {
  const sessionId = attachmentOrigin === 'auto' ? SESSION_ID : MANUAL_SESSION_ID;
  const actor =
    attachmentOrigin === 'auto'
      ? reachWarmAuthorityReady(testProbeConfigured)
      : reachManualWarmAuthorityReady(testProbeConfigured);
  for (const proof of ['stop', 'crash', 'version'] as const) {
    sendStopProof(actor, proof, sessionId);
  }
  expect(actor.getSnapshot().matches('replacement_starting')).toBe(true);
  return actor;
}

function sendStartProof(
  actor: ReturnType<typeof reachConverging>,
  proof: StartProof,
  sessionId = SESSION_ID
) {
  if (proof === 'start') {
    actor.send(current({ type: 'START_RESOLVED', commandId: 'replacement-start-1' }));
  } else if (proof === 'reload') {
    actor.send(
      current({
        type: 'INSPECTOR_TARGET_RELOADED',
        targetId: TARGET_ID,
        sessionId,
        eventSha256: 'b'.repeat(64),
      })
    );
  } else if (proof === 'version') {
    sendVersion(actor, 'starting');
  } else if (proof === 'runtime') {
    actor.send(
      current({
        type: 'RUNTIME_ENABLED',
        commandId: 'runtime-enable-after-reload',
        sessionId,
      })
    );
  } else {
    actor.send(
      current({
        type: 'EXECUTION_CONTEXT_CREATED',
        sessionId,
        context: {
          id: 42,
          uniqueId: UNIQUE_CONTEXT_ID,
          origin: SCRIPT_URL,
        },
        eventSha256: 'c'.repeat(64),
      })
    );
  }
}

function sendContextDestroyed(
  actor: ReturnType<typeof reachConverging>,
  executionContextId: number,
  executionContextUniqueId: string,
  sessionId = SESSION_ID
) {
  actor.send(
    current({
      type: 'EXECUTION_CONTEXT_DESTROYED',
      sessionId,
      executionContextId,
      executionContextUniqueId,
      eventSha256: 'd'.repeat(64),
    })
  );
}

function sendContextsCleared(actor: ReturnType<typeof reachConverging>, sessionId = SESSION_ID) {
  actor.send(
    current({
      type: 'EXECUTION_CONTEXTS_CLEARED',
      sessionId,
      eventSha256: 'e'.repeat(64),
    })
  );
}

function reachBootstrapResuming(
  testProbeConfigured = false,
  attachmentOrigin: 'auto' | 'manual' = 'auto'
) {
  const sessionId = attachmentOrigin === 'auto' ? SESSION_ID : MANUAL_SESSION_ID;
  const actor = reachReplacementStarting(testProbeConfigured, attachmentOrigin);
  for (const proof of ['reload', 'runtime', 'context', 'start', 'version'] as const) {
    sendStartProof(actor, proof, sessionId);
  }
  expect(actor.getSnapshot().matches('resuming')).toBe(true);
  return actor;
}

interface BootstrapReceiptOverrides {
  readonly restartGeneration?: number;
  readonly sessionId?: string;
  readonly commandId?: number;
  readonly method?: string;
  readonly paramsSha256?: string;
  readonly resultSha256?: string;
}

interface IdentityReceiptOverrides extends BootstrapReceiptOverrides {
  readonly uniqueContextId?: string;
  readonly workerUrl?: string;
  readonly registrationScope?: string;
}

interface TestReceiptOverrides extends BootstrapReceiptOverrides {
  readonly uniqueContextId?: string;
  readonly diagnosticDisposition?: string;
}

function sendBootstrapEvent(actor: ReturnType<typeof reachConverging>, event: unknown): void {
  actor.send(event as RawWorkerRestartEvent);
}

function sendIdentityProbe(
  actor: ReturnType<typeof reachConverging>,
  overrides: IdentityReceiptOverrides = {}
) {
  sendBootstrapEvent(
    actor,
    current({
      type: 'IDENTITY_PROBE_RESOLVED',
      restartGeneration: RESTART_GENERATION,
      commandId: IDENTITY_COMMAND_ID,
      method: EVALUATE_METHOD,
      paramsSha256: IDENTITY_PARAMS_SHA256,
      resultSha256: IDENTITY_RESULT_SHA256,
      sessionId: SESSION_ID,
      uniqueContextId: UNIQUE_CONTEXT_ID,
      workerUrl: SCRIPT_URL,
      registrationScope: SCOPE_URL,
      ...overrides,
    })
  );
}

function sendOptionalTestProbe(
  actor: ReturnType<typeof reachConverging>,
  overrides: TestReceiptOverrides = {}
) {
  sendBootstrapEvent(
    actor,
    current({
      type: 'TEST_PROBE_RESOLVED',
      restartGeneration: RESTART_GENERATION,
      commandId: TEST_COMMAND_ID,
      method: EVALUATE_METHOD,
      paramsSha256: TEST_PARAMS_SHA256,
      resultSha256: TEST_RESULT_SHA256,
      sessionId: SESSION_ID,
      uniqueContextId: UNIQUE_CONTEXT_ID,
      diagnosticDisposition: 'clean',
      ...overrides,
    })
  );
}

function sendReplacementResume(
  actor: ReturnType<typeof reachConverging>,
  overrides: BootstrapReceiptOverrides = {}
) {
  sendBootstrapEvent(
    actor,
    current({
      type: 'RESUME_RESOLVED',
      restartGeneration: RESTART_GENERATION,
      commandId: RESUME_COMMAND_ID,
      method: RESUME_METHOD,
      paramsSha256: RESUME_PARAMS_SHA256,
      resultSha256: RESUME_RESULT_SHA256,
      sessionId: SESSION_ID,
      ...overrides,
    })
  );
}

function reachReleaseDisarming(
  testProbeConfigured = false,
  attachmentOrigin: 'auto' | 'manual' = 'auto'
) {
  const sessionId = attachmentOrigin === 'auto' ? SESSION_ID : MANUAL_SESSION_ID;
  const actor = reachBootstrapResuming(testProbeConfigured, attachmentOrigin);
  sendReplacementResume(actor, { sessionId });
  expect(actor.getSnapshot().matches('identity_probing')).toBe(true);
  sendIdentityProbe(actor, { sessionId });
  if (testProbeConfigured) {
    expect(actor.getSnapshot().matches('test_probing')).toBe(true);
    sendOptionalTestProbe(actor, { sessionId });
  } else {
    expect(actor.getSnapshot().matches('test_probe_deciding')).toBe(true);
  }
  sendVersion(actor, 'running');
  expect(actor.getSnapshot().matches('release_disarming')).toBe(true);
  return actor;
}

type ObservableBatchState =
  'resuming' | 'identity_probing' | 'test_probe_deciding' | 'test_probing';

function reachObservableBatchState(state: ObservableBatchState) {
  const actor = reachBootstrapResuming(state !== 'test_probe_deciding');
  if (state === 'resuming') {
    return actor;
  }

  sendReplacementResume(actor);
  expect(actor.getSnapshot().matches('identity_probing')).toBe(true);
  if (state === 'identity_probing') {
    return actor;
  }

  sendIdentityProbe(actor);
  expect(actor.getSnapshot().matches(state)).toBe(true);
  return actor;
}

describe('rawWorkerRestartMachine initialization', () => {
  it('admits the reviewed initialization acknowledgements in exact XState order', () => {
    const actor = startRawActor();
    expect(actor.getSnapshot().matches('sentinel_fencing')).toBe(true);

    actor.send(
      current({
        type: 'INITIAL_SENTINEL_FENCE_RESOLVED',
        commandId: 'sentinel-fence-1',
        sentinels: [{ targetId: SENTINEL_TARGET_ID, url: 'about:blank', attached: false }],
      })
    );
    expect(actor.getSnapshot().matches('prearm_attach_fencing')).toBe(true);
    actor.send(
      current({
        type: 'PREARM_ATTACH_FENCE_RESOLVED',
        commandId: 'prearm-fence-1',
        attachedWorkers: [],
      })
    );
    expect(actor.getSnapshot().matches('discovery_enabling')).toBe(true);
    actor.send(current({ type: 'DISCOVERY_ACKED', commandId: 'discover-1' }));
    expect(actor.getSnapshot().matches('auto_attach_arming')).toBe(true);
    actor.send(current({ type: 'AUTO_ATTACH_ACKED', commandId: 'auto-attach-1' }));
    expect(actor.getSnapshot().matches('control_attaching')).toBe(true);
    actor.send(
      current({
        type: 'CONTROL_ATTACH_RESOLVED',
        commandId: 'control-attach-1',
        targetId: SENTINEL_TARGET_ID,
        sessionId: 'control-session-1',
      })
    );
    expect(actor.getSnapshot().matches('service_worker_enabling')).toBe(true);
    actor.send(
      current({
        type: 'SERVICE_WORKER_ENABLED',
        commandId: 'service-worker-enable-1',
        sessionId: 'control-session-1',
      })
    );
    expect(actor.getSnapshot().matches('converging')).toBe(true);
  });

  it('fails release on an out-of-order initialization acknowledgement', () => {
    const actor = startRawActor();

    actor.send(current({ type: 'AUTO_ATTACH_ACKED', commandId: 'auto-attach-too-early' }));

    expect(actor.getSnapshot().matches('failed_releasing')).toBe(true);
  });

  it('freezes the real sentinel identity and rejects a crossed control attachment', () => {
    const actor = startRawActor();
    actor.send(
      current({
        type: 'INITIAL_SENTINEL_FENCE_RESOLVED',
        commandId: 'sentinel-fence-dynamic',
        sentinels: [{ targetId: SENTINEL_TARGET_ID, url: 'about:blank', attached: false }],
      })
    );
    expect(actor.getSnapshot().context.sentinelTargetId).toBe(SENTINEL_TARGET_ID);
    actor.send(
      current({
        type: 'PREARM_ATTACH_FENCE_RESOLVED',
        commandId: 'prearm-fence-dynamic',
        attachedWorkers: [],
      })
    );
    actor.send(current({ type: 'DISCOVERY_ACKED', commandId: 'discover-dynamic' }));
    actor.send(current({ type: 'AUTO_ATTACH_ACKED', commandId: 'auto-attach-dynamic' }));
    actor.send(
      current({
        type: 'CONTROL_ATTACH_RESOLVED',
        commandId: 'control-attach-crossed',
        targetId: 'not-the-frozen-sentinel',
        sessionId: CONTROL_SESSION_ID,
      })
    );

    expect(actor.getSnapshot().matches('failed_releasing')).toBe(true);
  });

  it('retains the first exact worker attachment when it races after the arm acknowledgement', () => {
    const actor = startRawActor();
    actor.send(
      current({
        type: 'INITIAL_SENTINEL_FENCE_RESOLVED',
        commandId: 'sentinel-fence-race',
        sentinels: [{ targetId: SENTINEL_TARGET_ID, url: 'about:blank', attached: false }],
      })
    );
    actor.send(
      current({
        type: 'PREARM_ATTACH_FENCE_RESOLVED',
        commandId: 'prearm-fence-race',
        attachedWorkers: [],
      })
    );
    actor.send(current({ type: 'DISCOVERY_ACKED', commandId: 'discover-race' }));
    actor.send(current({ type: 'AUTO_ATTACH_ACKED', commandId: 'auto-attach-race' }));
    expect(actor.getSnapshot().matches('control_attaching')).toBe(true);

    sendSelectedAttachment(actor, true);

    expect(actor.getSnapshot().matches('control_attaching')).toBe(true);
    expect(actor.getSnapshot().context.selectedSession).toMatchObject({
      sessionId: SESSION_ID,
      targetId: TARGET_ID,
      waitingForDebugger: true,
      attachmentOrigin: 'auto',
    });
  });
});

describe('rawWorkerRestartMachine warm authority', () => {
  it('retains one exact bounded pre-crash context arriving during convergence', () => {
    const actor = reachConverging();
    sendRegistration(actor);
    sendVersion(actor, 'running');
    sendSelectedAttachment(actor, false);

    actor.send(
      current({
        type: 'EXECUTION_CONTEXT_CREATED',
        sessionId: SESSION_ID,
        context: { id: 6, uniqueId: 'context-during-convergence', origin: SCRIPT_URL },
        eventSha256: '6'.repeat(64),
      })
    );

    expect(actor.getSnapshot().matches('converging')).toBe(true);
    expect(actor.getSnapshot().context.preCrashContexts).toEqual([
      expect.objectContaining({
        executionContextId: 6,
        uniqueContextId: 'context-during-convergence',
        sessionId: SESSION_ID,
      }),
    ]);

    sendObserverReplies(actor);
    sendConvergenceFence(actor, true);
    expect(actor.getSnapshot().matches('warm_authority_ready')).toBe(true);
  });

  it.each([
    ['foreign session', { sessionId: 'foreign-session', uniqueId: 'foreign-context' }],
    [
      'duplicate unique identity',
      { sessionId: SESSION_ID, uniqueId: 'context-during-convergence' },
    ],
  ] as const)('rejects a convergence context with %s', (_label, variant) => {
    const actor = reachConverging();
    sendRegistration(actor);
    sendVersion(actor, 'running');
    sendSelectedAttachment(actor, false);
    actor.send(
      current({
        type: 'EXECUTION_CONTEXT_CREATED',
        sessionId: SESSION_ID,
        context: { id: 6, uniqueId: 'context-during-convergence', origin: SCRIPT_URL },
        eventSha256: '6'.repeat(64),
      })
    );

    actor.send(
      current({
        type: 'EXECUTION_CONTEXT_CREATED',
        sessionId: variant.sessionId,
        context: { id: 7, uniqueId: variant.uniqueId, origin: SCRIPT_URL },
        eventSha256: '7'.repeat(64),
      })
    );

    expect(actor.getSnapshot().matches('failed_releasing')).toBe(true);
  });

  it.each(['before', 'after'] as const)(
    'converges when both observer enables resolve %s the target fence',
    (replyOrder) => {
      const actor = reachConverging();
      sendRegistration(actor);
      sendVersion(actor, 'running');
      sendSelectedAttachment(actor, false);

      if (replyOrder === 'before') {
        sendObserverReplies(actor);
        sendConvergenceFence(actor, true);
      } else {
        sendConvergenceFence(actor, true);
        expect(actor.getSnapshot().matches('warm_authority_ready')).toBe(false);
        sendObserverReplies(actor);
      }

      expect(actor.getSnapshot().matches('warm_authority_ready')).toBe(true);
      expect(actor.getSnapshot().context.warmupStarted).toBe(false);
    }
  );

  it('observes and resumes a paused starting session without issuing warm-up start', () => {
    const actor = reachConverging();
    sendRegistration(actor);
    sendVersion(actor, 'starting');
    sendSelectedAttachment(actor, true);
    actor.send(
      current({
        type: 'INSPECTOR_ENABLED',
        commandId: 'inspector-enable-selected',
        sessionId: SESSION_ID,
      })
    );
    sendConvergenceFence(actor, true);
    expect(actor.getSnapshot().matches('warm_existing_resuming')).toBe(false);

    actor.send(
      current({
        type: 'RUNTIME_ENABLED',
        commandId: 'runtime-enable-selected',
        sessionId: SESSION_ID,
      })
    );

    expect(actor.getSnapshot().matches('warm_existing_resuming')).toBe(true);
    expect(actor.getSnapshot().context.warmupStarted).toBe(false);
    actor.send(
      current({
        type: 'WARMUP_RESUME_RESOLVED',
        commandId: 'warm-resume-selected',
        sessionId: SESSION_ID,
      })
    );
    sendVersion(actor, 'running');
    expect(actor.getSnapshot().matches('warm_authority_ready')).toBe(true);
  });

  it('issues exactly the non-authoritative warm-up branch for a stopped version', () => {
    const actor = reachConverging();
    sendRegistration(actor);
    sendVersion(actor, 'stopped', undefined);
    actor.send(
      current({
        type: 'CONVERGENCE_FENCE_RESOLVED',
        commandId: 'convergence-fence-1',
        targets: [],
      })
    );

    expect(actor.getSnapshot().matches('warmup_starting')).toBe(true);
    expect(actor.getSnapshot().context.warmupStarted).toBe(true);
    sendVersion(actor, 'stopped', undefined);
    expect(actor.getSnapshot().matches('warmup_starting')).toBe(true);
    expect(actor.getSnapshot().context.warmupStartCount).toBe(1);
  });

  it('fences and attaches a starting/running target with no session without warm-up start', () => {
    const actor = reachRunningWithoutSession();

    expect(actor.getSnapshot().matches('warmup_target_fencing')).toBe(true);
    expect(actor.getSnapshot().context.warmupStarted).toBe(false);
    expect(actor.getSnapshot().context.warmupStartCount).toBe(0);
  });

  it('fails and owns cleanup when auto/manual attachment yields two selected sessions', () => {
    const actor = reachRunningWithoutSession();
    actor.send(
      current({
        type: 'WARMUP_TARGET_FENCE_RESOLVED',
        commandId: 'warmup-target-fence-1',
        targets: [
          {
            targetId: TARGET_ID,
            type: 'service_worker',
            url: SCRIPT_URL,
            attached: false,
          },
        ],
      })
    );
    expect(actor.getSnapshot().matches('warmup_manual_attaching')).toBe(true);

    sendSelectedAttachment(actor, true, 'session-provisional');
    expect(actor.getSnapshot().matches('warmup_manual_attaching')).toBe(true);
    sendSelectedAttachment(actor, true, 'session-competing');

    expect(actor.getSnapshot().matches('failed_releasing')).toBe(true);
    expect(actor.getSnapshot().context.knownSessionIds).toEqual(
      expect.arrayContaining(['session-provisional', 'session-competing'])
    );
  });
});

describe('rawWorkerRestartMachine controlled same-version restart', () => {
  it('keeps an exact late stopped duplicate inert until the first replacement version proof', () => {
    const actor = reachReplacementStarting();
    sendStartProof(actor, 'start');

    sendVersion(actor, 'stopped');

    expect(actor.getSnapshot().matches('replacement_starting')).toBe(true);
    expect(actor.getSnapshot().context.replacementVersionObserved).toBe(false);
    for (const proof of ['reload', 'runtime', 'context', 'version'] as const) {
      sendStartProof(actor, proof);
    }
    expect(actor.getSnapshot().matches('resuming')).toBe(true);
  });

  it('fails closed on stopped metadata after replacement starting or running was proved', () => {
    const actor = reachReplacementStarting();
    sendVersion(actor, 'starting');
    expect(actor.getSnapshot().context.replacementVersionObserved).toBe(true);

    sendVersion(actor, 'stopped');

    expect(actor.getSnapshot().matches('failed_releasing')).toBe(true);
  });

  it('retains the native stopping status as partial evidence without failing', () => {
    const actor = reachWarmAuthorityReady();
    actor.send(
      current({
        type: 'VERSION_UPDATED',
        version: {
          registrationId: REGISTRATION_ID,
          versionId: VERSION_ID,
          scriptURL: SCRIPT_URL,
          status: 'activated',
          runningStatus: 'stopping',
          targetId: TARGET_ID,
        },
      })
    );

    expect(actor.getSnapshot().matches('controlled_stop')).toBe(true);
    expect(actor.getSnapshot().context.stoppedVersionObserved).toBe(false);
  });

  it.each([
    ['stop', 'version', 'crash'],
    ['crash', 'stop', 'version'],
    ['version', 'crash', 'stop'],
  ] as const)(
    'starts after the three native stop proofs in permutation %j without a Runtime clear',
    (...proofs) => {
      const actor = reachWarmAuthorityReady();

      for (const proof of proofs) {
        sendStopProof(actor, proof);
      }

      expect(actor.getSnapshot().matches('replacement_starting')).toBe(true);
      expect(actor.getSnapshot().context).toMatchObject({
        stopCommandCount: 1,
        startCommandCount: 1,
        restartGeneration: 1,
        selectedSession: {
          sessionId: SESSION_ID,
          targetId: TARGET_ID,
        },
      });
    }
  );

  it('atomically revokes every pre-crash context and treats late clear/destroy as evidence-only', () => {
    const actor = reachWarmAuthorityReady();
    actor.send(
      current({
        type: 'EXECUTION_CONTEXT_CREATED',
        sessionId: SESSION_ID,
        context: { id: 7, uniqueId: 'pre-crash-active', origin: SCRIPT_URL },
        eventSha256: '1'.repeat(64),
      })
    );
    actor.send(
      current({
        type: 'EXECUTION_CONTEXT_CREATED',
        sessionId: SESSION_ID,
        context: { id: 8, uniqueId: 'pre-crash-retired', origin: SCRIPT_URL },
        eventSha256: '2'.repeat(64),
      })
    );
    sendContextDestroyed(actor, 8, 'pre-crash-retired');
    sendStopProof(actor, 'crash');

    expect(actor.getSnapshot().matches('controlled_stop')).toBe(true);
    expect(actor.getSnapshot().context).toMatchObject({
      crashObserved: true,
      contextGeneration: 1,
      activeContexts: [],
      revokedUniqueContextIds: ['pre-crash-active', 'pre-crash-retired'],
      revokedUniqueContextIdsSha256: expect.stringMatching(/^[a-f0-9]{64}$/u),
    });

    sendContextsCleared(actor);
    sendContextDestroyed(actor, 7, 'pre-crash-active');
    expect(actor.getSnapshot().matches('controlled_stop')).toBe(true);

    sendStopProof(actor, 'version');
    sendStopProof(actor, 'stop');
    expect(actor.getSnapshot().matches('replacement_starting')).toBe(true);
  });

  it('fails closed on a replacement context before reload, a reused ID, or a non-script origin', () => {
    for (const variant of ['before-reload', 'reused', 'scope-origin'] as const) {
      const actor =
        variant === 'reused'
          ? (() => {
              const withPreCrashContext = reachWarmAuthorityReady();
              withPreCrashContext.send(
                current({
                  type: 'EXECUTION_CONTEXT_CREATED',
                  sessionId: SESSION_ID,
                  context: { id: 9, uniqueId: 'pre-crash-id', origin: SCRIPT_URL },
                  eventSha256: '9'.repeat(64),
                })
              );
              for (const proof of ['stop', 'crash', 'version'] as const) {
                sendStopProof(withPreCrashContext, proof);
              }
              return withPreCrashContext;
            })()
          : reachReplacementStarting();
      if (variant !== 'before-reload') {
        sendStartProof(actor, 'reload');
      }
      actor.send(
        current({
          type: 'EXECUTION_CONTEXT_CREATED',
          sessionId: SESSION_ID,
          context: {
            id: 42,
            uniqueId: variant === 'reused' ? 'pre-crash-id' : `replacement-${variant}`,
            origin: variant === 'scope-origin' ? SCOPE_URL.slice(0, -1) : SCRIPT_URL,
          },
          eventSha256: 'e'.repeat(64),
        })
      );

      expect(actor.getSnapshot().matches('failed_releasing'), variant).toBe(true);
    }
  });

  it('rejects unique context identities larger than 512 UTF-8 bytes', () => {
    const actor = reachReplacementStarting();
    sendStartProof(actor, 'reload');
    actor.send(
      current({
        type: 'EXECUTION_CONTEXT_CREATED',
        sessionId: SESSION_ID,
        context: { id: 42, uniqueId: 'x'.repeat(513), origin: SCRIPT_URL },
        eventSha256: 'f'.repeat(64),
      })
    );

    expect(actor.getSnapshot().matches('failed_releasing')).toBe(true);
  });

  it('admits repeated same-version replacement metadata without reallocating its proof', () => {
    const actor = reachReplacementStarting();

    sendVersion(actor, 'starting', undefined);
    const firstProof = actor.getSnapshot().context;
    expect(actor.getSnapshot().matches('replacement_starting')).toBe(true);
    expect(firstProof.replacementVersionObserved).toBe(true);

    sendVersion(actor, 'starting', TARGET_ID);
    expect(actor.getSnapshot().matches('replacement_starting')).toBe(true);
    expect(actor.getSnapshot().context.replacementVersionObserved).toBe(true);

    sendVersion(actor, 'running', TARGET_ID);
    expect(actor.getSnapshot().matches('replacement_starting')).toBe(true);
    expect(actor.getSnapshot().context).toMatchObject({
      replacementVersionObserved: true,
      restartGeneration: firstProof.restartGeneration,
      contextGeneration: firstProof.contextGeneration,
      version: {
        registrationId: REGISTRATION_ID,
        versionId: VERSION_ID,
        scriptURL: SCRIPT_URL,
        status: 'activated',
        runningStatus: 'running',
        targetId: TARGET_ID,
      },
    });
  });

  it.each(['destroy', 'clear'] as const)(
    'treats a Runtime context %s before the replacement reload as terminal',
    (eventType) => {
      const actor = reachReplacementStarting();
      if (eventType === 'destroy') {
        sendContextDestroyed(actor, 7, 'before-reload');
      } else {
        sendContextsCleared(actor);
      }

      expect(actor.getSnapshot().matches('failed_releasing')).toBe(true);
    }
  );

  it('admits a same-session contexts-cleared event after reload before one fresh context', () => {
    const actor = reachReplacementStarting();
    sendStartProof(actor, 'reload');

    sendContextsCleared(actor);

    expect(actor.getSnapshot().matches('replacement_starting')).toBe(true);
    expect(actor.getSnapshot().context.retiredContextEvidenceCount).toBe(1);
    sendStartProof(actor, 'context');
    expect(actor.getSnapshot().matches('replacement_starting')).toBe(true);
    expect(actor.getSnapshot().context.uniqueContextId).toBe(UNIQUE_CONTEXT_ID);
  });

  it('tombstones a destroyed post-crash unique ID and rejects its later recreation', () => {
    const actor = reachReplacementStarting();
    sendStartProof(actor, 'reload');
    sendContextDestroyed(actor, 77, 'destroyed-after-reload');

    expect(actor.getSnapshot().matches('replacement_starting')).toBe(true);
    expect(actor.getSnapshot().context).toMatchObject({
      postCrashDestroyedUniqueContextIds: ['destroyed-after-reload'],
      postCrashDestroyedUniqueContextIdsSha256: expect.stringMatching(/^[a-f0-9]{64}$/u),
      retiredContextEvidenceCount: 1,
    });

    actor.send(
      current({
        type: 'EXECUTION_CONTEXT_CREATED',
        sessionId: SESSION_ID,
        context: { id: 78, uniqueId: 'destroyed-after-reload', origin: SCRIPT_URL },
        eventSha256: 'f'.repeat(64),
      })
    );
    expect(actor.getSnapshot().matches('failed_releasing')).toBe(true);
  });

  it('keeps the post-reload window open for a distinct fresh context after destroy', () => {
    const actor = reachReplacementStarting();
    sendStartProof(actor, 'reload');
    sendContextDestroyed(actor, 77, 'retired-reload-context');

    sendStartProof(actor, 'context');

    expect(actor.getSnapshot().matches('replacement_starting')).toBe(true);
    expect(actor.getSnapshot().context.uniqueContextId).toBe(UNIQUE_CONTEXT_ID);
  });

  it('fails closed on retired-context evidence event 4,097', () => {
    const actor = reachReplacementStarting();
    sendStartProof(actor, 'reload');

    for (let index = 0; index < 4_096; index += 1) {
      sendContextsCleared(actor);
    }
    expect(actor.getSnapshot().matches('replacement_starting')).toBe(true);
    expect(actor.getSnapshot().context.retiredContextEvidenceCount).toBe(4_096);

    sendContextsCleared(actor);
    expect(actor.getSnapshot().matches('failed_releasing')).toBe(true);
  }, 15_000);

  it('fails closed when post-crash tombstones consume all 4,096 context authority slots', () => {
    const actor = reachReplacementStarting();
    sendStartProof(actor, 'reload');

    for (let index = 0; index < 4_096; index += 1) {
      sendContextDestroyed(actor, index, `post-crash-destroyed-${index}`);
    }
    expect(actor.getSnapshot().matches('replacement_starting')).toBe(true);
    expect(actor.getSnapshot().context.postCrashDestroyedUniqueContextIds).toHaveLength(4_096);

    sendStartProof(actor, 'context');
    expect(actor.getSnapshot().matches('failed_releasing')).toBe(true);
  }, 15_000);

  it.each(['destroy', 'clear'] as const)(
    'rejects a same-session Runtime %s after the fresh replacement context',
    (eventType) => {
      const actor = reachReplacementStarting();
      sendStartProof(actor, 'reload');
      sendStartProof(actor, 'context');

      if (eventType === 'destroy') {
        sendContextDestroyed(actor, 42, UNIQUE_CONTEXT_ID);
      } else {
        sendContextsCleared(actor);
      }

      expect(actor.getSnapshot().matches('failed_releasing')).toBe(true);
    }
  );

  it.each(['destroy', 'clear'] as const)(
    'rejects a foreign-session Runtime %s inside the post-reload window',
    (eventType) => {
      const actor = reachReplacementStarting();
      sendStartProof(actor, 'reload');

      if (eventType === 'destroy') {
        sendContextDestroyed(actor, 77, 'foreign-context', 'foreign-session');
      } else {
        sendContextsCleared(actor, 'foreign-session');
      }

      expect(actor.getSnapshot().matches('failed_releasing')).toBe(true);
    }
  );

  it.each([
    ['start', 'reload', 'version', 'runtime', 'context'],
    ['reload', 'context', 'start', 'runtime', 'version'],
    ['version', 'start', 'runtime', 'reload', 'context'],
    ['runtime', 'version', 'reload', 'context', 'start'],
  ] as const)(
    'waits for every same-session start proof in permutation %j before the resume-first batch',
    (...proofs) => {
      const actor = reachReplacementStarting();

      for (const proof of proofs) {
        sendStartProof(actor, proof);
      }

      expect(actor.getSnapshot().matches('resuming')).toBe(true);
      expect(actor.getSnapshot().context).toMatchObject({
        restartGeneration: 1,
        uniqueContextId: UNIQUE_CONTEXT_ID,
        selectedSession: {
          sessionId: SESSION_ID,
          targetId: TARGET_ID,
        },
      });
    }
  );

  it.each([
    [
      'a repeated selected attachment',
      current({
        type: 'TARGET_ATTACHED',
        attachmentOrigin: 'auto',
        targetId: TARGET_ID,
        sessionId: SESSION_ID,
        targetType: 'service_worker',
        url: SCRIPT_URL,
        waitingForDebugger: true,
      }),
    ],
    [
      'a replacement selected attachment',
      current({
        type: 'TARGET_ATTACHED',
        attachmentOrigin: 'auto',
        targetId: TARGET_ID,
        sessionId: 'replacement-session-forbidden',
        targetType: 'service_worker',
        url: SCRIPT_URL,
        waitingForDebugger: true,
      }),
    ],
    ['a selected detach', detachEvent(TARGET_ID, SESSION_ID)],
    [
      'a reload on another session',
      current({
        type: 'INSPECTOR_TARGET_RELOADED',
        targetId: TARGET_ID,
        sessionId: 'replacement-session-forbidden',
        eventSha256: 'd'.repeat(64),
      }),
    ],
  ] as const)('fails closed when replacement observes %s', (_label, event) => {
    const actor = reachReplacementStarting();

    actor.send(event);

    expect(actor.getSnapshot().matches('failed_releasing')).toBe(true);
  });

  it.each([
    ['resuming', 'resuming'],
    ['identity_probing', 'identity_probing'],
    ['test_probe_deciding', 'release_disarming'],
    ['test_probing', 'test_probing'],
  ] as const)(
    'retains exact selected-version metadata idempotently in %s',
    (state, stateAfterRunning) => {
      const actor = reachObservableBatchState(state);

      sendVersion(actor, 'starting');
      expect(actor.getSnapshot().matches(state)).toBe(true);
      sendVersion(actor, 'starting');
      expect(actor.getSnapshot().matches(state)).toBe(true);
      sendVersion(actor, 'running');
      expect(actor.getSnapshot().matches(stateAfterRunning)).toBe(true);
      if (stateAfterRunning === state) {
        sendVersion(actor, 'running');
        expect(actor.getSnapshot().matches(state)).toBe(true);
        expect(actor.getSnapshot().context.version?.runningStatus).toBe('running');
      }
    }
  );

  it.each(['resuming', 'identity_probing', 'test_probing'] as const)(
    'fails closed on a selected running-to-starting regression in %s',
    (state) => {
      const actor = reachObservableBatchState(state);
      sendVersion(actor, 'running');
      expect(actor.getSnapshot().matches(state)).toBe(true);

      sendVersion(actor, 'starting');

      expect(actor.getSnapshot().matches('failed_releasing')).toBe(true);
    }
  );

  it.each(['resuming', 'identity_probing', 'test_probe_deciding', 'test_probing'] as const)(
    'fails closed on selected-version authority drift in %s',
    (state) => {
      const actor = reachObservableBatchState(state);
      actor.send(
        current({
          type: 'VERSION_UPDATED',
          version: {
            registrationId: 'registration-drift',
            versionId: VERSION_ID,
            scriptURL: SCRIPT_URL,
            status: 'activated',
            runningStatus: 'starting',
            targetId: TARGET_ID,
          },
        })
      );

      expect(actor.getSnapshot().matches('failed_releasing')).toBe(true);
    }
  );

  it.each([
    'before-resume',
    'between-resume-and-identity',
    'between-identity-and-test',
    'after-test',
  ] as const)(
    'keeps a selected running proof emitted %s sticky through canonical batch reduction',
    (runningAt) => {
      const actor = reachBootstrapResuming(true);

      if (runningAt === 'before-resume') {
        sendVersion(actor, 'running');
      }
      sendReplacementResume(actor);
      expect(actor.getSnapshot().matches('identity_probing')).toBe(true);
      if (runningAt === 'between-resume-and-identity') {
        sendVersion(actor, 'running');
      }
      sendIdentityProbe(actor);
      expect(actor.getSnapshot().matches('test_probing')).toBe(true);
      if (runningAt === 'between-identity-and-test') {
        sendVersion(actor, 'running');
      }
      sendOptionalTestProbe(actor);
      if (runningAt === 'after-test') {
        expect(actor.getSnapshot().matches('test_probing')).toBe(true);
        sendVersion(actor, 'running');
      }

      expect(actor.getSnapshot().matches('release_disarming')).toBe(true);
      expect(actor.getSnapshot().context.bootstrapCommandBatchSha256).toBe(
        expectedBootstrapBatchSha256(true)
      );
    }
  );

  it.each(['clean', 'application_exception'] as const)(
    'reduces the resume-first batch and retains optional-test disposition %s',
    (diagnosticDisposition) => {
      const actor = reachBootstrapResuming(true);
      sendReplacementResume(actor);
      sendIdentityProbe(actor);
      sendOptionalTestProbe(actor, { diagnosticDisposition });
      sendVersion(actor, 'running');

      expect(actor.getSnapshot().matches('release_disarming')).toBe(true);
      expect(actor.getSnapshot().context).toMatchObject({
        identityProbePassed: true,
        testProbeCompleted: true,
        resumeCommandCount: 1,
        resumeResolved: true,
        uniqueContextId: UNIQUE_CONTEXT_ID,
        resumeCommandId: RESUME_COMMAND_ID,
        resumeResultSha256: RESUME_RESULT_SHA256,
        identityCommandId: IDENTITY_COMMAND_ID,
        identityResultSha256: IDENTITY_RESULT_SHA256,
        testCommandId: TEST_COMMAND_ID,
        testResultSha256: TEST_RESULT_SHA256,
        bootstrapCommandBatchSha256: expectedBootstrapBatchSha256(true),
      });
    }
  );

  it('retains exact-null test fields and the two-command batch commitment without a probe', () => {
    const actor = reachBootstrapResuming(false);
    sendReplacementResume(actor);
    sendIdentityProbe(actor);
    expect(actor.getSnapshot().matches('test_probe_deciding')).toBe(true);
    sendVersion(actor, 'running');

    expect(actor.getSnapshot().matches('release_disarming')).toBe(true);
    expect(actor.getSnapshot().context).toMatchObject({
      testProbeConfigured: false,
      resumeCommandId: RESUME_COMMAND_ID,
      resumeResultSha256: RESUME_RESULT_SHA256,
      identityCommandId: IDENTITY_COMMAND_ID,
      identityResultSha256: IDENTITY_RESULT_SHA256,
      testCommandId: null,
      testResultSha256: null,
      bootstrapCommandBatchSha256: expectedBootstrapBatchSha256(false),
    });
  });

  it('fails closed on duplicate and out-of-canonical-order batch events', () => {
    const scenarios: readonly {
      readonly label: string;
      readonly exercise: (actor: ReturnType<typeof reachConverging>) => void;
    }[] = [
      {
        label: 'identity before resume',
        exercise: (actor) => sendIdentityProbe(actor),
      },
      {
        label: 'test before resume',
        exercise: (actor) => sendOptionalTestProbe(actor),
      },
      {
        label: 'duplicate resume',
        exercise: (actor) => {
          sendReplacementResume(actor);
          sendReplacementResume(actor);
        },
      },
      {
        label: 'test before identity',
        exercise: (actor) => {
          sendReplacementResume(actor);
          sendOptionalTestProbe(actor);
        },
      },
      {
        label: 'duplicate identity',
        exercise: (actor) => {
          sendReplacementResume(actor);
          sendIdentityProbe(actor);
          sendIdentityProbe(actor);
        },
      },
      {
        label: 'duplicate test',
        exercise: (actor) => {
          sendReplacementResume(actor);
          sendIdentityProbe(actor);
          sendOptionalTestProbe(actor);
          sendOptionalTestProbe(actor);
        },
      },
    ];

    for (const scenario of scenarios) {
      const actor = reachBootstrapResuming(true);
      scenario.exercise(actor);
      expect(actor.getSnapshot().matches('failed_releasing'), scenario.label).toBe(true);
    }
  });

  it.each([
    ['non-positive ID', { commandId: 0 }],
    ['unsafe ID', { commandId: Number.MAX_SAFE_INTEGER + 1 }],
    ['restart generation', { restartGeneration: RESTART_GENERATION + 1 }],
    ['method', { method: EVALUATE_METHOD }],
    ['session', { sessionId: 'foreign-session' }],
    ['params hash', { paramsSha256: 'f'.repeat(64) }],
    ['result hash', { resultSha256: 'not-a-sha256' }],
  ] as const)('rejects a resume receipt with invalid %s', (_label, overrides) => {
    const actor = reachBootstrapResuming(true);

    sendReplacementResume(actor, overrides);

    expect(actor.getSnapshot().matches('failed_releasing')).toBe(true);
  });

  it.each([
    ['crossed ID', { commandId: RESUME_COMMAND_ID }],
    ['gapped ID', { commandId: IDENTITY_COMMAND_ID + 1 }],
    ['restart generation', { restartGeneration: RESTART_GENERATION + 1 }],
    ['method', { method: RESUME_METHOD }],
    ['session', { sessionId: 'foreign-session' }],
    ['params hash', { paramsSha256: 'f'.repeat(64) }],
    ['result hash', { resultSha256: 'not-a-sha256' }],
    ['context', { uniqueContextId: 'foreign-context' }],
    ['worker URL', { workerUrl: `${SCOPE_URL}foreign-worker.js` }],
    ['registration scope', { registrationScope: `${SCOPE_URL}foreign/` }],
  ] as const)('rejects an identity receipt with invalid %s', (_label, overrides) => {
    const actor = reachBootstrapResuming(true);
    sendReplacementResume(actor);

    sendIdentityProbe(actor, overrides);

    expect(actor.getSnapshot().matches('failed_releasing')).toBe(true);
  });

  it.each([
    ['crossed ID', { commandId: IDENTITY_COMMAND_ID }],
    ['gapped ID', { commandId: TEST_COMMAND_ID + 1 }],
    ['restart generation', { restartGeneration: RESTART_GENERATION + 1 }],
    ['method', { method: RESUME_METHOD }],
    ['session', { sessionId: 'foreign-session' }],
    ['params hash', { paramsSha256: 'f'.repeat(64) }],
    ['result hash', { resultSha256: 'not-a-sha256' }],
    ['context', { uniqueContextId: 'foreign-context' }],
    ['diagnostic disposition', { diagnosticDisposition: 'unexpected' }],
  ] as const)('rejects an optional-test receipt with invalid %s', (_label, overrides) => {
    const actor = reachBootstrapResuming(true);
    sendReplacementResume(actor);
    sendIdentityProbe(actor);

    sendOptionalTestProbe(actor, overrides);

    expect(actor.getSnapshot().matches('failed_releasing')).toBe(true);
  });
});

describe('rawWorkerRestartMachine exact release', () => {
  it.each(['detach-before-disarm', 'detach-after-disarm'] as const)(
    'accepts an auto-session detach %s but never emits a manual detach',
    (ordering) => {
      const actor = reachReleaseDisarming();
      const detach = detachEvent(TARGET_ID, SESSION_ID);

      if (ordering === 'detach-before-disarm') {
        actor.send(detach);
      }
      actor.send(current({ type: 'AUTO_ATTACH_DISARMED', commandId: 'disarm-1' }));
      if (ordering === 'detach-after-disarm') {
        actor.send(detach);
      }
      actor.send(
        current({
          type: 'RELEASE_ATTACH_FENCE_RESOLVED',
          commandId: 'release-attach-fence-1',
          targets: [],
        })
      );

      expect(actor.getSnapshot().matches('release_zero_attached_fencing')).toBe(true);
      expect(actor.getSnapshot().context.manualDetachCommandCount).toBe(0);
      expect(actor.getSnapshot().context.liveSessionIds).toEqual([]);
    }
  );

  it('proves manual detach, zero-attached, control, sentinel, discovery and socket closure', () => {
    const actor = reachReleaseDisarming(true, 'manual');
    actor.send(current({ type: 'AUTO_ATTACH_DISARMED', commandId: 'disarm-manual-1' }));
    expect(actor.getSnapshot().matches('release_attach_fencing')).toBe(true);
    actor.send(
      current({
        type: 'RELEASE_ATTACH_FENCE_RESOLVED',
        commandId: 'release-attach-fence-manual',
        targets: [
          {
            targetId: TARGET_ID,
            type: 'service_worker',
            url: SCRIPT_URL,
            attached: true,
          },
        ],
      })
    );
    expect(actor.getSnapshot().matches('release_manual_detaching')).toBe(true);
    actor.send(
      current({
        type: 'RELEASE_MANUAL_DETACH_RESOLVED',
        commandId: 'manual-detach-1',
        targetId: TARGET_ID,
        sessionId: MANUAL_SESSION_ID,
      })
    );
    expect(actor.getSnapshot().matches('release_manual_detaching')).toBe(true);
    actor.send(detachEvent(TARGET_ID, MANUAL_SESSION_ID));
    expect(actor.getSnapshot().matches('release_zero_attached_fencing')).toBe(true);
    actor.send(
      current({
        type: 'RELEASE_ZERO_ATTACHED_FENCE_RESOLVED',
        commandId: 'zero-attached-fence-1',
        targets: [
          {
            targetId: TARGET_ID,
            type: 'service_worker',
            url: SCRIPT_URL,
            attached: false,
          },
        ],
      })
    );
    expect(actor.getSnapshot().matches('release_service_worker_disabling')).toBe(true);
    actor.send(
      current({
        type: 'SERVICE_WORKER_DISABLED',
        commandId: 'service-worker-disable-1',
        sessionId: CONTROL_SESSION_ID,
      })
    );
    expect(actor.getSnapshot().matches('release_control_detaching')).toBe(true);
    actor.send(
      current({
        type: 'CONTROL_DETACH_RESOLVED',
        commandId: 'control-detach-1',
        targetId: SENTINEL_TARGET_ID,
        sessionId: CONTROL_SESSION_ID,
      })
    );
    actor.send(detachEvent(SENTINEL_TARGET_ID, CONTROL_SESSION_ID));
    expect(actor.getSnapshot().matches('release_sentinel_fencing')).toBe(true);
    actor.send(
      current({
        type: 'SENTINEL_FENCE_RESOLVED',
        commandId: 'sentinel-release-fence-1',
        sentinels: [{ targetId: SENTINEL_TARGET_ID, url: 'about:blank', attached: false }],
      })
    );
    expect(actor.getSnapshot().matches('release_discovery_disabling')).toBe(true);
    actor.send(current({ type: 'DISCOVERY_DISABLED', commandId: 'discover-disable-1' }));
    expect(actor.getSnapshot().matches('release_socket_closing')).toBe(true);
    actor.send(current({ type: 'RAW_SOCKET_CLOSED', transportId: 'raw-transport-1' }));

    expect(actor.getSnapshot().matches('released')).toBe(true);
    expect(actor.getSnapshot().status).toBe('done');
    expect(actor.getSnapshot().context.liveSessionIds).toEqual([]);
    expect(actor.getSnapshot().context.releaseProofs).toEqual({
      autoAttachDisarmed: true,
      attachFence: true,
      manualDetachReplies: 1,
      manualDetachEvents: 1,
      zeroAttachedFence: true,
      serviceWorkerDisabled: true,
      controlDetachReply: true,
      controlDetachEvent: true,
      sentinelFence: true,
      discoveryDisabled: true,
      socketClosed: true,
    });
  });

  it('fails if a selected worker attaches after the first release fence closes inventory', () => {
    const actor = reachReleaseDisarming(true, 'manual');
    actor.send(current({ type: 'AUTO_ATTACH_DISARMED', commandId: 'disarm-1' }));
    actor.send(
      current({
        type: 'RELEASE_ATTACH_FENCE_RESOLVED',
        commandId: 'release-attach-fence-1',
        targets: [
          {
            targetId: TARGET_ID,
            type: 'service_worker',
            url: SCRIPT_URL,
            attached: true,
          },
        ],
      })
    );

    actor.send(
      current({
        type: 'TARGET_ATTACHED',
        attachmentOrigin: 'auto',
        targetId: TARGET_ID,
        sessionId: 'late-session',
        targetType: 'service_worker',
        url: SCRIPT_URL,
        waitingForDebugger: true,
      })
    );

    expect(actor.getSnapshot().matches('failed_releasing')).toBe(true);
  });
});
