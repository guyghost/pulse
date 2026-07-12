export const DWELL_THRESHOLD_MS = 1500;
export const DWELL_INTERSECTION_RATIO = 0.6;
export const ARRIVAL_PREVIEW_LIMIT = 3;

export type MissionDwellSignal =
  | { type: 'started'; at: number }
  | { type: 'cancelled'; at: number }
  | { type: 'elapsed'; at: number };

export type MissionQueueRegion =
  | {
      value: 'all-feed';
      queueIds: [];
      dwells: Record<string, number>;
    }
  | {
      value: 'stable-queue';
      queueIds: string[];
      dwells: Record<string, number>;
    };

export type MissionArrivalStackRegion =
  | {
      value: 'empty';
      pendingIds: [];
      previewIds: [];
      message: null;
    }
  | {
      value: 'collapsed' | 'open' | 'refreshing';
      pendingIds: string[];
      previewIds: string[];
      message: null;
    }
  | {
      value: 'refresh-error';
      pendingIds: string[];
      previewIds: string[];
      message: string;
    };

export interface MissionArrivalQueueState {
  queue: MissionQueueRegion;
  stack: MissionArrivalStackRegion;
}

export type MissionArrivalQueueEvent =
  | { type: 'ENTER_NEW_QUEUE'; orderedUnseenIds: string[] }
  | { type: 'EXIT_NEW_QUEUE' }
  | { type: 'DWELL_STARTED'; missionId: string; now: number }
  | { type: 'DWELL_CANCELLED'; missionId: string }
  | { type: 'DWELL_ELAPSED'; missionId: string; now: number }
  | { type: 'ARRIVALS_BUFFERED'; orderedPendingIds: string[] }
  | { type: 'OPEN_STACK'; orderedPreviewIds: string[] }
  | { type: 'CLOSE_STACK' }
  | { type: 'REFRESH_QUEUE' }
  | { type: 'REFRESH_SUCCEEDED'; orderedUnseenIds: string[] }
  | { type: 'REFRESH_FAILED'; message: string }
  | { type: 'RETRY_REFRESH' }
  | { type: 'SCAN_CANCELLED' }
  | { type: 'PANEL_CLOSED' };

export type MissionArrivalQueueEffect =
  | { type: 'mark-seen'; missionId: string }
  | { type: 'apply-pending' }
  | { type: 'focus-drawer-heading' }
  | { type: 'focus-stack-trigger' }
  | { type: 'scroll-feed-start' };

export interface MissionArrivalQueueTransition {
  state: MissionArrivalQueueState;
  effects: MissionArrivalQueueEffect[];
}

function emptyStack(): MissionArrivalStackRegion {
  return {
    value: 'empty',
    pendingIds: [],
    previewIds: [],
    message: null,
  };
}

function uniqueIds(ids: string[]): string[] {
  return [...new Set(ids.filter(Boolean))];
}

