import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { AppSettings } from '../../../src/lib/core/types/app-settings';

const bridge = vi.hoisted(() => ({
  sendMessage: vi.fn(),
  listener: null as null | ((message: unknown) => void),
}));

vi.mock('../../../src/lib/shell/messaging/bridge', () => ({
  sendMessage: bridge.sendMessage,
  subscribeMessages: (listener: (message: unknown) => void) => {
    bridge.listener = listener;
    return () => {};
  },
}));

import {
  getSettingsReleaseSnapshot,
  mutateSettingsRelease,
  peekSettingsReleaseSnapshot,
  resetSettingsReleaseFacadeForTests,
  saveSettingsRelease,
  subscribeSettingsReleaseSnapshots,
} from '../../../src/lib/shell/facades/settings-release.facade';

const REQUEST_ID = '93000000-0000-4000-8000-000000000001';
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

const snapshot = (revision = 0, generation = revision) => ({
  settings: SETTINGS,
  onboardingCompleted: true,
  revision,
  generation,
});

const readResponse = () => ({
  type: 'SETTINGS_RELEASE_RESULT',
  payload: { status: 'confirmed', snapshot: snapshot() },
});

function settledResponse() {
  return {
    type: 'SETTINGS_RELEASE_MUTATION_RESULT',
    payload: {
      status: 'settled',
      outcome: {
        commandId: 'settings-release:92000000-0000-4000-8000-000000000001:1:command',
        requestId: REQUEST_ID,
        intentDigest: 'a'.repeat(64),
        kind: 'save_settings',
        settledRevision: 1,
        settledGeneration: 1,
        snapshot: { ...snapshot(1, 1), settings: { ...SETTINGS, notifications: false } },
        status: 'committed',
        reason: 'committed',
      },
    },
  };
}

