import { describe, it, expect, vi, beforeEach } from 'vitest';
import { onVisible } from '../../../src/ui/actions/on-visible';

class MockObserver {
  static instances: MockObserver[] = [];
  callback: IntersectionObserverCallback;
  elements: Element[] = [];

  constructor(cb: IntersectionObserverCallback) {
    this.callback = cb;
    MockObserver.instances.push(this);
  }
  observe(el: Element) { this.elements.push(el); }
  unobserve(el: Element) { this.elements = this.elements.filter(e => e !== el); }
  disconnect() { this.elements = []; }

  trigger(isIntersecting: boolean) {
    this.callback(
      [{ isIntersecting, target: this.elements[0] } as IntersectionObserverEntry],
      this as unknown as IntersectionObserver,
    );
  }
}

describe('onVisible', () => {
  beforeEach(() => {
    MockObserver.instances = [];
    vi.stubGlobal('IntersectionObserver', MockObserver);
  });

  it('calls callback when element becomes visible and disconnects', () => {
    const el = document.createElement('div');
    const cb = vi.fn();
    const action = onVisible(el, cb);

    const observer = MockObserver.instances[0];
    expect(observer.elements).toContain(el);

    observer.trigger(true);
    expect(cb).toHaveBeenCalledOnce();
    expect(observer.elements).not.toContain(el);

    action.destroy();
  });

  it('does not call callback if not intersecting', () => {
    const el = document.createElement('div');
    const cb = vi.fn();
    onVisible(el, cb);

    MockObserver.instances[0].trigger(false);
    expect(cb).not.toHaveBeenCalled();
  });
});
