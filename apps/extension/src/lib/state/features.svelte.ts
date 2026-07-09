/**
 * Runtime holder for feature flags.
 *
 * Initialises from the pure core constant {@link PREMIUM_FEATURE_ENABLED}. In
 * dev only, an override may be read from `localStorage` so the DevPanel can
 * switch the premium feature between dormant and active states for testing.
 *
 * Production never reads the override: the core constant is the source of
 * truth and will later be wired to remote config / feature flipping.
 *
 * See `apps/extension/src/models/premium-feature-flag.model.md`.
 */

import { PREMIUM_FEATURE_ENABLED } from '$lib/core/features/flags';

/** Dev-only localStorage key overriding the premium feature flag. */
export const DEV_PREMIUM_FEATURE_STORAGE_KEY = '__missionpulse_dev_premium_feature';

/** Dev-only localStorage key overriding the user's premium status. */
export const DEV_PREMIUM_ENABLED_STORAGE_KEY = '__missionpulse_dev_premium_enabled';

function readDevOverride(): boolean | null {
  if (!import.meta.env.DEV) {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(DEV_PREMIUM_FEATURE_STORAGE_KEY);
    if (raw === 'true') {
      return true;
    }
    if (raw === 'false') {
      return false;
    }
    return null;
  } catch {
    return null;
  }
}

function createFeaturesStore() {
  const override = readDevOverride();
  const premiumFeatureActive = $state(override ?? PREMIUM_FEATURE_ENABLED);

  return {
    get premiumFeatureActive() {
      return premiumFeatureActive;
    },
  };
}

export const features = createFeaturesStore();
