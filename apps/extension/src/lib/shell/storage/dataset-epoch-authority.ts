import {
  DATASET_STARTUP_MODEL_VERSION,
  datasetStartupCommandId,
  parseDatasetStartupError,
  type DatasetAdmissionOpenedProofV1,
  type DatasetStartupCommand,
  type DatasetStartupErrorV1,
  type DatasetStartupFailureFenceProofV1,
} from '../../../models/dataset-startup.contract';

const UUID_V4_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export const MAX_RETAINED_ORDINARY_OPERATIONS_PER_WORKER = 4_096;
export const MAX_RETAINED_ORDINARY_LEASE_IDS_PER_WORKER = 32_768;

export interface DatasetMutationScopeV2 {
  version: 2;
  operationId: string;
  dataEpoch: string;
}

export interface DatasetWriteLeaseV1 {
  version: 1;
  leaseId: string;
  operationId: string;
  dataEpoch: string;
  authorityRevision: number;
}

export type OpeningAdmissionProofV1 = DatasetAdmissionOpenedProofV1;
export type DatasetStartupFailureFenceCommandV1 = Extract<
  DatasetStartupCommand,
  { type: 'FENCE_STARTUP_FAILURE' }
>;

export interface ResetAuthorityRequestV1 {
  version: 1;
  resetOperationId: string;
  previousDataEpoch: string | null;
  nextDataEpoch: string;
}

export interface ResetAuthorityTokenV1 {
  version: 1;
  workerEpoch: string;
  resetOperationId: string;
  previousDataEpoch: string | null;
  nextDataEpoch: string;
  authorityRevision: number;
}

export type DatasetAuthorityAdmission =
  | { status: 'closed_startup'; authorityRevision: number }
  | { status: 'open'; dataEpoch: string; authorityRevision: number }
  | {
      status: 'reset_pending';
      resetOperationId: string;
      previousDataEpoch: string | null;
      nextDataEpoch: string;
      authorityRevision: number;
    }
  | {
      status: 'reset_owned';
      resetOperationId: string;
      previousDataEpoch: string | null;
      nextDataEpoch: string;
      authorityRevision: number;
    }
  | {
      status: 'fenced_failure';
      authorityRevision: number;
      failure: Readonly<DatasetStartupErrorV1>;
    };

export type DatasetEpochAuthorityErrorCode =
  | 'INVALID_CONFIGURATION'
  | 'INVALID_SCOPE'
  | 'INVALID_OPENING_PROOF'
  | 'INVALID_LEASE_ID'
  | 'LEASE_ID_COLLISION'
  | 'AUTHORITY_REENTRANCY_FORBIDDEN'
  | 'OPERATION_CAPACITY_EXHAUSTED'
  | 'CORRELATION_CAPACITY_EXHAUSTED'
  | 'ADMISSION_CLOSED'
  | 'FOREIGN_EPOCH'
  | 'OPERATION_REBOUND'
  | 'LEASE_REVOKED'
  | 'INVALID_LEASE'
  | 'INVALID_DURABLE_EFFECT'
  | 'LEASE_ID_MISMATCH'
  | 'OPERATION_ID_MISMATCH'
  | 'DATA_EPOCH_MISMATCH'
  | 'AUTHORITY_REVISION_MISMATCH'
  | 'INVALID_RESET_REQUEST'
  | 'RESET_EPOCH_MISMATCH'
  | 'RESET_ALREADY_OWNED'
  | 'INVALID_RESET_TOKEN'
  | 'INVALID_FAILURE_FENCE'
  | 'REVISION_OVERFLOW'
  | 'FENCED_FAILURE';

export interface DatasetEpochAuthority {
  snapshot(): DatasetAuthorityAdmission;
  openAdmission(proof: OpeningAdmissionProofV1): void;
  issueLease(scope: DatasetMutationScopeV2): DatasetWriteLeaseV1;
  commit<T>(
    lease: DatasetWriteLeaseV1,
    operationId: string,
    durableEffect: () => Promise<T>
  ): Promise<T>;
  acquireResetFence(request: ResetAuthorityRequestV1): Promise<ResetAuthorityTokenV1>;
  installResetEpoch(token: ResetAuthorityTokenV1): Promise<void>;
  fenceFailure(
    command: DatasetStartupFailureFenceCommandV1
  ): Promise<DatasetStartupFailureFenceProofV1>;
}

