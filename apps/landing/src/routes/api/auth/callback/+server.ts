import type { RequestHandler } from './$types';
import { redirect } from '@sveltejs/kit';
import { createSupabaseServerClient } from '$lib/server/supabase';

export const GET: RequestHandler = async ({ url, cookies }) => {
  const code = url.searchParams.get('code');

  if (code) {
    const supabase = createSupabaseServerClient(cookies);
    await supabase.auth.exchangeCodeForSession(code);
  }

  redirect(303, '/dashboard');
};
