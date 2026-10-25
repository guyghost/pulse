import type { RequestHandler } from './$types';
import { LEMON_SQUEEZY_STORE_ID, LEMON_SQUEEZY_API_KEY } from '$app/env/private';
import { createSupabaseServerClient } from '#lib/server/supabase.js';
import { CREDIT_PACKS, isCreditPackId } from '#lib/credits.js';
import { getCreditPackVariantId } from '#lib/server/credits.js';
import { getCanonicalPublicOrigin } from '#lib/server/public-origin.js';
import { readSecureCheckoutUrl } from '#lib/server/premium-billing.js';
import { NO_STORE_HEADERS } from '#lib/server/rate-limit.js';

export const POST: RequestHandler = async ({ request, cookies }) => {
  const supabase = createSupabaseServerClient(cookies);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401, headers: NO_STORE_HEADERS });
  }

  const body = (await request.json().catch(() => null)) as { packId?: unknown } | null;
  if (!isCreditPackId(body?.packId)) {
    return Response.json(
      { error: 'Invalid credit pack' },
      { status: 400, headers: NO_STORE_HEADERS }
    );
  }

  const pack = CREDIT_PACKS[body.packId];
  const variantId = getCreditPackVariantId(body.packId);
  const storeId = LEMON_SQUEEZY_STORE_ID;
  const apiKey = LEMON_SQUEEZY_API_KEY;

  if (!storeId || !variantId || !apiKey) {
    return Response.json(
      { error: 'Checkout is not configured' },
      { status: 503, headers: NO_STORE_HEADERS }
    );
  }

  const origin = getCanonicalPublicOrigin();
  if (origin === null) {
    return Response.json(
      { error: 'PUBLIC_ORIGIN_NOT_CONFIGURED' },
      { status: 503, headers: NO_STORE_HEADERS }
    );
  }
  const checkoutResponse = await fetch('https://api.lemonsqueezy.com/v1/checkouts', {
    method: 'POST',
    headers: {
      Accept: 'application/vnd.api+json',
      'Content-Type': 'application/vnd.api+json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      data: {
        type: 'checkouts',
        attributes: {
          product_options: {
            redirect_url: `${origin}/dashboard?checkout=success`,
          },
          checkout_data: {
            email: user.email,
            custom: {
              user_id: user.id,
              user_email: user.email,
              pack_id: pack.id,
              credits: pack.credits,
            },
          },
        },
        relationships: {
          store: {
            data: {
              type: 'stores',
              id: storeId,
            },
          },
          variant: {
            data: {
              type: 'variants',
              id: variantId,
            },
          },
        },
      },
    }),
  });

  if (!checkoutResponse.ok) {
    return Response.json(
      { error: 'Checkout creation failed' },
      { status: 502, headers: NO_STORE_HEADERS }
    );
  }

  const checkout = await checkoutResponse.json();
  const checkoutUrl = readSecureCheckoutUrl(checkout.data?.attributes?.url);

  if (checkoutUrl === null) {
    return Response.json(
      { error: 'Checkout URL missing' },
      { status: 502, headers: NO_STORE_HEADERS }
    );
  }

  return Response.json({ url: checkoutUrl }, { headers: NO_STORE_HEADERS });
};
