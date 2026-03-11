import { setup, assign } from 'xstate';
import type { Mission } from '../../lib/core/types/mission';
import type { ConnectorError } from '../../lib/core/types/connector';

type ScanContext = {
  connectors: string[];
  currentIndex: number;
  missions: Mission[];
  errors: ConnectorError[];
};

type ScanEvent =
  | { type: 'START_SCAN'; connectors: string[] }
  | { type: 'CONNECTOR_DONE'; missions: Mission[] }
  | { type: 'CONNECTOR_ERROR'; error: ConnectorError }
  | { type: 'NEXT_CONNECTOR' }
  | { type: 'SCAN_COMPLETE' }
  | { type: 'RESET' };

export const scanMachine = setup({
  types: {
    context: {} as ScanContext,
    events: {} as ScanEvent,
  },
  actions: {
    setConnectors: assign({
      connectors: ({ event }) => {
        if (event.type === 'START_SCAN') return event.connectors;
        return [];
      },
      currentIndex: () => 0,
      missions: () => [] as Mission[],
      errors: () => [] as ConnectorError[],
    }),
    appendMissions: assign({
      missions: ({ context, event }) => {
        if (event.type === 'CONNECTOR_DONE') return [...context.missions, ...event.missions];
        return context.missions;
      },
    }),
    appendError: assign({
      errors: ({ context, event }) => {
        if (event.type === 'CONNECTOR_ERROR') return [...context.errors, event.error];
        return context.errors;
      },
    }),
    advanceConnector: assign({
      currentIndex: ({ context }) => context.currentIndex + 1,
    }),
    resetContext: assign({
      connectors: () => [] as string[],
      currentIndex: () => 0,
      missions: () => [] as Mission[],
      errors: () => [] as ConnectorError[],
    }),
  },
  guards: {
    hasMoreConnectors: ({ context }) => context.currentIndex < context.connectors.length - 1,
    noMoreConnectors: ({ context }) => context.currentIndex >= context.connectors.length - 1,
  },
}).createMachine({
  id: 'scan',
  initial: 'idle',
  context: {
    connectors: [],
    currentIndex: 0,
    missions: [],
    errors: [],
  },
  states: {
    idle: {
      on: {
        START_SCAN: {
          target: 'preparing',
          actions: 'setConnectors',
        },
      },
    },
    preparing: {
      always: 'scanning',
    },
    scanning: {
      on: {
        CONNECTOR_DONE: [
          {
            guard: 'hasMoreConnectors',
            actions: ['appendMissions', 'advanceConnector'],
            target: 'scanning',
          },
          {
            guard: 'noMoreConnectors',
            actions: 'appendMissions',
            target: 'deduplicating',
          },
        ],
        CONNECTOR_ERROR: [
          {
            guard: 'hasMoreConnectors',
            actions: ['appendError', 'advanceConnector'],
            target: 'scanning',
          },
          {
            guard: 'noMoreConnectors',
            actions: 'appendError',
            target: 'deduplicating',
          },
        ],
      },
    },
    deduplicating: {
      always: 'scoring',
    },
    scoring: {
      always: 'complete',
    },
    complete: {
      on: {
        RESET: {
          target: 'idle',
          actions: 'resetContext',
        },
      },
    },
  },
});
