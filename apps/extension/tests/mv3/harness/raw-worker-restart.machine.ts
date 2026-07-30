import { createHash } from 'node:crypto';

import { assign, setup } from 'xstate';

const MAX_CONTEXT_AUTHORITIES = 4_096;
const IDENTITY_EXPRESSION =
  '(() => ({ workerUrl: globalThis.location.href, registrationScope: globalThis.registration.scope }))()';

export interface RawWorkerRestartInput {
  readonly processGeneration: number;
  readonly leaseEpoch: number;
  readonly restartGeneration: number;
  readonly expectedWorkerPath: string;
  readonly testProbeExpression: string | null;
}

interface RegistrationRecord {
  readonly registrationId: string;
  readonly scopeURL: string;
  readonly isDeleted: boolean;
}

interface VersionRecord {
  readonly registrationId: string;
  readonly versionId: string;
  readonly scriptURL: string;
  readonly status: 'activated' | 'redundant' | string;
  readonly runningStatus: 'starting' | 'running' | 'stopped' | string;
  readonly targetId?: string;
}

interface TargetRecord {
  readonly targetId: string;
  readonly type: string;
  readonly url: string;
  readonly attached: boolean;
}

interface SessionRecord {
  readonly sessionId: string;
  readonly targetId: string;
  readonly waitingForDebugger: boolean;
  readonly attachmentOrigin: 'auto' | 'manual';
}

interface ContextAuthorityRecord {
  readonly executionContextId: number;
  readonly uniqueContextId: string;
  readonly generation: number;
  readonly sessionId: string;
  readonly originMatchesScriptURL: boolean;
  readonly eventSha256: string;
}

interface ReleaseProofs {
  readonly autoAttachDisarmed: boolean;
  readonly attachFence: boolean;
  readonly manualDetachReplies: number;
  readonly manualDetachEvents: number;
  readonly zeroAttachedFence: boolean;
  readonly serviceWorkerDisabled: boolean;
  readonly controlDetachReply: boolean;
  readonly controlDetachEvent: boolean;
  readonly sentinelFence: boolean;
  readonly discoveryDisabled: boolean;
  readonly socketClosed: boolean;
}

interface RawWorkerRestartContext extends RawWorkerRestartInput {
  readonly testProbeConfigured: boolean;
  readonly sentinelTargetId: string | null;
  readonly registration: RegistrationRecord | null;
  readonly version: VersionRecord | null;
  readonly targetId: string | null;
  readonly convergenceFenceSeen: boolean;
  readonly selectedSession: SessionRecord | null;
  readonly inspectorEnabledSessionIds: readonly string[];
  readonly runtimeEnabledSessionIds: readonly string[];
  readonly warmupStarted: boolean;
  readonly warmupStartCount: number;
  readonly warmupStartResolved: boolean;
  readonly warmupResumeResolved: boolean;
  readonly provisionalSessionId: string | null;
  readonly knownSessionIds: readonly string[];
  readonly controlTargetId: string | null;
  readonly controlSessionId: string | null;
  readonly stopCommandCount: number;
  readonly stopResolved: boolean;
  readonly stoppedVersionObserved: boolean;
  readonly crashObserved: boolean;
  readonly crashEventSha256: string | null;
  readonly contextGeneration: number;
  readonly preCrashContexts: readonly ContextAuthorityRecord[];
  readonly activeContexts: readonly ContextAuthorityRecord[];
  readonly revokedUniqueContextIds: readonly string[];
  readonly revokedUniqueContextIdsSha256: string | null;
  readonly postCrashDestroyedUniqueContextIds: readonly string[];
  readonly postCrashDestroyedUniqueContextIdsSha256: string | null;
  readonly retiredContextEvidenceCount: number;
  readonly startCommandCount: number;
  readonly startResolved: boolean;
  readonly reloadObserved: boolean;
  readonly replacementVersionObserved: boolean;
  readonly postReloadRuntimeEnabled: boolean;
  readonly postReloadContextObserved: boolean;
  readonly uniqueContextId: string | null;
  readonly identityProbePassed: boolean;
  readonly identityCommandId: number | null;
  readonly identityParamsSha256: string | null;
  readonly identityResultSha256: string | null;
  readonly testProbeCompleted: boolean;
  readonly testCommandId: number | null;
  readonly testParamsSha256: string | null;
  readonly testResultSha256: string | null;
  readonly resumeCommandCount: number;
  readonly resumeResolved: boolean;
  readonly resumeCommandId: number | null;
  readonly resumeParamsSha256: string | null;
  readonly resumeResultSha256: string | null;
  readonly bootstrapCommandBatchSha256: string | null;
  readonly failureObserved: boolean;
  readonly failureReleaseStarted: boolean;
  readonly inventorySessions: readonly SessionRecord[];
  readonly liveSessionIds: readonly string[];
  readonly resumedSessionIds: readonly string[];
  readonly releaseFenceClosed: boolean;
  readonly releaseManualSessionIds: readonly string[];
  readonly manualDetachReplySessionIds: readonly string[];
  readonly manualDetachEventSessionIds: readonly string[];
  readonly manualDetachCommandCount: number;
  readonly releaseProofs: ReleaseProofs;
}

type LeaseEvent<T extends string, P extends object = Record<never, never>> = Readonly<
  { type: T; processGeneration: number; leaseEpoch: number } & P
>;

export type RawWorkerRestartEvent =
  | LeaseEvent<
      'INITIAL_SENTINEL_FENCE_RESOLVED',
      {
        readonly commandId: string;
        readonly sentinels: readonly {
          readonly targetId: string;
          readonly url: string;
          readonly attached: boolean;
        }[];
      }
    >
  | LeaseEvent<
      'PREARM_ATTACH_FENCE_RESOLVED',
      { readonly commandId: string; readonly attachedWorkers: readonly unknown[] }
    >
  | LeaseEvent<'DISCOVERY_ACKED', { readonly commandId: string }>
  | LeaseEvent<'AUTO_ATTACH_ACKED', { readonly commandId: string }>
  | LeaseEvent<
      'CONTROL_ATTACH_RESOLVED',
      { readonly commandId: string; readonly targetId: string; readonly sessionId: string }
    >
  | LeaseEvent<'SERVICE_WORKER_ENABLED', { readonly commandId: string; readonly sessionId: string }>
  | LeaseEvent<'REGISTRATION_UPDATED', { readonly registration: RegistrationRecord }>
  | LeaseEvent<'VERSION_UPDATED', { readonly version: VersionRecord }>
  | LeaseEvent<
      'TARGET_ATTACHED',
      {
        readonly attachmentOrigin: 'auto' | 'manual';
        readonly targetId: string;
        readonly sessionId: string;
        readonly targetType: string;
        readonly url: string;
        readonly waitingForDebugger: boolean;
      }
    >
  | LeaseEvent<
      'TARGET_DETACHED',
      {
        readonly targetId: string;
        readonly sessionId: string;
        readonly eventPreimage: {
          readonly targetId: string;
          readonly sessionId: string;
        };
        readonly eventSha256: string;
      }
    >
  | LeaseEvent<'TARGET_DESTROYED', { readonly targetId: string }>
  | LeaseEvent<'INSPECTOR_ENABLED', { readonly commandId: string; readonly sessionId: string }>
  | LeaseEvent<'RUNTIME_ENABLED', { readonly commandId: string; readonly sessionId: string }>
  | LeaseEvent<
      'CONVERGENCE_FENCE_RESOLVED',
      { readonly commandId: string; readonly targets: readonly TargetRecord[] }
    >
  | LeaseEvent<
      'CONVERGENCE_RESUME_RESOLVED',
      { readonly commandId: string; readonly sessionId: string }
    >
  | LeaseEvent<
      'WARMUP_TARGET_FENCE_RESOLVED',
      { readonly commandId: string; readonly targets: readonly TargetRecord[] }
    >
  | LeaseEvent<'WARMUP_ATTACH_RESOLVED', { readonly commandId: string; readonly sessionId: string }>
  | LeaseEvent<'WARMUP_START_RESOLVED', { readonly commandId: string; readonly scopeURL?: string }>
  | LeaseEvent<'WARMUP_RESUME_RESOLVED', { readonly commandId: string; readonly sessionId: string }>
  | LeaseEvent<'STOP_RESOLVED', { readonly commandId: string }>
  | LeaseEvent<'START_RESOLVED', { readonly commandId: string }>
  | LeaseEvent<
      'INSPECTOR_TARGET_CRASHED',
      {
        readonly targetId: string;
        readonly sessionId: string;
        readonly eventSha256: string;
      }
    >
  | LeaseEvent<
      'INSPECTOR_TARGET_RELOADED',
      {
        readonly targetId: string;
        readonly sessionId: string;
        readonly eventSha256: string;
      }
    >
  | LeaseEvent<
      'EXECUTION_CONTEXT_CREATED',
      {
        readonly sessionId: string;
        readonly context: {
          readonly id: number;
          readonly uniqueId: string;
          readonly origin: string;
        };
        readonly eventSha256: string;
      }
    >
  | LeaseEvent<
      'EXECUTION_CONTEXT_DESTROYED',
      {
        readonly sessionId: string;
        readonly executionContextId: number;
        readonly executionContextUniqueId: string;
        readonly eventSha256: string;
      }
    >
  | LeaseEvent<
      'EXECUTION_CONTEXTS_CLEARED',
      { readonly sessionId: string; readonly eventSha256: string }
    >
  | LeaseEvent<
      'IDENTITY_PROBE_RESOLVED',
      {
        readonly commandId: number;
        readonly restartGeneration: number;
        readonly method: 'Runtime.evaluate';
        readonly paramsSha256: string;
        readonly resultSha256: string;
        readonly sessionId: string;
        readonly uniqueContextId: string;
        readonly workerUrl: string;
        readonly registrationScope: string;
      }
    >
  | LeaseEvent<
      'TEST_PROBE_RESOLVED',
      {
        readonly commandId: number;
        readonly restartGeneration: number;
        readonly method: 'Runtime.evaluate';
        readonly paramsSha256: string;
        readonly resultSha256: string;
        readonly sessionId: string;
        readonly uniqueContextId: string;
        readonly diagnosticDisposition: 'clean' | 'application_exception';
      }
    >
  | LeaseEvent<'IDENTITY_PROOF_FAILED'>
  | LeaseEvent<'APPLICATION_DIAGNOSTIC_RECORDED'>
  | LeaseEvent<
      'RESUME_RESOLVED',
      {
        readonly commandId: number;
        readonly restartGeneration: number;
        readonly method: 'Runtime.runIfWaitingForDebugger';
        readonly paramsSha256: string;
        readonly resultSha256: string;
        readonly sessionId: string;
      }
    >
  | LeaseEvent<
      'RELEASE_RESUME_RESOLVED',
      { readonly commandId: string; readonly sessionId: string }
    >
  | LeaseEvent<'AUTO_ATTACH_DISARMED', { readonly commandId: string }>
  | LeaseEvent<
      'RELEASE_ATTACH_FENCE_RESOLVED',
      { readonly commandId: string; readonly targets: readonly TargetRecord[] }
    >
  | LeaseEvent<
      'RELEASE_MANUAL_DETACH_RESOLVED',
      {
        readonly commandId: string;
        readonly targetId: string;
        readonly sessionId: string;
      }
    >
  | LeaseEvent<
      'RELEASE_ZERO_ATTACHED_FENCE_RESOLVED',
      { readonly commandId: string; readonly targets: readonly TargetRecord[] }
    >
  | LeaseEvent<
      'SERVICE_WORKER_DISABLED',
      { readonly commandId: string; readonly sessionId: string }
    >
  | LeaseEvent<
      'CONTROL_DETACH_RESOLVED',
      {
        readonly commandId: string;
        readonly targetId: string;
        readonly sessionId: string;
      }
    >
  | LeaseEvent<
      'SENTINEL_FENCE_RESOLVED',
      {
        readonly commandId: string;
        readonly sentinels: readonly {
          readonly targetId: string;
          readonly url: string;
          readonly attached: boolean;
        }[];
      }
    >
  | LeaseEvent<'DISCOVERY_DISABLED', { readonly commandId: string }>
  | LeaseEvent<'RAW_SOCKET_CLOSED', { readonly transportId: string }>
  | LeaseEvent<'OPERATION_TIMED_OUT'>
  | LeaseEvent<'OBSERVER_PROTOCOL_FAILED'>
  | LeaseEvent<'BEGIN_FAILED_RELEASE'>
  | LeaseEvent<'EVIDENCE_OVERFLOW_RECORDED'>;

