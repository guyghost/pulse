import { jcsCanonicalize, sha256Jcs, withoutKey } from './canonical';

export type ReplayProtectedProvider = 'missionpulse_release_authority' | 'chrome_web_store_api';

export interface GlobalReplayRecordV1 {
  readonly kind: 'authorization' | 'external_receipt';
  readonly provider: ReplayProtectedProvider;
  readonly issuerId: string;
  readonly issuerKeyId: string;
  readonly providerOperationId: string | null;
  readonly nonceSha256: string;
  readonly receiptId: string;
  readonly action: string;
  readonly issuerSequence: number;
  readonly canonicalEnvelopeSha256: string;
  readonly authorizedPayloadSha256: string;
  readonly releaseId: string;
  readonly artifactId: string;
}

export interface GlobalReplayHighWaterTupleV1 {
  readonly provider: ReplayProtectedProvider;
  readonly issuerId: string;
  readonly issuerKeyId: string;
  readonly highestConsumedSequence: number;
  readonly consumed: readonly GlobalReplayRecordV1[];
}

export interface GlobalReplayRegistryV1 {
  readonly schema: 'missionpulse.global-replay-registry';
  readonly version: 1;
  readonly revision: number;
  readonly registrySha256: string;
  readonly tuples: readonly GlobalReplayHighWaterTupleV1[];
}

export const GLOBAL_REPLAY_REGISTRY_LIMITS = Object.freeze({
  maxTuples: 256,
  maxRecords: 4_096,
});

export type ReplayRegistryAppendFailureCode =
  'GLOBAL_REPLAY_CAS_CONFLICT' | 'GLOBAL_REPLAY_CAPACITY_EXHAUSTED' | 'GLOBAL_REPLAY_DIVERGENT';

const HASH = /^[0-9a-f]{64}$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

function clone<T>(value: T): T {
  return structuredClone(value);
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  return Object.keys(value).sort().join('\0') === [...expected].sort().join('\0');
}

function asObject(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Replay registry value must be an object.');
  }
  return value as Record<string, unknown>;
}

function validId(value: unknown): value is string {
  return typeof value === 'string' && ID.test(value);
}

function tupleKey(value: {
  readonly provider: ReplayProtectedProvider;
  readonly issuerId: string;
  readonly issuerKeyId: string;
}): Buffer {
  return Buffer.from(`${value.provider}\0${value.issuerId}\0${value.issuerKeyId}`, 'utf8');
}

function compareTuples(
  left: Pick<GlobalReplayHighWaterTupleV1, 'provider' | 'issuerId' | 'issuerKeyId'>,
  right: Pick<GlobalReplayHighWaterTupleV1, 'provider' | 'issuerId' | 'issuerKeyId'>
): number {
  return Buffer.compare(tupleKey(left), tupleKey(right));
}

export function computeReplayRegistrySha256(
  registry: Omit<GlobalReplayRegistryV1, 'registrySha256'> | GlobalReplayRegistryV1
): string {
  return sha256Jcs(withoutKey(registry as Record<string, unknown>, 'registrySha256'));
}

export function parseGlobalReplayRecord(value: unknown): GlobalReplayRecordV1 {
  const record = asObject(value);
  if (
    !exactKeys(record, [
      'action',
      'artifactId',
      'authorizedPayloadSha256',
      'canonicalEnvelopeSha256',
      'issuerId',
      'issuerKeyId',
      'issuerSequence',
      'kind',
      'nonceSha256',
      'provider',
      'providerOperationId',
      'receiptId',
      'releaseId',
    ]) ||
    (record.kind !== 'authorization' && record.kind !== 'external_receipt') ||
    (record.provider !== 'missionpulse_release_authority' &&
      record.provider !== 'chrome_web_store_api') ||
    !validId(record.issuerId) ||
    !validId(record.issuerKeyId) ||
    !validId(record.receiptId) ||
    !validId(record.releaseId) ||
    !validId(record.artifactId) ||
    !validId(record.action) ||
    typeof record.issuerSequence !== 'number' ||
    !Number.isSafeInteger(record.issuerSequence) ||
    record.issuerSequence <= 0 ||
    typeof record.nonceSha256 !== 'string' ||
    !HASH.test(record.nonceSha256) ||
    typeof record.canonicalEnvelopeSha256 !== 'string' ||
    !HASH.test(record.canonicalEnvelopeSha256) ||
    typeof record.authorizedPayloadSha256 !== 'string' ||
    !HASH.test(record.authorizedPayloadSha256)
  ) {
    throw new Error('Global replay record is invalid.');
  }
  if (
    (record.kind === 'authorization' &&
      (record.provider !== 'missionpulse_release_authority' ||
        record.providerOperationId !== null)) ||
    (record.kind === 'external_receipt' &&
      (record.provider !== 'chrome_web_store_api' || !validId(record.providerOperationId)))
  ) {
    throw new Error('Global replay record kind/provider binding is invalid.');
  }
  jcsCanonicalize(record);
  return clone(record as unknown as GlobalReplayRecordV1);
}

