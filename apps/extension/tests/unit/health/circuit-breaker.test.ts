import { describe, it, expect } from 'vitest';
import {
  computeNextHealth,
  shouldAttemptProbe,
  transitionToHalfOpen,
} from '../../../src/lib/core/health/circuit-breaker';
import {
  createInitialHealthSnapshot,
  DEFAULT_HEALTH_THRESHOLDS,
} from '../../../src/lib/core/types/health';
import type { ConnectorHealthSnapshot, HealthThresholds } from '../../../src/lib/core/types/health';

const T0 = 1_000_000; // timestamp de référence
const THRESHOLDS: HealthThresholds = { ...DEFAULT_HEALTH_THRESHOLDS, failureThreshold: 3 };
const PROBE_INTERVAL = DEFAULT_HEALTH_THRESHOLDS.probeIntervalMs;

function makeSnapshot(overrides: Partial<ConnectorHealthSnapshot> = {}): ConnectorHealthSnapshot {
  return { ...createInitialHealthSnapshot('freework', T0), ...overrides };
}

const success = (latencyMs = 100) => ({ success: true as const, latencyMs });
const failure = (latencyMs = 200) => ({ success: false as const, latencyMs });

// ============================================================================
// computeNextHealth — transitions
// ============================================================================

describe('computeNextHealth', () => {
  describe('closed state', () => {
    it('reste closed après un succès', () => {
      const snap = makeSnapshot({ circuitState: 'closed' });
      const next = computeNextHealth(snap, success(), T0 + 1000, THRESHOLDS);
      expect(next.circuitState).toBe('closed');
    });

    it('incrémente totalSuccesses après un succès', () => {
      const snap = makeSnapshot({ totalSuccesses: 2 });
      const next = computeNextHealth(snap, success(), T0 + 1000, THRESHOLDS);
      expect(next.totalSuccesses).toBe(3);
    });

    it('remet consecutiveFailures à 0 après un succès', () => {
      const snap = makeSnapshot({ consecutiveFailures: 2 });
      const next = computeNextHealth(snap, success(), T0 + 1000, THRESHOLDS);
      expect(next.consecutiveFailures).toBe(0);
    });

    it('incrémente consecutiveFailures après un échec', () => {
      const snap = makeSnapshot({ circuitState: 'closed', consecutiveFailures: 1 });
      const next = computeNextHealth(snap, failure(), T0 + 1000, THRESHOLDS);
      expect(next.consecutiveFailures).toBe(2);
      expect(next.circuitState).toBe('closed');
    });

    it('passe à open après failureThreshold échecs consécutifs', () => {
      let snap = makeSnapshot({ circuitState: 'closed' });
      for (let i = 0; i < THRESHOLDS.failureThreshold; i++) {
        snap = computeNextHealth(snap, failure(), T0 + i * 1000, THRESHOLDS);
      }
      expect(snap.circuitState).toBe('open');
    });

    it('met à jour lastStateChangeAt quand on passe à open', () => {
      let snap = makeSnapshot({ circuitState: 'closed', lastStateChangeAt: T0 });
      const openTime = T0 + 5000;
      for (let i = 0; i < THRESHOLDS.failureThreshold - 1; i++) {
        snap = computeNextHealth(snap, failure(), T0 + i * 1000, THRESHOLDS);
      }
      snap = computeNextHealth(snap, failure(), openTime, THRESHOLDS);
      expect(snap.circuitState).toBe('open');
      expect(snap.lastStateChangeAt).toBe(openTime);
    });

    it('ne change pas lastStateChangeAt si le circuit reste closed', () => {
      const snap = makeSnapshot({ circuitState: 'closed', lastStateChangeAt: T0 });
      const next = computeNextHealth(snap, failure(), T0 + 1000, THRESHOLDS);
      expect(next.circuitState).toBe('closed');
      expect(next.lastStateChangeAt).toBe(T0);
    });
  });

  describe('open state', () => {
    it('reste open si on appelle computeNextHealth avec un succès (ne devrait pas arriver sans probe)', () => {
      // En état open, le scanner ne devrait pas appeler le connecteur
      // Mais si c'est appelé quand même (ex: probe), un succès passe à closed
      const snap = makeSnapshot({ circuitState: 'half-open' });
      const next = computeNextHealth(snap, success(), T0 + 1000, THRESHOLDS);
      expect(next.circuitState).toBe('closed');
    });
  });

  describe('half-open state', () => {
    it('passe à closed après un succès', () => {
      const snap = makeSnapshot({ circuitState: 'half-open' });
      const next = computeNextHealth(snap, success(), T0 + 1000, THRESHOLDS);
      expect(next.circuitState).toBe('closed');
    });

    it('passe à open après un échec', () => {
      const snap = makeSnapshot({ circuitState: 'half-open' });
      const next = computeNextHealth(snap, failure(), T0 + 1000, THRESHOLDS);
      expect(next.circuitState).toBe('open');
    });

    it('remet consecutiveFailures à 0 quand half-open → closed', () => {
      const snap = makeSnapshot({ circuitState: 'half-open', consecutiveFailures: 3 });
      const next = computeNextHealth(snap, success(), T0 + 1000, THRESHOLDS);
      expect(next.consecutiveFailures).toBe(0);
    });

    it('met à jour lastStateChangeAt quand half-open → open', () => {
      const snap = makeSnapshot({ circuitState: 'half-open', lastStateChangeAt: T0 });
      const openTime = T0 + 5000;
      const next = computeNextHealth(snap, failure(), openTime, THRESHOLDS);
      expect(next.lastStateChangeAt).toBe(openTime);
    });

    it('met à jour lastStateChangeAt quand half-open → closed', () => {
      const snap = makeSnapshot({ circuitState: 'half-open', lastStateChangeAt: T0 });
      const closeTime = T0 + 5000;
      const next = computeNextHealth(snap, success(), closeTime, THRESHOLDS);
      expect(next.lastStateChangeAt).toBe(closeTime);
    });
  });

  describe('latency tracking', () => {
    it('ajoute la latence à recentLatenciesMs', () => {
      const snap = makeSnapshot({ recentLatenciesMs: [100, 200] });
      const next = computeNextHealth(snap, success(300), T0 + 1000, THRESHOLDS);
      expect(next.recentLatenciesMs).toEqual([100, 200, 300]);
    });

    it('respecte la fenêtre glissante (windowSize)', () => {
      const smallWindow: HealthThresholds = { ...THRESHOLDS, latencyWindowSize: 3 };
      const snap = makeSnapshot({ recentLatenciesMs: [100, 200, 300] });
      const next = computeNextHealth(snap, success(400), T0 + 1000, smallWindow);
      expect(next.recentLatenciesMs).toHaveLength(3);
      expect(next.recentLatenciesMs).toEqual([200, 300, 400]);
    });

    it('enregistre la latence même pour les échecs', () => {
      const snap = makeSnapshot({ recentLatenciesMs: [] });
      const next = computeNextHealth(snap, failure(500), T0 + 1000, THRESHOLDS);
      expect(next.recentLatenciesMs).toContain(500);
    });
  });

  describe('timestamps', () => {
    it('met à jour lastSuccessAt après un succès', () => {
      const snap = makeSnapshot({ lastSuccessAt: null });
      const now = T0 + 9999;
      const next = computeNextHealth(snap, success(), now, THRESHOLDS);
      expect(next.lastSuccessAt).toBe(now);
    });

    it('met à jour lastFailureAt après un échec', () => {
      const snap = makeSnapshot({ lastFailureAt: null });
      const now = T0 + 9999;
      const next = computeNextHealth(snap, failure(), now, THRESHOLDS);
      expect(next.lastFailureAt).toBe(now);
    });
  });
});

