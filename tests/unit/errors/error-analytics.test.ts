import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================================
// Mock chrome.storage.local
// ============================================================================

const mockStorage: Record<string, unknown> = {};

vi.stubGlobal('chrome', {
  storage: {
    local: {
      get: vi.fn(async (key: string) => ({ [key]: mockStorage[key] })),
      set: vi.fn(async (items: Record<string, unknown>) => {
        Object.assign(mockStorage, items);
      }),
      remove: vi.fn(async (key: string) => {
        delete mockStorage[key];
      }),
    },
  },
});

import {
  recordError,
  persistErrors,
  getErrorLog,
  clearErrorLog,
  getErrorSummary,
  _getBuffer,
  _resetBuffer,
} from '../../../src/lib/shell/errors/error-analytics';
import type { AppError } from '../../../src/lib/core/errors/app-error';

// ============================================================================
// Helpers
// ============================================================================

function makeConnectorError(overrides: Partial<{ message: string; connectorId: string; timestamp: number }> = {}): AppError {
  return {
    type: 'connector',
    message: overrides.message ?? 'Erreur connecteur',
    recoverable: false,
    connectorId: overrides.connectorId ?? 'free-work',
    phase: 'fetch',
    timestamp: overrides.timestamp ?? Date.now(),
  } as AppError;
}

function makeNetworkError(overrides: Partial<{ message: string; timestamp: number }> = {}): AppError {
  return {
    type: 'network',
    message: overrides.message ?? 'Erreur reseau',
    recoverable: true,
    retryable: true,
    status: 500,
    timestamp: overrides.timestamp ?? Date.now(),
  } as AppError;
}

// ============================================================================
// Tests
// ============================================================================

describe('error-analytics', () => {
  beforeEach(() => {
    _resetBuffer();
    for (const key of Object.keys(mockStorage)) delete mockStorage[key];
    vi.clearAllMocks();
  });

  // --------------------------------------------------------------------------
  // recordError
  // --------------------------------------------------------------------------

  describe('recordError', () => {
    it('ajoute une entree au buffer', () => {
      recordError(makeConnectorError());
      const buf = _getBuffer();
      expect(buf).toHaveLength(1);
      expect(buf[0].type).toBe('connector');
      expect(buf[0].connectorId).toBe('free-work');
    });

    it('conserve le message et le timestamp', () => {
      const ts = 1700000000000;
      recordError(makeNetworkError({ message: 'timeout', timestamp: ts }));
      const buf = _getBuffer();
      expect(buf[0].message).toBe('timeout');
      expect(buf[0].timestamp).toBe(ts);
    });

    it('ne contient pas connectorId pour les erreurs non-connector', () => {
      recordError(makeNetworkError());
      const buf = _getBuffer();
      expect(buf[0].connectorId).toBeUndefined();
    });

    it('auto-persiste apres 10 erreurs', () => {
      for (let i = 0; i < 10; i++) {
        recordError(makeNetworkError({ message: `err-${i}` }));
      }
      expect(chrome.storage.local.set).toHaveBeenCalledTimes(1);
    });

    it('ne persiste pas avant 10 erreurs', () => {
      for (let i = 0; i < 9; i++) {
        recordError(makeNetworkError({ message: `err-${i}` }));
      }
      expect(chrome.storage.local.set).not.toHaveBeenCalled();
    });
  });

  // --------------------------------------------------------------------------
  // Ring buffer eviction
  // --------------------------------------------------------------------------

  describe('ring buffer eviction', () => {
    it('evicte les plus anciens au-dela de 50 entrees', () => {
      for (let i = 0; i < 60; i++) {
        recordError(makeNetworkError({ message: `err-${i}` }));
      }
      const buf = _getBuffer();
      expect(buf).toHaveLength(50);
      // Le premier element devrait etre err-10 (les 10 premiers evictes)
      expect(buf[0].message).toBe('err-10');
      expect(buf[49].message).toBe('err-59');
    });

    it('conserve exactement MAX_BUFFER_SIZE=50 elements', () => {
      for (let i = 0; i < 100; i++) {
        recordError(makeNetworkError({ message: `err-${i}` }));
      }
      expect(_getBuffer()).toHaveLength(50);
    });
  });

  // --------------------------------------------------------------------------
  // persistErrors / getErrorLog
  // --------------------------------------------------------------------------

  describe('persistErrors / getErrorLog', () => {
    it('persiste et recupere le buffer', async () => {
      recordError(makeConnectorError({ message: 'test-persist' }));
      await persistErrors();

      const log = await getErrorLog();
      expect(log).toHaveLength(1);
      expect(log[0].message).toBe('test-persist');
    });

    it('retourne un tableau vide si rien n\'est persiste', async () => {
      const log = await getErrorLog();
      expect(log).toEqual([]);
    });
  });

  // --------------------------------------------------------------------------
  // clearErrorLog
  // --------------------------------------------------------------------------

  describe('clearErrorLog', () => {
    it('vide le buffer memoire et le storage', async () => {
      recordError(makeNetworkError());
      recordError(makeConnectorError());
      await persistErrors();

      await clearErrorLog();

      expect(_getBuffer()).toHaveLength(0);
      expect(chrome.storage.local.remove).toHaveBeenCalledWith('errorLog');
    });
  });

  // --------------------------------------------------------------------------
  // getErrorSummary
  // --------------------------------------------------------------------------

  describe('getErrorSummary', () => {
    it('retourne total=0 quand le buffer est vide', () => {
      const summary = getErrorSummary();
      expect(summary.total).toBe(0);
      expect(summary.byType).toEqual({});
      expect(summary.last24h).toBe(0);
    });

    it('compte correctement par type', () => {
      recordError(makeNetworkError());
      recordError(makeNetworkError());
      recordError(makeConnectorError());

      const summary = getErrorSummary();
      expect(summary.total).toBe(3);
      expect(summary.byType).toEqual({ network: 2, connector: 1 });
    });

    it('filtre les erreurs des dernieres 24h', () => {
      const now = Date.now();
      const twoDaysAgo = now - 2 * 24 * 60 * 60 * 1000;

      recordError(makeNetworkError({ timestamp: twoDaysAgo }));
      recordError(makeNetworkError({ timestamp: now }));
      recordError(makeConnectorError({ timestamp: now - 1000 }));

      const summary = getErrorSummary();
      expect(summary.total).toBe(3);
      expect(summary.last24h).toBe(2);
    });
  });
});
