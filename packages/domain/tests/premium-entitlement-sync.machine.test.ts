import { createActor } from 'xstate';
import { describe, expect, it } from 'vitest';

import {
  isUsablePremiumEntitlementSnapshot,
  premiumEntitlementMachine,
  premiumEntitlementPermitsCopilot,
  type PremiumEntitlementError,
} from '../src';

const SUBJECT = 'user-1';
const NOW = 1_000;
const ACTIVE_SNAPSHOT = {
  subject: SUBJECT,
  issuedAtMs: 500,
  expiresAtMs: 2_000,
};

const syncFailure: PremiumEntitlementError = {
  code: 'SYNC_FAILED',
  message: 'offline',
  retryable: true,
};

function actor() {
  const instance = createActor(premiumEntitlementMachine);
  instance.start();
  return instance;
}

function startChecking(requestId = 'request-1') {
  const instance = actor();
  instance.send({ type: 'LINK_REQUESTED', requestId });
  instance.send({ type: 'LINK_SUCCEEDED', requestId, subject: SUBJECT });
  return instance;
}

describe('premium entitlement sync machine', () => {
  it('links, checks server authority and grants access only for a fresh active snapshot', () => {
    const instance = startChecking();
    instance.send({
      type: 'ENTITLEMENT_ACTIVE',
      requestId: 'request-1',
      snapshot: ACTIVE_SNAPSHOT,
      observedAtMs: NOW,
    });

    const snapshot = instance.getSnapshot();
    expect(snapshot.value).toBe('active');
    expect(premiumEntitlementPermitsCopilot('active', snapshot.context, NOW)).toBe(true);
    expect(premiumEntitlementPermitsCopilot('checking', snapshot.context, NOW)).toBe(false);
  });

  it.each([
    ['ENTITLEMENT_FREE', 'free', true],
    ['ENTITLEMENT_EXPIRED', 'expired', true],
    ['ENTITLEMENT_REVOKED', 'revoked', true],
  ] as const)(
    'maps %s to %s while retaining identity for owner recovery',
    (type, state, bearer) => {
      const instance = startChecking();
      instance.send({ type, requestId: 'request-1', subject: SUBJECT });

      expect(instance.getSnapshot().value).toBe(state);
      expect(instance.getSnapshot().context.hasSessionBearer).toBe(bearer);
      expect(instance.getSnapshot().context.snapshot).toBeNull();
    }
  );

  it('covers link cancellation and link failure without retaining authority', () => {
    const cancelled = actor();
    cancelled.send({ type: 'LINK_REQUESTED', requestId: 'cancel' });
    cancelled.send({ type: 'LINK_CANCELLED', requestId: 'cancel' });
    expect(cancelled.getSnapshot().value).toBe('unlinked');

    const failed = actor();
    failed.send({ type: 'LINK_REQUESTED', requestId: 'failed' });
    failed.send({
      type: 'LINK_FAILED',
      requestId: 'failed',
      error: { code: 'LINK_FAILED', message: 'popup denied', retryable: true },
    });
    expect(failed.getSnapshot().value).toBe('error');
    expect(failed.getSnapshot().context.hasSessionBearer).toBe(false);
  });

  it('ignores stale, wrong-subject and malformed entitlement responses', () => {
    const instance = startChecking('fresh');
    instance.send({
      type: 'ENTITLEMENT_ACTIVE',
      requestId: 'stale',
      snapshot: ACTIVE_SNAPSHOT,
      observedAtMs: NOW,
    });
    instance.send({
      type: 'ENTITLEMENT_ACTIVE',
      requestId: 'fresh',
      snapshot: { ...ACTIVE_SNAPSHOT, subject: 'other-user' },
      observedAtMs: NOW,
    });
    instance.send({
      type: 'ENTITLEMENT_ACTIVE',
      requestId: 'fresh',
      snapshot: { ...ACTIVE_SNAPSHOT, expiresAtMs: NOW },
      observedAtMs: NOW,
    });

    expect(instance.getSnapshot().value).toBe('checking');
    expect(instance.getSnapshot().context.snapshot).toBeNull();
  });

  it('fails closed on sync error, then permits only an explicit correlated retry', () => {
    const instance = startChecking();
    instance.send({ type: 'SYNC_FAILED', requestId: 'request-1', error: syncFailure });
    expect(instance.getSnapshot().value).toBe('error');
    expect(premiumEntitlementPermitsCopilot('error', instance.getSnapshot().context, NOW)).toBe(
      false
    );

    instance.send({ type: 'SYNC_REQUESTED', requestId: 'request-2' });
    expect(instance.getSnapshot().value).toBe('checking');
    instance.send({
      type: 'ENTITLEMENT_ACTIVE',
      requestId: 'request-2',
      snapshot: ACTIVE_SNAPSHOT,
      observedAtMs: NOW,
    });
    expect(instance.getSnapshot().value).toBe('active');
  });

  it('clears an invalid session and ignores a late response after unlink', () => {
    const rejected = startChecking();
    rejected.send({
      type: 'SESSION_REJECTED',
      requestId: 'request-1',
      error: { code: 'SESSION_REJECTED', message: 'expired bearer', retryable: false },
    });
    expect(rejected.getSnapshot().value).toBe('unlinked');
    expect(rejected.getSnapshot().context.hasSessionBearer).toBe(false);

    const unlinked = startChecking();
    unlinked.send({ type: 'ENTITLEMENT_FREE', requestId: 'request-1', subject: SUBJECT });
    unlinked.send({ type: 'UNLINK_REQUESTED' });
    unlinked.send({
      type: 'ENTITLEMENT_ACTIVE',
      requestId: 'request-1',
      snapshot: ACTIVE_SNAPSHOT,
      observedAtMs: NOW,
    });
    expect(unlinked.getSnapshot().value).toBe('unlinked');
  });

  it('expires active access locally but never creates or extends access locally', () => {
    const instance = startChecking();
    instance.send({
      type: 'ENTITLEMENT_ACTIVE',
      requestId: 'request-1',
      snapshot: ACTIVE_SNAPSHOT,
      observedAtMs: NOW,
    });
    instance.send({ type: 'LOCAL_EXPIRY_OBSERVED', observedAtMs: 1_999 });
    expect(instance.getSnapshot().value).toBe('active');

    instance.send({ type: 'LOCAL_EXPIRY_OBSERVED', observedAtMs: 2_000 });
    expect(instance.getSnapshot().value).toBe('expired');
    expect(instance.getSnapshot().context.hasSessionBearer).toBe(true);
    expect(instance.getSnapshot().context.snapshot).toBeNull();
  });

  it('allows an expired or revoked projection to resync with its still-valid bearer', () => {
    const instance = startChecking();
    instance.send({ type: 'ENTITLEMENT_EXPIRED', requestId: 'request-1', subject: SUBJECT });
    instance.send({ type: 'SYNC_REQUESTED', requestId: 'request-2' });
    expect(instance.getSnapshot().value).toBe('checking');
  });

  it('validates snapshot time bounds deterministically', () => {
    expect(isUsablePremiumEntitlementSnapshot(ACTIVE_SNAPSHOT, NOW)).toBe(true);
    expect(
      isUsablePremiumEntitlementSnapshot({ ...ACTIVE_SNAPSHOT, issuedAtMs: NOW + 1 }, NOW)
    ).toBe(false);
    expect(isUsablePremiumEntitlementSnapshot({ ...ACTIVE_SNAPSHOT, expiresAtMs: NOW }, NOW)).toBe(
      false
    );
  });
});
