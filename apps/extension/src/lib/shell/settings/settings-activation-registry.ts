import {
  MAX_SETTINGS_HANDLED_ACTIVATIONS_PER_WORKER,
  SETTINGS_ACTIVATION_MAX_LIFETIME_MS,
  isUuidV4,
  readStrictJsonRecord,
  type SettingsActivationIssueV1,
  type SettingsActivationRegistryResultV1,
  type SettingsActivationTokenV1,
} from '../../../models/settings-persistence.contract';

export interface SettingsActivationRegistry {
  issue(input: SettingsActivationIssueV1): SettingsActivationTokenV1;
  consume(token: unknown): SettingsActivationRegistryResultV1;
}

export interface SettingsActivationRegistryDependencies {
  dataEpoch: string;
  workerEpoch: string;
  nowMs: () => number;
  allocateResultId: () => string;
}

export type SettingsActivationRegistryErrorCode =
  | 'invalid_configuration'
  | 'invalid_issue'
  | 'invalid_token'
  | 'invalid_clock'
  | 'activation_reused'
  | 'capacity_exhausted'
  | 'result_identity_invalid';

export class SettingsActivationRegistryError extends Error {
  constructor(
    readonly code: SettingsActivationRegistryErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'SettingsActivationRegistryError';
  }
}

const ISSUE_KEYS = [
  'version',
  'mutationId',
  'permissionCheckId',
  'activationId',
  'storageReservationId',
  'ttlMs',
] as const;

const TOKEN_KEYS = [
  'version',
  'dataEpoch',
  'workerEpoch',
  'mutationId',
  'permissionCheckId',
  'activationId',
  'storageReservationId',
  'issuedAtMs',
  'expiresAtMs',
] as const;

function safeTimestamp(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0;
}

function identityTuple(value: {
  mutationId: string;
  permissionCheckId: string;
  activationId: string;
  storageReservationId: string;
}): string[] {
  return [
    value.mutationId,
    value.permissionCheckId,
    value.activationId,
    value.storageReservationId,
  ];
}

function parseIssue(
  value: unknown,
  dataEpoch: string,
  workerEpoch: string
): SettingsActivationIssueV1 | null {
  const record = readStrictJsonRecord(value, ISSUE_KEYS);
  const ids = record === null ? [] : identityTuple(record as never);
  return record !== null &&
    record.version === 1 &&
    ids.every(isUuidV4) &&
    new Set(ids).size === ids.length &&
    !ids.includes(dataEpoch) &&
    !ids.includes(workerEpoch) &&
    Number.isSafeInteger(record.ttlMs) &&
    Number(record.ttlMs) >= 1 &&
    Number(record.ttlMs) <= SETTINGS_ACTIVATION_MAX_LIFETIME_MS
    ? {
        version: 1,
        mutationId: record.mutationId as string,
        permissionCheckId: record.permissionCheckId as string,
        activationId: record.activationId as string,
        storageReservationId: record.storageReservationId as string,
        ttlMs: Number(record.ttlMs),
      }
    : null;
}

function parseToken(value: unknown): SettingsActivationTokenV1 | null {
  const record = readStrictJsonRecord(value, TOKEN_KEYS);
  const ids = record === null ? [] : identityTuple(record as never);
  return record !== null &&
    record.version === 1 &&
    isUuidV4(record.dataEpoch) &&
    isUuidV4(record.workerEpoch) &&
    record.dataEpoch !== record.workerEpoch &&
    ids.every(isUuidV4) &&
    new Set(ids).size === ids.length &&
    !ids.includes(record.dataEpoch as string) &&
    !ids.includes(record.workerEpoch as string) &&
    safeTimestamp(record.issuedAtMs) &&
    safeTimestamp(record.expiresAtMs) &&
    Number(record.expiresAtMs) > Number(record.issuedAtMs) &&
    Number(record.expiresAtMs) - Number(record.issuedAtMs) <= SETTINGS_ACTIVATION_MAX_LIFETIME_MS
    ? {
        version: 1,
        dataEpoch: record.dataEpoch,
        workerEpoch: record.workerEpoch,
        mutationId: record.mutationId as string,
        permissionCheckId: record.permissionCheckId as string,
        activationId: record.activationId as string,
        storageReservationId: record.storageReservationId as string,
        issuedAtMs: Number(record.issuedAtMs),
        expiresAtMs: Number(record.expiresAtMs),
      }
    : null;
}

function sameToken(left: SettingsActivationTokenV1, right: SettingsActivationTokenV1): boolean {
  return TOKEN_KEYS.every((key) => left[key] === right[key]);
}

function readClock(nowMs: () => number): number {
  let observed: unknown;
  try {
    observed = nowMs();
  } catch {
    throw new SettingsActivationRegistryError(
      'invalid_clock',
      'Settings activation clock threw before returning an exact timestamp.'
    );
  }
  if (!safeTimestamp(observed)) {
    throw new SettingsActivationRegistryError(
      'invalid_clock',
      'Settings activation clock returned an invalid timestamp.'
    );
  }
  return observed;
}

