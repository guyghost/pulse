import { describe, expect, it, vi } from 'vitest';
import {
  verifySourceSession,
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
