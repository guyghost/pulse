import {
  isUuidV4,
  readStrictJsonArray,
  readStrictJsonRecord,
  type AutoScanAlarmExpectationV1,
} from '../../../models/settings-persistence.contract';
import type { SettingsDatasetGateCapabilityV1 } from './settings-dataset-gate';
import type {
  SettingsAutoScanAlarmPort,
  SettingsHostPermissionContainsPort,
  SettingsLocalStoragePort,
} from './settings-transaction.repository';
import type { SettingsSessionStoragePort } from './settings-pending-intent.repository';

export interface ChromeSettingsStorageAreaApi {
  get(key: string): Promise<unknown>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(key: string): Promise<void>;
}

export interface ChromeSettingsAlarmApi {
  create(name: string, alarmInfo: { periodInMinutes: number }): void | Promise<void>;
  get(name: string): Promise<unknown>;
  clear(name: string): Promise<boolean>;
}

export interface ChromeSettingsPermissionsApi {
  contains(permissions: { origins: string[] }): Promise<boolean>;
}

function readSingleStorageValue(result: unknown, key: string): unknown | undefined {
  if (typeof result !== 'object' || result === null || Array.isArray(result)) {
    throw new Error('Chrome Settings storage result must be an ordinary key/value record.');
  }
  try {
    const prototype = Object.getPrototypeOf(result);
    const keys = Reflect.ownKeys(result);
    if (
      (prototype !== Object.prototype && prototype !== null) ||
      keys.some((ownKey) => typeof ownKey !== 'string') ||
      (keys.length !== 0 && (keys.length !== 1 || keys[0] !== key))
    ) {
      throw new Error('Chrome Settings storage result has an invalid shape.');
    }
    if (keys.length === 0) {
      return undefined;
    }
    const descriptor = Object.getOwnPropertyDescriptor(result, key);
    if (
      descriptor === undefined ||
      !descriptor.enumerable ||
      !('value' in descriptor) ||
      'get' in descriptor ||
      'set' in descriptor
    ) {
      throw new Error('Chrome Settings storage result must contain a data descriptor.');
    }
    return descriptor.value;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('Chrome Settings storage result')) {
      throw error;
    }
    throw new Error('Chrome Settings storage result could not be inspected safely.');
  }
}

function exactStorageItems(key: string, value: unknown): Record<string, unknown> {
  return { [key]: value };
}

export function createChromeSettingsLocalStoragePort(
  area: ChromeSettingsStorageAreaApi
): SettingsLocalStoragePort {
  return Object.freeze({
    async get(key: string): Promise<unknown | undefined> {
      return readSingleStorageValue(await area.get(key), key);
    },
    async set(key: string, value: unknown): Promise<void> {
      await area.set(exactStorageItems(key, value));
    },
  });
}

export function createChromeSettingsSessionStoragePort(
  area: ChromeSettingsStorageAreaApi
): SettingsSessionStoragePort {
  return Object.freeze({
    async get(key: string): Promise<unknown | undefined> {
      return readSingleStorageValue(await area.get(key), key);
    },
    async set(key: string, value: unknown): Promise<void> {
      await area.set(exactStorageItems(key, value));
    },
    async remove(key: string): Promise<void> {
      await area.remove(key);
    },
  });
}

function parseAlarmExpectation(value: unknown): AutoScanAlarmExpectationV1 | null {
  const record = readStrictJsonRecord(value, [
    'version',
    'kind',
    'alarmName',
    'enabled',
    'periodInMinutes',
  ]);
  if (
    record === null ||
    record.version !== 1 ||
    record.kind !== 'AUTO_SCAN_ALARM' ||
    record.alarmName !== 'auto-scan' ||
    typeof record.enabled !== 'boolean' ||
    (record.enabled
      ? !Number.isInteger(record.periodInMinutes) ||
        Number(record.periodInMinutes) < 1 ||
        Number(record.periodInMinutes) > 1440
      : record.periodInMinutes !== null)
  ) {
    return null;
  }
  return {
    version: 1,
    kind: 'AUTO_SCAN_ALARM',
    alarmName: 'auto-scan',
    enabled: record.enabled,
    periodInMinutes: record.enabled ? Number(record.periodInMinutes) : null,
  };
}

