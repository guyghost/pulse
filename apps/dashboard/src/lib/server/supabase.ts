import { createServerClient } from '@supabase/ssr';
import { env } from '$env/dynamic/public';
import type { Cookies } from '@sveltejs/kit';

type CookieOptions = Partial<Parameters<Cookies['set']>[2]>;
type CookieToSet = {
  name: string;
  value: string;
  options: CookieOptions;
};

export const createSupabaseServerClient = (cookies: Cookies) =>
  createServerClient(env.PUBLIC_SUPABASE_URL ?? '', env.PUBLIC_SUPABASE_ANON_KEY ?? '', {
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
