import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DWELL_INTERSECTION_RATIO,
  DWELL_THRESHOLD_MS,
} from '../../../src/lib/core/feed/mission-arrival-queue';
import { onVisible } from '../../../src/ui/actions/on-visible';

class MockObserver {
  static instances: MockObserver[] = [];
  callback: IntersectionObserverCallback;
  elements: Element[] = [];
  options?: IntersectionObserverInit;

  constructor(cb: IntersectionObserverCallback, options?: IntersectionObserverInit) {
    this.callback = cb;
    this.options = options;
    MockObserver.instances.push(this);
  }

  observe(el: Element) {
    this.elements.push(el);
  }

  unobserve(el: Element) {
    this.elements = this.elements.filter((entry) => entry !== el);
  }

  disconnect() {
    this.elements = [];
  }

  trigger({
    isIntersecting,
    intersectionRatio,
  }: {
    isIntersecting: boolean;
    intersectionRatio: number;
  }) {
    this.callback(
      [
        {
          isIntersecting,
          intersectionRatio,
          target: this.elements[0],
        } as IntersectionObserverEntry,
      ],
      this as unknown as IntersectionObserver
    );
  }
}

describe('onVisible', () => {
  beforeEach(() => {
    MockObserver.instances = [];
    vi.useFakeTimers();
    vi.setSystemTime(1_000);
    vi.stubGlobal('IntersectionObserver', MockObserver);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('emits elapsed only after continuous visibility reaches the dwell threshold', () => {
    const el = document.createElement('div');
    const onSignal = vi.fn();
    const action = onVisible(el, { onSignal });
    const observer = MockObserver.instances[0];

    expect(observer.options?.threshold).toBe(DWELL_INTERSECTION_RATIO);

    observer.trigger({ isIntersecting: true, intersectionRatio: DWELL_INTERSECTION_RATIO });
    expect(onSignal).toHaveBeenCalledWith({ type: 'started', at: 1_000 });

    vi.advanceTimersByTime(DWELL_THRESHOLD_MS - 1);
    expect(onSignal).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'elapsed' }));

    vi.advanceTimersByTime(1);
    expect(onSignal).toHaveBeenCalledWith({
      type: 'elapsed',
      at: 1_000 + DWELL_THRESHOLD_MS,
    });
    expect(observer.elements).not.toContain(el);

    action.destroy();
  });

  it('does not start below the required intersection ratio', () => {
    const el = document.createElement('div');
    const onSignal = vi.fn();
    onVisible(el, { onSignal });

    MockObserver.instances[0].trigger({
      isIntersecting: true,
      intersectionRatio: DWELL_INTERSECTION_RATIO - 0.01,
    });
    vi.advanceTimersByTime(DWELL_THRESHOLD_MS);

    expect(onSignal).not.toHaveBeenCalled();
  });

  it('cancels the dwell when visibility drops before the threshold', () => {
    const el = document.createElement('div');
    const onSignal = vi.fn();
    onVisible(el, { onSignal });
    const observer = MockObserver.instances[0];

    observer.trigger({ isIntersecting: true, intersectionRatio: 0.8 });
    vi.advanceTimersByTime(700);
    observer.trigger({ isIntersecting: false, intersectionRatio: 0 });
    vi.advanceTimersByTime(DWELL_THRESHOLD_MS);

    expect(onSignal).toHaveBeenCalledWith({ type: 'cancelled', at: 1_700 });
    expect(onSignal).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'elapsed' }));
  });

  it('clears an active dwell when destroyed', () => {
    const el = document.createElement('div');
    const onSignal = vi.fn();
    const action = onVisible(el, { onSignal });

    MockObserver.instances[0].trigger({ isIntersecting: true, intersectionRatio: 0.8 });
    action.destroy();
    vi.advanceTimersByTime(DWELL_THRESHOLD_MS);

    expect(onSignal).toHaveBeenCalledWith({ type: 'cancelled', at: 1_000 });
    expect(onSignal).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'elapsed' }));
  });

  it('does not observe or signal when disabled', () => {
    const el = document.createElement('div');
    const onSignal = vi.fn();
    onVisible(el, { disabled: true, onSignal });

    expect(MockObserver.instances[0].elements).toEqual([]);
    vi.advanceTimersByTime(DWELL_THRESHOLD_MS);
    expect(onSignal).not.toHaveBeenCalled();
  });
});