function parseChromeAutoScanAlarm(value: unknown): AutoScanAlarmExpectationV1 | null {
  if (value === undefined) {
    return {
      version: 1,
      kind: 'AUTO_SCAN_ALARM',
      alarmName: 'auto-scan',
      enabled: false,
      periodInMinutes: null,
    };
  }
  if (typeof value !== 'object' || value === null) {
    return null;
  }
  let ownKeys: (string | symbol)[];
  try {
    ownKeys = Reflect.ownKeys(value);
  } catch {
    return null;
  }
  const currentShape = ownKeys.length === 4 && ownKeys.includes('persistAcrossSessions');
  const record = readStrictJsonRecord(
    value,
    currentShape
      ? ['name', 'scheduledTime', 'periodInMinutes', 'persistAcrossSessions']
      : ['name', 'scheduledTime', 'periodInMinutes']
  );
  if (
    record === null ||
    record.name !== 'auto-scan' ||
    typeof record.scheduledTime !== 'number' ||
    !Number.isFinite(record.scheduledTime) ||
    record.scheduledTime < 0 ||
    !Number.isInteger(record.periodInMinutes) ||
    Number(record.periodInMinutes) < 1 ||
    Number(record.periodInMinutes) > 1440 ||
    (currentShape && typeof record.persistAcrossSessions !== 'boolean')
  ) {
    return null;
  }
  return {
    version: 1,
    kind: 'AUTO_SCAN_ALARM',
    alarmName: 'auto-scan',
    enabled: true,
    periodInMinutes: Number(record.periodInMinutes),
  };
}

function sameAlarm(left: AutoScanAlarmExpectationV1, right: AutoScanAlarmExpectationV1): boolean {
  return left.enabled === right.enabled && left.periodInMinutes === right.periodInMinutes;
}

export function createChromeSettingsAutoScanAlarmPort(
  alarms: ChromeSettingsAlarmApi
): SettingsAutoScanAlarmPort {
  const read = async (): Promise<AutoScanAlarmExpectationV1> => {
    const parsed = parseChromeAutoScanAlarm(await alarms.get('auto-scan'));
    if (parsed === null) {
      throw new Error('Chrome did not return an exact periodic auto-scan alarm.');
    }
    return parsed;
  };

  return Object.freeze({
    async apply(rawExpectation: AutoScanAlarmExpectationV1): Promise<void> {
      const expectation = parseAlarmExpectation(rawExpectation);
      if (expectation === null) {
        throw new Error('Invalid auto-scan alarm expectation.');
      }
      try {
        if (expectation.enabled) {
          // The manifest still supports Chrome 114. Chrome 150 adds an optional
          // persistence flag, but persistence is not part of this model; omit
          // it and verify the modeled periodic alarm by exact read-back.
          await alarms.create('auto-scan', {
            periodInMinutes: expectation.periodInMinutes as number,
          });
        } else {
          await alarms.clear('auto-scan');
        }
      } catch {
        // Chrome Promise rejection is ambiguous. Exact read-back below is the
        // sole effect authority and keeps the operation idempotent.
      }
      const actual = await read();
      if (!sameAlarm(actual, expectation)) {
        throw new Error('Auto-scan alarm read-back does not match the requested expectation.');
      }
    },
    read,
  });
}

function validCapability(value: unknown): value is SettingsDatasetGateCapabilityV1 {
  const record = readStrictJsonRecord(value, [
    'version',
    'kind',
    'dataEpoch',
    'operationId',
    'purpose',
    'leaseId',
    'authorityRevision',
  ]);
  return (
    record !== null &&
    record.version === 1 &&
    record.kind === 'DATASET_EPOCH_SETTINGS_LEASE' &&
    isUuidV4(record.dataEpoch) &&
    isUuidV4(record.operationId) &&
    (record.purpose === 'permission_check' || record.purpose === 'candidate_write') &&
    isUuidV4(record.leaseId) &&
    Number.isSafeInteger(record.authorityRevision) &&
    Number(record.authorityRevision) >= 0
  );
}

function parseOrigins(value: unknown): string[] | null {
  const origins = readStrictJsonArray(value);
  if (
    origins === null ||
    origins.length === 0 ||
    !origins.every(
      (origin): origin is string =>
        typeof origin === 'string' && origin.length > 0 && origin.length <= 2048
    ) ||
    new Set(origins).size !== origins.length ||
    ![...origins].sort().every((origin, index) => origin === origins[index])
  ) {
    return null;
  }
  return [...origins];
}

export function createChromeSettingsHostPermissionContainsPort(
  permissions: ChromeSettingsPermissionsApi
): SettingsHostPermissionContainsPort {
  return Object.freeze({
    async contains(
      rawOrigins: readonly string[],
      rawCapability: SettingsDatasetGateCapabilityV1
    ): Promise<boolean> {
      const origins = parseOrigins(rawOrigins);
      if (origins === null) {
        throw new Error('Settings host permission origins are not exact, sorted and unique.');
      }
      if (!validCapability(rawCapability)) {
        throw new Error('Settings host permission check lacks a valid DatasetEpoch capability.');
      }
      const result = await permissions.contains({ origins });
      if (typeof result !== 'boolean') {
        throw new Error('Chrome permissions.contains returned a non-boolean result.');
      }
      return result;
    },
  });
}