function isCurrent(context: RawWorkerRestartContext, event: RawWorkerRestartEvent): boolean {
  return (
    event.processGeneration === context.processGeneration && event.leaseEpoch === context.leaseEpoch
  );
}

function appendUnique(values: readonly string[], value: string): readonly string[] {
  return values.includes(value) ? values : [...values, value];
}

function removeValue(values: readonly string[], value: string): readonly string[] {
  return values.filter((candidate) => candidate !== value);
}

function upsertInventorySession(
  sessions: readonly SessionRecord[],
  session: SessionRecord
): readonly SessionRecord[] {
  const existing = sessions.find((candidate) => candidate.sessionId === session.sessionId);
  if (existing === undefined) {
    return [...sessions, session];
  }
  return sessions.map((candidate) =>
    candidate.sessionId === session.sessionId ? { ...candidate, ...session } : candidate
  );
}

function updateInventoryWaiting(
  sessions: readonly SessionRecord[],
  sessionId: string,
  waitingForDebugger: boolean
): readonly SessionRecord[] {
  return sessions.map((session) =>
    session.sessionId === sessionId ? { ...session, waitingForDebugger } : session
  );
}

function selectedIdentityMatches(
  context: RawWorkerRestartContext,
  targetId: string,
  sessionId: string
): boolean {
  return (
    context.selectedSession?.targetId === targetId &&
    context.selectedSession.sessionId === sessionId &&
    context.targetId === targetId
  );
}

function inventoryIdentityMatches(
  context: RawWorkerRestartContext,
  targetId: string,
  sessionId: string
): boolean {
  return context.inventorySessions.some(
    (session) => session.sessionId === sessionId && session.targetId === targetId
  );
}

function attachmentPreservesInventoryIdentity(
  context: RawWorkerRestartContext,
  event: Extract<RawWorkerRestartEvent, { readonly type: 'TARGET_ATTACHED' }>
): boolean {
  const existing = context.inventorySessions.find(
    (session) => session.sessionId === event.sessionId
  );
  return (
    existing === undefined ||
    (existing.targetId === event.targetId && existing.attachmentOrigin === event.attachmentOrigin)
  );
}

function sameSelectedVersion(
  context: RawWorkerRestartContext,
  version: VersionRecord,
  runningStatuses: readonly string[]
): boolean {
  const frozen = context.version;
  return (
    frozen !== null &&
    version.registrationId === frozen.registrationId &&
    version.versionId === frozen.versionId &&
    version.scriptURL === frozen.scriptURL &&
    version.status === 'activated' &&
    runningStatuses.includes(version.runningStatus) &&
    (version.targetId === undefined || version.targetId === context.targetId)
  );
}

function sameVersionRecord(left: VersionRecord | null, right: VersionRecord): boolean {
  return (
    left !== null &&
    left.registrationId === right.registrationId &&
    left.versionId === right.versionId &&
    left.scriptURL === right.scriptURL &&
    left.status === right.status &&
    left.runningStatus === right.runningStatus &&
    left.targetId === right.targetId
  );
}

function isSha256(value: string): boolean {
  return /^[a-f\d]{64}$/iu.test(value);
}

function isCanonicalSha256(value: string): boolean {
  return /^[a-f\d]{64}$/u.test(value);
}

function canonicalize(value: unknown, ancestors = new Set<object>()): string {
  if (value === null) {
    return 'null';
  }
  if (typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new TypeError('Canonical evidence numbers must be finite.');
    }
    return JSON.stringify(value);
  }
  if (typeof value !== 'object') {
    throw new TypeError(`Unsupported canonical evidence value: ${typeof value}.`);
  }
  if (ancestors.has(value)) {
    throw new TypeError('Cyclic canonical evidence is forbidden.');
  }
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      return `[${value.map((item) => canonicalize(item, ancestors)).join(',')}]`;
    }
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalize(record[key], ancestors)}`)
      .join(',')}}`;
  } finally {
    ancestors.delete(value);
  }
}

function sha256Canonical(value: unknown): string {
  return createHash('sha256').update(canonicalize(value), 'utf8').digest('hex');
}

function evaluationParams(expression: string, uniqueContextId: string) {
  return {
    expression,
    uniqueContextId,
    awaitPromise: true,
    returnByValue: true,
    includeCommandLineAPI: false,
    silent: false,
  } as const;
}

function expectedIdentityParamsSha256(context: RawWorkerRestartContext): string | null {
  return context.uniqueContextId === null
    ? null
    : sha256Canonical(evaluationParams(IDENTITY_EXPRESSION, context.uniqueContextId));
}

function expectedTestParamsSha256(context: RawWorkerRestartContext): string | null {
  return context.uniqueContextId === null || context.testProbeExpression === null
    ? null
    : sha256Canonical(evaluationParams(context.testProbeExpression, context.uniqueContextId));
}

function bootstrapCommandBatchSha256(
  context: RawWorkerRestartContext,
  testProof: {
    readonly commandId: number;
    readonly paramsSha256: string;
    readonly resultSha256: string;
  } | null
): string | null {
  if (
    context.selectedSession === null ||
    context.resumeCommandId === null ||
    context.resumeParamsSha256 === null ||
    context.resumeResultSha256 === null ||
    context.identityCommandId === null ||
    context.identityParamsSha256 === null ||
    context.identityResultSha256 === null
  ) {
    return null;
  }
  const commands = [
    {
      ordinal: 0,
      commandId: context.resumeCommandId,
      method: 'Runtime.runIfWaitingForDebugger',
      paramsSha256: context.resumeParamsSha256,
      resultSha256: context.resumeResultSha256,
    },
    {
      ordinal: 1,
      commandId: context.identityCommandId,
      method: 'Runtime.evaluate',
      paramsSha256: context.identityParamsSha256,
      resultSha256: context.identityResultSha256,
    },
    ...(testProof === null
      ? []
      : [
          {
            ordinal: 2,
            commandId: testProof.commandId,
            method: 'Runtime.evaluate',
            paramsSha256: testProof.paramsSha256,
            resultSha256: testProof.resultSha256,
          },
        ]),
  ];
  return sha256Canonical({
    schemaVersion: 1,
    processGeneration: context.processGeneration,
    leaseEpoch: context.leaseEpoch,
    restartGeneration: context.restartGeneration,
    sessionId: context.selectedSession.sessionId,
    testProbeConfigured: context.testProbeConfigured,
    commands,
  });
}

function isPositiveSafeInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

function isMonotonicSelectedBatchVersion(
  context: RawWorkerRestartContext,
  version: VersionRecord
): boolean {
  return (
    sameSelectedVersion(context, version, ['starting', 'running']) &&
    !(context.version?.runningStatus === 'running' && version.runningStatus === 'starting')
  );
}

function isExactIdentityReceipt(
  context: RawWorkerRestartContext,
  event: Extract<RawWorkerRestartEvent, { readonly type: 'IDENTITY_PROBE_RESOLVED' }>
): boolean {
  const expectedCommandId =
    context.resumeCommandId === null ? Number.NaN : context.resumeCommandId + 1;
  return (
    isCurrent(context, event) &&
    event.restartGeneration === context.restartGeneration &&
    context.resumeCommandCount === 1 &&
    context.resumeResolved &&
    context.resumeCommandId !== null &&
    context.resumeParamsSha256 !== null &&
    context.resumeResultSha256 !== null &&
    context.identityCommandId === null &&
    context.identityParamsSha256 === null &&
    context.identityResultSha256 === null &&
    isPositiveSafeInteger(event.commandId) &&
    Number.isSafeInteger(expectedCommandId) &&
    event.commandId === expectedCommandId &&
    event.method === 'Runtime.evaluate' &&
    event.paramsSha256 === expectedIdentityParamsSha256(context) &&
    isCanonicalSha256(event.resultSha256) &&
    event.sessionId === context.selectedSession?.sessionId &&
    event.uniqueContextId === context.uniqueContextId &&
    event.workerUrl === context.version?.scriptURL &&
    event.registrationScope === context.registration?.scopeURL
  );
}

