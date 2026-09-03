import { afterEach, describe, expect, it, vi } from 'vitest';
import { swipe } from '../../../src/ui/actions/swipe';

function pointerEvent(type: string, x: number, y: number, id = 1): PointerEvent {
  return new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    pointerId: id,
    clientX: x,
    clientY: y,
  });
}

function playSwipe(el: HTMLElement, dx: number, dy = 0, id = 1) {
  el.dispatchEvent(pointerEvent('pointerdown', 100, 100, id));
  el.dispatchEvent(pointerEvent('pointermove', 100 + Math.sign(dx) * 10, 100 + dy, id));
  el.dispatchEvent(pointerEvent('pointermove', 100 + dx, 100 + dy, id));
  el.dispatchEvent(pointerEvent('pointerup', 100 + dx, 100 + dy, id));
}

describe('swipe', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fires onSwipeRight when dragged past the threshold to the right', () => {
    const el = document.createElement('div');
    const onSwipeRight = vi.fn();
    const onSwipeLeft = vi.fn();
    swipe(el, { onSwipeRight, onSwipeLeft });

    playSwipe(el, 60);

    expect(onSwipeRight).toHaveBeenCalledTimes(1);
    expect(onSwipeLeft).not.toHaveBeenCalled();
  });

  it('fires onSwipeLeft when dragged past the threshold to the left', () => {
    const el = document.createElement('div');
    const onSwipeRight = vi.fn();
    const onSwipeLeft = vi.fn();
    swipe(el, { onSwipeRight, onSwipeLeft });

    playSwipe(el, -60);

    expect(onSwipeLeft).toHaveBeenCalledTimes(1);
    expect(onSwipeRight).not.toHaveBeenCalled();
  });

  it('springs back without firing below the threshold', () => {
    const el = document.createElement('div');
    const onSwipeRight = vi.fn();
    const onSwipeLeft = vi.fn();
    swipe(el, { onSwipeRight, onSwipeLeft });

    playSwipe(el, 40);

    expect(onSwipeRight).not.toHaveBeenCalled();
    expect(onSwipeLeft).not.toHaveBeenCalled();
    expect(el.style.transform).toBe('');
  });

  it('ignores the gesture entirely when disabled', () => {
    const el = document.createElement('div');
    const onSwipeRight = vi.fn();
    const action = swipe(el, { onSwipeRight, onSwipeLeft: vi.fn(), enabled: false });

    playSwipe(el, 60);

    expect(onSwipeRight).not.toHaveBeenCalled();
    expect(el.style.transform).toBe('');
    action.destroy();
  });

  it('honors update() toggling enabled at runtime', () => {
    const el = document.createElement('div');
    const onSwipeLeft = vi.fn();
    const action = swipe(el, { onSwipeRight: vi.fn(), onSwipeLeft });

    action.update({ onSwipeRight: vi.fn(), onSwipeLeft, enabled: false });
    playSwipe(el, -60);
    expect(onSwipeLeft).not.toHaveBeenCalled();

    action.update({ onSwipeRight: vi.fn(), onSwipeLeft });
    playSwipe(el, -60);
    expect(onSwipeLeft).toHaveBeenCalledTimes(1);
    action.destroy();
  });

  it('releases the gesture on vertical intent so scrolling stays master', () => {
    const el = document.createElement('div');
    const onSwipeRight = vi.fn();
    swipe(el, { onSwipeRight, onSwipeLeft: vi.fn() });

    el.dispatchEvent(pointerEvent('pointerdown', 100, 100));
    el.dispatchEvent(pointerEvent('pointermove', 104, 120)); // |dy| > |dx|
    el.dispatchEvent(pointerEvent('pointermove', 120, 160));
    el.dispatchEvent(pointerEvent('pointerup', 120, 160));

    expect(onSwipeRight).not.toHaveBeenCalled();
    expect(el.style.transform).toBe('');
  });

  it('suppresses the click that follows a validated swipe', () => {
    const el = document.createElement('div');
    const onClick = vi.fn();
    el.addEventListener('click', onClick);
    swipe(el, { onSwipeRight: vi.fn(), onSwipeLeft: vi.fn() });

    playSwipe(el, 60);
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    expect(onClick).not.toHaveBeenCalled();
  });

  it('lets normal clicks through when no horizontal intent was locked', () => {
    const el = document.createElement('div');
    const onClick = vi.fn();
    el.addEventListener('click', onClick);
    swipe(el, { onSwipeRight: vi.fn(), onSwipeLeft: vi.fn() });

    el.dispatchEvent(pointerEvent('pointerdown', 100, 100));
    el.dispatchEvent(pointerEvent('pointerup', 102, 101));
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    expect(onClick).toHaveBeenCalledTimes(1);
  });
});
