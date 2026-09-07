import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import {
  PREMIUM_FEATURE_ENABLED,
  shouldPremiumGate,
  canAccessPremium,
  resolvePremiumFeatureFlag,
  EXTENSION_SURFACE_FLAGS,
  EXTENSION_TAB_ORDER,
  SURFACE_FEATURE_KEYS,
  resolveSurfaceFlags,
  isTabEnabled,
  resolveFallbackTab,
} from '../../../src/lib/core/features/flags';

describe('EXTENSION_SURFACE_FLAGS (launch defaults)', () => {
  it('ships tracking and connected surfaces disabled at launch', () => {
    expect(EXTENSION_SURFACE_FLAGS.applications).toBe(false);
    expect(EXTENSION_SURFACE_FLAGS.connected).toBe(false);
  });

  it('keeps every other surface enabled', () => {
    expect(EXTENSION_SURFACE_FLAGS.feed).toBe(true);
    expect(EXTENSION_SURFACE_FLAGS.profile).toBe(true);
    expect(EXTENSION_SURFACE_FLAGS.cv).toBe(true);
    expect(EXTENSION_SURFACE_FLAGS.tjm).toBe(true);
    expect(EXTENSION_SURFACE_FLAGS.settings).toBe(true);
  });

  it('exposes one flag key per tab plus the connected layer', () => {
    expect([...SURFACE_FEATURE_KEYS].sort()).toEqual([...EXTENSION_TAB_ORDER, 'connected'].sort());
  });
});

describe('resolveSurfaceFlags', () => {
  it('returns launch defaults when no override exists', () => {
    expect(resolveSurfaceFlags(undefined)).toEqual(EXTENSION_SURFACE_FLAGS);
    expect(resolveSurfaceFlags(null)).toEqual(EXTENSION_SURFACE_FLAGS);
    expect(resolveSurfaceFlags({})).toEqual(EXTENSION_SURFACE_FLAGS);
  });

  it('trusts strict booleans only', () => {
    const resolved = resolveSurfaceFlags({ applications: true, feed: false });
    expect(resolved.applications).toBe(true);
    expect(resolved.feed).toBe(false);
  });

  it('rejects truthy non-boolean values such as the string "false"', () => {
    const resolved = resolveSurfaceFlags({
      applications: 'false',
      connected: 'true',
      feed: 1,
      tjm: 0,
    });
    expect(resolved.applications).toBe(EXTENSION_SURFACE_FLAGS.applications);
    expect(resolved.connected).toBe(EXTENSION_SURFACE_FLAGS.connected);
    expect(resolved.feed).toBe(EXTENSION_SURFACE_FLAGS.feed);
    expect(resolved.tjm).toBe(EXTENSION_SURFACE_FLAGS.tjm);
  });

  it('ignores unknown keys instead of crashing', () => {
    const resolved = resolveSurfaceFlags({ onboarding: true, bogus: 'x' });
    expect(Object.keys(resolved).sort()).toEqual([...SURFACE_FEATURE_KEYS].sort());
  });

  it('force-re-enables feed when overrides disable every tab (never all-off)', () => {
    const allOff = Object.fromEntries(EXTENSION_TAB_ORDER.map((tab) => [tab, false])) as Record<
      string,
      boolean
    >;
    const resolved = resolveSurfaceFlags(allOff);
    expect(resolved.feed).toBe(true);
    expect(resolveFallbackTab(resolved)).toBe('feed');
  });
});

describe('isTabEnabled', () => {
  it('reflects the flag value for the tab', () => {
    expect(isTabEnabled(EXTENSION_SURFACE_FLAGS, 'applications')).toBe(false);
    expect(isTabEnabled(EXTENSION_SURFACE_FLAGS, 'feed')).toBe(true);
  });
});

describe('resolveFallbackTab', () => {
  it('returns feed when feed is enabled (canonical home)', () => {
    expect(resolveFallbackTab(EXTENSION_SURFACE_FLAGS)).toBe('feed');
  });

  it('returns the first enabled tab when feed is disabled', () => {
    const allOff = Object.fromEntries(
      EXTENSION_TAB_ORDER.map((tab) => [tab, false])
    ) as typeof EXTENSION_SURFACE_FLAGS;
    allOff.profile = true;
    expect(resolveFallbackTab(allOff)).toBe('profile');
  });

  it('still returns feed when every tab is disabled (misconfiguration guard)', () => {
    const allOff = Object.fromEntries(
      EXTENSION_TAB_ORDER.map((tab) => [tab, false])
    ) as typeof EXTENSION_SURFACE_FLAGS;
    expect(resolveFallbackTab(allOff)).toBe('feed');
  });
});

describe('PREMIUM_FEATURE_ENABLED', () => {
  it('is dormant by default so the extension ships unlocked', () => {
    expect(PREMIUM_FEATURE_ENABLED).toBe(false);
  });
});

describe('shouldPremiumGate', () => {
  it('never gates when the feature is dormant, regardless of premium status', () => {
    expect(shouldPremiumGate(false, false)).toBe(false);
    expect(shouldPremiumGate(false, true)).toBe(false);
  });

  it('does not gate premium users when the feature is active', () => {
    expect(shouldPremiumGate(true, true)).toBe(false);
  });

  it('gates only free users when the feature is active', () => {
    expect(shouldPremiumGate(true, false)).toBe(true);
  });
});

describe('canAccessPremium', () => {
  it('is the inverse of shouldPremiumGate across the truth table', () => {
    for (const featureActive of [false, true]) {
      for (const isPremium of [false, true]) {
        expect(canAccessPremium(featureActive, isPremium)).toBe(
          !shouldPremiumGate(featureActive, isPremium)
        );
      }
    }
  });

  it('unlocks everything while dormant', () => {
    expect(canAccessPremium(false, false)).toBe(true);
    expect(canAccessPremium(false, true)).toBe(true);
  });
});

describe('resolvePremiumFeatureFlag', () => {
  it('trusts strict booleans', () => {
    expect(resolvePremiumFeatureFlag(true)).toBe(true);
    expect(resolvePremiumFeatureFlag(false)).toBe(false);
  });

  it('falls back to the dormant default when the value is missing', () => {
    expect(resolvePremiumFeatureFlag(undefined)).toBe(PREMIUM_FEATURE_ENABLED);
    expect(resolvePremiumFeatureFlag(null)).toBe(PREMIUM_FEATURE_ENABLED);
  });

  it('rejects truthy non-boolean values such as the string "false"', () => {
    expect(resolvePremiumFeatureFlag('false')).toBe(PREMIUM_FEATURE_ENABLED);
    expect(resolvePremiumFeatureFlag('true')).toBe(PREMIUM_FEATURE_ENABLED);
    expect(resolvePremiumFeatureFlag(1)).toBe(PREMIUM_FEATURE_ENABLED);
    expect(resolvePremiumFeatureFlag(0)).toBe(PREMIUM_FEATURE_ENABLED);
  });
});

describe('packaged e2e surface derivation', () => {
  // Packaged builds expose no DEV override, so the mv3 navigation test must
  // traverse exactly the tabs the launch flags enable — never a static list
  // that can drift out of sync (see models/surface-feature-flags.model.md).
  it('derives navigationSurfaces from EXTENSION_TAB_ORDER filtered by the flags', () => {
    const source = readFileSync('tests/e2e-extension/navigation.test.ts', 'utf8');
    expect(source).toContain('EXTENSION_TAB_ORDER.filter');
    expect(source).toContain('EXTENSION_SURFACE_FLAGS[tab]');
    expect(source).not.toMatch(/const navigationSurfaces: NavigationSurface\[\] = \[/);
  });
});
