import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { createSupabaseServerClient } from '$lib/server/supabase';
import { CREDIT_PACKS, isCreditPackId } from '$lib/credits';
import { getCreditPackVariantId } from '$lib/server/credits';
import { getCanonicalPublicOrigin } from '$lib/server/public-origin';
import { readSecureCheckoutUrl } from '$lib/server/premium-billing';
import { NO_STORE_HEADERS } from '$lib/server/rate-limit';

export const POST: RequestHandler = async ({ request, cookies }) => {
  const supabase = createSupabaseServerClient(cookies);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return json({ error: 'Unauthorized' }, { status: 401, headers: NO_STORE_HEADERS });
  }

  const body = (await request.json().catch(() => null)) as { packId?: unknown } | null;
  if (!isCreditPackId(body?.packId)) {
    return json({ error: 'Invalid credit pack' }, { status: 400, headers: NO_STORE_HEADERS });
  }

  const pack = CREDIT_PACKS[body.packId];
  const variantId = getCreditPackVariantId(body.packId);
  const storeId = env.LEMON_SQUEEZY_STORE_ID;
  const apiKey = env.LEMON_SQUEEZY_API_KEY;

  if (!storeId || !variantId || !apiKey) {
    return json(
      { error: 'Checkout is not configured' },
      { status: 503, headers: NO_STORE_HEADERS }
    );
  }

  const origin = getCanonicalPublicOrigin();
  if (origin === null) {
    return json(
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
    return json({ error: 'Checkout creation failed' }, { status: 502, headers: NO_STORE_HEADERS });
  }

  const checkout = await checkoutResponse.json();
  const checkoutUrl = readSecureCheckoutUrl(checkout.data?.attributes?.url);

  if (checkoutUrl === null) {
    return json({ error: 'Checkout URL missing' }, { status: 502, headers: NO_STORE_HEADERS });
  }

  return json({ url: checkoutUrl }, { headers: NO_STORE_HEADERS });
};
