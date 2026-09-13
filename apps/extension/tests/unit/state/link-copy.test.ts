import { describe, expect, it } from 'vitest';
import {
  COPY_FEEDBACK_MS,
  createLinkCopyController,
} from '../../../src/lib/state/link-copy.svelte.ts';

/** Deterministic clock: feedback timers only fire when advance() is called. */
function createManualClock() {
  let sequence = 0;
  const pending = new Map<number, () => void>();
  const delay = (handler: () => void, _ms: number) => {
    const id = ++sequence;
    pending.set(id, handler);
    return () => {
      pending.delete(id);
    };
  };
  return {
    delay,
    advance: () => {
      const handlers = [...pending.values()];
      pending.clear();
      for (const handler of handlers) {
        handler();
      }
    },
    pendingCount: () => pending.size,
  };
}

/** Fake clipboard whose behavior can flip between copies (retry scenarios). */
function createClipboard(mode: 'resolve' | 'reject' = 'resolve') {
  const state = { mode };
  const writes: string[] = [];
  return {
    state,
    writes,
    writeText: (text: string) => {
      if (state.mode === 'reject') {
        return Promise.reject(new Error('clipboard denied'));
      }
      writes.push(text);
      return Promise.resolve();
    },
  };
}

describe('createLinkCopyController', () => {
  it('passe à « copied » au succès puis revient à « idle » après le délai de feedback', async () => {
    const clock = createManualClock();
    const controller = createLinkCopyController(createClipboard(), clock.delay);

    expect(controller.status).toBe('idle');
    const succeeded = await controller.copy('https://example.com/mission-1');
    expect(succeeded).toBe(true);
    expect(controller.status).toBe('copied');

    clock.advance();
    expect(controller.status).toBe('idle');
    expect(COPY_FEEDBACK_MS).toBe(1500);
  });

  it('passe à « error » quand le clipboard refuse, sans faux « copié », puis se réinitialise (DAO #178)', async () => {
    const clock = createManualClock();
    const controller = createLinkCopyController(createClipboard('reject'), clock.delay);

    const succeeded = await controller.copy('https://example.com/mission-1');
    expect(succeeded).toBe(false);
    expect(controller.status).toBe('error');
    expect(clock.pendingCount()).toBe(1);

    // Auto-reset after the feedback window.
    clock.advance();
    expect(controller.status).toBe('idle');
  });

  it('annule le timer d’erreur lors d’une nouvelle tentative qui réussit', async () => {
    const clock = createManualClock();
    const clipboard = createClipboard('reject');
    const controller = createLinkCopyController(clipboard, clock.delay);

    await controller.copy('https://example.com/mission-1');
    expect(controller.status).toBe('error');
    expect(clock.pendingCount()).toBe(1);

    // The clipboard recovers (permission granted, focus restored): the retry
    // must cancel the pending error reset, not stack a second timer.
    clipboard.state.mode = 'resolve';
    await controller.copy('https://example.com/mission-1');
    expect(controller.status).toBe('copied');
    expect(clock.pendingCount()).toBe(1);

    clock.advance();
    expect(controller.status).toBe('idle');
    expect(clock.pendingCount()).toBe(0);
  });

  it('ne cumule pas les timers lors de copies rapides (cleanup avant chaque nouvelle copie)', async () => {
    const clock = createManualClock();
    const controller = createLinkCopyController(createClipboard(), clock.delay);

    await controller.copy('https://example.com/mission-1');
    expect(clock.pendingCount()).toBe(1);

    await controller.copy('https://example.com/mission-2');
    expect(clock.pendingCount()).toBe(1);

    clock.advance();
    expect(controller.status).toBe('idle');
    expect(clock.pendingCount()).toBe(0);
  });

  it('dispose() annule le timer de feedback en attente', async () => {
    const clock = createManualClock();
    const controller = createLinkCopyController(createClipboard(), clock.delay);

    await controller.copy('https://example.com/mission-1');
    expect(controller.status).toBe('copied');

    controller.dispose();
    expect(clock.pendingCount()).toBe(0);

    // The cancelled timer never fires: the status is simply frozen until the
    // next copy — no late state write after unmount.
    clock.advance();
    expect(controller.status).toBe('copied');
  });

  it('dispose() est idempotent', () => {
    const clock = createManualClock();
    const controller = createLinkCopyController(createClipboard(), clock.delay);
    controller.dispose();
    controller.dispose();
    expect(clock.pendingCount()).toBe(0);
  });
});
