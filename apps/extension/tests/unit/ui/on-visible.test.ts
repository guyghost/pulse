import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DWELL_INTERSECTION_RATIO,
  DWELL_THRESHOLD_MS,
} from '../../../src/lib/core/feed/mission-arrival-queue';
import { onVisible, __resetOnVisibleSharedObserver } from '../../../src/ui/actions/on-visible';

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
    // Shared observer: dispatch one entry per observed element, each with its
    // own target, mirroring the real IntersectionObserver behavior.
    this.callback(
      this.elements.map(
        (target) => ({ isIntersecting, intersectionRatio, target }) as IntersectionObserverEntry
      ),
      this as unknown as IntersectionObserver
    );
  }
}

describe('onVisible', () => {
  beforeEach(() => {
    MockObserver.instances = [];
    __resetOnVisibleSharedObserver();
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

  it('shares a single observer across instances while keeping dwell per node (DAO #181)', () => {
    const elA = document.createElement('div');
    const elB = document.createElement('div');
    const signalA = vi.fn();
    const signalB = vi.fn();
    const actionA = onVisible(elA, { onSignal: signalA });
    const actionB = onVisible(elB, { onSignal: signalB });

    // One observer for the whole feed, both nodes observed.
    expect(MockObserver.instances).toHaveLength(1);
    const observer = MockObserver.instances[0];
    expect(observer.elements).toEqual([elA, elB]);

    observer.trigger({ isIntersecting: true, intersectionRatio: DWELL_INTERSECTION_RATIO });
    expect(signalA).toHaveBeenCalledWith({ type: 'started', at: 1_000 });
    expect(signalB).toHaveBeenCalledWith({ type: 'started', at: 1_000 });

    // Destroying one card only unobserves that card — the observer survives.
    actionA.destroy(); // emits 'cancelled' for A (active dwell), by design.
    expect(observer.elements).toEqual([elB]);
    const aCancelledAfterDestroy = signalA.mock.calls.filter(
      ([signal]) => (signal as { type: string }).type === 'cancelled'
    ).length;

    // The next shared-observer dispatch must not touch the destroyed card.
    observer.trigger({ isIntersecting: false, intersectionRatio: 0 });
    expect(signalB).toHaveBeenCalledWith({ type: 'cancelled', at: 1_000 });
    expect(
      signalA.mock.calls.filter(([signal]) => (signal as { type: string }).type === 'cancelled')
    ).toHaveLength(aCancelledAfterDestroy);

    actionB.destroy();
  });
});
