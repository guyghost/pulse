import { describe, expect, it } from 'vitest';

import {
  EVE_BASE_URL_ENV,
  EVE_FEATURE_FLAG_ENV,
  EVE_TIMEOUT_MS_ENV,
  readEveProviderConfig,
} from '../../src/lib/server/copilot/providers/eve-config';

describe('readEveProviderConfig', () => {
  it('keeps the Eve pilot disabled by default', () => {
    expect(readEveProviderConfig({})).toEqual({
      enabled: false,
      reason: 'FEATURE_DISABLED',
    });
  });

  it('requires both the exact flag and a base URL', () => {
    expect(
      readEveProviderConfig({
        [EVE_FEATURE_FLAG_ENV]: 'TRUE',
        [EVE_BASE_URL_ENV]: 'https://pulse.example',
      })
    ).toEqual({ enabled: false, reason: 'FEATURE_DISABLED' });

    expect(readEveProviderConfig({ [EVE_FEATURE_FLAG_ENV]: 'true' })).toEqual({
      enabled: false,
      reason: 'MISSING_BASE_URL',
    });
  });

  it('rejects credentials, query strings and insecure remote hosts', () => {
    for (const host of [
      'https://user:secret@pulse.example',
      'https://pulse.example?token=secret',
      'http://pulse.example',
    ]) {
      expect(
        readEveProviderConfig({
          [EVE_FEATURE_FLAG_ENV]: 'true',
          [EVE_BASE_URL_ENV]: host,
        }).enabled
      ).toBe(false);
    }
  });

  it('accepts HTTPS deployments and loopback HTTP development', () => {
    expect(
      readEveProviderConfig({
        [EVE_FEATURE_FLAG_ENV]: 'true',
        [EVE_BASE_URL_ENV]: 'https://pulse.example/',
      })
    ).toEqual({
      enabled: true,
      host: 'https://pulse.example',
      localDevelopment: false,
      timeoutMs: 60_000,
    });

    expect(
      readEveProviderConfig({
        [EVE_FEATURE_FLAG_ENV]: 'true',
        [EVE_BASE_URL_ENV]: 'http://127.0.0.1:5173',
      })
    ).toEqual({
      enabled: true,
      host: 'http://127.0.0.1:5173',
      localDevelopment: true,
      timeoutMs: 60_000,
    });
  });

  it('accepts only a bounded integer timeout', () => {
    for (const timeout of ['999', '120001', '1.5', 'not-a-number']) {
      expect(
        readEveProviderConfig({
          [EVE_FEATURE_FLAG_ENV]: 'true',
          [EVE_BASE_URL_ENV]: 'https://pulse.example',
          [EVE_TIMEOUT_MS_ENV]: timeout,
        })
      ).toEqual({ enabled: false, reason: 'INVALID_TIMEOUT' });
    }

    expect(
      readEveProviderConfig({
        [EVE_FEATURE_FLAG_ENV]: 'true',
        [EVE_BASE_URL_ENV]: 'https://pulse.example',
        [EVE_TIMEOUT_MS_ENV]: '30000',
      })
    ).toMatchObject({ enabled: true, timeoutMs: 30_000 });
  });
});