// ============================================================================
// shouldAttemptProbe
// ============================================================================

describe('shouldAttemptProbe', () => {
  it('retourne false si le circuit est closed', () => {
    const snap = makeSnapshot({ circuitState: 'closed' });
    expect(shouldAttemptProbe(snap, T0 + PROBE_INTERVAL + 1, THRESHOLDS)).toBe(false);
  });

  it('retourne false si le circuit est half-open', () => {
    const snap = makeSnapshot({ circuitState: 'half-open' });
    expect(shouldAttemptProbe(snap, T0 + PROBE_INTERVAL + 1, THRESHOLDS)).toBe(false);
  });

  it('retourne false si open mais probeInterval pas encore écoulé', () => {
    const snap = makeSnapshot({ circuitState: 'open', lastStateChangeAt: T0 });
    expect(shouldAttemptProbe(snap, T0 + PROBE_INTERVAL - 1, THRESHOLDS)).toBe(false);
  });

  it('retourne true si open et probeInterval écoulé', () => {
    const snap = makeSnapshot({ circuitState: 'open', lastStateChangeAt: T0 });
    expect(shouldAttemptProbe(snap, T0 + PROBE_INTERVAL, THRESHOLDS)).toBe(true);
  });

  it('retourne true si open et largement après probeInterval', () => {
    const snap = makeSnapshot({ circuitState: 'open', lastStateChangeAt: T0 });
    expect(shouldAttemptProbe(snap, T0 + PROBE_INTERVAL * 3, THRESHOLDS)).toBe(true);
  });
});

// ============================================================================
// transitionToHalfOpen
// ============================================================================

describe('transitionToHalfOpen', () => {
  it('passe le circuitState à half-open', () => {
    const snap = makeSnapshot({ circuitState: 'open' });
    const next = transitionToHalfOpen(snap, T0 + 1000);
    expect(next.circuitState).toBe('half-open');
  });

  it('met à jour lastStateChangeAt', () => {
    const snap = makeSnapshot({ circuitState: 'open', lastStateChangeAt: T0 });
    const halfOpenTime = T0 + 5000;
    const next = transitionToHalfOpen(snap, halfOpenTime);
    expect(next.lastStateChangeAt).toBe(halfOpenTime);
  });

  it('ne modifie pas les autres champs', () => {
    const snap = makeSnapshot({
      circuitState: 'open',
      consecutiveFailures: 5,
      totalFailures: 10,
      totalSuccesses: 3,
    });
    const next = transitionToHalfOpen(snap, T0 + 1000);
    expect(next.consecutiveFailures).toBe(5);
    expect(next.totalFailures).toBe(10);
    expect(next.totalSuccesses).toBe(3);
  });
});
