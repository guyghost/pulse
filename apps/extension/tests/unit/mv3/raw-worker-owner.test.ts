import { describe, expect, it, vi } from 'vitest';

import type { RawCdpClientPort, RawWorkerEpochResult } from '../../mv3/harness/raw-worker-owner';
import { RawWorkerEpochFailure, runRawWorkerEpoch } from '../../mv3/harness/raw-worker-owner';
import {
  createRawBootstrapRetentionAckV1,
  createRawOperationalLedgerAuthorityV1,
  type RawBootstrapProvedV1,
  type RawBootstrapRetentionAckV1,
} from '../../mv3/harness/raw-operational-authority';
import type {
  RawCdpCloseReceipt,
  RawCdpCommand,
  RawCdpCommandReceipt,
  RawCdpEvent,
} from '../../mv3/harness/raw-cdp-client';

const WORKER_URL = 'chrome-extension://abcdefghijklmnop/service-worker-loader.js';
const SCOPE_URL = 'chrome-extension://abcdefghijklmnop/';
const SENTINEL_TARGET_ID = 'launch-sentinel-target-42';
const IDENTITY_EXPRESSION =
  '(() => ({ workerUrl: globalThis.location.href, registrationScope: globalThis.registration.scope }))()';

const RAW_RECEIPT_IDENTITY = Object.freeze({
  schemaVersion: 1 as const,
  processGeneration: 1,
  leaseEpoch: 1,
  transportId: 'raw-1',
});

function acknowledgeBootstrap(proof: RawBootstrapProvedV1): RawBootstrapRetentionAckV1 {
  return createRawBootstrapRetentionAckV1(proof);
}

type EventListener = (event: RawCdpEvent) => void | Promise<void>;
type BootstrapCommandFailure = 'identity-reject' | 'identity-timeout' | 'test-reject';

interface ScriptedRawClientOptions {
  readonly invalidSentinel?: boolean;
  readonly initiallyStopped?: boolean;
  readonly convergenceContextRace?: 'selected' | 'foreign';
  readonly wrongReplacementOrigin?: boolean;
  readonly reuseDestroyedContext?: boolean;
  readonly bootstrapCommandFailure?: BootstrapCommandFailure;
  readonly bootstrapReceiptIdentityOverride?: Partial<{
    readonly processGeneration: number;
    readonly leaseEpoch: number;
    readonly transportId: string;
  }>;
  readonly identityResultVariant?:
    'description' | 'extra-remote-object-field' | 'object-id' | 'outer-unknown-field';
  readonly testResultVariant?:
    | 'extra-exception-details-field'
    | 'malformed-exception-details'
    | 'remote-object-value-type-mismatch'
    | 'valid-exception-details';
  readonly delayedOptionalTestMs?: number;
  readonly lateStoppedVersionAfterStart?: boolean;
}

class ScriptedRawClient implements RawCdpClientPort {
  readonly commands: RawCdpCommand[] = [];
  readonly cleanupCommands: RawCdpCommand[] = [];
  readonly closed: Promise<RawCdpCloseReceipt>;
  closeCalls = 0;
  unsubscribeCalls = 0;
  cleanupStartedBeforeBootstrapSettled = false;
  optionalTestSettled = false;

  readonly #listeners = new Set<EventListener>();
  readonly #resolveClosed: (receipt: RawCdpCloseReceipt) => void;
  #nextId = 1;
  #runtimeEnableCount = 0;
  #targetFenceCount = 0;
  #versionRunningStatus: 'running' | 'stopped' = 'running';
  #controlledStopSeen = false;
  readonly #replacementResumed: Promise<void>;
  readonly #resolveReplacementResumed: () => void;
  #protocolCommandQueue = Promise.resolve();
  #cleanupCommandQueue = Promise.resolve();

