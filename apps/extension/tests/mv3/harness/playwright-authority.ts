import { createHash } from 'node:crypto';

export const PLAYWRIGHT_AUTHORITY_KEYS = Object.freeze([
  'extensionId',
  'registrationId',
  'versionId',
  'scopeURL',
  'scriptURL',
  'targetId',
] as const);

export type PlaywrightAuthorityField = (typeof PLAYWRIGHT_AUTHORITY_KEYS)[number];

export type PlaywrightAuthorityProjectionErrorCode =
  | 'SOURCE_NOT_RECORD'
  | 'SOURCE_INTROSPECTION_FAILED'
  | 'KEY_SET_INVALID'
  | 'FIELD_TYPE_INVALID'
  | 'FIELD_EMPTY'
  | 'FIELD_UTF8_LIMIT_EXCEEDED'
  | 'FIELD_CONTROL_CHARACTER'
  | 'EXTENSION_ID_INVALID'
  | 'SCOPE_URL_INVALID'
  | 'SCRIPT_URL_INVALID';

declare const playwrightAuthorityBrand: unique symbol;

interface PlaywrightAuthorityFields {
  readonly extensionId: string;
  readonly registrationId: string;
  readonly versionId: string;
  readonly scopeURL: string;
  readonly scriptURL: string;
  readonly targetId: string;
}

export type PlaywrightAuthorityV1 = Readonly<PlaywrightAuthorityFields> & {
  readonly [playwrightAuthorityBrand]: 'PlaywrightAuthorityV1';
};

export interface PlaywrightAuthorityProjectionErrorV1 {
  readonly schemaVersion: 1;
  readonly code: PlaywrightAuthorityProjectionErrorCode;
  readonly field: PlaywrightAuthorityField | null;
}

export type PlaywrightAuthorityProjectionResult =
  | Readonly<{
      ok: true;
      authority: PlaywrightAuthorityV1;
      authorityProjectionSha256: string;
    }>
  | Readonly<{
      ok: false;
      error: PlaywrightAuthorityProjectionErrorV1;
    }>;

export interface NoOwnerReleaseReceiptV1 {
  readonly schemaVersion: 1;
  readonly processGeneration: number;
  readonly playwrightEpoch: number;
  readonly rawReceiptSha256: string;
  readonly ownerKind: 'none';
  readonly leaseReserved: false;
  readonly transportOpened: false;
  readonly authorityProjectionSha256: null;
  readonly receiptSha256: string;
}

const MAX_ID_BYTES = 4_096;
const CONTROL_CHARACTERS = /[\0\r\n]/u;
const SHA256 = /^[a-f0-9]{64}$/u;
const ERROR_CODES = new Set<PlaywrightAuthorityProjectionErrorCode>([
  'SOURCE_NOT_RECORD',
  'SOURCE_INTROSPECTION_FAILED',
  'KEY_SET_INVALID',
  'FIELD_TYPE_INVALID',
  'FIELD_EMPTY',
  'FIELD_UTF8_LIMIT_EXCEEDED',
  'FIELD_CONTROL_CHARACTER',
  'EXTENSION_ID_INVALID',
  'SCOPE_URL_INVALID',
  'SCRIPT_URL_INVALID',
]);
const FIELD_SET = new Set<string>(PLAYWRIGHT_AUTHORITY_KEYS);

function canonicalize(value: unknown, ancestors = new Set<object>()): string {
  if (value === null) {
    return 'null';
  }
  if (typeof value === 'string' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new TypeError('JCS numbers must be finite.');
    }
    return JSON.stringify(value);
  }
  if (typeof value !== 'object') {
    throw new TypeError(`Unsupported JCS value: ${typeof value}.`);
  }
  if (ancestors.has(value)) {
    throw new TypeError('Cyclic JCS values are forbidden.');
  }
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      return `[${value.map((item) => canonicalize(item, ancestors)).join(',')}]`;
    }
    const record = value as Readonly<Record<string, unknown>>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalize(record[key], ancestors)}`)
      .join(',')}}`;
  } finally {
    ancestors.delete(value);
  }
}

