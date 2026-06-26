import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { createSupabaseServerClient } from '$lib/server/supabase';
import { CREDIT_PACKS, isCreditPackId } from '$lib/credits';
import { getCreditPackVariantId } from '$lib/server/credits';

export const POST: RequestHandler = async ({ request, cookies, url }) => {
  const supabase = createSupabaseServerClient(cookies);
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.user) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { packId?: unknown } | null;
  if (!isCreditPackId(body?.packId)) {
    return json({ error: 'Invalid credit pack' }, { status: 400 });
  }

  const pack = CREDIT_PACKS[body.packId];
  const variantId = getCreditPackVariantId(body.packId);
  const storeId = env.LEMON_SQUEEZY_STORE_ID;
  const apiKey = env.LEMON_SQUEEZY_API_KEY;

  if (!storeId || !variantId || !apiKey) {
    return json({ error: 'Checkout is not configured' }, { status: 503 });
  }

  const origin = `${url.protocol}//${url.host}`;
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
            email: session.user.email,
            custom: {
              user_id: session.user.id,
              user_email: session.user.email,
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
    const errorText = await checkoutResponse.text();
    console.error('Lemon checkout creation failed:', checkoutResponse.status, errorText);
    return json({ error: 'Checkout creation failed' }, { status: 502 });
  }

  const checkout = await checkoutResponse.json();
  const checkoutUrl = checkout.data?.attributes?.url;

  if (typeof checkoutUrl !== 'string') {
    return json({ error: 'Checkout URL missing' }, { status: 502 });
  }

  return json({ url: checkoutUrl });
};
