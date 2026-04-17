/**
 * Auth state module — manages authentication state for the UI.
 *
 * Provides reactive access to auth status, user info, and premium status.
 * All operations delegated through the messaging bridge.
 */

import type { AuthStatus, AuthUser, PremiumStatus } from '$lib/core/types/auth';
import { isPremiumActive } from '$lib/core/types/auth';
import { sendMessage } from '$lib/shell/messaging/bridge';

export type AuthStoreState = 'idle' | 'loading' | 'ready' | 'error';

export function createAuthStore() {
  let storeState = $state<AuthStoreState>('idle');
  let authStatus = $state<AuthStatus>('unknown');
  let user = $state<AuthUser | null>(null);
  let error = $state<string | null>(null);

  // Derived values
  const isAuthenticated = $derived(authStatus === 'authenticated');
  const isPremium = $derived(isPremiumActive(user, Date.now()));
  const premiumStatus = $derived<PremiumStatus>(user?.premiumStatus ?? 'free');

  /**
   * Check current auth status via bridge.
   * Called on app startup.
   */
  async function checkStatus(): Promise<void> {
    storeState = 'loading';
    error = null;

    try {
      const response = await sendMessage({ type: 'AUTH_STATUS' });

      if (response.type === 'AUTH_RESULT') {
        const payload = response.payload as {
          status: AuthStatus;
          user: AuthUser | null;
          error?: string;
        };
        authStatus = payload.status;
        user = payload.user;
        if (payload.error) {
          error = payload.error;
        }
        storeState = 'ready';
      }
    } catch {
      // Outside extension context or error
      storeState = 'ready';
      authStatus = 'unauthenticated';
    }
  }

  /**
   * Log in with email/password.
   */
  async function login(
    email: string,
    password: string
  ): Promise<{ success: boolean; error?: string }> {
    storeState = 'loading';
    error = null;

    try {
      const response = await sendMessage({
        type: 'AUTH_LOGIN',
        payload: { email, password },
      });

      if (response.type === 'AUTH_RESULT') {
        const payload = response.payload as {
          status: AuthStatus;
          user: AuthUser | null;
          error?: string;
        };
        authStatus = payload.status;
        user = payload.user;
        storeState = 'ready';

        if (payload.error) {
          error = payload.error;
          return { success: false, error: payload.error };
        }
        return { success: authStatus === 'authenticated' };
      }
      return { success: false, error: 'Unexpected response' };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Login failed';
      error = msg;
      storeState = 'error';
      return { success: false, error: msg };
    }
  }

  /**
   * Sign up with email/password.
   */
  async function signup(
    email: string,
    password: string
  ): Promise<{ success: boolean; error?: string }> {
    storeState = 'loading';
    error = null;

    try {
      const response = await sendMessage({
        type: 'AUTH_SIGNUP',
        payload: { email, password },
      });

      if (response.type === 'AUTH_RESULT') {
        const payload = response.payload as {
          status: AuthStatus;
          user: AuthUser | null;
          error?: string;
        };
        authStatus = payload.status;
        user = payload.user;
        storeState = 'ready';

        if (payload.error) {
          error = payload.error;
          return { success: false, error: payload.error };
        }
        return { success: authStatus === 'authenticated' };
      }
      return { success: false, error: 'Unexpected response' };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Signup failed';
      error = msg;
      storeState = 'error';
      return { success: false, error: msg };
    }
  }

  /**
   * Log out the current user.
   */
  async function logout(): Promise<void> {
    try {
      await sendMessage({ type: 'AUTH_LOGOUT' });
    } catch {
      // Ignore errors on logout
    }
    authStatus = 'unauthenticated';
    user = null;
    error = null;
    storeState = 'ready';
  }

  return {
    get storeState() {
      return storeState;
    },
    get authStatus() {
      return authStatus;
    },
    get user() {
      return user;
    },
    get error() {
      return error;
    },
    get isAuthenticated() {
      return isAuthenticated;
    },
    get isPremium() {
      return isPremium;
    },
    get premiumStatus() {
      return premiumStatus;
    },
    checkStatus,
    login,
    signup,
    logout,
  };
}
