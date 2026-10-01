/**
 * Shared reactive clock for UI relative-time labels.
 *
 * `Date.now()` is not reactive: `$derived(formatRelativeTime(x, Date.now()))`
 * computes once and then freezes, so "il y a 2 min" never updates. This module
 * exposes a ticking `now` so relative labels refresh on an interval.
 *
 * Each consumer owns its local `$state` (fresh at mount, so the first render is
 * never stale), while a single ref-counted interval drives every subscriber —
 * many MissionCards still share one timer, and an empty UI costs nothing.
 */

/** Refresh cadence — relative labels are minute-granular, 30s keeps them fresh. */
const TICK_MS = 30_000;

// Plain array (not reactive state): the interval iterates it outside the
// reactive graph, and additions/removals happen in effect setup/teardown.
let subscribers: Array<() => void> = [];
let timer: ReturnType<typeof setInterval> | null = null;

function startClock(): void {
  if (timer !== null) {
    return;
  }
  timer = setInterval(() => {
    for (const update of [...subscribers]) {
      update();
    }
  }, TICK_MS);
}

function stopClock(): void {
  if (timer !== null) {
    clearInterval(timer);
    timer = null;
  }
}

export interface ReactiveClock {
  /** Current timestamp (ms) — reactive, updates on the shared tick. */
  readonly now: number;
  refresh(): void;
}

/**
 * Subscribe the calling component to the shared clock. Must be called during
 * component initialization (it uses `$effect` to own/clean up the
 * subscription). Returns a reactive `now` to feed `formatRelativeTime`.
 */
export function createClock(): ReactiveClock {
  let now = $state(Date.now());

  $effect(() => {
    const update = () => {
      now = Date.now();
    };
    subscribers.push(update);
    startClock();
    return () => {
      subscribers = subscribers.filter((subscriber) => subscriber !== update);
      if (subscribers.length === 0) {
        stopClock();
      }
    };
  });

  return {
    refresh() {
      now = Date.now();
    },
    get now() {
      return now;
    },
  };
}
