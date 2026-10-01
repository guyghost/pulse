import { SvelteDate } from 'svelte/reactivity';
import type { TJMFilters, TJMPeriod, TJMSampleAnalysis } from '../core/types/tjm';
import { getTJMDataFreshness } from '../core/tjm-history';
import { getTJMAnalysis } from '../shell/facades/tjm.facade';
import { getProfile } from '../shell/facades/settings.facade';
import { subscribeMessages } from '../shell/messaging/bridge';

export function createTJMPageState() {
  let analysis = $state<TJMSampleAnalysis | null>(null);
  let isLoading = $state(true);
  let error = $state<string | null>(null);
  let filters = $state<TJMFilters>({ period: 'all' });
  let profileStacks = $state<string[]>([]);
  let profileCalibrated = $state(false);
  let userTjmMin = $state(0);
  let referenceTime = $state(Date.now());
  let requestSeq = 0;
  let profileSeq = 0;
  let disposed = false;
  const freshness = $derived(
    getTJMDataFreshness(analysis?.lastUpdated ?? null, new SvelteDate(referenceTime))
  );

  async function refresh() {
    const sequence = ++requestSeq;
    isLoading = true;
    error = null;
    try {
      const result = await getTJMAnalysis(
        profileStacks.length ? [...profileStacks] : undefined,
        filters.region,
        filters.period,
        {
          ...(filters.category ? { category: filters.category } : {}),
          ...(filters.seniority ? { seniority: filters.seniority } : {}),
          ...(filters.remote ? { remote: filters.remote } : {}),
        }
      );
      if (disposed || sequence !== requestSeq) {
        return;
      }
      if (result === null) {
        throw new Error('Impossible de lire les annonces locales. Réessayez.');
      }
      analysis = result;
      referenceTime = Date.now();
    } catch (cause) {
      if (disposed || sequence !== requestSeq) {
        return;
      }
      analysis = null;
      error = cause instanceof Error ? cause.message : 'Impossible de charger l’analyse TJM.';
    } finally {
      if (!disposed && sequence === requestSeq) {
        isLoading = false;
      }
    }
  }
  async function loadProfile() {
    const sequence = ++profileSeq;
    try {
      const profile = await getProfile();
      if (disposed || sequence !== profileSeq) {
        return;
      }
      profileStacks = profile?.keywords ?? [];
      userTjmMin = profile?.tjmMin ?? 0;
      profileCalibrated =
        !!profile &&
        profile.tjmMin > 0 &&
        profile.seniority !== null &&
        (profile.tjmMax === null || profile.tjmMax >= profile.tjmMin);
    } catch {
      // Local sample remains usable when the profile cannot be read.
    }
    if (!disposed && sequence === profileSeq) {
      await refresh();
    }
  }
  return {
    get analysis() {
      return analysis;
    },
    get isLoading() {
      return isLoading;
    },
    get error() {
      return error;
    },
    get filters() {
      return filters;
    },
    get freshness() {
      return freshness;
    },
    get profileStacks() {
      return profileStacks;
    },
    get profileCalibrated() {
      return profileCalibrated;
    },
    get userTjmMin() {
      return userTjmMin;
    },
    refresh,
    setFilter<K extends keyof TJMFilters>(key: K, value: TJMFilters[K]) {
      if (filters[key] === value) {
        return;
      }
      filters = { ...filters, [key]: value };
      void refresh();
    },
    reset() {
      filters = { period: 'all' };
      void refresh();
    },
    selectPeriod(period: TJMPeriod) {
      this.setFilter('period', period);
    },
    init() {
      disposed = false;
      void loadProfile();
      const unsubscribe = subscribeMessages((message) => {
        if (message.type === 'SCAN_COMPLETE') {
          void refresh();
        }
        if (message.type === 'PROFILE_UPDATED') {
          void loadProfile();
        }
      });
      return () => {
        disposed = true;
        requestSeq++;
        profileSeq++;
        unsubscribe();
      };
    },
  };
}
