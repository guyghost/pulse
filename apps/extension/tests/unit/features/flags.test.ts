import { describe, it, expect } from 'vitest';
import {
  PREMIUM_FEATURE_ENABLED,
  shouldPremiumGate,
  canAccessPremium,
  resolvePremiumFeatureFlag,
} from '../../../src/lib/core/features/flags';

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