function sameIds(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

function unchanged(state: MissionArrivalQueueState): MissionArrivalQueueTransition {
  return { state, effects: [] };
}

export function createMissionArrivalQueueState(): MissionArrivalQueueState {
  return {
    queue: {
      value: 'all-feed',
      queueIds: [],
      dwells: {},
    },
    stack: emptyStack(),
  };
}

export function transitionMissionArrivalQueue(
  state: MissionArrivalQueueState,
  event: MissionArrivalQueueEvent
): MissionArrivalQueueTransition {
  switch (event.type) {
    case 'ENTER_NEW_QUEUE':
      return {
        state: {
          ...state,
          queue: {
            value: 'stable-queue',
            queueIds: uniqueIds(event.orderedUnseenIds),
            dwells: { ...state.queue.dwells },
          },
        },
        effects: [],
      };

    case 'EXIT_NEW_QUEUE':
      if (state.queue.value === 'all-feed') {
        return unchanged(state);
      }
      return {
        state: {
          ...state,
          queue: {
            value: 'all-feed',
            queueIds: [],
            dwells: { ...state.queue.dwells },
          },
        },
        effects: [],
      };

    case 'DWELL_STARTED': {
      if (!event.missionId || !Number.isFinite(event.now)) {
        return unchanged(state);
      }
      return {
        state: {
          ...state,
          queue: {
            ...state.queue,
            dwells: {
              ...state.queue.dwells,
              [event.missionId]: event.now,
            },
          },
        },
        effects: [],
      };
    }

    case 'DWELL_CANCELLED': {
      if (!(event.missionId in state.queue.dwells)) {
        return unchanged(state);
      }
      const dwells = { ...state.queue.dwells };
      delete dwells[event.missionId];
      return {
        state: {
          ...state,
          queue: {
            ...state.queue,
            dwells,
          },
        },
        effects: [],
      };
    }

    case 'DWELL_ELAPSED': {
      const startedAt = state.queue.dwells[event.missionId];
      if (
        startedAt === undefined ||
        !Number.isFinite(event.now) ||
        event.now - startedAt < DWELL_THRESHOLD_MS
      ) {
        return unchanged(state);
      }
      const dwells = { ...state.queue.dwells };
      delete dwells[event.missionId];
      return {
        state: {
          ...state,
          queue: {
            ...state.queue,
            dwells,
          },
        },
        effects: [{ type: 'mark-seen', missionId: event.missionId }],
      };
    }

    case 'ARRIVALS_BUFFERED': {
      const pendingIds = uniqueIds(event.orderedPendingIds);
      if (pendingIds.length === 0) {
        return {
          state: { ...state, stack: emptyStack() },
          effects: [],
        };
      }
      if (state.stack.value === 'open') {
        if (sameIds(state.stack.pendingIds, pendingIds)) {
          return unchanged(state);
        }
        return {
          state: {
            ...state,
            stack: {
              value: 'open',
              pendingIds,
              previewIds: [...state.stack.previewIds],
              message: null,
            },
          },
          effects: [],
        };
      }
      if (state.stack.value === 'refreshing') {
        return unchanged(state);
      }
      if (state.stack.value === 'collapsed' && sameIds(state.stack.pendingIds, pendingIds)) {
        return unchanged(state);
      }
      return {
        state: {
          ...state,
          stack: {
            value: 'collapsed',
            pendingIds,
            previewIds: [],
            message: null,
          },
        },
        effects: [],
      };
    }

    case 'OPEN_STACK': {
      if (state.stack.value !== 'collapsed') {
        return unchanged(state);
      }
      const pendingSet = new Set(state.stack.pendingIds);
      const orderedPreviewIds = uniqueIds(event.orderedPreviewIds).filter((id) =>
        pendingSet.has(id)
      );
      const previewIds = (
        orderedPreviewIds.length > 0 ? orderedPreviewIds : state.stack.pendingIds
      ).slice(0, ARRIVAL_PREVIEW_LIMIT);
      return {
        state: {
          ...state,
          stack: {
            value: 'open',
            pendingIds: [...state.stack.pendingIds],
            previewIds,
            message: null,
          },
        },
        effects: [{ type: 'focus-drawer-heading' }],
      };
    }

    case 'CLOSE_STACK':
      if (state.stack.value !== 'open') {
        return unchanged(state);
      }
      return {
        state: {
          ...state,
          stack: {
            value: 'collapsed',
            pendingIds: [...state.stack.pendingIds],
            previewIds: [],
            message: null,
          },
        },
        effects: [{ type: 'focus-stack-trigger' }],
      };

    case 'REFRESH_QUEUE':
    case 'RETRY_REFRESH':
      if (
        state.stack.value !== 'collapsed' &&
        state.stack.value !== 'open' &&
        state.stack.value !== 'refresh-error'
      ) {
        return unchanged(state);
      }
      return {
        state: {
          ...state,
          stack: {
            value: 'refreshing',
            pendingIds: [...state.stack.pendingIds],
            previewIds: [...state.stack.previewIds],
            message: null,
          },
        },
        effects: [{ type: 'apply-pending' }],
      };

    case 'REFRESH_SUCCEEDED':
      if (state.stack.value !== 'refreshing') {
        return unchanged(state);
      }
      return {
        state: {
          queue:
            state.queue.value === 'stable-queue'
              ? {
                  value: 'stable-queue',
                  queueIds: uniqueIds(event.orderedUnseenIds),
                  dwells: { ...state.queue.dwells },
                }
              : state.queue,
          stack: emptyStack(),
        },
        effects: [{ type: 'scroll-feed-start' }],
      };

    case 'REFRESH_FAILED':
      if (state.stack.value !== 'refreshing') {
        return unchanged(state);
      }
      return {
        state: {
          ...state,
          stack: {
            value: 'refresh-error',
            pendingIds: [...state.stack.pendingIds],
            previewIds: [...state.stack.previewIds],
            message: event.message,
          },
        },
        effects: [],
      };

    case 'SCAN_CANCELLED':
      if (state.stack.value === 'empty') {
        return unchanged(state);
      }
      return {
        state: { ...state, stack: emptyStack() },
        effects: [],
      };

    case 'PANEL_CLOSED':
      return {
        state: createMissionArrivalQueueState(),
        effects: [],
      };
  }
}
