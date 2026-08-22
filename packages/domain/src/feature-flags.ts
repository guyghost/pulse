/**
 * Surface feature flags — shared launch configuration.
 *
 * Single source of truth for which extension surfaces (tabs + connected
 * layer) ship enabled. Consumed by BOTH apps:
 *
 * - `@pulse/extension` — gates navigation, preloading and the connected
 *   account section (wrapped by `core/features/flags.ts`, never imported
 *   from shell directly by UI).
 * - `@pulse/landing` — aligns the marketing discourse (`featureMatrix`,
 *   plan cards, captions) with what the extension actually ships.
 *
 * Pure data + pure functions only: no I/O, no time, no randomness, no LLM.
 * Authoritative model: `apps/extension/src/models/surface-feature-flags.model.md`.
 */

/** Tabs of the extension side panel. Onboarding is NOT a tab: never gated. */
export type ExtensionTabId = 'feed' | 'profile' | 'cv' | 'applications' | 'tjm' | 'settings';

/** All flippable surface features: one key per tab, plus the connected layer. */
export type ExtensionSurfaceFeature = ExtensionTabId | 'connected';

/** Immutable flag map. Every key must be present — no implicit defaults. */
export type ExtensionSurfaceFlags = Record<ExtensionSurfaceFeature, boolean>;

/**
 * Launch configuration.
 *
 * `applications` (suivi de candidatures) and `connected` (dashboard connecté
 * + synchronisation) are DISABLED at launch. Flip to `true` to ship them.
 */
export const EXTENSION_SURFACE_FLAGS: ExtensionSurfaceFlags = {
  feed: true,
  profile: true,
  cv: true,
  applications: false,
  tjm: true,
  settings: true,
  connected: false,
};

/** Ordered tab catalogue used for fallback resolution and nav ordering. */
export const EXTENSION_TAB_ORDER: readonly ExtensionTabId[] = [
  'feed',
  'profile',
  'cv',
  'applications',
  'tjm',
  'settings',
];

/**
 * Coerces an untyped stored override into a strict boolean per key.
 *
 * Storage is untyped: the string `'false'` is truthy and would wrongly enable
 * a surface. Only strict booleans are trusted; anything else falls back to
 * the launch constant for that key.
 */
export function resolveSurfaceFlags(
  overrides: Record<string, unknown> | null | undefined,
  defaults: ExtensionSurfaceFlags = EXTENSION_SURFACE_FLAGS
): ExtensionSurfaceFlags {
  const resolved = { ...defaults };
  if (!overrides) {
    return resolved;
  }
  for (const key of Object.keys(defaults) as ExtensionSurfaceFeature[]) {
    const value = overrides[key];
    if (typeof value === 'boolean') {
      resolved[key] = value;
    }
  }
  return resolved;
}

/** Pure predicate: is the given tab enabled under these flags? */
export function isTabEnabled(flags: ExtensionSurfaceFlags, tab: ExtensionTabId): boolean {
  return flags[tab] === true;
}

/**
 * Fallback page invariant: navigation needs at least one enabled tab.
 *
 * Returns `feed` when enabled (the canonical home), otherwise the first
 * enabled tab in {@link EXTENSION_TAB_ORDER}. When every tab is disabled
 * (misconfiguration), still returns `feed` so the shell can never end up
 * without a renderable page.
 */
export function resolveFallbackTab(flags: ExtensionSurfaceFlags): ExtensionTabId {
  if (isTabEnabled(flags, 'feed')) {
    return 'feed';
  }
  return EXTENSION_TAB_ORDER.find((tab) => isTabEnabled(flags, tab)) ?? 'feed';
}
