import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  verifySourceSession,
  openSourceInNewTab,
  type VerifySourceSessionDeps,
} from '../../../src/lib/shell/onboarding/verify-source-session';
import { createNetworkError } from '../../../src/lib/core/errors/app-error';

function fakeConnector(
  detectSession: (
    now: number
  ) => Promise<
    { ok: true; value: boolean } | { ok: false; error: ReturnType<typeof createNetworkError> }
  >
): VerifySourceSessionDeps['getConnector'] {
  return vi.fn(async (id: string) => ({
    id,
    detectSession,
  }));
}

describe('verifySourceSession (P0-B)', () => {
  it('session détectée → ready', async () => {
    const result = await verifySourceSession('free-work', {
      getConnector: fakeConnector(async () => ({ ok: true, value: true })),
      now: () => 1_000,
    });
    expect(result).toEqual({ sourceId: 'free-work', status: 'ready' });
  });

  it('pas de session → session-missing', async () => {
    const result = await verifySourceSession('lehibou', {
      getConnector: fakeConnector(async () => ({ ok: true, value: false })),
      now: () => 1_000,
    });
    expect(result).toEqual({ sourceId: 'lehibou', status: 'session-missing' });
  });

  it('échec de détection → unavailable', async () => {
    const result = await verifySourceSession('lehibou', {
      getConnector: fakeConnector(async () => ({
        ok: false,
        error: createNetworkError('HTTP 503', { status: 503 }),
      })),
      now: () => 1_000,
    });
    expect(result).toEqual({ sourceId: 'lehibou', status: 'unavailable' });
  });

  it('connecteur absent du registre → unavailable', async () => {
    const result = await verifySourceSession('ghost', {
      getConnector: async () => undefined,
      now: () => 1_000,
    });
    expect(result).toEqual({ sourceId: 'ghost', status: 'unavailable' });
  });

  it('exception du connecteur → unavailable (jamais de throw vers l’UI)', async () => {
    const result = await verifySourceSession('lehibou', {
      getConnector: vi.fn(async () => {
        throw new Error('boom');
      }) as unknown as VerifySourceSessionDeps['getConnector'],
      now: () => 1_000,
    });
    expect(result).toEqual({ sourceId: 'lehibou', status: 'unavailable' });
  });
});

describe('openSourceInNewTab', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('opens through Chrome when the tab API is available', async () => {
    const create = vi.fn().mockResolvedValue({ id: 1 });
    vi.stubGlobal('chrome', { tabs: { create } });
    const popup = vi.spyOn(window, 'open').mockReturnValue(null);
    await openSourceInNewTab('https://www.free-work.com');
    expect(create).toHaveBeenCalledWith({ url: 'https://www.free-work.com' });
    expect(popup).not.toHaveBeenCalled();
  });

  it('propagates a Chrome opening failure without trying to hide it with a popup', async () => {
    const error = new Error('Tab creation refused');
    vi.stubGlobal('chrome', { tabs: { create: vi.fn().mockRejectedValue(error) } });
    const popup = vi.spyOn(window, 'open').mockReturnValue(null);
    await expect(openSourceInNewTab('https://www.free-work.com')).rejects.toBe(error);
    expect(popup).not.toHaveBeenCalled();
  });

  it('uses the best effort browser fallback only when the Chrome tab API is absent', async () => {
    vi.stubGlobal('chrome', undefined);
    const popup = vi.spyOn(window, 'open').mockReturnValue(null);
    await expect(openSourceInNewTab('https://www.free-work.com')).resolves.toBeUndefined();
    expect(popup).toHaveBeenCalledWith('https://www.free-work.com', '_blank', 'noopener');
  });
});