function isExactTestReceipt(
  context: RawWorkerRestartContext,
  event: Extract<RawWorkerRestartEvent, { readonly type: 'TEST_PROBE_RESOLVED' }>
): boolean {
  const expectedCommandId =
    context.identityCommandId === null ? Number.NaN : context.identityCommandId + 1;
  return (
    isCurrent(context, event) &&
    context.testProbeConfigured &&
    context.identityCommandId !== null &&
    context.identityParamsSha256 !== null &&
    context.identityResultSha256 !== null &&
    context.testCommandId === null &&
    context.testParamsSha256 === null &&
    context.testResultSha256 === null &&
    event.restartGeneration === context.restartGeneration &&
    isPositiveSafeInteger(event.commandId) &&
    Number.isSafeInteger(expectedCommandId) &&
    event.commandId === expectedCommandId &&
    event.method === 'Runtime.evaluate' &&
    event.paramsSha256 === expectedTestParamsSha256(context) &&
    isCanonicalSha256(event.resultSha256) &&
    event.sessionId === context.selectedSession?.sessionId &&
    event.uniqueContextId === context.uniqueContextId &&
    (event.diagnosticDisposition === 'clean' ||
      event.diagnosticDisposition === 'application_exception')
  );
}

function isExactResumeReceipt(
  context: RawWorkerRestartContext,
  event: Extract<RawWorkerRestartEvent, { readonly type: 'RESUME_RESOLVED' }>
): boolean {
  return (
    isCurrent(context, event) &&
    event.restartGeneration === context.restartGeneration &&
    context.resumeCommandCount === 1 &&
    !context.resumeResolved &&
    context.resumeCommandId === null &&
    context.resumeParamsSha256 === null &&
    context.resumeResultSha256 === null &&
    isPositiveSafeInteger(event.commandId) &&
    event.method === 'Runtime.runIfWaitingForDebugger' &&
    event.paramsSha256 === sha256Canonical({}) &&
    isCanonicalSha256(event.resultSha256) &&
    event.sessionId === context.selectedSession?.sessionId
  );
}

function isAdmissibleUniqueContextId(value: string): boolean {
  return (
    value.length > 0 &&
    !/[\0\r\n]/u.test(value) &&
    new TextEncoder().encode(value).byteLength <= 512
  );
}

function hashCanonicalStringSet(values: readonly string[]): string {
  const normalized = [...new Set(values)].sort();
  return createHash('sha256').update(JSON.stringify(normalized), 'utf8').digest('hex');
}

function isAdmissibleContextEvent(
  context: RawWorkerRestartContext,
  event: Extract<RawWorkerRestartEvent, { readonly type: 'EXECUTION_CONTEXT_CREATED' }>
): boolean {
  return (
    isCurrent(context, event) &&
    !context.crashObserved &&
    event.sessionId === context.selectedSession?.sessionId &&
    Number.isSafeInteger(event.context.id) &&
    event.context.id >= 0 &&
    isAdmissibleUniqueContextId(event.context.uniqueId) &&
    isSha256(event.eventSha256) &&
    context.preCrashContexts.length < MAX_CONTEXT_AUTHORITIES &&
    !context.preCrashContexts.some(
      (candidate) =>
        candidate.executionContextId === event.context.id ||
        candidate.uniqueContextId === event.context.uniqueId
    ) &&
    !context.revokedUniqueContextIds.includes(event.context.uniqueId)
  );
}

function isSelectedContextClearEvidence(
  context: RawWorkerRestartContext,
  event: Extract<RawWorkerRestartEvent, { readonly type: 'EXECUTION_CONTEXTS_CLEARED' }>
): boolean {
  return (
    isCurrent(context, event) &&
    event.sessionId === context.selectedSession?.sessionId &&
    isSha256(event.eventSha256) &&
    context.retiredContextEvidenceCount < MAX_CONTEXT_AUTHORITIES
  );
}

function isSelectedContextDestroyEvidence(
  context: RawWorkerRestartContext,
  event: Extract<RawWorkerRestartEvent, { readonly type: 'EXECUTION_CONTEXT_DESTROYED' }>
): boolean {
  if (
    !isCurrent(context, event) ||
    event.sessionId !== context.selectedSession?.sessionId ||
    !Number.isSafeInteger(event.executionContextId) ||
    event.executionContextId < 0 ||
    !isAdmissibleUniqueContextId(event.executionContextUniqueId) ||
    !isSha256(event.eventSha256) ||
    context.retiredContextEvidenceCount >= MAX_CONTEXT_AUTHORITIES
  ) {
    return false;
  }

  if (!context.crashObserved) {
    return context.preCrashContexts.some(
      (candidate) =>
        candidate.executionContextId === event.executionContextId &&
        candidate.uniqueContextId === event.executionContextUniqueId &&
        candidate.sessionId === event.sessionId
    );
  }

  const alreadyTombstoned =
    context.revokedUniqueContextIds.includes(event.executionContextUniqueId) ||
    context.postCrashDestroyedUniqueContextIds.includes(event.executionContextUniqueId);
  return (
    alreadyTombstoned ||
    context.revokedUniqueContextIds.length + context.postCrashDestroyedUniqueContextIds.length <
      MAX_CONTEXT_AUTHORITIES
  );
}

function hasAllStopProofs(context: RawWorkerRestartContext): boolean {
  const sessionId = context.selectedSession?.sessionId;
  return (
    context.stopResolved &&
    context.stoppedVersionObserved &&
    context.crashObserved &&
    context.revokedUniqueContextIdsSha256 !== null &&
    context.postCrashDestroyedUniqueContextIdsSha256 !== null &&
    sessionId !== undefined &&
    context.liveSessionIds.includes(sessionId)
  );
}

function hasAllStartProofs(context: RawWorkerRestartContext): boolean {
  return (
    context.startResolved &&
    context.reloadObserved &&
    context.replacementVersionObserved &&
    context.postReloadRuntimeEnabled &&
    context.postReloadContextObserved &&
    context.uniqueContextId !== null
  );
}

function hasAllBootstrapProofs(context: RawWorkerRestartContext): boolean {
  const testProofMatchesConfiguration = context.testProbeConfigured
    ? context.testProbeCompleted &&
      context.testCommandId !== null &&
      context.testParamsSha256 !== null &&
      context.testResultSha256 !== null &&
      context.identityCommandId !== null &&
      context.testCommandId === context.identityCommandId + 1
    : !context.testProbeCompleted &&
      context.testCommandId === null &&
      context.testParamsSha256 === null &&
      context.testResultSha256 === null;
  return (
    context.resumeCommandCount === 1 &&
    context.resumeResolved &&
    context.resumeCommandId !== null &&
    context.resumeParamsSha256 !== null &&
    context.resumeResultSha256 !== null &&
    context.identityProbePassed &&
    context.identityCommandId !== null &&
    context.identityParamsSha256 !== null &&
    context.identityResultSha256 !== null &&
    context.identityCommandId === context.resumeCommandId + 1 &&
    testProofMatchesConfiguration &&
    context.bootstrapCommandBatchSha256 !== null &&
    context.version?.runningStatus === 'running' &&
    context.selectedSession !== null &&
    context.liveSessionIds.includes(context.selectedSession.sessionId)
  );
}

function hasAllPausedMembersResumed(context: RawWorkerRestartContext): boolean {
  return context.inventorySessions
    .filter(
      (session) => context.liveSessionIds.includes(session.sessionId) && session.waitingForDebugger
    )
    .every((session) => context.resumedSessionIds.includes(session.sessionId));
}

function isExactDetachEvent(
  context: RawWorkerRestartContext,
  event: RawWorkerRestartEvent
): boolean {
  if (event.type !== 'TARGET_DETACHED' || !isCurrent(context, event)) {
    return false;
  }
  const preimage = event.eventPreimage as unknown;
  if (typeof preimage !== 'object' || preimage === null || Array.isArray(preimage)) {
    return false;
  }
  const record = preimage as Readonly<Record<string, unknown>>;
  return (
    Object.keys(record).length === 2 &&
    typeof record.targetId === 'string' &&
    typeof record.sessionId === 'string' &&
    record.targetId === event.targetId &&
    record.sessionId === event.sessionId &&
    event.eventSha256 === sha256Canonical(record)
  );
}

function hasExactReleaseAttachFence(
  context: RawWorkerRestartContext,
  targets: readonly TargetRecord[]
): boolean {
  const live = context.inventorySessions.filter((session) =>
    context.liveSessionIds.includes(session.sessionId)
  );
  if (live.some((session) => session.attachmentOrigin === 'auto')) {
    return false;
  }

  const expectedTargetIds = [
    ...new Set(
      live
        .filter((session) => session.attachmentOrigin === 'manual')
        .map((session) => session.targetId)
    ),
  ].sort();
  const observedTargetIds = targets
    .filter(
      (target) =>
        target.attached &&
        target.type === 'service_worker' &&
        target.url.endsWith(context.expectedWorkerPath)
    )
    .map((target) => target.targetId)
    .sort();

  return (
    targets.every(
      (target) =>
        target.type === 'service_worker' && target.url.endsWith(context.expectedWorkerPath)
    ) &&
    expectedTargetIds.length === observedTargetIds.length &&
    expectedTargetIds.every((targetId, index) => observedTargetIds[index] === targetId)
  );
}

function hasAllManualDetachProofs(context: RawWorkerRestartContext): boolean {
  return (
    context.releaseManualSessionIds.every(
      (sessionId) =>
        context.manualDetachReplySessionIds.includes(sessionId) &&
        context.manualDetachEventSessionIds.includes(sessionId)
    ) &&
    context.releaseManualSessionIds.every(
      (sessionId) => !context.liveSessionIds.includes(sessionId)
    )
  );
}

function hasObservers(context: RawWorkerRestartContext, sessionId: string): boolean {
  return (
    context.inspectorEnabledSessionIds.includes(sessionId) &&
    context.runtimeEnabledSessionIds.includes(sessionId)
  );
}

function hasExactConvergence(context: RawWorkerRestartContext): boolean {
  const registration = context.registration;
  const version = context.version;
  if (
    !context.convergenceFenceSeen ||
    registration === null ||
    registration.isDeleted ||
    version === null ||
    version.status !== 'activated' ||
    version.registrationId !== registration.registrationId ||
    !version.scriptURL.startsWith(registration.scopeURL) ||
    !version.scriptURL.endsWith(context.expectedWorkerPath)
  ) {
    return false;
  }
  if (version.runningStatus === 'stopped') {
    return true;
  }
  return (
    (version.runningStatus === 'starting' || version.runningStatus === 'running') &&
    context.targetId !== null
  );
}

