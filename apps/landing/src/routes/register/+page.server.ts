import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { createSupabaseServerClient } from '$lib/server/supabase';
import { hasSupabaseAuthCookie } from '$lib/server/auth-cookie';

function normalizeRedirectPath(value: string | null): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) {
    return '/dashboard';
  }
  return value;
}

export const load: PageServerLoad = async ({ cookies, url }) => {
  const redirectTo = normalizeRedirectPath(url.searchParams.get('redirectTo'));
  let hasSession = false;

  if (hasSupabaseAuthCookie(cookies)) {
    try {
      const supabase = createSupabaseServerClient(cookies);
      const { data } = await supabase.auth.getSession();
      hasSession = Boolean(data.session);
    } catch {
      // Supabase not configured yet — keep the register page renderable in local preview.
    }
  }

  if (hasSession) {
    redirect(303, redirectTo);
  }

  return { session: null, redirectTo };
};
