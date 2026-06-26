import { createServerClient } from '@supabase/ssr';
import { env } from '$env/dynamic/private';
import { env as pubEnv } from '$env/dynamic/public';
import type { Cookies } from '@sveltejs/kit';

type CookieOptions = Partial<Parameters<Cookies['set']>[2]>;
type CookieToSet = {
  name: string;
  value: string;
  options: CookieOptions;
};

export const createSupabaseServerClient = (cookies: Cookies) =>
  createServerClient(pubEnv.PUBLIC_SUPABASE_URL!, pubEnv.PUBLIC_SUPABASE_ANON_KEY!, {
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
  createServerClient(pubEnv.PUBLIC_SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
    cookies: {
      getAll: () => [],
      setAll: () => {},
    },
  });
