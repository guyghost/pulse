import { describe, it, expect, vi } from 'vitest';
import { ScanOrchestrator } from '../../../src/lib/state/scan-orchestrator.svelte';
import type { ConnectorDeps, ScanOrchestratorInput } from '../../../src/lib/state/scan-orchestrator.svelte';
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

    const orchestrator = new ScanOrchestrator(input);

    expect(orchestrator.state).toBe('idle');

    await orchestrator.startScan();

    expect(orchestrator.state).toBe('done');

    // Vérifier que le scan a bien traversé les états
    expect(orchestrator.missions).toHaveLength(1);
    expect(orchestrator.missions[0].id).toBe('1');
  });

  it('completes scan with two connectors sequentially — both done, missions collected', async () => {
    const missions1 = [makeMission('1', 'free-work'), makeMission('2', 'free-work')];
    const missions2 = [makeMission('3', 'lehibou')];

    const deps = [
      makeConnectorDeps('fw', 'Free-Work', missions1),
      makeConnectorDeps('lehibou', 'LeHibou', missions2),
    ];
    const input = makeInput(deps);

    const orchestrator = new ScanOrchestrator(input);
    await orchestrator.startScan();

    expect(orchestrator.state).toBe('done');

    // Missions agrégées des deux connecteurs
    expect(orchestrator.missions).toHaveLength(3);
    expect(orchestrator.missions.map((m) => m.id)).toEqual(['1', '2', '3']);

    // Statuts des deux connecteurs
    const fwStatus = orchestrator.connectorStatuses.get('fw');
    expect(fwStatus).toBeDefined();
    expect(fwStatus!.state).toBe('done');
    expect(fwStatus!.missionsCount).toBe(2);

    const lehibouStatus = orchestrator.connectorStatuses.get('lehibou');
    expect(lehibouStatus).toBeDefined();
    expect(lehibouStatus!.state).toBe('done');
    expect(lehibouStatus!.missionsCount).toBe(1);
  });

  it('one connector fails, other succeeds — scan completes with error recorded', async () => {
    const detectError = createConnectorError('Session expirée', {
      connectorId: 'lehibou',
      phase: 'detect',
      recoverable: false,
    }, Date.now());

    const missions1 = [makeMission('1', 'free-work')];
    const deps = [
      makeConnectorDeps('fw', 'Free-Work', missions1),
      makeConnectorDeps('lehibou', 'LeHibou', [], {
        detectSession: vi.fn<(now: number) => Promise<Result<boolean, AppError>>>()
          .mockResolvedValue(errResult(detectError)),
      }),
    ];
    const input = makeInput(deps);

    const orchestrator = new ScanOrchestrator(input);
    await orchestrator.startScan();

    expect(orchestrator.state).toBe('done');

    // Le premier connecteur a réussi
    expect(orchestrator.missions).toHaveLength(1);
    expect(orchestrator.missions[0].id).toBe('1');

    const fwStatus = orchestrator.connectorStatuses.get('fw');
    expect(fwStatus!.state).toBe('done');
    expect(fwStatus!.error).toBeNull();

    // Le second a échoué
    const lehibouStatus = orchestrator.connectorStatuses.get('lehibou');
    expect(lehibouStatus!.state).toBe('error');
    expect(lehibouStatus!.error).not.toBeNull();

    // Pas d'erreur globale (seulement un connecteur a échoué)
    expect(orchestrator.globalError).toBeNull();
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

    const orchestrator = new ScanOrchestrator(input);

    // Démarrer le scan en arrière-plan
    const scanPromise = orchestrator.startScan();

    // Attendre que le scan soit en cours (state = 'scanning')
    await vi.waitFor(
      () => { expect(orchestrator.state).toBe('scanning'); },
      { timeout: 5000 },
    );

    orchestrator.cancel();

    await scanPromise;

    expect(orchestrator.state).toBe('cancelled');
  });

  it('RESET from done goes to idle with context cleared', async () => {
    const missions = [makeMission('1', 'free-work')];
    const deps = [makeConnectorDeps('fw', 'Free-Work', missions)];
    const input = makeInput(deps);

    const orchestrator = new ScanOrchestrator(input);
    await orchestrator.startScan();

    expect(orchestrator.state).toBe('done');

    // Vérifier qu'on a des données
    expect(orchestrator.missions).toHaveLength(1);

    // Reset
    orchestrator.reset();

    expect(orchestrator.state).toBe('idle');
    expect(orchestrator.missions).toHaveLength(0);
    expect(orchestrator.connectorStatuses.size).toBe(0);
    expect(orchestrator.currentConnectorIndex).toBe(0);
    expect(orchestrator.globalError).toBeNull();
  });

  it('goes to done with globalError when offline', async () => {
    const deps = [makeConnectorDeps('fw', 'Free-Work', [makeMission('1', 'free-work')])];
    const input = makeInput(deps, false);

    const orchestrator = new ScanOrchestrator(input);

    await orchestrator.startScan();

    expect(orchestrator.state).toBe('done');
    expect(orchestrator.globalError).toBe('Pas de connexion internet');
    expect(orchestrator.missions).toHaveLength(0);
  });
});
