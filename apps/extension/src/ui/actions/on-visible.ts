import {
  DWELL_INTERSECTION_RATIO,
  DWELL_THRESHOLD_MS,
  type MissionDwellSignal,
} from '$lib/core/feed/mission-arrival-queue';

export interface OnVisibleOptions {
  disabled?: boolean;
  onSignal: (signal: MissionDwellSignal) => void;
}

interface DwellState {
  options: OnVisibleOptions;
  timer: ReturnType<typeof setTimeout> | null;
  active: boolean;
  completed: boolean;
}

// One IntersectionObserver is shared by every card (DAO #181): a mounted feed
// costs a single observer instead of N. Per-node dwell state lives in a
// WeakMap; nodes are unobserved on destroy or dwell completion.
const dwellStates = new WeakMap<HTMLElement, DwellState>();
let sharedObserver: IntersectionObserver | null = null;

function startDwell(state: DwellState, node: HTMLElement): void {
  if (state.options.disabled || state.active || state.completed) {
    return;
  }
  state.active = true;
  state.options.onSignal({ type: 'started', at: Date.now() });
  state.timer = setTimeout(() => {
    state.timer = null;
    state.active = false;
    state.completed = true;
    state.options.onSignal({ type: 'elapsed', at: Date.now() });
    sharedObserver?.unobserve(node);
  }, DWELL_THRESHOLD_MS);
}

function cancelDwell(state: DwellState, emitSignal: boolean): void {
  if (state.timer) {
    clearTimeout(state.timer);
    state.timer = null;
  }
  if (!state.active) {
    return;
  }
  state.active = false;
  if (emitSignal) {
    state.options.onSignal({ type: 'cancelled', at: Date.now() });
  }
}

function getSharedObserver(): IntersectionObserver {
  if (!sharedObserver) {
    sharedObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const node = entry.target as HTMLElement;
          const state = dwellStates.get(node);
          if (!state) {
            continue;
          }
          const meetsThreshold =
            entry.isIntersecting && entry.intersectionRatio >= DWELL_INTERSECTION_RATIO;
          if (meetsThreshold) {
            startDwell(state, node);
          } else {
            cancelDwell(state, true);
          }
        }
      },
      { threshold: DWELL_INTERSECTION_RATIO }
    );
  }
  return sharedObserver;
}

/** Test hook: drops the shared observer so each test starts from a fresh one. */
export function __resetOnVisibleSharedObserver(): void {
  sharedObserver?.disconnect();
  sharedObserver = null;
}

export function onVisible(node: HTMLElement, initialOptions: OnVisibleOptions) {
  const state: DwellState = {
    options: initialOptions,
    timer: null,
    active: false,
    completed: false,
  };
  dwellStates.set(node, state);
  const observer = getSharedObserver();

  if (!state.options.disabled) {
    observer.observe(node);
  }

  return {
    update(nextOptions: OnVisibleOptions) {
      const wasDisabled = state.options.disabled === true;
      state.options = nextOptions;
      if (state.options.disabled) {
        cancelDwell(state, true);
        observer.unobserve(node);
      } else if (wasDisabled && !state.completed) {
        observer.observe(node);
      }
    },
    destroy() {
      cancelDwell(state, true);
      // Never disconnect the shared observer — other cards depend on it.
      observer.unobserve(node);
      dwellStates.delete(node);
    },
  };
}
