import { setup, assign } from 'xstate';
import type { Mission } from '../lib/core/types/mission';

type FeedContext = {
  missions: Mission[];
  filteredMissions: Mission[];
  searchQuery: string;
  error: string | null;
};

type FeedEvent =
  | { type: 'LOAD' }
  | { type: 'MISSIONS_LOADED'; missions: Mission[] }
  | { type: 'LOAD_ERROR'; error: string }
  | { type: 'SEARCH'; query: string }
  | { type: 'CLEAR_SEARCH' };

/**
 * Pure function that recomputes filtered missions from search query.
 */
const recomputeFilteredMissions = (
  missions: Mission[],
  searchQuery: string,
): Mission[] => {
  if (!searchQuery.trim()) return missions;

  const query = searchQuery.toLowerCase().trim();
  return missions.filter(
    (m) =>
      (m.title ?? '').toLowerCase().includes(query) ||
      m.stack.some((s) => s && s.toLowerCase().includes(query)) ||
      ((m.description ?? '').toLowerCase().includes(query)),
  );
};

export const feedMachine = setup({
  types: {
    context: {} as FeedContext,
    events: {} as FeedEvent,
  },
  actions: {
    setMissions: assign({
      missions: ({ event }) => {
        if (event.type === 'MISSIONS_LOADED') return event.missions;
        return [];
      },
      filteredMissions: ({ event, context }) => {
        if (event.type === 'MISSIONS_LOADED') {
          return recomputeFilteredMissions(event.missions, context.searchQuery);
        }
        return [];
      },
      error: () => null,
    }),
    setError: assign({
      error: ({ event }) => {
        if (event.type === 'LOAD_ERROR') return event.error;
        return null;
      },
    }),
    setSearch: assign({
      searchQuery: ({ event }) => {
        if (event.type === 'SEARCH') return event.query;
        return '';
      },
      filteredMissions: ({ context, event }) => {
        const newQuery = event.type === 'SEARCH' ? event.query : context.searchQuery;
        return recomputeFilteredMissions(context.missions, newQuery);
      },
    }),
    clearSearch: assign({
      searchQuery: () => '',
      filteredMissions: ({ context }) =>
        recomputeFilteredMissions(context.missions, ''),
    }),
  },
}).createMachine({
  id: 'feed',
  initial: 'empty',
  context: {
    missions: [],
    filteredMissions: [],
    searchQuery: '',
    error: null,
  },
  on: {
    MISSIONS_LOADED: {
      target: '.loaded',
      actions: 'setMissions',
    },
    LOAD: '.loading',
  },
  states: {
    empty: {},
    loading: {
      on: {
        LOAD_ERROR: {
          target: 'error',
          actions: 'setError',
        },
      },
    },
    loaded: {
      on: {
        SEARCH: {
          actions: 'setSearch',
        },
        CLEAR_SEARCH: {
          actions: 'clearSearch',
        },
        LOAD_ERROR: {
          actions: 'setError',
        },
      },
    },
    error: {},
  },
});
