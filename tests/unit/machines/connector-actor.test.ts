import { describe, it, expect, vi } from 'vitest';
import { ConnectorRunner } from '../../../src/lib/state/connector-runner.svelte';
import type { ConnectorActorInput } from '../../../src/lib/state/connector-runner.svelte';
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
    const runner = new ConnectorRunner(input);

    await runner.run();

    expect(runner.missions).toHaveLength(2);
    expect(runner.missions[0].id).toBe('1');
    expect(runner.missions[1].id).toBe('2');
    expect(runner.error).toBeNull();
    expect(detectSession).toHaveBeenCalledOnce();
    expect(fetchMissions).toHaveBeenCalledOnce();
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
    const runner = new ConnectorRunner(input);

    await runner.run();

    expect(runner.error).not.toBeNull();
    expect(runner.error!.type).toBe('connector');
    expect(runner.missions).toHaveLength(0);
    expect(fetchMissions).not.toHaveBeenCalled();
  });

  it('goes to done with error when session not detected (ok: true, value: false)', async () => {
    const detectSession = vi.fn<(now: number) => Promise<Result<boolean, AppError>>>()
      .mockResolvedValue(okResult(false));
    const fetchMissions = vi.fn<(now: number) => Promise<Result<Mission[], AppError>>>()
      .mockResolvedValue(okResult([]));

    const input = makeInput({ detectSession, fetchMissions });
    const runner = new ConnectorRunner(input);

    await runner.run();

    expect(runner.error).not.toBeNull();
    expect(runner.error!.type).toBe('connector');
    if (runner.error!.type === 'connector') {
      expect(runner.error!.phase).toBe('detect');
      expect(runner.error!.recoverable).toBe(true);
    }
    expect(runner.missions).toHaveLength(0);
    expect(fetchMissions).not.toHaveBeenCalled();
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
    const runner = new ConnectorRunner(input);

    await runner.run();

    expect(runner.missions).toHaveLength(1);
    expect(runner.error).toBeNull();
    expect(runner.retryCount).toBe(1);
    expect(fetchMissions).toHaveBeenCalledTimes(2);
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
    const runner = new ConnectorRunner(input);

    await runner.run();

    expect(runner.error).not.toBeNull();
    expect(runner.error!.type).toBe('network');
    expect(runner.missions).toHaveLength(0);
    // Initial call + maxRetries retries = maxRetries + 1
    expect(fetchMissions).toHaveBeenCalledTimes(maxRetries + 1);
  });

  // ---------------------------------------------------------------------------
  // Non-retryable error path - critical for reliability hardening
  // ---------------------------------------------------------------------------

  it('does NOT retry on non-retryable fetch error (403 Forbidden)', async () => {
    const nonRetryableError = createNetworkError('Forbidden', {
      retryable: false,
      status: 403,
    }, Date.now());

    const detectSession = vi.fn<(now: number) => Promise<Result<boolean, AppError>>>()
      .mockResolvedValue(okResult(true));
    const fetchMissions = vi.fn<(now: number) => Promise<Result<Mission[], AppError>>>()
      .mockResolvedValue(errResult(nonRetryableError));

    const input = makeInput({ detectSession, fetchMissions, maxRetries: 3 });
    const runner = new ConnectorRunner(input);

    await runner.run();

    expect(runner.error).not.toBeNull();
    expect(runner.error!.type).toBe('network');
    if (runner.error!.type === 'network') {
      expect(runner.error!.retryable).toBe(false);
      expect(runner.error!.status).toBe(403);
    }
    expect(runner.missions).toHaveLength(0);
    // Critical: only called once, no retries for non-retryable error
    expect(fetchMissions).toHaveBeenCalledTimes(1);
    expect(runner.retryCount).toBe(0);
  });

  it('does NOT retry on parsing error (non-retryable by nature)', async () => {
    const parsingError = createConnectorError('Parse failed: malformed JSON', {
      connectorId: 'test-connector',
      phase: 'parse',
      recoverable: false,
    }, Date.now());

    const detectSession = vi.fn<(now: number) => Promise<Result<boolean, AppError>>>()
      .mockResolvedValue(okResult(true));
    const fetchMissions = vi.fn<(now: number) => Promise<Result<Mission[], AppError>>>()
      .mockResolvedValue(errResult(parsingError));

    const input = makeInput({ detectSession, fetchMissions, maxRetries: 3 });
    const runner = new ConnectorRunner(input);

    await runner.run();

    expect(runner.error).not.toBeNull();
    // Only called once, no retries
    expect(fetchMissions).toHaveBeenCalledTimes(1);
    expect(runner.retryCount).toBe(0);
  });
});
