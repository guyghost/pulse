import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { createSupabaseServerClient } from '$lib/server/supabase';

export const load: PageServerLoad = async ({ cookies }) => {
  let hasSession = false;

  try {
    const supabase = createSupabaseServerClient(cookies);
    const { data } = await supabase.auth.getSession();
    hasSession = Boolean(data.session);
  } catch {
    // Supabase is optional in local preview; keep the public facade available.
  }

  if (hasSession) {
    redirect(303, '/dashboard');
  }
};
