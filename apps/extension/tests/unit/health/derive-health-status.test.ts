import { describe, expect, it } from 'vitest';
import { deriveHealthStatus } from '../../../src/lib/core/health/derive-health-status';
import {
  createInitialHealthSnapshot,
  type ConnectorHealthSnapshot,
} from '../../../src/lib/core/types/health';

const NOW = 1_700_000_000_000;

function makeSnapshot(overrides: Partial<ConnectorHealthSnapshot> = {}): ConnectorHealthSnapshot {
  return { ...createInitialHealthSnapshot('free-work', NOW), ...overrides };
}

describe('deriveHealthStatus', () => {
  it('returns healthy when circuit is closed and there are no failures', () => {
    expect(deriveHealthStatus(makeSnapshot())).toBe('healthy');
  });

  it('returns degraded when failures are below threshold', () => {
    expect(deriveHealthStatus(makeSnapshot({ consecutiveFailures: 1 }))).toBe('degraded');
  });

  it('returns degraded when circuit is half-open', () => {
    expect(deriveHealthStatus(makeSnapshot({ circuitState: 'half-open' }))).toBe('degraded');
  });

  it('returns broken when circuit is open', () => {
    expect(deriveHealthStatus(makeSnapshot({ circuitState: 'open' }))).toBe('broken');
  });

  it('returns broken when failures reach threshold', () => {
    expect(deriveHealthStatus(makeSnapshot({ consecutiveFailures: 3 }), 3)).toBe('broken');
  });
});
