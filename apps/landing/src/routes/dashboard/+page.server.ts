import type { PageServerLoad, Actions } from './$types';
import { redirect } from '@sveltejs/kit';
import { CREDIT_PACK_LIST } from '$lib/credits';
import { createSupabaseServerClient } from '$lib/server/supabase';
import { hasSupabaseAuthCookie } from '$lib/server/auth-cookie';
import { NO_STORE_HEADERS } from '$lib/server/rate-limit';

export const load: PageServerLoad = async ({ cookies, url, setHeaders }) => {
  setHeaders(NO_STORE_HEADERS);
  if (!hasSupabaseAuthCookie(cookies)) {
    redirect(303, '/login');
  }

  const supabase = createSupabaseServerClient(cookies);
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(303, '/login');
  }
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) {
    redirect(303, '/login');
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('credit_balance')
    .eq('id', user.id)
    .single();

  const { data: entitlement } = await supabase
    .from('subscription_entitlements')
    .select('plan_id, status, valid_from, valid_until, features, revision, cache_expires_at')
    .eq('user_id', user.id)
    .maybeSingle();

  const checkoutAttemptId = url.searchParams.get('attempt');
  const { data: checkoutIntent } = checkoutAttemptId
    ? await supabase
        .from('billing_checkout_intents')
        .select('id, state, error_code, updated_at')
        .eq('id', checkoutAttemptId)
        .eq('user_id', user.id)
        .maybeSingle()
    : { data: null };

  return {
    userEmail: user.email ?? null,
    profile: profile ?? {
      credit_balance: 0,
    },
    entitlement,
    checkoutIntent,
    creditPacks: CREDIT_PACK_LIST,
    checkoutStatus: url.searchParams.get('checkout'),
  };
};

export const actions: Actions = {
  logout: async ({ cookies }) => {
    const supabase = createSupabaseServerClient(cookies);
    await supabase.auth.signOut();
    redirect(303, '/');
  },
};
