import { describe, it, expect } from 'vitest';
import { computeHealthMetrics, percentile } from '../../../src/lib/core/health/health-metrics';
import { createInitialHealthSnapshot } from '../../../src/lib/core/types/health';
import type { ConnectorHealthSnapshot } from '../../../src/lib/core/types/health';

const T0 = 1_000_000;

function makeSnapshot(overrides: Partial<ConnectorHealthSnapshot> = {}): ConnectorHealthSnapshot {
  return { ...createInitialHealthSnapshot('freework', T0), ...overrides };
}

// ============================================================================
// percentile
// ============================================================================

describe('percentile', () => {
  it('retourne null pour un tableau vide', () => {
    expect(percentile([], 50)).toBeNull();
  });

  it('retourne la seule valeur pour un tableau à 1 élément', () => {
    expect(percentile([42], 50)).toBe(42);
    expect(percentile([42], 95)).toBe(42);
  });

  it('calcule la médiane (p50) correctement', () => {
    expect(percentile([1, 2, 3, 4, 5], 50)).toBe(3);
  });

  it('calcule p95 sur un tableau de 100 valeurs', () => {
    const values = Array.from({ length: 100 }, (_, i) => i + 1); // 1..100
    const p95 = percentile(values, 95);
    // index = 0.95 * 99 = 94.05 → interpolation entre 95 et 96
    expect(p95).toBeCloseTo(95.05, 1);
  });

  it('interpolation linéaire entre deux valeurs', () => {
    const result = percentile([0, 100], 50);
    expect(result).toBe(50);
  });
});

// ============================================================================
// computeHealthMetrics
// ============================================================================

describe('computeHealthMetrics', () => {
  it('retourne des métriques nulles pour un snapshot vierge', () => {
    const snap = makeSnapshot();
    const metrics = computeHealthMetrics(snap, T0 + 5000);
    expect(metrics.p50LatencyMs).toBeNull();
    expect(metrics.p95LatencyMs).toBeNull();
    expect(metrics.failureRate).toBe(0);
    expect(metrics.totalCalls).toBe(0);
    expect(metrics.msSinceLastSuccess).toBeNull();
  });

  it("calcule le taux d'échec correctement", () => {
    const snap = makeSnapshot({ totalSuccesses: 7, totalFailures: 3 });
    const metrics = computeHealthMetrics(snap, T0 + 1000);
    expect(metrics.failureRate).toBeCloseTo(0.3);
    expect(metrics.totalCalls).toBe(10);
  });

  it('calcule msSinceLastSuccess correctement', () => {
    const lastSuccess = T0 + 1000;
    const now = T0 + 6000;
    const snap = makeSnapshot({ lastSuccessAt: lastSuccess });
    const metrics = computeHealthMetrics(snap, now);
    expect(metrics.msSinceLastSuccess).toBe(5000);
  });

  it('calcule p50 et p95 depuis les latences récentes', () => {
    const latencies = Array.from({ length: 20 }, (_, i) => (i + 1) * 10); // 10..200
    const snap = makeSnapshot({ recentLatenciesMs: latencies });
    const metrics = computeHealthMetrics(snap, T0 + 1000);
    expect(metrics.p50LatencyMs).not.toBeNull();
    expect(metrics.p95LatencyMs).not.toBeNull();
    expect(metrics.p95LatencyMs!).toBeGreaterThan(metrics.p50LatencyMs!);
  });

  it("taux d'échec = 1 si aucun succès", () => {
    const snap = makeSnapshot({ totalFailures: 5, totalSuccesses: 0 });
    const metrics = computeHealthMetrics(snap, T0 + 1000);
    expect(metrics.failureRate).toBe(1);
  });

  it("taux d'échec = 0 si aucun échec", () => {
    const snap = makeSnapshot({ totalSuccesses: 10, totalFailures: 0 });
    const metrics = computeHealthMetrics(snap, T0 + 1000);
    expect(metrics.failureRate).toBe(0);
  });
});