export interface DatasetEpochAuthorityDependencies {
  workerEpoch: string;
  allocateLeaseId: () => string;
  /** Deterministic seam used to exercise the safe-integer terminal fence. */
  initialAuthorityRevision?: number;
}

export class DatasetEpochAuthorityError extends Error {
  constructor(
    readonly code: DatasetEpochAuthorityErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'DatasetEpochAuthorityError';
  }
}

function isUuidV4(value: unknown): value is string {
  return typeof value === 'string' && UUID_V4_PATTERN.test(value);
}

function isSafeRevision(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function readDataRecord(
  value: unknown,
  requiredKeys: readonly string[],
  optionalKeys: readonly string[] = []
): Record<string, unknown> | null {
  try {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      return null;
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      return null;
    }
    const keys = Reflect.ownKeys(value);
    const allowedKeys = [...requiredKeys, ...optionalKeys];
    if (
      keys.length < requiredKeys.length ||
      keys.length > allowedKeys.length ||
      keys.some((key) => typeof key !== 'string' || !allowedKeys.includes(key)) ||
      requiredKeys.some((key) => !keys.includes(key))
    ) {
      return null;
    }
    const record: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const key of allowedKeys) {
      if (!keys.includes(key)) {
        continue;
      }
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
    return record;
  } catch {
    return null;
  }
}

function readExactDataRecord(
  value: unknown,
  expectedKeys: readonly string[]
): Record<string, unknown> | null {
  return readDataRecord(value, expectedKeys);
}

function parseDependencies(value: unknown): Required<DatasetEpochAuthorityDependencies> | null {
  const record = readDataRecord(
    value,
    ['workerEpoch', 'allocateLeaseId'],
    ['initialAuthorityRevision']
  );
  const initialAuthorityRevision =
    record?.initialAuthorityRevision === undefined ? 0 : record.initialAuthorityRevision;
  return record !== null &&
    isUuidV4(record.workerEpoch) &&
    typeof record.allocateLeaseId === 'function' &&
    isSafeRevision(initialAuthorityRevision)
    ? {
        workerEpoch: record.workerEpoch,
        allocateLeaseId: record.allocateLeaseId as () => string,
        initialAuthorityRevision,
      }
    : null;
}

function parseScope(value: unknown): DatasetMutationScopeV2 | null {
  const record = readExactDataRecord(value, ['version', 'operationId', 'dataEpoch']);
  return record !== null &&
    record.version === 2 &&
    isUuidV4(record.operationId) &&
    isUuidV4(record.dataEpoch)
    ? {
        version: 2,
        operationId: record.operationId,
        dataEpoch: record.dataEpoch,
      }
    : null;
}

function parseOpeningProof(
  value: unknown,
  workerEpoch: string,
  authorityRevision: number
): OpeningAdmissionProofV1 | null {
  const record = readExactDataRecord(value, [
    'version',
    'attemptId',
    'workerEpoch',
    'dataEpoch',
    'authorityRevision',
    'admission',
    'proofId',
  ]);
  return record !== null &&
    record.version === 1 &&
    isUuidV4(record.attemptId) &&
    record.workerEpoch === workerEpoch &&
    isUuidV4(record.workerEpoch) &&
    isUuidV4(record.dataEpoch) &&
    record.authorityRevision === authorityRevision &&
    record.admission === 'open' &&
    isUuidV4(record.proofId) &&
    new Set([record.attemptId, record.workerEpoch, record.dataEpoch, record.proofId]).size === 4
    ? {
        version: 1,
        attemptId: record.attemptId,
        workerEpoch,
        dataEpoch: record.dataEpoch,
        authorityRevision,
        admission: 'open',
        proofId: record.proofId,
      }
    : null;
}

