import { describe, expect, it, vi } from 'vitest';

import {
  createChromeSettingsAutoScanAlarmPort,
  createChromeSettingsHostPermissionContainsPort,
  createChromeSettingsLocalStoragePort,
  createChromeSettingsSessionStoragePort,
  type ChromeSettingsAlarmApi,
  type ChromeSettingsPermissionsApi,
  type ChromeSettingsStorageAreaApi,
} from '../../../src/lib/shell/settings/chrome-settings-ports';
import type { SettingsDatasetGateCapabilityV1 } from '../../../src/lib/shell/settings/settings-dataset-gate';

const uuid = (value: number): string =>
  `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`;

const capability = (
  purpose: 'permission_check' | 'candidate_write'
): SettingsDatasetGateCapabilityV1 => ({
  version: 1,
  kind: 'DATASET_EPOCH_SETTINGS_LEASE',
  dataEpoch: uuid(1),
  operationId: uuid(2),
  purpose,
  leaseId: uuid(3),
  authorityRevision: 4,
});

function storageArea(initial: Record<string, unknown> = {}): {
  api: ChromeSettingsStorageAreaApi;
  values: Record<string, unknown>;
} {
  const values = { ...initial };
  return {
    values,
    api: {
      get: vi.fn(async (key: string) => (Object.hasOwn(values, key) ? { [key]: values[key] } : {})),
      set: vi.fn(async (items: Record<string, unknown>) => {
        Object.assign(values, items);
      }),
      remove: vi.fn(async (key: string) => {
        delete values[key];
      }),
    },
  };
}

describe('Chrome Settings storage ports', () => {
  it('adapts local and session storage without widening the requested key', async () => {
    const localArea = storageArea({ settings: { version: 2 } });
    const sessionArea = storageArea();
    const local = createChromeSettingsLocalStoragePort(localArea.api);
    const session = createChromeSettingsSessionStoragePort(sessionArea.api);

    expect(await local.get('settings')).toEqual({ version: 2 });
    await local.set('settings', { version: 3 });
    expect(localArea.values.settings).toEqual({ version: 3 });

    await session.set('intent', { revision: 1 });
    expect(await session.get('intent')).toEqual({ revision: 1 });
    await session.remove('intent');
    expect(await session.get('intent')).toBeUndefined();
    expect(localArea.api.get).toHaveBeenCalledWith('settings');
    expect(sessionArea.api.remove).toHaveBeenCalledWith('intent');
  });

  it('rejects an accessor-backed Chrome read result without invoking the getter', async () => {
    const getter = vi.fn(() => ({ version: 2 }));
    const result = Object.defineProperty({}, 'settings', {
      enumerable: true,
      get: getter,
    });
    const area: ChromeSettingsStorageAreaApi = {
      get: vi.fn(async () => result),
      set: vi.fn(async () => undefined),
      remove: vi.fn(async () => undefined),
    };

    await expect(createChromeSettingsLocalStoragePort(area).get('settings')).rejects.toThrow(
      'storage result'
    );
    expect(getter).not.toHaveBeenCalled();
  });

  it('rejects non-enumerable requested and extra storage keys', async () => {
    const hiddenRequested = Object.defineProperty({}, 'settings', {
      enumerable: false,
      value: { version: 2 },
    });
    const hiddenExtra = Object.defineProperties(
      { settings: { version: 2 } },
      { other: { enumerable: false, value: true } }
    );
    const area: ChromeSettingsStorageAreaApi = {
      get: vi
        .fn<ChromeSettingsStorageAreaApi['get']>()
        .mockResolvedValueOnce(hiddenRequested)
        .mockResolvedValueOnce(hiddenExtra),
      set: vi.fn(async () => undefined),
      remove: vi.fn(async () => undefined),
    };
    const port = createChromeSettingsLocalStoragePort(area);

    await expect(port.get('settings')).rejects.toThrow('storage result');
    await expect(port.get('settings')).rejects.toThrow('storage result');
  });
});

