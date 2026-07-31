import { describe, expect, it, vi } from 'vitest';

import type { AppSettings } from '../../../src/lib/core/types/app-settings';
import {
  createSettingsReleaseCoordinator,
  type SettingsReleasePorts,
} from '../../../src/lib/shell/settings-release/settings-release.coordinator';
import type { SettingsReleaseEnvelopeV1 } from '../../../src/lib/shell/settings-release/settings-release.contract';
import { HISTORICAL_CONNECTOR_CATALOGUE_FINGERPRINT } from '../../../src/lib/shell/settings-release/connector-catalogue-history';

const UUID = '92000000-0000-4000-8000-000000000001';
const requestId = (n: number): string => `93000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
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

class MemoryStorage {
  state: Record<string, unknown>;
  beforeSet: ((value: Record<string, unknown>) => boolean) | null = null;
  constructor(initial: Record<string, unknown> = {}) {
    this.state = structuredClone(initial);
  }
  async get(keys: readonly string[]): Promise<Record<string, unknown>> {
    return Object.fromEntries(
      keys.filter((key) => key in this.state).map((key) => [key, this.state[key]])
    );
  }
  async set(value: Record<string, unknown>): Promise<void> {
    if (this.beforeSet && !this.beforeSet(structuredClone(value))) {
      return;
    }
    Object.assign(this.state, structuredClone(value));
  }
  async remove(keys: readonly string[]): Promise<void> {
    for (const key of keys) {
      delete this.state[key];
    }
  }
}

function ports(storage = new MemoryStorage()): SettingsReleasePorts & {
  storage: MemoryStorage;
  setAlarm(value: { name: 'auto-scan'; periodInMinutes: number } | null): void;
} {
  let alarm: { name: 'auto-scan'; periodInMinutes: number } | null = null;
  return {
    storage,
    setAlarm(value) {
      alarm = value;
    },
    alarm: {
      get: vi.fn(async () => alarm),
      create: vi.fn(async (periodInMinutes: number) => {
        alarm = { name: 'auto-scan', periodInMinutes };
      }),
      clear: vi.fn(async () => {
        alarm = null;
      }),
    },
    permissions: { contains: vi.fn(async () => true) },
    broadcast: { publish: vi.fn(async () => 'no_receiver' as const) },
    scan: {
      tryAdmit: vi.fn(async ({ identity }) => ({
        status: 'accepted' as const,
        operationId: `missionpulse-scan:${UUID}:${identity}` as const,
      })),
      query: vi.fn(async () => ({ status: 'not_found' as const })),
    },
    uuid: () => UUID,
  };
}

describe('settings release compatibility coordinator', () => {
  it('migrates legacy settings and consent atomically before becoming readable', async () => {
    const p = ports(new MemoryStorage({ settings: SETTINGS, onboarding_completed: true }));
    const coordinator = createSettingsReleaseCoordinator(p);
    await coordinator.boot();
    const result = await coordinator.read();
    expect(result).toMatchObject({
      status: 'confirmed',
      snapshot: { settings: SETTINGS, onboardingCompleted: true, revision: 0 },
    });
    expect(p.storage.state).not.toHaveProperty('settings');
    expect(p.storage.state).not.toHaveProperty('onboarding_completed');
    expect(p.storage.state).toHaveProperty('missionpulse_settings_release_v1');
  });

  it('does not retire legacy storage before the migrated alarm is proved', async () => {
    const p = ports(new MemoryStorage({ settings: SETTINGS, onboarding_completed: true }));
    let releaseCreate: (() => void) | undefined;
    const createGate = new Promise<void>((resolve) => {
      releaseCreate = resolve;
    });
    p.alarm.create.mockImplementationOnce(async (periodInMinutes: number) => {
      await createGate;
      p.setAlarm({ name: 'auto-scan', periodInMinutes });
    });

    const coordinator = createSettingsReleaseCoordinator(p);
    let bootSettled = false;
    const boot = coordinator.boot().then(() => {
      bootSettled = true;
    });
    await vi.waitFor(() => expect(p.alarm.create).toHaveBeenCalledWith(30));
    expect(bootSettled).toBe(false);
    expect(p.storage.state).toHaveProperty('settings');
    expect(p.storage.state).toHaveProperty('onboarding_completed');

    releaseCreate?.();
    await boot;
    expect(bootSettled).toBe(true);
    expect(p.storage.state).not.toHaveProperty('settings');
    expect(p.storage.state).not.toHaveProperty('onboarding_completed');
    expect(await coordinator.read()).toMatchObject({ status: 'confirmed' });
  });

  it('commits one whole-object mutation and returns conflicts with the exact snapshot', async () => {
    const p = ports();
    const coordinator = createSettingsReleaseCoordinator(p);
    await coordinator.boot();
    const initial = await coordinator.read();
    if (initial.status !== 'confirmed') {
      throw new Error('boot failed');
    }

    const candidate = { ...initial.snapshot.settings, notifications: false };
    const committed = await coordinator.mutate({
      kind: 'save_settings',
      requestId: requestId(1),
      baseRevision: initial.snapshot.revision,
      settings: candidate,
    });
    expect(committed).toMatchObject({
      status: 'settled',
      outcome: { status: 'committed', snapshot: { settings: candidate, revision: 1 } },
    });

    const conflict = await coordinator.mutate({
      kind: 'save_settings',
      requestId: requestId(2),
      baseRevision: initial.snapshot.revision,
      settings: initial.snapshot.settings,
    });
    expect(conflict).toMatchObject({
      status: 'not_admitted',
      reason: 'conflict',
      snapshot: { settings: candidate, revision: 1 },
    });
  });

  it('deduplicates a retained request without repeating alarm or permission effects', async () => {
    const p = ports();
    const coordinator = createSettingsReleaseCoordinator(p);
    await coordinator.boot();
    const initial = await coordinator.read();
    if (initial.status !== 'confirmed') {
      throw new Error('boot failed');
    }
    const command = {
      kind: 'set_consent' as const,
      requestId: requestId(3),
      baseRevision: initial.snapshot.revision,
      targetConsent: true as const,
    };
    const first = await coordinator.mutate(command);
    const writes = p.alarm.create.mock.calls.length;
    expect(await coordinator.mutate(command)).toEqual(first);
    expect(p.alarm.create).toHaveBeenCalledTimes(writes);
  });

  it('recovers a reserved command to the exact previous state and publishes its outcome', async () => {
    const p = ports();
    const first = createSettingsReleaseCoordinator(p);
    await first.boot();
    const raw = p.storage.state.missionpulse_settings_release_v1 as SettingsReleaseEnvelopeV1;
    const commandId = `settings-release:${raw.installId}:${raw.nextIdentity}:command`;
    const pending: SettingsReleaseEnvelopeV1 = {
      ...structuredClone(raw),
      nextIdentity: raw.nextIdentity + 1,
      generation: raw.generation + 1,
      pending: {
        commandId,
        requestId: requestId(4),
        intentDigest: 'b'.repeat(64),
        kind: 'set_consent',
        baseRevision: raw.revision,
        previous: structuredClone(raw.confirmed),
        candidate: { settings: structuredClone(raw.confirmed.settings), onboardingCompleted: true },
        previousAlarm: { name: 'auto-scan', absent: true },
        candidateAlarm: { name: 'auto-scan', periodInMinutes: 30 },
        phase: 'reserved',
        compensationReason: null,
      },
    };
    p.storage.state.missionpulse_settings_release_v1 = pending;

    const recovered = createSettingsReleaseCoordinator(p);
    await recovered.boot();
    const result = await recovered.read();
    expect(result).toMatchObject({
      status: 'confirmed',
      snapshot: { onboardingCompleted: false, revision: raw.revision + 1 },
    });
    const final = p.storage.state.missionpulse_settings_release_v1 as SettingsReleaseEnvelopeV1;
    expect(final.pending).toBeNull();
    expect(final.outbox).toBeNull();
    expect(final.outcomes.at(-1)).toMatchObject({
      commandId,
      status: 'not_committed',
      reason: 'recovered_previous',
    });
  });

  it('waits for the previous alarm proof before settling a recovered command', async () => {
    const p = ports();
    const first = createSettingsReleaseCoordinator(p);
    await first.boot();
    const raw = p.storage.state.missionpulse_settings_release_v1 as SettingsReleaseEnvelopeV1;
    const commandId = `settings-release:${raw.installId}:${raw.nextIdentity}:command`;
    p.setAlarm({ name: 'auto-scan', periodInMinutes: 30 });
    p.storage.state.missionpulse_settings_release_v1 = {
      ...structuredClone(raw),
      nextIdentity: raw.nextIdentity + 1,
      generation: raw.generation + 1,
      pending: {
        commandId,
        requestId: requestId(21),
        intentDigest: 'd'.repeat(64),
        kind: 'set_consent',
        baseRevision: raw.revision,
        previous: structuredClone(raw.confirmed),
        candidate: { settings: structuredClone(raw.confirmed.settings), onboardingCompleted: true },
        previousAlarm: { name: 'auto-scan', absent: true },
        candidateAlarm: { name: 'auto-scan', periodInMinutes: 30 },
        phase: 'reserved',
        compensationReason: null,
      },
    } satisfies SettingsReleaseEnvelopeV1;

    let releaseClear: (() => void) | undefined;
    const clearGate = new Promise<void>((resolve) => {
      releaseClear = resolve;
    });
    p.alarm.clear.mockImplementationOnce(async () => {
      await clearGate;
      p.setAlarm(null);
    });

    const recovered = createSettingsReleaseCoordinator(p);
    let bootSettled = false;
    const boot = recovered.boot().then(() => {
      bootSettled = true;
    });
    await vi.waitFor(() => expect(p.alarm.clear).toHaveBeenCalled());
    expect(bootSettled).toBe(false);
    expect(
      (p.storage.state.missionpulse_settings_release_v1 as SettingsReleaseEnvelopeV1).pending
    ).not.toBeNull();

    releaseClear?.();
    await boot;
    expect(bootSettled).toBe(true);
    expect(
      (p.storage.state.missionpulse_settings_release_v1 as SettingsReleaseEnvelopeV1).pending
    ).toBeNull();
  });

  it('recovers an effect-proved candidate only after exact alarm and permission proofs', async () => {
    const p = ports();
    const first = createSettingsReleaseCoordinator(p);
    await first.boot();
    const raw = p.storage.state.missionpulse_settings_release_v1 as SettingsReleaseEnvelopeV1;
    const commandId = `settings-release:${raw.installId}:${raw.nextIdentity}:command`;
    p.setAlarm({ name: 'auto-scan', periodInMinutes: 30 });
    p.storage.state.missionpulse_settings_release_v1 = {
      ...structuredClone(raw),
      nextIdentity: raw.nextIdentity + 1,
      generation: raw.generation + 1,
      pending: {
        commandId,
        requestId: requestId(5),
        intentDigest: 'c'.repeat(64),
        kind: 'set_consent',
        baseRevision: raw.revision,
        previous: structuredClone(raw.confirmed),
        candidate: { settings: structuredClone(raw.confirmed.settings), onboardingCompleted: true },
        previousAlarm: { name: 'auto-scan', absent: true },
        candidateAlarm: { name: 'auto-scan', periodInMinutes: 30 },
        phase: 'effect_proved',
        compensationReason: null,
      },
    } satisfies SettingsReleaseEnvelopeV1;

    const recovered = createSettingsReleaseCoordinator(p);
    await recovered.boot();
    expect(await recovered.read()).toMatchObject({
      status: 'confirmed',
      snapshot: { onboardingCompleted: true, revision: raw.revision + 1 },
    });
    const final = p.storage.state.missionpulse_settings_release_v1 as SettingsReleaseEnvelopeV1;
    expect(final.outcomes.at(-1)).toMatchObject({
      status: 'committed',
      reason: 'recovered_candidate',
    });
  });

  it('finishes pending-removal migration when exactly one legacy key survived a crash', async () => {
    const p = ports();
    const first = createSettingsReleaseCoordinator(p);
    await first.boot();
    const raw = p.storage.state.missionpulse_settings_release_v1 as SettingsReleaseEnvelopeV1;
    p.storage.state.missionpulse_settings_release_v1 = {
      ...structuredClone(raw),
      legacyRetirement: 'pending_removal',
    } satisfies SettingsReleaseEnvelopeV1;
    p.storage.state.settings = structuredClone(raw.confirmed.settings);

    const recovered = createSettingsReleaseCoordinator(p);
    await recovered.boot();
    expect((await recovered.read()).status).toBe('confirmed');
    expect(p.storage.state).not.toHaveProperty('settings');
    expect(
      (p.storage.state.missionpulse_settings_release_v1 as SettingsReleaseEnvelopeV1)
        .legacyRetirement
    ).toBe('retired');
  });

  it('retains a durable outbox and blocks when publication is ambiguous', async () => {
    const p = ports();
    const first = createSettingsReleaseCoordinator(p);
    await first.boot();
    const initial = await first.read();
    if (initial.status !== 'confirmed') {
      throw new Error('boot failed');
    }
    p.broadcast.publish.mockRejectedValueOnce(new Error('transport'));
    const result = await first.mutate({
      kind: 'save_settings',
      requestId: requestId(6),
      baseRevision: initial.snapshot.revision,
      settings: { ...initial.snapshot.settings, notifications: false },
    });
    expect(result).toMatchObject({ status: 'blocked', reason: 'broadcast_ambiguous' });
    const final = p.storage.state.missionpulse_settings_release_v1 as SettingsReleaseEnvelopeV1;
    expect(final.outbox).not.toBeNull();
    expect((await first.read()).status).toBe('unavailable');
  });

  it('proves generation room before attempting to publish a retained outbox', async () => {
    const p = ports();
    const seed = createSettingsReleaseCoordinator(p);
    await seed.boot();
    const raw = p.storage.state.missionpulse_settings_release_v1 as SettingsReleaseEnvelopeV1;
    const commandId = `settings-release:${raw.installId}:1:command`;
    const terminalSnapshot = {
      settings: structuredClone(raw.confirmed.settings),
      onboardingCompleted: raw.confirmed.onboardingCompleted,
      revision: 1,
      generation: Number.MAX_SAFE_INTEGER,
    };
    p.storage.state.missionpulse_settings_release_v1 = {
      ...structuredClone(raw),
      nextIdentity: 2,
      revision: 1,
      generation: Number.MAX_SAFE_INTEGER,
      outcomes: [
        {
          commandId,
          requestId: requestId(31),
          intentDigest: 'a'.repeat(64),
          kind: 'save_settings',
          settledRevision: 1,
          settledGeneration: Number.MAX_SAFE_INTEGER,
          snapshot: terminalSnapshot,
          status: 'committed',
          reason: 'committed',
        },
      ],
      outbox: {
        commandId,
        broadcastId: `${commandId}:broadcast`,
        reason: 'mutation_settlement',
        snapshot: terminalSnapshot,
      },
    } satisfies SettingsReleaseEnvelopeV1;
    p.broadcast.publish.mockClear();

    const coordinator = createSettingsReleaseCoordinator(p);
    await coordinator.boot();

    expect(p.broadcast.publish).not.toHaveBeenCalled();
    expect(await coordinator.read()).toEqual({
      status: 'unavailable',
      reason: 'actor_blocked',
      snapshot: null,
    });
  });

  it('does not reserve when initial connector permission is missing', async () => {
    const p = ports(new MemoryStorage({ settings: { ...SETTINGS, enabledConnectors: [] } }));
    p.permissions.contains.mockResolvedValue(false);
    const coordinator = createSettingsReleaseCoordinator(p);
    await coordinator.boot();
    const initial = await coordinator.read();
    if (initial.status !== 'confirmed') {
      throw new Error('boot failed');
    }
    const before = structuredClone(p.storage.state.missionpulse_settings_release_v1);
    const result = await coordinator.mutate({
      kind: 'save_settings',
      requestId: requestId(7),
      baseRevision: initial.snapshot.revision,
      settings: { ...initial.snapshot.settings, enabledConnectors: ['free-work'] },
    });
    expect(result).toMatchObject({ status: 'not_admitted', reason: 'permission_missing' });
    expect(p.storage.state.missionpulse_settings_release_v1).toEqual(before);
  });

  it('durably settles unchanged state when permission is lost after reservation', async () => {
    const p = ports(new MemoryStorage({ settings: { ...SETTINGS, enabledConnectors: [] } }));
    p.permissions.contains.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const coordinator = createSettingsReleaseCoordinator(p);
    await coordinator.boot();
    const initial = await coordinator.read();
    if (initial.status !== 'confirmed') {
      throw new Error('boot failed');
    }
    const result = await coordinator.mutate({
      kind: 'save_settings',
      requestId: requestId(8),
      baseRevision: initial.snapshot.revision,
      settings: { ...initial.snapshot.settings, enabledConnectors: ['free-work'] },
    });
    expect(result).toMatchObject({
      status: 'settled',
      outcome: {
        status: 'not_committed',
        reason: 'permission_missing',
        snapshot: { settings: initial.snapshot.settings },
      },
    });
    const final = p.storage.state.missionpulse_settings_release_v1 as SettingsReleaseEnvelopeV1;
    expect(final.pending).toBeNull();
    expect(final.confirmed.settings.enabledConnectors).toEqual([]);
  });

  it.each([
    { branch: 'post-reservation permission settlement' as const },
    { branch: 'preparation rejection settlement' as const },
    { branch: 'compensation settlement' as const },
  ])('never reports $branch as settled when the final alarm proof fails', async ({ branch }) => {
    const p = ports(new MemoryStorage({ settings: { ...SETTINGS, enabledConnectors: [] } }));
    const coordinator = createSettingsReleaseCoordinator(p);
    await coordinator.boot();
    const initial = await coordinator.read();
    if (initial.status !== 'confirmed') {
      throw new Error('boot failed');
    }
    if (branch === 'post-reservation permission settlement') {
      p.permissions.contains.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
      p.alarm.get.mockRejectedValueOnce(new Error('final alarm proof unavailable'));
    } else if (branch === 'preparation rejection settlement') {
      p.permissions.contains.mockResolvedValue(true);
      p.storage.beforeSet = (value) => {
        const candidate = value.missionpulse_settings_release_v1 as
          SettingsReleaseEnvelopeV1 | undefined;
        return candidate?.pending?.phase !== 'prepared';
      };
      p.alarm.get.mockRejectedValueOnce(new Error('final alarm proof unavailable'));
    } else {
      p.permissions.contains
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false);
      p.alarm.get
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockRejectedValueOnce(new Error('final alarm proof unavailable'));
    }

    const result = await coordinator.mutate({
      kind: 'save_settings',
      requestId: requestId(branch.length + 40),
      baseRevision: initial.snapshot.revision,
      settings: { ...initial.snapshot.settings, enabledConnectors: ['free-work'] },
    });

    expect(result).toMatchObject({ status: 'blocked', reason: 'storage_ambiguous' });
    expect(await coordinator.retry()).toEqual({ status: 'retry_accepted', snapshot: null });
  });

  it('compensates the alarm when permission is lost after prepare', async () => {
    const p = ports(new MemoryStorage({ settings: { ...SETTINGS, enabledConnectors: [] } }));
    p.permissions.contains
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    const coordinator = createSettingsReleaseCoordinator(p);
    await coordinator.boot();
    const initial = await coordinator.read();
    if (initial.status !== 'confirmed') {
      throw new Error('boot failed');
    }
    const result = await coordinator.mutate({
      kind: 'save_settings',
      requestId: requestId(9),
      baseRevision: initial.snapshot.revision,
      settings: { ...initial.snapshot.settings, enabledConnectors: ['free-work'] },
    });
    expect(result).toMatchObject({
      status: 'settled',
      outcome: { status: 'compensated', reason: 'permission_lost' },
    });
    expect(
      (p.storage.state.missionpulse_settings_release_v1 as SettingsReleaseEnvelopeV1).confirmed
        .settings.enabledConnectors
    ).toEqual([]);
  });

  it('does not return settled when compensation publication is ambiguous', async () => {
    const p = ports(new MemoryStorage({ settings: { ...SETTINGS, enabledConnectors: [] } }));
    p.permissions.contains
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);
    p.broadcast.publish.mockRejectedValueOnce(new Error('transport'));
    const coordinator = createSettingsReleaseCoordinator(p);
    await coordinator.boot();
    const initial = await coordinator.read();
    if (initial.status !== 'confirmed') {
      throw new Error('boot failed');
    }

    const result = await coordinator.mutate({
      kind: 'save_settings',
      requestId: requestId(32),
      baseRevision: initial.snapshot.revision,
      settings: { ...initial.snapshot.settings, enabledConnectors: ['free-work'] },
    });

    expect(result).toMatchObject({ status: 'blocked', reason: 'broadcast_ambiguous' });
    expect(
      (p.storage.state.missionpulse_settings_release_v1 as SettingsReleaseEnvelopeV1).outbox
    ).not.toBeNull();
  });

  it.each([
    {
      label: 'permission loss',
      permission: false,
      rejectCandidateAlarm: false,
      expectedReason: 'permission_lost',
    },
    {
      label: 'candidate alarm failure',
      permission: true,
      rejectCandidateAlarm: true,
      expectedReason: 'effect_compensated',
    },
  ])(
    'recovers an effect-proved command with the exact $label terminal reason',
    async ({ permission, rejectCandidateAlarm, expectedReason }) => {
      const initialSettings = { ...SETTINGS, enabledConnectors: [] };
      const p = ports(new MemoryStorage({ settings: initialSettings }));
      const first = createSettingsReleaseCoordinator(p);
      await first.boot();
      const raw = p.storage.state.missionpulse_settings_release_v1 as SettingsReleaseEnvelopeV1;
      const identity = raw.nextIdentity;
      const candidateSettings = { ...raw.confirmed.settings, enabledConnectors: ['free-work'] };
      p.storage.state.missionpulse_settings_release_v1 = {
        ...structuredClone(raw),
        nextIdentity: identity + 1,
        generation: raw.generation + 1,
        pending: {
          commandId: `settings-release:${raw.installId}:${identity}:command`,
          requestId: requestId(rejectCandidateAlarm ? 34 : 33),
          intentDigest: 'c'.repeat(64),
          kind: 'save_settings',
          baseRevision: raw.revision,
          previous: structuredClone(raw.confirmed),
          candidate: {
            settings: candidateSettings,
            onboardingCompleted: raw.confirmed.onboardingCompleted,
          },
          previousAlarm: { name: 'auto-scan', absent: true },
          candidateAlarm: { name: 'auto-scan', absent: true },
          phase: 'effect_proved',
          compensationReason: null,
        },
      } satisfies SettingsReleaseEnvelopeV1;
      p.permissions.contains.mockResolvedValue(permission);
      if (rejectCandidateAlarm) {
        p.alarm.get.mockRejectedValueOnce(new Error('alarm unavailable'));
      }

      const recovered = createSettingsReleaseCoordinator(p);
      await recovered.boot();

      const final = p.storage.state.missionpulse_settings_release_v1 as SettingsReleaseEnvelopeV1;
      expect(final.outcomes.at(-1)).toMatchObject({
        status: 'compensated',
        reason: expectedReason,
      });
      expect((await recovered.read()).status).toBe('confirmed');
    }
  );

  it('recovers from a rejected final commit when read-back proves the pending generation', async () => {
    const p = ports();
    const coordinator = createSettingsReleaseCoordinator(p);
    await coordinator.boot();
    const initial = await coordinator.read();
    if (initial.status !== 'confirmed') {
      throw new Error('boot failed');
    }
    let rejectedSettlement = false;
    p.storage.beforeSet = (value) => {
      const candidate = value.missionpulse_settings_release_v1 as
        SettingsReleaseEnvelopeV1 | undefined;
      if (
        !rejectedSettlement &&
        candidate?.pending === null &&
        candidate.outbox?.reason === 'mutation_settlement'
      ) {
        rejectedSettlement = true;
        return false;
      }
      return true;
    };

    const result = await coordinator.mutate({
      kind: 'save_settings',
      requestId: requestId(35),
      baseRevision: initial.snapshot.revision,
      settings: { ...initial.snapshot.settings, notifications: false },
    });

    expect(rejectedSettlement).toBe(true);
    expect(result).toMatchObject({
      status: 'settled',
      outcome: { status: 'committed', reason: 'recovered_candidate' },
    });
    expect(
      (p.storage.state.missionpulse_settings_release_v1 as SettingsReleaseEnvelopeV1).pending
    ).toBeNull();
  });

  it('migrates an older catalogue fingerprint before exposing a snapshot', async () => {
    const p = ports();
    const first = createSettingsReleaseCoordinator(p);
    await first.boot();
    const raw = p.storage.state.missionpulse_settings_release_v1 as SettingsReleaseEnvelopeV1;
    p.storage.state.missionpulse_settings_release_v1 = {
      ...structuredClone(raw),
      catalogFingerprint: HISTORICAL_CONNECTOR_CATALOGUE_FINGERPRINT,
    } satisfies SettingsReleaseEnvelopeV1;

    const migrated = createSettingsReleaseCoordinator(p);
    await migrated.boot();
    const result = await migrated.read();
    expect(result).toMatchObject({ status: 'confirmed', snapshot: { revision: raw.revision + 1 } });
    const final = p.storage.state.missionpulse_settings_release_v1 as SettingsReleaseEnvelopeV1;
    expect(final.catalogFingerprint).not.toBe(HISTORICAL_CONNECTOR_CATALOGUE_FINGERPRINT);
    expect(final.outbox).toBeNull();
    expect(final.nextIdentity).toBe(raw.nextIdentity + 1);
  });

  it('recovers an old-catalogue pending command without publishing its historical outbox', async () => {
    const p = ports();
    const first = createSettingsReleaseCoordinator(p);
    await first.boot();
    p.broadcast.publish.mockClear();
    const raw = p.storage.state.missionpulse_settings_release_v1 as SettingsReleaseEnvelopeV1;
    const historicalCommand = `settings-release:${raw.installId}:${raw.nextIdentity}:command`;
    p.storage.state.missionpulse_settings_release_v1 = {
      ...structuredClone(raw),
      catalogFingerprint: HISTORICAL_CONNECTOR_CATALOGUE_FINGERPRINT,
      nextIdentity: raw.nextIdentity + 1,
      generation: raw.generation + 1,
      pending: {
        commandId: historicalCommand,
        requestId: requestId(12),
        intentDigest: 'f'.repeat(64),
        kind: 'set_consent',
        baseRevision: raw.revision,
        previous: structuredClone(raw.confirmed),
        candidate: { settings: structuredClone(raw.confirmed.settings), onboardingCompleted: true },
        previousAlarm: { name: 'auto-scan', absent: true },
        candidateAlarm: { name: 'auto-scan', periodInMinutes: 30 },
        phase: 'reserved',
        compensationReason: null,
      },
    } satisfies SettingsReleaseEnvelopeV1;

    const migrated = createSettingsReleaseCoordinator(p);
    await migrated.boot();
    expect((await migrated.read()).status).toBe('confirmed');
    expect(p.broadcast.publish).toHaveBeenCalledTimes(1);
    expect(p.broadcast.publish.mock.calls[0][0].payload.commandId).not.toBe(historicalCommand);
  });

  it('supersedes an old-catalogue outbox without publishing it', async () => {
    const p = ports();
    const first = createSettingsReleaseCoordinator(p);
    await first.boot();
    p.broadcast.publish.mockClear();
    const raw = p.storage.state.missionpulse_settings_release_v1 as SettingsReleaseEnvelopeV1;
    const commandId = `settings-release:${raw.installId}:${raw.nextIdentity}:command`;
    const snapshot = {
      settings: structuredClone(raw.confirmed.settings),
      onboardingCompleted: raw.confirmed.onboardingCompleted,
      revision: raw.revision + 1,
      generation: raw.generation + 1,
    };
    p.storage.state.missionpulse_settings_release_v1 = {
      ...structuredClone(raw),
      catalogFingerprint: HISTORICAL_CONNECTOR_CATALOGUE_FINGERPRINT,
      nextIdentity: raw.nextIdentity + 1,
      revision: snapshot.revision,
      generation: snapshot.generation,
      outcomes: [
        {
          commandId,
          requestId: requestId(13),
          intentDigest: 'a'.repeat(64),
          kind: 'save_settings',
          settledRevision: snapshot.revision,
          settledGeneration: snapshot.generation,
          snapshot,
          status: 'committed',
          reason: 'committed',
        },
      ],
      outbox: {
        commandId,
        broadcastId: `${commandId}:broadcast`,
        reason: 'mutation_settlement',
        snapshot,
      },
    } satisfies SettingsReleaseEnvelopeV1;

    const migrated = createSettingsReleaseCoordinator(p);
    await migrated.boot();
    expect((await migrated.read()).status).toBe('confirmed');
    expect(p.broadcast.publish).toHaveBeenCalledTimes(1);
    expect(p.broadcast.publish.mock.calls[0][0].payload.commandId).not.toBe(commandId);
  });

  it('retires an old-catalogue reserved scan through query only before migration', async () => {
    const p = ports();
    const first = createSettingsReleaseCoordinator(p);
    await first.boot();
    const raw = p.storage.state.missionpulse_settings_release_v1 as SettingsReleaseEnvelopeV1;
    const identity = raw.nextIdentity;
    p.storage.state.missionpulse_settings_release_v1 = {
      ...structuredClone(raw),
      catalogFingerprint: HISTORICAL_CONNECTOR_CATALOGUE_FINGERPRINT,
      nextIdentity: identity + 1,
      generation: raw.generation + 1,
      scanAdmission: {
        identity,
        token: `settings-release:${raw.installId}:${identity}:scan`,
        snapshot: {
          settings: structuredClone(raw.confirmed.settings),
          onboardingCompleted: raw.confirmed.onboardingCompleted,
          revision: raw.revision,
          generation: raw.generation,
        },
        snapshotDigest: 'b'.repeat(64),
        phase: 'reserved',
        result: null,
      },
    } satisfies SettingsReleaseEnvelopeV1;
    p.scan.query.mockResolvedValueOnce({ status: 'not_found' });

    const migrated = createSettingsReleaseCoordinator(p);
    await migrated.boot();
    expect((await migrated.read()).status).toBe('confirmed');
    expect(p.scan.query).toHaveBeenCalledTimes(1);
    expect(p.scan.tryAdmit).not.toHaveBeenCalled();
  });

  it('blocks an unknown catalogue fingerprint before any alarm, scan, or broadcast effect', async () => {
    const p = ports();
    const first = createSettingsReleaseCoordinator(p);
    await first.boot();
    const raw = p.storage.state.missionpulse_settings_release_v1 as SettingsReleaseEnvelopeV1;
    p.storage.state.missionpulse_settings_release_v1 = {
      ...structuredClone(raw),
      catalogFingerprint: 'f'.repeat(64),
    } satisfies SettingsReleaseEnvelopeV1;
    p.alarm.get.mockClear();
    p.alarm.create.mockClear();
    p.alarm.clear.mockClear();
    p.scan.query.mockClear();
    p.scan.tryAdmit.mockClear();
    p.broadcast.publish.mockClear();

    const coordinator = createSettingsReleaseCoordinator(p);
    await coordinator.boot();

    expect(await coordinator.read()).toEqual({
      status: 'unavailable',
      reason: 'storage_ambiguous',
      snapshot: null,
    });
    expect(p.alarm.get).not.toHaveBeenCalled();
    expect(p.alarm.create).not.toHaveBeenCalled();
    expect(p.alarm.clear).not.toHaveBeenCalled();
    expect(p.scan.query).not.toHaveBeenCalled();
    expect(p.scan.tryAdmit).not.toHaveBeenCalled();
    expect(p.broadcast.publish).not.toHaveBeenCalled();
  });

  it('applies the 10-second deadline while retiring an old-catalogue scan', async () => {
    vi.useFakeTimers();
    try {
      const p = ports();
      const first = createSettingsReleaseCoordinator(p);
      await first.boot();
      const raw = p.storage.state.missionpulse_settings_release_v1 as SettingsReleaseEnvelopeV1;
      const identity = raw.nextIdentity;
      p.storage.state.missionpulse_settings_release_v1 = {
        ...structuredClone(raw),
        catalogFingerprint: HISTORICAL_CONNECTOR_CATALOGUE_FINGERPRINT,
        nextIdentity: identity + 1,
        generation: raw.generation + 1,
        scanAdmission: {
          identity,
          token: `settings-release:${raw.installId}:${identity}:scan`,
          snapshot: {
            settings: structuredClone(raw.confirmed.settings),
            onboardingCompleted: raw.confirmed.onboardingCompleted,
            revision: raw.revision,
            generation: raw.generation,
          },
          snapshotDigest: 'd'.repeat(64),
          phase: 'reserved',
          result: null,
        },
      } satisfies SettingsReleaseEnvelopeV1;
      p.scan.query.mockImplementationOnce(() => new Promise(() => {}));

      const coordinator = createSettingsReleaseCoordinator(p);
      const boot = coordinator.boot();
      for (let turn = 0; turn < 20 && p.scan.query.mock.calls.length === 0; turn += 1) {
        await vi.advanceTimersByTimeAsync(0);
      }
      expect(p.scan.query).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(10_000);
      await boot;

      expect(await coordinator.read()).toMatchObject({ status: 'unavailable' });
      expect(
        (p.storage.state.missionpulse_settings_release_v1 as SettingsReleaseEnvelopeV1)
          .scanAdmission
      ).not.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('accepts a scan once, clears its durable lease and advances the retirement watermark', async () => {
    const p = ports(new MemoryStorage({ onboarding_completed: true, settings: SETTINGS }));
    const coordinator = createSettingsReleaseCoordinator(p);
    await coordinator.boot();
    const disposition = await coordinator.admitAutoScan(1234);
    expect(disposition).toMatchObject({ status: 'accepted' });
    const final = p.storage.state.missionpulse_settings_release_v1 as SettingsReleaseEnvelopeV1;
    expect(final.scanAdmission).toBeNull();
    expect(final.scanAckThrough).toBe(1);
    expect(p.scan.tryAdmit).toHaveBeenCalledTimes(1);
  });

  it('clears a cold accepted scan lease only after the query returns the exact operation', async () => {
    const p = ports();
    const first = createSettingsReleaseCoordinator(p);
    await first.boot();
    const raw = p.storage.state.missionpulse_settings_release_v1 as SettingsReleaseEnvelopeV1;
    const identity = raw.nextIdentity;
    const operationId = `missionpulse-scan:${raw.installId}:${identity}` as const;
    p.storage.state.missionpulse_settings_release_v1 = {
      ...structuredClone(raw),
      nextIdentity: identity + 1,
      generation: raw.generation + 2,
      scanAdmission: {
        identity,
        token: `settings-release:${raw.installId}:${identity}:scan`,
        snapshot: {
          settings: structuredClone(raw.confirmed.settings),
          onboardingCompleted: raw.confirmed.onboardingCompleted,
          revision: raw.revision,
          generation: raw.generation,
        },
        snapshotDigest: 'e'.repeat(64),
        phase: 'accepted',
        result: { status: 'accepted', operationId },
      },
    } satisfies SettingsReleaseEnvelopeV1;
    p.scan.query.mockResolvedValueOnce({ status: 'accepted', operationId });

    const recovered = createSettingsReleaseCoordinator(p);
    await recovered.boot();
    expect((await recovered.read()).status).toBe('confirmed');
    const final = p.storage.state.missionpulse_settings_release_v1 as SettingsReleaseEnvelopeV1;
    expect(final.scanAdmission).toBeNull();
    expect(final.scanAckThrough).toBe(identity);
    expect(p.scan.tryAdmit).not.toHaveBeenCalled();
    expect(p.scan.query).toHaveBeenCalledTimes(1);
  });

  it('blocks and retains a cold reserved scan when the coordinator reports it retired', async () => {
    const p = ports();
    const first = createSettingsReleaseCoordinator(p);
    await first.boot();
    const raw = p.storage.state.missionpulse_settings_release_v1 as SettingsReleaseEnvelopeV1;
    const identity = raw.nextIdentity;
    p.storage.state.missionpulse_settings_release_v1 = {
      ...structuredClone(raw),
      nextIdentity: identity + 1,
      generation: raw.generation + 1,
      scanAdmission: {
        identity,
        token: `settings-release:${raw.installId}:${identity}:scan`,
        snapshot: {
          settings: structuredClone(raw.confirmed.settings),
          onboardingCompleted: raw.confirmed.onboardingCompleted,
          revision: raw.revision,
          generation: raw.generation,
        },
        snapshotDigest: 'e'.repeat(64),
        phase: 'reserved',
        result: null,
      },
    } satisfies SettingsReleaseEnvelopeV1;
    p.scan.tryAdmit.mockResolvedValueOnce({ status: 'retired' });

    const recovered = createSettingsReleaseCoordinator(p);
    await recovered.boot();

    expect(await recovered.read()).toEqual({
      status: 'unavailable',
      reason: 'actor_blocked',
      snapshot: null,
    });
    expect(
      (p.storage.state.missionpulse_settings_release_v1 as SettingsReleaseEnvelopeV1).scanAdmission
    ).not.toBeNull();
  });

  it('applies the 10-second deadline while recovering a current-catalogue scan', async () => {
    vi.useFakeTimers();
    try {
      const p = ports();
      const first = createSettingsReleaseCoordinator(p);
      await first.boot();
      const raw = p.storage.state.missionpulse_settings_release_v1 as SettingsReleaseEnvelopeV1;
      const identity = raw.nextIdentity;
      p.storage.state.missionpulse_settings_release_v1 = {
        ...structuredClone(raw),
        nextIdentity: identity + 1,
        generation: raw.generation + 1,
        scanAdmission: {
          identity,
          token: `settings-release:${raw.installId}:${identity}:scan`,
          snapshot: {
            settings: structuredClone(raw.confirmed.settings),
            onboardingCompleted: raw.confirmed.onboardingCompleted,
            revision: raw.revision,
            generation: raw.generation,
          },
          snapshotDigest: 'f'.repeat(64),
          phase: 'reserved',
          result: null,
        },
      } satisfies SettingsReleaseEnvelopeV1;
      let signalAdmitStarted!: () => void;
      const admitStarted = new Promise<void>((resolve) => {
        signalAdmitStarted = resolve;
      });
      p.scan.tryAdmit.mockImplementationOnce(() => {
        signalAdmitStarted();
        return new Promise(() => {});
      });

      const recovered = createSettingsReleaseCoordinator(p);
      const boot = recovered.boot();
      await admitStarted;
      expect(p.scan.tryAdmit).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(10_000);
      await boot;

      expect(await recovered.read()).toEqual({
        status: 'unavailable',
        reason: 'actor_blocked',
        snapshot: null,
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('admits a mutation at the exact counter budget and blocks one increment short', async () => {
    const exactPorts = ports();
    const seed = createSettingsReleaseCoordinator(exactPorts);
    await seed.boot();
    const raw = exactPorts.storage.state
      .missionpulse_settings_release_v1 as SettingsReleaseEnvelopeV1;
    exactPorts.storage.state.missionpulse_settings_release_v1 = {
      ...structuredClone(raw),
      revision: Number.MAX_SAFE_INTEGER - 1,
      generation: Number.MAX_SAFE_INTEGER - 5,
      nextIdentity: Number.MAX_SAFE_INTEGER - 1,
    } satisfies SettingsReleaseEnvelopeV1;
    const exact = createSettingsReleaseCoordinator(exactPorts);
    await exact.boot();
    const read = await exact.read();
    if (read.status !== 'confirmed') {
      throw new Error('boot failed');
    }
    expect(
      await exact.mutate({
        kind: 'save_settings',
        requestId: requestId(10),
        baseRevision: read.snapshot.revision,
        settings: { ...read.snapshot.settings, notifications: false },
      })
    ).toMatchObject({ status: 'settled', outcome: { settledRevision: Number.MAX_SAFE_INTEGER } });

    const shortPorts = ports();
    const shortSeed = createSettingsReleaseCoordinator(shortPorts);
    await shortSeed.boot();
    const shortRaw = shortPorts.storage.state
      .missionpulse_settings_release_v1 as SettingsReleaseEnvelopeV1;
    shortPorts.storage.state.missionpulse_settings_release_v1 = {
      ...structuredClone(shortRaw),
      generation: Number.MAX_SAFE_INTEGER - 4,
    } satisfies SettingsReleaseEnvelopeV1;
    const short = createSettingsReleaseCoordinator(shortPorts);
    await short.boot();
    const shortRead = await short.read();
    if (shortRead.status !== 'confirmed') {
      throw new Error('boot failed');
    }
    expect(
      await short.mutate({
        kind: 'save_settings',
        requestId: requestId(11),
        baseRevision: shortRead.snapshot.revision,
        settings: { ...shortRead.snapshot.settings, notifications: false },
      })
    ).toMatchObject({ status: 'blocked', reason: 'identity_exhausted' });
  });

  it('blocks before projection or effects when the envelope drifts between FIFO heads', async () => {
    const p = ports();
    const coordinator = createSettingsReleaseCoordinator(p);
    await coordinator.boot();
    const raw = p.storage.state.missionpulse_settings_release_v1 as SettingsReleaseEnvelopeV1;
    p.storage.state.missionpulse_settings_release_v1 = {
      ...structuredClone(raw),
      generation: raw.generation + 1,
    } satisfies SettingsReleaseEnvelopeV1;

    expect(await coordinator.read()).toEqual({
      status: 'unavailable',
      reason: 'storage_ambiguous',
      snapshot: null,
    });
    expect(p.permissions.contains).not.toHaveBeenCalled();
    expect(p.alarm.create).not.toHaveBeenCalled();
    expect(await coordinator.retry()).toEqual({ status: 'retry_accepted', snapshot: null });
  });

  it('rejects the ninth startup entry with the exact transport-only shape', async () => {
    const p = ports();
    const originalGet = p.storage.get.bind(p.storage);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let first = true;
    p.storage.get = vi.fn(async (keys) => {
      if (first) {
        first = false;
        await gate;
      }
      return originalGet(keys);
    });
    const coordinator = createSettingsReleaseCoordinator(p);
    const reads = Array.from({ length: 9 }, () => coordinator.read());
    expect(await reads[8]).toEqual({
      status: 'transport_rejected',
      reason: 'queue_full',
      commandType: 'read',
      correlationId: null,
      snapshot: null,
    });
    release();
    await Promise.all(reads.slice(0, 8));
  });

  it('allows 32 runtime entries and rejects the 33rd without a business result', async () => {
    const p = ports();
    const coordinator = createSettingsReleaseCoordinator(p);
    await coordinator.boot();
    const originalGet = p.storage.get.bind(p.storage);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let first = true;
    p.storage.get = vi.fn(async (keys) => {
      if (first) {
        first = false;
        await gate;
      }
      return originalGet(keys);
    });
    const reads = Array.from({ length: 33 }, () => coordinator.read());
    expect(await reads[32]).toMatchObject({
      status: 'transport_rejected',
      commandType: 'read',
      snapshot: null,
    });
    release();
    const accepted = await Promise.all(reads.slice(0, 32));
    expect(accepted.every((result) => result.status === 'confirmed')).toBe(true);
  });
});