function validateGlobalUniqueness(records: readonly GlobalReplayRecordV1[]): void {
  const operationIds = new Set<string>();
  const nonces = new Set<string>();
  const receiptIds = new Set<string>();
  const envelopes = new Set<string>();
  const targets = new Map<string, GlobalReplayRecordV1[]>();
  for (const record of records) {
    if (record.providerOperationId !== null) {
      const operationKey = `${record.provider}\0${record.providerOperationId}`;
      if (operationIds.has(operationKey)) {
        throw new Error('Global replay provider operation is reused.');
      }
      operationIds.add(operationKey);
    }
    for (const [set, value] of [
      [nonces, record.nonceSha256],
      [receiptIds, record.receiptId],
      [envelopes, record.canonicalEnvelopeSha256],
    ] as const) {
      if (set.has(value)) {
        throw new Error('Global replay identity is reused.');
      }
      set.add(value);
    }
    const sameTarget = targets.get(record.authorizedPayloadSha256) ?? [];
    sameTarget.push(record);
    targets.set(record.authorizedPayloadSha256, sameTarget);
  }
  for (const sameTarget of targets.values()) {
    if (
      sameTarget.length > 2 ||
      (sameTarget.length === 2 &&
        (!sameTarget.some((record) => record.kind === 'authorization') ||
          !sameTarget.some((record) => record.kind === 'external_receipt') ||
          sameTarget[0]?.releaseId !== sameTarget[1]?.releaseId ||
          sameTarget[0]?.artifactId !== sameTarget[1]?.artifactId))
    ) {
      throw new Error('Global replay authorization target is reused.');
    }
  }
}

export function parseGlobalReplayRegistry(value: unknown): GlobalReplayRegistryV1 {
  const registry = asObject(value);
  if (
    !exactKeys(registry, ['registrySha256', 'revision', 'schema', 'tuples', 'version']) ||
    registry.schema !== 'missionpulse.global-replay-registry' ||
    registry.version !== 1 ||
    typeof registry.revision !== 'number' ||
    !Number.isSafeInteger(registry.revision) ||
    registry.revision < 0 ||
    typeof registry.registrySha256 !== 'string' ||
    !HASH.test(registry.registrySha256) ||
    !Array.isArray(registry.tuples) ||
    registry.tuples.length > GLOBAL_REPLAY_REGISTRY_LIMITS.maxTuples
  ) {
    throw new Error('Global replay registry envelope is invalid.');
  }
  const tuples: GlobalReplayHighWaterTupleV1[] = registry.tuples.map((rawTuple) => {
    const tuple = asObject(rawTuple);
    if (
      !exactKeys(tuple, [
        'consumed',
        'highestConsumedSequence',
        'issuerId',
        'issuerKeyId',
        'provider',
      ]) ||
      (tuple.provider !== 'missionpulse_release_authority' &&
        tuple.provider !== 'chrome_web_store_api') ||
      !validId(tuple.issuerId) ||
      !validId(tuple.issuerKeyId) ||
      typeof tuple.highestConsumedSequence !== 'number' ||
      !Number.isSafeInteger(tuple.highestConsumedSequence) ||
      tuple.highestConsumedSequence <= 0 ||
      !Array.isArray(tuple.consumed) ||
      tuple.consumed.length === 0
    ) {
      throw new Error('Global replay tuple is invalid.');
    }
    const consumed = tuple.consumed.map(parseGlobalReplayRecord);
    if (
      consumed.some(
        (record) =>
          record.provider !== tuple.provider ||
          record.issuerId !== tuple.issuerId ||
          record.issuerKeyId !== tuple.issuerKeyId
      ) ||
      consumed.some(
        (record, index) =>
          index > 0 &&
          record.issuerSequence <= (consumed[index - 1]?.issuerSequence ?? Number.NEGATIVE_INFINITY)
      ) ||
      consumed.at(-1)?.issuerSequence !== tuple.highestConsumedSequence
    ) {
      throw new Error('Global replay tuple history is invalid.');
    }
    return {
      provider: tuple.provider,
      issuerId: tuple.issuerId,
      issuerKeyId: tuple.issuerKeyId,
      highestConsumedSequence: tuple.highestConsumedSequence,
      consumed,
    };
  });
  if (
    tuples.some(
      (tuple, index) => index > 0 && compareTuples(tuples[index - 1] ?? tuple, tuple) >= 0
    )
  ) {
    throw new Error('Global replay tuples are not canonically ordered.');
  }
  const allRecords = tuples.flatMap((tuple) => tuple.consumed);
  if (allRecords.length > GLOBAL_REPLAY_REGISTRY_LIMITS.maxRecords) {
    throw new Error('Global replay registry record capacity is exceeded.');
  }
  validateGlobalUniqueness(allRecords);
  const parsed = {
    schema: 'missionpulse.global-replay-registry' as const,
    version: 1 as const,
    revision: registry.revision,
    registrySha256: registry.registrySha256,
    tuples,
  };
  if (computeReplayRegistrySha256(parsed) !== parsed.registrySha256) {
    throw new Error('Global replay registry digest mismatches.');
  }
  return clone(parsed);
}

