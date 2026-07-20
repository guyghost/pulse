import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================================
// Mock chrome.alarms
// ============================================================================

const registeredAlarms: Map<string, chrome.alarms.AlarmCreateInfo> = new Map();

const mockAlarms = {
  create: vi.fn(async (name: string, info: chrome.alarms.AlarmCreateInfo) => {
    registeredAlarms.set(name, info);
  }),
  clear: vi.fn(async (name: string) => {
    registeredAlarms.delete(name);
    return true;
  }),
  get: vi.fn(async (name: string) => {
    const info = registeredAlarms.get(name);
    if (!info) {
      return undefined;
    }
    return {
      name,
      scheduledTime: info.when ?? Date.now() + (info.delayInMinutes ?? 0) * 60 * 1000,
      periodInMinutes: info.periodInMinutes,
    };
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
  reconcileProbeAlarmsLocally,
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

  it('refuse un nom de probe sans identifiant de connecteur', () => {
    expect(connectorIdFromAlarm('probe:')).toBeNull();
    expect(connectorIdFromAlarm('auto-scan')).toBeNull();
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
    await scheduleProbe('freework', DEFAULT_HEALTH_THRESHOLDS, T0);

    expect(mockAlarms.create).toHaveBeenCalledWith('probe:freework', {
      when: T0 + DEFAULT_HEALTH_THRESHOLDS.probeIntervalMs,
    });
    expect(mockAlarms.get).toHaveBeenCalledWith('probe:freework');
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

  it("rejette et nettoie une création dont le read-back n'est pas exact", async () => {
    mockAlarms.get.mockResolvedValueOnce({
      name: 'probe:freework',
      scheduledTime: T0 + DEFAULT_HEALTH_THRESHOLDS.probeIntervalMs + 1,
      periodInMinutes: undefined,
    });

    await expect(scheduleProbe('freework', DEFAULT_HEALTH_THRESHOLDS, T0)).rejects.toMatchObject({
      code: 'PROBE_ALARM_READBACK_MISMATCH',
    });

    expect(mockAlarms.clear).toHaveBeenLastCalledWith('probe:freework');
  });

  it("attend la fin réelle de create avant d'effectuer le read-back", async () => {
    let finishCreate: (() => void) | undefined;
    mockAlarms.create.mockImplementationOnce(
      (name: string, info: chrome.alarms.AlarmCreateInfo) =>
        new Promise<void>((resolve) => {
          finishCreate = () => {
            registeredAlarms.set(name, info);
            resolve();
          };
        })
    );

    const scheduling = scheduleProbe('freework', DEFAULT_HEALTH_THRESHOLDS, T0);
    await vi.waitFor(() => {
      expect(finishCreate).toBeTypeOf('function');
    });

    expect(mockAlarms.get).not.toHaveBeenCalled();
    finishCreate?.();
    await scheduling;

    expect(mockAlarms.get).toHaveBeenCalledWith('probe:freework');
  });

  it('propage un rejet create sans fabriquer de read-back réussi', async () => {
    mockAlarms.create.mockRejectedValueOnce(new Error('alarm create rejected'));

    await expect(scheduleProbe('freework', DEFAULT_HEALTH_THRESHOLDS, T0)).rejects.toThrow(
      'alarm create rejected'
    );

    expect(mockAlarms.get).not.toHaveBeenCalled();
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

  it("rejette si l'absence finale ne peut pas être prouvée", async () => {
    mockAlarms.get.mockResolvedValueOnce({
      name: 'probe:freework',
      scheduledTime: T0,
      periodInMinutes: undefined,
    });

    await expect(cancelProbe('freework')).rejects.toMatchObject({
      code: 'PROBE_ALARM_READBACK_MISMATCH',
    });
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
    const snap = makeSnapshot('free-work', { circuitState: 'open' });
    await syncProbeAlarm(snap);

    expect(mockAlarms.create).toHaveBeenCalledWith('probe:free-work', expect.any(Object));
  });

  it('annule la probe si le circuit est closed', async () => {
    const snap = makeSnapshot('free-work', { circuitState: 'closed' });
    await syncProbeAlarm(snap);

    expect(mockAlarms.clear).toHaveBeenCalledWith('probe:free-work');
    expect(mockAlarms.create).not.toHaveBeenCalled();
  });

  it('annule la probe si le circuit est half-open', async () => {
    const snap = makeSnapshot('free-work', { circuitState: 'half-open' });
    await syncProbeAlarm(snap);

    expect(mockAlarms.clear).toHaveBeenCalledWith('probe:free-work');
    expect(mockAlarms.create).not.toHaveBeenCalled();
  });

  it("refuse un snapshot qui n'appartient pas au build avant toute mutation", async () => {
    const snap = makeSnapshot('not-shipped', { circuitState: 'open' });

    await expect(syncProbeAlarm(snap)).rejects.toMatchObject({
      code: 'PROBE_HEALTH_PROOF_UNAVAILABLE',
    });

    expect(mockAlarms.clear).not.toHaveBeenCalled();
    expect(mockAlarms.create).not.toHaveBeenCalled();
    expect(mockAlarms.get).not.toHaveBeenCalled();
  });
});

describe('reconcileProbeAlarmsLocally', () => {
  beforeEach(() => {
    registeredAlarms.clear();
    vi.clearAllMocks();
  });

  it('converge les alarmes incluses et nettoie uniquement les probes exclues ou malformées', async () => {
    registeredAlarms.set('probe:excluded', { when: T0 + 1 });
    registeredAlarms.set('probe:', { when: T0 + 1 });
    registeredAlarms.set('unowned-alarm', { when: T0 + 1 });
    const snapshots = new Map<string, ConnectorHealthSnapshot>([
      ['free-work', makeSnapshot('free-work', { circuitState: 'open' })],
      ['lehibou', makeSnapshot('lehibou', { circuitState: 'closed' })],
    ]);

    await reconcileProbeAlarmsLocally(
      ['free-work', 'lehibou'],
      snapshots,
      DEFAULT_HEALTH_THRESHOLDS,
      T0
    );

    expect(registeredAlarms.get('probe:free-work')).toEqual({
      when: T0 + DEFAULT_HEALTH_THRESHOLDS.probeIntervalMs,
    });
    expect(registeredAlarms.has('probe:lehibou')).toBe(false);
    expect(registeredAlarms.has('probe:excluded')).toBe(false);
    expect(registeredAlarms.has('probe:')).toBe(false);
    expect(registeredAlarms.has('unowned-alarm')).toBe(true);
  });

  it('refuse une clé/snapshot incohérente avant toute mutation probe', async () => {
    registeredAlarms.set('probe:excluded', { when: T0 + 1 });
    const snapshots = new Map<string, ConnectorHealthSnapshot>([
      ['free-work', makeSnapshot('lehibou', { circuitState: 'open' })],
    ]);

    await expect(
      reconcileProbeAlarmsLocally(['free-work'], snapshots, DEFAULT_HEALTH_THRESHOLDS, T0)
    ).rejects.toMatchObject({ code: 'PROBE_HEALTH_PROOF_UNAVAILABLE' });

    expect(mockAlarms.clear).not.toHaveBeenCalled();
    expect(mockAlarms.create).not.toHaveBeenCalled();
    expect(registeredAlarms.has('probe:excluded')).toBe(true);
  });
});
