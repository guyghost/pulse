import {
  DWELL_INTERSECTION_RATIO,
  DWELL_THRESHOLD_MS,
  type MissionDwellSignal,
} from '$lib/core/feed/mission-arrival-queue';

export interface OnVisibleOptions {
  disabled?: boolean;
  onSignal: (signal: MissionDwellSignal) => void;
}

export function onVisible(node: HTMLElement, initialOptions: OnVisibleOptions) {
  let options = initialOptions;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let active = false;
  let completed = false;

  function cancelDwell(emitSignal: boolean): void {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (!active) {
      return;
    }
    active = false;
    if (emitSignal) {
      options.onSignal({ type: 'cancelled', at: Date.now() });
    }
  }

  function startDwell(): void {
    if (options.disabled || active || completed) {
      return;
    }
    active = true;
    options.onSignal({ type: 'started', at: Date.now() });
    timer = setTimeout(() => {
      timer = null;
      active = false;
      completed = true;
      options.onSignal({ type: 'elapsed', at: Date.now() });
      observer.unobserve(node);
    }, DWELL_THRESHOLD_MS);
  }

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const meetsThreshold =
          entry.isIntersecting && entry.intersectionRatio >= DWELL_INTERSECTION_RATIO;
        if (meetsThreshold) {
          startDwell();
        } else {
          cancelDwell(true);
        }
      }
    },
    { threshold: DWELL_INTERSECTION_RATIO }
  );

  if (!options.disabled) {
    observer.observe(node);
  }

  return {
    update(nextOptions: OnVisibleOptions) {
      const wasDisabled = options.disabled === true;
      options = nextOptions;
      if (options.disabled) {
        cancelDwell(true);
        observer.unobserve(node);
      } else if (wasDisabled && !completed) {
        observer.observe(node);
      }
    },
    destroy() {
      cancelDwell(true);
      observer.disconnect();
    },
  };
}
