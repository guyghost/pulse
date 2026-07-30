import { env } from '$env/dynamic/private';
import { PREMIUM_YEARLY_OFFER } from '@pulse/domain';

const CONSERVATIVE_DEFAULT_MAX_BINDINGS_PER_CONNECTOR = 2;
const DEFAULT_ENTITLEMENT_CACHE_TTL_HOURS = 24;

function parseBoundedInteger(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number
): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    return fallback;
  }
  return parsed;
}

export function getPremiumServerConfig() {
  const expectedTestMode =
    env.LEMON_SQUEEZY_EXPECTED_TEST_MODE === 'true'
      ? true
      : env.LEMON_SQUEEZY_EXPECTED_TEST_MODE === 'false'
        ? false
        : null;

  return {
    offer: PREMIUM_YEARLY_OFFER,
    storeId: env.LEMON_SQUEEZY_STORE_ID ?? null,
    variantId: env.LEMON_SQUEEZY_PREMIUM_YEARLY_VARIANT_ID ?? null,
    apiKey: env.LEMON_SQUEEZY_API_KEY ?? null,
    expectedTestMode,
    premiumMaxBindingsPerConnector: parseBoundedInteger(
      env.PREMIUM_MAX_BINDINGS_PER_CONNECTOR,
      CONSERVATIVE_DEFAULT_MAX_BINDINGS_PER_CONNECTOR,
      2,
      20
    ),
    entitlementCacheTtlHours: parseBoundedInteger(
      env.PREMIUM_ENTITLEMENT_CACHE_TTL_HOURS,
      DEFAULT_ENTITLEMENT_CACHE_TTL_HOURS,
      1,
      168
    ),
  };
}