export function createEmptyGlobalReplayRegistry(): GlobalReplayRegistryV1 {
  const registry = {
    schema: 'missionpulse.global-replay-registry' as const,
    version: 1 as const,
    revision: 0,
    registrySha256: '',
    tuples: [] as GlobalReplayHighWaterTupleV1[],
  };
  registry.registrySha256 = computeReplayRegistrySha256(registry);
  return parseGlobalReplayRegistry(registry);
}

export function appendGlobalReplayRecords(
  currentValue: unknown,
  expectedRevision: number,
  rawRecords: readonly GlobalReplayRecordV1[]
):
  | { readonly ok: true; readonly registry: GlobalReplayRegistryV1 }
  | { readonly ok: false; readonly code: ReplayRegistryAppendFailureCode } {
  let current: GlobalReplayRegistryV1;
  let records: GlobalReplayRecordV1[];
  try {
    current = parseGlobalReplayRegistry(currentValue);
    records = rawRecords.map(parseGlobalReplayRecord);
  } catch {
    return { ok: false, code: 'GLOBAL_REPLAY_DIVERGENT' };
  }
  if (current.revision !== expectedRevision) {
    return { ok: false, code: 'GLOBAL_REPLAY_CAS_CONFLICT' };
  }
  if (records.length < 1 || records.length > 2) {
    return { ok: false, code: 'GLOBAL_REPLAY_DIVERGENT' };
  }
  const existingRecords = current.tuples.flatMap((tuple) => tuple.consumed);
  const existingTargetDigests = new Set(
    existingRecords.map((record) => record.authorizedPayloadSha256)
  );
  if (records.some((record) => existingTargetDigests.has(record.authorizedPayloadSha256))) {
    return { ok: false, code: 'GLOBAL_REPLAY_DIVERGENT' };
  }
  try {
    validateGlobalUniqueness([...existingRecords, ...records]);
  } catch {
    return { ok: false, code: 'GLOBAL_REPLAY_DIVERGENT' };
  }
  if (existingRecords.length + records.length > GLOBAL_REPLAY_REGISTRY_LIMITS.maxRecords) {
    return { ok: false, code: 'GLOBAL_REPLAY_CAPACITY_EXHAUSTED' };
  }
  const tuples = current.tuples.map(clone);
  for (const record of records) {
    let tuple = tuples.find(
      (candidate) =>
        candidate.provider === record.provider &&
        candidate.issuerId === record.issuerId &&
        candidate.issuerKeyId === record.issuerKeyId
    );
    if (tuple === undefined) {
      if (tuples.length >= GLOBAL_REPLAY_REGISTRY_LIMITS.maxTuples) {
        return { ok: false, code: 'GLOBAL_REPLAY_CAPACITY_EXHAUSTED' };
      }
      tuple = {
        provider: record.provider,
        issuerId: record.issuerId,
        issuerKeyId: record.issuerKeyId,
        highestConsumedSequence: record.issuerSequence,
        consumed: [record],
      };
      tuples.push(tuple);
      continue;
    }
    if (record.issuerSequence <= tuple.highestConsumedSequence) {
      return { ok: false, code: 'GLOBAL_REPLAY_DIVERGENT' };
    }
    const consumed = [...tuple.consumed, record];
    const updatedTuple = {
      ...tuple,
      highestConsumedSequence: record.issuerSequence,
      consumed,
    };
    const tupleIndex = tuples.findIndex(
      (candidate) =>
        candidate.provider === updatedTuple.provider &&
        candidate.issuerId === updatedTuple.issuerId &&
        candidate.issuerKeyId === updatedTuple.issuerKeyId
    );
    tuples[tupleIndex] = updatedTuple;
  }
  tuples.sort(compareTuples);
  const next = {
    schema: 'missionpulse.global-replay-registry' as const,
    version: 1 as const,
    revision: current.revision + 1,
    registrySha256: '',
    tuples,
  };
  next.registrySha256 = computeReplayRegistrySha256(next);
  try {
    return { ok: true, registry: parseGlobalReplayRegistry(next) };
  } catch {
    return { ok: false, code: 'GLOBAL_REPLAY_DIVERGENT' };
  }
}
