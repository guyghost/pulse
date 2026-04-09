import type { PageServerLoad, Actions } from './$types';
import { redirect } from '@sveltejs/kit';
import { createSupabaseServerClient } from '$lib/server/supabase';

export const load: PageServerLoad = async ({ cookies }) => {
  const supabase = createSupabaseServerClient(cookies);
  const {
    data: { session }
  } = await supabase.auth.getSession();

  if (!session) {
    redirect(303, '/login');
  }

  // Fetch subscription status
  const { data: profile } = await supabase
    .from('profiles')
    .select('subscription_status, subscription_period_end')
    .eq('id', session.user.id)
    .single();

  return {
    session,
    profile: profile ?? { subscription_status: 'free', subscription_period_end: null }
  };
};

export const actions: Actions = {
  logout: async ({ cookies }) => {
    const supabase = createSupabaseServerClient(cookies);
    await supabase.auth.signOut();
    redirect(303, '/');
  }
};