  constructor(private readonly options: ScriptedRawClientOptions = {}) {
    this.#versionRunningStatus = options.initiallyStopped ? 'stopped' : 'running';
    let resolveReplacementResumed!: () => void;
    this.#replacementResumed = new Promise((resolve) => {
      resolveReplacementResumed = resolve;
    });
    this.#resolveReplacementResumed = resolveReplacementResumed;
    let resolveClosed!: (receipt: RawCdpCloseReceipt) => void;
    this.closed = new Promise((resolve) => {
      resolveClosed = resolve;
    });
    this.#resolveClosed = resolveClosed;
  }

  onEvent(listener: EventListener): () => void {
    this.#listeners.add(listener);
    return () => {
      this.unsubscribeCalls += 1;
      this.#listeners.delete(listener);
    };
  }

  sendCommand(command: RawCdpCommand): Promise<RawCdpCommandReceipt> {
    return this.#send(command, 'operational');
  }

  sendCommandBatch(commands: readonly RawCdpCommand[]): readonly Promise<RawCdpCommandReceipt>[] {
    return Object.freeze(commands.map((command) => this.#send(command, 'operational')));
  }

  sendCleanupCommand(command: RawCdpCommand): Promise<RawCdpCommandReceipt> {
    return this.#send(command, 'cleanup');
  }

  close(): void {
    if (this.closeCalls > 0) {
      return;
    }
    this.closeCalls += 1;
    this.#resolveClosed({
      ...RAW_RECEIPT_IDENTITY,
      code: 1000,
      reason: 'normal',
    });
  }

  async #send(
    command: RawCdpCommand,
    kind: 'cleanup' | 'operational'
  ): Promise<RawCdpCommandReceipt> {
    const recordedCommand = structuredClone(command);
    this.commands.push(recordedCommand);
    if (kind === 'cleanup') {
      this.cleanupCommands.push(recordedCommand);
      if (this.options.delayedOptionalTestMs !== undefined && !this.optionalTestSettled) {
        this.cleanupStartedBeforeBootstrapSettled = true;
      }
    }
    const id = this.#nextId++;
    const queue = kind === 'cleanup' ? this.#cleanupCommandQueue : this.#protocolCommandQueue;
    const response = queue.then(() => this.#respond(command));
    const nextQueue = response.then(
      () => undefined,
      () => undefined
    );
    if (kind === 'cleanup') {
      this.#cleanupCommandQueue = nextQueue;
    } else {
      this.#protocolCommandQueue = nextQueue;
    }
    const result = await response;
    const isBootstrapCommand =
      kind === 'operational' &&
      this.#controlledStopSeen &&
      (command.method === 'Runtime.runIfWaitingForDebugger' ||
        command.method === 'Runtime.evaluate');
    const receiptIdentity = {
      ...RAW_RECEIPT_IDENTITY,
      ...(isBootstrapCommand ? this.options.bootstrapReceiptIdentityOverride : undefined),
    };
    const receipt = {
      ...receiptIdentity,
      id,
      method: command.method,
      result,
      ...(command.sessionId === undefined ? {} : { sessionId: command.sessionId }),
    };
    return receipt;
  }

  async #respond(command: RawCdpCommand): Promise<Readonly<Record<string, unknown>>> {
    switch (command.method) {
      case 'Target.getTargets': {
        const filter = command.params?.filter as readonly { type?: string }[] | undefined;
        if (filter?.[0]?.type === 'page') {
          return {
            targetInfos: [
              {
                targetId: SENTINEL_TARGET_ID,
                type: 'page',
                url: this.options.invalidSentinel ? 'about:invalid' : 'about:blank',
                attached: false,
              },
            ],
          };
        }
        this.#targetFenceCount += 1;
        return {
          targetInfos: [
            {
              targetId: 'worker-target',
              type: 'service_worker',
              url: WORKER_URL,
              attached: this.#targetFenceCount > 1 && this.#targetFenceCount < 3,
            },
          ],
        };
      }
      case 'Target.setDiscoverTargets':
        return {};
      case 'Target.setAutoAttach':
        if (command.params?.autoAttach === true && !this.options.initiallyStopped) {
          await this.#emit({
            method: 'Target.attachedToTarget',
            params: {
              sessionId: 'worker-session',
              targetInfo: {
                attached: true,
                targetId: 'worker-target',
                type: 'service_worker',
                url: WORKER_URL,
              },
              waitingForDebugger: false,
            },
          });
        }
        if (command.params?.autoAttach === false) {
          await this.#emit({
            method: 'Target.detachedFromTarget',
            params: { sessionId: 'worker-session', targetId: 'worker-target' },
          });
        }
        return {};
      case 'Target.attachToTarget': {
        if (command.params?.targetId === SENTINEL_TARGET_ID) {
          return { sessionId: 'control-session' };
        }
        await this.#emit({
          method: 'Target.attachedToTarget',
          params: {
            sessionId: 'worker-session',
            targetInfo: {
              attached: true,
              targetId: 'worker-target',
              type: 'service_worker',
              url: WORKER_URL,
            },
            waitingForDebugger: true,
          },
        });
        return { sessionId: 'worker-session' };
      }
      case 'ServiceWorker.enable':
        if (this.options.convergenceContextRace === undefined) {
          await this.#emitRegistration();
          await this.#emitVersion(this.#versionRunningStatus);
        }
        return {};
      case 'Inspector.enable':
        if (this.options.convergenceContextRace !== undefined) {
          await this.#emitRegistration();
          await this.#emitVersion(this.#versionRunningStatus);
        }
        return {};
      case 'Runtime.enable':
        this.#runtimeEnableCount += 1;
        if (this.#runtimeEnableCount === 1 && this.options.convergenceContextRace !== undefined) {
          await this.#emit({
            method: 'Runtime.executionContextCreated',
            params: {
              context: { id: 6, uniqueId: 'context-during-convergence', origin: WORKER_URL },
            },
            sessionId:
              this.options.convergenceContextRace === 'selected'
                ? 'worker-session'
                : 'foreign-session',
          });
        }
        if (
          this.#versionRunningStatus === 'running' &&
          this.#runtimeEnableCount === 1 &&
          this.options.convergenceContextRace === undefined
        ) {
          await this.#emit({
            method: 'Runtime.executionContextCreated',
            params: {
              context: { id: 7, uniqueId: 'context-before-stop', origin: WORKER_URL },
            },
            sessionId: 'worker-session',
          });
        }
        return {};
      case 'ServiceWorker.startWorker': {
        if (
          this.options.initiallyStopped &&
          !this.commands.some((item) => item.method === 'ServiceWorker.stopWorker')
        ) {
          this.#versionRunningStatus = 'running';
          await this.#emit({
            method: 'Target.attachedToTarget',
            params: {
              sessionId: 'worker-session',
              targetInfo: {
                attached: true,
                targetId: 'worker-target',
                type: 'service_worker',
                url: WORKER_URL,
              },
              waitingForDebugger: true,
            },
          });
          await this.#emitVersion('running');
          return {};
        }
        if (this.options.lateStoppedVersionAfterStart) {
          await this.#emitVersion('stopped');
        }
        this.#versionRunningStatus = 'running';
        await this.#emit({
          method: 'Inspector.targetReloadedAfterCrash',
          params: {},
          sessionId: 'worker-session',
        });
        if (this.options.reuseDestroyedContext) {
          await this.#emit({
            method: 'Runtime.executionContextDestroyed',
            params: {
              executionContextId: 8,
              executionContextUniqueId: 'context-after-reload',
            },
            sessionId: 'worker-session',
          });
        } else {
          await this.#emit({
            method: 'Runtime.executionContextsCleared',
            params: {},
            sessionId: 'worker-session',
          });
        }
        await this.#emit({
          method: 'Runtime.executionContextCreated',
          params: {
            context: {
              id: 8,
              uniqueId: 'context-after-reload',
              origin: this.options.wrongReplacementOrigin ? SCOPE_URL.slice(0, -1) : WORKER_URL,
            },
          },
          sessionId: 'worker-session',
        });
        await this.#emitVersion('running');
        return {};
      }
      case 'Runtime.runIfWaitingForDebugger':
        if (this.#controlledStopSeen) {
          this.#resolveReplacementResumed();
        }
        await this.#emitVersion('running');
        return {};
      case 'ServiceWorker.stopWorker':
        this.#controlledStopSeen = true;
        this.#versionRunningStatus = 'stopped';
        await this.#emit({
          method: 'Inspector.targetCrashed',
          params: {},
          sessionId: 'worker-session',
        });
        await this.#emitVersion('stopped');
        return {};
      case 'Runtime.evaluate':
        await this.#replacementResumed;
        if (command.params?.expression === IDENTITY_EXPRESSION) {
          if (this.options.bootstrapCommandFailure === 'identity-reject') {
            throw new Error('scripted identity command rejection');
          }
          if (this.options.bootstrapCommandFailure === 'identity-timeout') {
            return new Promise<never>(() => undefined);
          }
          return {
            result: {
              type: 'object',
              value: { workerUrl: WORKER_URL, registrationScope: SCOPE_URL },
              ...(this.options.identityResultVariant === 'object-id'
                ? { objectId: 'remote-object-1' }
                : {}),
              ...(this.options.identityResultVariant === 'description'
                ? { description: 'Object' }
                : {}),
              ...(this.options.identityResultVariant === 'extra-remote-object-field'
                ? { unexpectedRemoteObjectField: true }
                : {}),
            },
            ...(this.options.identityResultVariant === 'outer-unknown-field'
              ? { unexpectedResultField: true }
              : {}),
          };
        }
        if (this.options.bootstrapCommandFailure === 'test-reject') {
          throw new Error('scripted test command rejection');
        }
        if (this.options.testResultVariant === 'malformed-exception-details') {
          return {
            result: { type: 'undefined' },
            exceptionDetails: 'malformed exception details',
          };
        }
        if (this.options.delayedOptionalTestMs !== undefined) {
          await new Promise((resolve) => setTimeout(resolve, this.options.delayedOptionalTestMs));
          this.optionalTestSettled = true;
        }
        if (this.options.testResultVariant === 'extra-exception-details-field') {
          return {
            result: { type: 'undefined' },
            exceptionDetails: {
              exceptionId: 1,
              text: 'probe failed',
              lineNumber: 0,
              columnNumber: 0,
              unexpected: true,
            },
          };
        }
        if (this.options.testResultVariant === 'valid-exception-details') {
          return {
            result: { type: 'undefined' },
            exceptionDetails: {
              exceptionId: 1,
              text: 'probe failed',
              lineNumber: 0,
              columnNumber: 0,
            },
          };
        }
        if (this.options.testResultVariant === 'remote-object-value-type-mismatch') {
          return { result: { type: 'boolean', value: { nested: true } } };
        }
        return { result: { type: 'boolean', value: true } };
      case 'Target.detachFromTarget':
        await this.#emit({
          method: 'Target.detachedFromTarget',
          params: {
            sessionId: command.params?.sessionId,
            targetId:
              command.params?.sessionId === 'control-session'
                ? SENTINEL_TARGET_ID
                : 'worker-target',
          },
        });
        return {};
      case 'ServiceWorker.disable':
        return {};
      default:
        throw new Error(`Unexpected command ${command.method}`);
    }
  }

  async #emitVersion(runningStatus: 'running' | 'stopped'): Promise<void> {
    await this.#emit({
      method: 'ServiceWorker.workerVersionUpdated',
      params: {
        versions: [
          {
            registrationId: 'registration-1',
            versionId: 'version-1',
            scriptURL: WORKER_URL,
            status: 'activated',
            runningStatus,
            targetId: 'worker-target',
          },
        ],
      },
      sessionId: 'control-session',
    });
  }

  async #emitRegistration(): Promise<void> {
    await this.#emit({
      method: 'ServiceWorker.workerRegistrationUpdated',
      params: {
        registrations: [
          { registrationId: 'registration-1', scopeURL: SCOPE_URL, isDeleted: false },
        ],
      },
      sessionId: 'control-session',
    });
  }

  async #emit(event: RawCdpEvent): Promise<void> {
    for (const listener of this.#listeners) {
      await listener(event);
    }
  }
}

