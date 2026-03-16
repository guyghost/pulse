import { setup, assign } from 'xstate';

export type ToastType = 'info' | 'error' | 'success';

export interface ToastItem {
  id: number;
  message: string;
  toastType: ToastType;
  createdAt: number;
  duration: number;
}

interface ToastContext {
  toasts: ToastItem[];
  nextId: number;
}

type ToastEvent =
  | { type: 'ADD'; message: string; toastType: ToastType; duration?: number }
  | { type: 'DISMISS'; id: number }
  | { type: 'DISMISS_ALL' }
  | { type: 'AUTO_DISMISS'; id: number };

const MAX_TOASTS = 5;
const DEFAULT_DURATION = 4000;

/**
 * Adds a toast to the list, respecting the max limit (FIFO if exceeded).
 */
const addToast = (
  toasts: ToastItem[],
  newToast: ToastItem,
  maxCount: number,
): ToastItem[] => {
  const newToasts = [...toasts, newToast];
  if (newToasts.length > maxCount) {
    // Remove oldest toasts (FIFO)
    return newToasts.slice(newToasts.length - maxCount);
  }
  return newToasts;
};

export const toastMachine = setup({
  types: {
    context: {} as ToastContext,
    events: {} as ToastEvent,
  },
  actions: {
    addToast: assign({
      toasts: ({ context, event }) => {
        if (event.type !== 'ADD') return context.toasts;

        const newToast: ToastItem = {
          id: context.nextId,
          message: event.message,
          toastType: event.toastType,
          createdAt: Date.now(),
          duration: event.duration ?? DEFAULT_DURATION,
        };

        return addToast(context.toasts, newToast, MAX_TOASTS);
      },
      nextId: ({ context }) => context.nextId + 1,
    }),

    dismissToast: assign({
      toasts: ({ context, event }) => {
        if (event.type !== 'DISMISS' && event.type !== 'AUTO_DISMISS') {
          return context.toasts;
        }
        return context.toasts.filter((t) => t.id !== event.id);
      },
    }),

    dismissAll: assign({
      toasts: () => [],
    }),
  },
  guards: {
    hasToasts: ({ context }) => context.toasts.length > 0,
  },
}).createMachine({
  id: 'toast',
  initial: 'idle',
  context: {
    toasts: [],
    nextId: 1,
  },
  states: {
    idle: {
      on: {
        ADD: {
          target: 'idle',
          actions: ['addToast'],
          reenter: true,
        },
        DISMISS: {
          target: 'idle',
          actions: ['dismissToast'],
        },
        DISMISS_ALL: {
          target: 'idle',
          actions: ['dismissAll'],
        },
        AUTO_DISMISS: {
          target: 'idle',
          actions: ['dismissToast'],
        },
      },
    },
  },
});

/**
 * Helper to create toast events for sending to the machine.
 */
export const toastEvents = {
  add: (
    message: string,
    toastType: ToastType = 'info',
    duration?: number,
  ): Extract<ToastEvent, { type: 'ADD' }> => ({
    type: 'ADD',
    message,
    toastType,
    duration,
  }),

  dismiss: (id: number): Extract<ToastEvent, { type: 'DISMISS' }> => ({
    type: 'DISMISS',
    id,
  }),

  dismissAll: (): Extract<ToastEvent, { type: 'DISMISS_ALL' }> => ({
    type: 'DISMISS_ALL',
  }),
};
