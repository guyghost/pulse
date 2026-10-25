import { createServerClient } from '@supabase/ssr';
import { SUPABASE_SERVICE_ROLE_KEY } from '$app/env/private';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$app/env/public';
import type { Cookies } from '@sveltejs/kit';

type CookieOptions = Partial<NonNullable<Parameters<Cookies['set']>[2]>>;
type CookieToSet = {
  name: string;
  value: string;
  options: CookieOptions;
};

export const createSupabaseServerClient = (cookies: Cookies) =>
  createServerClient(PUBLIC_SUPABASE_URL!, PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() {
        return cookies.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        cookiesToSet.forEach(({ name, value, options }) => {
          cookies.set(name, value, { ...options, path: options.path ?? '/' });
        });
      },
    },
  });

export const createSupabaseAdminClient = () =>
  createServerClient(PUBLIC_SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, {
    cookies: { getAll: () => [], setAll: () => {} },
  });
