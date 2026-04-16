import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================================
// Mock chrome.storage.local
// ============================================================================

const mockStorageData: Record<string, unknown> = {};

const mockStorage = {
  get: vi.fn(async (key: string) => ({ [key]: mockStorageData[key] })),
  set: vi.fn(async (items: Record<string, unknown>) => {
    Object.assign(mockStorageData, items);
  }),
  remove: vi.fn(async (key: string) => {
    delete mockStorageData[key];
  }),
};

vi.stubGlobal('chrome', {
  storage: { local: mockStorage },
});

// ============================================================================
// Imports (après le stub global)
// ============================================================================

import {
  getHealthSnapshot,
  saveHealthSnapshot,
  getAllHealthSnapshots,
  resetHealthSnapshot,
  clearAllHealthSnapshots,
} from '../../../src/lib/shell/storage/connector-health';
import { createInitialHealthSnapshot } from '../../../src/lib/core/types/health';
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
// getHealthSnapshot
// ============================================================================

describe('getHealthSnapshot', () => {
  beforeEach(() => {
    // Vider le storage mock entre chaque test
    for (const key of Object.keys(mockStorageData)) {
      delete mockStorageData[key];
    }
    vi.clearAllMocks();
  });

  it('retourne un snapshot initial si aucune donnée stockée', async () => {
    const snap = await getHealthSnapshot('freework', T0);
    expect(snap.connectorId).toBe('freework');
    expect(snap.circuitState).toBe('closed');
    expect(snap.consecutiveFailures).toBe(0);
  });

  it('retourne le snapshot stocké s\'il existe', async () => {
    const stored = makeSnapshot('freework', { circuitState: 'open', consecutiveFailures: 3 });
    await saveHealthSnapshot(stored);

    const loaded = await getHealthSnapshot('freework', T0 + 99999);
    expect(loaded.circuitState).toBe('open');
    expect(loaded.consecutiveFailures).toBe(3);
  });

  it('retourne un snapshot initial si les données sont corrompues', async () => {
    // Injecter des données corrompues directement dans le mock storage
    mockStorageData['connector_health_snapshots'] = { freework: { invalid: true } };

    const snap = await getHealthSnapshot('freework', T0);
    expect(snap.circuitState).toBe('closed'); // fallback initial
  });
});

// ============================================================================
// saveHealthSnapshot / getAllHealthSnapshots
// ============================================================================

describe('saveHealthSnapshot', () => {
  beforeEach(() => {
    for (const key of Object.keys(mockStorageData)) {
      delete mockStorageData[key];
    }
    vi.clearAllMocks();
  });

  it('persiste et recharge correctement le snapshot', async () => {
    const snap = makeSnapshot('lehibou', { totalFailures: 5, totalSuccesses: 10 });
    await saveHealthSnapshot(snap);

    const loaded = await getHealthSnapshot('lehibou', T0);
    expect(loaded.totalFailures).toBe(5);
    expect(loaded.totalSuccesses).toBe(10);
  });

  it('ne touche pas aux autres connecteurs lors d\'une sauvegarde', async () => {
    const snapA = makeSnapshot('freework', { consecutiveFailures: 1 });
    const snapB = makeSnapshot('lehibou', { consecutiveFailures: 2 });

    await saveHealthSnapshot(snapA);
    await saveHealthSnapshot(snapB);

    const loadedA = await getHealthSnapshot('freework', T0);
    const loadedB = await getHealthSnapshot('lehibou', T0);

    expect(loadedA.consecutiveFailures).toBe(1);
    expect(loadedB.consecutiveFailures).toBe(2);
  });
});

// ============================================================================
// getAllHealthSnapshots
// ============================================================================

