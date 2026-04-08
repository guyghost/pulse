import { describe, it, expect, vi } from 'vitest';
import { ripple } from '../../../src/ui/actions/ripple';

function makeEl(): HTMLElement {
  const el = document.createElement('button');
  el.style.position = 'relative';
  el.getBoundingClientRect = () => ({
    left: 10,
    top: 10,
    width: 100,
    height: 40,
    right: 110,
    bottom: 50,
    x: 10,
    y: 10,
    toJSON() {},
  });
  document.body.appendChild(el);
  return el;
}

describe('ripple', () => {
  it('adds a span on pointerdown and removes it after animation', () => {
    vi.useFakeTimers();
    const el = makeEl();
    const action = ripple(el);

    el.dispatchEvent(new PointerEvent('pointerdown', { clientX: 50, clientY: 30 }));
    expect(el.querySelector('span')).not.toBeNull();

    vi.advanceTimersByTime(500);
    expect(el.querySelector('span')).toBeNull();

    action.destroy();
    vi.useRealTimers();
  });

  it('sets overflow hidden on the element', () => {
    const el = makeEl();
    const action = ripple(el);
    expect(el.style.overflow).toBe('hidden');
    action.destroy();
  });
});