describe('settings release facade protocol', () => {
  beforeEach(() => {
    bridge.sendMessage.mockReset();
    bridge.listener = null;
    resetSettingsReleaseFacadeForTests();
  });

  it('retries one lost mutation with the byte-equivalent request identity after fresh boot', async () => {
    bridge.sendMessage
      .mockResolvedValueOnce(readResponse())
      .mockRejectedValueOnce(new Error('worker stopped'))
      .mockResolvedValueOnce({
        type: 'SETTINGS_RELEASE_RETRY_RESULT',
        payload: { status: 'retry_accepted', snapshot: null },
      })
      .mockResolvedValueOnce(readResponse())
      .mockResolvedValueOnce(settledResponse());
    await getSettingsReleaseSnapshot();

    await expect(
      mutateSettingsRelease((base) => ({
        kind: 'save_settings',
        requestId: REQUEST_ID,
        baseRevision: base.revision,
        settings: { ...base.settings, notifications: false },
      }))
    ).resolves.toMatchObject({ status: 'settled' });

    const mutationCalls = bridge.sendMessage.mock.calls
      .map((call) => call[0])
      .filter((message) => message.type === 'MUTATE_SETTINGS_RELEASE');
    expect(mutationCalls).toHaveLength(2);
    expect(mutationCalls[1]).toEqual(mutationCalls[0]);
    expect(bridge.sendMessage).toHaveBeenCalledWith({ type: 'RETRY_SETTINGS_RELEASE' });
  });

  it('retries from immutable detached bytes when the first transport mutates its DTO', async () => {
    bridge.sendMessage
      .mockResolvedValueOnce(readResponse())
      .mockImplementationOnce(async (message: Record<string, unknown>) => {
        const payload = message.payload as {
          requestId: string;
          settings: { notifications: boolean };
        };
        payload.requestId = '93000000-0000-4000-8000-000000000999';
        payload.settings.notifications = true;
        throw new Error('worker stopped after hostile transport mutation');
      })
      .mockResolvedValueOnce({
        type: 'SETTINGS_RELEASE_RETRY_RESULT',
        payload: { status: 'retry_accepted', snapshot: null },
      })
      .mockResolvedValueOnce(readResponse())
      .mockResolvedValueOnce(settledResponse());
    await getSettingsReleaseSnapshot();

    await expect(
      mutateSettingsRelease((base) => ({
        kind: 'save_settings',
        requestId: REQUEST_ID,
        baseRevision: base.revision,
        settings: { ...base.settings, notifications: false },
      }))
    ).resolves.toMatchObject({ status: 'settled' });

    const retried = bridge.sendMessage.mock.calls
      .map((call) => call[0])
      .filter((message) => message.type === 'MUTATE_SETTINGS_RELEASE')[1];
    expect(retried).toEqual({
      type: 'MUTATE_SETTINGS_RELEASE',
      payload: {
        kind: 'save_settings',
        requestId: REQUEST_ID,
        baseRevision: 0,
        settings: { ...SETTINGS, notifications: false },
      },
    });
  });

  it('rejects a hostile accessor response without invoking the getter', async () => {
    let getterCalls = 0;
    const hostile = { type: 'SETTINGS_RELEASE_RESULT' } as Record<string, unknown>;
    Object.defineProperty(hostile, 'payload', {
      enumerable: true,
      get() {
        getterCalls += 1;
        return readResponse().payload;
      },
    });
    bridge.sendMessage.mockResolvedValue(hostile);
    await expect(getSettingsReleaseSnapshot()).rejects.toThrow('not detached data');
    expect(getterCalls).toBe(0);
  });

  it('does not merge a broadcast with an extra field', async () => {
    bridge.sendMessage.mockResolvedValue(readResponse());
    await getSettingsReleaseSnapshot();
    bridge.listener?.({
      type: 'SETTINGS_RELEASE_UPDATED',
      payload: {
        snapshot: { ...snapshot(1, 1), settings: { ...SETTINGS, notifications: false } },
        commandId: 'settings-release:92000000-0000-4000-8000-000000000001:1:command',
        broadcastId: 'settings-release:92000000-0000-4000-8000-000000000001:1:command:broadcast',
        extra: true,
      },
    });
    expect(peekSettingsReleaseSnapshot()).toEqual(snapshot());
  });

  it('publishes only validated tuple-merged snapshots to panel consumers', async () => {
    bridge.sendMessage.mockResolvedValue(readResponse());
    const consumer = vi.fn();
    const unsubscribe = subscribeSettingsReleaseSnapshots(consumer);
    await getSettingsReleaseSnapshot();
    bridge.listener?.({
      type: 'SETTINGS_RELEASE_UPDATED',
      payload: {
        snapshot: { ...snapshot(2, 2), settings: { ...SETTINGS, theme: 'dark' } },
        commandId: 'settings-release:92000000-0000-4000-8000-000000000001:2:command',
        broadcastId: 'settings-release:92000000-0000-4000-8000-000000000001:2:command:broadcast',
      },
    });
    bridge.listener?.({
      type: 'SETTINGS_RELEASE_UPDATED',
      payload: {
        snapshot: { ...snapshot(1, 99), settings: { ...SETTINGS, theme: 'light' } },
        commandId: 'settings-release:92000000-0000-4000-8000-000000000001:1:command',
        broadcastId: 'settings-release:92000000-0000-4000-8000-000000000001:1:command:broadcast',
      },
    });

    expect(consumer).toHaveBeenNthCalledWith(1, snapshot());
    expect(consumer).toHaveBeenNthCalledWith(2, {
      ...snapshot(2, 2),
      settings: { ...SETTINGS, theme: 'dark' },
    });
    expect(consumer).toHaveBeenCalledTimes(2);
    unsubscribe();
  });

  it('treats already-confirmed settings as a successful canonical save', async () => {
    bridge.sendMessage
      .mockResolvedValueOnce(readResponse())
      .mockImplementationOnce(async (message: { payload: { requestId: string } }) => ({
        type: 'SETTINGS_RELEASE_MUTATION_RESULT',
        payload: {
          status: 'not_admitted',
          requestId: message.payload.requestId,
          commandId: null,
          reason: 'already_confirmed',
          snapshot: snapshot(),
        },
      }));

    await expect(saveSettingsRelease(SETTINGS)).resolves.toEqual(snapshot());
  });

  it('returns the retained monotone snapshot for an older already-confirmed response', async () => {
    const newer = { ...snapshot(2, 2), settings: { ...SETTINGS, theme: 'dark' as const } };
    bridge.sendMessage
      .mockResolvedValueOnce({
        type: 'SETTINGS_RELEASE_RESULT',
        payload: { status: 'confirmed', snapshot: newer },
      })
      .mockImplementationOnce(async (message: { payload: { requestId: string } }) => ({
        type: 'SETTINGS_RELEASE_MUTATION_RESULT',
        payload: {
          status: 'not_admitted',
          requestId: message.payload.requestId,
          commandId: null,
          reason: 'already_confirmed',
          snapshot: snapshot(1, 1),
        },
      }));
    await getSettingsReleaseSnapshot();

    await expect(saveSettingsRelease(newer.settings)).resolves.toEqual(newer);
    expect(peekSettingsReleaseSnapshot()).toEqual(newer);
  });
});
