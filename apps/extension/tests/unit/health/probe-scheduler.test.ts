import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================================
// Mock chrome.alarms
// ============================================================================

const registeredAlarms: Map<string, chrome.alarms.AlarmCreateInfo> = new Map();

const mockAlarms = {
  create: vi.fn((name: string, info: chrome.alarms.AlarmCreateInfo) => {
    registeredAlarms.set(name, info);
  }),
  clear: vi.fn(async (name: string) => {
    registeredAlarms.delete(name);
    return true;
  }),
  getAll: vi.fn(async () => {
    return Array.from(registeredAlarms.entries()).map(([name, info]) => ({
      name,
      scheduledTime: Date.now() + (info.delayInMinutes ?? 0) * 60 * 1000,
      periodInMinutes: info.periodInMinutes,
    }));
  }),
};

vi.stubGlobal('chrome', {
  alarms: mockAlarms,
  storage: {
    local: {
      get: vi.fn(async () => ({})),
      set: vi.fn(async () => {}),
      remove: vi.fn(async () => {}),
    },
  },
});

// ============================================================================
// Imports (après stub)
// ============================================================================

import {
  scheduleProbe,
  cancelProbe,
  cancelAllProbes,
  syncProbeAlarm,
  probeAlarmName,
  isProbeAlarm,
  connectorIdFromAlarm,
} from '../../../src/lib/shell/health/probe-scheduler';
import {
  createInitialHealthSnapshot,
  DEFAULT_HEALTH_THRESHOLDS,
} from '../../../src/lib/core/types/health';
import type { ConnectorHealthSnapshot } from '../../../src/lib/core/types/health';

// ============================================================================
// Helpers
// ============================================================================

const T0 = 1_000_000;

function makeSnapshot(
  connectorId: string,
  overrides: Partial<ConnectorHealthSnapshot> = {}
): ConnectorHealthSnapshot {
  return { ...createInitialHealthSnapshot(connectorId, T0), ...overrides };
}

// ============================================================================
// Naming helpers
// ============================================================================

describe('alarm name helpers', () => {
  it('probeAlarmName génère le bon nom', () => {
    expect(probeAlarmName('freework')).toBe('probe:freework');
  });

  it('isProbeAlarm détecte les alarms de probe', () => {
    expect(isProbeAlarm('probe:freework')).toBe(true);
    expect(isProbeAlarm('auto-scan')).toBe(false);
  });

  it("connectorIdFromAlarm extrait l'ID du connecteur", () => {
    expect(connectorIdFromAlarm('probe:freework')).toBe('freework');
    expect(connectorIdFromAlarm('probe:lehibou')).toBe('lehibou');
  });
});

// ============================================================================
// scheduleProbe
// ============================================================================

describe('scheduleProbe', () => {
  beforeEach(() => {
    registeredAlarms.clear();
    vi.clearAllMocks();
  });

  it('crée une alarme avec le bon délai', async () => {
    await scheduleProbe('freework', DEFAULT_HEALTH_THRESHOLDS);

    expect(mockAlarms.create).toHaveBeenCalledWith(
      'probe:freework',
      expect.objectContaining({
        delayInMinutes: DEFAULT_HEALTH_THRESHOLDS.probeIntervalMs / (60 * 1000),
      })
    );
  });

  it("utilise le nom de connecteur dans le nom de l'alarme", async () => {
    await scheduleProbe('lehibou', DEFAULT_HEALTH_THRESHOLDS);

    expect(mockAlarms.create).toHaveBeenCalledWith('probe:lehibou', expect.any(Object));
  });

  it("supprime l'ancienne alarme avant d'en créer une nouvelle (idempotence)", async () => {
    await scheduleProbe('freework');
    await scheduleProbe('freework');

    expect(mockAlarms.clear).toHaveBeenCalledTimes(2);
    expect(mockAlarms.create).toHaveBeenCalledTimes(2);
  });
});

// ============================================================================
// cancelProbe
// ============================================================================

describe('cancelProbe', () => {
  beforeEach(() => {
    registeredAlarms.clear();
    vi.clearAllMocks();
  });

  it("supprime l'alarme du connecteur", async () => {
    await scheduleProbe('freework');
    vi.clearAllMocks();

    await cancelProbe('freework');

    expect(mockAlarms.clear).toHaveBeenCalledWith('probe:freework');
  });

  it("ne lève pas d'erreur si l'alarme n'existe pas", async () => {
    await expect(cancelProbe('unknown-connector')).resolves.toBeUndefined();
  });
});

// ============================================================================
// cancelAllProbes
// ============================================================================

describe('cancelAllProbes', () => {
  beforeEach(() => {
    registeredAlarms.clear();
    vi.clearAllMocks();
  });

  it('annule toutes les alarmes de probe', async () => {
    await scheduleProbe('freework');
    await scheduleProbe('lehibou');
    vi.clearAllMocks();
    // Remettre les alarmes dans le mock
    registeredAlarms.set('probe:freework', { delayInMinutes: 30 });
    registeredAlarms.set('probe:lehibou', { delayInMinutes: 30 });
    registeredAlarms.set('auto-scan', { periodInMinutes: 30 }); // ne doit pas être supprimée

    await cancelAllProbes();

    // auto-scan ne doit pas avoir été supprimée
    const clearCalls = mockAlarms.clear.mock.calls.map((c) => c[0]);
    expect(clearCalls).toContain('probe:freework');
    expect(clearCalls).toContain('probe:lehibou');
    expect(clearCalls).not.toContain('auto-scan');
  });
});

// ============================================================================
// syncProbeAlarm
// ============================================================================

describe('syncProbeAlarm', () => {
  beforeEach(() => {
    registeredAlarms.clear();
    vi.clearAllMocks();
  });

  it('schedule une probe si le circuit est open', async () => {
    const snap = makeSnapshot('freework', { circuitState: 'open' });
    await syncProbeAlarm(snap);

    expect(mockAlarms.create).toHaveBeenCalledWith('probe:freework', expect.any(Object));
  });

  it('annule la probe si le circuit est closed', async () => {
    const snap = makeSnapshot('freework', { circuitState: 'closed' });
    await syncProbeAlarm(snap);

    expect(mockAlarms.clear).toHaveBeenCalledWith('probe:freework');
    expect(mockAlarms.create).not.toHaveBeenCalled();
  });

  it('annule la probe si le circuit est half-open', async () => {
    const snap = makeSnapshot('freework', { circuitState: 'half-open' });
    await syncProbeAlarm(snap);

    expect(mockAlarms.clear).toHaveBeenCalledWith('probe:freework');
    expect(mockAlarms.create).not.toHaveBeenCalled();
  });
});
