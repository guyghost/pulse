import { sha256Jcs } from '../../mv3/harness/playwright-authority';

interface CompleteRawReleaseReceiptOptions {
  readonly processGeneration: number;
  readonly leaseEpoch: number;
  readonly transportId: string;
}

const WORKER_TARGET_ID = 'worker-target-1';
const WORKER_SESSION_ID = 'raw-session-1';
const WORKER_URL =
  'chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/background/service-worker.js';
const CONTROL_SESSION_ID = 'control-session-1';
const SENTINEL_TARGET_ID = 'sentinel-target-1';
const REGISTRATION_SCOPE = 'chrome-extension://aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa/';
const VERSION_ID = 'version-1';
const UNIQUE_CONTEXT_ID = 'context-after-reload';
const SERVICE_WORKER_FILTER = Object.freeze([
  Object.freeze({ type: 'service_worker', exclude: false }),
  Object.freeze({ exclude: true }),
]);
const PAGE_FILTER = Object.freeze([
  Object.freeze({ type: 'page', exclude: false }),
  Object.freeze({ exclude: true }),
]);

export function createCompleteRawReleaseReceipt(options: CompleteRawReleaseReceiptOptions) {
  const identity = {
    schemaVersion: 1 as const,
    processGeneration: options.processGeneration,
    leaseEpoch: options.leaseEpoch,
    transportId: options.transportId,
  };
  const workerTargets = [
    {
      targetId: WORKER_TARGET_ID,
      type: 'service_worker',
      url: WORKER_URL,
      attached: false,
    },
  ];
  const sentinelTargets = [
    {
      targetId: SENTINEL_TARGET_ID,
      type: 'page',
      url: 'about:blank',
      attached: false,
    },
  ];
  const operationalCommands = [
    {
      id: 1,
      method: 'Target.getTargets',
      sessionId: null,
      params: { filter: PAGE_FILTER },
      result: { targetInfos: sentinelTargets },
    },
    {
      id: 2,
      method: 'Target.getTargets',
      sessionId: null,
      params: { filter: SERVICE_WORKER_FILTER },
      result: { targetInfos: workerTargets },
    },
    {
      id: 3,
      method: 'Target.setDiscoverTargets',
      sessionId: null,
      params: { discover: true, filter: SERVICE_WORKER_FILTER },
      result: {},
    },
    {
      id: 4,
      method: 'Target.setAutoAttach',
      sessionId: null,
      params: {
        autoAttach: true,
        waitForDebuggerOnStart: true,
        flatten: true,
        filter: SERVICE_WORKER_FILTER,
      },
      result: {},
    },
    {
      id: 5,
      method: 'Target.attachToTarget',
      sessionId: null,
      params: { targetId: SENTINEL_TARGET_ID, flatten: true },
      result: { sessionId: CONTROL_SESSION_ID },
    },
    {
      id: 6,
      method: 'ServiceWorker.enable',
      sessionId: CONTROL_SESSION_ID,
      params: {},
      result: {},
    },
    {
      id: 7,
      method: 'Target.getTargets',
      sessionId: null,
      params: { filter: SERVICE_WORKER_FILTER },
      result: { targetInfos: workerTargets },
    },
    {
      id: 8,
      method: 'Inspector.enable',
      sessionId: WORKER_SESSION_ID,
      params: {},
      result: {},
    },
    {
      id: 9,
      method: 'Runtime.enable',
      sessionId: WORKER_SESSION_ID,
      params: {},
      result: {},
    },
    {
      id: 10,
      method: 'ServiceWorker.stopWorker',
      sessionId: CONTROL_SESSION_ID,
      params: { versionId: VERSION_ID },
      result: {},
    },
    {
      id: 11,
      method: 'ServiceWorker.startWorker',
      sessionId: CONTROL_SESSION_ID,
      params: { scopeURL: REGISTRATION_SCOPE },
      result: {},
    },
    {
      id: 12,
      method: 'Runtime.enable',
      sessionId: WORKER_SESSION_ID,
      params: {},
      result: {},
    },
    {
      id: 13,
      method: 'Runtime.runIfWaitingForDebugger',
      sessionId: WORKER_SESSION_ID,
      params: {},
      result: {},
    },
    {
      id: 14,
      method: 'Runtime.evaluate',
      sessionId: WORKER_SESSION_ID,
      params: {
        expression:
          '(() => ({ workerUrl: globalThis.location.href, registrationScope: globalThis.registration.scope }))()',
        uniqueContextId: UNIQUE_CONTEXT_ID,
        awaitPromise: true,
        returnByValue: true,
        includeCommandLineAPI: false,
        silent: false,
      },
      result: {
        result: {
          type: 'object',
          value: { workerUrl: WORKER_URL, registrationScope: REGISTRATION_SCOPE },
        },
      },
    },
  ] as const;
  const cleanupCommands = [
    {
      id: 15,
      method: 'Target.setAutoAttach',
      sessionId: null,
      params: { autoAttach: false, waitForDebuggerOnStart: false, flatten: true },
      result: {},
    },
    {
      id: 16,
      method: 'Target.getTargets',
      sessionId: null,
      params: { filter: SERVICE_WORKER_FILTER },
      result: { targetInfos: workerTargets },
    },
    {
      id: 17,
      method: 'Target.getTargets',
      sessionId: null,
      params: { filter: SERVICE_WORKER_FILTER },
      result: { targetInfos: workerTargets },
    },
    {
      id: 18,
      method: 'ServiceWorker.disable',
      sessionId: CONTROL_SESSION_ID,
      params: {},
      result: {},
    },
    {
      id: 19,
      method: 'Target.detachFromTarget',
      sessionId: null,
      params: { sessionId: CONTROL_SESSION_ID },
      result: {},
    },
    {
      id: 20,
      method: 'Target.getTargets',
      sessionId: null,
      params: { filter: PAGE_FILTER },
      result: { targetInfos: sentinelTargets },
    },
    {
      id: 21,
      method: 'Target.setDiscoverTargets',
      sessionId: null,
      params: { discover: false },
      result: {},
    },
  ] as const;
  const commandReceipt = (command: (typeof cleanupCommands)[number]) => ({
    ...identity,
    id: command.id,
    method: command.method,
    result: command.result,
    ...(command.sessionId === null ? {} : { sessionId: command.sessionId }),
  });
  const detachEvidence = (
    attachmentGeneration: number | null,
    targetId: string,
    sessionId: string
  ) => {
    const preimage = {
      ...identity,
      attachmentGeneration,
      targetId,
      sessionId,
      method: 'Target.detachedFromTarget' as const,
    };
    return {
      ...preimage,
      preimage,
      eventSha256: sha256Jcs(preimage),
    };
  };
  const close = {
    ...identity,
    code: 1000,
    reason: 'closed',
  };

  return {
    ...identity,
    released: true as const,
    deadline: { timeoutMs: 5_000, completedWithinDeadline: true as const },
    commandLedger: [
      ...operationalCommands.map((command, ordinal) => ({
        ordinal,
        kind: 'operational' as const,
        commandId: command.id,
        method: command.method,
        sessionId: command.sessionId,
        paramsSha256: sha256Jcs(command.params),
        status: 'fulfilled' as const,
        resultSha256: sha256Jcs(command.result),
        rejectionSha256: null,
      })),
      ...cleanupCommands.map((command, index) => ({
        ordinal: operationalCommands.length + index,
        kind: 'cleanup' as const,
        commandId: command.id,
        method: command.method,
        sessionId: command.sessionId,
        paramsSha256: sha256Jcs(command.params),
        status: 'fulfilled' as const,
        resultSha256: sha256Jcs(command.result),
        rejectionSha256: null,
      })),
    ],
    attachmentInventory: [
      {
        attachmentGeneration: 1,
        origin: 'auto' as const,
        sessionId: WORKER_SESSION_ID,
        targetId: WORKER_TARGET_ID,
        url: WORKER_URL,
        waitingForDebugger: false,
        detached: true,
      },
    ],
    proofs: {
      resumeReceipts: [],
      autoAttachDisarm: commandReceipt(cleanupCommands[0]),
      attachFence: { receipt: commandReceipt(cleanupCommands[1]), targets: workerTargets },
      manualDetachReceipts: [],
      workerDetachEvents: [detachEvidence(1, WORKER_TARGET_ID, WORKER_SESSION_ID)],
      zeroAttachedFence: { receipt: commandReceipt(cleanupCommands[2]), targets: workerTargets },
      serviceWorkerDisable: commandReceipt(cleanupCommands[3]),
      controlDetach: commandReceipt(cleanupCommands[4]),
      controlDetachEvent: detachEvidence(null, SENTINEL_TARGET_ID, CONTROL_SESSION_ID),
      sentinelFence: { receipt: commandReceipt(cleanupCommands[5]), targets: sentinelTargets },
      discoveryDisable: commandReceipt(cleanupCommands[6]),
      close,
    },
    close,
  };
}