function parseLease(value: unknown): DatasetWriteLeaseV1 | null {
  const record = readExactDataRecord(value, [
    'version',
    'leaseId',
    'operationId',
    'dataEpoch',
    'authorityRevision',
  ]);
  return record !== null &&
    record.version === 1 &&
    isUuidV4(record.leaseId) &&
    isUuidV4(record.operationId) &&
    isUuidV4(record.dataEpoch) &&
    isSafeRevision(record.authorityRevision)
    ? {
        version: 1,
        leaseId: record.leaseId,
        operationId: record.operationId,
        dataEpoch: record.dataEpoch,
        authorityRevision: record.authorityRevision,
      }
    : null;
}

function parseResetRequest(value: unknown, workerEpoch: string): ResetAuthorityRequestV1 | null {
  const record = readExactDataRecord(value, [
    'version',
    'resetOperationId',
    'previousDataEpoch',
    'nextDataEpoch',
  ]);
  const previousDataEpoch = record?.previousDataEpoch;
  if (previousDataEpoch !== null && !isUuidV4(previousDataEpoch)) {
    return null;
  }
  const identities = [
    workerEpoch,
    record?.resetOperationId,
    record?.nextDataEpoch,
    ...(previousDataEpoch === null ? [] : [previousDataEpoch]),
  ];
  return record !== null &&
    record.version === 1 &&
    isUuidV4(record.resetOperationId) &&
    isUuidV4(record.nextDataEpoch) &&
    new Set(identities).size === identities.length
    ? {
        version: 1,
        resetOperationId: record.resetOperationId,
        previousDataEpoch,
        nextDataEpoch: record.nextDataEpoch,
      }
    : null;
}

function resetRequestsEqual(
  left: ResetAuthorityRequestV1,
  right: ResetAuthorityRequestV1
): boolean {
  return (
    left.resetOperationId === right.resetOperationId &&
    left.previousDataEpoch === right.previousDataEpoch &&
    left.nextDataEpoch === right.nextDataEpoch
  );
}

function parseFailureFenceCommand(
  value: unknown,
  workerEpoch: string
): DatasetStartupFailureFenceCommandV1 | null {
  const record = readExactDataRecord(value, [
    'version',
    'type',
    'attemptId',
    'workerEpoch',
    'commandId',
    'allowsDatabaseOpen',
    'destructiveRepairAllowed',
    'stage',
    'dataEpoch',
    'admissionProofId',
    'openedAuthorityRevision',
    'failure',
  ]);
  const failure = record === null ? null : parseDatasetStartupError(record.failure);
  if (
    record === null ||
    failure === null ||
    record.version !== DATASET_STARTUP_MODEL_VERSION ||
    record.type !== 'FENCE_STARTUP_FAILURE' ||
    !isUuidV4(record.attemptId) ||
    record.workerEpoch !== workerEpoch ||
    !isUuidV4(record.workerEpoch) ||
    record.commandId !== datasetStartupCommandId('failure_fence', record.attemptId) ||
    record.allowsDatabaseOpen !== false ||
    record.destructiveRepairAllowed !== false ||
    record.stage !== 'failure_fence' ||
    !isUuidV4(record.dataEpoch) ||
    !isUuidV4(record.admissionProofId) ||
    !isSafeRevision(record.openedAuthorityRevision) ||
    new Set([record.attemptId, record.workerEpoch, record.dataEpoch, record.admissionProofId])
      .size !== 4
  ) {
    return null;
  }
  return Object.freeze({
    version: DATASET_STARTUP_MODEL_VERSION,
    type: 'FENCE_STARTUP_FAILURE' as const,
    attemptId: record.attemptId,
    workerEpoch,
    commandId: record.commandId,
    allowsDatabaseOpen: false as const,
    destructiveRepairAllowed: false as const,
    stage: 'failure_fence' as const,
    dataEpoch: record.dataEpoch,
    admissionProofId: record.admissionProofId,
    openedAuthorityRevision: record.openedAuthorityRevision,
    failure: Object.freeze({ ...failure }),
  });
}

