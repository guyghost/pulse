import { describe, expect, it } from 'vitest';

import { createCopilotEntitlementActor } from '../../../src/lib/shell/copilot/entitlement-actor';

const session = {
  version: 1 as const,
  subject: 'user-1',
  bearer: 'session-bearer-with-enough-length',
};

describe('Copilot entitlement actor adapter', () => {
  it('projects creation authority only from a correlated, fresh active entitlement', () => {
    const actor = createCopilotEntitlementActor();
    const correlationId = actor.prepareSync('request-1', session);
    expect(correlationId).toBe('request-1');
    expect(
      actor.applyEntitlement(
        correlationId!,
        {
          status: 'active',
          subject: 'user-1',
          issuedAtMs: 500,
          expiresAtMs: 2_000,
          creditsRemaining: 4,
        },
        1_000
      )
    ).toBe(true);
    expect(actor.project(1_000)).toMatchObject({ state: 'active', permitsCreation: true });
  });

  it('ignores stale and wrong-subject settlements and fails closed', () => {
    const actor = createCopilotEntitlementActor();
    expect(actor.prepareSync('fresh', session)).toBe('fresh');
    expect(
      actor.applyEntitlement(
        'stale',
        {
          status: 'active',
          subject: 'user-1',
          issuedAtMs: 500,
          expiresAtMs: 2_000,
          creditsRemaining: 4,
        },
        1_000
      )
    ).toBe(false);
    expect(
      actor.applyEntitlement(
        'fresh',
        {
          status: 'active',
          subject: 'other-user',
          issuedAtMs: 500,
          expiresAtMs: 2_000,
          creditsRemaining: 4,
        },
        1_000
      )
    ).toBe(false);
    expect(actor.project(1_000)).toMatchObject({ state: 'checking', permitsCreation: false });
  });

  it.each(['free', 'expired', 'revoked'] as const)(
    'retains identity for recovery in %s while denying creation',
    (status) => {
      const actor = createCopilotEntitlementActor();
      const correlationId = actor.prepareSync(`request-${status}`, session)!;
      expect(
        actor.applyEntitlement(
          correlationId,
          {
            status,
            subject: 'user-1',
            issuedAtMs: null,
            expiresAtMs: null,
            creditsRemaining: 0,
          },
          1_000
        )
      ).toBe(true);
      expect(actor.project(1_000)).toMatchObject({
        state: status,
        hasSessionBearer: true,
        permitsCreation: false,
      });
    }
  );

  it('expires locally without discarding the recovery identity', () => {
    const actor = createCopilotEntitlementActor();
    const correlationId = actor.prepareSync('request-expiry', session)!;
    actor.applyEntitlement(
      correlationId,
      {
        status: 'active',
        subject: 'user-1',
        issuedAtMs: 500,
        expiresAtMs: 2_000,
        creditsRemaining: 4,
      },
      1_000
    );

    expect(actor.project(2_000)).toMatchObject({
      state: 'expired',
      hasSessionBearer: true,
      permitsCreation: false,
    });
  });
});
