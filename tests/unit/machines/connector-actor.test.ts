import { describe, it, expect, vi } from 'vitest';
import { createActor } from 'xstate';
import { connectorActorMachine } from '../../../src/machines/connector.actor';
import type { ConnectorActorInput } from '../../../src/machines/connector.actor';
import type { Mission } from '../../../src/lib/core/types/mission';
import type { AppError } from '../../../src/lib/core/errors/app-error';
import { createConnectorError, createNetworkError } from '../../../src/lib/core/errors/app-error';
import type { Result } from '../../../src/lib/core/errors/result';

// ============================================================================
// Helpers
// ============================================================================

function makeMission(id: string): Mission {
  return {
    id,
    title: `Mission ${id}`,
    client: 'Acme',
    description: 'Test',
    stack: ['TypeScript'],
    tjm: 500,
    location: 'Paris',
    remote: 'full',
    duration: '3 mois',
    url: `https://example.com/${id}`,
    source: 'free-work',
    scrapedAt: new Date('2026-01-01'),
    score: 50,
    semanticScore: null,
    semanticReason: null,
  };
}

function okResult<T>(value: T): Result<T, AppError> {
  return { ok: true, value };
}

function errResult(error: AppError): Result<never, AppError> {
  return { ok: false, error };
}

function makeInput(overrides: Partial<ConnectorActorInput> = {}): ConnectorActorInput {
  return {
    connectorId: 'test-connector',
    connectorName: 'Test Connector',
    detectSession: vi.fn<(now: number) => Promise<Result<boolean, AppError>>>()
      .mockResolvedValue(okResult(true)),
    fetchMissions: vi.fn<(now: number) => Promise<Result<Mission[], AppError>>>()
      .mockResolvedValue(okResult([makeMission('1')])),
    ...overrides,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('connector actor machine', () => {
  it('idle → detecting → fetching → done on success', async () => {
    const missions = [makeMission('1'), makeMission('2')];
    const detectSession = vi.fn<(now: number) => Promise<Result<boolean, AppError>>>()
      .mockResolvedValue(okResult(true));
    const fetchMissions = vi.fn<(now: number) => Promise<Result<Mission[], AppError>>>()
      .mockResolvedValue(okResult(missions));

    const input = makeInput({ detectSession, fetchMissions });
    const actor = createActor(connectorActorMachine, { input });

    actor.start();
    expect(actor.getSnapshot().value).toBe('idle');

    actor.send({ type: 'START' });

    await vi.waitFor(
      () => { expect(actor.getSnapshot().status).toBe('done'); },
      { timeout: 5000 },
    );

    const ctx = actor.getSnapshot().context;
    expect(ctx.missions).toHaveLength(2);
    expect(ctx.missions[0].id).toBe('1');
    expect(ctx.missions[1].id).toBe('2');
    expect(ctx.error).toBeNull();
    expect(detectSession).toHaveBeenCalledOnce();
    expect(fetchMissions).toHaveBeenCalledOnce();

    actor.stop();
  });

  it('goes to done with error when detection returns ok: false', async () => {
    const detectError = createConnectorError('Erreur réseau', {
      connectorId: 'test-connector',
      phase: 'detect',
      recoverable: false,
    }, Date.now());

    const detectSession = vi.fn<(now: number) => Promise<Result<boolean, AppError>>>()
      .mockResolvedValue(errResult(detectError));
    const fetchMissions = vi.fn<(now: number) => Promise<Result<Mission[], AppError>>>()
      .mockResolvedValue(okResult([]));

    const input = makeInput({ detectSession, fetchMissions });
    const actor = createActor(connectorActorMachine, { input });

    actor.start();
    actor.send({ type: 'START' });

    await vi.waitFor(
      () => { expect(actor.getSnapshot().status).toBe('done'); },
      { timeout: 5000 },
    );

    const ctx = actor.getSnapshot().context;
    expect(ctx.error).not.toBeNull();
    expect(ctx.error!.type).toBe('connector');
    expect(ctx.missions).toHaveLength(0);
    expect(fetchMissions).not.toHaveBeenCalled();

    actor.stop();
  });

  it('goes to done with error when session not detected (ok: true, value: false)', async () => {
    const detectSession = vi.fn<(now: number) => Promise<Result<boolean, AppError>>>()
      .mockResolvedValue(okResult(false));
    const fetchMissions = vi.fn<(now: number) => Promise<Result<Mission[], AppError>>>()
      .mockResolvedValue(okResult([]));

    const input = makeInput({ detectSession, fetchMissions });
    const actor = createActor(connectorActorMachine, { input });

    actor.start();
    actor.send({ type: 'START' });

    await vi.waitFor(
      () => { expect(actor.getSnapshot().status).toBe('done'); },
      { timeout: 5000 },
    );

    const ctx = actor.getSnapshot().context;
    expect(ctx.error).not.toBeNull();
    expect(ctx.error!.type).toBe('connector');
    if (ctx.error!.type === 'connector') {
      expect(ctx.error!.phase).toBe('detect');
      expect(ctx.error!.recoverable).toBe(true);
    }
    expect(ctx.missions).toHaveLength(0);
    expect(fetchMissions).not.toHaveBeenCalled();

    actor.stop();
  });

  it('retries on retryable fetch error then succeeds', async () => {
    const retryableError = createNetworkError('Timeout', {
      retryable: true,
      status: 503,
    }, Date.now());

    const missions = [makeMission('1')];
    const detectSession = vi.fn<(now: number) => Promise<Result<boolean, AppError>>>()
      .mockResolvedValue(okResult(true));
    const fetchMissions = vi.fn<(now: number) => Promise<Result<Mission[], AppError>>>()
      .mockResolvedValueOnce(errResult(retryableError))
      .mockResolvedValueOnce(okResult(missions));

    const input = makeInput({ detectSession, fetchMissions, maxRetries: 3 });
    const actor = createActor(connectorActorMachine, { input });

    actor.start();
    actor.send({ type: 'START' });

    await vi.waitFor(
      () => { expect(actor.getSnapshot().status).toBe('done'); },
      { timeout: 15000 },
    );

    const ctx = actor.getSnapshot().context;
    expect(ctx.missions).toHaveLength(1);
    expect(ctx.error).toBeNull();
    expect(ctx.retryCount).toBe(1);
    expect(fetchMissions).toHaveBeenCalledTimes(2);

    actor.stop();
  });

  it('goes to done with error after max retries exhausted', async () => {
    const retryableError = createNetworkError('Timeout', {
      retryable: true,
      status: 503,
    }, Date.now());

    const maxRetries = 1;
    const detectSession = vi.fn<(now: number) => Promise<Result<boolean, AppError>>>()
      .mockResolvedValue(okResult(true));
    const fetchMissions = vi.fn<(now: number) => Promise<Result<Mission[], AppError>>>()
      .mockResolvedValue(errResult(retryableError));

    const input = makeInput({ detectSession, fetchMissions, maxRetries });
    const actor = createActor(connectorActorMachine, { input });

    actor.start();
    actor.send({ type: 'START' });

    await vi.waitFor(
      () => { expect(actor.getSnapshot().status).toBe('done'); },
      { timeout: 15000 },
    );

    const ctx = actor.getSnapshot().context;
    expect(ctx.error).not.toBeNull();
    expect(ctx.error!.type).toBe('network');
    expect(ctx.missions).toHaveLength(0);
    // Initial call + maxRetries retries = maxRetries + 1
    expect(fetchMissions).toHaveBeenCalledTimes(maxRetries + 1);

    actor.stop();
  });
});