function expectSuccessfulEpoch(result: RawWorkerEpochResult, expectedBootstrapCommands = 2): void {
  expect(result.authority).toMatchObject({
    extensionId: 'abcdefghijklmnop',
    registrationId: 'registration-1',
    versionId: 'version-1',
    scopeURL: SCOPE_URL,
    scriptURL: WORKER_URL,
    targetId: 'worker-target',
    sessionId: 'worker-session',
  });
  expect(result.restartReceipt).toMatchObject({
    schemaVersion: 1,
    processGeneration: 1,
    rawLeaseEpoch: 1,
    playwrightEpoch: 1,
    restartGeneration: 1,
    workerUrl: WORKER_URL,
  });
  expect(result.restartReceipt.receiptSha256).toMatch(/^[a-f0-9]{64}$/u);
  expect(result.restartProof).toMatchObject({
    schemaVersion: 1,
    processGeneration: 1,
    leaseEpoch: 1,
    transportId: 'raw-1',
    restartGeneration: 1,
    bootstrapCommandBatchSha256: expect.stringMatching(/^[a-f0-9]{64}$/u),
  });
  expect(result.restartProof.commandLedger).toHaveLength(expectedBootstrapCommands);
  expect(Object.isFrozen(result.restartProof)).toBe(true);
  expect(Object.isFrozen(result.restartProof.commandLedger)).toBe(true);
  expect(result.releaseReceipt).toMatchObject({
    schemaVersion: 1,
    released: true,
    transportId: 'raw-1',
    deadline: { timeoutMs: 5_000, completedWithinDeadline: true },
    commandLedger: expect.any(Array),
    attachmentInventory: expect.any(Array),
    proofs: {
      autoAttachDisarm: expect.any(Object),
      attachFence: expect.any(Object),
      zeroAttachedFence: expect.any(Object),
      serviceWorkerDisable: expect.any(Object),
      controlDetach: expect.any(Object),
      sentinelFence: expect.any(Object),
      discoveryDisable: expect.any(Object),
      close: expect.any(Object),
    },
  });
  expect(result.releaseReceipt.commandLedger.length).toBeGreaterThan(0);
  expect(result.releaseReceipt.attachmentInventory).toEqual([
    expect.objectContaining({
      sessionId: 'worker-session',
      targetId: 'worker-target',
      detached: true,
    }),
  ]);
  expect(result.releaseReceipt.proofs.workerDetachEvents).toEqual([
    expect.objectContaining({
      schemaVersion: 1,
      processGeneration: 1,
      leaseEpoch: 1,
      attachmentGeneration: 1,
      sessionId: 'worker-session',
      targetId: 'worker-target',
      eventSha256: expect.stringMatching(/^[a-f0-9]{64}$/u),
    }),
  ]);
  expect(result.releaseReceipt.proofs.controlDetachEvent).toMatchObject({
    schemaVersion: 1,
    processGeneration: 1,
    leaseEpoch: 1,
    attachmentGeneration: null,
    sessionId: 'control-session',
    targetId: SENTINEL_TARGET_ID,
    eventSha256: expect.stringMatching(/^[a-f0-9]{64}$/u),
  });
  expect(Object.isFrozen(result.releaseReceipt.commandLedger)).toBe(true);
}