describe('Chrome auto-scan alarm port', () => {
  it('creates and reads back only the exact periodic auto-scan alarm', async () => {
    let alarm: unknown;
    const api: ChromeSettingsAlarmApi = {
      create: vi.fn(async (name, info) => {
        alarm = {
          name,
          scheduledTime: 1_000,
          periodInMinutes: info.periodInMinutes,
          persistAcrossSessions: true,
        };
      }),
      get: vi.fn(async () => alarm),
      clear: vi.fn(async () => true),
    };
    const port = createChromeSettingsAutoScanAlarmPort(api);

    await port.apply({
      version: 1,
      kind: 'AUTO_SCAN_ALARM',
      alarmName: 'auto-scan',
      enabled: true,
      periodInMinutes: 30,
    });

    expect(api.create).toHaveBeenCalledOnce();
    expect(api.create).toHaveBeenCalledWith('auto-scan', { periodInMinutes: 30 });
    expect(api.get).toHaveBeenCalledWith('auto-scan');
    expect(api.clear).not.toHaveBeenCalled();
    await expect(port.read()).resolves.toEqual({
      version: 1,
      kind: 'AUTO_SCAN_ALARM',
      alarmName: 'auto-scan',
      enabled: true,
      periodInMinutes: 30,
    });
  });

  it('accepts an ambiguous create only when exact read-back proves success', async () => {
    const api: ChromeSettingsAlarmApi = {
      create: vi.fn(async () => {
        throw new Error('ambiguous browser response');
      }),
      get: vi.fn(async () => ({
        name: 'auto-scan',
        scheduledTime: 1_000,
        periodInMinutes: 60,
      })),
      clear: vi.fn(async () => true),
    };

    await expect(
      createChromeSettingsAutoScanAlarmPort(api).apply({
        version: 1,
        kind: 'AUTO_SCAN_ALARM',
        alarmName: 'auto-scan',
        enabled: true,
        periodInMinutes: 60,
      })
    ).resolves.toBeUndefined();
  });

  it('clears only auto-scan and fails closed when read-back still sees it', async () => {
    const api: ChromeSettingsAlarmApi = {
      create: vi.fn(async () => undefined),
      get: vi.fn(async () => ({
        name: 'auto-scan',
        scheduledTime: 1_000,
        periodInMinutes: 30,
      })),
      clear: vi.fn(async () => true),
    };

    await expect(
      createChromeSettingsAutoScanAlarmPort(api).apply({
        version: 1,
        kind: 'AUTO_SCAN_ALARM',
        alarmName: 'auto-scan',
        enabled: false,
        periodInMinutes: null,
      })
    ).rejects.toThrow('read-back');
    expect(api.clear).toHaveBeenCalledWith('auto-scan');
    expect(api.create).not.toHaveBeenCalled();
  });

  it('rejects a one-shot or malformed alarm instead of guessing a period', async () => {
    const api: ChromeSettingsAlarmApi = {
      create: vi.fn(async () => undefined),
      get: vi.fn(async () => ({ name: 'auto-scan', scheduledTime: 1_000 })),
      clear: vi.fn(async () => true),
    };

    await expect(createChromeSettingsAutoScanAlarmPort(api).read()).rejects.toThrow(
      'periodic auto-scan alarm'
    );
  });

  it('accepts the Chrome 150+ persistence field without inventing a new model invariant', async () => {
    const api: ChromeSettingsAlarmApi = {
      create: vi.fn(async () => undefined),
      get: vi.fn(async () => ({
        name: 'auto-scan',
        scheduledTime: 1_000,
        periodInMinutes: 30,
        persistAcrossSessions: false,
      })),
      clear: vi.fn(async () => true),
    };

    await expect(createChromeSettingsAutoScanAlarmPort(api).read()).resolves.toMatchObject({
      enabled: true,
      periodInMinutes: 30,
    });
  });
});

describe('Chrome Settings permission port', () => {
  it('uses contains-only with an exact sorted origin batch', async () => {
    const request = vi.fn(async () => true);
    const api: ChromeSettingsPermissionsApi & { request: typeof request } = {
      contains: vi.fn(async () => true),
      request,
    };
    const port = createChromeSettingsHostPermissionContainsPort(api);

    await expect(
      port.contains(['https://a.example/*', 'https://b.example/*'], capability('permission_check'))
    ).resolves.toBe(true);
    expect(api.contains).toHaveBeenCalledWith({
      origins: ['https://a.example/*', 'https://b.example/*'],
    });
    expect(request).not.toHaveBeenCalled();
  });

  it('rejects duplicate, unsorted and accessor-backed origin batches before Chrome', async () => {
    const api: ChromeSettingsPermissionsApi = { contains: vi.fn(async () => true) };
    const port = createChromeSettingsHostPermissionContainsPort(api);

    await expect(
      port.contains(['https://b.example/*', 'https://a.example/*'], capability('permission_check'))
    ).rejects.toThrow('origins');

    const getter = vi.fn(() => 'https://a.example/*');
    const hostile = ['https://a.example/*'];
    Object.defineProperty(hostile, '0', { enumerable: true, get: getter });
    await expect(port.contains(hostile, capability('candidate_write'))).rejects.toThrow('origins');
    expect(getter).not.toHaveBeenCalled();
    expect(api.contains).not.toHaveBeenCalled();
  });
});
