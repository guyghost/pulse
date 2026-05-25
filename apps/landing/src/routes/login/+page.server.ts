import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { createSupabaseServerClient } from '$lib/server/supabase';

const defaultRedirectPath = '/dashboard';

function normalizeRedirectPath(value: FormDataEntryValue | string | null): string {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) {
    return defaultRedirectPath;
  }

  return value;
}

export const load: PageServerLoad = async ({ cookies, url }) => {
  const redirectTo = normalizeRedirectPath(url.searchParams.get('redirectTo'));
  let hasSession = false;

  try {
    const supabase = createSupabaseServerClient(cookies);
    const { data } = await supabase.auth.getSession();
    hasSession = Boolean(data.session);
  } catch {
    // Supabase not configured yet — keep the login page renderable in local preview.
  }

  if (hasSession) {
    redirect(303, redirectTo);
  }

  return {
    email: '',
    redirectTo,
  };
};
