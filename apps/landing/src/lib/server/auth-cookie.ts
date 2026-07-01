import type { Cookies } from '@sveltejs/kit';

export function hasSupabaseAuthCookie(cookies: Cookies): boolean {
  return cookies
    .getAll()
    .some(({ name }) => name.startsWith('sb-') && name.endsWith('-auth-token'));
}
