import type { Actions } from './$types';
import { fail } from '@sveltejs/kit';
import { createSupabaseServerClient } from '$lib/server/supabase';

export const actions: Actions = {
  register: async ({ request, cookies, url }) => {
    const formData = await request.formData();
    const email = formData.get('email') as string;
    const password = formData.get('password') as string;
    const confirmPassword = formData.get('confirmPassword') as string;

    if (!email || !password || !confirmPassword) {
      return fail(400, { error: 'Tous les champs sont requis', email });
    }

    if (password !== confirmPassword) {
      return fail(400, { error: 'Les mots de passe ne correspondent pas', email });
    }

    if (password.length < 8) {
      return fail(400, { error: 'Le mot de passe doit contenir au moins 8 caractères', email });
    }

    const supabase = createSupabaseServerClient(cookies);
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${url.origin}/api/auth/callback`
      }
    });

    if (error) {
      return fail(400, { error: error.message, email });
    }

    return { success: true, email };
  }
};
