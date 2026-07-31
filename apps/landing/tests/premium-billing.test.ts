import { describe, expect, it, vi } from 'vitest';
import {
  applyPremiumBillingEvent,
  hashWebhookPayload,
  normalizePremiumBillingEvent,
  readSecureCheckoutUrl,
} from '../src/lib/server/premium-billing';
import { readFileSync } from 'node:fs';

const accountId = '11111111-1111-4111-8111-111111111111';
const checkoutAttemptId = '22222222-2222-4222-8222-222222222222';
const providerContract = {
  eventNameHeader: 'subscription_created',
  expectedStoreId: 'store-test',
  expectedVariantId: 'variant-yearly-test',
  expectedTestMode: true,
} as const;

function subscriptionEvent(
  overrides: {
    eventName?: string;
    status?: string;
    endsAt?: string | null;
    renewsAt?: string | null;
  } = {}
) {
  return {
    meta: {
      event_name: overrides.eventName ?? 'subscription_created',
      custom_data: {
        account_id: accountId,
        checkout_attempt_id: checkoutAttemptId,
        offer_id: 'premium_yearly',
      },
    },
    data: {
      id: 'sub-123',
      type: 'subscriptions',
      attributes: {
        status: overrides.status ?? 'active',
        store_id: 'store-test',
        variant_id: 'variant-yearly-test',
        test_mode: true,
        created_at: '2026-07-30T10:00:00.000Z',
        updated_at: '2026-07-30T10:01:00.000Z',
        ends_at: overrides.endsAt === undefined ? null : overrides.endsAt,
        renews_at:
          overrides.renewsAt === undefined ? '2027-07-30T10:00:00.000Z' : overrides.renewsAt,
      },
    },
  };
}