function isRunningObserved(context: RawWorkerRestartContext): boolean {
  const session = context.selectedSession;
  return (
    context.version?.runningStatus === 'running' &&
    session !== null &&
    !session.waitingForDebugger &&
    hasObservers(context, session.sessionId)
  );
}

function isPausedStartingOrRunning(context: RawWorkerRestartContext): boolean {
  const session = context.selectedSession;
  const runningStatus = context.version?.runningStatus;
  return (
    (runningStatus === 'starting' || runningStatus === 'running') &&
    session !== null &&
    session.waitingForDebugger &&
    hasObservers(context, session.sessionId)
  );
}

function isStartingOrRunningWithoutSession(context: RawWorkerRestartContext): boolean {
  const runningStatus = context.version?.runningStatus;
  return (
    (runningStatus === 'starting' || runningStatus === 'running') &&
    context.targetId !== null &&
    context.selectedSession === null
  );
}

const rawSetup = setup({
  types: {
    context: {} as RawWorkerRestartContext,
    events: {} as RawWorkerRestartEvent,
    input: {} as RawWorkerRestartInput,
  },
  guards: {
    current: ({ context, event }) => isCurrent(context, event),
    admissiblePreCrashContext: ({ context, event }) =>
      event.type === 'EXECUTION_CONTEXT_CREATED' && isAdmissibleContextEvent(context, event),
    selectedContextDestroyEvidence: ({ context, event }) =>
      event.type === 'EXECUTION_CONTEXT_DESTROYED' &&
      isSelectedContextDestroyEvidence(context, event),
    selectedContextClearEvidence: ({ context, event }) =>
      event.type === 'EXECUTION_CONTEXTS_CLEARED' && isSelectedContextClearEvidence(context, event),
    exactFirstCrash: ({ context, event }) =>
      event.type === 'INSPECTOR_TARGET_CRASHED' &&
      isCurrent(context, event) &&
      !context.crashObserved &&
      selectedIdentityMatches(context, event.targetId, event.sessionId) &&
      isSha256(event.eventSha256),
    monotonicSelectedBatchVersion: ({ context, event }) =>
      event.type === 'VERSION_UPDATED' &&
      isCurrent(context, event) &&
      isMonotonicSelectedBatchVersion(context, event.version),
    exactIdentityReceipt: ({ context, event }) =>
      event.type === 'IDENTITY_PROBE_RESOLVED' && isExactIdentityReceipt(context, event),
    exactTestReceipt: ({ context, event }) =>
      event.type === 'TEST_PROBE_RESOLVED' && isExactTestReceipt(context, event),
    exactResumeReceipt: ({ context, event }) =>
      event.type === 'RESUME_RESOLVED' && isExactResumeReceipt(context, event),
  },
  actions: {
    rememberSentinel: assign(({ event }) =>
      event.type === 'INITIAL_SENTINEL_FENCE_RESOLVED' && event.sentinels.length === 1
        ? { sentinelTargetId: event.sentinels[0]!.targetId }
        : {}
    ),
    rememberRegistration: assign(({ event }) =>
      event.type === 'REGISTRATION_UPDATED' ? { registration: event.registration } : {}
    ),
    rememberVersion: assign(({ event }) => {
      if (event.type !== 'VERSION_UPDATED') {
        return {};
      }
      return {
        version: event.version,
        ...(event.version.targetId === undefined ? {} : { targetId: event.version.targetId }),
      };
    }),
    rememberInspector: assign(({ context, event }) =>
      event.type === 'INSPECTOR_ENABLED'
        ? {
            inspectorEnabledSessionIds: appendUnique(
              context.inspectorEnabledSessionIds,
              event.sessionId
            ),
          }
        : {}
    ),
    rememberRuntime: assign(({ context, event }) =>
      event.type === 'RUNTIME_ENABLED'
        ? {
            runtimeEnabledSessionIds: appendUnique(
              context.runtimeEnabledSessionIds,
              event.sessionId
            ),
          }
        : {}
    ),
    rememberSelectedAttachment: assign(({ context, event }) => {
      if (event.type !== 'TARGET_ATTACHED') {
        return {};
      }
      const session: SessionRecord = {
        sessionId: event.sessionId,
        targetId: event.targetId,
        waitingForDebugger: event.waitingForDebugger,
        attachmentOrigin: event.attachmentOrigin,
      };
      return {
        targetId: event.targetId,
        selectedSession: session,
        knownSessionIds: appendUnique(context.knownSessionIds, event.sessionId),
        inventorySessions: upsertInventorySession(context.inventorySessions, session),
        liveSessionIds: appendUnique(context.liveSessionIds, event.sessionId),
      };
    }),
    rememberControlSession: assign(({ event }) =>
      event.type === 'CONTROL_ATTACH_RESOLVED'
        ? { controlTargetId: event.targetId, controlSessionId: event.sessionId }
        : {}
    ),
    rememberPreCrashContext: assign(({ context, event }) => {
      if (event.type !== 'EXECUTION_CONTEXT_CREATED') {
        return {};
      }
      const authority: ContextAuthorityRecord = {
        executionContextId: event.context.id,
        uniqueContextId: event.context.uniqueId,
        generation: context.contextGeneration,
        sessionId: event.sessionId,
        originMatchesScriptURL: event.context.origin === context.version?.scriptURL,
        eventSha256: event.eventSha256,
      };
      return {
        preCrashContexts: [...context.preCrashContexts, authority],
        activeContexts: [...context.activeContexts, authority],
      };
    }),
    rememberContextDestroy: assign(({ context, event }) => {
      if (event.type !== 'EXECUTION_CONTEXT_DESTROYED') {
        return {};
      }
      if (!context.crashObserved) {
        return {
          activeContexts: context.activeContexts.filter(
            (candidate) =>
              candidate.executionContextId !== event.executionContextId ||
              candidate.uniqueContextId !== event.executionContextUniqueId
          ),
          retiredContextEvidenceCount: context.retiredContextEvidenceCount + 1,
        };
      }

      const postCrashDestroyedUniqueContextIds = context.revokedUniqueContextIds.includes(
        event.executionContextUniqueId
      )
        ? context.postCrashDestroyedUniqueContextIds
        : appendUnique(context.postCrashDestroyedUniqueContextIds, event.executionContextUniqueId);
      return {
        postCrashDestroyedUniqueContextIds,
        postCrashDestroyedUniqueContextIdsSha256: hashCanonicalStringSet(
          postCrashDestroyedUniqueContextIds
        ),
        retiredContextEvidenceCount: context.retiredContextEvidenceCount + 1,
      };
    }),
    rememberContextClear: assign(({ context }) => ({
      activeContexts: context.crashObserved ? context.activeContexts : [],
      retiredContextEvidenceCount: context.retiredContextEvidenceCount + 1,
    })),
    atomicallyRevokePreCrashGeneration: assign(({ context, event }) =>
      event.type === 'INSPECTOR_TARGET_CRASHED'
        ? (() => {
            const revokedUniqueContextIds = context.preCrashContexts.reduce<readonly string[]>(
              (ids, authority) => appendUnique(ids, authority.uniqueContextId),
              context.revokedUniqueContextIds
            );
            return {
              crashObserved: true,
              crashEventSha256: event.eventSha256,
              contextGeneration: context.contextGeneration + 1,
              activeContexts: [],
              revokedUniqueContextIds,
              revokedUniqueContextIdsSha256: hashCanonicalStringSet(revokedUniqueContextIds),
              postCrashDestroyedUniqueContextIds: [],
              postCrashDestroyedUniqueContextIdsSha256: hashCanonicalStringSet([]),
            };
          })()
        : {}
    ),
    rememberReplacementContext: assign(({ context, event }) => {
      if (event.type !== 'EXECUTION_CONTEXT_CREATED') {
        return {};
      }
      const authority: ContextAuthorityRecord = {
        executionContextId: event.context.id,
        uniqueContextId: event.context.uniqueId,
        generation: context.contextGeneration,
        sessionId: event.sessionId,
        originMatchesScriptURL: true,
        eventSha256: event.eventSha256,
      };
      return {
        postReloadContextObserved: true,
        uniqueContextId: event.context.uniqueId,
        activeContexts: [authority],
      };
    }),
    issueControlledStop: assign(({ context }) => ({
      stopCommandCount: context.stopCommandCount + 1,
      stopResolved: false,
      stoppedVersionObserved: false,
      crashObserved: false,
      crashEventSha256: null,
    })),
    beginReplacement: assign(({ context }) => {
      const selected = context.selectedSession;
      return {
        restartGeneration: context.restartGeneration + 1,
        startCommandCount: context.startCommandCount + 1,
        startResolved: false,
        reloadObserved: false,
        replacementVersionObserved: false,
        postReloadRuntimeEnabled: false,
        postReloadContextObserved: false,
        uniqueContextId: null,
        identityProbePassed: false,
        identityCommandId: null,
        identityParamsSha256: null,
        identityResultSha256: null,
        testProbeCompleted: false,
        testCommandId: null,
        testParamsSha256: null,
        testResultSha256: null,
        resumeResolved: false,
        resumeCommandId: null,
        resumeParamsSha256: null,
        resumeResultSha256: null,
        bootstrapCommandBatchSha256: null,
        ...(selected === null
          ? {}
          : {
              selectedSession: { ...selected, waitingForDebugger: true },
              inventorySessions: updateInventoryWaiting(
                context.inventorySessions,
                selected.sessionId,
                true
              ),
              resumedSessionIds: removeValue(context.resumedSessionIds, selected.sessionId),
            }),
      };
    }),
    issueBootstrapBatch: assign(({ context }) => ({
      resumeCommandCount: context.resumeCommandCount + 1,
      identityProbePassed: false,
      identityCommandId: null,
      identityParamsSha256: null,
      identityResultSha256: null,
      testProbeCompleted: false,
      testCommandId: null,
      testParamsSha256: null,
      testResultSha256: null,
      resumeResolved: false,
      resumeCommandId: null,
      resumeParamsSha256: null,
      resumeResultSha256: null,
      bootstrapCommandBatchSha256: null,
    })),
    rememberIdentityReceipt: assign(({ context, event }) => {
      if (event.type !== 'IDENTITY_PROBE_RESOLVED') {
        return {};
      }
      const proof = {
        identityProbePassed: true,
        identityCommandId: event.commandId,
        identityParamsSha256: event.paramsSha256,
        identityResultSha256: event.resultSha256,
      } as const;
      return {
        ...proof,
        bootstrapCommandBatchSha256: context.testProbeConfigured
          ? null
          : bootstrapCommandBatchSha256({ ...context, ...proof }, null),
      };
    }),
    rememberTestReceipt: assign(({ context, event }) => {
      if (event.type !== 'TEST_PROBE_RESOLVED') {
        return {};
      }
      const testProof = {
        commandId: event.commandId,
        paramsSha256: event.paramsSha256,
        resultSha256: event.resultSha256,
      } as const;
      return {
        testProbeCompleted: true,
        testCommandId: event.commandId,
        testParamsSha256: event.paramsSha256,
        testResultSha256: event.resultSha256,
        bootstrapCommandBatchSha256: bootstrapCommandBatchSha256(context, testProof),
      };
    }),
    rememberBatchVersion: assign(({ context, event }) => {
      if (event.type !== 'VERSION_UPDATED' || sameVersionRecord(context.version, event.version)) {
        return {};
      }
      return {
        version: event.version,
        ...(event.version.targetId === undefined ? {} : { targetId: event.version.targetId }),
      };
    }),
    rememberReplacementResume: assign(({ context, event }) => {
      if (event.type !== 'RESUME_RESOLVED' || context.selectedSession === null) {
        return {};
      }
      return {
        resumeResolved: true,
        resumeCommandId: event.commandId,
        resumeParamsSha256: event.paramsSha256,
        resumeResultSha256: event.resultSha256,
        selectedSession: { ...context.selectedSession, waitingForDebugger: false },
        inventorySessions: updateInventoryWaiting(
          context.inventorySessions,
          event.sessionId,
          false
        ),
        resumedSessionIds: appendUnique(context.resumedSessionIds, event.sessionId),
      };
    }),
    rememberConvergenceResume: assign(({ context, event }) => {
      if (event.type !== 'CONVERGENCE_RESUME_RESOLVED' || context.selectedSession === null) {
        return {};
      }
      return {
        selectedSession: { ...context.selectedSession, waitingForDebugger: false },
        inventorySessions: updateInventoryWaiting(
          context.inventorySessions,
          event.sessionId,
          false
        ),
        resumedSessionIds: appendUnique(context.resumedSessionIds, event.sessionId),
      };
    }),
    rememberReleaseAttachment: assign(({ context, event }) => {
      if (event.type !== 'TARGET_ATTACHED') {
        return {};
      }
      const session: SessionRecord = {
        sessionId: event.sessionId,
        targetId: event.targetId,
        waitingForDebugger: event.waitingForDebugger,
        attachmentOrigin: event.attachmentOrigin,
      };
      return {
        inventorySessions: upsertInventorySession(context.inventorySessions, session),
        liveSessionIds: appendUnique(context.liveSessionIds, event.sessionId),
        knownSessionIds: appendUnique(context.knownSessionIds, event.sessionId),
      };
    }),
    rememberInventoryDetach: assign(({ context, event }) =>
      event.type === 'TARGET_DETACHED'
        ? { liveSessionIds: removeValue(context.liveSessionIds, event.sessionId) }
        : {}
    ),
    rememberReleaseResume: assign(({ context, event }) =>
      event.type === 'RELEASE_RESUME_RESOLVED'
        ? {
            resumedSessionIds: appendUnique(context.resumedSessionIds, event.sessionId),
            inventorySessions: updateInventoryWaiting(
              context.inventorySessions,
              event.sessionId,
              false
            ),
          }
        : {}
    ),
  },
});

