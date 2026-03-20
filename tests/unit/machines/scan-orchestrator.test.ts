import { describe, it, expect, vi } from 'vitest';
import { createActor } from 'xstate';
import { scanOrchestratorMachine } from '../../../src/machines/scan.machine';
import type { ConnectorDeps, ScanOrchestratorInput } from '../../../src/machines/scan.machine';
import type { Mission } from '../../../src/lib/core/types/mission';
import type { AppError } from '../../../src/lib/core/errors/app-error';
import { createConnectorError } from '../../../src/lib/core/errors/app-error';
import type { Result } from '../../../src/lib/core/errors/result';

// ============================================================================
// Helpers
// ============================================================================

function makeMission(id: string, source: string): Mission {
  return {
    id,
    title: `Mission ${id}`,
    client: 'Acme',
    description: `Description ${id}`,
    stack: ['TypeScript'],
    tjm: 500,
    location: 'Paris',
    remote: 'full',
    duration: '3 mois',
    url: `https://example.com/${id}`,
    source: source as Mission['source'],
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

function makeConnectorDeps(
  id: string,
  name: string,
  missions: Mission[],
  overrides: Partial<ConnectorDeps> = {},
): ConnectorDeps {
  return {
    connectorId: id,
    connectorName: name,
    detectSession: vi.fn<(now: number) => Promise<Result<boolean, AppError>>>()
      .mockResolvedValue(okResult(true)),
    fetchMissions: vi.fn<(now: number) => Promise<Result<Mission[], AppError>>>()
      .mockResolvedValue(okResult(missions)),
    ...overrides,
  };
}

function makeInput(deps: ConnectorDeps[], isOnline = true): ScanOrchestratorInput {
  return {
    connectorDeps: deps,
    isOnline: () => isOnline,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('scan orchestrator machine', () => {
  it('starts in idle, transitions to preparing/scanning on START_SCAN', async () => {
    const missions = [makeMission('1', 'free-work')];
    const deps = [makeConnectorDeps('fw', 'Free-Work', missions)];
    const input = makeInput(deps);

    const actor = createActor(scanOrchestratorMachine, { input });
    actor.start();

    expect(actor.getSnapshot().value).toBe('idle');

    actor.send({ type: 'START_SCAN' });

    await vi.waitFor(
      () => { expect(actor.getSnapshot().value).toBe('done'); },
      { timeout: 15000 },
    );

    // Vérifier que le scan a bien traversé les états
    const ctx = actor.getSnapshot().context;
    expect(ctx.missions).toHaveLength(1);
    expect(ctx.missions[0].id).toBe('1');

    actor.stop();
  });

  it('completes scan with two connectors sequentially — both done, missions collected', async () => {
    const missions1 = [makeMission('1', 'free-work'), makeMission('2', 'free-work')];
    const missions2 = [makeMission('3', 'comet')];

    const deps = [
      makeConnectorDeps('fw', 'Free-Work', missions1),
      makeConnectorDeps('comet', 'Comet', missions2),
    ];
    const input = makeInput(deps);

    const actor = createActor(scanOrchestratorMachine, { input });
    actor.start();
    actor.send({ type: 'START_SCAN' });

    await vi.waitFor(
      () => { expect(actor.getSnapshot().value).toBe('done'); },
      { timeout: 15000 },
    );

    const ctx = actor.getSnapshot().context;

    // Missions agrégées des deux connecteurs
    expect(ctx.missions).toHaveLength(3);
    expect(ctx.missions.map((m) => m.id)).toEqual(['1', '2', '3']);

    // Statuts des deux connecteurs
    const fwStatus = ctx.connectorStatuses.get('fw');
    expect(fwStatus).toBeDefined();
    expect(fwStatus!.state).toBe('done');
    expect(fwStatus!.missionsCount).toBe(2);

    const cometStatus = ctx.connectorStatuses.get('comet');
    expect(cometStatus).toBeDefined();
    expect(cometStatus!.state).toBe('done');
    expect(cometStatus!.missionsCount).toBe(1);

    actor.stop();
  });

  it('one connector fails, other succeeds — scan completes with error recorded', async () => {
    const detectError = createConnectorError('Session expirée', {
      connectorId: 'comet',
      phase: 'detect',
      recoverable: false,
    }, Date.now());

    const missions1 = [makeMission('1', 'free-work')];
    const deps = [
      makeConnectorDeps('fw', 'Free-Work', missions1),
      makeConnectorDeps('comet', 'Comet', [], {
        detectSession: vi.fn<(now: number) => Promise<Result<boolean, AppError>>>()
          .mockResolvedValue(errResult(detectError)),
      }),
    ];
    const input = makeInput(deps);

    const actor = createActor(scanOrchestratorMachine, { input });
    actor.start();
    actor.send({ type: 'START_SCAN' });

    await vi.waitFor(
      () => { expect(actor.getSnapshot().value).toBe('done'); },
      { timeout: 15000 },
    );

    const ctx = actor.getSnapshot().context;

    // Le premier connecteur a réussi
    expect(ctx.missions).toHaveLength(1);
    expect(ctx.missions[0].id).toBe('1');

    const fwStatus = ctx.connectorStatuses.get('fw');
    expect(fwStatus!.state).toBe('done');
    expect(fwStatus!.error).toBeNull();

    // Le second a échoué
    const cometStatus = ctx.connectorStatuses.get('comet');
    expect(cometStatus!.state).toBe('error');
    expect(cometStatus!.error).not.toBeNull();

    // Pas d'erreur globale (seulement un connecteur a échoué)
    expect(ctx.globalError).toBeNull();

    actor.stop();
  });

  it('CANCEL during scanning goes to cancelled state', async () => {
    // Utiliser un délai pour que le scan soit en cours quand on cancel
    const slowDetect = vi.fn<(now: number) => Promise<Result<boolean, AppError>>>()
      .mockImplementation(() => new Promise((resolve) => setTimeout(() => resolve(okResult(true)), 500)));

    const deps = [
      makeConnectorDeps('fw', 'Free-Work', [makeMission('1', 'free-work')], {
        detectSession: slowDetect,
      }),
    ];
    const input = makeInput(deps);

    const actor = createActor(scanOrchestratorMachine, { input });
    actor.start();
    actor.send({ type: 'START_SCAN' });

    // Attendre que le scan soit en cours
    await vi.waitFor(
      () => { expect(actor.getSnapshot().value).toBe('scanning'); },
      { timeout: 5000 },
    );

    actor.send({ type: 'CANCEL' });

    expect(actor.getSnapshot().value).toBe('cancelled');

    actor.stop();
  });

  it('RESET from done goes to idle with context cleared', async () => {
    const missions = [makeMission('1', 'free-work')];
    const deps = [makeConnectorDeps('fw', 'Free-Work', missions)];
    const input = makeInput(deps);

    const actor = createActor(scanOrchestratorMachine, { input });
    actor.start();
    actor.send({ type: 'START_SCAN' });

    await vi.waitFor(
      () => { expect(actor.getSnapshot().value).toBe('done'); },
      { timeout: 15000 },
    );

    // Vérifier qu'on a des données
    expect(actor.getSnapshot().context.missions).toHaveLength(1);

    // Reset
    actor.send({ type: 'RESET' });

    expect(actor.getSnapshot().value).toBe('idle');

    const ctx = actor.getSnapshot().context;
    expect(ctx.missions).toHaveLength(0);
    expect(ctx.connectorStatuses.size).toBe(0);
    expect(ctx.currentConnectorIndex).toBe(0);
    expect(ctx.globalError).toBeNull();

    actor.stop();
  });

  it('goes to done with globalError when offline', () => {
    const deps = [makeConnectorDeps('fw', 'Free-Work', [makeMission('1', 'free-work')])];
    const input = makeInput(deps, false);

    const actor = createActor(scanOrchestratorMachine, { input });
    actor.start();

    actor.send({ type: 'START_SCAN' });

    expect(actor.getSnapshot().value).toBe('done');
    expect(actor.getSnapshot().context.globalError).toBe('Pas de connexion internet');
    expect(actor.getSnapshot().context.missions).toHaveLength(0);

    actor.stop();
  });
});
