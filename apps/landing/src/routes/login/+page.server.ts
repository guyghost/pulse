import type { Actions } from './$types';
import { fail, redirect } from '@sveltejs/kit';
import { createSupabaseServerClient } from '$lib/server/supabase';

export const actions: Actions = {
  login: async ({ request, cookies }) => {
    const formData = await request.formData();
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;

    if (!email || !password) {
      return fail(400, { error: 'Email et mot de passe requis', email });
    }

    const supabase = createSupabaseServerClient(cookies);
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      return fail(400, { error: error.message, email });
    }

    redirect(303, '/dashboard');
  }
};