export function sha256Jcs(value: unknown): string {
  return createHash('sha256').update(canonicalize(value), 'utf8').digest('hex');
}

function rejection(
  code: PlaywrightAuthorityProjectionErrorCode,
  field: PlaywrightAuthorityField | null
): PlaywrightAuthorityProjectionResult {
  return Object.freeze({
    ok: false as const,
    error: Object.freeze({ schemaVersion: 1 as const, code, field }),
  });
}

function isNonArrayObject(value: unknown): value is object {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function inspectDataFields(
  source: unknown,
  exactKeySet: boolean
):
  | Readonly<{ ok: true; values: Readonly<Record<PlaywrightAuthorityField, unknown>> }>
  | Readonly<{ ok: false; result: PlaywrightAuthorityProjectionResult }> {
  if (typeof source !== 'object' || source === null) {
    return Object.freeze({ ok: false, result: rejection('SOURCE_NOT_RECORD', null) });
  }

  try {
    if (!isNonArrayObject(source)) {
      return Object.freeze({ ok: false, result: rejection('SOURCE_NOT_RECORD', null) });
    }
    Reflect.getPrototypeOf(source);
    const keys = Reflect.ownKeys(source);
    if (
      (exactKeySet &&
        (keys.length !== PLAYWRIGHT_AUTHORITY_KEYS.length ||
          keys.some((key) => typeof key !== 'string' || !FIELD_SET.has(key)))) ||
      PLAYWRIGHT_AUTHORITY_KEYS.some((field) => !keys.includes(field))
    ) {
      return Object.freeze({ ok: false, result: rejection('KEY_SET_INVALID', null) });
    }

    const values: Partial<Record<PlaywrightAuthorityField, unknown>> = {};
    for (const field of PLAYWRIGHT_AUTHORITY_KEYS) {
      const descriptor = Reflect.getOwnPropertyDescriptor(source, field);
      if (
        descriptor === undefined ||
        descriptor.enumerable !== true ||
        !Object.prototype.hasOwnProperty.call(descriptor, 'value') ||
        Object.prototype.hasOwnProperty.call(descriptor, 'get') ||
        Object.prototype.hasOwnProperty.call(descriptor, 'set')
      ) {
        return Object.freeze({ ok: false, result: rejection('KEY_SET_INVALID', null) });
      }
      values[field] = descriptor.value;
    }
    return Object.freeze({
      ok: true,
      values: Object.freeze(values) as Readonly<Record<PlaywrightAuthorityField, unknown>>,
    });
  } catch {
    return Object.freeze({
      ok: false,
      result: rejection('SOURCE_INTROSPECTION_FAILED', null),
    });
  }
}

function validateValues(
  values: Readonly<Record<PlaywrightAuthorityField, unknown>>
): PlaywrightAuthorityProjectionResult {
  for (const field of PLAYWRIGHT_AUTHORITY_KEYS) {
    const value = values[field];
    if (typeof value !== 'string') {
      return rejection('FIELD_TYPE_INVALID', field);
    }
    if (value.length === 0) {
      return rejection('FIELD_EMPTY', field);
    }
    if (Buffer.byteLength(value, 'utf8') > MAX_ID_BYTES) {
      return rejection('FIELD_UTF8_LIMIT_EXCEEDED', field);
    }
    if (CONTROL_CHARACTERS.test(value)) {
      return rejection('FIELD_CONTROL_CHARACTER', field);
    }
  }

  const extensionId = values.extensionId as string;
  const registrationId = values.registrationId as string;
  const versionId = values.versionId as string;
  const scopeURL = values.scopeURL as string;
  const scriptURL = values.scriptURL as string;
  const targetId = values.targetId as string;
  if (!/^[a-p]{32}$/u.test(extensionId)) {
    return rejection('EXTENSION_ID_INVALID', 'extensionId');
  }
  if (scopeURL !== `chrome-extension://${extensionId}/`) {
    return rejection('SCOPE_URL_INVALID', 'scopeURL');
  }
  if (!scriptURL.startsWith(scopeURL)) {
    return rejection('SCRIPT_URL_INVALID', 'scriptURL');
  }

  const authority = Object.freeze({
    extensionId,
    registrationId,
    versionId,
    scopeURL,
    scriptURL,
    targetId,
  }) as PlaywrightAuthorityV1;
  return Object.freeze({
    ok: true,
    authority,
    authorityProjectionSha256: sha256Jcs(authority),
  });
}

export function parsePlaywrightAuthorityV1(source: unknown): PlaywrightAuthorityProjectionResult {
  const inspected = inspectDataFields(source, true);
  return inspected.ok ? validateValues(inspected.values) : inspected.result;
}

export function projectPlaywrightAuthorityV1(source: unknown): PlaywrightAuthorityProjectionResult {
  const inspected = inspectDataFields(source, false);
  if (!inspected.ok) {
    return inspected.result;
  }
  return parsePlaywrightAuthorityV1({
    extensionId: inspected.values.extensionId,
    registrationId: inspected.values.registrationId,
    versionId: inspected.values.versionId,
    scopeURL: inspected.values.scopeURL,
    scriptURL: inspected.values.scriptURL,
    targetId: inspected.values.targetId,
  });
}

function readExactDataRecord(
  source: unknown,
  expectedKeys: readonly string[]
): Readonly<Record<string, unknown>> | null {
  try {
    if (!isNonArrayObject(source)) {
      return null;
    }
    Reflect.getPrototypeOf(source);
    const keys = Reflect.ownKeys(source);
    if (
      keys.length !== expectedKeys.length ||
      keys.some((key) => typeof key !== 'string' || !expectedKeys.includes(key))
    ) {
      return null;
    }
    const result: Record<string, unknown> = {};
    for (const key of expectedKeys) {
      const descriptor = Reflect.getOwnPropertyDescriptor(source, key);
      if (
        descriptor === undefined ||
        descriptor.enumerable !== true ||
        !Object.prototype.hasOwnProperty.call(descriptor, 'value')
      ) {
        return null;
      }
      result[key] = descriptor.value;
    }
    return Object.freeze(result);
  } catch {
    return null;
  }
}

export function isPlaywrightAuthorityProjectionErrorV1(
  source: unknown
): source is PlaywrightAuthorityProjectionErrorV1 {
  const record = readExactDataRecord(source, ['schemaVersion', 'code', 'field']);
  if (record === null || record.schemaVersion !== 1 || !ERROR_CODES.has(record.code as never)) {
    return false;
  }
  const code = record.code as PlaywrightAuthorityProjectionErrorCode;
  const field = record.field;
  if (
    code === 'SOURCE_NOT_RECORD' ||
    code === 'SOURCE_INTROSPECTION_FAILED' ||
    code === 'KEY_SET_INVALID'
  ) {
    return field === null;
  }
  if (typeof field !== 'string' || !FIELD_SET.has(field)) {
    return false;
  }
  if (code === 'EXTENSION_ID_INVALID') {
    return field === 'extensionId';
  }
  if (code === 'SCOPE_URL_INVALID') {
    return field === 'scopeURL';
  }
  if (code === 'SCRIPT_URL_INVALID') {
    return field === 'scriptURL';
  }
  return true;
}

export function createNoOwnerReleaseReceiptV1(input: {
  readonly processGeneration: number;
  readonly playwrightEpoch: number;
  readonly rawReceiptSha256: string;
}): NoOwnerReleaseReceiptV1 {
  if (
    !Number.isSafeInteger(input.processGeneration) ||
    input.processGeneration < 1 ||
    !Number.isSafeInteger(input.playwrightEpoch) ||
    input.playwrightEpoch < 1 ||
    !SHA256.test(input.rawReceiptSha256)
  ) {
    throw new Error('No-owner release receipt identity is invalid.');
  }
  const preimage = Object.freeze({
    schemaVersion: 1 as const,
    processGeneration: input.processGeneration,
    playwrightEpoch: input.playwrightEpoch,
    rawReceiptSha256: input.rawReceiptSha256,
    ownerKind: 'none' as const,
    leaseReserved: false as const,
    transportOpened: false as const,
    authorityProjectionSha256: null,
  });
  return Object.freeze({ ...preimage, receiptSha256: sha256Jcs(preimage) });
}
