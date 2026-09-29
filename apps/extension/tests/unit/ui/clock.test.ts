import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mount, tick, unmount } from 'svelte';
import ClockProbe from './fixtures/ClockProbe.svelte';

describe('reactive clock', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('refreshes subscribers on the shared tick', async () => {
    const target = document.createElement('div');
    document.body.appendChild(target);
    const instance = mount(ClockProbe, { target });
    await tick();

    // First shared tick (30s interval) repaints the subscriber.
    await vi.advanceTimersByTimeAsync(30_000);
    await tick();

    expect(target.querySelector('[data-testid="clock-now"]')?.textContent).toBe(
      String(Date.parse('2026-01-01T00:00:30.000Z'))
    );

    unmount(instance);
  });
});
