import { setup, assign } from 'xstate';
import type { TJMAnalysis, TJMDataPoint, SeniorityLevel } from '../lib/core/types/tjm';

type TJMContext = {
  query: { title: string; location: string; seniority: SeniorityLevel } | null;
  aggregatedData: TJMDataPoint[];
  analysis: TJMAnalysis | null;
  error: string | null;
};

type TJMEvent =
  | { type: 'ANALYZE'; title: string; location: string; seniority: SeniorityLevel }
  | { type: 'AGGREGATION_DONE'; data: TJMDataPoint[] }
  | { type: 'LLM_DONE'; analysis: TJMAnalysis }
  | { type: 'ERROR'; error: string }
  | { type: 'RESET' };

export const tjmMachine = setup({
  types: {
    context: {} as TJMContext,
    events: {} as TJMEvent,
  },
  actions: {
    setQuery: assign({
      query: ({ event }) => {
        if (event.type === 'ANALYZE')
          return { title: event.title, location: event.location, seniority: event.seniority };
        return null;
      },
      error: () => null,
    }),
    setAggregatedData: assign({
      aggregatedData: ({ event }) => {
        if (event.type === 'AGGREGATION_DONE') return event.data;
        return [];
      },
    }),
    setAnalysis: assign({
      analysis: ({ event }) => {
        if (event.type === 'LLM_DONE') return event.analysis;
        return null;
      },
    }),
    setError: assign({
      error: ({ event }) => {
        if (event.type === 'ERROR') return event.error;
        return null;
      },
    }),
    resetContext: assign({
      query: () => null,
      aggregatedData: () => [] as TJMDataPoint[],
      analysis: () => null,
      error: () => null,
    }),
  },
}).createMachine({
  id: 'tjm',
  initial: 'idle',
  context: {
    query: null,
    aggregatedData: [],
    analysis: null,
    error: null,
  },
  states: {
    idle: {
      on: {
        ANALYZE: {
          target: 'aggregating',
          actions: 'setQuery',
        },
      },
    },
    aggregating: {
      on: {
        AGGREGATION_DONE: {
          target: 'callingLLM',
          actions: 'setAggregatedData',
        },
        ERROR: {
          target: 'error',
          actions: 'setError',
        },
      },
    },
    callingLLM: {
      on: {
        LLM_DONE: {
          target: 'ready',
          actions: 'setAnalysis',
        },
        ERROR: {
          target: 'error',
          actions: 'setError',
        },
      },
    },
    ready: {
      on: {
        ANALYZE: {
          target: 'aggregating',
          actions: 'setQuery',
        },
        RESET: {
          target: 'idle',
          actions: 'resetContext',
        },
      },
    },
    error: {
      on: {
        ANALYZE: {
          target: 'aggregating',
          actions: 'setQuery',
        },
        RESET: {
          target: 'idle',
          actions: 'resetContext',
        },
      },
    },
  },
});
