import { describe, expect, it } from 'vitest';

import type { AppSettings } from '../../../src/lib/core/types/app-settings';
import {
  compareSettingsReleaseTuple,
  decodeSettingsReleaseEnvelope,
  decodeSettingsReleaseSnapshot,
  mergeSettingsReleaseSnapshot,
  normalizeReleaseSettings,
  type SettingsReleaseSnapshot,
} from '../../../src/lib/shell/settings-release/settings-release.contract';

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

const snapshot = (revision: number, generation: number): SettingsReleaseSnapshot => ({
  settings: { ...SETTINGS, enabledConnectors: [...SETTINGS.enabledConnectors] },
  onboardingCompleted: false,
  revision,
  generation,
});

describe('settings release contract', () => {
  it('normalizes only the exact legacy eight-field shape', () => {
    const { theme: _theme, ...legacy } = SETTINGS;
    expect(normalizeReleaseSettings(legacy, ['free-work'], ['free-work'])).toEqual(SETTINGS);
    expect(
      normalizeReleaseSettings({ ...legacy, extra: true }, ['free-work'], ['free-work'])
    ).toBeNull();
  });

  it('rejects accessors, custom prototypes, symbols and unknown envelope keys', () => {
    const base = {
      version: 1,
      installId: '92000000-0000-4000-8000-000000000001',
      nextIdentity: 1,
      revision: 0,
      generation: 0,
      scanAckThrough: 0,
      catalogFingerprint: 'a'.repeat(64),
      legacyRetirement: 'retired',
      confirmed: { settings: SETTINGS, onboardingCompleted: false },
      pending: null,
      outcomes: [],
      outbox: null,
      scanAdmission: null,
    };
    expect(decodeSettingsReleaseEnvelope(base, ['free-work'], ['free-work'])).not.toBeNull();
    expect(
      decodeSettingsReleaseEnvelope({ ...base, unexpected: true }, ['free-work'], ['free-work'])
    ).toBeNull();

    const withAccessor = { ...base };
    Object.defineProperty(withAccessor, 'revision', { enumerable: true, get: () => 0 });
    expect(decodeSettingsReleaseEnvelope(withAccessor, ['free-work'], ['free-work'])).toBeNull();

    const withSymbol = { ...base, [Symbol('x')]: true };
    expect(decodeSettingsReleaseEnvelope(withSymbol, ['free-work'], ['free-work'])).toBeNull();
    expect(
      decodeSettingsReleaseEnvelope(
        Object.assign(Object.create({ inherited: true }), base),
        ['free-work'],
        ['free-work']
      )
    ).toBeNull();

    let getTrapCalls = 0;
    const proxied = new Proxy(base, {
      get() {
        getTrapCalls += 1;
        throw new Error('ordinary property reads are forbidden');
      },
    });
    expect(decodeSettingsReleaseEnvelope(proxied, ['free-work'], ['free-work'])).not.toBeNull();
    expect(getTrapCalls).toBe(0);

    expect(
      decodeSettingsReleaseEnvelope(
        { ...base, confirmed: { ...base.confirmed, unexpected: true } },
        ['free-work'],
        ['free-work']
      )
    ).toBeNull();

    const commandId = `settings-release:${base.installId}:1:command`;
    const outcome = {
      commandId,
      requestId: '93000000-0000-4000-8000-000000000001',
      intentDigest: 'b'.repeat(64),
      kind: 'save_settings' as const,
      settledRevision: 1,
      settledGeneration: 1,
      snapshot: {
        settings: SETTINGS,
        onboardingCompleted: false,
        revision: 1,
        generation: 1,
      },
      status: 'committed' as const,
      reason: 'committed' as const,
    };
    const settled = {
      ...base,
      nextIdentity: 2,
      revision: 1,
      generation: 1,
      outcomes: [outcome],
    };
    expect(decodeSettingsReleaseEnvelope(settled, ['free-work'], ['free-work'])).not.toBeNull();
    expect(
      decodeSettingsReleaseEnvelope(
        {
          ...settled,
          outcomes: [{ ...outcome, settledGeneration: 2 }],
        },
        ['free-work'],
        ['free-work']
      )
    ).toBeNull();
    expect(
      decodeSettingsReleaseEnvelope({ ...settled, nextIdentity: 1 }, ['free-work'], ['free-work'])
    ).toBeNull();
    expect(
      decodeSettingsReleaseEnvelope(
        {
          ...settled,
          generation: 2,
          outbox: {
            commandId,
            broadcastId: 'wrong',
            reason: 'mutation_settlement',
            snapshot: outcome.snapshot,
          },
        },
        ['free-work'],
        ['free-work']
      )
    ).toBeNull();
    expect(
      decodeSettingsReleaseEnvelope(
        {
          ...settled,
          nextIdentity: 3,
          revision: 2,
          generation: 2,
          outcomes: [
            outcome,
            {
              ...outcome,
              commandId: `settings-release:${base.installId}:2:command`,
              settledRevision: 2,
              settledGeneration: 2,
              snapshot: { ...outcome.snapshot, revision: 2, generation: 2 },
            },
          ],
        },
        ['free-work'],
        ['free-work']
      )
    ).toBeNull();
  });

  it('merges snapshots lexicographically and blocks equal-tuple content drift', () => {
    expect(compareSettingsReleaseTuple(snapshot(2, 1), snapshot(1, 99))).toBe(1);
    expect(mergeSettingsReleaseSnapshot(snapshot(2, 1), snapshot(1, 99))).toEqual({
      status: 'rejected_older',
      snapshot: snapshot(2, 1),
    });
    expect(mergeSettingsReleaseSnapshot(snapshot(2, 1), snapshot(2, 1))).toEqual({
      status: 'duplicate',
      snapshot: snapshot(2, 1),
    });
    expect(
      mergeSettingsReleaseSnapshot(snapshot(2, 1), {
        ...snapshot(2, 1),
        onboardingCompleted: true,
      })
    ).toEqual({ status: 'content_conflict', snapshot: snapshot(2, 1) });
  });

  it('decodes only a strict canonical current-catalogue snapshot', () => {
    expect(decodeSettingsReleaseSnapshot(snapshot(2, 3), ['free-work'])).toEqual(snapshot(2, 3));
    expect(
      decodeSettingsReleaseSnapshot(
        {
          ...snapshot(2, 3),
          settings: { ...SETTINGS, enabledConnectors: ['free-work', 'free-work'] },
        },
        ['free-work']
      )
    ).toBeNull();
    expect(
      decodeSettingsReleaseSnapshot({ ...snapshot(2, 3), extra: true }, ['free-work'])
    ).toBeNull();
  });

  it('rejects a scan admission at or below its watermark and identities retained by outcomes', () => {
    const installId = '92000000-0000-4000-8000-000000000001';
    const scanRecord = {
      identity: 2,
      token: `settings-release:${installId}:2:scan`,
      snapshot: snapshot(0, 0),
      snapshotDigest: 'c'.repeat(64),
      phase: 'reserved' as const,
      result: null,
    };
    const atWatermark = {
      version: 1 as const,
      installId,
      nextIdentity: 3,
      revision: 0,
      generation: 1,
      scanAckThrough: 2,
      catalogFingerprint: 'a'.repeat(64),
      legacyRetirement: 'retired' as const,
      confirmed: { settings: SETTINGS, onboardingCompleted: false },
      pending: null,
      outcomes: [],
      outbox: null,
      scanAdmission: scanRecord,
    };
    expect(decodeSettingsReleaseEnvelope(atWatermark, ['free-work'], ['free-work'])).toBeNull();

    const outcomeSnapshot = snapshot(1, 1);
    const duplicateIdentity = {
      ...atWatermark,
      revision: 1,
      generation: 2,
      scanAckThrough: 0,
      scanAdmission: {
        ...scanRecord,
        identity: 1,
        token: `settings-release:${installId}:1:scan`,
        snapshot: snapshot(1, 1),
      },
      outcomes: [
        {
          commandId: `settings-release:${installId}:1:command`,
          requestId: '93000000-0000-4000-8000-000000000001',
          intentDigest: 'b'.repeat(64),
          kind: 'save_settings' as const,
          settledRevision: 1,
          settledGeneration: 1,
          snapshot: outcomeSnapshot,
          status: 'committed' as const,
          reason: 'committed' as const,
        },
      ],
    };
    expect(
      decodeSettingsReleaseEnvelope(duplicateIdentity, ['free-work'], ['free-work'])
    ).toBeNull();
  });
});
