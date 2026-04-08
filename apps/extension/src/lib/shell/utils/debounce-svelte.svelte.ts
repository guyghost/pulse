/**
 * Debounce Svelte 5 hook - Shell layer
 *
 * Uses setTimeout and $effect - side effects allowed here
 */

import { createDebouncerWithCallback, type DebounceState } from '$lib/core/utils/debounce';

/**
 * Hook for debouncing a value in Svelte 5.
 * Returns a derived value that updates after the delay.
 *
 * Usage:
 * ```svelte
 * let searchQuery = $state('');
 * let debouncedQuery = useDebounce(() => searchQuery, 300);
 *
 * $effect(() => {
 *   // This only runs after 300ms of no changes
 *   console.log(debouncedQuery());
 * });
 * ```
 */
export function useDebounce<T>(value: () => T, delayMs: number): () => T {
  let state = $state<DebounceState<T>>({
    pendingValue: undefined,
    commitAt: undefined,
    delayMs: 0,
  });

  let committedValue = $state<T>(value());
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  const debouncer = createDebouncerWithCallback<T>();

  $effect(() => {
    const currentValue = value();
    const now = Date.now();

    // Check if there's a pending value that should be committed
    const commitCheck = debouncer.checkCommit(state, now);
    if (commitCheck.shouldCommit && commitCheck.value !== undefined) {
      committedValue = commitCheck.value;
      state = commitCheck.newState;
    }

    // Set the new value
    const result = debouncer.setValue(state, currentValue, delayMs, now);
    state = result.newState;

    // Commit previous value immediately if there was one pending
    if (result.shouldCommitPrevious && result.previousValue !== undefined) {
      committedValue = result.previousValue;
    }

    // Schedule the next check
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    timeoutId = setTimeout(() => {
      const checkNow = Date.now();
      const finalCheck = debouncer.checkCommit(state, checkNow);
      if (finalCheck.shouldCommit && finalCheck.value !== undefined) {
        committedValue = finalCheck.value;
        state = finalCheck.newState;
      }
    }, delayMs);

    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  });

  return () => committedValue;
}

/**
 * Hook that returns both the debounced value and a setter.
 * Useful when you need to trigger the debounce manually.
 */
export function useDebouncedState<T>(
  initialValue: T,
  delayMs: number
): {
  value: T;
  setValue: (value: T) => void;
  flush: () => void;
  reset: () => void;
} {
  let committedValue = $state<T>(initialValue);
  let pendingValue = $state<T>(initialValue);
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  function scheduleCommit() {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      committedValue = pendingValue;
    }, delayMs);
  }

  function setValue(newValue: T) {
    pendingValue = newValue;
    scheduleCommit();
  }

  function flush() {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    committedValue = pendingValue;
  }

  function reset() {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    pendingValue = initialValue;
    committedValue = initialValue;
  }

  return {
    get value() {
      return committedValue;
    },
    setValue,
    flush,
    reset,
  };
}

/**
 * Hook specifically for search inputs.
 * Returns stateful values and handlers.
 */
export function useDebouncedSearch(
  onSearch: (query: string) => void,
  delayMs = 300
): {
  /** Current input value (reactive) */
  query: string;
  /** Handler for input events */
  handleInput: (e: Event) => void;
  /** Clear the search */
  handleClear: () => void;
  /** Flush pending search immediately */
  flush: () => void;
  /** Set value programmatically */
  setValue: (value: string) => void;
} {
  let localValue = $state('');
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  function scheduleSearch() {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      onSearch(localValue);
    }, delayMs);
  }

  function handleInput(e: Event) {
    const target = e.target as HTMLInputElement;
    localValue = target.value;
    scheduleSearch();
  }

  function handleClear() {
    localValue = '';
    onSearch('');
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }

  function flush() {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    onSearch(localValue);
  }

  function setValue(value: string) {
    localValue = value;
    scheduleSearch();
  }

  // Cleanup on destroy
  $effect(() => {
    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  });

  return {
    get query() {
      return localValue;
    },
    handleInput,
    handleClear,
    flush,
    setValue,
  };
}
