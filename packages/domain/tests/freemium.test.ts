import { createActor, type AnyStateMachine } from 'xstate';
import { describe, expect, it } from 'vitest';
import {
  PREMIUM_YEARLY_OFFER,
  addPlatformAccountMachine,
  applicationFormAssistMachine,
  applyEntitlementLossToBindings,
  billingWebhookEventMachine,
  canAddPlatformBinding,
  canApplySuggestion,
  canUsePremiumFeature,
  compareEntitlementSourceVersion,
  createFreeEntitlement,
  filterAllowedFormFields,
  extensionAccountLinkMachine,
  premiumCheckoutMachine,
  reduceEntitlement,
  switchPlatformAccountMachine,
  type EntitlementSignal,
  type EntitlementSnapshot,
  type PlatformAccountBinding,
} from '../src';

const version = (providerUpdatedAt: string, eventPriority: number, providerEventId: string) => ({
  providerUpdatedAt,
  eventPriority,
  providerEventId,
});

const freeSnapshot = (): EntitlementSnapshot =>
  createFreeEntitlement({
    accountId: 'account-1',
    sourceVersion: version('2026-07-30T10:00:00.000Z', 0, 'evt-0'),
    issuedAtMs: 100,
    cacheExpiresAtMs: 10_000,
  });

const signal = (
  type: EntitlementSignal['type'],
  overrides: Partial<EntitlementSignal> = {}
): EntitlementSignal => ({
  type,
  accountId: 'account-1',
  sourceSubscriptionId: 'subscription-1',
  validFromMs: 1_000,
  validUntilMs: 20_000,
  sourceVersion: version('2026-07-30T11:00:00.000Z', 10, `evt-${type}`),
  issuedAtMs: 1_000,
  cacheExpiresAtMs: 15_000,
  ...overrides,
});

function runMachine(machine: AnyStateMachine, events: readonly string[]): string {
  const actor = createActor(machine);
  actor.start();
  for (const event of events) {
    actor.send({ type: event });
  }
  const value = actor.getSnapshot().value;
  actor.stop();
  return String(value);
}

describe('freemium offer', () => {
  it('keeps the only Premium price explicit and tax included', () => {
    expect(PREMIUM_YEARLY_OFFER).toMatchObject({
      amountMinor: 1000,
      currency: 'EUR',
      interval: 'year',
      intervalCount: 1,
      taxIncluded: true,
    });
    expect(PREMIUM_YEARLY_OFFER.features).toEqual([
      'multi_account',
      'application_form_ai_assistance',
    ]);
  });
});

describe('entitlement reducer', () => {
  it('activates, schedules cancellation and resumes deterministically', () => {
    const activated = reduceEntitlement(freeSnapshot(), signal('SUBSCRIPTION_ACTIVATED'));
    expect(activated.ok && activated.decision).toBe('applied');
    if (!activated.ok) {
      throw new Error('expected activation');
    }
    expect(activated.snapshot.status).toBe('premium_active');

    const cancelled = reduceEntitlement(
      activated.snapshot,
      signal('CANCELLATION_SCHEDULED', {
        sourceVersion: version('2026-07-30T12:00:00.000Z', 20, 'evt-cancel'),
      })
    );
    expect(cancelled.ok && cancelled.snapshot.status).toBe('premium_cancel_at_period_end');
    if (!cancelled.ok) {
      throw new Error('expected scheduled cancellation');
    }

    const resumed = reduceEntitlement(
      cancelled.snapshot,
      signal('SUBSCRIPTION_RESUMED', {
        sourceVersion: version('2026-07-30T13:00:00.000Z', 30, 'evt-resume'),
      })
    );
    expect(resumed.ok && resumed.snapshot.status).toBe('premium_active');
  });

  it('ignores duplicate and out-of-order events', () => {
    const current = freeSnapshot();
    const stale = reduceEntitlement(
      current,
      signal('SUBSCRIPTION_ACTIVATED', {
        sourceVersion: version('2026-07-30T09:00:00.000Z', 99, 'evt-old'),
      })
    );

    expect(stale).toEqual({ ok: true, decision: 'ignored_stale', snapshot: current });
  });

  it('rejects account mismatch, missing subscription and missing period end', () => {
    expect(
      reduceEntitlement(
        freeSnapshot(),
        signal('SUBSCRIPTION_ACTIVATED', { accountId: 'other-account' })
      )
    ).toEqual({ ok: false, error: 'ACCOUNT_MISMATCH' });

    expect(
      reduceEntitlement(
        freeSnapshot(),
        signal('SUBSCRIPTION_ACTIVATED', { sourceSubscriptionId: null })
      )
    ).toEqual({ ok: false, error: 'MISSING_SUBSCRIPTION' });

    expect(
      reduceEntitlement(freeSnapshot(), signal('SUBSCRIPTION_ACTIVATED', { validUntilMs: null }))
    ).toEqual({ ok: false, error: 'MISSING_VALID_UNTIL' });
  });

  it('orders source versions with the documented stable tuple', () => {
    expect(
      compareEntitlementSourceVersion(
        version('2026-07-30T10:00:00.000Z', 1, 'evt-b'),
        version('2026-07-30T10:00:00.000Z', 1, 'evt-a')
      )
    ).toBeGreaterThan(0);
    expect(
      compareEntitlementSourceVersion(
        version('2026-07-30T10:00:00.000Z', 2, 'evt-a'),
        version('2026-07-30T10:00:00.000Z', 1, 'evt-z')
      )
    ).toBeGreaterThan(0);
  });
});

