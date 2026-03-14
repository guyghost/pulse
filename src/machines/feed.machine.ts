import { setup, assign } from 'xstate';
import type { Mission, MissionSource, RemoteType } from '../lib/core/types/mission';

/**
 * Active filters for mission filtering.
 * Empty arrays/null values mean "no filter" for that criterion.
 */
type ActiveFilters = {
  sources: MissionSource[];  // empty = all sources
  remote: RemoteType | null; // null = any
  minScore: number | null;   // null = no minimum
};

type FeedContext = {
  missions: Mission[];
  filteredMissions: Mission[];
  searchQuery: string;
  activeFilters: ActiveFilters;
  error: string | null;
};

type FeedEvent =
  | { type: 'LOAD' }
  | { type: 'MISSIONS_LOADED'; missions: Mission[] }
  | { type: 'LOAD_ERROR'; error: string }
  | { type: 'SEARCH'; query: string }
  | { type: 'CLEAR_SEARCH' }
  | { type: 'SET_FILTERS'; filters: Partial<ActiveFilters> }
  | { type: 'CLEAR_FILTERS' };

/**
 * Pure function that recomputes filtered missions from all criteria.
 * Single source of truth for filtering logic.
 */
const recomputeFilteredMissions = (
  missions: Mission[],
  searchQuery: string,
  activeFilters: ActiveFilters,
): Mission[] => {
  let result = missions;

  // Apply search filter
  if (searchQuery.trim()) {
    const query = searchQuery.toLowerCase().trim();
    result = result.filter(
      (m) =>
        (m.title ?? '').toLowerCase().includes(query) ||
        m.stack.some((s) => s && s.toLowerCase().includes(query)) ||
        ((m.description ?? '').toLowerCase().includes(query)),
    );
  }

  // Apply source filter
  if (activeFilters.sources.length > 0) {
    result = result.filter((m) => activeFilters.sources.includes(m.source));
  }

  // Apply remote filter
  if (activeFilters.remote !== null) {
    result = result.filter((m) => m.remote === activeFilters.remote);
  }

  // Apply minimum score filter
  if (activeFilters.minScore !== null) {
    const minScore = activeFilters.minScore;
    result = result.filter((m) => m.score !== null && m.score >= minScore);
  }

  return result;
};

/**
 * Default filters — no filtering applied.
 */
const DEFAULT_FILTERS: ActiveFilters = {
  sources: [],
  remote: null,
  minScore: null,
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
          return recomputeFilteredMissions(event.missions, context.searchQuery, context.activeFilters);
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
        return recomputeFilteredMissions(context.missions, newQuery, context.activeFilters);
      },
    }),
    clearSearch: assign({
      searchQuery: () => '',
      filteredMissions: ({ context }) =>
        recomputeFilteredMissions(context.missions, '', context.activeFilters),
    }),
    setFilters: assign({
      activeFilters: ({ context, event }) => {
        if (event.type !== 'SET_FILTERS') return context.activeFilters;
        return { ...context.activeFilters, ...event.filters };
      },
      filteredMissions: ({ context, event }) => {
        if (event.type !== 'SET_FILTERS') return context.filteredMissions;
        const newFilters = { ...context.activeFilters, ...event.filters };
        return recomputeFilteredMissions(context.missions, context.searchQuery, newFilters);
      },
    }),
    clearFilters: assign({
      activeFilters: () => DEFAULT_FILTERS,
      filteredMissions: ({ context }) =>
        recomputeFilteredMissions(context.missions, context.searchQuery, DEFAULT_FILTERS),
    }),
  },
}).createMachine({
  id: 'feed',
  initial: 'empty',
  context: {
    missions: [],
    filteredMissions: [],
    searchQuery: '',
    activeFilters: DEFAULT_FILTERS,
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
        SET_FILTERS: {
          actions: 'setFilters',
        },
        CLEAR_FILTERS: {
          actions: 'clearFilters',
        },
      },
    },
    error: {},
  },
});
