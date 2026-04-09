/**
 * Auth types — pure types for authentication and premium status.
 * Core module: no I/O, no async, no side effects.
 */

/** User authentication state */
export type AuthStatus = 'unknown' | 'unauthenticated' | 'authenticated';

/** Premium subscription status — matches profiles.subscription_status in Supabase */
export type PremiumStatus = 'free' | 'premium' | 'expired';

/** Authenticated user info stored locally */
export interface AuthUser {
  readonly id: string;
  readonly email: string;
  readonly premiumStatus: PremiumStatus;
  readonly premiumExpiresAt: number | null; // epoch ms
}

/** Full auth state for the UI */
export interface AuthState {
  readonly status: AuthStatus;
  readonly user: AuthUser | null;
}

/**
 * Check if user has active premium.
 * Pure function — `now` is injected, no Date.now() in Core.
 */
export const isPremiumActive = (user: AuthUser | null, now: number): boolean => {
  if (!user) return false;
  if (user.premiumStatus !== 'premium') return false;
  if (user.premiumExpiresAt && user.premiumExpiresAt < now) return false;
  return true;
};