describe('premium access invariants', () => {
  const activeSnapshot = (): EntitlementSnapshot => ({
    ...freeSnapshot(),
    planId: 'premium_yearly',
    status: 'premium_active',
    features: PREMIUM_YEARLY_OFFER.features,
    sourceSubscriptionId: 'subscription-1',
    validFromMs: 1_000,
    validUntilMs: 20_000,
    cacheExpiresAtMs: 15_000,
  });

  it('requires the active account, matching identity, valid period and fresh cache', () => {
    expect(
      canUsePremiumFeature({
        snapshot: activeSnapshot(),
        accountState: 'active',
        accountId: 'account-1',
        feature: 'multi_account',
        nowMs: 10_000,
      })
    ).toBe(true);

    for (const denied of [
      { accountState: 'suspended' as const, accountId: 'account-1', nowMs: 10_000 },
      { accountState: 'active' as const, accountId: 'other', nowMs: 10_000 },
      { accountState: 'active' as const, accountId: 'account-1', nowMs: 15_000 },
    ]) {
      expect(
        canUsePremiumFeature({
          snapshot: activeSnapshot(),
          feature: 'multi_account',
          ...denied,
        })
      ).toBe(false);
    }
  });

  it('never grants access when validUntil is missing', () => {
    expect(
      canUsePremiumFeature({
        snapshot: { ...activeSnapshot(), validUntilMs: null },
        accountState: 'active',
        accountId: 'account-1',
        feature: 'application_form_ai_assistance',
        nowMs: 10_000,
      })
    ).toBe(false);
  });
});

describe('binding rules', () => {
  it('allows one free binding and requires Premium for the next one', () => {
    expect(
      canAddPlatformBinding({
        accountState: 'active',
        usableBindingCount: 0,
        hasPremium: false,
        premiumMaxBindingsPerConnector: 2,
      })
    ).toBe('allowed');
    expect(
      canAddPlatformBinding({
        accountState: 'active',
        usableBindingCount: 1,
        hasPremium: false,
        premiumMaxBindingsPerConnector: 2,
      })
    ).toBe('premium_required');
    expect(
      canAddPlatformBinding({
        accountState: 'active',
        usableBindingCount: 2,
        hasPremium: true,
        premiumMaxBindingsPerConnector: 2,
      })
    ).toBe('limit_reached');
  });

  it('locks non-active bindings on downgrade without deleting data', () => {
    const bindings: PlatformAccountBinding[] = [
      {
        id: 'active',
        accountId: 'account-1',
        connectorId: 'free-work',
        externalAccountKeyHash: 'hash-a',
        displayLabel: 'Compte A',
        status: 'ready',
        isActive: true,
        createdAtMs: 1,
        revision: 1,
      },
      {
        id: 'secondary',
        accountId: 'account-1',
        connectorId: 'free-work',
        externalAccountKeyHash: 'hash-b',
        displayLabel: 'Compte B',
        status: 'ready',
        isActive: false,
        createdAtMs: 2,
        revision: 1,
      },
    ];

    expect(applyEntitlementLossToBindings(bindings)).toEqual([
      bindings[0],
      { ...bindings[1], status: 'locked_by_entitlement', revision: 2 },
    ]);
  });
});

describe('form suggestion policy', () => {
  it('removes sensitive fields before the AI worker receives them', () => {
    expect(
      filterAllowedFormFields([
        {
          fieldId: 'motivation',
          kind: 'textarea',
          label: 'Pourquoi cette mission ?',
          value: '',
          autocomplete: null,
        },
        {
          fieldId: 'work_authorization',
          kind: 'select',
          label: 'Autorisation de travail',
          value: '',
          autocomplete: null,
        },
        {
          fieldId: 'password',
          kind: 'text',
          label: 'Mot de passe',
          value: '',
          autocomplete: 'current-password',
        },
      ])
    ).toHaveLength(1);
  });

  it('applies only an explicitly approved suggestion targeting an allowed field', () => {
    const suggestion = {
      suggestionId: 's-1',
      fieldId: 'motivation',
      proposedValue: 'Proposition',
      confidence: 0.9,
      rationale: 'Profil',
      sourceRefs: ['profile.summary'],
    };

    expect(
      canApplySuggestion({ suggestion, decision: 'approved', allowedFieldIds: ['motivation'] })
    ).toBe(true);
    expect(
      canApplySuggestion({ suggestion, decision: 'pending', allowedFieldIds: ['motivation'] })
    ).toBe(false);
    expect(
      canApplySuggestion({ suggestion, decision: 'approved', allowedFieldIds: ['other'] })
    ).toBe(false);
  });
});

