/**
 * Auth session storage — persists auth state in chrome.storage.local.
 * Shell module: I/O, async.
 */

import type { AuthUser } from '../../core/types/auth';

const AUTH_USER_KEY = 'auth_user';

/** Save the authenticated user info locally */
export const saveAuthUser = async (user: AuthUser): Promise<void> => {
  await chrome.storage.local.set({ [AUTH_USER_KEY]: user });
};

/** Load the locally cached auth user (may be stale) */
export const loadAuthUser = async (): Promise<AuthUser | null> => {
  const result = await chrome.storage.local.get(AUTH_USER_KEY);
  const raw = result[AUTH_USER_KEY];
  if (!raw || typeof raw !== 'object') {
    return null;
  }
  const obj = raw as Record<string, unknown>;
  if (typeof obj.id !== 'string' || typeof obj.email !== 'string') {
    return null;
  }
  return raw as AuthUser;
};

/** Clear cached auth user on logout */
export const clearAuthUser = async (): Promise<void> => {
  await chrome.storage.local.remove(AUTH_USER_KEY);
};
