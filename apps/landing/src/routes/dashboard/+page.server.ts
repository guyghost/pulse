import type { PageServerLoad, Actions } from './$types';
import { redirect } from '@sveltejs/kit';
import { CREDIT_PACK_LIST } from '$lib/credits';
import { createSupabaseAdminClient, createSupabaseServerClient } from '$lib/server/supabase';
import { grantPremiumMonthlyCredits } from '$lib/server/credits';

export const load: PageServerLoad = async ({ cookies, url }) => {
  const supabase = createSupabaseServerClient(cookies);
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    redirect(303, '/login');
  }

  await grantPremiumMonthlyCredits(createSupabaseAdminClient(), session.user.id);

  // Fetch subscription status
  const { data: profile } = await supabase
    .from('profiles')
    .select('subscription_status, subscription_period_end, credit_balance')
    .eq('id', session.user.id)
    .single();

  return {
    session,
    profile: profile ?? {
      subscription_status: 'free',
      subscription_period_end: null,
      credit_balance: 0,
    },
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
