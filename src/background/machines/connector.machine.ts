import { setup, assign } from 'xstate';
import type { Mission } from '../../lib/core/types/mission';
import type { ConnectorError } from '../../lib/core/types/connector';

type ConnectorContext = {
  connectorId: string;
  missions: Mission[];
  error: ConnectorError | null;
  lastSync: Date | null;
};

type ConnectorEvent =
  | { type: 'DETECT' }
  | { type: 'SESSION_VALID' }
  | { type: 'SESSION_EXPIRED' }
  | { type: 'FETCH' }
  | { type: 'FETCH_DONE'; missions: Mission[] }
  | { type: 'FETCH_ERROR'; error: ConnectorError }
  | { type: 'RETRY' };

export const connectorMachine = setup({
  types: {
    context: {} as ConnectorContext,
    events: {} as ConnectorEvent,
    input: {} as { connectorId: string },
  },
  actions: {
    setMissions: assign({
      missions: ({ event }) => {
        if (event.type === 'FETCH_DONE') return event.missions;
        return [];
      },
      lastSync: () => new Date(),
    }),
    setError: assign({
      error: ({ event }) => {
        if (event.type === 'FETCH_ERROR') return event.error;
        return null;
      },
    }),
    clearError: assign({
      error: () => null,
    }),
  },
}).createMachine({
  id: 'connector',
  initial: 'detecting',
  context: ({ input }) => ({
    connectorId: input.connectorId,
    missions: [],
    error: null,
    lastSync: null,
  }),
  states: {
    detecting: {
      on: {
        SESSION_VALID: 'authenticated',
        SESSION_EXPIRED: 'expired',
      },
    },
    authenticated: {
      on: {
        FETCH: 'fetching',
      },
    },
    expired: {
      on: {
        RETRY: {
          target: 'detecting',
          actions: 'clearError',
        },
      },
    },
    fetching: {
      on: {
        FETCH_DONE: {
          target: 'done',
          actions: 'setMissions',
        },
        FETCH_ERROR: {
          target: 'error',
          actions: 'setError',
        },
      },
    },
    done: {
      type: 'final',
    },
    error: {
      on: {
        RETRY: {
          target: 'detecting',
          actions: 'clearError',
        },
      },
    },
  },
});
