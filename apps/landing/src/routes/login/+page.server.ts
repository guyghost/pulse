import type { Actions, PageServerLoad } from './$types';
import { fail, redirect } from '@sveltejs/kit';
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

export const actions: Actions = {
  login: async ({ request, cookies }) => {
    const formData = await request.formData();
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;
    const redirectTo = normalizeRedirectPath(formData.get('redirectTo'));

    if (!email || !password) {
      return fail(400, { error: 'Email et mot de passe requis', email, redirectTo });
    }

    const supabase = createSupabaseServerClient(cookies);
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      return fail(400, { error: error.message, email, redirectTo });
    }

    redirect(303, redirectTo);
  },
};
