import { describe, expect, it, vi } from 'vitest';

import type { AppSettings } from '../../../src/lib/core/types/app-settings';
import {
  createSettingsReleaseScanLedgerPort,
  type SettingsReleaseScanLedgerPorts,
} from '../../../src/lib/shell/settings-release/settings-release-scan-ledger';

const INSTALL_ID = '92000000-0000-4000-8000-000000000001';
const SETTINGS: AppSettings = {
  scanIntervalMinutes: 30,
  enabledConnectors: ['free-work'],
  notifications: true,
  autoScan: true,
  maxSemanticPerScan: 10,
  notificationScoreThreshold: 70,
  respectRateLimits: true,
  customDelayMs: 0,
  theme: 'system',
};

function harness(): SettingsReleaseScanLedgerPorts & { raw: { value: unknown } } {
  const raw = { value: undefined as unknown };
  return {
    raw,
    storage: {
      get: vi.fn(async () => structuredClone(raw.value)),
      set: vi.fn(async (value) => {
        raw.value = structuredClone(value);
      }),
    },
    permission: { containsForSnapshot: vi.fn(async () => true) },
    scan: { start: vi.fn(async () => ({ status: 'accepted' as const })) },
  };
}

function input(identity = 1, scanAckThrough = 0) {
  return {
    token: `settings-release:${INSTALL_ID}:${identity}:scan`,
    identity,
    snapshot: {
      settings: SETTINGS,
      onboardingCompleted: true,
      revision: 0,
      generation: 1,
    },
    snapshotDigest: 'a'.repeat(64),
    scanAckThrough,
  };
}

describe('settings release scan ledger', () => {
  it('binds before start and returns the retained exact result on replay', async () => {
    const ports = harness();
    const ledger = createSettingsReleaseScanLedgerPort(ports);
    const first = await ledger.tryAdmit(input());
    const second = await ledger.tryAdmit(input());
    expect(first).toEqual({
      status: 'accepted',
      operationId: `missionpulse-scan:${INSTALL_ID}:1`,
    });
    expect(second).toEqual(first);
    expect(ports.scan.start).toHaveBeenCalledTimes(1);
  });

  it('rejects identity reuse with different bytes', async () => {
    const ports = harness();
    const ledger = createSettingsReleaseScanLedgerPort(ports);
    await ledger.tryAdmit(input());
    await expect(ledger.tryAdmit({ ...input(), snapshotDigest: 'b'.repeat(64) })).rejects.toThrow(
      'identity mismatch'
    );
    expect(ports.scan.start).toHaveBeenCalledTimes(1);
  });

  it('stores a permission-missing skip without starting a scan', async () => {
    const ports = harness();
    ports.permission.containsForSnapshot = vi.fn(async () => false);
    const ledger = createSettingsReleaseScanLedgerPort(ports);
    expect(await ledger.tryAdmit(input())).toEqual({
      status: 'skipped',
      reason: 'permission_missing',
    });
    expect(ports.scan.start).not.toHaveBeenCalled();
  });

  it('compacts acknowledged rows and returns the retirement watermark', async () => {
    const ports = harness();
    const ledger = createSettingsReleaseScanLedgerPort(ports);
    await ledger.tryAdmit(input());
    expect(await ledger.query({ ...input(), scanAckThrough: 1 })).toEqual({ status: 'retired' });
  });
});
