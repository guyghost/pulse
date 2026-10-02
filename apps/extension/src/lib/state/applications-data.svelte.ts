import type { Mission } from '$lib/core/types/mission';
import { createTrackingStore } from './tracking.svelte';
import { getMissions } from '$lib/shell/facades/feed-data.facade';

type TrackingStore = ReturnType<typeof createTrackingStore>;
export interface ApplicationsDataDeps {
  getMissions(): Promise<Mission[]>;
  createTrackingStore(): TrackingStore;
}

/** Publish missions and tracking together; stale reads cannot replace local mutations. */
export function createApplicationsDataState(
  deps: ApplicationsDataDeps = { getMissions, createTrackingStore }
) {
  let tracking = $state.raw(deps.createTrackingStore());
  let missions = $state<Mission[]>([]);
  let hasSnapshot = $state(false);
  let refreshing = $state(false);
  let error = $state<string | null>(null);
  let sequence = 0;
  let mutations = 0;
  let pendingRefresh = false;
  let disposed = false;

  async function refresh(): Promise<boolean> {
    if (disposed) {
      return false;
    }
    if (mutations > 0) {
      pendingRefresh = true;
      return false;
    }
    const request = ++sequence;
    refreshing = true;
    error = null;
    const candidate = deps.createTrackingStore();
    try {
      const [loadedMissions] = await Promise.all([deps.getMissions(), candidate.loadTrackings()]);
      if (disposed || request !== sequence) {
        return false;
      }
      missions = loadedMissions;
      tracking = candidate;
      hasSnapshot = true;
      return true;
    } catch (cause) {
      if (!disposed && request === sequence) {
        error =
          cause instanceof Error
            ? cause.message
            : 'Impossible de charger le suivi des candidatures.';
      }
      return false;
    } finally {
      if (!disposed && request === sequence) {
        refreshing = false;
      }
    }
  }

  return {
    get tracking() {
      return tracking;
    },
    get missions() {
      return missions;
    },
    get hasSnapshot() {
      return hasSnapshot;
    },
    get refreshing() {
      return refreshing;
    },
    get isLoading() {
      return !hasSnapshot && refreshing;
    },
    get error() {
      return error;
    },
    refresh,
    async mutate<T>(operation: (store: TrackingStore) => Promise<T>): Promise<T> {
      pendingRefresh ||= refreshing;
      ++sequence;
      refreshing = false;
      mutations++;
      try {
        return await operation(tracking);
      } finally {
        mutations--;
        if (mutations === 0 && pendingRefresh && !disposed) {
          pendingRefresh = false;
          void refresh();
        }
      }
    },
    dispose() {
      disposed = true;
      ++sequence;
    },
  };
}