describe('XState workflow transitions', () => {
  it('completes the checkout only after verified payment and provisioning', () => {
    expect(
      runMachine(premiumCheckoutMachine, [
        'START_CHECKOUT',
        'CHECKOUT_CREATED',
        'RETURN_FROM_PROVIDER',
        'VERIFIED_PAYMENT_LINKED',
        'BEGIN_PROVISIONING',
        'ENTITLEMENT_COMMITTED',
      ])
    ).toBe('provisioned');
  });

  it('keeps forbidden checkout events from skipping payment', () => {
    expect(
      runMachine(premiumCheckoutMachine, [
        'START_CHECKOUT',
        'CHECKOUT_CREATED',
        'ENTITLEMENT_COMMITTED',
      ])
    ).toBe('awaiting_payment');
  });

  it('supports explicit webhook retry and duplicate terminal handling', () => {
    expect(
      runMachine(billingWebhookEventMachine, [
        'VERIFY_SIGNATURE',
        'SIGNATURE_VALID',
        'EVENT_RESERVED',
        'EVENT_MAPPED',
        'APPLY_FAILED_RETRYABLE',
        'RETRY_EVENT',
        'APPLY_SUCCEEDED',
      ])
    ).toBe('applied_terminal');
    expect(
      runMachine(billingWebhookEventMachine, [
        'VERIFY_SIGNATURE',
        'SIGNATURE_VALID',
        'EVENT_ALREADY_APPLIED',
      ])
    ).toBe('duplicate_terminal');
  });

  it('links an extension only after explicit account approval', () => {
    expect(
      runMachine(extensionAccountLinkMachine, [
        'LINK_REQUESTED',
        'LINK_CREATED',
        'POLL_PENDING',
        'USER_APPROVED',
        'ENTITLEMENT_REFRESHED',
      ])
    ).toBe('linked');
    expect(
      runMachine(extensionAccountLinkMachine, [
        'LINK_REQUESTED',
        'LINK_CREATED',
        'ENTITLEMENT_REFRESHED',
      ])
    ).toBe('awaiting_user_approval');
  });

  it('enforces permission and Premium terminals for account bindings', () => {
    expect(
      runMachine(addPlatformAccountMachine, [
        'ADD_REQUESTED',
        'PERMISSION_MISSING',
        'REQUEST_PERMISSION',
        'PERMISSION_DENIED',
      ])
    ).toBe('permission_denied_terminal');
    expect(runMachine(addPlatformAccountMachine, ['ADD_REQUESTED', 'ACCESS_DENIED_PREMIUM'])).toBe(
      'premium_required_terminal'
    );
  });

  it('keeps a switch pending until the browser session matches', () => {
    expect(
      runMachine(switchPlatformAccountMachine, [
        'SWITCH_REQUESTED',
        'SESSION_MISMATCH',
        'RETRY_SESSION_CHECK',
        'SESSION_MATCHES_TARGET',
        'SWITCH_COMMITTED',
      ])
    ).toBe('completed_terminal');
  });

  it('never lets AI output skip the review and freshness states', () => {
    expect(
      runMachine(applicationFormAssistMachine, [
        'ASSIST_REQUESTED',
        'CONSENT_APPROVED',
        'ACCESS_READY',
        'CAPTURE_SUCCEEDED',
        'SUGGESTIONS_VALIDATED',
        'APPLY_SUCCEEDED',
      ])
    ).toBe('reviewing');
  });

  it('requires explicit form-assistance consent before access checks', () => {
    expect(runMachine(applicationFormAssistMachine, ['ASSIST_REQUESTED', 'ACCESS_READY'])).toBe(
      'awaiting_consent'
    );
    expect(runMachine(applicationFormAssistMachine, ['ASSIST_REQUESTED', 'CONSENT_REFUSED'])).toBe(
      'consent_refused_terminal'
    );
  });

  it('supports refusal, cancellation, stale form and rollback retry terminals', () => {
    expect(
      runMachine(applicationFormAssistMachine, [
        'ASSIST_REQUESTED',
        'CONSENT_APPROVED',
        'ACCESS_READY',
        'CAPTURE_SUCCEEDED',
        'SUGGESTIONS_VALIDATED',
        'REFUSE_ALL',
      ])
    ).toBe('refused_terminal');

    expect(
      runMachine(applicationFormAssistMachine, [
        'ASSIST_REQUESTED',
        'CONSENT_APPROVED',
        'ACCESS_READY',
        'CAPTURE_SUCCEEDED',
        'SUGGESTIONS_VALIDATED',
        'APPLY_APPROVED_REQUESTED',
        'FORM_CHANGED',
        'RECAPTURE_REQUESTED',
      ])
    ).toBe('capturing');

    expect(
      runMachine(applicationFormAssistMachine, [
        'ASSIST_REQUESTED',
        'CONSENT_APPROVED',
        'ACCESS_READY',
        'CAPTURE_SUCCEEDED',
        'SUGGESTIONS_VALIDATED',
        'APPLY_APPROVED_REQUESTED',
        'FORM_UNCHANGED',
        'APPLY_FAILED_ROLLED_BACK',
        'RETRY_APPLY',
      ])
    ).toBe('checking_freshness');
  });
});
