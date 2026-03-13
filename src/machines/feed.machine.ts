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
  | { type: 'CLEAR_SEARCH' }
  | { type: 'FILTER'; missions: Mission[] }
  | { type: 'CLEAR_FILTERS' }
  | { type: 'REFRESH' };

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
      filteredMissions: ({ event }) => {
        if (event.type === 'MISSIONS_LOADED') return event.missions;
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
        if (event.type !== 'SEARCH') return context.filteredMissions;
        const query = event.query.toLowerCase();
        return context.missions.filter(
          (m) =>
            m.title.toLowerCase().includes(query) ||
            m.stack.some((s) => s.toLowerCase().includes(query)) ||
            (m.description?.toLowerCase().includes(query) ?? false),
        );
      },
    }),
    clearSearch: assign({
      searchQuery: () => '',
      filteredMissions: ({ context }) => context.missions,
    }),
    applyFilter: assign({
      filteredMissions: ({ event }) => {
        if (event.type === 'FILTER') return event.missions;
        return [];
      },
    }),
    clearFilters: assign({
      filteredMissions: ({ context }) => context.missions,
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
  states: {
    empty: {
      on: {
        LOAD: 'loading',
      },
    },
    loading: {
      on: {
        MISSIONS_LOADED: {
          target: 'loaded',
          actions: 'setMissions',
        },
        LOAD_ERROR: {
          target: 'error',
          actions: 'setError',
        },
      },
    },
    loaded: {
      on: {
        SEARCH: {
          target: 'searching',
          actions: 'setSearch',
        },
        FILTER: {
          target: 'filtered',
          actions: 'applyFilter',
        },
        REFRESH: 'loading',
      },
    },
    searching: {
      on: {
        SEARCH: {
          actions: 'setSearch',
        },
        CLEAR_SEARCH: {
          target: 'loaded',
          actions: 'clearSearch',
        },
        FILTER: {
          target: 'filtered',
          actions: 'applyFilter',
        },
        REFRESH: 'loading',
      },
    },
    filtered: {
      on: {
        CLEAR_FILTERS: {
          target: 'loaded',
          actions: 'clearFilters',
        },
        SEARCH: {
          target: 'searching',
          actions: 'setSearch',
        },
        REFRESH: 'loading',
      },
    },
    error: {
      on: {
        REFRESH: 'loading',
      },
    },
  },
});
