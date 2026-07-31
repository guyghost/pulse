import { describe, expect, it, vi } from 'vitest';

import {
  MAX_SETTINGS_HANDLED_ACTIVATIONS_PER_WORKER,
  SETTINGS_ACTIVATION_MAX_LIFETIME_MS,
  type SettingsActivationIssueV1,
} from '../../../src/models/settings-persistence.contract';
import {
  createSettingsActivationRegistry,
  SettingsActivationRegistryError,
} from '../../../src/lib/shell/settings/settings-activation-registry';

const uuid = (suffix: number): string =>
  `94000000-0000-4000-8000-${String(suffix).padStart(12, '0')}`;

const DATA_EPOCH = uuid(1);
const WORKER_EPOCH = uuid(2);

function issue(
  suffix = 10,
  ttlMs = SETTINGS_ACTIVATION_MAX_LIFETIME_MS
): SettingsActivationIssueV1 {
  return {
    version: 1,
    mutationId: uuid(suffix),
    permissionCheckId: uuid(suffix + 1),
    activationId: uuid(suffix + 2),
    storageReservationId: uuid(suffix + 3),
    ttlMs,
  };
}

describe('worker-local Settings activation registry', () => {
  it('issues a frozen epoch-bound token, consumes it once, then returns replayed', () => {
    const times = [1_000, 2_000, 2_100];
    const resultIds = [uuid(100), uuid(101)];
    const registry = createSettingsActivationRegistry({
      dataEpoch: DATA_EPOCH,
      workerEpoch: WORKER_EPOCH,
      nowMs: () => times.shift() as number,
      allocateResultId: () => resultIds.shift() as string,
    });

    const token = registry.issue(issue());
    expect(token).toEqual({
      version: 1,
      dataEpoch: DATA_EPOCH,
      workerEpoch: WORKER_EPOCH,
      mutationId: uuid(10),
      permissionCheckId: uuid(11),
      activationId: uuid(12),
      storageReservationId: uuid(13),
      issuedAtMs: 1_000,
      expiresAtMs: 301_000,
    });
    expect(Object.isFrozen(token)).toBe(true);

    expect(registry.consume(token)).toEqual({
      ...token,
      kind: 'SETTINGS_ACTIVATION_CONSUMED',
      observedAtMs: 2_000,
      resultId: uuid(100),
      oneShotConsumed: true,
    });
    expect(registry.consume(structuredClone(token))).toEqual({
      ...token,
      kind: 'SETTINGS_ACTIVATION_REJECTED',
      observedAtMs: 2_100,
      resultId: uuid(101),
      reason: 'replayed',
    });
  });

  it('burns expired and crossed observations instead of transferring activation authority', () => {
    const now = vi
      .fn<() => number>()
      .mockReturnValueOnce(1_000)
      .mockReturnValueOnce(2_001)
      .mockReturnValueOnce(2_002)
      .mockReturnValueOnce(3_000)
      .mockReturnValueOnce(3_100)
      .mockReturnValueOnce(3_200);
    let resultId = 200;
    const registry = createSettingsActivationRegistry({
      dataEpoch: DATA_EPOCH,
      workerEpoch: WORKER_EPOCH,
      nowMs: now,
      allocateResultId: () => uuid(resultId++),
    });

    const expired = registry.issue(issue(20, 1_000));
    expect(registry.consume(expired)).toMatchObject({
      kind: 'SETTINGS_ACTIVATION_REJECTED',
      reason: 'expired',
    });
    expect(registry.consume(expired)).toMatchObject({
      kind: 'SETTINGS_ACTIVATION_REJECTED',
      reason: 'replayed',
    });

    const crossed = registry.issue(issue(30, 10_000));
    expect(registry.consume({ ...crossed, mutationId: uuid(99) })).toMatchObject({
      activationId: crossed.activationId,
      mutationId: uuid(99),
      kind: 'SETTINGS_ACTIVATION_REJECTED',
      reason: 'crossed',
    });
    expect(registry.consume(crossed)).toMatchObject({
      kind: 'SETTINGS_ACTIVATION_REJECTED',
      reason: 'replayed',
    });
  });

  it('retains exactly 4096 activation attempts without TTL or LRU eviction', () => {
    const registry = createSettingsActivationRegistry({
      dataEpoch: DATA_EPOCH,
      workerEpoch: WORKER_EPOCH,
      nowMs: () => 1_000,
      allocateResultId: () => uuid(90_000),
    });

    for (let index = 0; index < MAX_SETTINGS_HANDLED_ACTIVATIONS_PER_WORKER; index += 1) {
      registry.issue({
        version: 1,
        mutationId: uuid(10_000 + index * 4),
        permissionCheckId: uuid(10_001 + index * 4),
        activationId: uuid(10_002 + index * 4),
        storageReservationId: uuid(10_003 + index * 4),
        ttlMs: 1,
      });
    }

    expect(() => registry.issue(issue(80_000, 1))).toThrowError(
      expect.objectContaining({ code: 'capacity_exhausted' })
    );
  });

  it.each(['mutationId', 'permissionCheckId', 'activationId', 'storageReservationId'] as const)(
    'rejects cross-token reuse of historical %s identities',
    (identityKey) => {
      const registry = createSettingsActivationRegistry({
        dataEpoch: DATA_EPOCH,
        workerEpoch: WORKER_EPOCH,
        nowMs: () => 1_000,
        allocateResultId: () => uuid(700),
      });
      const first = issue(100);
      registry.issue(first);

      expect(() =>
        registry.issue({ ...issue(200), [identityKey]: first[identityKey] })
      ).toThrowError(expect.objectContaining({ code: 'activation_reused' }));
    }
  );

  it('rejects a result ID that reuses any identity from another retained token', () => {
    const first = issue(300);
    const second = issue(400);
    const registry = createSettingsActivationRegistry({
      dataEpoch: DATA_EPOCH,
      workerEpoch: WORKER_EPOCH,
      nowMs: () => 1_000,
      allocateResultId: () => first.mutationId,
    });
    registry.issue(first);
    const secondToken = registry.issue(second);

    expect(() => registry.consume(secondToken)).toThrowError(
      expect.objectContaining({ code: 'result_identity_invalid' })
    );
  });

  it('fails closed on clock rollback before consuming or allocating a result identity', () => {
    const allocateResultId = vi.fn(() => uuid(800));
    const times = [2_000, 1_999, 2_100];
    const registry = createSettingsActivationRegistry({
      dataEpoch: DATA_EPOCH,
      workerEpoch: WORKER_EPOCH,
      nowMs: () => times.shift() as number,
      allocateResultId,
    });
    const token = registry.issue(issue(500));

    expect(() => registry.consume(token)).toThrowError(
      expect.objectContaining({ code: 'invalid_clock' })
    );
    expect(allocateResultId).not.toHaveBeenCalled();
    expect(registry.consume(token)).toMatchObject({
      kind: 'SETTINGS_ACTIVATION_CONSUMED',
      oneShotConsumed: true,
    });
  });

  it('rejects hostile descriptors, invalid clocks and colliding result IDs without getters or fallback', () => {
    const getter = vi.fn(() => uuid(10));
    const hostile = Object.defineProperty({ ...issue() }, 'mutationId', {
      enumerable: true,
      get: getter,
    });
    const registry = createSettingsActivationRegistry({
      dataEpoch: DATA_EPOCH,
      workerEpoch: WORKER_EPOCH,
      nowMs: () => 1_000,
      allocateResultId: () => uuid(42),
    });

    expect(() => registry.issue(hostile)).toThrowError(
      expect.objectContaining({ code: 'invalid_issue' })
    );
    expect(getter).not.toHaveBeenCalled();

    const token = registry.issue(issue(40));
    expect(() => registry.consume(token)).toThrowError(
      expect.objectContaining({ code: 'result_identity_invalid' })
    );

    const invalidClock = createSettingsActivationRegistry({
      dataEpoch: DATA_EPOCH,
      workerEpoch: WORKER_EPOCH,
      nowMs: () => -1,
      allocateResultId: () => uuid(500),
    });
    expect(() => invalidClock.issue(issue(50))).toThrowError(
      expect.objectContaining({ code: 'invalid_clock' })
    );
    expect(SettingsActivationRegistryError).toBeTypeOf('function');
  });
});