describe('getAllHealthSnapshots', () => {
  beforeEach(() => {
    for (const key of Object.keys(mockStorageData)) {
      delete mockStorageData[key];
    }
    vi.clearAllMocks();
  });

  it('retourne des snapshots initiaux pour des connecteurs inconnus', async () => {
    const map = await getAllHealthSnapshots(['freework', 'lehibou'], T0);
    expect(map.size).toBe(2);
    expect(map.get('freework')?.circuitState).toBe('closed');
    expect(map.get('lehibou')?.circuitState).toBe('closed');
  });

  it('mélange snapshots stockés et initiaux correctement', async () => {
    const stored = makeSnapshot('freework', { circuitState: 'open' });
    await saveHealthSnapshot(stored);

    const map = await getAllHealthSnapshots(['freework', 'lehibou'], T0);
    expect(map.get('freework')?.circuitState).toBe('open');
    expect(map.get('lehibou')?.circuitState).toBe('closed');
  });
});

// ============================================================================
// resetHealthSnapshot / clearAllHealthSnapshots
// ============================================================================

describe('resetHealthSnapshot', () => {
  beforeEach(() => {
    for (const key of Object.keys(mockStorageData)) {
      delete mockStorageData[key];
    }
    vi.clearAllMocks();
  });

  it('supprime le snapshot d\'un connecteur', async () => {
    await saveHealthSnapshot(makeSnapshot('freework', { circuitState: 'open' }));
    await resetHealthSnapshot('freework');

    const loaded = await getHealthSnapshot('freework', T0 + 1000);
    expect(loaded.circuitState).toBe('closed'); // retourne un snapshot initial
  });

  it('ne supprime pas les autres connecteurs', async () => {
    await saveHealthSnapshot(makeSnapshot('freework', { circuitState: 'open' }));
    await saveHealthSnapshot(makeSnapshot('lehibou', { circuitState: 'open' }));

    await resetHealthSnapshot('freework');

    const lehibou = await getHealthSnapshot('lehibou', T0);
    expect(lehibou.circuitState).toBe('open');
  });
});

describe('clearAllHealthSnapshots', () => {
  beforeEach(() => {
    for (const key of Object.keys(mockStorageData)) {
      delete mockStorageData[key];
    }
    vi.clearAllMocks();
  });

  it('vide tous les snapshots', async () => {
    await saveHealthSnapshot(makeSnapshot('freework', { circuitState: 'open' }));
    await saveHealthSnapshot(makeSnapshot('lehibou', { circuitState: 'open' }));

    await clearAllHealthSnapshots();

    const freework = await getHealthSnapshot('freework', T0);
    const lehibou = await getHealthSnapshot('lehibou', T0);
    expect(freework.circuitState).toBe('closed');
    expect(lehibou.circuitState).toBe('closed');
  });
});

// ============================================================================
// Edge case : quota exceeded
// ============================================================================

describe('saveHealthSnapshot — quota exceeded', () => {
  beforeEach(() => {
    for (const key of Object.keys(mockStorageData)) {
      delete mockStorageData[key];
    }
    vi.clearAllMocks();
  });

  it('tente un fallback avec latences élaguées si QUOTA_BYTES dépassé', async () => {
    // Premier appel set() lance une erreur QUOTA_BYTES, le second réussit
    let callCount = 0;
    mockStorage.set.mockImplementation(async (items: Record<string, unknown>) => {
      callCount++;
      if (callCount === 1) {
        throw new Error('QUOTA_BYTES_PER_ITEM exceeded');
      }
      Object.assign(mockStorageData, items);
    });

    const largeLatencies = Array.from({ length: 100 }, (_, i) => i * 10);
    const snap = makeSnapshot('freework', { recentLatenciesMs: largeLatencies });

    // Ne devrait pas lancer d'exception
    await expect(saveHealthSnapshot(snap)).resolves.toBeUndefined();

    // Le deuxième appel (fallback) doit avoir eu lieu
    expect(callCount).toBe(2);
  });

  it('ne lance pas d’exception même si le fallback échoue aussi', async () => {
    mockStorage.set.mockRejectedValue(new Error('QUOTA_BYTES_PER_ITEM exceeded'));

    const snap = makeSnapshot('freework');
    await expect(saveHealthSnapshot(snap)).resolves.toBeUndefined();
  });
});
