import type { Mission } from '$lib/core/types/mission';

export type FeedState = 'empty' | 'loading' | 'loaded' | 'error';

const recomputeFilteredMissions = (missions: Mission[], searchQuery: string): Mission[] => {
  if (!searchQuery.trim()) {
    return missions;
  }

  const query = searchQuery.toLowerCase().trim();
  return missions.filter(
    (m) =>
      (m.title ?? '').toLowerCase().includes(query) ||
      m.stack.some((s) => s && s.toLowerCase().includes(query)) ||
      (m.description ?? '').toLowerCase().includes(query)
  );
};

export function createFeedStore() {
  let state = $state<FeedState>('empty');
  let missions = $state<Mission[]>([]);
  let searchQuery = $state('');
  let error = $state<string | null>(null);

  const filteredMissions = $derived(recomputeFilteredMissions(missions, searchQuery));

  return {
    get state() {
      return state;
    },
    get missions() {
      return missions;
    },
    get filteredMissions() {
      return filteredMissions;
    },
    get searchQuery() {
      return searchQuery;
    },
    get error() {
      return error;
    },

    load() {
      state = 'loading';
      error = null;
    },

    setMissions(newMissions: Mission[]) {
      missions = newMissions;
      error = null;
      state = 'loaded';
    },

    setError(msg: string) {
      error = msg;
      state = 'error';
    },

    search(query: string) {
      searchQuery = query;
    },

    clearSearch() {
      searchQuery = '';
    },
  };
}
