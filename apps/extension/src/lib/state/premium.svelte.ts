/**
 * Premium State Store — tracks whether the user has premium (paid) features enabled.
 *
 * Routes through the facade/bridge pattern: side panel → facade → bridge →
 * service worker → chrome.storage.local. No direct chrome.* API calls.
 */

import { getPremium, savePremium as persistPremium } from '$lib/shell/facades/premium.facade';

function createPremiumStore() {
  let isPremium = $state(false);

  const load = async (): Promise<void> => {
    try {
      isPremium = await getPremium();
    } catch (e) {
      console.error('[premium] failed to load', e);
      isPremium = false;
    }
  };

  const setPremium = async (enabled: boolean): Promise<void> => {
    isPremium = enabled;
    try {
      await persistPremium(enabled);
    } catch (e) {
      console.error('[premium] failed to save', e);
      isPremium = !enabled;
    }
  };

  return {
    get isPremium() {
      return isPremium;
    },
    load,
    setPremium,
  };
}

export const premium = createPremiumStore();
