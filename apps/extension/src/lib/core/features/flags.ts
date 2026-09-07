/**
 * Feature flags — pure core.
 *
 * Two orthogonal dimensions:
 *
 * 1. Surface flags (per-tab + connected layer) — shared with the landing via
 *    `@pulse/domain`. See `apps/extension/src/models/surface-feature-flags.model.md`.
 * 2. The premium feature flag — the single switch that deactivates (or later
 *    re-enables) the entire premium system. When dormant (`false`), every
 *    premium-gated surface is unlocked and `isPremium` is irrelevant.
 *
 * See `apps/extension/src/models/premium-feature-flag.model.md` for the
 * authoritative premium state model, truth table, and invariants.
 */
import {
  EXTENSION_SURFACE_FLAGS,
  EXTENSION_TAB_ORDER,
  type ExtensionSurfaceFeature,
  type ExtensionTabId,
} from '@pulse/domain';

export {
  EXTENSION_SURFACE_FLAGS,
  EXTENSION_TAB_ORDER,
  resolveSurfaceFlags,
  isTabEnabled,
  resolveFallbackTab,
} from '@pulse/domain';
export type { ExtensionSurfaceFeature, ExtensionSurfaceFlags, ExtensionTabId } from '@pulse/domain';

/** Tab ids as a local union for navigation typing. */
export type FlippableTabId = ExtensionTabId;

/** All flippable surface feature keys (tabs + connected layer). */
export const SURFACE_FEATURE_KEYS: readonly ExtensionSurfaceFeature[] = Object.keys(
  EXTENSION_SURFACE_FLAGS
) as ExtensionSurfaceFeature[];

/** Ordered tab catalogue mirroring the shared domain constant. */
export const FLIPPABLE_TAB_ORDER: readonly ExtensionTabId[] = EXTENSION_TAB_ORDER;

/**
 * Whether the premium feature is active (gating enforced).
 *
 * Default is `false` (dormant): the extension ships with all premium-gated
 * surfaces unlocked. Flip to `true` later via feature flipping to re-enable
 * gating based on the user's `isPremium` status.
 */
export const PREMIUM_FEATURE_ENABLED = false;

/**
 * Pure gating decision.
 *
 * Returns `true` only when the premium feature is active AND the user is not
 * premium. When the feature is dormant, this is always `false` regardless of
 * `isPremium` — nothing is gated.
 *
 * Truth table:
 *   featureActive=false → false (dormant, everything unlocked)
 *   featureActive=true,  isPremium=true  → false (premium user, unlocked)
 *   featureActive=true,  isPremium=false → true  (free user, gates apply)
 */
export function shouldPremiumGate(featureActive: boolean, isPremium: boolean): boolean {
  return featureActive && !isPremium;
}

/**
 * Pure access decision for premium surfaces.
 *
 * Inverse of {@link shouldPremiumGate}. This is the single expression every UI
 * surface uses to decide whether premium pages/features are reachable.
 */
export function canAccessPremium(featureActive: boolean, isPremium: boolean): boolean {
  return !shouldPremiumGate(featureActive, isPremium);
}

/**
 * Coerces an untyped stored value into a valid feature-flag boolean.
 *
 * Storage (`chrome.storage.local` / localStorage / JSON) is untyped and may
 * hold non-boolean values such as the string `'false'`, which is truthy and
 * would otherwise incorrectly activate gating. Only a strict boolean is
 * trusted; anything else falls back to {@link PREMIUM_FEATURE_ENABLED}.
 */
export function resolvePremiumFeatureFlag(stored: unknown): boolean {
  return typeof stored === 'boolean' ? stored : PREMIUM_FEATURE_ENABLED;
}
