import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { createSupabaseServerClient } from '$lib/server/supabase';

export const load: PageServerLoad = async ({ cookies }) => {
  let hasSession = false;

  try {
    const supabase = createSupabaseServerClient(cookies);
    const { data } = await supabase.auth.getSession();
    hasSession = Boolean(data.session);
  } catch {
    // Supabase not configured yet — keep the register page renderable in local preview.
  }

  if (hasSession) {
    redirect(303, '/dashboard');
  }
};
