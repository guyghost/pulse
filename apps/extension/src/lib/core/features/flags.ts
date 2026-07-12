/**
 * Feature flags — pure core.
 *
 * The premium feature flag is the single switch that deactivates (or later
 * re-enables) the entire premium system. When dormant (`false`), every
 * premium-gated surface is unlocked and `isPremium` is irrelevant.
 *
 * See `apps/extension/src/models/premium-feature-flag.model.md` for the
 * authoritative state model, truth table, and invariants.
 */

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
