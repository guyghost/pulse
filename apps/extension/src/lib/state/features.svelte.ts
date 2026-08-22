/**
 * Runtime holder for feature flags.
 *
 * Surface flags (per-tab + connected layer) and the premium flag both
 * initialise from pure core constants sourced via `@pulse/domain`. In dev
 * only, an override may be read from `localStorage` so the DevPanel can
 * flip surfaces between launch and full-catalog states for testing.
 *
 * Production never reads the overrides: the core constants are the source of
 * truth and will later be wired to remote config / feature flipping.
 *
 * See `apps/extension/src/models/surface-feature-flags.model.md` and
 * `apps/extension/src/models/premium-feature-flag.model.md`.
 */

import {
  EXTENSION_SURFACE_FLAGS,
  PREMIUM_FEATURE_ENABLED,
  resolveSurfaceFlags,
  type ExtensionSurfaceFeature,
  type ExtensionSurfaceFlags,
  type ExtensionTabId,
} from '$lib/core/features/flags';

/** Dev-only localStorage key overriding the premium feature flag. */
export const DEV_PREMIUM_FEATURE_STORAGE_KEY = '__missionpulse_dev_premium_feature';

/** Dev-only localStorage key overriding the user's premium status. */
export const DEV_PREMIUM_ENABLED_STORAGE_KEY = '__missionpulse_dev_premium_enabled';

/** Dev-only localStorage key (JSON object) overriding surface feature flags. */
export const DEV_SURFACE_FLAGS_STORAGE_KEY = '__missionpulse_dev_surface_flags';

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

function readDevSurfaceOverrides(): Record<string, unknown> | null {
  if (!import.meta.env.DEV) {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(DEV_SURFACE_FLAGS_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function createFeaturesStore() {
  const override = readDevOverride();
  const premiumFeatureActive = $state(override ?? PREMIUM_FEATURE_ENABLED);
  const surfaceFlags = $state<ExtensionSurfaceFlags>(
    resolveSurfaceFlags(readDevSurfaceOverrides(), EXTENSION_SURFACE_FLAGS)
  );

  return {
    get premiumFeatureActive() {
      return premiumFeatureActive;
    },
    get surfaceFlags(): ExtensionSurfaceFlags {
      return surfaceFlags;
    },
    isTabEnabled(tab: ExtensionTabId): boolean {
      return surfaceFlags[tab] === true;
    },
    isFeatureEnabled(feature: ExtensionSurfaceFeature): boolean {
      return surfaceFlags[feature] === true;
    },
  };
}

export const features = createFeaturesStore();
