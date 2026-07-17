import { describe, expect, it } from 'vitest';

import { sha256Hex } from '../../../scripts/release-readiness/contracts';
import {
  GLOBAL_REPLAY_REGISTRY_LIMITS,
  appendGlobalReplayRecords,
  computeReplayRegistrySha256,
  createEmptyGlobalReplayRegistry,
  parseGlobalReplayRegistry,
  type GlobalReplayRecordV1,
} from '../../../scripts/release-readiness/replay-registry';

function record(input: {
  readonly kind: 'authorization' | 'external_receipt';
  readonly suffix: string;
  readonly sequence: number;
  readonly target?: string;
  readonly issuerId?: string;
}): GlobalReplayRecordV1 {
  const target = input.target ?? `target-${input.suffix}`;
  return {
    kind: input.kind,
    provider:
      input.kind === 'authorization' ? 'missionpulse_release_authority' : 'chrome_web_store_api',
    issuerId: input.issuerId ?? `${input.kind}-issuer`,
    issuerKeyId: 'key-1',
    providerOperationId: input.kind === 'authorization' ? null : `operation-${input.suffix}`,
    nonceSha256: sha256Hex(`nonce-${input.kind}-${input.suffix}`),
    receiptId: `receipt-${input.kind}-${input.suffix}`,
    action: input.kind === 'authorization' ? 'ingest_submission' : 'submission',
    issuerSequence: input.sequence,
    canonicalEnvelopeSha256: sha256Hex(`envelope-${input.kind}-${input.suffix}`),
    authorizedPayloadSha256: sha256Hex(target),
    releaseId: 'release-1',
    artifactId: 'artifact-1',
  };
}

describe('global release replay registry', () => {
  it('atomically consumes one authorization+external pair under a single revision CAS', () => {
    const empty = createEmptyGlobalReplayRegistry();
    const target = 'submission-target';
    const authorization = record({
      kind: 'authorization',
      suffix: 'authorization-1',
      sequence: 1,
      target,
    });
    const external = record({
      kind: 'external_receipt',
      suffix: 'external-1',
      sequence: 1,
      target,
    });
    const result = appendGlobalReplayRecords(empty, 0, [authorization, external]);

    expect(result).toMatchObject({ ok: true, registry: { revision: 1 } });
    if (!result.ok) {
      throw new Error(result.code);
    }
    expect(result.registry.tuples).toHaveLength(2);
    expect(result.registry.tuples.flatMap((tuple) => tuple.consumed)).toHaveLength(2);
    expect(parseGlobalReplayRegistry(result.registry)).toEqual(result.registry);
    expect(appendGlobalReplayRecords(result.registry, 0, [authorization])).toEqual({
      ok: false,
      code: 'GLOBAL_REPLAY_CAS_CONFLICT',
    });
  });

  it.each(['nonce', 'receipt', 'envelope', 'target'] as const)(
    'rejects globally reused %s authority without mutating the registry',
    (identity) => {
      const first = record({ kind: 'authorization', suffix: 'first', sequence: 1 });
      const accepted = appendGlobalReplayRecords(createEmptyGlobalReplayRegistry(), 0, [first]);
      if (!accepted.ok) {
        throw new Error(accepted.code);
      }
      const secondBase = record({ kind: 'authorization', suffix: 'second', sequence: 2 });
      const second = {
        ...secondBase,
        ...(identity === 'nonce' ? { nonceSha256: first.nonceSha256 } : {}),
        ...(identity === 'receipt' ? { receiptId: first.receiptId } : {}),
        ...(identity === 'envelope'
          ? { canonicalEnvelopeSha256: first.canonicalEnvelopeSha256 }
          : {}),
        ...(identity === 'target'
          ? { authorizedPayloadSha256: first.authorizedPayloadSha256 }
          : {}),
      };

      expect(appendGlobalReplayRecords(accepted.registry, 1, [second])).toEqual({
        ok: false,
        code: 'GLOBAL_REPLAY_DIVERGENT',
      });
      expect(accepted.registry.revision).toBe(1);
    }
  );

  it('fails closed when a fresh tuple would exceed durable tuple capacity', () => {
    const tuples = Array.from({ length: GLOBAL_REPLAY_REGISTRY_LIMITS.maxTuples }, (_, index) => {
      const replayRecord = record({
        kind: 'authorization',
        suffix: `capacity-${index}`,
        sequence: 1,
        issuerId: `issuer-${index}`,
      });
      return {
        provider: replayRecord.provider,
        issuerId: replayRecord.issuerId,
        issuerKeyId: replayRecord.issuerKeyId,
        highestConsumedSequence: 1,
        consumed: [replayRecord],
      };
    }).sort((left, right) =>
      Buffer.compare(
        Buffer.from(`${left.provider}\0${left.issuerId}\0${left.issuerKeyId}`),
        Buffer.from(`${right.provider}\0${right.issuerId}\0${right.issuerKeyId}`)
      )
    );
    const full = {
      schema: 'missionpulse.global-replay-registry' as const,
      version: 1 as const,
      revision: GLOBAL_REPLAY_REGISTRY_LIMITS.maxTuples,
      registrySha256: '',
      tuples,
    };
    full.registrySha256 = computeReplayRegistrySha256(full);
    const parsed = parseGlobalReplayRegistry(full);
    const overflow = record({
      kind: 'authorization',
      suffix: 'overflow',
      sequence: 1,
      issuerId: 'issuer-overflow',
    });

    expect(appendGlobalReplayRecords(parsed, parsed.revision, [overflow])).toEqual({
      ok: false,
      code: 'GLOBAL_REPLAY_CAPACITY_EXHAUSTED',
    });
  });
});