function runScriptedEpoch(
  client: ScriptedRawClient,
  options: {
    readonly operationTimeoutMs?: number;
    readonly onBootstrapProved?: (
      proof: RawBootstrapProvedV1
    ) => Promise<RawBootstrapRetentionAckV1> | RawBootstrapRetentionAckV1;
    readonly probeExpression?: string;
  } = {}
): Promise<RawWorkerEpochResult> {
  return runRawWorkerEpoch({
    client,
    expectedWorkerPath: '/service-worker-loader.js',
    leaseEpoch: 1,
    operationTimeoutMs: options.operationTimeoutMs ?? 5_000,
    onBootstrapProved: options.onBootstrapProved ?? acknowledgeBootstrap,
    playwrightEpoch: 1,
    processGeneration: 1,
    releaseTimeoutMs: 5_000,
    restartGeneration: 0,
    transportId: 'raw-1',
    ...(options.probeExpression === undefined ? {} : { probeExpression: options.probeExpression }),
  });
}

function expectExactFailedRelease(client: ScriptedRawClient, releaseResumeRequired = false): void {
  expect(client.cleanupCommands).toEqual([
    ...(releaseResumeRequired
      ? [
          {
            method: 'Runtime.runIfWaitingForDebugger',
            params: {},
            sessionId: 'worker-session',
          },
        ]
      : []),
    {
      method: 'Target.setAutoAttach',
      params: { autoAttach: false, waitForDebuggerOnStart: false, flatten: true },
    },
    {
      method: 'Target.getTargets',
      params: {
        filter: [{ type: 'service_worker', exclude: false }, { exclude: true }],
      },
    },
    {
      method: 'Target.getTargets',
      params: {
        filter: [{ type: 'service_worker', exclude: false }, { exclude: true }],
      },
    },
    { method: 'ServiceWorker.disable', params: {}, sessionId: 'control-session' },
    {
      method: 'Target.detachFromTarget',
      params: { sessionId: 'control-session' },
    },
    {
      method: 'Target.getTargets',
      params: {
        filter: [{ type: 'page', exclude: false }, { exclude: true }],
      },
    },
    { method: 'Target.setDiscoverTargets', params: { discover: false } },
  ]);
  const controlledStopIndex = client.commands.findIndex(
    (command) => command.method === 'ServiceWorker.stopWorker'
  );
  expect(controlledStopIndex).toBeGreaterThanOrEqual(0);
  expect(
    client.commands
      .slice(controlledStopIndex + 1)
      .filter((command) => command.method === 'Runtime.runIfWaitingForDebugger')
  ).toHaveLength(releaseResumeRequired ? 2 : 1);
  expect(client.closeCalls).toBe(1);
  expect(client.unsubscribeCalls).toBe(1);
}