function authorityFenceFailure(message: string): Readonly<DatasetStartupErrorV1> {
  return Object.freeze({
    version: DATASET_STARTUP_MODEL_VERSION,
    code: 'AUTHORITY_FENCE_FAILED' as const,
    stage: 'failure_fence' as const,
    message,
    retryable: false as const,
    destructiveEffectPerformed: false as const,
  });
}

export function createDatasetEpochAuthority(
  deps: DatasetEpochAuthorityDependencies
): DatasetEpochAuthority {
  const dependencies = parseDependencies(deps);
  if (dependencies === null) {
    throw new DatasetEpochAuthorityError(
      'INVALID_CONFIGURATION',
      'Dataset epoch authority configuration is invalid.'
    );
  }
  const { workerEpoch, allocateLeaseId, initialAuthorityRevision } = dependencies;

  let admission: DatasetAuthorityAdmission = Object.freeze({
    status: 'closed_startup' as const,
    authorityRevision: initialAuthorityRevision,
  });
  const operations = new Map<string, { lease: DatasetWriteLeaseV1; revoked: boolean }>();
  const leaseIds = new Set<string>();
  let gateTail: Promise<void> = Promise.resolve();
  let activeOpeningProof: Readonly<OpeningAdmissionProofV1> | null = null;
  let activeResetToken: ResetAuthorityTokenV1 | null = null;
  let pendingResetRequest: ResetAuthorityRequestV1 | null = null;
  let pendingResetPromise: Promise<ResetAuthorityTokenV1> | null = null;
  let pendingNextDataEpoch: string | null = null;
  let leaseAllocationInProgress = false;
  let leaseAllocationReentrancyDetected = false;

  function authorityReentrancyError(): DatasetEpochAuthorityError {
    return new DatasetEpochAuthorityError(
      'AUTHORITY_REENTRANCY_FORBIDDEN',
      'Dataset authority cannot be entered from the lease ID allocator.'
    );
  }

  function rejectAllocatorReentrancy(): void {
    if (!leaseAllocationInProgress) {
      return;
    }
    leaseAllocationReentrancyDetected = true;
    throw authorityReentrancyError();
  }

  function runWithGate<T>(effect: () => T | Promise<T>): Promise<T> {
    const result = gateTail.then(effect, effect);
    gateTail = result.then(
      () => undefined,
      () => undefined
    );
    return result;
  }

  function revokeAllLeases(): void {
    for (const binding of operations.values()) {
      binding.revoked = true;
    }
  }

  function fenceCapacityExhaustion(
    code: 'OPERATION_CAPACITY_EXHAUSTED' | 'CORRELATION_CAPACITY_EXHAUSTED',
    message: string
  ): never {
    revokeAllLeases();
    activeOpeningProof = null;
    activeResetToken = null;
    pendingResetRequest = null;
    pendingResetPromise = null;
    pendingNextDataEpoch = null;
    admission = Object.freeze({
      status: 'fenced_failure' as const,
      authorityRevision: admission.authorityRevision,
      failure: authorityFenceFailure(message),
    });
    throw new DatasetEpochAuthorityError(code, message);
  }

  function admittedDataEpoch(): string | null {
    if (admission.status === 'open') {
      return admission.dataEpoch;
    }
    if (admission.status === 'reset_pending') {
      return admission.previousDataEpoch;
    }
    return null;
  }

  function canonicalLeaseForScope(scope: DatasetMutationScopeV2): DatasetWriteLeaseV1 | null {
    const existing = operations.get(scope.operationId);
    if (!existing) {
      return null;
    }
    if (existing.lease.dataEpoch !== scope.dataEpoch) {
      throw new DatasetEpochAuthorityError(
        'OPERATION_REBOUND',
        'Dataset operation is already bound to another epoch.'
      );
    }
    if (
      existing.revoked ||
      admission.status !== 'open' ||
      existing.lease.authorityRevision !== admission.authorityRevision
    ) {
      throw new DatasetEpochAuthorityError('LEASE_REVOKED', 'Dataset lease is revoked.');
    }
    return existing.lease;
  }

  function nextAuthorityRevision(): number {
    if (admission.authorityRevision >= Number.MAX_SAFE_INTEGER) {
      revokeAllLeases();
      activeOpeningProof = null;
      activeResetToken = null;
      pendingResetRequest = null;
      pendingResetPromise = null;
      pendingNextDataEpoch = null;
      admission = Object.freeze({
        status: 'fenced_failure' as const,
        authorityRevision: admission.authorityRevision,
        failure: authorityFenceFailure('Dataset authority revision overflow.'),
      });
      throw new DatasetEpochAuthorityError(
        'REVISION_OVERFLOW',
        'Dataset authority revision cannot advance safely.'
      );
    }
    return admission.authorityRevision + 1;
  }

  return Object.freeze({
    snapshot(): DatasetAuthorityAdmission {
      rejectAllocatorReentrancy();
      return admission;
    },
    openAdmission(rawProof: OpeningAdmissionProofV1): void {
      rejectAllocatorReentrancy();
      const proof = parseOpeningProof(rawProof, workerEpoch, admission.authorityRevision);
      if (
        proof === null ||
        admission.status !== 'closed_startup' ||
        (pendingNextDataEpoch !== null && proof.dataEpoch !== pendingNextDataEpoch)
      ) {
        throw new DatasetEpochAuthorityError(
          'INVALID_OPENING_PROOF',
          'Dataset opening admission proof is invalid.'
        );
      }
      admission = Object.freeze({
        status: 'open' as const,
        dataEpoch: proof.dataEpoch,
        authorityRevision: admission.authorityRevision,
      });
      activeOpeningProof = Object.freeze({ ...proof });
      pendingNextDataEpoch = null;
    },
    issueLease(rawScope: DatasetMutationScopeV2): DatasetWriteLeaseV1 {
      rejectAllocatorReentrancy();
      const parsedScope = parseScope(rawScope);
      if (parsedScope === null) {
        throw new DatasetEpochAuthorityError('INVALID_SCOPE', 'Dataset mutation scope is invalid.');
      }
      const canonicalLease = canonicalLeaseForScope(parsedScope);
      if (canonicalLease !== null) {
        return canonicalLease;
      }
      if (admission.status !== 'open') {
        throw new DatasetEpochAuthorityError('ADMISSION_CLOSED', 'Dataset admission is closed.');
      }
      if (parsedScope.dataEpoch !== admission.dataEpoch) {
        throw new DatasetEpochAuthorityError(
          'FOREIGN_EPOCH',
          'Dataset mutation scope targets a foreign epoch.'
        );
      }
      if (operations.size >= MAX_RETAINED_ORDINARY_OPERATIONS_PER_WORKER) {
        fenceCapacityExhaustion(
          'OPERATION_CAPACITY_EXHAUSTED',
          'Dataset ordinary operation capacity is exhausted for this worker.'
        );
      }
      if (leaseIds.size >= MAX_RETAINED_ORDINARY_LEASE_IDS_PER_WORKER) {
        fenceCapacityExhaustion(
          'CORRELATION_CAPACITY_EXHAUSTED',
          'Dataset ordinary lease correlation capacity is exhausted for this worker.'
        );
      }
      const admittedDataEpoch = admission.dataEpoch;
      const admittedAuthorityRevision = admission.authorityRevision;
      let leaseId: unknown;
      let allocationFailed = false;
      leaseAllocationInProgress = true;
      leaseAllocationReentrancyDetected = false;
      try {
        leaseId = allocateLeaseId();
      } catch {
        allocationFailed = true;
      } finally {
        leaseAllocationInProgress = false;
      }
      const reentrancyDetected = leaseAllocationReentrancyDetected;
      leaseAllocationReentrancyDetected = false;
      if (reentrancyDetected) {
        if (isUuidV4(leaseId)) {
          leaseIds.add(leaseId);
        }
        throw authorityReentrancyError();
      }
      if (allocationFailed) {
        throw new DatasetEpochAuthorityError('INVALID_LEASE_ID', 'Allocated lease ID is invalid.');
      }
      if (!isUuidV4(leaseId)) {
        throw new DatasetEpochAuthorityError('INVALID_LEASE_ID', 'Allocated lease ID is invalid.');
      }
      if (leaseIds.has(leaseId)) {
        throw new DatasetEpochAuthorityError(
          'LEASE_ID_COLLISION',
          'Allocated dataset lease ID is already retained.'
        );
      }
      leaseIds.add(leaseId);
      if (
        admission.status !== 'open' ||
        admission.dataEpoch !== admittedDataEpoch ||
        admission.authorityRevision !== admittedAuthorityRevision
      ) {
        throw new DatasetEpochAuthorityError(
          'ADMISSION_CLOSED',
          'Dataset admission changed during lease allocation.'
        );
      }
      const reentrantCanonicalLease = canonicalLeaseForScope(parsedScope);
      if (reentrantCanonicalLease !== null) {
        return reentrantCanonicalLease;
      }
      const lease = Object.freeze({
        version: 1,
        leaseId,
        operationId: parsedScope.operationId,
        dataEpoch: admittedDataEpoch,
        authorityRevision: admittedAuthorityRevision,
      });
      operations.set(parsedScope.operationId, { lease, revoked: false });
      return lease;
    },
    commit<T>(
      rawLease: DatasetWriteLeaseV1,
      operationId: string,
      durableEffect: () => Promise<T>
    ): Promise<T> {
      rejectAllocatorReentrancy();
      if (typeof durableEffect !== 'function') {
        throw new DatasetEpochAuthorityError(
          'INVALID_DURABLE_EFFECT',
          'Dataset durable effect must be callable.'
        );
      }
      return runWithGate(() => {
        const lease = parseLease(rawLease);
        if (lease === null) {
          throw new DatasetEpochAuthorityError('INVALID_LEASE', 'Dataset lease is invalid.');
        }
        const binding = operations.get(lease.operationId);
        if (binding === undefined || lease.leaseId !== binding.lease.leaseId) {
          throw new DatasetEpochAuthorityError(
            'LEASE_ID_MISMATCH',
            'Dataset lease ID does not match the retained operation binding.'
          );
        }
        if (operationId !== lease.operationId || operationId !== binding.lease.operationId) {
          throw new DatasetEpochAuthorityError(
            'OPERATION_ID_MISMATCH',
            'Dataset operation ID does not match its lease.'
          );
        }
        if (lease.dataEpoch !== binding.lease.dataEpoch) {
          throw new DatasetEpochAuthorityError(
            'DATA_EPOCH_MISMATCH',
            'Dataset epoch does not match the retained lease.'
          );
        }
        if (lease.authorityRevision !== binding.lease.authorityRevision) {
          throw new DatasetEpochAuthorityError(
            'AUTHORITY_REVISION_MISMATCH',
            'Dataset authority revision does not match the retained lease.'
          );
        }
        const currentDataEpoch = admittedDataEpoch();
        if (binding.revoked || currentDataEpoch === null) {
          throw new DatasetEpochAuthorityError('LEASE_REVOKED', 'Dataset lease is revoked.');
        }
        if (lease.dataEpoch !== currentDataEpoch) {
          throw new DatasetEpochAuthorityError(
            'DATA_EPOCH_MISMATCH',
            'Dataset lease does not target the admitted epoch.'
          );
        }
        if (lease.authorityRevision !== admission.authorityRevision) {
          throw new DatasetEpochAuthorityError(
            'AUTHORITY_REVISION_MISMATCH',
            'Dataset lease does not target the active authority revision.'
          );
        }
        return durableEffect();
      });
    },
    acquireResetFence(rawRequest: ResetAuthorityRequestV1): Promise<ResetAuthorityTokenV1> {
      rejectAllocatorReentrancy();
      const request = parseResetRequest(rawRequest, workerEpoch);
      if (request === null) {
        return Promise.reject(
          new DatasetEpochAuthorityError(
            'INVALID_RESET_REQUEST',
            'Dataset reset authority request is invalid.'
          )
        );
      }
      if (admission.status === 'fenced_failure') {
        return Promise.reject(
          new DatasetEpochAuthorityError(
            'FENCED_FAILURE',
            'Dataset authority is permanently fenced.'
          )
        );
      }
      if (admission.status === 'reset_pending') {
        if (
          pendingResetRequest !== null &&
          pendingResetPromise !== null &&
          resetRequestsEqual(request, pendingResetRequest)
        ) {
          return pendingResetPromise;
        }
        return Promise.reject(
          new DatasetEpochAuthorityError(
            'RESET_ALREADY_OWNED',
            'Dataset reset fence is already pending for another request.'
          )
        );
      }
      if (admission.status === 'reset_owned') {
        if (
          activeResetToken !== null &&
          request.resetOperationId === activeResetToken.resetOperationId &&
          request.previousDataEpoch === activeResetToken.previousDataEpoch &&
          request.nextDataEpoch === activeResetToken.nextDataEpoch
        ) {
          return Promise.resolve(activeResetToken);
        }
        return Promise.reject(
          new DatasetEpochAuthorityError(
            'RESET_ALREADY_OWNED',
            'Dataset reset fence is owned by another request.'
          )
        );
      }
      if (
        (admission.status === 'open' && request.previousDataEpoch !== admission.dataEpoch) ||
        (admission.status === 'closed_startup' &&
          pendingNextDataEpoch !== null &&
          request.previousDataEpoch !== pendingNextDataEpoch)
      ) {
        return Promise.reject(
          new DatasetEpochAuthorityError(
            'RESET_EPOCH_MISMATCH',
            'Dataset reset request does not match the current dataset epoch.'
          )
        );
      }

      pendingResetRequest = request;
      admission = Object.freeze({
        status: 'reset_pending' as const,
        resetOperationId: request.resetOperationId,
        previousDataEpoch: request.previousDataEpoch,
        nextDataEpoch: request.nextDataEpoch,
        authorityRevision: admission.authorityRevision,
      });
      const resetPromise = runWithGate(() => {
        if (admission.status === 'fenced_failure') {
          throw new DatasetEpochAuthorityError(
            'FENCED_FAILURE',
            'Dataset authority is permanently fenced.'
          );
        }
        if (
          admission.status !== 'reset_pending' ||
          pendingResetRequest === null ||
          !resetRequestsEqual(request, pendingResetRequest)
        ) {
          throw new DatasetEpochAuthorityError(
            'RESET_ALREADY_OWNED',
            'Dataset reset fence is no longer pending for this request.'
          );
        }

        const authorityRevision = nextAuthorityRevision();
        revokeAllLeases();
        activeOpeningProof = null;
        const token = Object.freeze({
          version: 1 as const,
          workerEpoch,
          resetOperationId: request.resetOperationId,
          previousDataEpoch: request.previousDataEpoch,
          nextDataEpoch: request.nextDataEpoch,
          authorityRevision,
        });
        activeResetToken = token;
        pendingResetRequest = null;
        admission = Object.freeze({
          status: 'reset_owned' as const,
          resetOperationId: request.resetOperationId,
          previousDataEpoch: request.previousDataEpoch,
          nextDataEpoch: request.nextDataEpoch,
          authorityRevision,
        });
        return token;
      });
      pendingResetPromise = resetPromise;
      const clearPendingPromise = (): void => {
        if (pendingResetPromise === resetPromise) {
          pendingResetPromise = null;
        }
      };
      void resetPromise.then(clearPendingPromise, clearPendingPromise);
      return resetPromise;
    },
    installResetEpoch(rawToken: ResetAuthorityTokenV1): Promise<void> {
      rejectAllocatorReentrancy();
      return runWithGate(() => {
        if (
          rawToken !== activeResetToken ||
          admission.status !== 'reset_owned' ||
          admission.resetOperationId !== activeResetToken.resetOperationId ||
          admission.previousDataEpoch !== activeResetToken.previousDataEpoch ||
          admission.nextDataEpoch !== activeResetToken.nextDataEpoch ||
          admission.authorityRevision !== activeResetToken.authorityRevision
        ) {
          throw new DatasetEpochAuthorityError(
            'INVALID_RESET_TOKEN',
            'Reset authority token is not the active exact token.'
          );
        }
        pendingNextDataEpoch = activeResetToken.nextDataEpoch;
        activeResetToken = null;
        pendingResetRequest = null;
        pendingResetPromise = null;
        admission = Object.freeze({
          status: 'closed_startup' as const,
          authorityRevision: admission.authorityRevision,
        });
      });
    },
    fenceFailure(
      rawCommand: DatasetStartupFailureFenceCommandV1
    ): Promise<DatasetStartupFailureFenceProofV1> {
      rejectAllocatorReentrancy();
      const command = parseFailureFenceCommand(rawCommand, workerEpoch);
      if (command === null) {
        return Promise.reject(
          new DatasetEpochAuthorityError(
            'INVALID_FAILURE_FENCE',
            'Dataset startup failure fence command is invalid.'
          )
        );
      }
      if (admission.status === 'reset_pending' || admission.status === 'reset_owned') {
        return Promise.reject(
          new DatasetEpochAuthorityError(
            'RESET_ALREADY_OWNED',
            'Dataset failure fencing cannot replace Reset ownership.'
          )
        );
      }
      return runWithGate(() => {
        if (admission.status === 'fenced_failure') {
          throw new DatasetEpochAuthorityError(
            'FENCED_FAILURE',
            'Dataset authority is permanently fenced.'
          );
        }
        if (admission.status === 'reset_pending' || admission.status === 'reset_owned') {
          throw new DatasetEpochAuthorityError(
            'RESET_ALREADY_OWNED',
            'Dataset failure fencing cannot replace Reset ownership.'
          );
        }
        if (
          admission.status !== 'open' ||
          activeOpeningProof === null ||
          command.attemptId !== activeOpeningProof.attemptId ||
          command.workerEpoch !== activeOpeningProof.workerEpoch ||
          command.dataEpoch !== activeOpeningProof.dataEpoch ||
          command.admissionProofId !== activeOpeningProof.proofId ||
          command.openedAuthorityRevision !== activeOpeningProof.authorityRevision ||
          admission.dataEpoch !== activeOpeningProof.dataEpoch ||
          admission.authorityRevision !== activeOpeningProof.authorityRevision
        ) {
          throw new DatasetEpochAuthorityError(
            'INVALID_FAILURE_FENCE',
            'Dataset startup failure fence does not match the active opening proof.'
          );
        }

        const authorityRevision = nextAuthorityRevision();
        revokeAllLeases();
        const allLeasesRevoked = [...operations.values()].every((binding) => binding.revoked);
        if (!allLeasesRevoked) {
          throw new DatasetEpochAuthorityError(
            'INVALID_FAILURE_FENCE',
            'Dataset leases could not be proven revoked.'
          );
        }
        const proof = Object.freeze({
          version: DATASET_STARTUP_MODEL_VERSION,
          attemptId: activeOpeningProof.attemptId,
          workerEpoch: activeOpeningProof.workerEpoch,
          dataEpoch: activeOpeningProof.dataEpoch,
          admissionProofId: activeOpeningProof.proofId,
          previousAuthorityRevision: activeOpeningProof.authorityRevision,
          authorityRevision,
          admission: 'closed' as const,
          activeLeaseCount: 0 as const,
          allLeasesRevoked: true as const,
        });
        const failure = Object.freeze({ ...command.failure });
        activeOpeningProof = null;
        activeResetToken = null;
        pendingResetRequest = null;
        pendingResetPromise = null;
        pendingNextDataEpoch = null;
        admission = Object.freeze({
          status: 'fenced_failure' as const,
          authorityRevision,
          failure,
        });
        return proof;
      });
    },
  });
}