const authorityEvents = {
  REGISTRATION_UPDATED: {
    guard: 'current' as const,
    actions: 'rememberRegistration' as const,
  },
  VERSION_UPDATED: {
    guard: 'current' as const,
    actions: 'rememberVersion' as const,
  },
  INSPECTOR_ENABLED: {
    guard: 'current' as const,
    actions: 'rememberInspector' as const,
  },
  RUNTIME_ENABLED: {
    guard: 'current' as const,
    actions: 'rememberRuntime' as const,
  },
} as const;

const preCrashContextEvents = {
  EXECUTION_CONTEXT_CREATED: [
    {
      guard: 'admissiblePreCrashContext' as const,
      actions: 'rememberPreCrashContext' as const,
    },
    { target: 'failed_releasing' },
  ],
  EXECUTION_CONTEXT_DESTROYED: [
    {
      guard: 'selectedContextDestroyEvidence' as const,
      actions: 'rememberContextDestroy' as const,
    },
    { target: 'failed_releasing' },
  ],
  EXECUTION_CONTEXTS_CLEARED: [
    {
      guard: 'selectedContextClearEvidence' as const,
      actions: 'rememberContextClear' as const,
    },
    { target: 'failed_releasing' },
  ],
} as const;

export const rawWorkerRestartMachine = rawSetup.createMachine({
  id: 'rawWorkerRestart',
  initial: 'sentinel_fencing',
  context: ({ input }) => ({
    ...input,
    testProbeConfigured: input.testProbeExpression !== null,
    sentinelTargetId: null,
    registration: null,
    version: null,
    targetId: null,
    convergenceFenceSeen: false,
    selectedSession: null,
    inspectorEnabledSessionIds: [],
    runtimeEnabledSessionIds: [],
    warmupStarted: false,
    warmupStartCount: 0,
    warmupStartResolved: false,
    warmupResumeResolved: false,
    provisionalSessionId: null,
    knownSessionIds: [],
    controlTargetId: null,
    controlSessionId: null,
    stopCommandCount: 0,
    stopResolved: false,
    stoppedVersionObserved: false,
    crashObserved: false,
    crashEventSha256: null,
    contextGeneration: 0,
    preCrashContexts: [],
    activeContexts: [],
    revokedUniqueContextIds: [],
    revokedUniqueContextIdsSha256: null,
    postCrashDestroyedUniqueContextIds: [],
    postCrashDestroyedUniqueContextIdsSha256: null,
    retiredContextEvidenceCount: 0,
    startCommandCount: 0,
    startResolved: false,
    reloadObserved: false,
    replacementVersionObserved: false,
    postReloadRuntimeEnabled: false,
    postReloadContextObserved: false,
    uniqueContextId: null,
    identityProbePassed: false,
    identityCommandId: null,
    identityParamsSha256: null,
    identityResultSha256: null,
    testProbeCompleted: false,
    testCommandId: null,
    testParamsSha256: null,
    testResultSha256: null,
    resumeCommandCount: 0,
    resumeResolved: false,
    resumeCommandId: null,
    resumeParamsSha256: null,
    resumeResultSha256: null,
    bootstrapCommandBatchSha256: null,
    failureObserved: false,
    failureReleaseStarted: false,
    inventorySessions: [],
    liveSessionIds: [],
    resumedSessionIds: [],
    releaseFenceClosed: false,
    releaseManualSessionIds: [],
    manualDetachReplySessionIds: [],
    manualDetachEventSessionIds: [],
    manualDetachCommandCount: 0,
    releaseProofs: {
      autoAttachDisarmed: false,
      attachFence: false,
      manualDetachReplies: 0,
      manualDetachEvents: 0,
      zeroAttachedFence: false,
      serviceWorkerDisabled: false,
      controlDetachReply: false,
      controlDetachEvent: false,
      sentinelFence: false,
      discoveryDisabled: false,
      socketClosed: false,
    },
  }),
  on: {
    INITIAL_SENTINEL_FENCE_RESOLVED: {
      guard: ({ context, event }) => isCurrent(context, event),
      target: '.failed_releasing',
    },
    PREARM_ATTACH_FENCE_RESOLVED: {
      guard: ({ context, event }) => isCurrent(context, event),
      target: '.failed_releasing',
    },
    DISCOVERY_ACKED: {
      guard: ({ context, event }) => isCurrent(context, event),
      target: '.failed_releasing',
    },
    AUTO_ATTACH_ACKED: {
      guard: ({ context, event }) => isCurrent(context, event),
      target: '.failed_releasing',
    },
    CONTROL_ATTACH_RESOLVED: {
      guard: ({ context, event }) => isCurrent(context, event),
      target: '.failed_releasing',
    },
    SERVICE_WORKER_ENABLED: {
      guard: ({ context, event }) => isCurrent(context, event),
      target: '.failed_releasing',
    },
    EXECUTION_CONTEXT_CREATED: '.failed_releasing',
    EXECUTION_CONTEXT_DESTROYED: '.failed_releasing',
    EXECUTION_CONTEXTS_CLEARED: '.failed_releasing',
    RESUME_RESOLVED: '.failed_releasing',
    IDENTITY_PROBE_RESOLVED: '.failed_releasing',
    TEST_PROBE_RESOLVED: '.failed_releasing',
    OPERATION_TIMED_OUT: '.failed_releasing',
    OBSERVER_PROTOCOL_FAILED: '.failed_releasing',
  },
  states: {
    sentinel_fencing: {
      on: {
        INITIAL_SENTINEL_FENCE_RESOLVED: [
          {
            guard: ({ context, event }) =>
              isCurrent(context, event) &&
              event.sentinels.length === 1 &&
              event.sentinels[0]?.targetId.length > 0 &&
              event.sentinels[0]?.url === 'about:blank' &&
              event.sentinels[0]?.attached === false,
            target: 'prearm_attach_fencing',
            actions: 'rememberSentinel',
          },
          { target: 'failed_releasing' },
        ],
      },
    },
    prearm_attach_fencing: {
      on: {
        PREARM_ATTACH_FENCE_RESOLVED: [
          {
            guard: ({ context, event }) =>
              isCurrent(context, event) && event.attachedWorkers.length === 0,
            target: 'discovery_enabling',
          },
          { target: 'failed_releasing' },
        ],
      },
    },
    discovery_enabling: {
      on: {
        DISCOVERY_ACKED: {
          guard: ({ context, event }) => isCurrent(context, event),
          target: 'auto_attach_arming',
        },
      },
    },
    auto_attach_arming: {
      on: {
        TARGET_ATTACHED: {
          guard: ({ context, event }) =>
            isCurrent(context, event) &&
            event.targetType === 'service_worker' &&
            event.url.endsWith(context.expectedWorkerPath),
          actions: 'rememberSelectedAttachment',
        },
        AUTO_ATTACH_ACKED: {
          guard: ({ context, event }) => isCurrent(context, event),
          target: 'control_attaching',
        },
      },
    },
    control_attaching: {
      on: {
        TARGET_ATTACHED: [
          {
            guard: ({ context, event }) =>
              isCurrent(context, event) &&
              event.targetType === 'service_worker' &&
              event.url.endsWith(context.expectedWorkerPath) &&
              (context.selectedSession === null ||
                context.selectedSession.sessionId === event.sessionId),
            actions: 'rememberSelectedAttachment',
          },
          { target: 'failed_releasing' },
        ],
        CONTROL_ATTACH_RESOLVED: {
          guard: ({ context, event }) =>
            isCurrent(context, event) && event.targetId === context.sentinelTargetId,
          target: 'service_worker_enabling',
          actions: 'rememberControlSession',
        },
      },
    },
    service_worker_enabling: {
      on: {
        ...authorityEvents,
        TARGET_ATTACHED: {
          guard: ({ context, event }) =>
            isCurrent(context, event) &&
            event.targetType === 'service_worker' &&
            event.url.endsWith(context.expectedWorkerPath) &&
            (context.selectedSession === null ||
              context.selectedSession.sessionId === event.sessionId),
          actions: 'rememberSelectedAttachment',
        },
        SERVICE_WORKER_ENABLED: {
          guard: ({ context, event }) =>
            isCurrent(context, event) && event.sessionId === context.controlSessionId,
          target: 'converging',
        },
      },
    },
    converging: {
      on: {
        ...authorityEvents,
        ...preCrashContextEvents,
        CONVERGENCE_RESUME_RESOLVED: {
          guard: ({ context, event }) =>
            isCurrent(context, event) && event.sessionId === context.selectedSession?.sessionId,
          actions: 'rememberConvergenceResume',
        },
        TARGET_ATTACHED: [
          {
            guard: ({ context, event }) =>
              isCurrent(context, event) &&
              event.targetType === 'service_worker' &&
              event.url.endsWith(context.expectedWorkerPath) &&
              (context.selectedSession === null ||
                context.selectedSession.sessionId === event.sessionId),
            actions: 'rememberSelectedAttachment',
          },
          { target: 'failed_releasing' },
        ],
        CONVERGENCE_FENCE_RESOLVED: {
          guard: ({ context, event }) => isCurrent(context, event),
          actions: assign(({ context, event }) => {
            if (event.type !== 'CONVERGENCE_FENCE_RESOLVED') {
              return {};
            }
            const target = event.targets.find(
              (candidate) =>
                candidate.type === 'service_worker' &&
                candidate.url.endsWith(context.expectedWorkerPath)
            );
            return {
              convergenceFenceSeen: true,
              ...(target === undefined ? {} : { targetId: target.targetId }),
            };
          }),
        },
      },
      always: {
        guard: ({ context }) => hasExactConvergence(context),
        target: 'warm_authority_acquiring',
      },
    },
    warm_authority_acquiring: {
      on: {
        ...authorityEvents,
        ...preCrashContextEvents,
        TARGET_ATTACHED: [
          {
            guard: ({ context, event }) =>
              isCurrent(context, event) && context.selectedSession === null,
            actions: 'rememberSelectedAttachment',
          },
          { target: 'failed_releasing' },
        ],
      },
      always: [
        { guard: ({ context }) => isRunningObserved(context), target: 'warm_authority_ready' },
        {
          guard: ({ context }) => isPausedStartingOrRunning(context),
          target: 'warm_existing_resuming',
        },
        {
          guard: ({ context }) => isStartingOrRunningWithoutSession(context),
          target: 'warmup_target_fencing',
        },
        {
          guard: ({ context }) => context.version?.runningStatus === 'stopped',
          target: 'warmup_starting',
        },
      ],
    },
    warm_existing_resuming: {
      on: {
        ...authorityEvents,
        ...preCrashContextEvents,
        WARMUP_RESUME_RESOLVED: {
          guard: ({ context, event }) =>
            isCurrent(context, event) && event.sessionId === context.selectedSession?.sessionId,
          actions: assign({ warmupResumeResolved: true }),
        },
      },
      always: {
        guard: ({ context }) =>
          context.warmupResumeResolved &&
          context.version?.runningStatus === 'running' &&
          context.selectedSession !== null &&
          hasObservers(context, context.selectedSession.sessionId),
        target: 'warm_authority_ready',
        actions: assign(({ context }) =>
          context.selectedSession === null
            ? {}
            : {
                selectedSession: {
                  ...context.selectedSession,
                  waitingForDebugger: false,
                },
              }
        ),
      },
    },
    warmup_starting: {
      entry: assign(({ context }) => ({
        warmupStarted: true,
        warmupStartCount: context.warmupStartCount + 1,
      })),
      on: {
        ...authorityEvents,
        ...preCrashContextEvents,
        WARMUP_START_RESOLVED: {
          guard: ({ context, event }) => isCurrent(context, event),
          actions: assign({ warmupStartResolved: true }),
        },
        TARGET_ATTACHED: {
          guard: ({ context, event }) => isCurrent(context, event),
          actions: 'rememberSelectedAttachment',
        },
      },
      always: {
        guard: ({ context }) =>
          context.warmupStartResolved &&
          (context.version?.runningStatus === 'starting' ||
            context.version?.runningStatus === 'running') &&
          context.targetId !== null,
        target: 'warmup_target_fencing',
      },
    },
    warmup_target_fencing: {
      on: {
        ...preCrashContextEvents,
        TARGET_ATTACHED: [
          {
            guard: ({ context, event }) =>
              isCurrent(context, event) && context.selectedSession === null,
            actions: 'rememberSelectedAttachment',
          },
          { target: 'failed_releasing' },
        ],
        VERSION_UPDATED: authorityEvents.VERSION_UPDATED,
        WARMUP_TARGET_FENCE_RESOLVED: [
          {
            guard: ({ context, event }) =>
              isCurrent(context, event) && context.selectedSession !== null,
            target: 'warmup_observing',
          },
          {
            guard: ({ context, event }) =>
              isCurrent(context, event) && context.selectedSession === null,
            target: 'warmup_manual_attaching',
          },
        ],
      },
    },
    warmup_manual_attaching: {
      on: {
        ...preCrashContextEvents,
        TARGET_ATTACHED: [
          {
            guard: ({ context, event }) =>
              isCurrent(context, event) && context.provisionalSessionId === null,
            actions: assign(({ context, event }) =>
              event.type === 'TARGET_ATTACHED'
                ? {
                    targetId: event.targetId,
                    provisionalSessionId: event.sessionId,
                    knownSessionIds: appendUnique(context.knownSessionIds, event.sessionId),
                  }
                : {}
            ),
          },
          {
            guard: ({ context, event }) =>
              isCurrent(context, event) && context.provisionalSessionId === event.sessionId,
          },
          {
            target: 'failed_releasing',
            actions: assign(({ context, event }) =>
              event.type === 'TARGET_ATTACHED'
                ? {
                    knownSessionIds: appendUnique(context.knownSessionIds, event.sessionId),
                  }
                : {}
            ),
          },
        ],
        WARMUP_ATTACH_RESOLVED: [
          {
            guard: ({ context, event }) =>
              isCurrent(context, event) &&
              (context.provisionalSessionId === null ||
                context.provisionalSessionId === event.sessionId) &&
              context.targetId !== null,
            target: 'warmup_observing',
            actions: assign(({ context, event }) =>
              event.type === 'WARMUP_ATTACH_RESOLVED' && context.targetId !== null
                ? (() => {
                    const session: SessionRecord = {
                      sessionId: event.sessionId,
                      targetId: context.targetId,
                      waitingForDebugger: true,
                      attachmentOrigin: 'manual',
                    };
                    return {
                      provisionalSessionId: null,
                      selectedSession: session,
                      knownSessionIds: appendUnique(context.knownSessionIds, event.sessionId),
                      inventorySessions: upsertInventorySession(context.inventorySessions, session),
                      liveSessionIds: appendUnique(context.liveSessionIds, event.sessionId),
                    };
                  })()
                : {}
            ),
          },
          { target: 'failed_releasing' },
        ],
      },
    },
    warmup_observing: {
      on: {
        ...authorityEvents,
        ...preCrashContextEvents,
        TARGET_ATTACHED: [
          {
            guard: ({ context, event }) =>
              isCurrent(context, event) && context.selectedSession?.sessionId === event.sessionId,
            actions: 'rememberSelectedAttachment',
          },
          { target: 'failed_releasing' },
        ],
      },
      always: [
        {
          guard: ({ context }) =>
            isRunningObserved(context) && (!context.warmupStarted || context.warmupStartResolved),
          target: 'warm_authority_ready',
        },
        {
          guard: ({ context }) =>
            isPausedStartingOrRunning(context) &&
            (!context.warmupStarted || context.warmupStartResolved),
          target: 'warmup_resuming',
        },
      ],
    },
    warmup_resuming: {
      on: {
        ...authorityEvents,
        ...preCrashContextEvents,
        WARMUP_RESUME_RESOLVED: {
          guard: ({ context, event }) =>
            isCurrent(context, event) && event.sessionId === context.selectedSession?.sessionId,
          actions: assign({ warmupResumeResolved: true }),
        },
      },
      always: {
        guard: ({ context }) =>
          context.warmupResumeResolved &&
          context.version?.runningStatus === 'running' &&
          context.selectedSession !== null &&
          hasObservers(context, context.selectedSession.sessionId) &&
          (!context.warmupStarted || context.warmupStartResolved),
        target: 'warm_authority_ready',
      },
    },
    warm_authority_ready: {
      entry: 'issueControlledStop',
      on: {
        ...preCrashContextEvents,
        STOP_RESOLVED: [
          {
            guard: ({ context, event }) => isCurrent(context, event) && !context.stopResolved,
            target: 'controlled_stop',
            actions: assign({ stopResolved: true }),
          },
          { target: 'failed_releasing' },
        ],
        VERSION_UPDATED: [
          {
            guard: ({ context, event }) =>
              isCurrent(context, event) &&
              !context.stoppedVersionObserved &&
              sameSelectedVersion(context, event.version, ['stopped']),
            target: 'controlled_stop',
            actions: ['rememberVersion', assign({ stoppedVersionObserved: true })],
          },
          {
            guard: ({ context, event }) =>
              isCurrent(context, event) &&
              sameSelectedVersion(context, event.version, ['stopping']),
            target: 'controlled_stop',
            actions: 'rememberVersion',
          },
          {
            guard: ({ context, event }) =>
              isCurrent(context, event) &&
              sameSelectedVersion(context, event.version, ['starting', 'running']),
            actions: 'rememberVersion',
          },
          { target: 'failed_releasing' },
        ],
        INSPECTOR_TARGET_CRASHED: [
          {
            guard: 'exactFirstCrash',
            target: 'controlled_stop',
            actions: 'atomicallyRevokePreCrashGeneration',
          },
          { target: 'failed_releasing' },
        ],
        TARGET_ATTACHED: 'failed_releasing',
        TARGET_DETACHED: 'failed_releasing',
        TARGET_DESTROYED: 'failed_releasing',
      },
    },
    controlled_stop: {
      on: {
        ...preCrashContextEvents,
        STOP_RESOLVED: [
          {
            guard: ({ context, event }) => isCurrent(context, event) && !context.stopResolved,
            actions: assign({ stopResolved: true }),
          },
          { target: 'failed_releasing' },
        ],
        VERSION_UPDATED: [
          {
            guard: ({ context, event }) =>
              isCurrent(context, event) &&
              !context.stoppedVersionObserved &&
              sameSelectedVersion(context, event.version, ['stopped']),
            actions: ['rememberVersion', assign({ stoppedVersionObserved: true })],
          },
          {
            guard: ({ context, event }) =>
              isCurrent(context, event) &&
              sameSelectedVersion(context, event.version, ['stopping']),
            actions: 'rememberVersion',
          },
          { target: 'failed_releasing' },
        ],
        INSPECTOR_TARGET_CRASHED: [
          {
            guard: 'exactFirstCrash',
            actions: 'atomicallyRevokePreCrashGeneration',
          },
          { target: 'failed_releasing' },
        ],
        TARGET_ATTACHED: 'failed_releasing',
        TARGET_DETACHED: 'failed_releasing',
        TARGET_DESTROYED: 'failed_releasing',
      },
      always: {
        guard: ({ context }) => hasAllStopProofs(context),
        target: 'replacement_starting',
      },
    },
    replacement_starting: {
      entry: 'beginReplacement',
      on: {
        START_RESOLVED: [
          {
            guard: ({ context, event }) => isCurrent(context, event) && !context.startResolved,
            actions: assign({ startResolved: true }),
          },
          { target: 'failed_releasing' },
        ],
        INSPECTOR_TARGET_RELOADED: [
          {
            guard: ({ context, event }) =>
              isCurrent(context, event) &&
              !context.reloadObserved &&
              selectedIdentityMatches(context, event.targetId, event.sessionId) &&
              isSha256(event.eventSha256),
            actions: assign({ reloadObserved: true }),
          },
          { target: 'failed_releasing' },
        ],
        VERSION_UPDATED: [
          {
            guard: ({ context, event }) =>
              isCurrent(context, event) &&
              !context.replacementVersionObserved &&
              context.version?.runningStatus === 'stopped' &&
              sameSelectedVersion(context, event.version, ['stopped']),
          },
          {
            guard: ({ context, event }) =>
              isCurrent(context, event) &&
              !context.replacementVersionObserved &&
              sameSelectedVersion(context, event.version, ['starting', 'running']),
            actions: ['rememberVersion', assign({ replacementVersionObserved: true })],
          },
          {
            guard: ({ context, event }) =>
              isCurrent(context, event) &&
              context.replacementVersionObserved &&
              sameSelectedVersion(context, event.version, ['starting', 'running']) &&
              sameVersionRecord(context.version, event.version),
          },
          {
            guard: ({ context, event }) =>
              isCurrent(context, event) &&
              context.replacementVersionObserved &&
              sameSelectedVersion(context, event.version, ['starting', 'running']),
            actions: 'rememberVersion',
          },
          { target: 'failed_releasing' },
        ],
        RUNTIME_ENABLED: [
          {
            guard: ({ context, event }) =>
              isCurrent(context, event) &&
              !context.postReloadRuntimeEnabled &&
              event.sessionId === context.selectedSession?.sessionId,
            actions: ['rememberRuntime', assign({ postReloadRuntimeEnabled: true })],
          },
          { target: 'failed_releasing' },
        ],
        EXECUTION_CONTEXT_CREATED: [
          {
            guard: ({ context, event }) =>
              isCurrent(context, event) &&
              context.reloadObserved &&
              !context.postReloadContextObserved &&
              context.uniqueContextId === null &&
              event.sessionId === context.selectedSession?.sessionId &&
              event.context.origin === context.version?.scriptURL &&
              Number.isSafeInteger(event.context.id) &&
              event.context.id >= 0 &&
              isAdmissibleUniqueContextId(event.context.uniqueId) &&
              !context.revokedUniqueContextIds.includes(event.context.uniqueId) &&
              !context.postCrashDestroyedUniqueContextIds.includes(event.context.uniqueId) &&
              context.revokedUniqueContextIds.length +
                context.postCrashDestroyedUniqueContextIds.length <
                MAX_CONTEXT_AUTHORITIES &&
              !context.preCrashContexts.some(
                (candidate) => candidate.uniqueContextId === event.context.uniqueId
              ) &&
              isSha256(event.eventSha256),
            actions: 'rememberReplacementContext',
          },
          { target: 'failed_releasing' },
        ],
        TARGET_ATTACHED: 'failed_releasing',
        TARGET_DETACHED: 'failed_releasing',
        TARGET_DESTROYED: 'failed_releasing',
        EXECUTION_CONTEXT_DESTROYED: [
          {
            guard: ({ context, event }) =>
              context.reloadObserved &&
              !context.postReloadContextObserved &&
              context.uniqueContextId === null &&
              isSelectedContextDestroyEvidence(context, event),
            actions: 'rememberContextDestroy',
          },
          { target: 'failed_releasing' },
        ],
        EXECUTION_CONTEXTS_CLEARED: [
          {
            guard: ({ context, event }) =>
              context.reloadObserved &&
              !context.postReloadContextObserved &&
              context.uniqueContextId === null &&
              isSelectedContextClearEvidence(context, event),
            actions: 'rememberContextClear',
          },
          { target: 'failed_releasing' },
        ],
      },
      always: {
        guard: ({ context }) => hasAllStartProofs(context),
        target: 'resuming',
      },
    },
    resuming: {
      entry: 'issueBootstrapBatch',
      on: {
        RESUME_RESOLVED: [
          {
            guard: 'exactResumeReceipt',
            target: 'identity_probing',
            actions: 'rememberReplacementResume',
          },
          { target: 'failed_releasing' },
        ],
        VERSION_UPDATED: [
          {
            guard: 'monotonicSelectedBatchVersion',
            actions: 'rememberBatchVersion',
          },
          { target: 'failed_releasing' },
        ],
        APPLICATION_DIAGNOSTIC_RECORDED: {
          guard: ({ context, event }) => isCurrent(context, event),
        },
        TARGET_ATTACHED: 'failed_releasing',
        TARGET_DETACHED: 'failed_releasing',
        TARGET_DESTROYED: 'failed_releasing',
      },
    },
    identity_probing: {
      on: {
        IDENTITY_PROBE_RESOLVED: [
          {
            guard: 'exactIdentityReceipt',
            target: 'test_probe_deciding',
            actions: 'rememberIdentityReceipt',
          },
          { target: 'failed_releasing' },
        ],
        VERSION_UPDATED: [
          {
            guard: 'monotonicSelectedBatchVersion',
            actions: 'rememberBatchVersion',
          },
          { target: 'failed_releasing' },
        ],
        IDENTITY_PROOF_FAILED: 'failed_releasing',
        APPLICATION_DIAGNOSTIC_RECORDED: {
          guard: ({ context, event }) => isCurrent(context, event),
        },
        TARGET_ATTACHED: 'failed_releasing',
        TARGET_DETACHED: 'failed_releasing',
        TARGET_DESTROYED: 'failed_releasing',
      },
    },
    test_probe_deciding: {
      on: {
        VERSION_UPDATED: [
          {
            guard: 'monotonicSelectedBatchVersion',
            actions: 'rememberBatchVersion',
          },
          { target: 'failed_releasing' },
        ],
        APPLICATION_DIAGNOSTIC_RECORDED: {
          guard: ({ context, event }) => isCurrent(context, event),
        },
        TARGET_ATTACHED: 'failed_releasing',
        TARGET_DETACHED: 'failed_releasing',
        TARGET_DESTROYED: 'failed_releasing',
      },
      always: [
        {
          guard: ({ context }) => context.testProbeConfigured,
          target: 'test_probing',
        },
        {
          guard: ({ context }) => hasAllBootstrapProofs(context),
          target: 'bootstrap_proved',
        },
      ],
    },
    test_probing: {
      on: {
        TEST_PROBE_RESOLVED: [
          {
            guard: 'exactTestReceipt',
            actions: 'rememberTestReceipt',
          },
          { target: 'failed_releasing' },
        ],
        VERSION_UPDATED: [
          {
            guard: 'monotonicSelectedBatchVersion',
            actions: 'rememberBatchVersion',
          },
          { target: 'failed_releasing' },
        ],
        APPLICATION_DIAGNOSTIC_RECORDED: {
          guard: ({ context, event }) => isCurrent(context, event),
        },
        TARGET_ATTACHED: 'failed_releasing',
        TARGET_DETACHED: 'failed_releasing',
        TARGET_DESTROYED: 'failed_releasing',
      },
      always: {
        guard: ({ context }) => hasAllBootstrapProofs(context),
        target: 'bootstrap_proved',
      },
    },
    bootstrap_proved: {
      always: 'release_resuming',
    },
    release_resuming: {
      on: {
        TARGET_ATTACHED: [
          {
            guard: ({ context, event }) =>
              isCurrent(context, event) && attachmentPreservesInventoryIdentity(context, event),
            actions: 'rememberReleaseAttachment',
          },
          { target: 'failed_releasing' },
        ],
        TARGET_DETACHED: [
          {
            guard: ({ context, event }) =>
              isExactDetachEvent(context, event) &&
              inventoryIdentityMatches(context, event.targetId, event.sessionId),
            actions: 'rememberInventoryDetach',
          },
          { target: 'failed_releasing' },
        ],
        RELEASE_RESUME_RESOLVED: [
          {
            guard: ({ context, event }) =>
              isCurrent(context, event) &&
              context.liveSessionIds.includes(event.sessionId) &&
              !context.resumedSessionIds.includes(event.sessionId),
            actions: 'rememberReleaseResume',
          },
          { target: 'failed_releasing' },
        ],
      },
      always: {
        guard: ({ context }) => hasAllPausedMembersResumed(context),
        target: 'release_disarming',
      },
    },
    release_disarming: {
      on: {
        TARGET_ATTACHED: [
          {
            guard: ({ context, event }) =>
              isCurrent(context, event) &&
              !context.releaseFenceClosed &&
              attachmentPreservesInventoryIdentity(context, event),
            actions: 'rememberReleaseAttachment',
          },
          { target: 'failed_releasing' },
        ],
        TARGET_DETACHED: [
          {
            guard: ({ context, event }) =>
              isExactDetachEvent(context, event) &&
              inventoryIdentityMatches(context, event.targetId, event.sessionId),
            actions: 'rememberInventoryDetach',
          },
          { target: 'failed_releasing' },
        ],
        RELEASE_RESUME_RESOLVED: [
          {
            guard: ({ context, event }) =>
              isCurrent(context, event) &&
              context.liveSessionIds.includes(event.sessionId) &&
              !context.resumedSessionIds.includes(event.sessionId),
            actions: 'rememberReleaseResume',
          },
          { target: 'failed_releasing' },
        ],
        AUTO_ATTACH_DISARMED: {
          guard: ({ context, event }) => isCurrent(context, event),
          target: 'release_attach_fencing',
          actions: assign(({ context }) => ({
            releaseProofs: { ...context.releaseProofs, autoAttachDisarmed: true },
          })),
        },
      },
    },
    release_attach_fencing: {
      on: {
        TARGET_ATTACHED: [
          {
            guard: ({ context, event }) =>
              isCurrent(context, event) &&
              !context.releaseFenceClosed &&
              attachmentPreservesInventoryIdentity(context, event),
            actions: 'rememberReleaseAttachment',
          },
          { target: 'failed_releasing' },
        ],
        TARGET_DETACHED: [
          {
            guard: ({ context, event }) =>
              isExactDetachEvent(context, event) &&
              inventoryIdentityMatches(context, event.targetId, event.sessionId),
            actions: 'rememberInventoryDetach',
          },
          { target: 'failed_releasing' },
        ],
        RELEASE_RESUME_RESOLVED: [
          {
            guard: ({ context, event }) =>
              isCurrent(context, event) &&
              context.liveSessionIds.includes(event.sessionId) &&
              !context.resumedSessionIds.includes(event.sessionId),
            actions: 'rememberReleaseResume',
          },
          { target: 'failed_releasing' },
        ],
        RELEASE_ATTACH_FENCE_RESOLVED: [
          {
            guard: ({ context, event }) =>
              isCurrent(context, event) &&
              hasAllPausedMembersResumed(context) &&
              hasExactReleaseAttachFence(context, event.targets),
            target: 'release_manual_detaching',
            actions: assign(({ context }) => ({
              releaseFenceClosed: true,
              releaseManualSessionIds: context.inventorySessions
                .filter(
                  (session) =>
                    session.attachmentOrigin === 'manual' &&
                    context.liveSessionIds.includes(session.sessionId)
                )
                .map((session) => session.sessionId),
              releaseProofs: { ...context.releaseProofs, attachFence: true },
            })),
          },
          { target: 'failed_releasing' },
        ],
      },
    },
    release_manual_detaching: {
      entry: assign(({ context }) => ({
        manualDetachCommandCount:
          context.manualDetachCommandCount + context.releaseManualSessionIds.length,
      })),
      on: {
        TARGET_ATTACHED: 'failed_releasing',
        RELEASE_MANUAL_DETACH_RESOLVED: [
          {
            guard: ({ context, event }) =>
              isCurrent(context, event) &&
              context.releaseManualSessionIds.includes(event.sessionId) &&
              !context.manualDetachReplySessionIds.includes(event.sessionId) &&
              inventoryIdentityMatches(context, event.targetId, event.sessionId),
            actions: assign(({ context, event }) =>
              event.type === 'RELEASE_MANUAL_DETACH_RESOLVED'
                ? {
                    manualDetachReplySessionIds: appendUnique(
                      context.manualDetachReplySessionIds,
                      event.sessionId
                    ),
                    releaseProofs: {
                      ...context.releaseProofs,
                      manualDetachReplies: context.releaseProofs.manualDetachReplies + 1,
                    },
                  }
                : {}
            ),
          },
          { target: 'failed_releasing' },
        ],
        TARGET_DETACHED: [
          {
            guard: ({ context, event }) =>
              isExactDetachEvent(context, event) &&
              context.releaseManualSessionIds.includes(event.sessionId) &&
              !context.manualDetachEventSessionIds.includes(event.sessionId) &&
              inventoryIdentityMatches(context, event.targetId, event.sessionId),
            actions: [
              'rememberInventoryDetach',
              assign(({ context, event }) =>
                event.type === 'TARGET_DETACHED'
                  ? {
                      manualDetachEventSessionIds: appendUnique(
                        context.manualDetachEventSessionIds,
                        event.sessionId
                      ),
                      releaseProofs: {
                        ...context.releaseProofs,
                        manualDetachEvents: context.releaseProofs.manualDetachEvents + 1,
                      },
                    }
                  : {}
              ),
            ],
          },
          { target: 'failed_releasing' },
        ],
      },
      always: {
        guard: ({ context }) => hasAllManualDetachProofs(context),
        target: 'release_zero_attached_fencing',
      },
    },
    release_zero_attached_fencing: {
      on: {
        TARGET_ATTACHED: 'failed_releasing',
        RELEASE_ZERO_ATTACHED_FENCE_RESOLVED: [
          {
            guard: ({ context, event }) =>
              isCurrent(context, event) &&
              event.targets.every(
                (target) => target.type === 'service_worker' && target.attached === false
              ) &&
              context.liveSessionIds.length === 0,
            target: 'release_service_worker_disabling',
            actions: assign(({ context }) => ({
              releaseProofs: { ...context.releaseProofs, zeroAttachedFence: true },
            })),
          },
          { target: 'failed_releasing' },
        ],
      },
    },
    release_service_worker_disabling: {
      on: {
        TARGET_ATTACHED: 'failed_releasing',
        SERVICE_WORKER_DISABLED: [
          {
            guard: ({ context, event }) =>
              isCurrent(context, event) && event.sessionId === context.controlSessionId,
            target: 'release_control_detaching',
            actions: assign(({ context }) => ({
              releaseProofs: { ...context.releaseProofs, serviceWorkerDisabled: true },
            })),
          },
          { target: 'failed_releasing' },
        ],
      },
    },
    release_control_detaching: {
      on: {
        TARGET_ATTACHED: 'failed_releasing',
        CONTROL_DETACH_RESOLVED: [
          {
            guard: ({ context, event }) =>
              isCurrent(context, event) &&
              !context.releaseProofs.controlDetachReply &&
              event.targetId === context.controlTargetId &&
              event.sessionId === context.controlSessionId,
            actions: assign(({ context }) => ({
              releaseProofs: { ...context.releaseProofs, controlDetachReply: true },
            })),
          },
          { target: 'failed_releasing' },
        ],
        TARGET_DETACHED: [
          {
            guard: ({ context, event }) =>
              isExactDetachEvent(context, event) &&
              !context.releaseProofs.controlDetachEvent &&
              event.targetId === context.controlTargetId &&
              event.sessionId === context.controlSessionId,
            actions: assign(({ context }) => ({
              releaseProofs: { ...context.releaseProofs, controlDetachEvent: true },
            })),
          },
          { target: 'failed_releasing' },
        ],
      },
      always: {
        guard: ({ context }) =>
          context.releaseProofs.controlDetachReply && context.releaseProofs.controlDetachEvent,
        target: 'release_sentinel_fencing',
      },
    },
    release_sentinel_fencing: {
      on: {
        TARGET_ATTACHED: 'failed_releasing',
        SENTINEL_FENCE_RESOLVED: [
          {
            guard: ({ context, event }) =>
              isCurrent(context, event) &&
              event.sentinels.length === 1 &&
              event.sentinels[0]?.targetId === context.sentinelTargetId &&
              event.sentinels[0]?.url === 'about:blank' &&
              event.sentinels[0]?.attached === false,
            target: 'release_discovery_disabling',
            actions: assign(({ context }) => ({
              releaseProofs: { ...context.releaseProofs, sentinelFence: true },
            })),
          },
          { target: 'failed_releasing' },
        ],
      },
    },
    release_discovery_disabling: {
      on: {
        TARGET_ATTACHED: 'failed_releasing',
        DISCOVERY_DISABLED: {
          guard: ({ context, event }) => isCurrent(context, event),
          target: 'release_socket_closing',
          actions: assign(({ context }) => ({
            releaseProofs: { ...context.releaseProofs, discoveryDisabled: true },
          })),
        },
      },
    },
    release_socket_closing: {
      on: {
        TARGET_ATTACHED: 'failed_releasing',
        RAW_SOCKET_CLOSED: [
          {
            guard: ({ context, event }) => isCurrent(context, event) && context.failureObserved,
            target: 'failed',
            actions: assign(({ context }) => ({
              releaseProofs: { ...context.releaseProofs, socketClosed: true },
            })),
          },
          {
            guard: ({ context, event }) => isCurrent(context, event),
            target: 'released',
            actions: assign(({ context }) => ({
              releaseProofs: { ...context.releaseProofs, socketClosed: true },
            })),
          },
          { target: 'failed_releasing' },
        ],
      },
    },
    released: {
      type: 'final',
    },
    failed_releasing: {
      entry: assign({ failureObserved: true }),
      on: {
        BEGIN_FAILED_RELEASE: [
          {
            guard: ({ context, event }) =>
              isCurrent(context, event) && !context.failureReleaseStarted,
            target: 'release_resuming',
            actions: assign({ failureReleaseStarted: true }),
          },
          { target: 'cleanup_failed' },
        ],
      },
    },
    failed: {
      type: 'final',
    },
    cleanup_failed: {
      type: 'final',
    },
  },
});