export function createSettingsActivationRegistry(
  rawDependencies: SettingsActivationRegistryDependencies
): SettingsActivationRegistry {
  const dependencies = readStrictJsonRecord(rawDependencies, [
    'dataEpoch',
    'workerEpoch',
    'nowMs',
    'allocateResultId',
  ]);
  if (
    dependencies === null ||
    !isUuidV4(dependencies.dataEpoch) ||
    !isUuidV4(dependencies.workerEpoch) ||
    dependencies.dataEpoch === dependencies.workerEpoch ||
    typeof dependencies.nowMs !== 'function' ||
    typeof dependencies.allocateResultId !== 'function'
  ) {
    throw new SettingsActivationRegistryError(
      'invalid_configuration',
      'Settings activation registry dependencies are invalid.'
    );
  }
  const dataEpoch = dependencies.dataEpoch;
  const workerEpoch = dependencies.workerEpoch;
  const nowMs = dependencies.nowMs as () => number;
  const allocateResultId = dependencies.allocateResultId as () => string;
  const issued = new Map<string, SettingsActivationTokenV1>();
  const observedActivationIds = new Set<string>();
  const retainedIdentityIds = new Set<string>([dataEpoch, workerEpoch]);
  const resultIds = new Set<string>();

  const allocateFreshResultId = (token: SettingsActivationTokenV1): string => {
    let resultId: unknown;
    try {
      resultId = allocateResultId();
    } catch {
      throw new SettingsActivationRegistryError(
        'result_identity_invalid',
        'Settings activation result allocator threw.'
      );
    }
    const forbidden = new Set([
      dataEpoch,
      workerEpoch,
      ...identityTuple(token),
      ...retainedIdentityIds,
      ...resultIds,
    ]);
    if (!isUuidV4(resultId) || forbidden.has(resultId)) {
      throw new SettingsActivationRegistryError(
        'result_identity_invalid',
        'Settings activation result allocator returned an invalid or reused identity.'
      );
    }
    resultIds.add(resultId);
    return resultId;
  };

  return Object.freeze({
    issue(rawIssue: SettingsActivationIssueV1): SettingsActivationTokenV1 {
      if (issued.size >= MAX_SETTINGS_HANDLED_ACTIVATIONS_PER_WORKER) {
        throw new SettingsActivationRegistryError(
          'capacity_exhausted',
          'Settings activation registry capacity is exhausted for this worker.'
        );
      }
      const issue = parseIssue(rawIssue, dataEpoch, workerEpoch);
      if (issue === null) {
        throw new SettingsActivationRegistryError(
          'invalid_issue',
          'Settings activation issue descriptor is invalid.'
        );
      }
      if (identityTuple(issue).some((id) => retainedIdentityIds.has(id))) {
        throw new SettingsActivationRegistryError(
          'activation_reused',
          'A Settings activation tuple identity has already been retained by this worker.'
        );
      }
      const issuedAtMs = readClock(nowMs);
      if (issuedAtMs > Number.MAX_SAFE_INTEGER - issue.ttlMs) {
        throw new SettingsActivationRegistryError(
          'invalid_clock',
          'Settings activation expiry would overflow the safe integer range.'
        );
      }
      const token = Object.freeze({
        version: 1 as const,
        dataEpoch,
        workerEpoch,
        mutationId: issue.mutationId,
        permissionCheckId: issue.permissionCheckId,
        activationId: issue.activationId,
        storageReservationId: issue.storageReservationId,
        issuedAtMs,
        expiresAtMs: issuedAtMs + issue.ttlMs,
      });
      issued.set(token.activationId, token);
      identityTuple(token).forEach((id) => retainedIdentityIds.add(id));
      return token;
    },

    consume(rawToken: unknown): SettingsActivationRegistryResultV1 {
      if (resultIds.size >= MAX_SETTINGS_HANDLED_ACTIVATIONS_PER_WORKER) {
        throw new SettingsActivationRegistryError(
          'capacity_exhausted',
          'Settings activation result capacity is exhausted for this worker.'
        );
      }
      const token = parseToken(rawToken);
      if (token === null) {
        throw new SettingsActivationRegistryError(
          'invalid_token',
          'Settings activation token descriptor is invalid.'
        );
      }
      const observedAtMs = readClock(nowMs);
      if (observedAtMs < token.issuedAtMs) {
        throw new SettingsActivationRegistryError(
          'invalid_clock',
          'Settings activation clock moved behind the token issuance time.'
        );
      }
      const registered = issued.get(token.activationId);
      const replayed = observedActivationIds.has(token.activationId);
      observedActivationIds.add(token.activationId);
      const resultId = allocateFreshResultId(token);
      identityTuple(token).forEach((id) => retainedIdentityIds.add(id));
      const base = {
        version: 1 as const,
        dataEpoch,
        workerEpoch,
        mutationId: token.mutationId,
        permissionCheckId: token.permissionCheckId,
        activationId: token.activationId,
        storageReservationId: token.storageReservationId,
        issuedAtMs: token.issuedAtMs,
        expiresAtMs: token.expiresAtMs,
        observedAtMs,
        resultId,
      };
      if (!replayed && registered !== undefined && sameToken(registered, token)) {
        if (observedAtMs <= token.expiresAtMs) {
          return Object.freeze({
            ...base,
            kind: 'SETTINGS_ACTIVATION_CONSUMED' as const,
            oneShotConsumed: true as const,
          });
        }
        return Object.freeze({
          ...base,
          kind: 'SETTINGS_ACTIVATION_REJECTED' as const,
          reason: 'expired' as const,
        });
      }
      return Object.freeze({
        ...base,
        kind: 'SETTINGS_ACTIVATION_REJECTED' as const,
        reason: replayed ? ('replayed' as const) : ('crossed' as const),
      });
    },
  });
}
