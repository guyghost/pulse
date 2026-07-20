import { describe, expect, it, vi } from 'vitest';

import {
  PLAYWRIGHT_AUTHORITY_KEYS,
  parsePlaywrightAuthorityV1,
  projectPlaywrightAuthorityV1,
  type PlaywrightAuthorityField,
  type PlaywrightAuthorityProjectionErrorCode,
  type PlaywrightAuthorityProjectionResult,
} from '../../mv3/harness/playwright-authority';

const EXTENSION_ID = 'a'.repeat(32);
const AUTHORITY_INPUT = Object.freeze({
  extensionId: EXTENSION_ID,
  registrationId: 'registration-1',
  versionId: 'version-1',
  scopeURL: `chrome-extension://${EXTENSION_ID}/`,
  scriptURL: `chrome-extension://${EXTENSION_ID}/background/service-worker.js`,
  targetId: 'worker-target-1',
});
const RAW_AUTHORITY = Object.freeze({
  ...AUTHORITY_INPUT,
  sessionId: 'raw-session-1',
  attachmentGeneration: 1,
  attachmentOrigin: 'manual',
  uniqueContextId: 'raw-context-1',
});

function requireAccepted(result: PlaywrightAuthorityProjectionResult) {
  if (!result.ok) {
    throw new Error(`Expected accepted authority, received ${result.error.code}.`);
  }
  return result;
}

function expectRejected(
  source: unknown,
  code: PlaywrightAuthorityProjectionErrorCode,
  field: PlaywrightAuthorityField | null
): void {
  expect(parsePlaywrightAuthorityV1(source)).toEqual({
    ok: false,
    error: { schemaVersion: 1, code, field },
  });
}

