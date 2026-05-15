import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { verifyLemonSqueezyWebhook } from '$lib/server/lemon';
import { createSupabaseAdminClient } from '$lib/server/supabase';
import { CREDIT_PACKS, isCreditPackId } from '$lib/credits';
import { getCreditAmountForVariant } from '$lib/server/credits';

export const POST: RequestHandler = async ({ request }) => {
  const rawBody = await request.text();
  const signature = request.headers.get('x-signature') ?? '';

  if (!verifyLemonSqueezyWebhook(rawBody, signature)) {
    return json({ error: 'Invalid signature' }, { status: 401 });
  }

  const event = JSON.parse(rawBody);
  const eventName: string = event.meta?.event_name;
  const attrs = event.data?.attributes;

  const customData = event.meta?.custom_data ?? {};
  const userIdFromCustom: string | undefined = customData.user_id;
  const userEmail: string | undefined = customData.user_email ?? attrs?.user_email;

  if (!userEmail && !userIdFromCustom) {
    console.error('Lemon webhook: no user identity found', eventName);
    return json({ error: 'No user identity' }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();

  let userId = userIdFromCustom;
  if (!userId && userEmail) {
    const { data: users } = await supabase.auth.admin.listUsers();
    userId = users?.users?.find((u) => u.email === userEmail)?.id;
  }

  if (!userId) {
    console.error('Lemon webhook: user not found', userEmail);
    return json({ error: 'User not found' }, { status: 404 });
  }

  switch (eventName) {
    case 'order_created': {
      const packId = customData.pack_id;
      const variantId =
        attrs?.first_order_item?.variant_id ??
        attrs?.order_items?.[0]?.variant_id ??
        attrs?.variant_id ??
        null;
      const credits = isCreditPackId(packId)
        ? CREDIT_PACKS[packId].credits
        : getCreditAmountForVariant(variantId ? String(variantId) : null);

      if (!credits) {
        console.log('Lemon webhook: order is not a credit pack', event.data?.id);
        break;
      }

      const lemonOrderId = String(event.data?.id ?? '');
      const { error: creditError } = await supabase.rpc('add_credits_from_purchase', {
        p_user_id: userId,
        p_amount: credits,
        p_lemon_order_id: lemonOrderId,
        p_metadata: {
          pack_id: isCreditPackId(packId) ? packId : null,
          variant_id: variantId ? String(variantId) : null,
        },
      });

      if (creditError) {
        throw creditError;
      }
      break;
    }

    case 'subscription_created':
    case 'subscription_updated':
    case 'subscription_resumed': {
      const status = attrs?.status;
      const isPremium = status === 'active' || status === 'on_trial';

      await supabase.from('profiles').upsert({
        id: userId,
        subscription_status: isPremium ? 'premium' : 'free',
        subscription_period_end: attrs?.renews_at ?? attrs?.ends_at ?? null,
        ls_subscription_id: String(event.data?.id ?? ''),
        ls_customer_id: String(attrs?.customer_id ?? ''),
      });
      break;
    }

    case 'subscription_cancelled':
    case 'subscription_expired': {
      await supabase.from('profiles').upsert({
        id: userId,
        subscription_status: 'free',
        subscription_period_end: attrs?.ends_at ?? null,
        ls_subscription_id: String(event.data?.id ?? ''),
        ls_customer_id: String(attrs?.customer_id ?? ''),
      });
      break;
    }

    default:
      console.log('Lemon webhook: unhandled event', eventName);
  }

  return json({ received: true });
};