describe('runRawWorkerEpoch', () => {
  it('closes exactly once when acquisition fails before any worker authority exists', async () => {
    const client = new ScriptedRawClient({ invalidSentinel: true });

    await expect(runScriptedEpoch(client)).rejects.toThrow(/sole unattached about:blank/u);

    expect(client.cleanupCommands).toEqual([]);
    expect(client.closeCalls).toBe(1);
    expect(client.unsubscribeCalls).toBe(1);
  });

  it('retains a bounded selected-session context emitted during convergence', async () => {
    const client = new ScriptedRawClient({ convergenceContextRace: 'selected' });

    const result = await runScriptedEpoch(client);

    expectSuccessfulEpoch(result);
    expect(result.restartProof.bootstrapPreimage.revokedUniqueContextIdsSha256).toMatch(
      /^[a-f0-9]{64}$/u
    );
  });

  it('rejects a foreign convergence context but completes deterministic failed release', async () => {
    const client = new ScriptedRawClient({ convergenceContextRace: 'foreign' });

    await expect(runScriptedEpoch(client)).rejects.toThrow(
      /XState rejected EXECUTION_CONTEXT_CREATED from converging/u
    );

    expect(client.closeCalls).toBe(1);
    expect(client.unsubscribeCalls).toBe(1);
    expect(client.cleanupCommands.at(0)).toEqual({
      method: 'Target.setAutoAttach',
      params: { autoAttach: false, waitForDebuggerOnStart: false, flatten: true },
    });
  });

  it('retains one running worker session across a native stop/reload and releases it exactly', async () => {
    const client = new ScriptedRawClient();

    const result = await runRawWorkerEpoch({
      client,
      expectedWorkerPath: '/service-worker-loader.js',
      leaseEpoch: 1,
      operationTimeoutMs: 5_000,
      onBootstrapProved: acknowledgeBootstrap,
      playwrightEpoch: 1,
      processGeneration: 1,
      releaseTimeoutMs: 5_000,
      restartGeneration: 0,
      transportId: 'raw-1',
    });

    expectSuccessfulEpoch(result);
    expect(client.commands.map((command) => command.method)).toEqual([
      'Target.getTargets',
      'Target.getTargets',
      'Target.setDiscoverTargets',
      'Target.setAutoAttach',
      'Target.attachToTarget',
      'ServiceWorker.enable',
      'Target.getTargets',
      'Inspector.enable',
      'Runtime.enable',
      'ServiceWorker.stopWorker',
      'ServiceWorker.startWorker',
      'Runtime.enable',
      'Runtime.runIfWaitingForDebugger',
      'Runtime.evaluate',
      'Target.setAutoAttach',
      'Target.getTargets',
      'Target.getTargets',
      'ServiceWorker.disable',
      'Target.detachFromTarget',
      'Target.getTargets',
      'Target.setDiscoverTargets',
    ]);
  });

  it('seals the operational ledger at bootstrap and waits for its retained ACK before cleanup', async () => {
    const client = new ScriptedRawClient();
    let observedProof: RawBootstrapProvedV1 | undefined;
    let acknowledge: ((ack: RawBootstrapRetentionAckV1) => void) | undefined;
    const ackGate = new Promise<RawBootstrapRetentionAckV1>((resolve) => {
      acknowledge = resolve;
    });
    const onBootstrapProved = vi.fn((proof: RawBootstrapProvedV1) => {
      observedProof = proof;
      return ackGate;
    });

    const epoch = runScriptedEpoch(client, { onBootstrapProved });
    await vi.waitFor(() => expect(onBootstrapProved).toHaveBeenCalledOnce());

    expect(observedProof).toBeDefined();
    expect(client.cleanupCommands).toEqual([]);
    const proof = observedProof!;
    expect(proof.operationalCommandCount).toBe(14);
    acknowledge!(createRawBootstrapRetentionAckV1(proof));

    const result = await epoch;
    const finalAuthority = createRawOperationalLedgerAuthorityV1(result.releaseReceipt);
    expect(proof).toMatchObject(finalAuthority);
    expect(client.cleanupCommands.length).toBeGreaterThan(0);
    expect(onBootstrapProved).toHaveBeenCalledOnce();
  });

  it('issues no release command when bootstrap retention ACK is forged', async () => {
    const client = new ScriptedRawClient();

    await expect(
      runScriptedEpoch(client, {
        onBootstrapProved: (proof) => ({
          ...createRawBootstrapRetentionAckV1(proof),
          operationalLedgerSha256: '0'.repeat(64),
        }),
      })
    ).rejects.toThrow(/acknowledgment diverged/u);

    expect(client.cleanupCommands).toEqual([]);
    expect(client.closeCalls).toBe(1);
    expect(client.unsubscribeCalls).toBe(1);
  });

  it('treats a late native stopped duplicate after start dispatch as inert partial evidence', async () => {
    const client = new ScriptedRawClient({ lateStoppedVersionAfterStart: true });

    const result = await runScriptedEpoch(client);

    expectSuccessfulEpoch(result);
  });

  it('performs one non-authoritative warm start for a stopped worker before the controlled restart', async () => {
    const client = new ScriptedRawClient({ initiallyStopped: true });

    const result = await runRawWorkerEpoch({
      client,
      expectedWorkerPath: '/service-worker-loader.js',
      leaseEpoch: 1,
      operationTimeoutMs: 5_000,
      onBootstrapProved: acknowledgeBootstrap,
      playwrightEpoch: 1,
      processGeneration: 1,
      releaseTimeoutMs: 5_000,
      restartGeneration: 0,
      transportId: 'raw-1',
    });

    expectSuccessfulEpoch(result);
    expect(
      client.commands.filter((command) => command.method === 'ServiceWorker.startWorker')
    ).toHaveLength(2);
    expect(
      client.commands.filter((command) => command.method === 'ServiceWorker.stopWorker')
    ).toHaveLength(1);
  });

  it('performs the exact failed release after the identity command rejects', async () => {
    const client = new ScriptedRawClient({ bootstrapCommandFailure: 'identity-reject' });

    const failure = await runScriptedEpoch(client).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(RawWorkerEpochFailure);
    expect(failure).toMatchObject({
      message: 'scripted identity command rejection',
      commandLedger: [{ ordinal: 0, method: 'Runtime.runIfWaitingForDebugger' }],
      releaseReceipt: { released: true, transportId: 'raw-1' },
    });

    expectExactFailedRelease(client);
  });

  it('performs the exact failed release after the optional test command rejects', async () => {
    const client = new ScriptedRawClient({ bootstrapCommandFailure: 'test-reject' });

    await expect(
      runScriptedEpoch(client, { probeExpression: 'globalThis.__pulseProbe()' })
    ).rejects.toThrow(/scripted test command rejection/u);

    expectExactFailedRelease(client);
  });

  it('drains every bootstrap promise before reducing failure and beginning cleanup', async () => {
    const client = new ScriptedRawClient({
      bootstrapCommandFailure: 'identity-reject',
      delayedOptionalTestMs: 15,
    });

    const failure = await runScriptedEpoch(client, {
      probeExpression: 'globalThis.__pulseProbe()',
    }).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(RawWorkerEpochFailure);
    expect(failure).toMatchObject({
      batchSettlements: [
        { ordinal: 0, status: 'fulfilled', method: 'Runtime.runIfWaitingForDebugger' },
        { ordinal: 1, status: 'rejected', method: 'Runtime.evaluate' },
        { ordinal: 2, status: 'fulfilled', method: 'Runtime.evaluate' },
      ],
    });
    expect(client.optionalTestSettled).toBe(true);
    expect(client.cleanupStartedBeforeBootstrapSettled).toBe(false);
    expectExactFailedRelease(client);
  });

  it('performs the exact failed release after the bootstrap batch reaches its deadline', async () => {
    vi.useFakeTimers();
    try {
      const client = new ScriptedRawClient({ bootstrapCommandFailure: 'identity-timeout' });
      const epoch = runScriptedEpoch(client, { operationTimeoutMs: 25 });
      const rejection = expect(epoch).rejects.toThrow(/absolute deadline/u);

      await vi.runAllTimersAsync();
      await rejection;

      expectExactFailedRelease(client);
    } finally {
      vi.useRealTimers();
    }
  });

  it.each([
    ['process generation', { processGeneration: 2 }],
    ['lease epoch', { leaseEpoch: 2 }],
    ['transport', { transportId: 'raw-foreign' }],
  ] as const)('rejects a bootstrap receipt from another %s', async (_label, identityOverride) => {
    const client = new ScriptedRawClient({
      bootstrapReceiptIdentityOverride: identityOverride,
    });

    await expect(runScriptedEpoch(client)).rejects.toBeInstanceOf(Error);

    expectExactFailedRelease(client, true);
  });

  it.each([
    'object-id',
    'description',
    'extra-remote-object-field',
    'outer-unknown-field',
  ] as const)('rejects a non-exact identity result variant %s', async (identityResultVariant) => {
    const client = new ScriptedRawClient({ identityResultVariant });

    await expect(runScriptedEpoch(client)).rejects.toThrow(/malformed/u);

    expectExactFailedRelease(client);
  });

  it('retains one schema-exact optional probe exception as an application diagnostic', async () => {
    const client = new ScriptedRawClient({ testResultVariant: 'valid-exception-details' });

    const result = await runScriptedEpoch(client, {
      probeExpression: 'globalThis.__pulseProbe()',
    });

    expect(result.applicationDiagnostics).toEqual([
      expect.objectContaining({ kind: 'probe.exceptionDetails' }),
    ]);
    expectSuccessfulEpoch(result, 3);
  });

  it('rejects a test result whose exceptionDetails schema is not an object', async () => {
    const client = new ScriptedRawClient({
      testResultVariant: 'malformed-exception-details',
    });

    await expect(
      runScriptedEpoch(client, { probeExpression: 'globalThis.__pulseProbe()' })
    ).rejects.toThrow(/malformed/u);

    expectExactFailedRelease(client);
  });

  it.each([
    ['unknown exceptionDetails field', 'extra-exception-details-field'],
    ['RemoteObject value/type mismatch', 'remote-object-value-type-mismatch'],
  ] as const)('rejects a Runtime.evaluate result with %s', async (_label, testResultVariant) => {
    const client = new ScriptedRawClient({ testResultVariant });

    await expect(
      runScriptedEpoch(client, { probeExpression: 'globalThis.__pulseProbe()' })
    ).rejects.toThrow(/malformed/u);

    expectExactFailedRelease(client);
  });

  it('blocks the shell immediately when a native event diverges from the XState authority', async () => {
    const client = new ScriptedRawClient({ wrongReplacementOrigin: true });

    await expect(
      runRawWorkerEpoch({
        client,
        expectedWorkerPath: '/service-worker-loader.js',
        leaseEpoch: 1,
        operationTimeoutMs: 5_000,
        onBootstrapProved: acknowledgeBootstrap,
        playwrightEpoch: 1,
        processGeneration: 1,
        releaseTimeoutMs: 5_000,
        restartGeneration: 0,
        transportId: 'raw-1',
      })
    ).rejects.toThrow(/XState rejected EXECUTION_CONTEXT_CREATED/u);
  });

  it('rejects a replacement context that reuses a native destroyed unique ID', async () => {
    const client = new ScriptedRawClient({ reuseDestroyedContext: true });

    await expect(
      runRawWorkerEpoch({
        client,
        expectedWorkerPath: '/service-worker-loader.js',
        leaseEpoch: 1,
        operationTimeoutMs: 5_000,
        onBootstrapProved: acknowledgeBootstrap,
        playwrightEpoch: 1,
        processGeneration: 1,
        releaseTimeoutMs: 5_000,
        restartGeneration: 0,
        transportId: 'raw-1',
      })
    ).rejects.toThrow(/destroyed post-crash context identity/u);
  });
});