describe('PlaywrightAuthorityV1 boundary', () => {
  it('parses, hashes and deeply freezes exactly the six enumerable data fields', () => {
    const parsed = requireAccepted(parsePlaywrightAuthorityV1(AUTHORITY_INPUT));

    expect(Reflect.ownKeys(parsed.authority)).toEqual(PLAYWRIGHT_AUTHORITY_KEYS);
    expect(parsed.authority).toEqual(AUTHORITY_INPUT);
    expect(Object.isFrozen(parsed.authority)).toBe(true);
    expect(parsed.authorityProjectionSha256).toMatch(/^[a-f0-9]{64}$/u);
  });

  it('projects the raw authority into a fresh six-field DTO and excludes revoked raw fields', () => {
    const projected = requireAccepted(projectPlaywrightAuthorityV1(RAW_AUTHORITY));
    const parsed = requireAccepted(parsePlaywrightAuthorityV1(AUTHORITY_INPUT));

    expect(projected.authority).not.toBe(RAW_AUTHORITY);
    expect(Reflect.ownKeys(projected.authority)).toEqual(PLAYWRIGHT_AUTHORITY_KEYS);
    expect(projected.authority).toEqual(AUTHORITY_INPUT);
    expect(projected.authorityProjectionSha256).toBe(parsed.authorityProjectionSha256);
    expect('sessionId' in projected.authority).toBe(false);
    expect('attachmentGeneration' in projected.authority).toBe(false);
    expect('attachmentOrigin' in projected.authority).toBe(false);
    expect('uniqueContextId' in projected.authority).toBe(false);
  });

  it.each([null, undefined, true, 12, 'authority', [], () => undefined])(
    'normalizes non-record input %p',
    (source) => {
      expectRejected(source, 'SOURCE_NOT_RECORD', null);
    }
  );

  it.each(PLAYWRIGHT_AUTHORITY_KEYS)('rejects a missing %s field', (field) => {
    const source = { ...AUTHORITY_INPUT } as Record<string, unknown>;
    delete source[field];
    expectRejected(source, 'KEY_SET_INVALID', null);
  });

  it('rejects extra string and symbol keys', () => {
    expectRejected({ ...AUTHORITY_INPUT, sessionId: 'raw-session-1' }, 'KEY_SET_INVALID', null);
    expectRejected(
      { ...AUTHORITY_INPUT, [Symbol('raw-capability')]: 'secret' },
      'KEY_SET_INVALID',
      null
    );
  });

  it('rejects accessors without reading them', () => {
    const getter = vi.fn(() => AUTHORITY_INPUT.targetId);
    const source = { ...AUTHORITY_INPUT };
    Object.defineProperty(source, 'targetId', { enumerable: true, get: getter });

    expectRejected(source, 'KEY_SET_INVALID', null);
    expect(getter).not.toHaveBeenCalled();
  });

  it('rejects non-enumerable fields', () => {
    const source = { ...AUTHORITY_INPUT };
    Object.defineProperty(source, 'targetId', {
      configurable: true,
      enumerable: false,
      value: AUTHORITY_INPUT.targetId,
    });
    expectRejected(source, 'KEY_SET_INVALID', null);
  });

  it.each(PLAYWRIGHT_AUTHORITY_KEYS)('reports non-string %s values without TypeError', (field) => {
    expectRejected({ ...AUTHORITY_INPUT, [field]: 1 }, 'FIELD_TYPE_INVALID', field);
  });

  it.each(PLAYWRIGHT_AUTHORITY_KEYS)('reports empty %s values', (field) => {
    expectRejected({ ...AUTHORITY_INPUT, [field]: '' }, 'FIELD_EMPTY', field);
  });

  it.each(PLAYWRIGHT_AUTHORITY_KEYS)('reports 4,097-byte %s values', (field) => {
    expectRejected(
      { ...AUTHORITY_INPUT, [field]: 'x'.repeat(4_097) },
      'FIELD_UTF8_LIMIT_EXCEEDED',
      field
    );
  });

  it.each(
    PLAYWRIGHT_AUTHORITY_KEYS.flatMap((field) =>
      ['\u0000', '\r', '\n'].map((control) => [field, control] as const)
    )
  )('reports control characters in %s', (field, control) => {
    expectRejected(
      { ...AUTHORITY_INPUT, [field]: `before${control}after` },
      'FIELD_CONTROL_CHARACTER',
      field
    );
  });

  it('reports canonical extension, scope and script relationship errors', () => {
    expectRejected(
      { ...AUTHORITY_INPUT, extensionId: 'z'.repeat(32) },
      'EXTENSION_ID_INVALID',
      'extensionId'
    );
    expectRejected(
      { ...AUTHORITY_INPUT, scopeURL: `${AUTHORITY_INPUT.scopeURL}nested/` },
      'SCOPE_URL_INVALID',
      'scopeURL'
    );
    expectRejected(
      { ...AUTHORITY_INPUT, scriptURL: 'https://example.test/service-worker.js' },
      'SCRIPT_URL_INVALID',
      'scriptURL'
    );
  });

  it.each([
    [
      'ownKeys',
      new Proxy(AUTHORITY_INPUT, {
        ownKeys() {
          throw new Error('hostile ownKeys');
        },
      }),
    ],
    [
      'descriptor',
      new Proxy(AUTHORITY_INPUT, {
        getOwnPropertyDescriptor() {
          throw new Error('hostile descriptor');
        },
      }),
    ],
    [
      'prototype',
      new Proxy(AUTHORITY_INPUT, {
        getPrototypeOf() {
          throw new Error('hostile prototype');
        },
      }),
    ],
  ])('normalizes a throwing %s trap', (_label, source) => {
    expectRejected(source, 'SOURCE_INTROSPECTION_FAILED', null);
  });

  it('normalizes a revoked Proxy and never exposes its native reflection error', () => {
    const revocable = Proxy.revocable({ ...AUTHORITY_INPUT }, {});
    revocable.revoke();

    expectRejected(revocable.proxy, 'SOURCE_INTROSPECTION_FAILED', null);
  });

  it('does not invoke property-read traps after validating own data descriptors', () => {
    const get = vi.fn(() => {
      throw new Error('hostile property read');
    });
    const source = new Proxy(AUTHORITY_INPUT, { get });

    expect(requireAccepted(parsePlaywrightAuthorityV1(source)).authority).toEqual(AUTHORITY_INPUT);
    expect(get).not.toHaveBeenCalled();
  });
});
