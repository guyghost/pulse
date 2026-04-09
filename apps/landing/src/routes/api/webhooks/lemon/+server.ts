import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { verifyLemonSqueezyWebhook } from '$lib/server/lemon';
import { createSupabaseAdminClient } from '$lib/server/supabase';

export const POST: RequestHandler = async ({ request }) => {
  const rawBody = await request.text();
  const signature = request.headers.get('x-signature') ?? '';

  if (!verifyLemonSqueezyWebhook(rawBody, signature)) {
    return json({ error: 'Invalid signature' }, { status: 401 });
  }

  const event = JSON.parse(rawBody);
  const eventName: string = event.meta?.event_name;
  const attrs = event.data?.attributes;

  // Lemon Squeezy stores the user email in custom_data or user_email
  const userEmail: string | undefined =
    event.meta?.custom_data?.user_email ?? attrs?.user_email;

  if (!userEmail) {
    console.error('Lemon webhook: no user email found', eventName);
    return json({ error: 'No user email' }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();

  // Find the user by email
  const { data: users } = await supabase.auth.admin.listUsers();
  const user = users?.users?.find((u) => u.email === userEmail);

  if (!user) {
    console.error('Lemon webhook: user not found', userEmail);
    return json({ error: 'User not found' }, { status: 404 });
  }

  switch (eventName) {
    case 'subscription_created':
    case 'subscription_updated':
    case 'subscription_resumed': {
      const status = attrs?.status;
      const isPremium = status === 'active' || status === 'on_trial';

      await supabase.from('profiles').upsert({
        id: user.id,
        subscription_status: isPremium ? 'premium' : 'free',
        subscription_period_end: attrs?.renews_at ?? attrs?.ends_at ?? null,
        ls_subscription_id: String(event.data?.id ?? ''),
        ls_customer_id: String(attrs?.customer_id ?? '')
      });
      break;
    }

    case 'subscription_cancelled':
    case 'subscription_expired': {
      await supabase.from('profiles').upsert({
        id: user.id,
        subscription_status: 'free',
        subscription_period_end: attrs?.ends_at ?? null,
        ls_subscription_id: String(event.data?.id ?? ''),
        ls_customer_id: String(attrs?.customer_id ?? '')
      });
      break;
    }

    default:
      console.log('Lemon webhook: unhandled event', eventName);
  }

  return json({ received: true });
};
