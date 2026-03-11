import { setup, assign } from 'xstate';
import type { RemoteType } from '../lib/core/types/mission';

type FiltersContext = {
  stack: string[];
  tjmRange: { min: number; max: number } | null;
  location: string | null;
  remote: RemoteType | null;
};

type FiltersEvent =
  | { type: 'SET_STACK'; stack: string[] }
  | { type: 'SET_TJM_RANGE'; min: number; max: number }
  | { type: 'SET_LOCATION'; location: string }
  | { type: 'SET_REMOTE'; remote: RemoteType | null }
  | { type: 'CLEAR_ALL' }
  | { type: 'TOGGLE_STACK_ITEM'; item: string };

export const filtersMachine = setup({
  types: {
    context: {} as FiltersContext,
    events: {} as FiltersEvent,
  },
  guards: {
    hasActiveFilters: ({ context }) =>
      context.stack.length > 0 ||
      context.tjmRange !== null ||
      context.location !== null ||
      context.remote !== null,
    noActiveFilters: ({ context }) =>
      context.stack.length === 0 &&
      context.tjmRange === null &&
      context.location === null &&
      context.remote === null,
  },
  actions: {
    setStack: assign({
      stack: ({ event }) => {
        if (event.type === 'SET_STACK') return event.stack;
        return [];
      },
    }),
    toggleStackItem: assign({
      stack: ({ context, event }) => {
        if (event.type !== 'TOGGLE_STACK_ITEM') return context.stack;
        const item = event.item;
        return context.stack.includes(item)
          ? context.stack.filter((s) => s !== item)
          : [...context.stack, item];
      },
    }),
    setTjmRange: assign({
      tjmRange: ({ event }) => {
        if (event.type === 'SET_TJM_RANGE') return { min: event.min, max: event.max };
        return null;
      },
    }),
    setLocation: assign({
      location: ({ event }) => {
        if (event.type === 'SET_LOCATION') return event.location;
        return null;
      },
    }),
    setRemote: assign({
      remote: ({ event }) => {
        if (event.type === 'SET_REMOTE') return event.remote;
        return null;
      },
    }),
    clearAll: assign({
      stack: () => [] as string[],
      tjmRange: () => null,
      location: () => null,
      remote: () => null,
    }),
  },
}).createMachine({
  id: 'filters',
  initial: 'inactive',
  context: {
    stack: [],
    tjmRange: null,
    location: null,
    remote: null,
  },
  states: {
    inactive: {
      on: {
        SET_STACK: { target: 'active', actions: 'setStack' },
        TOGGLE_STACK_ITEM: { target: 'active', actions: 'toggleStackItem' },
        SET_TJM_RANGE: { target: 'active', actions: 'setTjmRange' },
        SET_LOCATION: { target: 'active', actions: 'setLocation' },
        SET_REMOTE: { target: 'active', actions: 'setRemote' },
      },
    },
    active: {
      always: {
        guard: 'noActiveFilters',
        target: 'inactive',
      },
      on: {
        SET_STACK: { actions: 'setStack' },
        TOGGLE_STACK_ITEM: { actions: 'toggleStackItem' },
        SET_TJM_RANGE: { actions: 'setTjmRange' },
        SET_LOCATION: { actions: 'setLocation' },
        SET_REMOTE: { actions: 'setRemote' },
        CLEAR_ALL: { target: 'inactive', actions: 'clearAll' },
      },
    },
  },
});
