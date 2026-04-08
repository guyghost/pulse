import { describe, it, expect } from 'vitest';
import {
  createInitialStatus,
  toPersistedStatus,
  type ConnectorStatus,
} from '../../../src/lib/core/types/connector-status';
import { createConnectorError } from '../../../src/lib/core/errors/app-error';

describe('ConnectorStatus types', () => {
  describe('createInitialStatus', () => {
    it('retourne un statut avec les valeurs par défaut correctes', () => {
      const status = createInitialStatus('free-work', 'Free-Work');

      expect(status).toEqual({
        connectorId: 'free-work',
        connectorName: 'Free-Work',
        state: 'pending',
        missionsCount: 0,
        error: null,
        retryCount: 0,
        startedAt: null,
        completedAt: null,
      });
    });

    it('utilise les identifiants fournis', () => {
      const status = createInitialStatus('malt', 'Malt');

      expect(status.connectorId).toBe('malt');
      expect(status.connectorName).toBe('Malt');
    });
  });

  describe('toPersistedStatus', () => {
    it('mappe correctement un statut terminé (done)', () => {
      const now = 1710849600000;
      const status: ConnectorStatus = {
        connectorId: 'free-work',
        connectorName: 'Free-Work',
        state: 'done',
        missionsCount: 42,
        error: null,
        retryCount: 0,
        startedAt: now - 5000,
        completedAt: now,
      };

      const persisted = toPersistedStatus(status, now);

      expect(persisted).toEqual({
        connectorId: 'free-work',
        connectorName: 'Free-Work',
        lastState: 'done',
        missionsCount: 42,
        error: null,
        lastSyncAt: now,
        lastSuccessAt: now,
      });
    });

    it('mappe correctement un statut en erreur', () => {
      const now = 1710849600000;
      const error = createConnectorError(
        'Timeout réseau',
        { connectorId: 'malt', phase: 'fetch', recoverable: true },
        now - 1000
      );

      const status: ConnectorStatus = {
        connectorId: 'malt',
        connectorName: 'Malt',
        state: 'error',
        missionsCount: 0,
        error,
        retryCount: 3,
        startedAt: now - 5000,
        completedAt: now,
      };

      const persisted = toPersistedStatus(status, now);

      expect(persisted.connectorId).toBe('malt');
      expect(persisted.connectorName).toBe('Malt');
      expect(persisted.lastState).toBe('error');
      expect(persisted.missionsCount).toBe(0);
      expect(persisted.error).not.toBeNull();
      expect(persisted.error).toHaveProperty('type', 'connector');
      expect(persisted.error).toHaveProperty('message', 'Timeout réseau');
      expect(persisted.lastSyncAt).toBe(now);
      expect(persisted.lastSuccessAt).toBeNull();
    });
  });
});
