/**
 * Debounce pure - Core layer
 *
 * No side effects, no setTimeout, no Date.now()
 * Time must be injected from the Shell layer
 */

export interface DebounceState<T> {
  /** The pending value waiting to be committed */
  pendingValue: T | undefined;
  /** The timestamp when the pending value should be committed */
  commitAt: number | undefined;
  /** The delay that was set for the pending value */
  delayMs: number;
}

/**
 * Creates a debouncer state manager.
 * Pure function - no side effects, time is injected.
 */
export function createDebouncer<T>(): {
  /** Set a new value with a delay */
  setValue(state: DebounceState<T>, value: T, delayMs: number, now: number): DebounceState<T>;
  /** Get the debounced value if delay has elapsed, undefined otherwise */
  getDebouncedValue(state: DebounceState<T>, now: number): T | undefined;
  /** Check if there's a pending value */
  hasPendingValue(state: DebounceState<T>): boolean;
  /** Reset the debouncer */
  reset(): DebounceState<T>;
  /** Get initial state */
  getInitialState(): DebounceState<T>;
} {
  return {
    setValue(state: DebounceState<T>, value: T, delayMs: number, now: number): DebounceState<T> {
      return {
        pendingValue: value,
        commitAt: now + delayMs,
        delayMs,
      };
    },

    getDebouncedValue(state: DebounceState<T>, now: number): T | undefined {
      if (state.commitAt === undefined || state.pendingValue === undefined) {
        return undefined;
      }
      if (now >= state.commitAt) {
        return state.pendingValue;
      }
      return undefined;
    },

    hasPendingValue(state: DebounceState<T>): boolean {
      return state.pendingValue !== undefined && state.commitAt !== undefined;
    },

    reset(): DebounceState<T> {
      return {
        pendingValue: undefined,
        commitAt: undefined,
        delayMs: 0,
      };
    },

    getInitialState(): DebounceState<T> {
      return {
        pendingValue: undefined,
        commitAt: undefined,
        delayMs: 0,
      };
    },
  };
}

/**
 * Creates a debouncer with callback pattern.
 * Still pure - the callback is invoked by the caller after checking shouldCommit.
 */
export function createDebouncerWithCallback<T>(): {
  /** Set a new value with a delay, returns true if a previous value should be committed immediately */
  setValue(
    state: DebounceState<T>,
    value: T,
    delayMs: number,
    now: number
  ): { newState: DebounceState<T>; shouldCommitPrevious: boolean; previousValue?: T };
  /** Check if value should be committed now, returns the value if ready */
  checkCommit(
    state: DebounceState<T>,
    now: number
  ): { shouldCommit: boolean; value?: T; newState: DebounceState<T> };
  /** Reset the debouncer */
  reset(): DebounceState<T>;
  /** Get initial state */
  getInitialState(): DebounceState<T>;
} {
  return {
    setValue(state: DebounceState<T>, value: T, delayMs: number, now: number) {
      const shouldCommitPrevious =
        state.pendingValue !== undefined && state.commitAt !== undefined && now < state.commitAt;

      return {
        newState: {
          pendingValue: value,
          commitAt: now + delayMs,
          delayMs,
        },
        shouldCommitPrevious,
        previousValue: shouldCommitPrevious ? state.pendingValue : undefined,
      };
    },

    checkCommit(state: DebounceState<T>, now: number) {
      if (state.pendingValue === undefined || state.commitAt === undefined) {
        return { shouldCommit: false, newState: state };
      }

      if (now >= state.commitAt) {
        return {
          shouldCommit: true,
          value: state.pendingValue,
          newState: {
            pendingValue: undefined,
            commitAt: undefined,
            delayMs: 0,
          },
        };
      }

      return { shouldCommit: false, newState: state };
    },

    reset() {
      return {
        pendingValue: undefined,
        commitAt: undefined,
        delayMs: 0,
      };
    },

    getInitialState() {
      return {
        pendingValue: undefined,
        commitAt: undefined,
        delayMs: 0,
      };
    },
  };
}
