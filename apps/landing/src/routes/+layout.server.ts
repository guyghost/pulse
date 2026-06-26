import type { LayoutServerLoad } from './$types';
import { createSupabaseServerClient } from '$lib/server/supabase';

export const load: LayoutServerLoad = async ({ cookies }) => {
  let session = null;

  try {
    const supabase = createSupabaseServerClient(cookies);
    const { data } = await supabase.auth.getSession();
    session = data.session;
  } catch {
    // Supabase not configured yet — session stays null
  }

  return { session };
};
