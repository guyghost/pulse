import type { RequestHandler } from './$types';
import { redirect } from '@sveltejs/kit';
import { createSupabaseServerClient } from '$lib/server/supabase';

const defaultRedirectPath = '/dashboard';

function normalizeRedirectPath(value: string | null): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) {
    return defaultRedirectPath;
  }

  return value;
}

export const GET: RequestHandler = async ({ url, cookies }) => {
  const code = url.searchParams.get('code');
  const next = normalizeRedirectPath(url.searchParams.get('next'));

  if (code) {
    const supabase = createSupabaseServerClient(cookies);
    await supabase.auth.exchangeCodeForSession(code);
  }

  redirect(303, next);
};
