/**
 * Read-only Premium projection for the connected Pulse account.
 *
 * Routes through the facade/bridge pattern: side panel → facade → bridge →
 * service worker → chrome.storage.local. No direct chrome.* API calls.
 */

import { refreshExtensionEntitlement } from '$lib/shell/facades/premium.facade';
import type { ExtensionAccountProjection } from '$lib/shell/account/account-connection';
import { canUsePremiumFeature, type PremiumFeature } from '@pulse/domain';

function createPremiumStore() {
  let projection = $state<ExtensionAccountProjection | null>(null);

  const load = async (): Promise<void> => {
    try {
      projection = await refreshExtensionEntitlement();
    } catch (e) {
      console.error('[premium] failed to load', e);
      projection = null;
    }
  };

  const canUse = (feature: PremiumFeature, nowMs = Date.now()): boolean => {
    if (projection === null) {
      return false;
    }
    return canUsePremiumFeature({
      snapshot: projection.entitlement,
      accountState: projection.accountId === null ? 'anonymous' : 'active',
      accountId: projection.accountId,
      feature,
      nowMs,
    });
  };

  return {
    get isPremium() {
      return canUse('multi_account');
    },
    get projection() {
      return projection;
    },
    load,
    canUse,
  };
}

export const premium = createPremiumStore();
