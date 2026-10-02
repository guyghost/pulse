import { describe, expect, it } from 'vitest';
import { deriveSettingsSourceStatus } from '../../../src/lib/core/connectors/settings-source-status';
import { createInitialHealthSnapshot } from '../../../src/lib/core/types/health';

const failedScan = {
  connectorId: 'free-work',
  connectorName: 'Free-Work',
  lastState: 'error' as const,
  missionsCount: 0,
  error: { message: 'La plateforme est momentanément indisponible.' },
  lastSyncAt: 200,
  lastSuccessAt: 100,
};

describe('settings source status', () => {
  it('never infers a verified session from an enabled toggle or previous success', () => {
    expect(deriveSettingsSourceStatus({ enabled: true }).state).toBe('unknown');
    expect(
      deriveSettingsSourceStatus({
        enabled: true,
        status: { ...failedScan, lastState: 'done', error: null },
      }).state
    ).toBe('unknown');
    expect(deriveSettingsSourceStatus({ enabled: false, verification: 'ready' }).state).toBe(
      'disabled'
    );
    expect(deriveSettingsSourceStatus({ enabled: true, verification: 'ready' }).state).toBe(
      'verified'
    );
  });

  it('keeps reconnection, unavailable verification and collection errors distinct', () => {
    expect(
      deriveSettingsSourceStatus({
        enabled: true,
        verification: 'session-missing',
        status: failedScan,
      }).state
    ).toBe('reconnect');
    expect(deriveSettingsSourceStatus({ enabled: true, verification: 'unavailable' }).label).toBe(
      'Erreur de vérification'
    );
    const failed = deriveSettingsSourceStatus({
      enabled: true,
      verification: 'ready',
      status: failedScan,
    });
    expect(failed.state).toBe('error');
    expect(failed.detail).toBe(failedScan.error.message);
  });

  it('uses the most recent successful scan without presenting an initial health row as success', () => {
    const initial = createInitialHealthSnapshot('free-work', 300);
    expect(deriveSettingsSourceStatus({ enabled: true, health: initial }).lastSuccessAt).toBeNull();
    const result = deriveSettingsSourceStatus({
      enabled: true,
      status: failedScan,
      health: { ...initial, lastSuccessAt: 250 },
    });
    expect(result.lastSuccessAt).toBe(250);
    expect(result.state).toBe('error');
  });
});
