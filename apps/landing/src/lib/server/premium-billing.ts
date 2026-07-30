import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  PREMIUM_YEARLY_OFFER,
  type EntitlementSignalType,
  type EntitlementStatus,
} from '@pulse/domain';
import { z } from 'zod';

const LemonWebhookSchema = z.object({
  meta: z.object({
    event_name: z.string().min(1),
    custom_data: z
      .object({
        account_id: z.string().uuid(),
        checkout_attempt_id: z.string().uuid(),
        offer_id: z.literal(PREMIUM_YEARLY_OFFER.id),
      })
      .passthrough(),
  }),
  data: z.object({
    id: z.union([z.string(), z.number()]).transform(String),
    type: z.string(),
    attributes: z
      .object({
        status: z.string().optional(),
        store_id: z.union([z.string(), z.number()]),
        customer_id: z.union([z.string(), z.number()]).optional(),
        variant_id: z.union([z.string(), z.number()]).optional(),
        test_mode: z.boolean(),
        updated_at: z.string().datetime({ offset: true }),
        created_at: z.string().datetime({ offset: true }).optional(),
        renews_at: z.string().datetime({ offset: true }).nullable().optional(),
        ends_at: z.string().datetime({ offset: true }).nullable().optional(),
        subscription_id: z.union([z.string(), z.number()]).nullable().optional(),
        refunded: z.boolean().optional(),
        refunded_amount: z.number().nonnegative().optional(),
        total: z.number().nonnegative().optional(),
        first_order_item: z
          .object({
            variant_id: z.union([z.string(), z.number()]),
          })
          .passthrough()
          .nullable()
          .optional(),
      })
      .passthrough(),
  }),
});

export interface NormalizedPremiumBillingEvent {
  providerEventId: string;
  payloadHash: string;
  eventName: string;
  accountId: string;
  checkoutAttemptId: string;
  offerId: typeof PREMIUM_YEARLY_OFFER.id;
  sourceSubscriptionId: string | null;
  status: EntitlementStatus;
  signalType: EntitlementSignalType;
  validFrom: string | null;
  validUntil: string | null;
  providerUpdatedAt: string;
  eventPriority: number;
}

export type NormalizePremiumBillingResult =
  | { ok: true; event: NormalizedPremiumBillingEvent }
  | {
      ok: false;
      error:
        | 'INVALID_PAYLOAD'
        | 'EVENT_NAME_MISMATCH'
        | 'PROVIDER_CONTRACT_MISMATCH'
        | 'UNSUPPORTED_EVENT'
        | 'AUXILIARY_EVENT'
        | 'PARTIAL_REFUND'
        | 'UNSUPPORTED_STATUS'
        | 'MISSING_VALID_UNTIL';
    };

export interface PremiumBillingProviderContract {
  eventNameHeader: string;
  expectedStoreId: string;
  expectedVariantId: string;
  expectedTestMode: boolean;
}

const ACTIVE_STATUSES = new Set(['active', 'on_trial', 'paused']);
const PAST_DUE_STATUSES = new Set(['past_due', 'unpaid']);
const SUBSCRIPTION_EVENTS = new Set([
  'subscription_created',
  'subscription_updated',
  'subscription_cancelled',
  'subscription_resumed',
  'subscription_expired',
  'subscription_paused',
  'subscription_unpaused',
]);
const AUXILIARY_PAYMENT_EVENTS = new Set([
  'subscription_payment_success',
  'subscription_payment_recovered',
  'subscription_payment_failed',
]);

function mapBillingState(input: {
  eventName: string;
  providerStatus: string | undefined;
  endsAt: string | null;
  nowMs: number;
}): {
  status: EntitlementStatus;
  signalType: EntitlementSignalType;
  priority: number;
} | null {
  const { eventName, providerStatus, endsAt, nowMs } = input;

  if (eventName === 'subscription_expired' || providerStatus === 'expired') {
    return { status: 'premium_expired', signalType: 'PERIOD_ENDED', priority: 90 };
  }
  if (PAST_DUE_STATUSES.has(providerStatus ?? '')) {
    return { status: 'premium_past_due', signalType: 'PAYMENT_FAILED', priority: 70 };
  }
  if (eventName === 'subscription_cancelled' || providerStatus === 'cancelled') {
    const endsAtMs = endsAt === null ? Number.NaN : Date.parse(endsAt);
    return Number.isFinite(endsAtMs) && endsAtMs > nowMs
      ? {
          status: 'premium_cancel_at_period_end',
          signalType: 'CANCELLATION_SCHEDULED',
          priority: 80,
        }
      : { status: 'premium_expired', signalType: 'PERIOD_ENDED', priority: 90 };
  }
  if (eventName === 'subscription_resumed' || eventName === 'subscription_unpaused') {
    return { status: 'premium_active', signalType: 'SUBSCRIPTION_RESUMED', priority: 50 };
  }
  if (
    eventName === 'subscription_created' ||
    eventName === 'subscription_updated' ||
    eventName === 'subscription_paused'
  ) {
    if (ACTIVE_STATUSES.has(providerStatus ?? '')) {
      return { status: 'premium_active', signalType: 'SUBSCRIPTION_ACTIVATED', priority: 40 };
    }
    return null;
  }
  return null;
}

export function hashWebhookPayload(rawBody: string): string {
  return createHash('sha256').update(rawBody).digest('hex');
}

export function readSecureCheckoutUrl(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'https:' ? parsed.toString() : null;
  } catch {
    return null;
  }
}

