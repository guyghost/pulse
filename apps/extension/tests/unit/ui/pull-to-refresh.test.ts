import { describe, it, expect, vi } from 'vitest';
import { pullToRefresh } from '../../../src/ui/actions/pull-to-refresh';

function makeScrollContainer(): HTMLDivElement {
  const el = document.createElement('div');
  Object.defineProperty(el, 'scrollTop', { value: 0, writable: true });
  document.body.appendChild(el);
  return el;
}

describe('pullToRefresh', () => {
  it('calls onRefresh when pulled beyond threshold and released', () => {
    const el = makeScrollContainer();
    const onRefresh = vi.fn();
    const action = pullToRefresh(el, { onRefresh, threshold: 60 });

    el.dispatchEvent(new PointerEvent('pointerdown', { clientY: 100 }));
    el.dispatchEvent(new PointerEvent('pointermove', { clientY: 180 }));
    el.dispatchEvent(new PointerEvent('pointerup', { clientY: 180 }));

    expect(onRefresh).toHaveBeenCalledOnce();
    action.destroy();
  });

  it('does not call onRefresh when pull is below threshold', () => {
    const el = makeScrollContainer();
    const onRefresh = vi.fn();
    const action = pullToRefresh(el, { onRefresh, threshold: 60 });

    el.dispatchEvent(new PointerEvent('pointerdown', { clientY: 100 }));
    el.dispatchEvent(new PointerEvent('pointermove', { clientY: 130 }));
    el.dispatchEvent(new PointerEvent('pointerup', { clientY: 130 }));

    expect(onRefresh).not.toHaveBeenCalled();
    action.destroy();
  });

  it('does not trigger when scrollTop > 0', () => {
    const el = makeScrollContainer();
    Object.defineProperty(el, 'scrollTop', { value: 50, writable: true });
    const onRefresh = vi.fn();
    const action = pullToRefresh(el, { onRefresh, threshold: 60 });

    el.dispatchEvent(new PointerEvent('pointerdown', { clientY: 100 }));
    el.dispatchEvent(new PointerEvent('pointermove', { clientY: 200 }));
    el.dispatchEvent(new PointerEvent('pointerup', { clientY: 200 }));

    expect(onRefresh).not.toHaveBeenCalled();
    action.destroy();
  });
});
