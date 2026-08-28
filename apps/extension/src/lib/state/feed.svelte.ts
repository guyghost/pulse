import type { Mission } from '$lib/core/types/mission';

export type FeedState = 'empty' | 'loading' | 'loaded' | 'error';

/**
 * Normalized search haystack for one mission: same fields, same order, same
 * space-join and lowercasing as the previous inline logic. Pure — computed
 * once per mission when missions change, not on every search keystroke.
 */
const buildSearchHaystack = (mission: Mission): string =>
  [
    mission.title,
    mission.client,
    mission.description,
    mission.location,
    mission.source,
    ...mission.stack,
  ]
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .join(' ')
    .toLowerCase();

/**
 * Filters missions against a precomputed search index aligned with `missions`
 * by position. Semantics unchanged: trimmed lowercase substring match over the
 * joined searchable fields; empty/whitespace query returns missions untouched.
 */
const recomputeFilteredMissions = (
  missions: Mission[],
  searchIndex: string[],
  searchQuery: string
): Mission[] => {
  const query = searchQuery.trim().toLowerCase();
  if (!query) {
    return missions;
  }

  return missions.filter((_, index) => searchIndex[index].includes(query));
};

export function createFeedStore() {
  let state = $state<FeedState>('empty');
  let missions = $state<Mission[]>([]);
  let searchQuery = $state('');
  let error = $state<string | null>(null);

  // Lowercased haystacks per mission, rebuilt only when `missions` changes —
  // per-keystroke filtering reads this index instead of re-normalizing fields.
  // Plain string[] on purpose: no reactive collection needed since the array
  // is rebuilt wholesale on missions change.
  const searchIndex = $derived(missions.map(buildSearchHaystack));

  const filteredMissions = $derived(recomputeFilteredMissions(missions, searchIndex, searchQuery));

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

    reset() {
      missions = [];
      error = null;
      state = 'empty';
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