describe('Premium billing normalization', () => {
  it('accepts only an HTTPS checkout URL returned by the provider', () => {
    expect(readSecureCheckoutUrl('https://checkout.example/pulse')).toBe(
      'https://checkout.example/pulse'
    );
    expect(readSecureCheckoutUrl('http://checkout.example/pulse')).toBeNull();
    expect(readSecureCheckoutUrl('javascript:alert(1)')).toBeNull();
    expect(readSecureCheckoutUrl('not a URL')).toBeNull();
    expect(readSecureCheckoutUrl(null)).toBeNull();
  });

  it('maps the fixed yearly offer to an active entitlement signal', () => {
    const payload = subscriptionEvent();
    const raw = JSON.stringify(payload);
    const result = normalizePremiumBillingEvent(
      payload,
      raw,
      Date.parse('2026-07-30T10:02:00Z'),
      providerContract
    );
    expect(result).toMatchObject({
      ok: true,
      event: {
        accountId,
        checkoutAttemptId,
        offerId: 'premium_yearly',
        sourceSubscriptionId: 'sub-123',
        status: 'premium_active',
        signalType: 'SUBSCRIPTION_ACTIVATED',
        validUntil: '2027-07-30T10:00:00.000Z',
      },
    });
  });

  it('is deterministic and idempotent for an identical webhook retry', () => {
    const raw = JSON.stringify(subscriptionEvent());
    expect(hashWebhookPayload(raw)).toBe(hashWebhookPayload(raw));
    const first = normalizePremiumBillingEvent(JSON.parse(raw), raw, 0, providerContract);
    const retry = normalizePremiumBillingEvent(JSON.parse(raw), raw, 0, providerContract);
    expect(first).toEqual(retry);
  });

  it('keeps a scheduled cancellation active only until its provider end date', () => {
    const future = normalizePremiumBillingEvent(
      subscriptionEvent({
        eventName: 'subscription_cancelled',
        status: 'cancelled',
        endsAt: '2027-01-01T00:00:00.000Z',
      }),
      'future-cancel',
      Date.parse('2026-08-01T00:00:00.000Z'),
      { ...providerContract, eventNameHeader: 'subscription_cancelled' }
    );
    const ended = normalizePremiumBillingEvent(
      subscriptionEvent({
        eventName: 'subscription_cancelled',
        status: 'cancelled',
        endsAt: '2026-01-01T00:00:00.000Z',
      }),
      'ended-cancel',
      Date.parse('2026-08-01T00:00:00.000Z'),
      { ...providerContract, eventNameHeader: 'subscription_cancelled' }
    );
    expect(future).toMatchObject({
      ok: true,
      event: { status: 'premium_cancel_at_period_end' },
    });
    expect(ended).toMatchObject({ ok: true, event: { status: 'premium_expired' } });
  });

  it('rejects missing ownership data and missing validity for active Premium', () => {
    const withoutOwnership = subscriptionEvent();
    delete (withoutOwnership.meta.custom_data as Partial<typeof withoutOwnership.meta.custom_data>)
      .checkout_attempt_id;
    expect(normalizePremiumBillingEvent(withoutOwnership, 'invalid', 0, providerContract)).toEqual({
      ok: false,
      error: 'INVALID_PAYLOAD',
    });

    const withoutValidity = subscriptionEvent({ endsAt: null, renewsAt: null });
    expect(
      normalizePremiumBillingEvent(withoutValidity, 'no-validity', 0, providerContract)
    ).toEqual({
      ok: false,
      error: 'MISSING_VALID_UNTIL',
    });
  });

  it('accepts only applied, duplicate and stale RPC outcomes', async () => {
    const normalized = normalizePremiumBillingEvent(
      subscriptionEvent(),
      JSON.stringify(subscriptionEvent()),
      0,
      providerContract
    );
    if (!normalized.ok) {
      throw new Error('fixture should normalize');
    }
    const rpc = vi.fn().mockResolvedValue({ data: 'duplicate', error: null });
    const result = await applyPremiumBillingEvent({ rpc } as never, normalized.event, 24);
    expect(result).toEqual({ ok: true, result: 'duplicate' });
    expect(rpc).toHaveBeenCalledWith(
      'apply_premium_billing_event',
      expect.objectContaining({
        p_user_id: accountId,
        p_checkout_intent_id: checkoutAttemptId,
        p_cache_ttl_hours: 24,
      })
    );
  });

  it('rejects mismatched event headers, store, variant and test mode', () => {
    const payload = subscriptionEvent();
    const raw = JSON.stringify(payload);
    expect(
      normalizePremiumBillingEvent(payload, raw, 0, {
        ...providerContract,
        eventNameHeader: 'subscription_updated',
      })
    ).toEqual({ ok: false, error: 'EVENT_NAME_MISMATCH' });

    for (const contract of [
      { ...providerContract, expectedStoreId: 'other-store' },
      { ...providerContract, expectedVariantId: 'other-variant' },
      { ...providerContract, expectedTestMode: false },
    ]) {
      expect(normalizePremiumBillingEvent(payload, raw, 0, contract)).toEqual({
        ok: false,
        error: 'PROVIDER_CONTRACT_MISMATCH',
      });
    }
  });

  it('keeps paused subscriptions active and ignores invoice-only payment signals', () => {
    const paused = subscriptionEvent({
      eventName: 'subscription_paused',
      status: 'paused',
    });
    expect(
      normalizePremiumBillingEvent(paused, JSON.stringify(paused), 0, {
        ...providerContract,
        eventNameHeader: 'subscription_paused',
      })
    ).toMatchObject({
      ok: true,
      event: { status: 'premium_active', signalType: 'SUBSCRIPTION_ACTIVATED' },
    });

    const invoice = {
      ...subscriptionEvent({ eventName: 'subscription_payment_recovered', status: 'paid' }),
      data: {
        id: 'invoice-1',
        type: 'subscription-invoices',
        attributes: {
          store_id: 'store-test',
          subscription_id: 'sub-123',
          status: 'paid',
          test_mode: true,
          created_at: '2026-07-30T10:00:00.000Z',
          updated_at: '2026-07-30T10:01:00.000Z',
        },
      },
    };
    expect(
      normalizePremiumBillingEvent(invoice, JSON.stringify(invoice), 0, {
        ...providerContract,
        eventNameHeader: 'subscription_payment_recovered',
      })
    ).toEqual({ ok: false, error: 'AUXILIARY_EVENT' });
  });

  it('revokes only a fully refunded Premium order', () => {
    const refund = {
      meta: {
        event_name: 'order_refunded',
        custom_data: {
          account_id: accountId,
          checkout_attempt_id: checkoutAttemptId,
          offer_id: 'premium_yearly',
        },
      },
      data: {
        id: 'order-1',
        type: 'orders',
        attributes: {
          store_id: 'store-test',
          status: 'refunded',
          test_mode: true,
          refunded: true,
          refunded_amount: 1000,
          total: 1000,
          first_order_item: { variant_id: 'variant-yearly-test' },
          created_at: '2026-07-30T10:00:00.000Z',
          updated_at: '2026-07-30T10:01:00.000Z',
        },
      },
    };
    const contract = { ...providerContract, eventNameHeader: 'order_refunded' };
    expect(normalizePremiumBillingEvent(refund, JSON.stringify(refund), 0, contract)).toMatchObject(
      {
        ok: true,
        event: { status: 'premium_revoked', signalType: 'REFUND_CONFIRMED' },
      }
    );

    const partial = structuredClone(refund);
    partial.data.attributes.status = 'partial_refund';
    partial.data.attributes.refunded = false;
    partial.data.attributes.refunded_amount = 200;
    expect(normalizePremiumBillingEvent(partial, JSON.stringify(partial), 0, contract)).toEqual({
      ok: false,
      error: 'PARTIAL_REFUND',
    });
  });
});

describe('future-only freemium schema', () => {
  const migration = readFileSync(
    'supabase/migrations/20260730131500_create_freemium_billing.sql',
    'utf8'
  );

  it('contains no historical credit or payment entitlement backfill', () => {
    expect(migration).toContain('No legacy payment, credit, or entitlement backfill');
    expect(migration).not.toMatch(/insert into public\.subscription_entitlements[\s\S]*select/i);
  });

  it('locks non-active extra bindings on entitlement loss and keeps the active one', () => {
    expect(migration).toContain("set status = 'locked_by_entitlement'");
    expect(migration).toContain('and not is_active');
    expect(migration).toContain('pg_advisory_xact_lock');
  });

  it('separates future mission uniqueness by platform binding without legacy backfill', () => {
    expect(migration).toContain('platform_account_binding_id uuid');
    expect(migration).toContain('idx_missions_user_binding_source_external');
    expect(migration).not.toMatch(/update public\.missions[\s\S]*platform_account_binding_id/i);
  });

  it('keeps device credential and revocation writes server-authoritative', () => {
    expect(migration).toContain('drop policy if exists "Users can manage own extension devices"');
    expect(migration).toContain('create policy "Users can read own extension devices"');
    expect(migration).not.toMatch(
      /create policy "Users can manage own extension devices"[\s\S]*for all/i
    );
  });
});
