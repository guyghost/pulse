import type { Mission } from '$lib/core/types/mission';

export type FeedState = 'empty' | 'loading' | 'loaded' | 'error';

/**
 * Build the lowercased, space-joined haystack of a mission's searchable
 * fields. Pure and query-independent, so it can be memoised in a `$derived`
 * that only recomputes when the *missions* change — not on every search
 * keystroke.
 *
 * Field set, ordering, and the `string && length > 0` guard are identical to
 * the previous inline implementation, so matching results are unchanged:
 * title → client → description → location → source → stack items.
 */
const buildSearchHaystack = (mission: Mission): string => {
  const parts: string[] = [];
  if (typeof mission.title === 'string' && mission.title.length > 0) {
    parts.push(mission.title);
  }
  if (typeof mission.client === 'string' && mission.client.length > 0) {
    parts.push(mission.client);
  }
  if (typeof mission.description === 'string' && mission.description.length > 0) {
    parts.push(mission.description);
  }
  if (typeof mission.location === 'string' && mission.location.length > 0) {
    parts.push(mission.location);
  }
  // mission.source is always a non-empty string enum value.
  parts.push(mission.source);
  for (const item of mission.stack) {
    if (typeof item === 'string' && item.length > 0) {
      parts.push(item);
    }
  }
  return parts.join(' ').toLowerCase();
};

/**
 * Filter missions by a precomputed lowercase query against a parallel array
 * of lowercased haystacks. Only the `.includes` check runs per query here;
 * the expensive haystack construction lives in `missionHaystacks` above and
 * is recomputed solely when missions change.
 */
const filterMissionsByQuery = (
  missions: Mission[],
  haystacks: string[],
  normalizedQuery: string
): Mission[] => {
  const matches: Mission[] = [];
  for (let i = 0; i < missions.length; i++) {
    if (haystacks[i].includes(normalizedQuery)) {
      matches.push(missions[i]);
    }
  }
  return matches;
};

export function createFeedStore() {
  let state = $state<FeedState>('empty');
  let missions = $state<Mission[]>([]);
  let searchQuery = $state('');
  let error = $state<string | null>(null);

  // Query-independent index: rebuilds only when missions change (new scan /
  // reload), not when the user types. Previously this work was redone for
  // every mission on every search.
  const missionHaystacks = $derived(missions.map((m) => buildSearchHaystack(m)));

  const filteredMissions = $derived.by(() => {
    const trimmed = searchQuery.trim();
    if (trimmed.length === 0) {
      return missions;
    }
    return filterMissionsByQuery(missions, missionHaystacks, trimmed.toLowerCase());
  });

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
