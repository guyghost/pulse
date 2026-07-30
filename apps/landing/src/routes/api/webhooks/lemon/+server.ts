import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { verifyLemonSqueezyWebhook } from '$lib/server/lemon';
import { createSupabaseAdminClient } from '$lib/server/supabase';
import { CREDIT_PACKS, isCreditPackId } from '$lib/credits';
import { getCreditAmountForVariant, getCreditPackVariantId } from '$lib/server/credits';
import {
  applyPremiumBillingEvent,
  normalizePremiumBillingEvent,
} from '$lib/server/premium-billing';
import { getPremiumServerConfig } from '$lib/server/premium-config';
import { NO_STORE_HEADERS } from '$lib/server/rate-limit';
import { z } from 'zod';

type LemonEventEnvelope = {
  meta?: {
    event_name?: unknown;
    custom_data?: Record<string, unknown>;
  };
  data?: {
    id?: unknown;
    attributes?: Record<string, unknown>;
  };
};

async function processCreditOrder(
  event: LemonEventEnvelope,
  provider: { storeId: string; expectedTestMode: boolean }
): Promise<boolean> {
  const customData = event.meta?.custom_data ?? {};
  const packId = customData.pack_id;
  if (!isCreditPackId(packId)) {
    return false;
  }

  const userId = customData.user_id;
  if (!z.string().uuid().safeParse(userId).success) {
    return false;
  }

  const attrs = event.data?.attributes;
  const firstOrderItem =
    typeof attrs?.first_order_item === 'object' && attrs.first_order_item !== null
      ? (attrs.first_order_item as Record<string, unknown>)
      : null;
  const orderItems = Array.isArray(attrs?.order_items) ? attrs.order_items : [];
  const firstListItem =
    typeof orderItems[0] === 'object' && orderItems[0] !== null
      ? (orderItems[0] as Record<string, unknown>)
      : null;
  const variantId =
    firstOrderItem?.variant_id ?? firstListItem?.variant_id ?? attrs?.variant_id ?? null;
  const expectedVariantId = getCreditPackVariantId(packId);
  if (
    expectedVariantId === null ||
    String(variantId ?? '') !== expectedVariantId ||
    String(attrs?.store_id ?? '') !== provider.storeId ||
    attrs?.test_mode !== provider.expectedTestMode ||
    attrs?.status !== 'paid'
  ) {
    return false;
  }
  const credits =
    CREDIT_PACKS[packId].credits ??
    getCreditAmountForVariant(variantId === null ? null : String(variantId));
  const lemonOrderId = String(event.data?.id ?? '');
  if (!credits || !lemonOrderId) {
    return false;
  }

  const { error } = await createSupabaseAdminClient().rpc('add_credits_from_purchase', {
    p_user_id: userId,
    p_amount: credits,
    p_lemon_order_id: lemonOrderId,
    p_metadata: {
      pack_id: packId,
      variant_id: variantId === null ? null : String(variantId),
    },
  });
  if (error) {
    throw error;
  }
  return true;
}

export const POST: RequestHandler = async ({ request }) => {
  const rawBody = await request.text();
  const signature = request.headers.get('x-signature') ?? '';
  const eventNameHeader = request.headers.get('x-event-name') ?? '';

  if (!verifyLemonSqueezyWebhook(rawBody, signature)) {
    return json({ error: 'INVALID_SIGNATURE' }, { status: 401, headers: NO_STORE_HEADERS });
  }

  let event: LemonEventEnvelope;
  try {
    event = JSON.parse(rawBody) as LemonEventEnvelope;
  } catch {
    return json({ error: 'INVALID_JSON' }, { status: 400, headers: NO_STORE_HEADERS });
  }

  if (eventNameHeader.length === 0 || eventNameHeader !== event.meta?.event_name) {
    return json({ error: 'EVENT_NAME_MISMATCH' }, { status: 422, headers: NO_STORE_HEADERS });
  }

  const config = getPremiumServerConfig();
  if (!config.storeId || config.expectedTestMode === null) {
    return json({ error: 'WEBHOOK_NOT_CONFIGURED' }, { status: 503, headers: NO_STORE_HEADERS });
  }

  if (
    event.meta?.event_name === 'order_created' &&
    (await processCreditOrder(event, {
      storeId: config.storeId,
      expectedTestMode: config.expectedTestMode,
    }))
  ) {
    return json({ received: true, result: 'credit_order_applied' }, { headers: NO_STORE_HEADERS });
  }

  if (!config.variantId) {
    return json({ error: 'WEBHOOK_NOT_CONFIGURED' }, { status: 503, headers: NO_STORE_HEADERS });
  }
  const normalized = normalizePremiumBillingEvent(event, rawBody, Date.now(), {
    eventNameHeader,
    expectedStoreId: config.storeId,
    expectedVariantId: config.variantId,
    expectedTestMode: config.expectedTestMode,
  });
  if (!normalized.ok) {
    if (normalized.error === 'UNSUPPORTED_EVENT') {
      return json({ received: true, result: 'ignored_unsupported' }, { headers: NO_STORE_HEADERS });
    }
    if (normalized.error === 'AUXILIARY_EVENT' || normalized.error === 'PARTIAL_REFUND') {
      return json({ received: true, result: 'ignored_auxiliary' }, { headers: NO_STORE_HEADERS });
    }
    return json({ error: normalized.error }, { status: 422, headers: NO_STORE_HEADERS });
  }

  const applied = await applyPremiumBillingEvent(
    createSupabaseAdminClient(),
    normalized.event,
    config.entitlementCacheTtlHours
  );
  if (!applied.ok) {
    return json({ error: applied.error }, { status: 500, headers: NO_STORE_HEADERS });
  }

  return json({ received: true, result: applied.result }, { headers: NO_STORE_HEADERS });
};