export function normalizePremiumBillingEvent(
  rawEvent: unknown,
  rawBody: string,
  nowMs: number,
  contract: PremiumBillingProviderContract
): NormalizePremiumBillingResult {
  const parsed = LemonWebhookSchema.safeParse(rawEvent);
  if (!parsed.success) {
    return { ok: false, error: 'INVALID_PAYLOAD' };
  }

  const { meta, data } = parsed.data;
  if (contract.eventNameHeader !== meta.event_name) {
    return { ok: false, error: 'EVENT_NAME_MISMATCH' };
  }
  if (
    String(data.attributes.store_id) !== contract.expectedStoreId ||
    data.attributes.test_mode !== contract.expectedTestMode
  ) {
    return { ok: false, error: 'PROVIDER_CONTRACT_MISMATCH' };
  }

  if (AUXILIARY_PAYMENT_EVENTS.has(meta.event_name)) {
    return { ok: false, error: 'AUXILIARY_EVENT' };
  }

  const isRefund =
    meta.event_name === 'order_refunded' || meta.event_name === 'subscription_payment_refunded';
  if (isRefund) {
    const expectedType = meta.event_name === 'order_refunded' ? 'orders' : 'subscription-invoices';
    const refundVariantId =
      data.attributes.first_order_item?.variant_id ?? data.attributes.variant_id;
    const variantMatches =
      meta.event_name === 'subscription_payment_refunded' ||
      String(refundVariantId ?? '') === contract.expectedVariantId;
    if (data.type !== expectedType || !variantMatches) {
      return { ok: false, error: 'PROVIDER_CONTRACT_MISMATCH' };
    }
    const fullRefund =
      data.attributes.refunded === true &&
      typeof data.attributes.refunded_amount === 'number' &&
      typeof data.attributes.total === 'number' &&
      data.attributes.refunded_amount >= data.attributes.total;
    if (!fullRefund) {
      return { ok: false, error: 'PARTIAL_REFUND' };
    }

    const payloadHash = hashWebhookPayload(rawBody);
    const subscriptionId =
      data.attributes.subscription_id === null || data.attributes.subscription_id === undefined
        ? null
        : String(data.attributes.subscription_id);
    return {
      ok: true,
      event: {
        providerEventId: payloadHash,
        payloadHash,
        eventName: meta.event_name,
        accountId: meta.custom_data.account_id,
        checkoutAttemptId: meta.custom_data.checkout_attempt_id,
        offerId: meta.custom_data.offer_id,
        sourceSubscriptionId: subscriptionId,
        status: 'premium_revoked',
        signalType: 'REFUND_CONFIRMED',
        validFrom: data.attributes.created_at ?? null,
        validUntil: null,
        providerUpdatedAt: data.attributes.updated_at,
        eventPriority: 100,
      },
    };
  }

  if (!SUBSCRIPTION_EVENTS.has(meta.event_name)) {
    return { ok: false, error: 'UNSUPPORTED_EVENT' };
  }
  if (
    data.type !== 'subscriptions' ||
    String(data.attributes.variant_id ?? '') !== contract.expectedVariantId
  ) {
    return { ok: false, error: 'PROVIDER_CONTRACT_MISMATCH' };
  }

  const mapped = mapBillingState({
    eventName: meta.event_name,
    providerStatus: data.attributes.status,
    endsAt: data.attributes.ends_at ?? null,
    nowMs,
  });
  if (mapped === null) {
    return { ok: false, error: 'UNSUPPORTED_STATUS' };
  }

  const validUntil = data.attributes.ends_at ?? data.attributes.renews_at ?? null;
  if (
    (mapped.status === 'premium_active' || mapped.status === 'premium_cancel_at_period_end') &&
    validUntil === null
  ) {
    return { ok: false, error: 'MISSING_VALID_UNTIL' };
  }

  const payloadHash = hashWebhookPayload(rawBody);
  const subscriptionId = data.id;

  return {
    ok: true,
    event: {
      providerEventId: payloadHash,
      payloadHash,
      eventName: meta.event_name,
      accountId: meta.custom_data.account_id,
      checkoutAttemptId: meta.custom_data.checkout_attempt_id,
      offerId: meta.custom_data.offer_id,
      sourceSubscriptionId: subscriptionId,
      status: mapped.status,
      signalType: mapped.signalType,
      validFrom: data.attributes.created_at ?? null,
      validUntil,
      providerUpdatedAt: data.attributes.updated_at,
      eventPriority: mapped.priority,
    },
  };
}

export async function applyPremiumBillingEvent(
  supabase: SupabaseClient,
  event: NormalizedPremiumBillingEvent,
  cacheTtlHours: number
): Promise<
  { ok: true; result: 'applied' | 'duplicate' | 'ignored_stale' } | { ok: false; error: string }
> {
  const { data, error } = await supabase.rpc('apply_premium_billing_event', {
    p_provider_event_id: event.providerEventId,
    p_payload_hash: event.payloadHash,
    p_event_name: event.eventName,
    p_user_id: event.accountId,
    p_checkout_intent_id: event.checkoutAttemptId,
    p_offer_id: event.offerId,
    p_source_subscription_id: event.sourceSubscriptionId,
    p_entitlement_status: event.status,
    p_signal_type: event.signalType,
    p_valid_from: event.validFrom,
    p_valid_until: event.validUntil,
    p_provider_updated_at: event.providerUpdatedAt,
    p_event_priority: event.eventPriority,
    p_cache_ttl_hours: cacheTtlHours,
  });

  if (error) {
    return { ok: false, error: error.message };
  }
  if (data === 'applied' || data === 'duplicate' || data === 'ignored_stale') {
    return { ok: true, result: data };
  }
  return { ok: false, error: typeof data === 'string' ? data : 'UNKNOWN_BILLING_RESULT' };
}
