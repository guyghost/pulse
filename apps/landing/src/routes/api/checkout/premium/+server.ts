import { randomUUID } from 'node:crypto';
import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { createSupabaseAdminClient, createSupabaseServerClient } from '$lib/server/supabase';
import { getPremiumServerConfig } from '$lib/server/premium-config';
import { readSecureCheckoutUrl } from '$lib/server/premium-billing';
import { getCanonicalPublicOrigin } from '$lib/server/public-origin';
import { NO_STORE_HEADERS } from '$lib/server/rate-limit';

const CheckoutRequestSchema = z.object({
  requestId: z.string().uuid().optional(),
});

export const POST: RequestHandler = async ({ request, cookies, fetch }) => {
  const supabase = createSupabaseServerClient(cookies);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return json({ error: 'ACCOUNT_REQUIRED' }, { status: 401, headers: NO_STORE_HEADERS });
  }

  const parsed = CheckoutRequestSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return json({ error: 'INVALID_REQUEST' }, { status: 400, headers: NO_STORE_HEADERS });
  }

  const config = getPremiumServerConfig();
  if (!config.storeId || !config.variantId || !config.apiKey || config.expectedTestMode === null) {
    return json({ error: 'CHECKOUT_NOT_CONFIGURED' }, { status: 503, headers: NO_STORE_HEADERS });
  }
  const origin = getCanonicalPublicOrigin();
  if (origin === null) {
    return json(
      { error: 'PUBLIC_ORIGIN_NOT_CONFIGURED' },
      { status: 503, headers: NO_STORE_HEADERS }
    );
  }

  const admin = createSupabaseAdminClient();
  const { data: existingEntitlement } = await admin
    .from('subscription_entitlements')
    .select('status, valid_until')
    .eq('user_id', user.id)
    .maybeSingle();

  const premiumStillValid =
    (existingEntitlement?.status === 'premium_active' ||
      existingEntitlement?.status === 'premium_cancel_at_period_end') &&
    typeof existingEntitlement.valid_until === 'string' &&
    Date.parse(existingEntitlement.valid_until) > Date.now();
  if (premiumStillValid) {
    return json({ error: 'ALREADY_PREMIUM' }, { status: 409, headers: NO_STORE_HEADERS });
  }

  const checkoutAttemptId = randomUUID();
  const idempotencyKey = parsed.data.requestId ?? checkoutAttemptId;

  const { data: existingIntent } = await admin
    .from('billing_checkout_intents')
    .select('id, state, checkout_url')
    .eq('user_id', user.id)
    .eq('idempotency_key', idempotencyKey)
    .maybeSingle();

  if (
    existingIntent?.state === 'awaiting_payment' &&
    typeof existingIntent.checkout_url === 'string'
  ) {
    return json(
      {
        checkoutAttemptId: existingIntent.id,
        state: existingIntent.state,
        url: existingIntent.checkout_url,
      },
      { headers: NO_STORE_HEADERS }
    );
  }

  const intentId = existingIntent?.id ?? checkoutAttemptId;
  if (!existingIntent) {
    const { error: intentError } = await admin.from('billing_checkout_intents').insert({
      id: intentId,
      user_id: user.id,
      offer_id: config.offer.id,
      catalog_version: config.offer.catalogVersion,
      amount_minor: config.offer.amountMinor,
      currency: config.offer.currency,
      tax_included: config.offer.taxIncluded,
      idempotency_key: idempotencyKey,
      state: 'creating_checkout',
    });
    if (intentError) {
      return json({ error: 'INTENT_CREATE_FAILED' }, { status: 500, headers: NO_STORE_HEADERS });
    }
  }

  const checkoutResponse = await fetch('https://api.lemonsqueezy.com/v1/checkouts', {
    method: 'POST',
    headers: {
      Accept: 'application/vnd.api+json',
      'Content-Type': 'application/vnd.api+json',
      Authorization: `Bearer ${config.apiKey}`,
      'Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify({
      data: {
        type: 'checkouts',
        attributes: {
          product_options: {
            redirect_url: `${origin}/dashboard?checkout=awaiting&attempt=${intentId}`,
          },
          checkout_data: {
            email: user.email,
            custom: {
              account_id: user.id,
              checkout_attempt_id: intentId,
              offer_id: config.offer.id,
              catalog_version: String(config.offer.catalogVersion),
            },
          },
        },
        relationships: {
          store: { data: { type: 'stores', id: config.storeId } },
          variant: { data: { type: 'variants', id: config.variantId } },
        },
      },
    }),
  });

  if (!checkoutResponse.ok) {
    await admin
      .from('billing_checkout_intents')
      .update({
        state: checkoutResponse.status >= 500 ? 'create_failed_retryable' : 'failed_terminal',
        error_code: `PROVIDER_${checkoutResponse.status}`,
      })
      .eq('id', intentId)
      .eq('user_id', user.id);
    return json({ error: 'CHECKOUT_CREATE_FAILED' }, { status: 502, headers: NO_STORE_HEADERS });
  }

  const checkout = (await checkoutResponse.json()) as {
    data?: {
      id?: unknown;
      attributes?: {
        url?: unknown;
        store_id?: unknown;
        variant_id?: unknown;
        test_mode?: unknown;
      };
    };
  };
  const checkoutUrl = readSecureCheckoutUrl(checkout.data?.attributes?.url);
  const providerContractMatches =
    String(checkout.data?.attributes?.store_id ?? '') === config.storeId &&
    String(checkout.data?.attributes?.variant_id ?? '') === config.variantId &&
    checkout.data?.attributes?.test_mode === config.expectedTestMode;
  if (checkoutUrl === null || !providerContractMatches) {
    await admin
      .from('billing_checkout_intents')
      .update({
        state: 'failed_terminal',
        error_code: checkoutUrl === null ? 'PROVIDER_URL_INVALID' : 'PROVIDER_CONTRACT_MISMATCH',
      })
      .eq('id', intentId)
      .eq('user_id', user.id);
    return json(
      { error: checkoutUrl === null ? 'CHECKOUT_URL_INVALID' : 'CHECKOUT_CONTRACT_MISMATCH' },
      { status: 502, headers: NO_STORE_HEADERS }
    );
  }

  const { error: updateError } = await admin
    .from('billing_checkout_intents')
    .update({
      state: 'awaiting_payment',
      provider_checkout_id:
        checkout.data?.id === null || checkout.data?.id === undefined
          ? null
          : String(checkout.data.id),
      checkout_url: checkoutUrl,
      error_code: null,
    })
    .eq('id', intentId)
    .eq('user_id', user.id);

  if (updateError) {
    return json({ error: 'INTENT_UPDATE_FAILED' }, { status: 500, headers: NO_STORE_HEADERS });
  }

  return json(
    { checkoutAttemptId: intentId, state: 'awaiting_payment', url: checkoutUrl },
    { headers: NO_STORE_HEADERS }
  );
};
